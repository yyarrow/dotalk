"use client";

import { useCallback, useRef, useState } from "react";
import { pcm16ToWavBlob } from "./wav";

interface DeepgramHandlers {
  // Fires once at end-of-turn with Deepgram's English transcript (used to drive
  // the interviewer reply) plus the turn's audio as WAV (sent to the audio
  // observer in parallel for accent + phrasing feedback).
  onTurn: (transcript: string, audio: Blob) => void;
  onInterimTranscript?: (transcript: string) => void;
  onError?: (error: unknown) => void;
}

interface TurnInfoMessage {
  type: string;
  event?: "StartOfTurn" | "Update" | "EagerEndOfTurn" | "TurnResumed" | "EndOfTurn";
  transcript?: string;
}

// Opens a WebSocket directly from the browser to Deepgram Flux (no
// Vercel function in the loop — this leg needs true duplex streaming,
// which serverless request/response can't provide). The short-lived
// token comes from /api/deepgram-token so the permanent key never
// reaches the browser. Handlers are passed to start() per call instead
// of at hook-construction time, so start/stop stay referentially stable
// no matter how often the caller's callbacks change.
export function useDeepgramLive() {
  const [isListening, setIsListening] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  // PCM frames for the current turn, copied off the stream we send to Deepgram,
  // so the same audio can be handed to the observer as WAV at end-of-turn.
  const turnChunksRef = useRef<ArrayBuffer[]>([]);

  const stop = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(
    async (handlers: DeepgramHandlers) => {
      try {
        const tokenRes = await fetch("/api/deepgram-token");
        if (!tokenRes.ok) throw new Error("Failed to fetch Deepgram token");
        const { access_token } = await tokenRes.json();

        // Deepgram Flux (/v2/listen) authenticates the browser WebSocket via
        // the "bearer" subprotocol keyword — "token" (the v1 style) returns
        // 401 here. Browsers can't set an Authorization header on a WS, so the
        // token rides in Sec-WebSocket-Protocol as ["bearer", <jwt>].
        const socket = new WebSocket(
          // eot_threshold 0.9 (up from the 0.7 default) makes Flux wait for
          // strong confidence before declaring end-of-turn, so a mid-thought
          // pause no longer cuts the speaker off. Max is 0.9; higher = more
          // patient at the cost of a little latency (negligible next to the
          // LLM). eot_timeout_ms still ends the turn after 5s of silence.
          "wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000&eot_threshold=0.9",
          ["bearer", access_token],
        );
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        socket.addEventListener("message", (event) => {
          let msg: TurnInfoMessage;
          try {
            msg = JSON.parse(event.data as string);
          } catch {
            return;
          }
          if (msg.type !== "TurnInfo" || !msg.transcript) return;
          if (msg.event === "EndOfTurn") {
            const audio = pcm16ToWavBlob(turnChunksRef.current, 16000);
            turnChunksRef.current = [];
            handlers.onTurn(msg.transcript, audio);
          } else {
            handlers.onInterimTranscript?.(msg.transcript);
          }
        });

        await new Promise<void>((resolve, reject) => {
          socket.addEventListener("open", () => resolve(), { once: true });
          socket.addEventListener(
            "error",
            () => reject(new Error("Deepgram socket error")),
            { once: true },
          );
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1 },
        });
        streamRef.current = stream;

        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;
        await audioContext.audioWorklet.addModule("/pcm-worklet.js");

        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "pcm-worklet");
        workletNodeRef.current = workletNode;

        turnChunksRef.current = [];
        workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          // Keep a copy for the WAV before the buffer is neutered by send().
          turnChunksRef.current.push(event.data.slice(0));
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        source.connect(workletNode);
        setIsListening(true);
      } catch (error) {
        stop();
        handlers.onError?.(error);
      }
    },
    [stop],
  );

  return { start, stop, isListening };
}

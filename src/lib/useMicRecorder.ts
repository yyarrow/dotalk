"use client";

import { useCallback, useRef, useState } from "react";
import { pcm16ToWavBlob } from "./wav";

// Push-to-talk mic capture for bilingual mode: no Deepgram, no turn detection —
// the user holds to speak (any language) and releases to end the turn. Records
// via the same PCM worklet as the STT path and returns a WAV blob for the
// audio observer to transcribe/understand.
export function useMicRecorder() {
  const [recording, setRecording] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);

  const start = useCallback(async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });
    streamRef.current = stream;
    const context = new AudioContext({ sampleRate: 16000 });
    contextRef.current = context;
    await context.audioWorklet.addModule("/pcm-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "pcm-worklet");
    nodeRef.current = node;
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      chunksRef.current.push(event.data);
    };
    source.connect(node);
    setRecording(true);
  }, []);

  const stop = useCallback(async (): Promise<Blob> => {
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await contextRef.current?.close();
    contextRef.current = null;
    setRecording(false);
    return pcm16ToWavBlob(chunksRef.current, 16000);
  }, []);

  return { start, stop, recording };
}

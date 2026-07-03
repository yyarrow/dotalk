export interface SynthesizeResult {
  body: ReadableStream<Uint8Array>;
  contentType: string;
}

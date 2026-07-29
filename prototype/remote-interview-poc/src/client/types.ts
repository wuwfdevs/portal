/** Messages the main thread sends to the OPFS worker. */
export type MainToWorkerMessage =
  | { type: "chunk"; trackId: string; sequence: number; buffer: ArrayBuffer }
  | { type: "resume"; trackId: string };

/** Messages the OPFS worker sends back to the main thread, for status logging. */
export type WorkerToMainMessage =
  | { type: "ack"; trackId: string; sequence: number }
  | { type: "error"; trackId: string; sequence: number | null; message: string }
  | { type: "resume-found"; trackId: string; count: number };

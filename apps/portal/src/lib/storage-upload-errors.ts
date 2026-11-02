import { formatBytes } from "@/lib/format";

/**
 * What to tell someone whose upload Storage refused. The refusal that matters
 * most is size: Storage answers "The object exceeded the maximum allowed size",
 * which is true and tells a reporter nothing — not whose limit it is, not how
 * big their file was, not what to do. That limit is the project-wide Storage
 * setting (a bucket can only be stricter), so it is an administrator's to raise,
 * and retrying the same file can never work.
 */
export function describeUploadRefusal(input: {
  status: number;
  /** The `message` or `error` Storage returned, if it returned JSON. */
  apiMessage?: string | null;
  fileSizeBytes: number;
}): { message: string; retryable: boolean } {
  const { status, apiMessage, fileSizeBytes } = input;
  if (status === 413 || /exceeded the maximum allowed size/i.test(apiMessage ?? "")) {
    return {
      message: `This file is ${formatBytes(fileSizeBytes)}, which is over the upload limit. Upload a smaller or compressed copy, or ask an administrator to raise the limit.`,
      retryable: false,
    };
  }
  return {
    message: apiMessage ?? `The upload was refused (HTTP ${status}).`,
    retryable: status >= 500 || status === 429,
  };
}

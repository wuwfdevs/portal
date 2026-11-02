import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export interface VerifyReport {
  durationMs: number;
  sampleRate: number;
  channels: number;
  codecName: string;
  meanVolumeDb: number | null;
}

interface FfprobeStream {
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  channels?: number;
}

interface FfprobeOutput {
  format: { duration: string };
  streams: FfprobeStream[];
}

function run(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${binary} exited ${code}: ${stderr}`));
    });
  });
}

/**
 * Machine-readable verification via ffprobe (JSON) rather than parsing
 * ffmpeg -i's locale-sensitive human-oriented stderr text. Also runs
 * ffmpeg's volumedetect filter, which is what catches the failure class
 * where the header/duration/sample-rate all check out but the audio itself
 * is silent or corrupted.
 */
export async function verifyWav(filePath: string): Promise<VerifyReport> {
  const probeBinary = ffprobeStatic.path;
  const { stdout } = await run(probeBinary, [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-print_format",
    "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const audioStream = parsed.streams.find((s) => s.codec_type === "audio");
  if (!audioStream) throw new Error(`verifyWav(${filePath}): no audio stream found`);

  if (!ffmpegPath) throw new Error("ffmpeg binary is not available in this environment");
  const { stderr } = await run(ffmpegPath, [
    "-hide_banner",
    "-i",
    filePath,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const meanMatch = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(stderr);

  return {
    durationMs: Math.round(Number(parsed.format.duration) * 1000),
    sampleRate: Number(audioStream.sample_rate ?? 0),
    channels: audioStream.channels ?? 0,
    codecName: audioStream.codec_name,
    meanVolumeDb: meanMatch ? Number(meanMatch[1]) : null,
  };
}

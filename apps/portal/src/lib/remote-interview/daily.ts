import "server-only";

// Thin server-side interface to Daily's REST API — room and meeting-token
// management only. See docs/remote-interview-design.md §6 ("Build the call
// layer behind a thin interface") and the technical assessment's "Why Daily
// over LiveKit" for why Daily was picked and why that seam matters anyway.
//
// Recording start/stop is deliberately NOT here: it goes through the Daily
// client SDK's callObject.startRecording()/stopRecording() from the studio
// (see studio-client.tsx), not a server-side REST call. Two reasons: the
// SDK method is the best-documented, most stable part of Daily's surface,
// whereas the exact REST recording-control endpoints are the part of this
// integration this repo could least verify — docs.daily.co returns 403 to
// automated fetches (confirmed again while building this slice, matching
// the technical assessment's note about Daily/LiveKit pricing pages), and
// there is no Daily account or API key in this environment to test against
// (it's new infrastructure per the design doc). Room creation and meeting
// tokens are used here with reasonable confidence; verify this file against
// a live Daily account before relying on it in production.

const DAILY_API_BASE = "https://api.daily.co/v1";

function apiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("DAILY_API_KEY is not configured.");
  return key;
}

/** Whether raw-tracks cloud backup can be requested at all — see .env.example. */
export function isCloudBackupConfigured(): boolean {
  return Boolean(
    process.env.DAILY_RECORDINGS_BUCKET_NAME &&
    process.env.DAILY_RECORDINGS_BUCKET_REGION &&
    process.env.DAILY_RECORDINGS_ASSUME_ROLE_ARN,
  );
}

export interface DailyRoom {
  name: string;
  url: string;
}

/** Daily room names must be url-safe; a session's uuid already is. */
function roomNameForSession(sessionId: string): string {
  return `ri-${sessionId}`;
}

async function getRoom(name: string): Promise<DailyRoom | null> {
  const res = await fetch(`${DAILY_API_BASE}/rooms/${name}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Daily: GET /rooms/${name} failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  const data = (await res.json()) as { name: string; url: string };
  return { name: data.name, url: data.url };
}

/**
 * Gets or creates this session's Daily room. Idempotent: safe to call every
 * time someone opens the studio. Video is off by default — the call carries
 * audio only in v1 (design doc §6: recorded video is deferred, and "must
 * never be allowed to compromise audio reliability"). enable_recording is
 * set to raw-tracks only when a destination bucket is configured; otherwise
 * the room is created without it and the studio simply doesn't offer cloud
 * backup, rather than failing when recording is started (see
 * isCloudBackupConfigured()).
 */
export async function ensureRoom(sessionId: string): Promise<DailyRoom> {
  const name = roomNameForSession(sessionId);
  const existing = await getRoom(name);
  if (existing) return existing;

  const properties: Record<string, unknown> = {
    start_video_off: true,
    start_audio_off: false,
    enable_prejoin_ui: false,
  };
  if (isCloudBackupConfigured()) {
    properties.enable_recording = "raw-tracks";
    properties.recordings_bucket = {
      bucket_name: process.env.DAILY_RECORDINGS_BUCKET_NAME,
      bucket_region: process.env.DAILY_RECORDINGS_BUCKET_REGION,
      assume_role_arn: process.env.DAILY_RECORDINGS_ASSUME_ROLE_ARN,
      allow_api_access: true,
    };
  }

  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, privacy: "private", properties }),
  });
  if (!res.ok) {
    throw new Error(
      `Daily: POST /rooms failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  const data = (await res.json()) as { name: string; url: string };
  return { name: data.name, url: data.url };
}

export interface MeetingTokenParams {
  roomName: string;
  userName: string;
  /** Owner tokens can start/stop recording and admit-adjacent controls; only the host gets one. */
  isOwner: boolean;
  /** Our own ri_participants.id, carried through so Daily participant objects map back to it. */
  participantId: string;
  expiresInSeconds?: number;
}

/** A short-lived per-participant token for joining this session's Daily room. */
export async function createMeetingToken(params: MeetingTokenParams): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (params.expiresInSeconds ?? 60 * 60 * 6);
  const res = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: {
        room_name: params.roomName,
        user_name: params.userName,
        user_id: params.participantId,
        is_owner: params.isOwner,
        exp,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Daily: POST /meeting-tokens failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

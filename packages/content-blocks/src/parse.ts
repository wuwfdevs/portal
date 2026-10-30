import {
  CONTENT_SCHEMA_VERSION,
  type AudioExcerptBlock,
  type ContentBlock,
  type ContentDocument,
  type MediaReference,
  type Placement,
  type Provenance,
  type TextStyle,
} from "./types";

export const LIMITS = {
  title: 300,
  dek: 600,
  text: 20_000,
  transcript: 5_000,
  caption: 500,
  name: 200,
  blocks: 400,
  media: 100,
  ids: 500,
  excerptMinMs: 500,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_STYLES: readonly TextStyle[] = ["paragraph", "heading", "subheading", "quote"];

export type ParseResult =
  | { ok: true; value: ContentDocument }
  | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function str(raw: Rec, key: string, path: string, max: number, errors: string[], opts: { required?: boolean; allowEmpty?: boolean } = {}): string | undefined {
  const v = raw[key];
  if (v === undefined) {
    if (opts.required) errors.push(`${path}.${key} is required`);
    return undefined;
  }
  if (typeof v !== "string") {
    errors.push(`${path}.${key} must be a string`);
    return undefined;
  }
  if (!opts.allowEmpty && v.trim() === "") {
    errors.push(`${path}.${key} must not be empty`);
    return undefined;
  }
  if (v.length > max) {
    errors.push(`${path}.${key} is longer than ${max} characters`);
    return undefined;
  }
  return v;
}

function parseMedia(value: unknown, errors: string[]): MediaReference[] {
  if (!Array.isArray(value)) {
    errors.push("media must be an array");
    return [];
  }
  if (value.length > LIMITS.media) errors.push(`media has more than ${LIMITS.media} entries`);
  const out: MediaReference[] = [];
  const seen = new Set<string>();
  value.slice(0, LIMITS.media).forEach((item, i) => {
    const path = `media[${i}]`;
    if (!isRec(item)) return void errors.push(`${path} must be an object`);
    const id = str(item, "id", path, 200, errors, { required: true });
    const mimeType = str(item, "mimeType", path, 100, errors, { required: true });
    if (id !== undefined) {
      if (seen.has(id)) errors.push(`${path}.id repeats an earlier media id`);
      seen.add(id);
    }
    if (mimeType !== undefined && !/^[a-z]+\/[a-z0-9.+-]+$/i.test(mimeType)) errors.push(`${path}.mimeType is not a media type`);
    const ref: MediaReference = { id: id ?? "", mimeType: mimeType ?? "" };
    if (item.durationMs !== undefined) {
      if (!isInt(item.durationMs)) errors.push(`${path}.durationMs must be a non-negative integer`);
      else ref.durationMs = item.durationMs;
    }
    if (item.sha256 !== undefined) {
      if (typeof item.sha256 !== "string" || !SHA256.test(item.sha256)) errors.push(`${path}.sha256 must be 64 lowercase hex characters`);
      else ref.sha256 = item.sha256;
    }
    out.push(ref);
  });
  return out;
}

function parseBlocks(value: unknown, mediaIds: Set<string>, errors: string[]): ContentBlock[] {
  if (!Array.isArray(value)) {
    errors.push("blocks must be an array");
    return [];
  }
  if (value.length > LIMITS.blocks) errors.push(`blocks has more than ${LIMITS.blocks} entries`);
  const out: ContentBlock[] = [];
  const seen = new Set<string>();
  value.slice(0, LIMITS.blocks).forEach((item, i) => {
    const path = `blocks[${i}]`;
    if (!isRec(item)) return void errors.push(`${path} must be an object`);
    const id = item.id;
    if (typeof id !== "string" || !UUID.test(id)) errors.push(`${path}.id must be a UUID`);
    else if (seen.has(id)) errors.push(`${path}.id repeats an earlier block id`);
    else seen.add(id);
    const blockId = typeof id === "string" ? id : "";
    switch (item.type) {
      case "text": {
        const text = str(item, "text", path, LIMITS.text, errors, { required: true });
        const style = item.style;
        if (typeof style !== "string" || !(TEXT_STYLES as readonly string[]).includes(style)) errors.push(`${path}.style must be one of ${TEXT_STYLES.join(", ")}`);
        const attribution = str(item, "attribution", path, LIMITS.name, errors);
        if (text !== undefined && typeof style === "string")
          out.push({ id: blockId, type: "text", style: style as TextStyle, text, ...(attribution !== undefined ? { attribution } : {}) });
        break;
      }
      case "narration": {
        const text = str(item, "text", path, LIMITS.text, errors, { required: true });
        if (item.role !== undefined && item.role !== "anchor") errors.push(`${path}.role must be "anchor" when present`);
        if (text !== undefined) out.push({ id: blockId, type: "narration", text, ...(item.role === "anchor" ? { role: "anchor" as const } : {}) });
        break;
      }
      case "editor_note": {
        const text = str(item, "text", path, LIMITS.text, errors, { required: true });
        if (text !== undefined) out.push({ id: blockId, type: "editor_note", text });
        break;
      }
      case "audio_excerpt": {
        const mediaId = str(item, "mediaId", path, 200, errors, { required: true });
        if (mediaId !== undefined && !mediaIds.has(mediaId)) errors.push(`${path}.mediaId "${mediaId}" is not in media`);
        const transcript = str(item, "transcript", path, LIMITS.transcript, errors, { required: true });
        const caption = str(item, "caption", path, LIMITS.caption, errors);
        let speaker: AudioExcerptBlock["speaker"] | undefined;
        if (!isRec(item.speaker)) errors.push(`${path}.speaker is required`);
        else {
          const name = str(item.speaker, "name", `${path}.speaker`, LIMITS.name, errors, { required: true });
          const description = str(item.speaker, "description", `${path}.speaker`, LIMITS.name, errors);
          if (name !== undefined) speaker = { name, ...(description !== undefined ? { description } : {}) };
        }
        let source: AudioExcerptBlock["source"] | undefined;
        if (!isRec(item.source)) errors.push(`${path}.source is required`);
        else {
          const title = str(item.source, "title", `${path}.source`, LIMITS.title, errors, { required: true });
          let recordedOn: string | undefined;
          if (item.source.recordedOn !== undefined) {
            if (typeof item.source.recordedOn !== "string" || !validDate(item.source.recordedOn)) errors.push(`${path}.source.recordedOn must be a real YYYY-MM-DD date`);
            else recordedOn = item.source.recordedOn;
          }
          if (title !== undefined) source = { title, ...(recordedOn !== undefined ? { recordedOn } : {}) };
        }
        let timingOk = false;
        if (!isInt(item.startMs) || !isInt(item.endMs)) errors.push(`${path}.startMs and endMs must be non-negative integers`);
        else if (item.endMs - item.startMs < LIMITS.excerptMinMs) errors.push(`${path} must be at least ${LIMITS.excerptMinMs} ms long`);
        else timingOk = true;
        if (mediaId !== undefined && transcript !== undefined && speaker && source && timingOk)
          out.push({
            id: blockId, type: "audio_excerpt", mediaId, transcript, speaker, source,
            startMs: item.startMs as number, endMs: item.endMs as number,
            ...(caption !== undefined ? { caption } : {}),
          });
        break;
      }
      default:
        errors.push(`${path}.type "${String(item.type)}" is not a known block type`);
    }
  });
  return out;
}

function ids(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  if (value.length > LIMITS.ids) errors.push(`${path} has more than ${LIMITS.ids} entries`);
  const out: string[] = [];
  value.slice(0, LIMITS.ids).forEach((v, i) => {
    if (typeof v !== "string" || !UUID.test(v)) errors.push(`${path}[${i}] must be a UUID`);
    else out.push(v);
  });
  return out;
}

function parseProvenance(value: unknown, errors: string[]): Provenance | undefined {
  if (!isRec(value)) {
    errors.push("provenance is required");
    return undefined;
  }
  if (value.system !== "portal") errors.push('provenance.system must be "portal"');
  for (const key of ["projectId", "pieceId", "sentBy"] as const) {
    if (typeof value[key] !== "string" || !UUID.test(value[key] as string)) errors.push(`provenance.${key} must be a UUID`);
  }
  if (!isInt(value.version) || value.version < 1) errors.push("provenance.version must be a positive integer");
  const excerptIds = ids(value.excerptIds, "provenance.excerptIds", errors);
  const findingIds = ids(value.findingIds, "provenance.findingIds", errors);
  if (typeof value.sentAt !== "string" || Number.isNaN(Date.parse(value.sentAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(value.sentAt)) errors.push("provenance.sentAt must be an ISO 8601 timestamp");
  return {
    system: "portal",
    projectId: String(value.projectId),
    pieceId: String(value.pieceId),
    version: value.version as number,
    excerptIds,
    findingIds,
    sentBy: String(value.sentBy),
    sentAt: String(value.sentAt),
  };
}

function parsePlacement(value: unknown, errors: string[]): Placement | undefined {
  if (value === undefined) return undefined;
  if (!isRec(value)) {
    errors.push("placement must be an object");
    return undefined;
  }
  const out: Placement = {};
  for (const key of ["publishingIdentity", "fellowship", "series"] as const) {
    const v = value[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || !SLUG.test(v)) errors.push(`placement.${key} must be a slug`);
    else out[key] = v;
  }
  return out;
}

/** Reads a document from untrusted JSON. Anything that is not exactly the schema is refused, with every reason listed. */
export function parseContentDocument(value: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRec(value)) return { ok: false, errors: ["document must be an object"] };
  if (value.schemaVersion !== CONTENT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${CONTENT_SCHEMA_VERSION}`);
  const title = str(value, "title", "document", LIMITS.title, errors, { required: true });
  const dek = str(value, "dek", "document", LIMITS.dek, errors);
  const media = parseMedia(value.media, errors);
  const blocks = parseBlocks(value.blocks, new Set(media.map((m) => m.id)), errors);
  const provenance = parseProvenance(value.provenance, errors);
  const placement = parsePlacement(value.placement, errors);
  if (errors.length > 0 || title === undefined || provenance === undefined) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      title,
      ...(dek !== undefined ? { dek } : {}),
      blocks,
      media,
      provenance,
      ...(placement !== undefined ? { placement } : {}),
    },
  };
}

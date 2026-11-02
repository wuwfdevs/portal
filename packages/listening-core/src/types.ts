// The vocabulary the listening rules share. These mirror the Portal's Audience Listening enums
// (apps/portal/src/lib/database.types.ts, "Al*") by value, but are declared here so this package
// has no dependency on either app's database types. The site's Payload collections use the same
// literal values, so a state computed in one app means the same thing in the other.

export type AlQueryStatus = "draft" | "open" | "closed" | "archived";
export type AlFieldMode = "hidden" | "optional" | "required";
export type AlTranscriptionMode = "automatic" | "manual";
export type AlSubmissionStatus = "in_progress" | "submitted";
export type AlReviewState = "new" | "reviewed" | "flagged" | "rejected";
export type AlAnswerStatus = "pending" | "uploaded" | "failed";
export type AlTranscriptionState = "none" | "queued" | "sent" | "failed";
/** Whether the public route may accept a submission right now. */
export type AlPublicState = "open" | "not_yet_open" | "closed";

/** The visual intent of a status badge. Each app maps it onto its own Badge component. */
export type BadgeVariant = "accent" | "neutral" | "muted" | "danger" | "success" | "warning";

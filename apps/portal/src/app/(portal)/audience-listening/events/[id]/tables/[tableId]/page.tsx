import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAudienceListeningContext } from "@/lib/audience-listening/access";
import { getEvent, listTables } from "@/lib/audience-listening/campaign-queries";
import {
  getConversationForTable,
  getStaffTranscript,
  listContactCards,
  listHighlights,
  listSegments,
  listSpeakers,
} from "@/lib/audience-listening/conversation-queries";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { TABLE_STATE_LABEL } from "@/lib/audience-listening/events";
import { canSendToSourcework, cardNeedsContactWarning, CONVERSATION_STATUS_LABEL, describeGap, findGaps, formatMs } from "@/lib/audience-listening/conversations";
import { sourcePath } from "@/lib/transcription/links";
import { formatClockMs } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { approveCardName, deleteContactCard, makeExcerptsFromMarks, markCardContacted, sendConversation } from "../../../../conversation-actions";
import { AttachRecording } from "./attach-recording";
import { AFTER_LINK_STATUS_TEXT, afterLinkStatus } from "@/lib/audience-listening/after-link";
import { FacilitatorLink } from "./facilitator-link";

// Joining the segments and copying the recording into Sourcework takes a while for a long table. Raised here, on the page that posts
// to the action, and not in the "use server" file: a bare export there broke the server-action build once (see CLAUDE.md, Sourcework 3b).
export const maxDuration = 300;

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tableId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAudienceListeningContext();
  const { id: eventId, tableId } = await params;
  const { error, notice } = await searchParams;

  const [event, tables] = await Promise.all([getEvent(eventId), listTables(eventId)]);
  const table = tables.find((t) => t.id === tableId);
  if (!event || !table) notFound();

  const conversation = await getConversationForTable(tableId);
  const [segments, speakers, highlights, cards, transcript] = conversation
    ? await Promise.all([
        listSegments(conversation.id),
        listSpeakers(conversation.id),
        listHighlights(conversation.id),
        listContactCards(conversation.id),
        getStaffTranscript(conversation.sourcework_source_id),
      ])
    : [[], [], [], [], await getStaffTranscript(null)];

  const speakerByLabel = new Map(speakers.map((s) => [s.source_label, s]));
  const highlightByStart = new Map(highlights.map((h) => [h.start_ms, h]));
  const voiceName = (voice: string | null) => {
    if (!voice) return null;
    const named = speakerByLabel.get(voice);
    return named ? (named.name ?? named.label) : `Speaker ${voice}`;
  };
  const uploaded = segments.filter((s) => s.status === "uploaded").length;
  const gaps = findGaps(segments.filter((s) => s.status === "uploaded"));
  const backHref = `/audience-listening/events/${eventId}`;
  const linkStatus = afterLinkStatus(table, conversation);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={{ href: backHref, label: `Back to ${event.title}` }}
        title={`Table ${table.number}`}
        badge={<Badge variant="muted">{conversation ? CONVERSATION_STATUS_LABEL[conversation.status] : TABLE_STATE_LABEL[table.state]}</Badge>}
        description={`${event.title} · ${formatEventTime(event.starts_at)}`}
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      {notice?.startsWith("excerpts-") && (
        <Alert variant="note" className="mb-4">
          {Number(notice.slice("excerpts-".length)) > 0
            ? `${Number(notice.slice("excerpts-".length))} excerpt${Number(notice.slice("excerpts-".length)) === 1 ? "" : "s"} made in Sourcework.`
            : "Nothing to make: every marked line already has an excerpt, or the transcript is not ready."}
        </Alert>
      )}
      {notice === "sent" && (
        <Alert variant="note" className="mb-4">
          Sent to Sourcework. Transcription takes a few minutes; this page shows the transcript when it is ready.
        </Alert>
      )}

      <div className="flex max-w-3xl flex-col gap-6">
        <Card className="p-5">
          <SectionHeading className="mb-3">Agreement and recording</SectionHeading>
          <DescriptionList
            items={[
              { label: "The table agreed", value: table.agreed_at ? formatEventTime(table.agreed_at) : "Not yet" },
              { label: "Wording read", value: table.consent_text_version ? `Version ${table.consent_text_version}` : null },
              { label: "Facilitator", value: table.facilitator_first_name },
              { label: "Recorded", value: conversation ? formatClockMs(conversation.duration_ms) : "Nothing yet" },
              { label: "Segments uploaded", value: conversation ? `${uploaded} of ${segments.length}` : null },
            ]}
          />
          {gaps.length > 0 && (
            <Alert variant="warning" className="mt-3">
              The phone recorded nothing for {gaps.map((g) => `${describeGap(g.seconds)} before segment ${g.beforeSeq + 1}`).join(", and for ")}. It may have been a pause the table
              chose, or the phone locked or the microphone dropped. Listen there before relying on that stretch.
            </Alert>
          )}
          <div className="mt-4">
            {!conversation && <p className="text-sm text-ink-500">Nothing has been recorded at this table.</p>}
            {table.agreed_at && (!conversation || (!conversation.sourcework_source_id && segments.every((s) => s.status !== "uploaded"))) && (
              <div className="mb-4 border-b border-line pb-4">
                <p className="mb-2 text-sm font-semibold text-ink-900">Recorded on a separate recorder?</p>
                <p className="mb-3 text-xs text-ink-400">
                  Attach the file here and this table reads like any other. It is allowed because the table agreed to be recorded. One file, up to 50 MB;
                  export long recordings as a mono MP3 at 64 kbps. It cannot be replaced once attached.
                </p>
                <AttachRecording tableId={tableId} />
              </div>
            )}
            {conversation?.sourcework_source_id ? (
              <Link className="text-sm font-semibold text-brand-link underline" href={sourcePath(conversation.sourcework_source_id, { projectId: conversation.transcription_project_id })}>
                Open in Sourcework
              </Link>
            ) : (
              conversation && (
                <form action={sendConversation} className="flex flex-col gap-2">
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="table_id" value={tableId} />
                  <input type="hidden" name="conversation_id" value={conversation.id} />
                  <Button type="submit" disabled={!canSendToSourcework(conversation)}>
                    Send to Sourcework
                  </Button>
                  <p className="text-xs text-ink-400">
                    {canSendToSourcework(conversation)
                      ? "Joins the segments into one recording and starts the transcript. The segments themselves are kept."
                      : "Available once the table has ended and every segment has uploaded."}
                  </p>
                </form>
              )
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-3">The facilitator</SectionHeading>
          <DescriptionList
            items={[
              { label: "First name", value: table.facilitator_first_name },
              { label: "Email", value: table.facilitator_email },
              { label: "Link sent", value: table.after_link_sent_at ? formatEventTime(table.after_link_sent_at) : "Not yet" },
              { label: "Link works until", value: table.after_token_expires_at ? formatEventTime(table.after_token_expires_at) : null },
            ]}
          />
          <p className="mt-3 text-sm text-ink-500">
            The link opens one page: names for the voices, the lines that mattered, and sending the conversation to the station. It works for
            fourteen days. {AFTER_LINK_STATUS_TEXT[linkStatus]}
          </p>
          <div className="mt-3">
            <FacilitatorLink
              eventId={eventId}
              tableId={tableId}
              disabled={linkStatus === "no_email" || linkStatus === "no_conversation" || linkStatus === "conversation_sent"}
              sendLabel={linkStatus === "sent" ? "Email a new link" : "Email the link to the facilitator"}
            />
          </div>
        </Card>

        {conversation && (
          <Card className="p-5">
            <SectionHeading className="mb-3">Transcript</SectionHeading>
            {transcript.unreadable && (
              <p className="text-sm text-ink-500">The transcript could not be read. It lives in Sourcework, so you need access to that tool to see it here.</p>
            )}
            {!transcript.unreadable && transcript.state === "none" && <p className="text-sm text-ink-500">Not sent to Sourcework yet.</p>}
            {transcript.state === "processing" && <p className="text-sm text-ink-500">Transcribing. Reload in a few minutes.</p>}
            {transcript.state === "failed" && (
              <Alert>Transcription failed. Open the recording in Sourcework to retry it.</Alert>
            )}
            {transcript.state === "ready" && (
              <>
                <p className="mb-3 text-xs text-ink-400">
                  {speakers.length > 0
                    ? `${speakers.filter((s) => s.name).length} of ${speakers.length} voices named. ${highlights.length} line${highlights.length === 1 ? "" : "s"} marked.`
                    : "The facilitator has not opened the after-page yet, so the voices are not named."}
                </p>
                {conversation && highlights.some((h) => h.excerpt_id === null) && (
                  <form action={makeExcerptsFromMarks} className="mb-3 flex flex-col gap-1">
                    <input type="hidden" name="event_id" value={eventId} />
                    <input type="hidden" name="table_id" value={tableId} />
                    <input type="hidden" name="conversation_id" value={conversation.id} />
                    <div>
                      <Button type="submit" variant="secondary">
                        Make excerpts from the marked lines
                      </Button>
                    </div>
                    <p className="text-xs text-ink-400">
                      Each marked line becomes a Sourcework excerpt, once. It also happens on its own within the hour once the transcript is ready.
                    </p>
                  </form>
                )}
                <ol className="flex flex-col gap-2">
                  {transcript.lines.map((line) => {
                    const mark = highlightByStart.get(line.startMs);
                    return (
                      <li key={line.startMs} className={mark ? "rounded border border-line bg-panel-100 p-2" : "p-2"}>
                        <p className="text-xs text-ink-400">
                          {formatMs(line.startMs)}
                          {voiceName(line.voice) ? ` · ${voiceName(line.voice)}` : ""}
                          {mark ? (
                            <>
                              {" "}
                              <Badge variant="accent">Marked{mark.tag ? `: ${mark.tag}` : ""}</Badge>
                            </>
                          ) : null}
                        </p>
                        <p className="text-sm text-ink-900">{line.text}</p>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </Card>
        )}

        {conversation && (
          <Card className="p-5">
            <SectionHeading className="mb-1">Contact cards</SectionHeading>
            <p className="mb-4 text-sm text-ink-500">
              The only place a card&apos;s contents are shown. The facilitator sees how many were left, never what they say. Contact the person before
              using their name; the Portal will not approve a name until you have.
            </p>
            {cards.length === 0 ? (
              <p className="text-sm text-ink-500">No one left a card.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {cards.map((card) => (
                  <li key={card.id} className="flex flex-col gap-2 py-3">
                    <p className="text-sm font-semibold text-ink-900">{card.first_name}</p>
                    <p className="text-sm text-ink-700">
                      {card.contact ? (
                        card.contact.includes("@") ? (
                          <a className="break-all text-brand-hover underline" href={`mailto:${card.contact}`}>
                            {card.contact}
                          </a>
                        ) : (
                          card.contact
                        )
                      ) : (
                        <span className="text-ink-400">No way to reach them was left.</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={card.may_contact ? "success" : "muted"}>{card.may_contact ? "May be contacted" : "Do not contact"}</Badge>
                      {card.may_name && <Badge variant="success">May be named</Badge>}
                      {card.keep_anonymous && <Badge variant="warning">Keep anonymous</Badge>}
                      {!card.may_name && !card.keep_anonymous && <Badge variant="muted">Not asked to be named or kept anonymous</Badge>}
                      {card.contacted_at && <Badge variant="neutral">Contacted {formatEventTime(card.contacted_at)}</Badge>}
                      {card.name_approved_at && <Badge variant="success">Name approved</Badge>}
                    </div>
                    {cardNeedsContactWarning(card) && (
                      <p className="text-xs text-danger-fg">They said you may contact them but left no way to reach them.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      {card.may_contact && !card.contacted_at && (
                        <form action={markCardContacted}>
                          <input type="hidden" name="event_id" value={eventId} />
                          <input type="hidden" name="table_id" value={tableId} />
                          <input type="hidden" name="card_id" value={card.id} />
                          <Button type="submit" variant="secondary">
                            Mark as contacted
                          </Button>
                        </form>
                      )}
                      {card.may_name && !card.name_approved_at && (
                        <form action={approveCardName}>
                          <input type="hidden" name="event_id" value={eventId} />
                          <input type="hidden" name="table_id" value={tableId} />
                          <input type="hidden" name="card_id" value={card.id} />
                          <Button type="submit" variant="secondary" disabled={!card.contacted_at}>
                            Approve use of their name
                          </Button>
                          {!card.contacted_at && <p className="mt-1 text-xs text-ink-400">Contact them first.</p>}
                        </form>
                      )}
                      <form action={deleteContactCard}>
                        <input type="hidden" name="event_id" value={eventId} />
                        <input type="hidden" name="table_id" value={tableId} />
                        <input type="hidden" name="card_id" value={card.id} />
                        <ConfirmSubmit label="Delete" confirmLabel="Yes, delete it" message="This removes the card and everything on it for good." />
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

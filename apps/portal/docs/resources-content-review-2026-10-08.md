# Resources content review — October 8, 2026

## Scope and method

Reviewed the live production Resources inventory for seven enabled tools: Bookings, Underwriting & Traffic, On Air, Sourcework, Editorial Planning, Audience Listening and Roadmap. Academic Partnerships and Editorial Inquiry were excluded at the station's direction.

Evidence includes the existing detailed guide corpus, tool/screen associations, the implemented route registry, selected application screens and domain logic, the existing station-procedure inventory, and production publication records. Changes were applied to preview and production and recorded as migrations on `claude/main`.

This was a **documentation reconciliation and source-code cross-check**, **not** a signed-in, all-role end-to-end acceptance test. Do not treat a guide association or a database link as proof that every button and permission behaves as described.

## Results

| Tool | Published guides, including overview | Reconciliation |
|---|---:|---|
| Bookings | 12 | Preserve eleven detailed guides; expand overview around pricing, capacity, handoffs and actual cost; correct request scope to include external partners |
| Underwriting & Traffic | 13 | Retain specialized contract/copy/placement/exception/affidavit guides; distinguish the older combined guide as an overview and associate it with both screens; link the card-payment SOP separately |
| On Air | 11 | Distinguish daily hosting, scheduling, unattended-hours rules, DAD release and broadcast-system recovery; cross-reference the relevant engineering SOP |
| Sourcework | 6 | Explain original source versus transcript/excerpt, and search versus verification; keep specific usage instructions in existing guides |
| Editorial Planning | 4 | Clarify civic value, rubric judgment and assignment handoffs; distinguish incoming-news-lead management from the pitch process |
| Audience Listening | 4 | Keep consent and attribution distinct; distinguish open-response listening from representative measurement; preserve staff-edited query documentation |
| Roadmap | 2 | Distinguish request, triage and delivery; preserve the existing curator guide for current controls |

**Production checks:** 52 in-scope guides; all have screen associations and at least one contextual hyperlink; zero outstanding `needs_review` flags; all have ProseMirror document roots. The two previously flagged staff-edited guides remain editor-owned and retain their history.

## Editing decisions

1. Existing detailed guides remain authoritative for button-level instructions. The seven overview guides explain the overall workflow, decisions and handoffs **without reprinting their steps**.
2. Links belong on the screen or procedure name in the sentence where it is used. There are no standalone “Direct screen links” appendices.
3. Dynamic entity screens are reached through their lists, rather than inventing a record ID in a link.
4. Distinct processes must stay distinct: quoted amount versus actual cost; capacity versus price; scheduled versus aired credit; approved copy versus recorded DAD cut; DAD export versus DAD import versus confirmed broadcast; audience submission versus verified claim; and a roadmap request versus a delivery commitment.
5. Staff-authored editorial content is preserved. Changes to those articles add contextual links or reconcile identified review flags without overwriting their substantive instructions.
6. The relevant station procedures are referenced where the workflow intersects them: underwriter card payment, newsroom news-lead management, and broadcast-system restart. Other financial and engineering SOPs are not copied into these tool guides.

## Material corrections

- **Bookings — Requests and estimates:** replaced wording implying all requests were for university work; the tool also covers external partners.
- **Traffic — Exceptions, makegoods and affidavits:** the older combined guide had no screen association and overlapped two more specific guides. It is now explicitly labeled as an overview, linked to the current specialist guides, and associated with the exception and affidavit screens.
- **Overview guides:** replaced both the initial unreviewed duplicates and their subsequent bare indexes with economical orientation guides; retained direct contextual screen links.
- **Detailed guides:** added targeted inline links while preserving operational paragraphs; did not attach an unrelated link directory at the end of each guide.

## Limits and further acceptance checks

The database checks establish that articles exist, are structurally valid and contain links, **not** that all authenticated interfaces have been exercised. Before treating documentation as a full operational SOP validation, use role-specific signed-in walkthroughs covering:

- Bookings: production lead, Operations, Finance and Executive Director approvals; agreements, holds, reserve exhaustion and posted settlement.
- Traffic/On Air: line-specific and weighted rotation, broadcast events, approved makegoods, DAD release/import and actual playout evidence.
- Sourcework and Audience Listening: transcription accuracy, permissions, consent/anonymity propagation and Sourcework transfer.
- Editorial Planning/Roadmap: writer/reviewer/editor/curator permissions, stage transitions, historical records and read-only states.

These are explicit **functional validation items**, not unresolved structural guide defects. New code releases must continue to update or flag affected guides through the Resources release mechanism.

## Database and repository

Production and preview content updates use the existing `rc_articles` version-history triggers. They are mirrored as migration files under `supabase/migrations/` on `claude/main`. Historical article versions remain available. No application feature logic, station procedure text, or Academic Partnerships/Editorial Inquiry guide was altered.

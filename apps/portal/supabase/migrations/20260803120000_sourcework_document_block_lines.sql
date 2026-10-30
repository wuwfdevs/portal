-- Sourcework: per-line geometry on document blocks, for excerpt highlighting
-- precision (docs/sourcework-design.md §8.7 follow-up). sw_document_blocks.bbox
-- is a whole-paragraph aggregate; an excerpt spanning only part of a paragraph
-- had no finer geometry to draw from, so a saved excerpt's location bbox was
-- always the entire containing block regardless of what text was actually
-- selected. This column carries native extraction's per-line offset ranges +
-- bbox (empty for OCR blocks, which only ever report block-level coordinates
-- — see providers/mistral-ocr-mapping.ts) so excerpt creation can intersect
-- the selected offset range against real line boxes instead of falling back
-- to the whole block's own bbox (see document-selection.ts's
-- bboxForOffsetRange, wired in from document-workspace.tsx's
-- handleSaveExcerpt).

alter table public.sw_document_blocks add column lines jsonb not null default '[]'::jsonb;

comment on column public.sw_document_blocks.lines is
  'Native extraction only: [{startOffset, endOffset, bbox}], block-relative. Empty for OCR blocks and for native blocks with no recoverable page dimensions — see document-normalization.ts''s buildBlockFromLines.';

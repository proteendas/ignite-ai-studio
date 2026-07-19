# Spec — Content Generator

## User stories
- As a user, I pick an ingested document and generate marketing copy grounded strictly in its facts.
- As a user, I choose content type, tone, and target channel.
- As a user, I generate multiple channel outputs from one document in a single click (batch).
- As a user, I regenerate a variation of an output, edit it inline, export it (.txt/.md/.docx), and save it to my library.

## Acceptance criteria
- [ ] Content types: social-post, blog-draft, ad-copy, email, product-description.
- [ ] Tones: persuasive, formal, playful, professional, casual, technical. Channels: linkedin, x, email, landing-page, blog, ad-copy, general.
- [ ] Generation uses the full document (top-N chunks) with a strict "use only these facts — do not invent" system prompt.
- [ ] Batch: user selects N channels; one click produces one grounded output per channel, shown in tabs/cards, each independently editable/exportable/savable.
- [ ] Regenerate/variation: re-runs the same inputs with higher temperature for a distinct alternative.
- [ ] Export: client-side download as `.txt`, `.md`, or `.docx` (docx via a minimal OOXML writer or `docx` package).
- [ ] Save-to-library: persists `{ownerId, documentId, contentType, tone, channel, output, createdAt}`; listed and re-openable from the library.

## Edge cases
- Document not `ready` → block generation with a clear message.
- No provider configured → 503 with actionable message.
- Very large document → cap context to top-N chunks and note truncation in the response.

## Status / lessons
- New in IgniteAI: batch, regenerate, export, save-to-library. Base single-output generation retained from prior spec.

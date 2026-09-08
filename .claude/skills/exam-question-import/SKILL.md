---
name: exam-question-import
description: Add new exam questions (lessons/quiz entries) to study-app's data/lessons.json from a source document (spreadsheet, PDF extraction, etc.), especially when some questions have an associated diagram/figure image. Use this whenever the user asks to add a new 基本情報技術者試験 (or similar) question set to study-app, or references a TEX-series task. Do NOT use this for memo/comment syncing (see sheet-memo-sync) or for embedding image bytes directly — this skill's whole point is to avoid that.
---

# Adding exam questions to study-app, including ones with images

## Why this exists (2026-09-08 incident)

Earlier attempts to embed diagram images by having Claude fetch them from Google
Drive and write the base64 content directly into the repo failed repeatedly and
were traced to two separate, unrelated root causes — both confirmed by direct
testing, not guessed:

1. **Google Drive hotlink URLs are unreliable for `<img src>` embedding.**
   `drive.google.com/file/.../view` is an HTML viewer page, not embeddable at all.
   `lh3.googleusercontent.com/d/<id>` and `drive.google.com/thumbnail?id=<id>`
   both depend on Google's server-side thumbnail generator, which renders some
   PNGs (indexed/palette color with an embedded ICC profile) as solid black —
   reproducibly, regardless of sharing permissions. This is a Drive-side
   rendering problem, confirmed to affect some images and not others with
   otherwise-identical settings.
2. **Claude cannot reliably reproduce long, repetitive binary (base64) content
   as generated output.** Verified via PNG chunk-level CRC32 validation, repeatedly:
   images with large uniform/blank regions compress to base64 with long repeated
   substrings, and Claude's own text generation silently collapses those repeats
   (a ~10,872-character base64 string was reproduced as only ~3,921 characters,
   three separate times, with the same deterministic cutoff) — corrupting the
   file. This happens even when copying fresh from a just-fetched tool result,
   not just from memory across a compacted conversation.

Separately confirmed as the fix: study-app's *existing* working images
(`images/kihon-jouhou-r7/*.png`, referenced via
`https://raw.githubusercontent.com/gurii-gabreh/study-app/main/images/...`)
were fetched and CRC32-validated byte-for-byte correct — because
`raw.githubusercontent.com` serves the file's raw bytes with no server-side
transformation, unlike Drive's thumbnail generator, and because that fetch
path doesn't route the binary through Claude's own text generation.

## The rule this skill enforces

**Claude does not fetch, transcribe, or embed image bytes itself, ever, for
this workflow.** Instead:

1. When adding questions, identify which ones actually have an associated
   diagram/figure/table image (not all of them do — don't assume every
   question needs one). Only flag the ones that genuinely require it.
2. For each such question, decide the target path following the existing
   convention: `images/<course-slug>/q<N>_<short-english-slug>.png` (e.g.
   `images/kihon-jouhou-h30-aki/q22_nand-circuit.png`). Set the quiz item's
   `img` field in `data/lessons.json` to
   `https://raw.githubusercontent.com/gurii-gabreh/study-app/main/<that path>`
   **before the file exists at that path** — this is safe, since a missing
   image just fails to load (handled by the existing `onerror` fallback in
   `index.html`), and it means no further JSON edit is needed once the file
   lands.
3. **Report back to the user, as the actual output of this task, exactly
   which questions need an image and the exact repo path each one expects**
   (a short table: question number / description / target path is enough).
   Do not attempt to produce the image content yourself.
4. The user places the real image files at those exact paths themselves
   (direct upload to the repo — e.g. GitHub's web UI drag-and-drop, or git).
   This is the only path from "image exists somewhere" to "image exists in
   the repo" that this skill uses.
5. Once the user confirms the files are in place, verify with a read-only
   check (e.g. `git log`/`ls` after they push, or ask them to confirm in the
   live app) rather than assuming — do not mark the task done on faith.

## Non-goals / things not to do

- Do not use any `drive.google.com` or `googleusercontent.com` URL as an
  `img` value, even temporarily — it has been shown to fail unpredictably.
- Do not call `download_file_content` (or similar) on an image file and then
  write/paste that content into a repo file — this is the exact failure mode
  this skill exists to prevent.
- Don't assume a question needs an image just because the source document had
  a figure reference — check whether it's actually a distinct diagram/table
  versus decorative, and only flag genuine cases.

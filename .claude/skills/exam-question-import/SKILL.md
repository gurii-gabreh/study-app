---
name: exam-question-import
description: Add new exam questions (lessons/quiz entries) to study-app's data/lessons.json. Covers two input shapes — (A) a Google Drive folder of raw exam-screenshot images (基本情報技術者試験 past-exam-site screenshots etc.) that must first be transcribed, and (B) an already-transcribed source document (spreadsheet, PDF extraction, etc.) that just needs importing, especially when some questions have an associated diagram/figure image. Use this whenever the user asks to add a new exam question set to study-app, references a TEX-series/STU-series task, says "前やったように" about a Drive folder of question screenshots, pastes a Drive folder link alongside "文字列化して"/"抽出して", or sends the fixed phrase "【Study App問題文抽出】画像から問題文・選択肢・正解を抽出してください" (runs Part A, then Part B automatically for anything Part A flags) or "【Study App問題文抽出 図表抽出用】画像から問題文・選択肢の図表を抽出してください" (runs Part B alone, for re-processing already-identified figure questions). Do NOT use this for memo/comment syncing (see sheet-memo-sync) or for embedding image bytes directly — this skill's whole point is to avoid that.
---

# Adding exam questions to study-app, including ones with images

## Trigger phrases (2026-10-02 added)

- **「【Study App問題文抽出】画像から問題文・選択肢・正解を抽出してください」** → run Part A.
  Part A's own step 5 continues directly into Part B in the same run for any
  question it flags as needing a figure — don't stop and wait for the user to
  separately say the Part B phrase.
- **「【Study App問題文抽出 図表抽出用】画像から問題文・選択肢の図表を抽出してください」**
  → run Part B alone. Use this when Part A already ran (or the figure-needing
  questions are already known some other way) and only the image-placement
  step needs to happen, without re-running text extraction.

## Why this exists (2026-09-08 incident, and the 2026-09-09 gap this update fixes)

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

**Separately, on 2026-09-09** a request to transcribe a Drive folder of 84
question screenshots (平成30年春期) was handled ad hoc — directly in the
manager-room session, via 3 parallel subagents, with no spreadsheet step and
no record anywhere. It got 53/80 questions into `data/lessons.json` (commit
`ec96121`) and reported 27 remaining (17 needing a visual diagram/answer
check, 10 with blank source images) back to the user — but that remainder was
never tracked in `progress-tracker-dashboard`'s `data/tasks.json` and was
never followed up. This update folds that ad-hoc procedure into this skill
(Part A below) specifically so the "report remaining items" step always ends
in a tracked task, not a chat message that can be forgotten.

## `tex-image-extraction` (Text-Extraction repo) is superseded for this purpose (2026-10-02)

That sibling skill (`gurii-gabreh/Text-Extraction`'s `tex-image-extraction`)
reads the same kind of Drive screenshot folders, but writes to a new Google
Spreadsheet for manual review instead of to a repo. Checked against actual
history (TEX-001, TEX-002, TEX-003): every one of its outputs was eventually
hand-transcribed into study-app's `data/lessons.json` anyway — no other
destination was ever found for it. Part A below does that same job directly,
without the spreadsheet hop. So as of 2026-10-02 (user decision), it has no
remaining real-world use for study-app question sets, and it's removed from
the dashboard's 🤖AI基本設定 tab (`progress-tracker-dashboard`'s
`data/ai-config.json`, `web.customSkills.table`) so it doesn't come up as a
candidate. Per explicit instruction, its skill file itself
(`Text-Extraction` repo's `.claude/skills/tex-image-extraction/SKILL.md`) and
its entry in `ai-config.json`'s `ai.customSkills.registry` are both left in
place (marked `"status": "superseded"` there) rather than deleted, in case a
genuinely different, non-study-app use for it ever comes up.

## Part A: transcribing a Drive folder of screenshot images

Use this when the input is a Google Drive folder of raw exam-screenshot
images (not yet transcribed anywhere). This is a different workflow from
`gurii-gabreh/Text-Extraction`'s `tex-image-extraction` skill: that skill
outputs to a new Google Spreadsheet for manual review; this one writes
**directly into study-app's `data/lessons.json`**, because that's what the
user actually wants for a study-app course. Don't run both — pick this one
when the destination is study-app.

1. **List the images** in the target Drive folder (`search_files` with
   `parentId = '<folder id>'`). Note the total count — "clean + needs-verify
   + needs-recapture" must add up to this total at the end.

2. **Decide whether to batch.** For a handful of images, read them directly.
   For a large folder (the 2026-09-09 precedent used 3 batches for 84
   images), split into batches of ~25-30 and launch one `general-purpose`
   subagent per batch in parallel (per CLAUDE.md rule 18 — same-nature
   concurrent work). Give each subagent the batch's file IDs and this exact
   output contract per image:
   - `qnum` (第◯問 number, or `null` if unreadable)
   - `type`: `"試験対策"`
   - `q`: question text only (skip metadata rows / mock-exam progress
     indicators)
   - `opts`: array of choice texts, label stripped (ア/イ/ウ/エ → plain text)
   - `ans`: **0-indexed** integer matching `opts` (ア=0, イ=1, ...) — convert
     from whatever the site shows immediately after "正解：", ignore "あなたの
     解答："
   - `multi`: `null` unless it's a multi-answer question
   - `exp`: `""` (leave blank; explanation text is out of scope, same as
     stopping at "分類："/"解説：")
   - `img`: `""` for now (figure handling is step 5)
   - `error`: set and leave other fields `null`/empty when the image's
     `read_file_content` came back empty or a required field (`q` or `ans`)
     is missing — **don't guess a value to fill the gap**.
   - Each subagent should use `mcp__Google_Drive__read_file_content` (Drive's
     own server-side text extraction) rather than reading image pixels
     directly — that's what made the 2026-09-09 run parallelizable and cheap.
     The trade-off is it can silently drop diagrams/tables/图 that a plain
     OCR pass flattens or misses; that's handled in step 4, not here.

3. **Merge and dedupe.** Combine all batches' output (write each batch to a
   scratchpad JSON file, then merge via a Python script — rule 22). Some
   source sites split one question across two adjacent screenshots; sort by
   the filename's embedded timestamp and merge when `opts` match exactly
   across adjacent images with complementary missing fields. If a `qnum`
   appears in two batches as a genuine duplicate (boundary overlap), keep
   the one with fewer missing fields.

4. **Classify every item into exactly one bucket** (success + failure counts
   must equal the original image count, no silent drops):
   - **clean**: `q` and `ans` present, no sign of a figure/table that didn't
     survive text extraction.
   - **needs_image_verify**: text was extracted but a diagram/graph/table
     reference suggests information was lost (e.g. "次の図において", a choice
     set that's clearly meant to be visual but came through as fragments).
     Resolve this bucket by reading the specific image directly (Claude
     vision this time, not Drive's text extraction) and applying the same
     crop-vs-transcribe judgment as `tex-image-extraction`'s step 4 (crop
     diagrams/graphs/UI screenshots that would lose meaning as text;
     transcribe plain tables as text).
   - **needs_recapture**: `read_file_content` returned empty and the
     adjacent-image merge in step 3 didn't resolve it either — the source
     screenshot itself has no extractable content. This bucket cannot be
     fixed from Drive data; it needs a fresh screenshot from the user.

5. **Crops for the needs_image_verify bucket**, when a crop is genuinely
   needed: upload to a new subfolder inside the *source* Drive folder is NOT
   the target here (unlike `tex-image-extraction`, which stays within
   Drive) — this skill's destination is GitHub. **Continue directly into
   Part B below within this same run** (don't stop and wait for the user to
   separately invoke the Part B trigger phrase — that phrase is for
   re-running Part B alone later, not a gate on finishing this run) for how
   the crop actually lands in the repo (GitHub raw URL, user places the
   file).

6. **Write the clean bucket into `data/lessons.json`** via a Python script
   (rule 22 — this file is large). Match the existing schema:
   ```json
   {
     "category": "基本情報技術者試験",
     "course": "<course name, e.g. 令和4年秋期>",
     "lesson": "<same as course>",
     "title": "<same as course>",
     "summary": "",
     "points": [],
     "id": "<course>_<course>",
     "quiz": [
       {"type": "試験対策", "q": "...", "img": "", "opts": ["...", "...", "...", "..."], "ans": 0, "multi": null, "exp": ""}
     ]
   }
   ```
   If a lesson object for that course already exists, append to its `quiz`
   array instead of creating a duplicate lesson. Validate afterward: valid
   JSON, `quiz` length matches what you intended to add, every item has the
   required fields.

7. **Commit only `data/lessons.json`** (check `git status` first — don't
   sweep in unrelated uncommitted changes from other work), push to main.

8. **Register/update a tracking task in `progress-tracker-dashboard`'s
   `data/tasks.json`** (`STU-NNN` — find the next free number; `STU-001`
   already exists). This step is mandatory, specifically because the
   2026-09-09 run skipped it and the 27 leftover questions were forgotten
   for months:
   - `status`: `"進行中"` if any bucket besides clean is non-empty, else
     `"完了"`.
   - `detail`: course name, source Drive folder link, success count, and
     the exact question numbers in each non-clean bucket.
   - `nextAction`: concretely what unblocks the remaining buckets (e.g.
     "第5,6,9...問は図表の目視確認待ち。第37,55...問はDrive元画像が空白のため
     再スクリーンショットが必要、ユーザーに依頼すること。").
   - `checkHistory`: append an entry for this run.
   - Commit/push to progress-tracker-dashboard's designated branch and merge
     to main per its own workflow — don't leave this only on a feature branch.

9. **Report to the user**: total images, clean count (now in `lessons.json`,
   with the commit hash), needs_image_verify question numbers, needs_recapture
   question numbers, and the `STU-NNN` task ID where the remainder is tracked.

## Part B: image-reference handling (for questions whose figure must stay visual)

This is the original (2026-09-08) scope of this skill: once a question is
known to need a diagram/figure image (from Part A step 4/5, or from any other
source document), get the real file into the repo safely. Reached either as
a direct continuation of Part A (same run, same report at the end) or
standalone via its own trigger phrase (see "Trigger phrases" above) when the
figure-needing questions are already known.

**Claude does not fetch, transcribe, or embed image bytes itself, ever, for
this workflow.** Instead:

1. Decide the target path following the existing convention:
   `images/<course-slug>/q<N>_<short-english-slug>.png` (e.g.
   `images/kihon-jouhou-h30-aki/q22_nand-circuit.png`). Set the quiz item's
   `img` field in `data/lessons.json` to
   `https://raw.githubusercontent.com/gurii-gabreh/study-app/main/<that path>`
   **before the file exists at that path** — this is safe, since a missing
   image just fails to load (handled by the existing `onerror` fallback in
   `index.html`), and it means no further JSON edit is needed once the file
   lands.
2. **Report back to the user, as the actual output of this task, exactly
   which questions need an image and the exact repo path each one expects**
   (a short table: question number / description / target path is enough).
   Do not attempt to produce the image content yourself.
3. The user places the real image files at those exact paths themselves
   (direct upload to the repo — e.g. GitHub's web UI drag-and-drop, or git).
   This is the only path from "image exists somewhere" to "image exists in
   the repo" that this skill uses.
4. Once the user confirms the files are in place, verify with a read-only
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
- Don't report a non-clean bucket (needs_image_verify / needs_recapture) only
  in chat — Part A step 8 (the tracking task) is mandatory precisely because
  that's how the 2026-09-09 27-question remainder was lost.

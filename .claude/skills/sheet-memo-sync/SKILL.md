---
name: sheet-memo-sync
description: Sync new memo/note rows from a Google Sheet into study-app's data/lessons.json "comments" dictionary. Use this whenever the user says a study-app memo/note they added to a spreadsheet isn't showing up in the app, references the memo-tracking spreadsheet by URL, or asks to "reflect" sheet content into the app. This is specifically for the comments (memo) side of study-app, not for quiz/lesson content itself.
---

# Syncing spreadsheet memos into study-app

## Why this exists

study-app's actual content source of truth is `data/lessons.json` in the repo (fetched client-side, no backend) — this was a deliberate architecture decision (see `/root/.claude/CLAUDE.md`, "静的クライアントアプリのコンテンツ管理"), replacing an earlier GAS/spreadsheet auto-sync that was abandoned because running two sync paths at once caused conflicts. The user still *writes* new study memos into a Google Sheet as their capture tool (it's just faster for them to jot notes there while studying), but the sheet is no longer wired to the app directly — someone has to carry new rows over into `data/lessons.json` by hand. That's what this skill does.

`data/lessons.json` has two top-level keys: `lessons` (quiz/lesson content — a different concern, not handled by this skill) and `comments` (a flat dict, `{"Course{N}_{chapter}_{Q}": "memo text", ...}`, e.g. `"Course1_1-1_3"`).

## Steps

1. **Read the spreadsheet** with `read_file_content`. It's large enough that the result gets saved to a `tool-results/*.txt` file rather than returned inline — don't try to read that file directly into context, extract from it with a script instead (see below). The exported rows look like a markdown table: `| <timestamp> | <app/course label> | Course <N> | <chapter> | Q<n> | <memo text> |`.

2. **Parse rows into the same key format** used by `comments`: `Course{N}_{chapter}_{Q}` → memo text. A regex over the raw table text works well:
   ```python
   import re, json
   raw = json.load(open("<tool-result-file>"))["fileContent"]
   row_re = re.compile(r'^\|\s*[\d/: ]+\|\s*([^|]+?)\s*\|\s*Course\s*(\d+)\s*\|\s*([\d.\-]+)\s*\|\s*Q(\d+)\s*\|\s*(.+?)\s*\|$', re.MULTILINE)
   sheet_map = {f"Course{c}_{ch}_{q}": text for _label, c, ch, q, text in row_re.findall(raw)}
   ```

3. **Diff against the existing `comments` dict** in `data/lessons.json` — keys present in the sheet but missing from `comments` are the new memos to add. (Don't assume the sheet is append-only forever; if a key exists in both but the text differs, that's worth flagging to the user rather than silently overwriting — a memo could have been intentionally edited in the app-facing JSON.)

4. **Show the user what would change before writing anything live**: how many new entries, which courses/chapters they span, and 2-3 example snippets. Ask for confirmation before committing and pushing — this changes a live GitHub Pages app, which is exactly the kind of outward-facing, non-trivial-to-instantly-undo action that should be confirmed first rather than just done and reported afterward.

5. **Merge and write**: `comments.update(missing)`, write `data/lessons.json` back with `ensure_ascii=False, indent=2`, keep a trailing newline.

6. **Commit and push** to study-app's default branch once confirmed. Fetch/rebase first if the remote has moved.

## Note

If the user ever asks for the reverse (add a *lesson/quiz* item, not a memo) from a similar spreadsheet, that's a different data shape (`lessons` array — `category`, `course`, `lesson`, `title`, `summary`, `points`, `quiz`, `id`) and isn't covered by this skill as written; check the schema in `data/lessons.json` before assuming the same key-mapping approach applies.

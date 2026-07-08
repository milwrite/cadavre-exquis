# Design: Control panel + play-experience features for `ui/corpse.html`

## Context

`ui/corpse.html` is the minimal, "the caret *is* the poem's growing edge" play
surface — and the one already wired to the tuned Gemma (`exquisite-corpse-tuned`
via an OpenAI-compatible Ollama endpoint, config from `window.CORPSE_CONFIG`).
Today it is single-player-vs-model with no way to: guide the model's style,
retry a line you dislike, or keep the finished poem. This design adds those as a
**collapsed-by-default right control panel** that preserves the empty center
stage on load and slides in only when summoned.

Everything here is prompt-level and localStorage-only — no backend beyond the
existing OpenAI-compatible endpoint, so it works against a base *or* tuned Gemma
and does not depend on the fine-tune (still unchecked in `PROGRESS.md`) being done.

Scope note: only `ui/corpse.html` changes. `index.html` (featured page, Qwen
placeholder backend) and the Python pipeline are untouched.

## Decisions

1. **Target:** evolve `ui/corpse.html`; panel collapsed by default, slides in from right.
2. **Prompt model:** *layered steer*. The locked game prompt stays; the user's
   steer text + selected tags append as a `STYLE GUIDANCE` block. A toggle reveals
   and lets a power user override the full composed prompt.
3. **Regenerate:** *avoid-note + resample*. Drop the last model line, re-request
   with an injected note naming the rejected word(s) to avoid, resample at
   temp +0.1; repeated regens accumulate the avoid-list.
4. **Keep poem:** *library + export*. localStorage library (save / list / reopen /
   delete) + copy-to-clipboard + Markdown export.

## Feature design

### A. Right control panel (collapsed by default)
- A small, faint mono edge-tab `⋯` fixed top-right (styled like `#hint`). Click
  toggles a panel that slides in from the right; `Esc` closes it. Respects
  `prefers-reduced-motion` (no transition when reduced).
- The center poem column is unchanged on load — the minimal aesthetic is intact
  until the user opens the panel.
- **Focus fix:** the existing `document.addEventListener("click", keepFocus)`
  refocuses `#entry` on every click. Exempt clicks inside the panel
  (`if (!closed && !panel.contains(e.target)) entry.focus()`) so the textarea and
  controls are usable.
- Panel sections, top → bottom: **System steer** (textarea) · **Subgenre tags**
  (toggle chips) · **↻ Regenerate last line** · **♥ Keep poem** + **⌄ Library**.

### B. Layered system prompt (steer + tags)
- Rename the current `SYSTEM` constant to `BASE_GAME_PROMPT` (verbatim, unchanged).
- `composeSystem()` returns `BASE_GAME_PROMPT` + (if any steer/tags) a trailing
  block:
  ```
  STYLE GUIDANCE (bias word choice and imagery; never break the rules above):
  <steer textarea text, if any>
  Lean toward: <comma-joined descriptors of selected tags>
  ```
- `messages[0].content` is (re)built by `composeSystem()` at load and **live on
  any steer/tag change**, so mid-poem edits affect subsequent turns. The game
  rules always win because the base prompt is first and the block explicitly
  defers to it.
- **View/edit full prompt** toggle: reveals a read-only render of the composed
  prompt; an "override" switch turns it into an editable textarea that, while on,
  replaces `composeSystem()` output verbatim (steer/tags then just insert text at
  the cursor). Off by default.

### C. Subgenre tags (~12, corpus-grounded)
Multi-select chips. Each maps to a one-line style descriptor appended to
`Lean toward:`. Grounded in `configs/gutenberg_volumes.json` tags + the
surrealist core. The first four are truest to the fine-tune; the rest are corpus
breadth:

| Tag | Descriptor injected |
|---|---|
| Surrealism | dream-logic, automatic juxtaposition, the uncanny |
| Imagism | one hard clear image, no wasted word, direct treatment |
| Dada | anti-logic, chance, nonsense, collage |
| Symbolism | suggestion over statement, correspondences, dusk |
| Vorticism | angular, kinetic, machine-edged energy |
| Futurism | speed, motors, words-in-freedom |
| Objectivism | the thing itself, plain sincerity |
| Stein / proto-language | repetition, grammar as material, domestic objects |
| Modernist lyric (Eliot) | urban fragment, allusion, ironic melancholy |
| Georgian pastoral | English countryside lyric, plainspoken |
| War elegy | trench grief, doomed youth |
| Harlem Renaissance | defiant early-1920s lyric |

Tags + steer text persist in `localStorage` (`corpse.settings`) so a reload keeps
the configured lean.

### D. Regenerate last model line
- Track `last = { userText, modelLine, lineEl, avoided: [] }`, set after each
  normal exchange; cleared once the user submits their next word (regenerate only
  targets the *most recent* model contribution, still at the growing edge).
- On **↻ Regenerate**: remove `last.lineEl` from the DOM, pop the trailing
  `assistant` message from `messages` (leaving the real `user` cue as the tail).
  Build a request copy = `messages` + one ephemeral user turn:
  `Previous attempt: "<avoided joined>". Give a different next line — one or two
  words only, do not repeat those.` POST at temp 0.9→1.0. On success: push the
  clean new reply to the real `messages`, re-render the line, `avoided.push(old)`.
  Real history stays canonical (system,user,assistant,…); the avoid-note never
  persists in it.
- Also expose **↻ Re-read** after close (same mechanism on the `.` reading), since
  the reading is a model response too. Minor, reuses the code path.
- Disabled when there is no current model line / mid-request.

### E. Keep poem — library + export
- Reading the poem body reuses the existing `.` close flow (poem lines are already
  in the DOM; the reading is parsed in `reveal()`).
- **♥ Keep** snapshots `{ lines[], reading, steer, tags[], ts }` into
  `localStorage` key `corpse.library` (array, newest first).
- **⌄ Library** lists saved poems (first line + date); each row: **reopen**
  (render read-only into the center column) and **delete**.
- **Copy** (clipboard) and **Export .md** (Blob download, mirroring index.html's
  `exportMarkdown`, filename `exquisite-corpse-<ts>.md`).

## Files changed
- `ui/corpse.html` — all of the above (markup for panel + chips + library, CSS for
  the slide-in/chips, JS for `composeSystem`, regenerate, library, focus fix).
  Single self-contained file; no new deps, no build step.
- `ui/README.md` — short note documenting the panel (open with `⋯`), steer/tags,
  regenerate, and the local library.
- (No change to `ui/config.example.js` — endpoint/model/apiKey mechanism reused.)

## Verification (end-to-end)
1. `./ui/serve.sh` → open `http://localhost:8800/corpse.html`.
2. **Aesthetic intact:** on load the page is unchanged (empty column, no panel).
   `⋯` opens the panel; `Esc` closes; center stage still typable.
3. **Steer/tags wiring:** open DevTools → Network. Select tags + type steer text,
   submit a word; confirm the POST body's `messages[0].content` contains
   `STYLE GUIDANCE` and the chosen `Lean toward:` descriptors. Toggle a tag off →
   next request drops it.
4. **Regenerate:** submit a word, get a model line, press ↻; confirm the DOM line
   changes and the request copy carries `Previous attempt: "…"`. Regenerate again →
   avoid-list grows to include both. Verify real `messages` stays clean.
5. **Keep/library:** close with `.`, ♥ Keep, reload, open Library → poem reopens;
   delete removes it; Export .md downloads a readable file; Copy puts it on the clipboard.
6. Backend: use a local Ollama base Gemma if present; otherwise any
   OpenAI-compatible stub. Feature logic (compose/regenerate/library) is verifiable
   from request payloads even without the tuned model.

## Out of scope / YAGNI
- No changes to `index.html`, the multiplayer flow, or the Python pipeline.
- No server, accounts, or shared "wall"; library is local only.
- No streaming; keeps the current `stream:false` request shape.

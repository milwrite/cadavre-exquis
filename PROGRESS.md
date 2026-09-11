# PROGRESS — Surrealist corpus → Gemma QLoRA

**Owner:** Zach Muhlbauer (CUNY GC) · **Goal:** fine-tune a small Gemma to write
surreal next-line continuations, feeding the "Exquisite Corpse" game bot
(served through a readiness-checked, multi-provider model pool). Spec:
`docs/superpowers/specs/2026-07-08-surrealist-corpus-gemma-qlora-design.md`.

This file is the **single source of truth for what is done and what is next.**
The cron agent (see `CONTINUE.md`) reads it, advances the next unchecked item,
updates counts, and commits. Keep it honest — no checkbox ticked without evidence.

## Current Worker destination

### Mobile writing and curated models — 2026-09-11

- Phone writing no longer forces focus after load, taps elsewhere, or model
  responses. Solo has a visible Send button. Both writing edges fit above a
  simulated software keyboard, and phone form controls use at least 16px text.
  The visual viewport changes the Solo composition without disabling pinch zoom.
- The current CAIL Featured shortlist is a different source from the full
  catalog. Poetry uses four task-suited Featured models plus requested MiniMax M3,
  compact Gemma 26B A4B, and Llama 8B. Public play offers the three runnable
  Workers AI choices; CUNY Login adds the four Gateway choices. Gemma 26B A4B
  is the poetry default. Older saved model IDs are normalized or moved to the
  current shortlist for future turns, preserving existing text and attribution.
- All seven poetry choices returned real model text. Local phone-sized Chromium
  verified the writing loop on both surfaces, with real remote Workers AI
  responses, no page errors, no horizontal overflow, and no forced refocus.
  The reduced viewport is a keyboard simulation, not a physical iPhone test.
- Solo/shared consolidation remains a proposal in the workspace Games plan.
  No mode was removed or merged by this repair.
- Firefox's unsupported `text-wrap: pretty` declaration has been removed. Late
  readiness and background-cue responses can no longer replace a newer model
  selection; a delayed-response browser fixture passed on both play surfaces.
- The full Solo prompt exposed empty MiniMax output at 80, 256, and 512 completion
  tokens even though the short model probe passed. A bounded 2048-token minimum
  is being verified for that model; other poetry budgets remain unchanged.

### Model routing repair — 2026-09-11

- CAIL now advertises short public model aliases. Public play resolves those
  aliases to verified full Workers AI binding IDs; signed-in play resolves saved
  full IDs back to the live CAIL catalog ID. Unknown binding aliases stay hidden.
- Both play surfaces keep their 80-token turn and 400-token reading budgets after
  CUNY Login. Reasoning is disabled for short signed-in turns. Binding requests
  have a deadline, and empty output is returned as a failure.
- Deployed code `4ea71d7`, Worker version
  `dcd590b8-31a8-42ab-92c9-4df2a57bdf50`, at the existing `cadavre` destination.
  Health readback confirms the release and DeepSeek V4 Flash default.
- Verification: 33 page/core tests, 7 Python tests, 20 Worker tests, TypeScript,
  asset build, and deployment bundle pass. At 390 × 844, both play pages completed
  real model turns; Solo completed a close reading, with no console errors or
  horizontal overflow. Firefox CUNY Login → Solo turn → saved poem also passed.
- Scope of evidence: phone-sized Chromium and signed-in desktop Firefox; a
  physical iPhone/Safari session has not been tested. No static app key is needed
  for these repaired paths; signed-in requests retain CUNY Gateway authorization.

- [x] Canonical public application, Solo play and My work at `cadavre.ailab-452.workers.dev`.
- [x] Existing CUNY session handoff, private saved-work read/reload/pin/unpin and resume verified in Firefox; public real model completion verified separately.
- [x] Original public-wall namespace transferred intact; wall snapshot unchanged; browser-local wall editing permissions transferred through explicit UI.
- [x] Generic registration points to the new Worker origin with the same D1 app ID. Old cail-cadavre Worker deleted after replacement and browser transfer verification.
- [x] Tools `/cadavre/` page/API/launch removed; live 404 readback verified. Tools My work stays available.

See `docs/accounts/worker-move.md`. Earlier sections below record historical stages; model reflection is not an active feature.

## CUNY account pilot — 2026-09-06

- [x] User decisions: CAIL/CUNY sign-in only; display five recent unpinned items per app and retain older records; leave existing Inference Arcade accounts behind.
- [x] Isolated source from deployed Cadavre release `7d96fd7`; current org knowledge-base and Doorway contracts reconciled. Railway unchanged.
- [x] Shared per-subject AccountCoordinator and D1 schema, named Cadavre/Jeopardy/Cloze entrypoints, revisions, archive/private pins, settings, export/deletion implemented; model-reflection feature subsequently removed at user request.
- [x] New remote D1 `cail-work-accounts` (`46735c0b-e986-4cce-a13d-1e81008c939e`) created and migration 0001 applied.
- [x] Local account integration tests (8), Worker tests (13), types and dry bundles pass. Full Doorway checks pass in its isolated worktree.
- [x] Actual Doorway caller → Cadavre receiver → account D1/DO boundary passes locally with local signing/Admission/model doubles; save, readback and reflection make exactly two model calls.
- [x] Native browser: save → dashboard → reflection; settings save/reload; private pin; reopen and continue the same poem to revision 3. Phone-width dashboard rendering passed; the inspected dashboard and restored poem had no browser warnings/errors. This evidence uses a fixture model and local identity, not production CUNY.
- [x] Private account Worker deployed at 100%: `e2d0c030-c736-4995-a1d2-fe85babf0e86` (`dbddac1`); namespace `dae0fd009a144b75997d6276494bd451`, D1 tables, named entrypoints and exact bindings read back.
- [x] Independent agent review found endpoint override, formatting, prompt accumulation, model selection and hydration issues; fixes reviewed and focused regressions passed. Delayed-read browser check verified disabled play during hydration and after failure; multiline readback retained exact indentation/stanzas and unlisted model.
- [x] Cadavre receiver deployed at 100%: `ff69068e-ae51-4293-89b3-5fc8a2294ee3` (`c40b1ba`); live health and unsigned account denial verified.
- [x] Doorway PR #127 merged as `00849b7`, deployed at 100% as `739799be-587b-4c2e-b539-ab5523b266a7`; production account bindings and mounted anonymous 401 envelopes read back.
- [x] Doorway PR #128 merged as `fa99418e`, deployed at 100% as `6db27d4e-6933-4508-b075-8dc7c5cb67c6`. Main checks and exact serving-version/binding readback passed. Full workflow remains red on the pre-existing PDF Accessibility readiness 503; the account probes remain enforced.
- [ ] Authenticated live acceptance: complete real CUNY sign-in, then production inference, save/reload/settings, private pin/reopen, and saved-work resume.
- Review/evidence: Cadavre PR #5, Doorway PRs #127 and #128, and `docs/accounts/acceptance.md`.

See `docs/accounts/workflows.md` and `docs/accounts/adapters.md` for modular workflows and exact limits. Corpus/training source is unchanged; no corpus regeneration is needed for this web-only change.

## Shared workspace refinement — 2026-09-06

- [x] User scope: Cadavre tests a tool-agnostic account/artifact foundation; future apps integrate using a registry and scoped adapter.
- [x] Removed reflection UI/generation/endpoint and the account Worker Gateway binding.
- [x] Administrative navy/teal theme with quieter typography/actions, shared Lab links, searchable all-app library, and registry-driven resume links implemented.
- [x] 10 account tests, including populated D1 migration preservation and scope/search, pass; 13 Worker tests and one-call actual caller/receiver path pass.
- [ ] Refined UI deployment and real authenticated acceptance.

See `docs/accounts/integrate-an-application.md`.

## Decisions (locked)
- Corpus: aesthetic-first, public-domain-heavy. Surrealist core + modernist breadth.
- Objective: **chat next-line continuation**, model-agnostic messages, loss on assistant only.
- Local train target: **`unsloth/gemma-3-4b-it`** (smallest sensible; no Gemma-4 < 12B exists).
  Recipe can transfer to `google/gemma-4-12B-it` / a larger hosted model later.
- Split by poem 95/5. GPC padding down-weighted; never in val.

## Published
- **Repo:** https://github.com/milwrite/cadavre-exquis (public, branch `master`)
- **Pages:** https://milwrite.github.io/cadavre-exquis/ (serves `index.html`,
  "the parlor"; minimal solo UI at `/ui/corpse.html`, "the open sheet")
- Model export PII scrubbed before first push. Published provider credentials stay
  in the Inference Arcade Railway environment; `ui/config.local.js` remains the
  gitignored override for personal endpoints.
- **2026-07-09 UX audit:** both UIs unified on the ink/bone identity and one
  config contract (defaults → `config.local.js` → URL params); the parlor now
  actually folds contributions out of sight during play, reveals locally, and
  has a viewable wall; error paths all have retry. Verified end-to-end in-browser
  against the live vLLM adapter.
- **2026-07-11 hosted routing:** GitHub Pages and
  https://inference-arcade.com/cadavre now use the same canonical interfaces.
  Both load the server-owned `/api/cadavre/models` catalog and send route ids to
  `/api/cadavre/chat`; a live check returned 34 Ollama Cloud choices and completed
  a `gemma3:4b` turn. Railway's `OLLAMA_API_KEY` matches the supplied environment
  value. The Legion choice stays disabled until Railway can reach its HTTPS vLLM
  endpoint.
- **2026-07-13 shared wall pages and voting:** wall poems show 20 lines per
  numbered page, and upvotes and downvotes persist in Railway Postgres through
  the application API. A 45-line live test covered three pages, vote changes,
  reload persistence, and clearing a vote. The temporary post was removed, and
  both public pages returned to the three real entries without console errors.
- **2026-07-13 model readiness and failover (refreshed 2026-07-27):** published
  play waits for a real generated readiness response before accepting the first
  turn. The server now defaults to the currently listed `kimi-k2.5`, adopts
  catalog replacements for retired model ids, and moves through verified
  `minimax-m3`, `deepseek-v4-flash`, and `gpt-oss:20b` standbys. OpenRouter is
  removed from the advertised pool while its key has no remaining capacity,
  and a bounded Cadavre-only Ollama reserve cannot be consumed by tournaments
  or background warmups. Both UIs retry transient turns automatically and
  adopt the effective route returned by the server.
- **2026-09-02 CAIL Gateway relay:** `ui/cail_proxy.py` + `ui/serve-cail.sh`
  serve both pages locally through the CUNY AI Lab Gateway (Cloudflare AI
  Gateway) with a personal `sk-cail-*` key held server-side; the gateway sends
  no CORS preflight and rejects `Python-urllib` (error 1010). The relay maps
  `/v1/models` (264 routes: 31 Workers AI, 233 OpenRouter) to the page catalog,
  refuses any model outside it, verifies readiness with one tiny generation,
  and switches thinking off for reasoning models. Verified: models, ready, and
  chat via `@cf/google/gemma-4-26b-a4b-it` and `deepseek/deepseek-chat-v3.1`.
- **2026-09-02 Cloudflare Worker on the CUNY AI Lab account:** `worker/` ships the
  game as one self-contained Worker, `cail-cadavre`, at
  https://cail-cadavre.ailab-452.workers.dev (workers.dev trigger only; nothing
  else on the account touched). Both pages are static assets; `/api/cadavre/*`
  runs `@cf/` routes on the account's own Workers AI binding (no provider key),
  draws its menu from the gateway's public catalog, clamps budgets (400 tokens,
  12 messages), rate-limits by IP (20 turns / 6 readings / 5 pins per minute),
  and keeps a daily token ceiling plus the shared wall in one SQLite Durable
  Object. A one-fold probe of all 24 listed Workers AI routes excluded nine
  (hidden or leaked reasoning, one license-gated vision model); 15 remain,
  default Gemma 4 26B. Verified live: readiness, a fold, wall pin/vote/remove,
  and full browser rounds with close readings on Gemma 4 and Llama 3.3 70B.
  Page fixes shipped with it: the parlor's other hand is now a catalog menu,
  and the intro column stays pinned at the top instead of centring itself
  halfway down a long reveal. On middle-sized screens (48–80rem) the reveal
  collapses the intro to its title line and gives the poem the whole width,
  with the close reading beside it from 60rem up.
  Next folds: Turnstile sessions, the lab's front-door ruling, a delegated name.

## 2026-09-02 · the parlor as one column, the wall on its own page
- `index.html` redesigned: masthead with the epigraph on one unbroken line, a short
  intro, then table → sheet → reveal in a single 42rem column (the reveal widens to
  poem-left / reading-right from 60rem). Verse is flush left at 1.15–1.3rem; the
  close reading sits beside it without a box. One serif, no mono chrome, no caps
  eyebrows. Phone, tablet, and desk widths rendered and checked.
- The wall moved to `wall.html` (paging, votes, unpin). The parlor previews the six
  newest pins at five lines each and links to `wall.html#pin-<id>`; pinning stays on
  the page and reports "pinned to the wall" with a link.
- Worker: `wall.html` in `dist/`, default model `@cf/deepseek-ai/deepseek-v4-flash-0731`
  (also first in the offline fallback catalog). Deployed to
  https://cail-cadavre.ailab-452.workers.dev. Same design ported to the
  inference-arcade fork (`gvgai-web` `web/public/cadavre.html` + `cadavre-wall.html`),
  whose server default is now `ollama:deepseek-v4-flash`.
- "The Wall" is set in the title's cut-out print: `assets/title-wall-1.png` (678×168 at
  1x, rendered 2x from an HTML collage of Rockwell, Helvetica Neue Light, Didot, Bodoni 72,
  American Typewriter, Futura, and Baskerville Italic on tinted scraps), shown at 15.6rem so
  its scraps match the title's scale; used as the wall heading on both pages and on the fork.
- Second pass on the same day: the wall sits further below the game under a 9.5rem heading
  (11rem on its own page); controls read `submit` and `redo turn | clear lines | reveal poem`;
  chrome (labels, status, buttons, selects, footer) is a system sans while verse, intro, and
  reading stay serif; buttons are filled wine (primary), wine-outlined (reveal), or bone-edged.
  The model's line never lands inside 3 s (`MODEL_MIN_WAIT_MS`) so a hand can reveal on its
  own turn, and the play prompt carries a SHAPE note keyed to the fold count (opening → shaping
  → offering a close after 8 folds). The footer's connection line is gone.
- The wall page is one card per corpse: the whole poem (never paged) centred in the left
  third, its close reading always open in the right two-thirds, name/date/votes on a strip
  below; stacked single-file, poem above reading under 56rem. The Worker gained
  `POST /api/cadavre/wall/:id/rename` (delete token + name) and the wall page a "rename"
  control for pins this browser made; the inference-arcade fork has the cards but no rename.
- The sheet is flush left at the poem's measure (folds, cue, input, status, controls), so the
  visible line and the line being written stand where they will in the finished poem. A cut
  wall preview fades its last lines and links "continue reading on the wall, N more lines";
  a poem only one line over the preview is shown whole. Both cut-out headings carry alt text
  ("Exquisite Corpse", "The Wall"); the accessibility tree names them as h1 and h2.
- 2026-09-03: variety. The model's opening and its reply to the first line each get one
  random frame (ten openings, eight replies); "redo turn" records the popped model line
  under its turn index and the next attempt is told, under SET ASIDE, not to repeat or
  paraphrase it and to change its move; those turns run at temperature 1.05. The play
  prompt's VARIETY clause bans stock vocabulary and asks for a different opening word.
- The open sheet (`ui/corpse.html`) joins the system: verse flush left in a centred 36rem
  column at the writing scale, the reveal widening to poem-left / reading-right from 60rem,
  the hint and panel in the sans at readable sizes, and the controls tab is a paper scrap on
  the right edge ("the table" / "fold away") instead of a three-dot glyph. Dead Keep/Library
  controls removed. The parlor now carries an "open sheet" section above the wall (the footer
  keeps only the source link) and the wall link reads "see the whole wall".

## 2026-09-03 · the wall staggered, the table in twos, a copy pass
- Both pages set every pin the same way: the whole poem on its faint sheet in the left third,
  flush left in its pane, never cut or paged, the close reading in the right two-thirds
  (`grid-template-areas: "poem reading" "meta meta"` from 56rem; poem above reading below it).
  The parlor previews only the newest three pins as those full cards (`WALL_PREVIEW = 3`), each
  footed with name, date, and "see it on the wall"; votes, rename, and unpin stay on `wall.html`.
  The five-line cut and its "continue reading" link are gone. The card CSS is duplicated in
  `index.html` and `wall.html` — change both together (tests pin the grid in each).
- The parlor's first screen: the masthead starts `clamp(2rem, 8vh, 5rem)` down the viewport;
  the table's four settings sit in two rows of two (the other hand | words per turn, then
  players | the model sits at seat); "Solo play" sits just under "begin" with no rule above it.
  "play solo" and "see the wall" are filled wine buttons like "begin" (one shared rule).
- Later that day: "see the wall" was rendering 6px shorter than "play solo" with its text sitting low,
  because the old text-link rule `.wall-head a { padding-bottom: 0.15rem }` outranked the button rule.
  That override is gone from `index.html`, `wall.html`, and the inference-arcade fork, and the wall
  pages' `.nav-link` takes the shared `line-height: 1.2`, so every link set as a button measures the
  same 35px as "begin" (checked with Playwright at 1280 and 390 wide).
- Copy: the intro opens "is a parlor game in which players add images or a few words to a
  sheet of paper, fold it to hide previous turns, and hand it off to the next player" and ends
  "until someone decides to end the game"; the solo section reads "Solo play / Try your hand at a solo
  round with your favorite large language model. Modify the system prompt, steer with a style
  of verse, and tinker with related settings in a fullscreen view."; the wall note is "newly pinned corpses".
- Same day, other hands: poems on a faint sheet wash (`--sheet-wash`), the larger italic
  "Close reading" head, "The Wall" cut letters laid up as faded brick, the epigraph credited
  "Paris, 1925", and a model-neutral meta description.
- Verified locally with Playwright against a stubbed wall (`/api/cadavre/wall` with three pins,
  one without a reading, one with a long wrapping line) at 1280 and 600 wide; `npm test` green
  (28 page, 7 relay, 11 Worker tests).
- Afternoon fix: the open sheet died after about six lines with "the other hand is still
  reconnecting" because it sends its whole transcript, one message a line, and the Worker
  capped a turn at 12 messages (HTTP 400 "at most 12 messages per turn"). `LIMITS.maxMessages`
  is now 120 (`maxChars` 12000 still bounds cost). The sheet now sends `max_tokens` (80 a fold,
  400 for the reading, which the 120-token default had been truncating), gained a Keep section
  (save as markdown, print, pin to the wall with the parlor's dialog and shared delete-token
  store, linking `../wall.html#pin-<id>`), and `keepFocus` became a hoisted function so the
  synchronous local warm-up path (no models endpoint) no longer throws. Verified with a stubbed
  Playwright flow (play, close, save, pin) and a 16-message live chat; Worker version `16d3b8ea`.
- Later the same afternoon, from play-testing: the model had answered a fold with a lone
  period, the sheet lit its Keep buttons after every turn, and a pin on an unclosed poem
  refused silently. Now only the human closes a poem: the sheet's prompt carries a
  NEVER_CLOSE clause, a reply with no word in it (or a trailing period) is tidied and asked
  for once more, and Keep controls light only after the close. The panel gained "close the
  poem", "steer the hand", "edit the poem", and a three-reread "read it again"; the reading is
  asked for with the prompt every page now shares (`CadavreCore.readingMessages`, with
  `stripPoemFromReading` for a model that reprints the poem first — the cause of a reading
  that opened with the whole poem run together). The parlor's reveal has the same edit and
  reread controls; the wall's owner controls gained "edit" (poem and title) and "read it
  again" (three per pin, counted in `cadavreWallReadings`) through the Worker's new
  `POST /wall/:id/edit`; pins carry an optional `title` (new column, migrated in place) asked
  for in every pin dialog beside the optional name, and pinning ends in a notice that names
  the title, the hand, and the way to the wall. Every action button is set like "begin"
  (wine, filled); back links, cancels, chips, and vote toggles keep the quiet outline. The
  cut-out title sits top left on the open sheet too, as the way back; every `<title>` begins
  "Exquisite Corpse". Verified with stubbed Playwright flows on all three pages.

### Next session — review, then push where relevant
- [ ] Open `index.html` and `wall.html` locally (`python3 -m http.server`, or `cd worker &&
      npm run dev`) and read the first screen at a laptop height and on a phone: the masthead
      headroom, the two-by-two table with the long DeepSeek route name in a half-width select,
      Solo play under begin, and the three wall cards. Revert anything that reads wrong.
- [ ] Play one round through to the reveal and pin it, so the preview shows a live card whose
      quotes light the poem's words; check the wall page card for the same pin.
- [x] `master` pushed 2026-09-03 (GitHub Pages rebuilds from it). For later pushes: `git push
      "https://x-access-token:$(gh auth token --user milwrite)@github.com/milwrite/cadavre-exquis.git" master`.
- [x] Worker deployed 2026-09-03 (version `11b6f179`), so https://cail-cadavre.ailab-452.workers.dev
      matches `master`. To redeploy: `cd worker && npm run deploy` (runs check + tests first).
- [ ] Port the same card, first-screen, and copy changes to the inference-arcade fork
      (`gvgai-web` `web/public/cadavre.html` + `cadavre-wall.html`; Railway deploys on push to
      master) — it still has the poem-left cards, the six-pin cut preview, and the old copy.

## Automation
- [x] **Scheduled continuation** — `scripts/continue.sh` via crontab, **daily 12:00 (noon)**.
  Runs headless Claude Code against `CONTINUE.md`, advances one step, commits.
  Disable: `crontab -e` → delete the `exquisite-corpse` lines. Log: `logs/cron.log`.

## Pipeline status
- [x] **Scaffold + venv + git** — `.venv` (py3.12), package `src/`.
- [x] **Source: PoetryDB** — `data/raw/poetrydb.jsonl` (~3k target; check count).
- [x] **Source: Gutenberg volumes** — `data/raw/gutenberg.jsonl` = **2439 poems**.
- [x] **Source: Gutenberg Poetry Corpus** — `data/raw/gpc.jsonl` = **15000 pseudo-poems**.
- [x] **Clean/dedup** — `data/interim/poems.jsonl` = **20,722 unique poems**. RERUN whenever a source changes.
- [x] **Build dataset** — `data/processed/next_line.{train,val}.jsonl` = **190,939 / 7,290 examples**.
- [x] **≥10,000 unique poems confirmed** — 20,722 (target exceeded).
- [x] **Dataset card** — `data/processed/dataset_card.md` written.
- [x] **Install train deps** — done; verified **torch 2.10.0+cu128, CUDA True, RTX 5090**.
- [x] **Train QLoRA** — trained on **`unsloth/gemma-4-E4B-it`** (on-stock vLLM base),
      2500 steps, `train_loss 0.81` → `outputs/lora` (r=16). Markers auto-detected.
- [x] **Integrated into vLLM** — `scripts/vllm_serve.sh` serves base + 3 adapters
      (`cloze-reader`, `jeopardylm`, **`exquisite-corpse`**) on :1234; smoke-tested.
      UI (`ui/config.local.js`) points at it. Needs `VLLM_USE_FLASHINFER_SAMPLER=0`.
- [x] **Qualitative eval** — `train/eval_vllm.py` (base vs tuned via the live vLLM
      host, no GPU reload) → `docs/eval-e4b.md`, 12 held-out prefixes.
- [x] **Pushed adapter to HF** — https://huggingface.co/milwright/exquisite-corpse-gemma-4-e4b-lora
      (public); uncommented in `../cloze-reader-monorepo/finetune/deploy/serve_gemma.sh`.
- [ ] **(opt) GGUF export** — `GGUF=1 .venv/bin/python train/train_qlora.py`.
- [ ] **(opt) Ollama model** — `.venv/bin/python deploy/build_ollama_model.py --create`
      (wraps GGUF with the real Exquisite Corpse system prompt).
- [ ] **(opt) Push private HF dataset** under `milwright/`.

## Counts (update each run)
| source | raw records | kept after clean |
|---|---|---|
| poetrydb | 2526 | 2295 |
| gutenberg volumes | 4360 | 3772 |
| gpc (padding) | 15000 | 14655 |
| **unique poems after clean** | | **20722** |
| **train / val examples** | | **190939 / 7290** |

Core (surreal/modernist) = poetrydb + gutenberg = **6067** poems; GPC is padding.

## Known follow-ups (cron can pick these up to improve quality)
1. ~~Recover missed volumes~~ **DONE** — `resolve_book` now searches title+author,
   paginates 3 pages, matches on last name, and supports explicit `gid`. Volume
   list expanded (Millay, Teasdale, Lawrence, McKay, Frost, Owen, Hopkins, +anthologies).
2. ~~Better segmentation~~ **DONE** — `segment_poems` falls back from 3-blank to
   2-blank split when the coarse split is too few/too-lumpy (fixes Spoon River etc.).
3. **Genre balance** — after clean, report share of surreal/proto-language tags;
   if GPC dominates, lower `--gpc-ratio` in build_dataset.
4. **Surrealist depth** — add PD translations (Rimbaud/Lautréamont/Apollinaire)
   from Wikisource/Archive.org if licensing checks out.
5. **Legion remote route** — publish the Gemma-4 E4B vLLM host at an HTTPS URL
   Railway can reach, then set `LEGION_VLLM_URL`. The catalog enables
   `legion:exquisite-corpse` after `/v1/models` lists the adapter.

## Worker-driven directory correction

- Removed the fixed/planned application list. Only registered `ailab-452.workers.dev` integrations appear.
- Generic WorkerAccounts binding props own exact audience, record kind and canonical Worker launch/reopen routes. D1 registry is versioned and rejects collisions.
- Fixed Cadavre static-asset redirects losing the CUNY mount, and introduced its own stable `/cadavre/play/` route.
- 11 account tests, 13 Worker tests and real Doorway/Worker/static-assets/storage boundary passed; independent review reran the important path.
- Deployed: account f94c9f62-0ba2-4cf3-a74e-983431f4947a (e2e2da1), Cadavre cc6bedd6-7c3d-4be6-842f-e6d6c7c523f5 (ffd5259), both 100%. Generic caller registration verified live. Firefox directory passed; save/reopen acceptance awaits the active browser.

# PROGRESS — Surrealist corpus → Gemma QLoRA

**Owner:** Zach Muhlbauer (CUNY GC) · **Goal:** fine-tune a small Gemma to write
surreal next-line continuations, feeding the "Exquisite Corpse" game bot
(deployed on `deepseek-v4-flash`). Spec: `docs/superpowers/specs/2026-07-08-surrealist-corpus-gemma-qlora-design.md`.

This file is the **single source of truth for what is done and what is next.**
The cron agent (see `CONTINUE.md`) reads it, advances the next unchecked item,
updates counts, and commits. Keep it honest — no checkbox ticked without evidence.

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
- Model export PII scrubbed before first push; API key stays in gitignored `ui/config.local.js`.
- **2026-07-09 UX audit:** both UIs unified on the ink/bone identity and one
  config contract (defaults → `config.local.js` → URL params); the parlor now
  actually folds contributions out of sight during play, reveals locally, and
  has a viewable wall; error paths all have retry. Verified end-to-end in-browser
  against the live vLLM adapter.
- **2026-07-20 README resync:** the public `README.md` "Current numbers" were
  stale from an early run (19,061 poems · 156k/6.1k) — corrected to ground truth
  (**21,744 poems · 228,876/8,294**, verified via `wc -l` on `data/`), added the
  shipped-adapter status + HF link, and fixed the backend description (default is
  the local multi-LoRA **vLLM** host, not "your own Ollama"). Also fixed a stale
  inline count in this file (gutenberg volumes checkbox said 2439 → **5489** raw,
  matching the Counts table). No data/pipeline change — docs only.

## Automation
- [x] **Scheduled continuation** — `scripts/continue.sh` via crontab, **daily 12:00 (noon)**.
  Runs headless Claude Code against `CONTINUE.md`, advances one step, commits.
  Disable: `crontab -e` → delete the `exquisite-corpse` lines. Log: `logs/cron.log`.
- [x] **Cron now enforces the regression suite** (2026-07-26) — the 38-test suite
  existed as the safety net against silent cron regressions, but *nothing in the
  autonomous loop ran it*. `scripts/continue.sh` now (a) runs it **pre-flight**:
  green → normal prompt; red → the day's prompt becomes *diagnose & fix the
  failure* (root cause, no test deletion) so a broken tree self-heals instead of
  compounding; (b) runs it **post-run** and logs OK/FAILED to `logs/cron.log`
  (loud evidence per run; a red post-run triggers next-day repair mode).
  `CONTINUE.md` §5 also now requires a green suite before commit. Verified both
  branches with the script's exact gate condition (green → "normal prompt"; an
  injected failing test → "repair prompt"; cleaned up, suite back to 38/38 OK);
  `bash -n` clean. No data/pipeline change — automation hardening only.

## Tests
- [x] **Regression suite for pure pipeline logic** (2026-07-21, extended 2026-07-22) —
  `tests/test_pipeline.py`, **34 tests, stdlib `unittest` only** (no new dep;
  runs on the cron box as-is). Run: `.venv/bin/python -m unittest discover -s tests`.
  It's a safety net for the *silent* transforms an autonomous daily cron could
  regress without ever crashing — each test cites the follow-up it guards:
  `is_front_matter` (**#6**, incl. the `&`-prefixed-publisher `\b` gotcha —
  verified the group-level-`\b` mistake actually flips the test red, so it's a
  real net not a tautology), `segment_poems` coarse→1-blank fallback (**#2**,
  Spoon-River lumping), plus `content_hash` dedup collapse, `examples_for`
  next-line slicing (stanza breaks never a target, context bounding, message
  shape), `poem_split` determinism, `is_section_label` bare-`I` edge case,
  `lines_to_stanza_lines`, `clean_line`, `is_probably_prose`,
  `strip_gutenberg_boilerplate`. **No data touched** — unit tests over the
  functions; the shipped corpus/adapter are unchanged.
- [x] **GPC-balance transform now covered** (2026-07-22) — the load-bearing
  padding cap (**follow-up #3**) lived inside `build_dataset.main()`'s file I/O,
  so it was the biggest *untested* silent transform. Extracted it verbatim into a
  pure `assemble_examples(poems, val_frac, gpc_ratio, max_ctx_lines) →
  (train, val, summary)` seam; `main()` now just reads/writes around it. Added
  **4 tests** (`TestAssembleExamples`) locking the two invariants that keep the
  modernist core dominant: GPC train subsampled to ≤ `gpc_ratio`×core-train (the
  `cap`), and GPC *never* in val. **Refactor proven behavior-preserving:**
  regenerated `data/processed` with default args and confirmed **byte-identical**
  to the shipped adapter's data (sha256 match on `next_line.{train,val}.jsonl`
  + `dataset_stats.json`; 228,876/8,294 reproduced exactly, `git diff` clean) —
  no corpus/adapter desync.

- [x] **Wrapped-prose rule covered** (2026-07-31) — `TestWrappedProse`, **9 tests**
      (TDD, red-first) over `is_wrapped_prose` (follow-up #7). Fixtures are real
      corpus excerpts, not invented strings. Two of them are *guard* tests that
      lock the near-miss: **Blake's fourteeners and Swinburne's anapestic long
      line must NOT be flagged.** Verified they are not tautologies by swapping
      #7's originally-proposed variance-only rule into the test module — it flips
      exactly those two red and nothing else. Suite total: **47** (stdlib-only).
- [x] **Eval span-slicing covered** (2026-07-25) — `tests/test_eval_nll.py`,
      **4 tests** (TDD, red-first) over `train/eval_nll.py`'s pure scoring seam
      (`sum_target_logprobs`, `summarize`). The character-offset slicing is that
      script's silent-failure surface: a fencepost bug would score chat-template
      markers or the generated token as poem tokens and shift every number in
      `docs/eval-nll.md` while exiting 0. Suite total: **38** (still stdlib-only).

## Pipeline status
- [x] **Scaffold + venv + git** — `.venv` (py3.12), package `src/`.
- [x] **Source: PoetryDB** — `data/raw/poetrydb.jsonl` (~3k target; check count).
- [x] **Source: Gutenberg volumes** — `data/raw/gutenberg.jsonl` = **6532 poems**.
- [x] **Source: Gutenberg Poetry Corpus** — `data/raw/gpc.jsonl` = **15000 pseudo-poems**.
- [x] **Clean/dedup** — `data/interim/poems.jsonl` = **21,834 unique poems**. RERUN whenever a source changes.
- [x] **Build dataset** — `data/processed/next_line.{train,val}.jsonl` = **247,038 / 9,377 examples**.
- [x] **≥10,000 unique poems confirmed** — 21,834 (target exceeded).
- [x] **Dataset card** — `data/processed/dataset_card.md` written.
- [x] **Install train deps** — done; verified **torch 2.10.0+cu128, CUDA True, RTX 5090**.
- [x] **Train QLoRA** — trained on **`unsloth/gemma-4-E4B-it`** (on-stock vLLM base),
      2500 steps, `train_loss 0.81` → `outputs/lora` (r=16). Markers auto-detected.
- [x] **Integrated into vLLM** — `scripts/vllm_serve.sh` serves base + 3 adapters
      (`cloze-reader`, `jeopardylm`, **`exquisite-corpse`**) on :1234; smoke-tested.
      UI (`ui/config.local.js`) points at it. Needs `VLLM_USE_FLASHINFER_SAMPLER=0`.
- [x] **Qualitative eval** — `train/eval_vllm.py` (base vs tuned via the live vLLM
      host, no GPU reload) → `docs/eval-e4b.md`, 12 held-out prefixes.
- [x] **Quantitative eval** (2026-07-25) — `train/eval_nll.py` measures what each
      model *expects* (vs. what it *writes*): token-level NLL of the **gold**
      held-out next lines, teacher-forced through the live vLLM host
      (`/v1/completions` echo+logprobs; `add_special_tokens: false` so the chat
      template's `<bos>` isn't doubled — verified single-`<bos>` in the echoed
      tokens). Base and adapter share one tokenizer, so both score the identical
      token sequence and the gap is purely the LoRA weights. 400 val examples /
      4,115 gold-line tokens, seed 11: base **5.5106 NLL/tok (ppl 247.3)** vs
      tuned **3.4485 (ppl 31.5)** — Δ 2.06 nats ≈ **×7.9 per-token likelihood**,
      tuned wins **98.8%** of examples. Report: `docs/eval-nll.md`; complements
      the qualitative sheet `docs/eval-e4b.md`. No GPU reload, no `data/` change.
- [x] **Pushed adapter to HF** — https://huggingface.co/milwright/exquisite-corpse-gemma-4-e4b-lora
      (public); uncommented in `../cloze-reader-monorepo/finetune/deploy/serve_gemma.sh`.
- [x] **(opt) GGUF export** (2026-07-17) — exported the **shipped** adapter
      (`outputs/lora`, the 2500-step one on HF/vLLM) to a GGUF **LoRA adapter**
      → `outputs/gguf/exquisite-corpse-lora-bf16.gguf` (gitignored, 73.4 MB, 588
      tensors) via new `deploy/export_gguf.py`. Verified with `GGUFReader`:
      `general.type=adapter`, `adapter.type=lora`, `general.architecture=gemma4`,
      **`adapter.lora.alpha=16`** (matches the trained config → byte-consistent
      with production). Reproduce: `.venv/bin/python deploy/export_gguf.py`.
      **Not** `GGUF=1 train_qlora.py`: that path `trainer.train()`s first, so it
      retrains from scratch (`--epochs 2` ≈ 28k steps) and would ship a *different*
      adapter than production. Why an *adapter* GGUF, not a merged model: the E4B
      base's projections are `Gemma4ClippableLinear` (elastic-MatFormer) — `peft`
      refuses to merge a LoRA onto that custom class, the reliable Unsloth merge
      needs exclusive GPU (held by the live vLLM host, ~3 GB free), and no
      `llama-export-lora` binary / base GGUF is on hand to merge at the GGUF level.
      llama.cpp's `convert_lora_to_gguf.py` reads the adapter safetensors and
      remaps names by string, so it converts cleanly on **CPU** with vLLM still up.
- [x] **(opt) Ollama model** — **BLOCKER RESOLVED & VERIFIED on Ollama 0.31.1
      (2026-07-19).** The 2026-07-18 block was: on Ollama **0.24.0**, gemma-4 E4B ran
      on Ollama's **native engine** (not the llama.cpp runner), which didn't implement
      LoRA `ADAPTER` layers — `ollama create` succeeded but `ollama run` died at init
      with `500 … loras are not yet implemented`. That was path (b): "upgrade past
      0.24.0". **A 0.31.1 build is now installed at `/usr/local/bin/ollama`**, and it
      runs gemma-4 through the **llama.cpp `llama-server` runner** (`--lora …`), which
      supports LoRA. Verified end-to-end, non-destructively (isolated 0.31.1 server on
      alt port 11666, own model store with base blobs copied read-only from the snap
      store, CPU-only — the production snap 0.24.0 daemon, the cloze-reader shim, and
      the GPU/vLLM were untouched): `ollama create` (exit 0) → `run`/`generate`
      **succeeds** (no "loras" error); runner logs `llama_adapter_lora_init_impl:
      loading lora adapter … general.architecture=gemma4, adapter.type=lora,
      adapter.lora.alpha=16.0` (matches the trained config); and greedy (temp 0) output
      **diverges** from the base on the same prompt (base emits nothing; tuned →
      *"clock face, dripping down to the floor. The hands were still stuck at 10:15…"*),
      proving the adapter is genuinely applied, not silently dropped. Full evidence +
      reproduction: **`docs/ollama-lora-verified.md`**.
      **Remaining is one operational (not code/data) step, left to the operator** — the
      *default-port* server is still the snap **0.24.0** build (it holds :11434, so the
      `ollama.service` systemd unit for the 0.31.1 binary is stuck auto-restarting).
      Switching the active runtime affects other Ollama consumers on this box
      (cloze-reader shim, `cpt-qwen`, gemma3 models), so it isn't done autonomously in
      a cron step: `sudo snap disable ollama && sudo systemctl restart ollama`, then
      `.venv/bin/python deploy/build_ollama_model.py --base gemma4:e4b --create`
      (adds the corpse SYSTEM prompt) → `ollama run exquisite-corpse-tuned`. Superseded
      paths: (a) merge the LoRA into a single model GGUF — no longer needed now that the
      llama.cpp runner applies the adapter directly; (c) the tuned adapter is also
      served by the multi-LoRA **vLLM** host on :1234 (`exquisite-corpse`), which the
      UIs point at — Ollama is a (now-working) convenience alternative.
      **Fixed earlier (still current):** `build_ollama_model.py` resolves the ADAPTER
      path relative to the **Modelfile's** dir via `os.path.relpath(gguf,
      Modelfile.parent)` → `../outputs/…`; `deploy/Modelfile` is gitignored (generated).
- [x] **(opt) Push private HF dataset** (2026-07-16) — **private** repo
      https://huggingface.co/datasets/milwright/exquisite-corpse-next-line
      (`next_line.{train,val}.jsonl` byte-exact, `dataset_stats.json`, and the
      card as `README.md` with viewer-config frontmatter → train/validation
      splits). Reproducible via `deploy/push_hf_dataset.sh` (idempotent, re-asserts
      private). Refreshed `data/processed/dataset_card.md` counts first — they
      were stale from before follow-up #5 (21,446→**21,744** poems,
      215,577→**228,876** train, +the 4 recovered volumes). Verified
      `private: true` + file sizes via `hf datasets info`.

## Counts (update each run)
| source | raw records | kept after clean |
|---|---|---|
| poetrydb | 2526 | 2293 |
| gutenberg volumes | 6532 | 5405 |
| gpc (padding) | 15000 | 14136 |
| **unique poems after clean** | | **21834** |
| **train / val examples** | | **247038 / 9377** |

Core (surreal/modernist) = poetrydb + gutenberg = **7698** poems; GPC is padding.

⚠ **Corpus ≠ adapter.** The shipped adapter was trained on the 2026-07-15 snapshot
(21,744 poems / 228,876 train). The corpus has both grown (follow-up #4) and been
*cleaned* since (follow-up #7 removed 733 wrapped-prose records), so
`data/processed` no longer matches the adapter's training data. Not a defect —
just don't read the current counts as the adapter's provenance. A retrain needs
the GPU, which the live vLLM host holds; it should now train on cleaner data than
the shipped adapter saw.

## Known follow-ups (cron can pick these up to improve quality)
1. ~~Recover missed volumes~~ **DONE** — `resolve_book` now searches title+author,
   paginates 3 pages, matches on last name, and supports explicit `gid`. Volume
   list expanded (Millay, Teasdale, Lawrence, McKay, Frost, Owen, Hopkins, +anthologies).
2. ~~Better segmentation~~ **DONE** — `segment_poems` falls back from 3-blank to
   2-blank split when the coarse split is too few/too-lumpy (fixes Spoon River etc.).
3. ~~Genre balance~~ **DONE** — `src.report_balance` reports the core-vs-GPC
   split (the **source family** is the genre proxy; there is no separate tag
   field). GPC is 70.7% of *poems* but, after the `--gpc-ratio 0.5` cap, only
   **33.3% of train examples** (core leads 2:1) — the cap already keeps the
   modernist core ahead, so **no rebalance needed** (and lowering it now would
   desync `data/processed` from the shipped adapter). Full table +
   per-ratio preview: `docs/genre-balance.md`. Re-run:
   `.venv/bin/python -m src.report_balance --write-md`.
4. ~~Surrealist depth~~ **DONE (2026-07-27)** — the 07-12 pass added the
   symbolist→decadent lineage but stalled on a real wall: Rimbaud, Lautréamont and
   Apollinaire are on Project Gutenberg **only in French**, so the `en`-only filter
   correctly rejects them and PD *English* translations would need Wikisource/
   Archive.org copyright vetting (out of scope). **Reframed the target instead of
   forcing that door:** surrealism's English-language ancestry is reachable, and
   Breton named it himself. Added **12 gid-pinned volumes** along his own
   genealogy — the *Anthologie de l'humour noir* canon (Poe *Complete Poetical
   Works* [10031], Carroll *Phantasmagoria* [651] + *The Hunting of the Snark*
   [13]), the nonsense line (Lear *A Book of Nonsense* [13646], *Nonsense Songs*
   [13647]), and the visionary / dream-vision line (Blake *Songs of Innocence and
   of Experience* [1934], *Poems* [574], *The Marriage of Heaven and Hell* [45315];
   Coleridge *Poems* [8208]; James Thomson *The City of Dreadful Night* [1238];
   Christina Rossetti *Goblin Market* [16950]; Yeats *The Wind Among the Reeds*
   [32233]). All 12 resolved and downloaded (**+1043 raw → 6532**); **+820 kept**
   after dedup/length/lang → **22,564 poems**, **+28,986 train → 257,862** and
   **+1,367 val → 9,661**. Verified: every volume contributed (Lear 171, Poe 165,
   Coleridge 140, Rossetti 135, Blake 99, Yeats 50, Carroll 38, Thomson 22) and a
   spot-checked Lear limerick reaches `next_line.train.jsonl` as a real pair. The
   GPC cap held on its own — core train 171,908 vs GPC 85,954 = exactly 0.5×, GPC
   still **33.3%** of train, core still leads 2:1 (`docs/genre-balance.md`
   regenerated). Method note: every entry is **gid-pinned** per #5, and the volumes
   were **dry-run segmented before the config was touched** (counts predicted the
   real run exactly), so the corpus was never the place where a bad volume got
   discovered. Config gotcha now recorded in the file's own `_comment`: elements of
   `queries` must be real query objects — the fetcher does `q['title']`, so a
   comment object in that array is a `KeyError`, not a comment.
   Still standing from the 07-12 pass — the English-PD
   **symbolist → decadent lineage** (the direct ancestors of surrealism) via the
   existing curated Gutenberg list (licensing-safe: all PG text is US public
   domain, so no new scraper / no Wikisource copyright audit): Baudelaire
   *Flowers of Evil* + *Prose and Poetry* [36098/47032], Verlaine [8426], Symons
   *Symbolist Movement* + *Silhouettes* [53849/29531], Dowson [8497], Swinburne
   *Poems and Ballads* [18726] → **761** new-lineage poems in the clean corpus
   (+727 gutenberg kept; +24.6k train examples). Rimbaud/Lautréamont/Apollinaire
   are **not achievable via Gutenberg** — Maldoror [12005], Alcools [15462] and
   Calligrammes [55569] exist there only in **French** (the `en`-only filter
   correctly rejects them); PD *English* translations would need Wikisource/
   Archive.org vetting, deferred.
5. ~~Stale miss-cache~~ **DONE (2026-07-15)** — root-caused and fixed. Two bugs
   compounded: (a) the resolver cached `None` misses permanently
   (`if key in resolve_cache` short-circuited before any retry), and (b) Gutendex's
   `search=` endpoint is intermittently flaky here (some queries hang to timeout,
   others return `count=0`), so many "misses" were **false**. Fix: a pinned `gid`
   now **bypasses the cache** and resolves via the reliable `ids=` short-circuit
   (`src/sources/gutenberg.py`), making recovery deterministic regardless of search
   flakiness. **Evidence corrects the original premise** — most listed titles are
   *genuinely absent* from Project Gutenberg: Sandburg (only *Rootabaga* children's
   prose is there), E. E. Cummings (every "Cummings" hit is *Ray* Cummings pulp SF),
   Aiken's three requested titles, and the Untermeyer/Monroe anthologies (resolve to
   different same-named authors), plus Rimbaud in English. **Recovered 4 verified,
   gid-pinned volumes (+307 poems → 21,744; +13.3k train → 228,876):** *The Book of
   American Negro Poetry* [11986] (James Weldon Johnson, ed. — flagship
   Harlem-Renaissance anthology; had *also* failed the resolver's last-name filter
   because PG lists no author for it), Aiken *The House of Dust* [1246], Untermeyer
   *Challenge* [34001], Amy Lowell *A Dome of Many-Coloured Glass* [261] — the latter
   three fulfil the config's Aiken/Untermeyer/Lowell curatorial intent whose
   *requested* titles are absent. Minor: a couple of bare title-page fragments leaked
   in (no imprint signal for `is_front_matter()`; see #6's accepted limitation).
   Left cached as misses (fast-skip, avoids the flaky search): Sandburg, Cummings,
   Rimbaud EN, Rilke *Book of Images*, the Untermeyer/Monroe/Kreymborg anthologies.
6. ~~Title-page front-matter~~ **DONE (2026-07-13)** — added `is_front_matter()`
   to `src/common.py`, wired into `src.clean` (drops at merge, so it catches every
   source and needs no network re-fetch). It flags a chunk of ≤8 non-blank lines
   carrying **≥2 distinct publisher/printer imprint signals** (imprint place /
   publisher name / bare year / street address) — high precision so real short
   all-caps poems survive (validated: Stein's *Tender Buttons*, Pound's chess poem
   kept). Removed **9** colophon/imprint records (Boni, Houghton Mifflin ×2,
   Four Seas, Egoist Press, Dutton, Riverside Press, a Lawrence bibliography, the
   Baudelaire title page): 21,446 → **21,437** poems, 215,577 → **215,533** train
   examples. Chose the clean stage over `segment_poems` because the pattern is
   source-agnostic and `_JUNK` (which keys on CONTENTS/PREFACE/etc.) can't see
   imprints. Regex note: each alternative carries its own `\b` — a group-level
   `\b(…|&\s?CO|…)\b` silently kills every `&`-prefixed alternative.
   Not addressed: bare title-page fragments with no imprint signal (e.g. "CANZONI
   / TO / OLIVIA…" dedications) are left in — erring toward keeping avoids eating
   real poems; extend the signal set later if they prove noisy.
7. ~~Prose filter is blind to wrapped prose~~ **DONE (2026-07-31)** — fixed, and
   **the rule this entry proposed turned out to be unsafe as specified.** Writing
   the red-first test it asked for is what caught that.
   *The original diagnosis (2026-07-27, found while vetting #4's volumes) stands:*
   `is_probably_prose()` fires on `avg_line_len > 78 and long_frac > 0.5`, but
   Project Gutenberg **hard-wraps its text at ~72 columns**, so PG prose
   *structurally cannot* reach that threshold. The filter caught unwrapped prose
   and missed the only kind this pipeline ingests — which is why editorial
   prefaces and critical endnotes survived as "poems" (Poe [10031] bundles essays;
   Coleridge [8208] bundles notes). Also still true: the rate was **flat** across
   the material #4 added (4.2% vs 4.4%), so **#4 did not degrade the corpus** —
   this was a standing limitation, not a drift.
   *The trap:* the proposed discriminator was line-length variance alone (relative
   stdev < 0.18 at mean > 55). Wrapped prose is uniform because the wrap column
   pins it — but **regular long meter is uniform by design, and scores even lower
   variance than the prose does.** Measured on the corpus, the variance-only rule
   would have deleted **Blake's *The Book of Thel*** (rel stdev 0.054–0.084),
   **Blake's *Holy Thursday*** (0.053), **Swinburne's *Hymn of Man*** (0.087) and
   ***Hymn to Proserpine*** (0.127) — i.e. the fourteeners and anapestic long
   lines of the visionary/symbolist material follow-up #4 had *just* added.
   *The fix:* a third condition that geometry can't supply — **verse capitalises
   the start of every line; wrapped prose breaks mid-sentence.** Measured
   separation is total: every metrically-caught verse record scores a
   lowercase-line-start fraction of **0.00**, while wrapped prose runs 0.33–1.00
   (Poe endnotes median 0.86, Coleridge notes 0.88). `is_wrapped_prose()` in
   `src/common.py` therefore requires **all three**: mean line length > 55,
   relative stdev < 0.18, and ≥30% of lines starting lowercase. `is_probably_prose`
   delegates to it, so both call sites (`src.clean`, `src.sources.gutenberg`)
   inherit the fix and **no re-fetch was needed**.
   *Before → after:* **22,564 → 21,834 poems** (−730 net; 733 caught, the
   difference is dedup interaction), **257,862 → 247,038 train**, **9,661 → 9,377
   val**. By family: gpc 517, gutenberg 214, poetrydb 2. The GPC cap held on its
   own — core train 164,692 vs GPC 82,346 = exactly 0.5×, still **33.3%** of train
   (`docs/genre-balance.md` regenerated). Top volumes cleaned are exactly the
   expected apparatus: Baudelaire *Prose and Poetry* [47032] 31 (Symons'
   introduction), Poe [10031] 30 (editorial endnotes), [841] 19, Coleridge [8208]
   6 (notes).
   *Accepted cost, recorded not buried:* the filter also removes **~95 genuine
   prose-poems** — Amy Lowell's polyphonic prose (*Can Grande's Castle* [68156],
   64), Symons' Mallarmé translations ([53849], 18), **WCW's *Kora in Hell*
   improvisations (12)** and one Stein piece. This entry originally named Kora and
   Stein as things the fix must not eat; Stein is effectively spared (1 of 263)
   and WCW keeps 216/228, but Kora's improvisations are genuinely wrapped prose
   and no structural signal separates them from Poe's endnotes (a
   critical-apparatus lexicon was tried and rejected — it scored zero on half the
   editorial prose). **Dropping them is the right trade for *this* objective:** in
   wrapped prose the line break is a typesetting artifact, not a poetic choice, so
   those pairs teach a next-line model to break mid-sentence at column 72. The
   thresholds are named constants (`_WRAP_*`) so the call is revisitable.
   *Superseded framing:* the original 4.4%/4.2% "stable background rate" figures
   came from the variance-only probe, which over-counts by including that metrical
   verse; the corrected rate is **733/22,564 = 3.2%**.
8. **Retrain on the cleaned corpus** — **OPEN, added 2026-07-31.** The shipped
   adapter was trained on the 2026-07-15 snapshot, which predates both #4's +820
   poems and #7's −733 wrapped-prose records; `data/processed` is now materially
   different (and cleaner) than what it saw. A retrain is the natural next
   milestone and would let `train/eval_nll.py` re-measure gold-line NLL against
   the current 3.4485 baseline to test whether removing wrapped prose actually
   improves next-line behaviour. **Blocked on the GPU**, which the live vLLM host
   holds at `--gpu-memory-utilization 0.90` — stopping it takes the other adapters
   (`cloze-reader`, `jeopardylm`) offline, so this is an operator decision, not an
   autonomous cron step.

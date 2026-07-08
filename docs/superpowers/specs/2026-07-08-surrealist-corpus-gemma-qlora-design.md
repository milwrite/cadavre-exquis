# Design: Surrealist next-line corpus → small-Gemma QLoRA

**Date:** 2026-07-08 · **Owner:** Zach Muhlbauer (CUNY GC)

## Purpose
Fine-tune a small Gemma to produce surreal, modernist-flavored next-line
continuations, improving the *Exquisite Corpse* game bot (an Open WebUI model
on `gemma-4-31b-it` that plays the surrealist game in one/two-word turns).

## Decisions (from brainstorming)
1. **Corpus philosophy:** aesthetic-first, public-domain-heavy. A clean, legally
   scrapable, strictly-surrealist English corpus (1910–1970) does not exist at
   10k scale — Language poetry is post-1970 and copyrighted; most 1930–1970
   verse is under copyright. So: cast a wide net over PD modernist / imagist /
   Dada / proto-Language work, keep a surrealist core, reach scale by breadth.
2. **Objective:** chat **next-line continuation** — given the poem so far,
   predict the next line — wrapped in the Gemma chat template, **loss masked to
   the assistant line** (`train_on_responses_only`). Neutral instruction, *not*
   the game's word-turn system prompt (the game's own prompt handles turn
   mechanics at deploy; mirroring risks a line-vs-word conflict).
3. **Train target:** smallest sensible Gemma **locally** on an RTX 5090. There is
   no Gemma-4 below 12B, so local default is `unsloth/gemma-3-4b-it`; the recipe
   transfers to `google/gemma-4-12B-it`, then the deployed 31B on cloud GPU.
4. **Split by poem** (95/5); GPC padding down-weighted and never in validation.

## Architecture (isolated stages, JSONL between them)
```
sources/*  ->  data/raw/*.jsonl   (one poem record per line, per source)
clean.py   ->  data/interim/poems.jsonl  (merged, deduped, filtered, id'd)
build_dataset.py -> data/processed/next_line.{train,val}.jsonl (chat examples)
train/train_qlora.py -> outputs/lora (+ optional gguf / hub push)
```
Poem record: `{source, title, author, year, lines[], meta}`; `lines` uses `""`
for stanza breaks. Cleaning adds `id` (normalized-content hash), `n_lines`,
`char_len`, `lang`.

### Sources
- **PoetryDB** (poetrydb.org) — ~2.5k PD canon poems, pre-split into lines.
- **Curated Gutenberg volumes** — modernist/imagist/proto-Language core resolved
  via the Gutendex catalog API (no hand-typed IDs), segmented into poems.
- **Gutenberg Poetry Corpus** (Parrish) — ~3M PD lines chunked into pseudo-poems
  for breadth; down-weighted, excluded from val.

### Cleaning
Strip Gutenberg boilerplate, footnote markers `[n]`, section-label lines; NFC
normalize; **preserve** punctuation, diacritics, lineation, stanza breaks.
English-or-unknown only. Keep 3–200 non-blank lines. Drop prose. Dedup on
normalized content (clean sources win over GPC).

### Example construction
For poem L1..Ln, for each non-blank target Lk (k≥1): user = instruction +
join(L1..L{k-1}) (last ≤24 lines, stanza breaks kept), assistant = Lk. Messages
stored model-agnostic; template + loss-masking applied at train time.

### Training
Unsloth `FastModel`, 4-bit QLoRA, r=16, target attn+mlp proj, gemma-3 chat
template, `train_on_responses_only`, max_seq 1024, ~2 epochs, lr 2e-4 cosine.
Optional q4_k_m GGUF export for Ollama/Open WebUI; optional private HF push.

## Risks & fallbacks
- **Unsloth × Gemma-4** (multimodal `gemma4_unified`): fast path proven on
  Gemma-3. Default to `gemma-3-4b-it`; move to `gemma-4-12B-it` once confirmed,
  else TRL+PEFT on the Gemma-4 language tower.
- **Segmentation** of some volumes is coarse (single-blank-separated volumes
  under-split). Tracked as a follow-up; does not block the pipeline.
- **Genre skew** toward general PD verse via GPC — mitigated by down-weighting
  and by reporting the core/padding ratio.

## Success criteria
≥10,000 unique poems (achieved: 19,061); a clean by-poem-split next-line dataset
Unsloth can train directly; a validated local QLoRA run producing visibly more
surreal continuations than the base on held-out prefixes.

## Out of scope
Scraping copyright-restricted sites (Poetry Foundation, poets.org); word-turn
volley data; training the 31B locally.

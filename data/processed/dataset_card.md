# Dataset card — Surrealist / modernist next-line corpus

A next-line-continuation dataset for fine-tuning a small Gemma to write
surreal, modernist-flavored verse continuations. Built for the "Exquisite
Corpse" game bot (deployed on `gemma-4-31b-it`).

## What it is
Each example is a chat pair: given the lines of a poem so far, predict the next
line. Messages are stored structurally (`role`/`content`) and are
**model-agnostic** — the chat template is applied at train time.

```json
{"messages": [
  {"role": "user", "content": "Continue the poem. ...\n\n<lines so far>"},
  {"role": "assistant", "content": "<the next line>"}],
 "meta": {"poem_id": "...", "source": "...", "k": 12}}
```

## Size (regenerate with `src/clean.py` + `src/build_dataset.py`)
- **Unique poems:** 20,722 (after dedup + English filter + length/prose filters)
- **Train examples:** 190,939 · **Val examples:** 7,290
- Split is **by poem** (95/5) — no poem's lines cross the split.

## Sources & licensing (all public-domain or openly licensed)
| source | poems | notes |
|---|---|---|
| Gutenberg curated volumes | 3,772 | Modernist/imagist/Harlem-Renaissance core: Stein *Tender Buttons* & *Geography and Plays*, Pound, Eliot (*Prufrock*, *The Waste Land*), H.D., Amy Lowell, WCW (*Kora in Hell*), Stevens *Harmonium*, D.H. Lawrence, McKay *Harlem Shadows*, Teasdale, Millay, Lindsay, Frost, Georgian Poetry, Whitman. Public domain (US pre-1929). |
| PoetryDB | 2,295 | Public-domain canon via poetrydb.org (open data). Broad; anchors clean structure. |
| Gutenberg Poetry Corpus | 14,655 | A. Parrish's ~3M-line PD corpus, chunked into pseudo-poems. Breadth/regularization; **down-weighted** (subsampled to ≤0.5× core) and **excluded from validation**. |

The **modernist/surrealist core** is PoetryDB + curated volumes (6,067 poems);
GPC provides general public-domain poetic-English breadth so the model doesn't
overfit the small core.

## Genre honesty
Strictly *surrealist* poetry is a minority — a clean, legally-scrapable,
English, strictly-surrealist 1910–1970 corpus does not exist at 10k scale.
This corpus is **modernist-broad with a surrealist / proto-Language core**
(Stein, H.D., WCW's improvisations, imagism), chosen for the associative,
image-juxtaposing *sound* the game needs.

## Known limitations
- GPC pseudo-poem boundaries are windowed, not real poem boundaries (line
  adjacency is still genuine, so next-line signal is valid).
- Some volumes under-segmented (see repo `PROGRESS.md` follow-ups).
- Not intended for redistribution as authoritative genre-labeled data.

## Provenance
Cleaning preserves original punctuation, diacritics, lineation, and stanza
breaks; strips Gutenberg boilerplate, footnote markers, and section labels;
NFC-normalizes encoding; dedups on normalized content across sources.

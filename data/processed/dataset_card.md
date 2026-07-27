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
- **Unique poems:** 22,564 (after dedup + English filter + length/prose filters)
- **Train examples:** 257,862 · **Val examples:** 9,661
- Split is **by poem** (95/5) — no poem's lines cross the split
  (21,478 poems in train, 1,086 in val).

## Sources & licensing (all public-domain or openly licensed)
| source | poems | notes |
|---|---|---|
| Gutenberg curated volumes | 5,617 | Modernist/imagist/Harlem-Renaissance core: Stein *Tender Buttons* & *Geography and Plays*, Pound, Eliot (*Prufrock*, *The Waste Land*), H.D., Amy Lowell (*A Dome of Many-Coloured Glass*), WCW (*Kora in Hell*), Stevens *Harmonium*, D.H. Lawrence, McKay *Harlem Shadows*, James Weldon Johnson (ed.) *The Book of American Negro Poetry*, Aiken *The House of Dust*, Untermeyer *Challenge*, Teasdale, Millay, Lindsay, Frost, Georgian Poetry, Whitman. Plus the **symbolist→decadent lineage** (surrealism's ancestors): Baudelaire *Flowers of Evil* & *Prose and Poetry*, Verlaine, Symons, Dowson, Swinburne — and the **English-language ancestry** Breton himself claimed: Poe, Carroll (*Phantasmagoria*, *The Hunting of the Snark*), Lear's nonsense, and the visionary/dream line (Blake, Coleridge, James Thomson *The City of Dreadful Night*, Christina Rossetti *Goblin Market*, Yeats *The Wind Among the Reeds*). Public domain (US pre-1929). |
| PoetryDB | 2,295 | Public-domain canon via poetrydb.org (open data). Broad; anchors clean structure. |
| Gutenberg Poetry Corpus | 14,652 | A. Parrish's ~3M-line PD corpus, chunked into pseudo-poems. Breadth/regularization; **down-weighted** (subsampled to ≤0.5× core) and **excluded from validation**. |

The **modernist/surrealist core** is PoetryDB + curated volumes (7,912 poems);
GPC provides general public-domain poetic-English breadth so the model doesn't
overfit the small core. After the `--gpc-ratio 0.5` cap, GPC is only **33.3% of
train examples** (85,954 of 257,862) — the core leads 2:1 and GPC never appears
in validation.

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
- **~4% of records are editorial prose** (prefaces, endnotes, critical apparatus)
  that the prose filter misses: it keys on `avg_line_len > 78`, but Project
  Gutenberg hard-wraps at ~72 columns, so wrapped prose can't trip it. Measured
  at 4.4% before this corpus grew and 4.2% in the material added on 2026-07-27
  — a stable background rate, not a drift. See `PROGRESS.md` follow-up #7.
- Not intended for redistribution as authoritative genre-labeled data.

## Provenance
Cleaning preserves original punctuation, diacritics, lineation, and stanza
breaks; strips Gutenberg boilerplate, footnote markers, and section labels;
NFC-normalizes encoding; dedups on normalized content across sources.

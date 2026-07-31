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
- **Unique poems:** 21,834 (after dedup + English filter + length/prose filters)
- **Train examples:** 247,038 · **Val examples:** 9,377
- Split is **by poem** (95/5) — no poem's lines cross the split
  (20,785 poems in train, 1,049 in val).

## Sources & licensing (all public-domain or openly licensed)
| source | poems | notes |
|---|---|---|
| Gutenberg curated volumes | 5,405 | Modernist/imagist/Harlem-Renaissance core: Stein *Tender Buttons* & *Geography and Plays*, Pound, Eliot (*Prufrock*, *The Waste Land*), H.D., Amy Lowell (*A Dome of Many-Coloured Glass*), WCW (*Kora in Hell*), Stevens *Harmonium*, D.H. Lawrence, McKay *Harlem Shadows*, James Weldon Johnson (ed.) *The Book of American Negro Poetry*, Aiken *The House of Dust*, Untermeyer *Challenge*, Teasdale, Millay, Lindsay, Frost, Georgian Poetry, Whitman. Plus the **symbolist→decadent lineage** (surrealism's ancestors): Baudelaire *Flowers of Evil* & *Prose and Poetry*, Verlaine, Symons, Dowson, Swinburne — and the **English-language ancestry** Breton himself claimed: Poe, Carroll (*Phantasmagoria*, *The Hunting of the Snark*), Lear's nonsense, and the visionary/dream line (Blake, Coleridge, James Thomson *The City of Dreadful Night*, Christina Rossetti *Goblin Market*, Yeats *The Wind Among the Reeds*). Public domain (US pre-1929). |
| PoetryDB | 2,293 | Public-domain canon via poetrydb.org (open data). Broad; anchors clean structure. |
| Gutenberg Poetry Corpus | 14,136 | A. Parrish's ~3M-line PD corpus, chunked into pseudo-poems. Breadth/regularization; **down-weighted** (subsampled to ≤0.5× core) and **excluded from validation**. |

The **modernist/surrealist core** is PoetryDB + curated volumes (7,698 poems);
GPC provides general public-domain poetic-English breadth so the model doesn't
overfit the small core. After the `--gpc-ratio 0.5` cap, GPC is only **33.3% of
train examples** (82,346 of 247,038) — the core leads 2:1 and GPC never appears
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
- **Wrapped editorial prose is now filtered** (2026-07-31, was ~4% of records).
  The old filter keyed on `avg_line_len > 78`, but Project Gutenberg hard-wraps
  at ~72 columns, so wrapped prose could never trip it; prefaces, endnotes and
  critical apparatus survived as "poems". `is_wrapped_prose` now removes **733
  records** by wrap geometry (long + uniform lines) *plus* mid-sentence line
  starts. See `PROGRESS.md` follow-up #7.
- **That filter also removes ~95 genuine prose-poems** — Amy Lowell's polyphonic
  prose (*Can Grande's Castle*, 64), Symons' Mallarmé translations (18), WCW's
  *Kora in Hell* improvisations (12), one Stein piece. This is a deliberate
  trade, not an accident: in wrapped prose the line break is a **typesetting
  artifact, not a poetic choice**, so those pairs teach a *next-line* model to
  break mid-sentence at column 72. Prose-poetry that survives (most of Stein,
  216/228 WCW) does so on higher line-length variance. Revisit by loosening
  `_WRAP_*` in `src/common.py` if you want the prose-poem register back.
- Not intended for redistribution as authoritative genre-labeled data.

## Provenance
Cleaning preserves original punctuation, diacritics, lineation, and stanza
breaks; strips Gutenberg boilerplate, footnote markers, and section labels;
NFC-normalizes encoding; dedups on normalized content across sources.

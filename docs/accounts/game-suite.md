# Integrated game suite

The production applications use the existing `cail-work-accounts` service, its
`AccountCoordinator` Durable Object, and its D1 record store. Application IDs are
`cadavre`, `jeopardy`, and `cloze`. CUNY identity comes from the existing Doorway
`WorkerIdentity` RPC with an app-specific audience and a separate workspace
audience. Model requests use the Gateway audience and existing CUNY accounting.

| Application | URL | Source baseline checked on 2026-09-08 |
| --- | --- | --- |
| Exquisite Corpse | https://cadavre.ailab-452.workers.dev/ | milwrite/cadavre-exquis, deployed accounts branch `f43a01a` |
| Jeopardy | https://jeopardy.ailab-452.workers.dev/ | milwrite/jeopardy-generator `a26e4ff`, also the latest successful Railway source |
| Cloze | https://cloze.ailab-452.workers.dev/ | milwrite/cloze-reader `f950833`, also the latest successful Railway source |

Jeopardy and Cloze releases are on `codex/cuny-game-suite`. Their main branches
still serve the legacy Railway deployments; changing those deployment targets
requires coordinated backend changes. Do not overwrite a current game with an
older fork merely because it has Cloudflare packaging.

The audit also compared zmuhls/jeopardy-lm and zmuhls/cloze-reader, and the
milwrite Jeopardy work-in-progress branch. The former Jeopardy fork lacks newer
board persistence, generation progress, and Final Jeopardy work. Cloze retains
the newer milwrite game modules and brings over the zmuhls responsive presentation
and About material. Hosted model attribution now follows the actual configuration.

## Persistence and transfer

- Jeopardy stores full boards, answers, players, scores, generation metadata,
  answered/revealed flags, and Final Jeopardy phase, wagers, clue, and results.
- Cloze stores passages, blanks, answers, level/round/score, locked blanks,
  previous attempts, hints, and displayed chat history. Saved exercise URLs resume
  the same record. Guest drafts survive the CUNY handoff in session storage.
- Updates use expected revisions. A conflict leaves the existing stored version
  intact and surfaces a save failure. Entries are scoped to the verified account
  and app; the shared library lists all registered apps.
- The old Railway Jeopardy installation at
  https://jeopardy.inference-arcade.com had one account and two boards at audit.
  `/import` verifies that old account, copies its boards to the signed-in CUNY
  account, and retains original IDs/dates in provenance. Deterministic import IDs
  make retries skip existing copies. No old credentials enter saved artifacts.
  This importer is available; the audit did not perform the user's credentialed
  import. Existing native JSON board exports can also be imported.
- The legacy dispatch Jeopardy D1 database had no user or board tables. It remains
  untouched. Do not infer that missing tables mean the Railway data is absent.
- Cloze retains the Railway dataset/Redis service at
  https://reader.inference-arcade.com. Its 10 leaderboard rows remain available.
  The legacy dispatch D1 binding is retained: zero leaderboard rows and four rows
  each in passage and word analytics at audit. The new leaderboard merges those
  legacy rows with Railway results. Anonymous analytics have no verified CUNY
  owner and are not assigned to an account. Prior ephemeral browser exercises
  cannot be reconstructed from anonymous aggregate analytics. New account JSON
  exercise exports can be imported through the Import control.
- No old database, volume, namespace, or dispatch Worker was removed.

## Model configuration

Cloze's Worker `CLOZE_MODEL` variable controls its hosted model and `/api/config`
attribution. Jeopardy's hosted default is explicit in `src/openRouterModels.ts`.
Both currently select `@cf/google/gemma-4-26b-a4b-it` through the CUNY Gateway.
This is a base model, not the custom local Gemma-4-E4B LoRA. Local adapter support
remains in the source. Hosted Cloze starts directly in an exercise after reusing
CUNY SSO; it does not silently fall back to Gemma 3. Cadavre retains its existing
Workers AI DeepSeek configuration.

## Verification

Each game runs its own build/check and persistence tests. The shared boundary
test runs the actual game Workers, shared accounts Worker, D1, and Durable Object:

```sh
cd accounts
npm run build
node test/game-suite-boundary.mjs
```

By default it expects sibling checkouts `jeopardy-games-suite` and
`cloze-games-suite` under the parent workspace; `GAME_SUITE_ROOT` can override
that directory. Only CUNY signing, Admission, and rate limiting are test doubles.
It verifies record readback, account/app isolation, revision conflicts, forged
header stripping, anonymous/CSRF rejection, and combined dashboard resume links.
These local checks do not by themselves establish live SSO or model behavior.

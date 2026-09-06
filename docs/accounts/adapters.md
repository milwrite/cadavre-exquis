> Current scope: only integrated Workers under ailab-452.workers.dev appear in My work. Cadavre is the sole pilot. The repository comparisons below are prior research, not a directory or a promise to connect these products.

# Application adapters and release units

The pilot uses one shared `cail-work-accounts` Worker, one SQLite-backed AccountCoordinator per verified CAIL subject, and D1 as the record authority. App-specific WorkerEntrypoints constrain application access; the hub aggregates only the signed-in person's records. None of the browser adapters handles JWTs or supplies an account subject.

| Workflow | Source and integration seam | Shared record |
| --- | --- | --- |
| Cadavre pilot | `worker/src/signed-in.ts` authenticates `/cadavre/`; `assets/account-work.js` saves both existing play surfaces | `app: cadavre`, `kind: poem`; attributed contributions, edited poem, reading, prompt/model/settings, surface and closed state |
| Jeopardy next | `milwrite/jeopardy-generator`, currently checked out locally as `jeopardy-lm`; generated/manual board create and revision update handlers documented in `docs/backend-storage.md` | `app: jeopardy`, `kind: board`; `record.boardData` from `board_data`, source/generation metadata in `record`; topics and prompts in user contributions; generated material labeled assistant |
| Cloze next | `milwrite/cloze-reader`, `src/conversationManager.js` and `src/analyticsService.js` | `app: cloze`, `kind: exercise`; passage/book provenance, level/round, per-blank context, user attempts/questions, assistant hints, completion summary in `record` |

## Identity module

Doorway routes `/cadavre` with `cail:cadavre` and `/my-work` with `cail:work-accounts`. Both receive a separate same-subject `cail:gateway` leg. Verification uses Identity 5.2.5, the pinned public JWKS, exact scalar audience, issuer, expiry and current Admission membership. Public signing-key rotation requires refreshing the pinned keyset on both receiver Workers before the old key is retired. No OIDC callback or client registration changes.

Future runtime adapters must add their exact Doorway routes and private generic `WorkerAccounts` binding with their own deployment-controlled props in a separate reviewed release. Their existing live accounts and data are not implicitly linked by browser IDs, usernames or emails.

## Work repository module

API mount: `/api/work` at the generic WorkerAccounts entrypoint; `/my-work/api` at the hub. Create with a browser-generated UUID v4, `expectedRevision: 0`, and structured content schema 1. Updates, pins and deletes require the last returned revision. A 409 requires reopening; do not overwrite silently. Save calls are serialized per subject and committed as D1 batches with the event and account revision. The archive paginates without deleting older items. Private pinning is distinct from any public game wall or leaderboard.

The hub returns five unpinned recent entries per app and a separate private pin list. Archive summaries page in groups of 20. Entry detail returns the latest 20 revision events. The current schema stores current content, with revision-event metadata; it does not claim to restore historical snapshots. Account export is limited to 1,000 entries/8 MB of content per download; individual archive items remain exportable.

## Model provenance and retired reflection feature

Trusted application adapters can still record the actual model used with `beginModel` and `modelCompleted`; account deletion invalidates late completions. This is provenance, not a model-generation feature in My work. At the user's request, the reflection component, endpoint, generator methods, profile/dashboard fields and Gateway binding are removed. Historical rows are inert and retained; normal account deletion still cascades them.

Use [the integration guide](integrate-an-application.md) to add a registered application and exact-audience adapter. The shared library supports all-app browsing, pin filters and title search without app-specific panels.

## Jeopardy workflow

The maintained repository already stores `name`, `board_data`, `source`, `ai_provider`, `ai_model`, `metadata`, and `schema_version`, and requires `expected_revision` for edits. Map existing successful generation/edit results to a shared entry, retaining its board shape and provenance. Add a shared UUID separately from legacy board IDs, then reopen through the original board parser. Test categories, clues, answers, final-round material, metadata and stale edits against two CUNY users. Do not switch its production store until this readback and game-resume path passes. No legacy account migration is included.

## Cloze workflow

The active chat service tracks context and question types per blank in memory: source sentence and passage, title/author/year, word position, difficulty, previous attempts, user questions and hint level. The analytics completion payload records passage, level/round, words, hints, completion result and time. Save one exercise per passage/round with attributed questions and hints; serialize Maps/Sets to ordinary arrays/objects before saving. Keep target-word state in the exercise's own schema so resuming the reading interface preserves blank behavior. Do not substitute browser analytics `sessionId` for verified account identity. Public leaderboard and existing analytics retention remain separate.

## Validation modules

1. `accounts`: `npm run check`, `npm run build`, `npm test` use actual workerd, D1 and DO for authorization, two-user isolation, app scope, revisions, archive/pins, settings, export/deletion, model provenance and deletion races.
2. `worker`: `npm run check`, `npm test`, dry deployment bundle.
3. Cross-repository caller/receiver: from `accounts`, `DOORWAY_SOURCE=/path/to/reviewed/cail-doorway node test/doorway-boundary.mjs`. Uses actual Doorway request/session code, actual product Workers and local D1/DO, with a local signing key and Admission/provider doubles. A Node Request shim only supplies Workers' streamed-body constructor behavior.
4. `test/browser-local.ts`: local-only caller, actual product Workers/D1/DO and fixture model. Native browser evidence is local acceptance, not a CUNY callback or deployed inference check. Never deploy this caller.
5. Production acceptance requires the reviewed Doorway release, actual CUNY login/Admission, a real Cadavre model turn, saved-work/settings readback after reload and reopen checks. Source, deployment and live verification are separate states.

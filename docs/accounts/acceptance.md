# Current Worker-origin acceptance

The current destination is `https://cadavre.ailab-452.workers.dev/`, including My work. The existing Tools My work route is kept. Live CUNY handoff, existing-work readback, private pin/reload/unpin, saved-content resume, public model inference, preserved wall ownership and browser wall-permission transfer have passed. See [the complete move receipts](worker-move.md). The model-reflection feature is removed.

Everything below is historical pilot evidence and prior pending states, superseded by the current move record.

## Worker registration correction — 2026-09-06

User scope: integrated Workers in `ailab-452.workers.dev` only; no fixed/planned application list and no model reflection. Cadavre supplies its own manifest through a deployment-controlled generic `WorkerAccounts` service binding. D1 stores discovered registrations. New Workers need an owning integration and registration readback, not dashboard source changes.

Owner: primary agent. User action: open a connected Worker and resume its saved artifact. Receivers: account service then Cadavre caller. Migration 0003 creates an empty registration table; the existing pilot's owning binding manifest is bootstrapped before receiver promotion so its old serving caller can still create records. Caller health then performs real RPC registration. Compatibility receiver is removed after binding readback.

Validation: 11 real workerd/D1/DO tests, including a previously unknown Worker registering through actual service-binding props; wrong audience/app, missing/unsafe props, conflicting/old manifests and retained orphan records. All 13 Cadavre tests and both type/build checks passed. The actual Doorway → Cadavre → account boundary now includes real Cloudflare static assets and catches mount/query loss on clean-URL redirects, plus the stable Worker play route. Identity issuer, Admission and model are local doubles; one model call. Independent reviewer reran the account suite and this boundary successfully. Deployment readback: migration 0003 applied. The sole Cadavre registration was copied from its owning Worker configuration before receiver promotion. Account receiver 84a750da-baeb-46a6-8236-890ab655ba17 and Cadavre cc6bedd6-7c3d-4be6-842f-e6d6c7c523f5 serve source ffd5259 at 100%. Caller binding reads back cail-work-accounts#WorkerAccounts. Public Worker health returned 200 / ok:true / release:ffd5259 after awaiting actual registration RPC. Final account receiver f94c9f62-0ba2-4cf3-a74e-983431f4947a serves source e2e2da1 at 100%; compatibility export is removed. Cadavre health again confirmed its actual registration against that receiver. Live Firefox showed only Cadavre and its ailab-452.workers.dev origin. Save/reopen acceptance remains in progress while the browser is in use.

# Account pilot acceptance — 2026-09-06

## Current scope update

The user refined My work into a quiet, tool-agnostic CUNY AI Lab workspace, with Cadavre as the pilot and a reusable new-application integration contract. They explicitly removed the model-reflection feature. Reflection evidence below describes the previous implementation and is not an active feature or remaining acceptance requirement. Current validation: 10 account/D1/DO tests, including populated catalog migration and scoped all-app search, pass; 13 Cadavre tests pass. Updated actual Doorway→Cadavre→account boundary passes with one model call and a404 from the retired reflection endpoint. Independent review found no security or migration defect. UI/live release checks for this refinement are recorded below when complete.

## Previous pilot evidence

Owner: Zach Muhlbauer. Requested outcome: CUNY sign-in, private Cadavre save/resume and dashboard, retained archive and pins, settings readback, and a reflection using the latest completed model. Older Inference Arcade accounts and Railway services remain untouched.

## Source and independent review

- Account service: source `dbddac1`; Cadavre receiver/browser adapter: source `c40b1ba`.
- Doorway PR [127](https://github.com/CUNY-AI-Lab/cail-doorway/pull/127): merged as `00849b797cbeb9ce40d46276af9ef57cbbd8bfb0`.
- Cadavre PR [5](https://github.com/milwrite/cadavre-exquis/pull/5): release/evidence work remains in the reviewed branch until live acceptance finishes.
- Independent agent review found and verified corrections to signed URL endpoint overrides, exact stanza preservation, saved-prompt accumulation, model-catalog substitution, regeneration context and hydration ordering. Final source review passed. The owner reran relevant regression paths afterward.

## Local evidence

- 8 actual workerd/D1/DO account tests: auth/Admission/origin checks, subject/app isolation, atomic revision conflicts, recent/archive/pins, settings, exports and cascaded deletion, latest-model reflection/failure recovery, late completions after deletion, and scoped entrypoints.
- 13 Worker tests plus typecheck and dry bundle passed. Two regressions cover signed endpoint override/configuration failure and copied-message/immutable edited-poem context.
- Actual Doorway session/minting/forwarding → actual Cadavre receiver → actual account Worker/D1/DO: model completion, save, hub readback and reflection passed with exactly two model calls.
- Native Chrome: private save, settings after reload, reflection, pin, reopen/continue to revision 3, phone-width rendering. Additional regression: indentation, repeated spaces, blank/trailing lines survived edited-poem resume/continue/save; unlisted `test/unlisted` model stayed selected after a delayed catalog; `?endpoint=https://attacker.invalid/chat` was ignored; delayed/missing saved-work loading left play disabled. Inspected final pages produced no new warnings/errors.
- Substituted components: local signing keys, Admission replies and deterministic model responses. These local checks are not CUNY callback or production inference evidence.

## Deployed receiver evidence

- D1 `cail-work-accounts`: `46735c0b-e986-4cce-a13d-1e81008c939e`; migration `0001_accounts.sql` applied remotely. Tables `accounts`, `entries`, `entry_events`, `model_runs`, `reflections` read back from the primary.
- Private account Worker: `e2d0c030-c736-4995-a1d2-fe85babf0e86` at 100%, source `dbddac1`, migration `accounts-v1`.
- AccountCoordinator namespace `dae0fd009a144b75997d6276494bd451`; named `CadavreAccounts`, `JeopardyAccounts`, `ClozeAccounts` expose fetch/beginModel/modelCompleted. D1, AdmissionResolver and Gateway bindings read back. No public account Worker route.
- Cadavre Worker: `ff69068e-ae51-4293-89b3-5fc8a2294ee3` at 100%, source `c40b1ba`. Health reports that source; direct unsigned `/cadavre/api/work/profile` returns the canonical 401 sign-in error.
- Doorway PR verification run `34020356566` passed. Main verification passed on retry in run `34021219515`; the initial attempt hit an existing five-second MCP test timeout. Main `00849b7` deployed as version `739799be-587b-4c2e-b539-ab5523b266a7` at 100%, with the exact Cadavre and account bindings read back. Both mounted account APIs return canonical anonymous 401 responses.
- That release stopped at readback because its exhaustive binding list omitted the two newly added services. Follow-up [Doorway PR 128](https://github.com/CUNY-AI-Lab/cail-doorway/pull/128) adds both exact binding checks and mounted-auth probes. Full local checks and independent review passed; updated binding predicates passed against the real serving version. PR verification run `34021621751` passed; merged as `fa99418e6b07642b42d5affb3d8e6aa0f20ea1f6`. Main run `34021743002` passed verification, deployed version `6db27d4e-6933-4508-b075-8dc7c5cb67c6` at 100%, and passed serving-version/binding readback. The subsequent broad probe failed on the pre-existing PDF Accessibility readiness 503, so the whole workflow is not green.

## Live acceptance still pending

The real Chrome tab is at CUNY Login awaiting the user; no credentials were collected or entered by the agent. Actual CUNY sign-in and active Admission, deployed Cadavre generation, save/reload/settings readback, private pin/reopen, and most-recent-model reflection. The account rollout is not yet accepted live.

The existing PDF Accessibility readiness endpoint returned 503 before this release; Doorway's previous main release also failed its broad post-deploy check on that exact endpoint. Keep that unrelated failure visible and separate from account behavior; do not weaken the workflow probe.

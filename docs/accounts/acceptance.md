# Account pilot acceptance — 2026-09-06

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

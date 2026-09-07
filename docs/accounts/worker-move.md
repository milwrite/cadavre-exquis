# Cadavre Worker move

The replacement is `https://cadavre.ailab-452.workers.dev/`. It includes the public game, private CUNY saves, and My work. The existing Tools My work route is retained. The user explicitly requested removal of Tools `/cadavre/` after verifying the replacement, and retirement of the old cail-cadavre frontend. Legacy Inference Arcade accounts remain separate.

The replacement first binds the existing CadavreStore namespace externally; it must not create a fresh wall. Keep `idFromName("cadavre")` and the `cadavre` D1 app ID. Worker ownership in the registry is immutable through runtime registration: renaming requires an explicit deployment migration updating that existing row and incrementing its manifest version. Existing account D1 and AccountCoordinator namespaces remain in place.

Release in order: reviewed Doorway WorkerIdentity and separate session store; account receiver with Worker-origin manifest support; new Cadavre caller bound to the existing wall; real CUNY handoff and save/reload/resume checks; class-ownership transfer following Cloudflare's expecting-transfer/ transferred declarations and namespace readbacks; retire old frontend and remove Tools Cadavre routes. Preserve browser-local public-wall editing tokens through an explicit browser transfer before retiring access to the old origin.

Local tests distinguish synthetic CUNY/Admission/model fixtures from live acceptance. A successful build or health check alone does not establish a real CUNY callback or saved-work flow.

## Verified replacement

- Public Cadavre Worker: `eaed2956-0ec4-4516-9d62-7aa1e2fccb34`; new-origin application, Solo play, configuration, model catalog and health returned successfully.
- Actual Workers AI completion returned from `@cf/deepseek-ai/deepseek-v4-flash-0731` on the new origin. Browser Solo play reached ready.
- CadavreStore namespace `0e088e1efe1c4b059867b5f0dd2e8caa` transferred from the old Worker to `cadavre`. Readback verified direct ownership and the same namespace; both wall snapshots matched the pre-move snapshot (SHA256 `b6b1304acd9bb9f95e8328fe1f2b9af57500a8e3c5fd7385f0881b9f14d46ed9`).
- D1 `cail-work-accounts` remains `46735c0b-e986-4cce-a13d-1e81008c939e`; AccountCoordinator remains `dae0fd009a144b75997d6276494bd451`. The existing `cadavre` registration is now Worker `cadavre`, version 2, with root and `/play/` routes. No work entries were moved or deleted.
- Firefox’s existing CUNY session completed the real new-origin handoff, opened My work, read an existing saved conversation, persisted a private pin across reload, restored its unpinned state, and resumed the original content in Solo play. No user text was edited; pin/unpin advanced revision metadata.
- Firefox browser transfer completed via the explicit old-address button and exact-origin popup handoff. The new page confirmed imported wall edits; old browser storage remains available.
- The old frontend is retired as `c1955573-91af-407f-b12a-759b8a5891e3`: moved-address help only, old game APIs 410, no wall namespace binding. It retains no ownership of CadavreStore.
- Doorway PRs 131 and 133 added and fixed the private handoff. Both main release workflows completed successfully. Actual entrypoint tests cover cold RPC initialization before HTTP OAuth setup and concurrent grants. Retirement PR132 preserves the Tools My work route while removing Cadavre.

Local regression evidence: 11 account workerd/D1/DO tests, 18 Worker tests, actual Worker-origin caller/account boundary, nine Doorway session-store security tests (141 assertions), two actual WorkerIdentity entrypoint tests (22 assertions), and the full Doorway check. Signing, Admission and model fixtures in these local tests are not production evidence; the live checks above are recorded separately.

## Tools Cadavre retired

Doorway PR132 merged as `20e6ed57fa2b2849724c41cf3503e627bab1e1f1`; both verification and deployment completed successfully in run 34070863158. Serving version `72f6f543-36a7-470d-a691-da0ba89b5ba9` was read back at 100% with no CADAVRE binding and the WORK_ACCOUNTS binding retained. Live `/cadavre`, `/cadavre/`, `/cadavre/api/work/profile` and `/launch/cadavre` return 404. Tools `/my-work/` still opens its sign-in boundary (302); its anonymous account API returns 401 and Doorway health returns 200.

The browser transfer was additionally verified on the new wall: existing poems show their rename/edit/unpin controls. The separate QA Firefox window was minimized to return the user's original document window.

## Old Worker deleted at user request

After the completed replacement and browser transfer checks, the user explicitly requested removal of `cail-cadavre`. Wrangler confirmed successful deletion of that Worker. The temporary moved-address notice is no longer hosted. The retired deployment configuration has been removed so routine releases cannot recreate it. The canonical `cadavre` Worker, its transferred CadavreStore namespace, account D1/DO storage and both My work entry points are retained.

Post-deletion readback: Cloudflare reports the old Worker does not exist (10007), and its public root returns 404. New Worker health and wall return 200; new-origin and Tools My work retain their expected anonymous sign-in redirects (302). Tools Cadavre remains 404.

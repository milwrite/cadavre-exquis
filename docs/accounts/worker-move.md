# Cadavre Worker move

The replacement is `https://cadavre.ailab-452.workers.dev/`. It includes the public game, private CUNY saves, and My work. The existing Tools My work route is retained. The user explicitly requested removal of Tools `/cadavre/` after verifying the replacement, and retirement of the old cail-cadavre frontend. Legacy Inference Arcade accounts remain separate.

The replacement first binds the existing CadavreStore namespace externally; it must not create a fresh wall. Keep `idFromName("cadavre")` and the `cadavre` D1 app ID. Worker ownership in the registry is immutable through runtime registration: renaming requires an explicit deployment migration updating that existing row and incrementing its manifest version. Existing account D1 and AccountCoordinator namespaces remain in place.

Release in order: reviewed Doorway WorkerIdentity and separate session store; account receiver with Worker-origin manifest support; new Cadavre caller bound to the existing wall; real CUNY handoff and save/reload/resume checks; class-ownership transfer following Cloudflare's expecting-transfer/ transferred declarations and namespace readbacks; retire old frontend and remove Tools Cadavre routes. Preserve browser-local public-wall editing tokens through an explicit browser transfer before retiring access to the old origin.

Local tests distinguish synthetic CUNY/Admission/model fixtures from live acceptance. A successful build or health check alone does not establish a real CUNY callback or saved-work flow.

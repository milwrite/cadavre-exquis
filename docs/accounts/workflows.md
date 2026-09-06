# Shared CAIL accounts pilot

Owner: Zach Muhlbauer; implementation coordinated in this task. User action: sign in through CUNY, work in Cadavre, return to a private dashboard across reloads and devices, reopen and pin work, verify settings, and access shared preferences.

## Decisions

- CAIL/CUNY sign-in only. Doorway owns OIDC and its HttpOnly session; Admission owns active membership. This service does not collect passwords, raw provider identifiers, or email.
- Start fresh. Existing Inference Arcade accounts and records are left in place; no migration or linking in this pilot.
- Show five recent unpinned items **per app**. Older work stays in a paged archive. Private pins remain separate from publishing on Cadavre's public wall.
- One AccountCoordinator Durable Object per verified opaque subject; a shared D1 database is the durable record authority. Atomic D1 batches and optimistic revisions protect writes. Subjects and identity legs never enter browser data.
- The user removed the model-reflection feature. There is no reflection component, generation endpoint or Gateway binding in My work. Existing historical rows are inert and are preserved rather than silently deleted.

## Modular workflows

1. **Identity and account setup.** Exact-audience CAIL Identity verification, current Admission resolver check, first-visit profile, settings revisions, export and deletion of this service's data. Caller/receiver: Doorway → account hub and Cadavre → account service. Gateway leg verified separately and subject-matched.
2. **D1 work repository.** App-scoped entries, structured contributions, related records, optimistic revisions, private pins, paged archive. No global user coordination bottleneck. Future adapters use the generic WorkerAccounts entrypoint with trusted binding props and cannot choose another account.
3. **Cadavre and dashboard.** Public preview links to CUNY sign-in. Authenticated `/cadavre/` and `/my-work/` share Doorway's session. Solo and parlor saves preserve author roles, model and settings; reopen/edit/export from My work. Saving never publishes on the wall.
4. **Application integration.** Each integrated ailab-452.workers.dev Worker registers its deployment-owned manifest in D1; trusted binding props supply its exact audience and app scope. There is no fixed or planned application list. The tool-agnostic schema, library and dashboard need no app-specific UI rewrite. See [integrate-an-application.md](integrate-an-application.md).
5. **Jeopardy and Cloze adapters.** `milwrite/jeopardy-generator` (local `jeopardy-lm`, latest remote push 2026-09-02) is newer than `zmuhls/jeopardy-lm` (2026-04-17). Cloze source is `milwrite/cloze-reader` (2026-07-09), distinct from the Quimbot paper repository. Exercise both schema adapters against the same real local account service; keep their live runtime migrations separate from the Cadavre test case.

## Source reconciliation at implementation start

Cadavre Worker serving `/health` reports release `7d96fd7`; Cloudflare serving version `5ce54af9-3ad0-4a12-9cc6-1547e39cd874`. Work starts from that source in an isolated worktree. Existing uncommitted readiness changes stay in the original checkout.

Inference Arcade Railway project `1cc0c2e2-8d24-4892-9dbd-8017527db591`, environment `42723200-0c0f-4eff-bcdc-a769c9ffc856`, service `10cca17e-5ca6-4570-b9a8-1cd58503ab8e`: deployment `3b9e6f80-c6d7-44cc-833f-d792b1b6841a` SUCCESS at source `711e0483`. Signed-out auth API returns 401. These reads do not prove authenticated behavior. Railway is unchanged.

Remote CUNY-AI-Lab/cail-knowledge-base `f3ffbacc` supplies current Tool Integration Contract and Shared Primitives. Doorway base is remote main `48f995f2`. Identity 5.2.5. These verified current sources supersede older local notes describing different deployment states.

Current deployment and acceptance evidence is maintained in [acceptance.md](acceptance.md).

## Deployment order and acceptance

D1 schema → account service with the generic WorkerAccounts entrypoint with trusted binding props → Cadavre receiver → Doorway ingress via its PR/main release path. Verify each receiver before enabling the caller. No OIDC client or callback changes are needed.

Required evidence: real local Worker/D1/DO integration with two identities, concurrent/stale edits, app/subject isolation, archive and pin semantics, settings readback, deletion/export, registered-app validation and all-app library search; rendered Cadavre → dashboard → reopen flow. Real CUNY login, active Admission, deployed cross-service inference, and reload persistence are separate live acceptance boundaries. Local test issuers and provider doubles must be identified. Pending live verification keeps the rollout incomplete.

## Independent review and source regressions

An independently authorized review agent examined both source trees and reran account and caller/receiver checks. It held release for signed URL endpoint overrides, loss of poem whitespace, accumulated prompt context, silent catalog model substitution, regeneration context, and early enabling before saved-work hydration. These are corrected: signed connection configuration fails closed, authenticated assets enforce same-origin connections, exact line text is retained, inference context is request-only for both continuation/regeneration, the selected model is preserved, and hydration finishes before play is enabled. The reviewer passed the final source changes.

The owner reran the 13 Worker tests, 8 account tests and actual caller/receiver test. Browser regression evidence includes a deliberately unlisted model, an ignored endpoint-override URL, a delayed catalog, exact multiline continuation/readback, and a delayed missing-item load that kept play disabled before and after failure. Local identity/Admission/model doubles remain explicit; these are not live CUNY claims.

## Workspace refinement

The shared dashboard follows the current CUNY AI Lab Administration navy, teal and pale-blue palette, including its `cail-desk-theme` preference. Quieter type and text actions replace large calls to action. My work, Library, Applications and Settings share one shell, with verified Lab access, Model Access, Administration, Model Registry and Lab website links. Administrator access stays enforced by the destination. Recent work spans applications, filters by app, and keeps five unpinned items per app; pins and older items remain in the searchable library. Planned integrations have no unverified Open link.

Migration0002 preserves the populated account/entry/event/model/history graph while removing database app enums. D1 registration and trusted binding props continue to reject unknown apps and cross-app access. The migration is tested against a populated real D1 database, including exact readback, foreign-key checks and cascades.

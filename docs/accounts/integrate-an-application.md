# Connect an application to My work

My work is a shared private library, not a game-specific backend. Cadavre is the first live adapter. The interface discovers names, entry kinds and safe resume links from `accounts/src/applications.ts`; it does not maintain separate per-game UI branches. New applications can store conversations, documents, exercises, boards or other JSON artifacts using the same entry envelope.

## Register and scope

Add one definition to `APPLICATIONS`: stable lowercase ID, display name, description, record kind, category, canonical launch URL, optional resume path, and connection state. These URLs are code-owned; never take them from stored content or query parameters. A planned application has no launch/resume link until verified.

Export a named class extending `AppAccounts` in `accounts/src/index.ts`, with its constant app ID. Bind the application Worker to this exact named entrypoint. Add its exact route and audience in Doorway through Doorway's reviewed PR/main release path. A browser cannot select another app's adapter or account. The service verifies the exact app audience and current Admission on every request, and names the AccountCoordinator from the verified subject.

After migration 0002, adding an app does not require a database enum migration. Unregistered applications and incorrect entry kinds remain rejected by code, and scoped adapters cannot read/write/export another application's work. The account hub can aggregate only its authenticated owner's registered apps. Do not expose a generic caller-selected subject or a raw Durable Object ID.

## Save and reopen

Forward the browser's same-origin save request server-side to the named account entrypoint at `/api/work/entries`, with Doorway's app identity header. Preserve Origin validation. Keep identity legs, secrets and raw CUNY identity out of the browser and saved records.

Use the same UUID v4 on every update. The envelope is:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "app": "registered-app-id",
  "kind": "registered-record-kind",
  "title": "A descriptive title",
  "expectedRevision": 0,
  "content": {
    "schemaVersion": 1,
    "contributions": [{"role": "user", "content": "An attributed contribution"}],
    "text": "Readable artifact text",
    "reading": "Optional notes",
    "settings": {},
    "record": {}
  }
}
```

Put app-specific structured state in `record`; serialize Maps/Sets to JSON arrays or objects. Preserve author roles and the actual model ID on assistant contributions. Credentials and identity metadata are rejected. Limits remain 200 KB request JSON, 192 KB stored content, 300 contributions and bounded nested records.

A create returns revision 1. Each update, pin or delete must send the last returned revision. On 409, reopen or offer an explicit reconciliation; never overwrite silently. Serialize browser saves, wait for the final save before navigating to My work, and keep play disabled while hydrating an existing artifact. Resume links receive only `?work=<uuid>`; the app must fetch that item through its scoped adapter and restore its own schema before enabling interaction.

The library supports `app=all`, a registered app, pin filtering, title search and 20-item pages. The overview shows five recent unpinned items per app and private pins. Older work is retained. Account export is bounded to 1,000 entries/8 MB; individual entries remain exportable.

## Optional model provenance

Before a successful inference path, `beginModel(appJwt)` returns an account generation. After completion, `modelCompleted(appJwt, actualModel, entryId, generation)` records the actual model used. This is provenance only: My work has no reflection component or generation endpoint. Account deletion invalidates late model completions. The app owns its Gateway call and exact model policy.

## Acceptance workflow

1. Exercise the actual caller, receiver, D1 and Durable Object using two synthetic identities: create/update, concurrent revision conflict, own-app resume, other-user/app denial, pin/archive/search, settings, export and deletion.
2. Verify the app can restore the exact artifact after reload, including formatting and app-specific state. Confirm unsaved or unavailable work cannot be silently discarded.
3. Have an independent reviewer inspect the diff and evidence, identifying local identity/Admission/model doubles.
4. Deploy the receiver before its caller; read back the exact version and bindings. Finish with real CUNY sign-in, current Admission, one application save and dashboard/reload/resume checks before marking that application connected.

App registration does not migrate legacy accounts, import other apps' records, grant administrator access, or federate unrelated databases automatically.

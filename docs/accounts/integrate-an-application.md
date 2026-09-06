# Connect a CAIL Worker to My work

My work stores private recent work and artifacts for integrated Workers under `ailab-452.workers.dev`. Each Worker owns its routes and record schema. The shared dashboard contains no application list, planned products, or application-specific launch paths. D1 `registered_workers` supplies the directory, filters, entry kinds and reopen links. Cadavre is the pilot; other Workers appear only after enrollment.

## Register the Worker

In the owning Worker's deployment configuration, bind to the generic `WorkerAccounts` entrypoint and supply deployment-controlled props:

```json
{
  "binding": "WORK_ACCOUNTS",
  "service": "cail-work-accounts",
  "entrypoint": "WorkerAccounts",
  "props": {
    "id": "your-worker-app",
    "worker": "your-worker-name",
    "version": 1,
    "name": "Your application",
    "description": "A short description of what people can save.",
    "kind": "artifact",
    "href": "/your-worker-app/",
    "resumePath": "/your-worker-app/play/"
  }
}
```

The Worker origin is derived as `https://<worker>.ailab-452.workers.dev`; arbitrary external origins are not accepted. `href` and `resumePath` are the canonical CUNY-authenticated mounts for that Worker. Doorway must already route that exact mount and issue its exact `cail:<id>` audience. No directory registration grants a Doorway route, membership or administrator privileges.

Call `await env.WORK_ACCOUNTS.register()` during the Worker's integration/readiness check after deploying it. Registration takes no browser metadata or arguments: it reads Cloudflare service-binding `ctx.props`, persists the manifest in D1, and returns its registered ID/version. Verify the directory and actual launch/resume URLs as part of that deployment. Cadavre invokes registration on its existing health check and authenticated requests. Account operations also ensure registration. No shared-service source change or additional database migration is needed to enroll another Worker.

Keep the ID, Worker name and record kind stable. Increment `version` when names or routes change. Registration is idempotent; older serving versions cannot overwrite newer metadata. Reusing a version with different metadata, claiming an existing ID/Worker, or changing its kind is rejected. Only deployers trusted to configure these service bindings can register; browser HTTP requests cannot register or choose their scope. Missing props fail closed.

The generic receiver derives its exact audience from those trusted props, verifies the Doorway JWT and current Admission, and names the per-account Durable Object from the verified opaque subject. Saved content never selects identity or another Worker's adapter. Registering a Worker does not import its existing D1/R2/DO data automatically: the owning adapter explicitly writes the bounded shared envelope or related record. Retired registrations do not erase history; existing work remains readable, editable and exportable without a launch link.

Cloudflare reference: [service-binding props](https://developers.cloudflare.com/workers/runtime-apis/context/#props). CAIL authority: [Tool Integration Contract](https://github.com/CUNY-AI-Lab/cail-knowledge-base/blob/main/05%20Infrastructure/CAIL%20Tool%20Integration%20Contract.md).

## Save and reopen

Forward the browser's same-origin save request server-side to the generic WorkerAccounts entrypoint at `/api/work/entries`, with Doorway's app identity header. Preserve Origin validation. Keep identity legs, secrets and raw CUNY identity out of the browser and saved records.

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

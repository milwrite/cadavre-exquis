# Cadavre on Cloudflare Workers

The canonical application is [cadavre.ailab-452.workers.dev](https://cadavre.ailab-452.workers.dev/). The Worker owns the parlor, Solo play at `/play/`, the public wall, CUNY sign-in handoff, and `/my-work/`. My work also remains available at the existing Tools address.

Anonymous play uses the lab’s Workers AI binding. Signed-in play uses the CAIL Gateway with server-held, exact-audience identity assertions. Private work is stored by the shared `cail-work-accounts` service in D1 with a per-account Durable Object. No browser credentials or identity assertions enter saved content.

The public wall remains in the original CadavreStore namespace, now owned by `cadavre`. Its object name is still `cadavre`. The old `cail-cadavre` Worker was deleted after the replacement and browser wall-permission transfer were verified. Do not delete the canonical Worker or its Durable Object namespace to rename or redeploy it.

## Development and release

```bash
cd worker
npm install
npm run check
npm test
npm run dev
npm run deploy
```

`wrangler.jsonc` is the canonical configuration. It pins the CUNY AI Lab account, the `cadavre` name, the preserved CadavreStore namespace and exact service bindings. Real CUNY sign-in requires the deployed Worker origin; local boundary tests use explicit signing, Admission and model fixtures.

## Integration

- `src/worker-origin.ts` owns the host-only opaque session, PKCE callback, origin checks, private service forwarding, and same-origin page policy.
- `src/signed-in.ts` verifies app identity and current Admission, routes private model calls, and uses the generic account adapter.
- `WORK_ACCOUNTS` binding props register the Worker’s app ID, record kind, name and Worker-relative routes. The dashboard does not maintain an application list. See [the integration contract](../docs/accounts/integrate-an-application.md).
- `src/policy.ts`, `catalog.ts`, `shape.ts`, and `inference.ts` own anonymous model availability, bounded inputs and inference. Budgets and rate limits are declared in the Worker configuration.
- `src/store.ts` owns public wall poems, votes and the anonymous spend ledger.
- `src/browser-move.ts` retains the completed migration helper for reference. The old origin is now deleted; original browser storage was kept.

Deployment and live acceptance receipts are in [the move record](../docs/accounts/worker-move.md). Older Inference Arcade accounts and deployments remain separate.

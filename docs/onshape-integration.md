# Onshape Integration Scaffolding

Mission Control's first CAD ingestion MVP is STEP upload and mapping review. The Onshape integration remains future-compatible scaffolding: when it becomes a primary ingestion path, it should emit the same source-agnostic CAD import records used by STEP.

Normal Mission Control page loads read local data only. Onshape API calls happen only during explicit sync actions.

## Credential Configuration

Configure credentials on the platform backend only. Do not put Onshape secrets in frontend environment files.

- `ONSHAPE_BASE_URL`: optional, defaults to `https://cad.onshape.com`.
- `ONSHAPE_ACCESS_KEY` and `ONSHAPE_SECRET_KEY`: MVP API-key mode.
- `ONSHAPE_OAUTH_TOKEN`: placeholder for OAuth-ready call sites.
- `ONSHAPE_CREDENTIAL_REFERENCE`: optional reference name for secret-manager-backed credentials.

Raw secret values are not returned by the API and should not be logged. Request errors are redacted before they are stored.

## Linking URLs

Users paste an Onshape URL in the CAD / Onshape workspace area. Link-only save parses and stores:

- `documentId`
- `workspaceId`, `versionId`, or `microversionId`
- `elementId` when present
- original URL and parsed URL JSON

Link-only does not spend Onshape API calls.

## Sync Levels

- `link_only`: stores the parsed reference only. No Onshape calls.
- `shallow`: manually verifies/caches top-level document or assembly metadata.
- `bom`: recommended default. Imports assembly nodes, part definitions, part instances, quantities, and metadata from bulk-style assembly data.
- `deep_release`: explicit higher-budget action. The MVP uses the same safe importer path plus a higher call allowance; deeper per-part manufacturing metadata should be wired only through isolated `OnshapeCadClient` methods.

Workspace references are draft-like. Use Onshape versions or microversions for design review, release, or as-built snapshots.

## API Budgeting And Caching

Every Onshape request goes through the backend client policy:

- checks local cache before network when allowed
- treats version and microversion requests as immutable cache entries
- gives workspace requests a short TTL
- logs endpoint, method, cache key, timing, status, headers, cache usage, and rate-limit headers
- increments per-run and local budget counters only for network calls
- stops gracefully on exhausted per-sync budget or `429 Too Many Requests`

The frontend sync estimate panel reads `GET /api/onshape/import-estimate` from Mission Control only. It reports estimated calls, immutable/workspace status, cache hit/miss/stale state, and whether the selected sync fits the current per-sync soft budget.

The default local budget record is conservative for Education API limits. Adjust `dailySoftBudget`, `perSyncSoftBudget`, and threshold fields in the platform data layer when real plan limits are known.

## Sync Permissions

All Onshape routes require a normal Mission Control API session when auth is enabled. Deep release sync adds an extra backend check and is limited to members with `lead`, `mentor`, or `admin` roles. When auth is disabled for local development, the route remains available for smoke testing.

## Known Limitations

- The generic CAD import path is Prisma-backed by default. The older Onshape route scaffolding still uses an isolated runtime cache for link/sync smoke flows until it is bridged into the generic CAD store.
- Real Onshape endpoint paths are isolated in `src/onshape/onshapeCadClient.ts`; update that module only when endpoint behavior is verified.
- The importer does not create Onshape versions, write CAD data, fetch thumbnails, export geometry, or poll automatically.
- Deep release sync is intentionally minimal until verified manufacturing metadata endpoints are selected.
- Onshape assembly-to-subsystem/mechanism mapping should use the generic CAD mapping rules rather than a separate Onshape-only interpretation layer.

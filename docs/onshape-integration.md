# Onshape Integration MVP

Mission Control treats Onshape as the CAD source of truth and stores local, auditable CAD snapshots for workflow use. Normal Mission Control page loads read local data only; Onshape API calls happen only during explicit sync actions.

## Credential Configuration

Configure credentials on the platform backend only. Do not put Onshape secrets in frontend environment files.

- `ONSHAPE_BASE_URL`: optional, defaults to `https://cad.onshape.com`.
- `ONSHAPE_OAUTH_CLIENT_ID`: Onshape OAuth application client ID.
- `ONSHAPE_OAUTH_CLIENT_SECRET`: Onshape OAuth application client secret. Backend only.
- `ONSHAPE_OAUTH_REDIRECT_URI`: callback URL registered in Onshape, usually `/api/onshape/oauth/callback`.
- `ONSHAPE_OAUTH_AUTHORIZATION_URL`: optional, defaults to `https://oauth.onshape.com/oauth/authorize`.
- `ONSHAPE_OAUTH_TOKEN_URL`: optional, defaults to `https://oauth.onshape.com/oauth/token`.
- `ONSHAPE_OAUTH_SCOPES`: optional comma-separated scopes, defaults to `OAuth2Read`.
- `ONSHAPE_OAUTH_ACCESS_TOKEN`, `ONSHAPE_OAUTH_REFRESH_TOKEN`, `ONSHAPE_OAUTH_TOKEN_EXPIRES_AT`: optional bootstrap token values. Prefer runtime OAuth connection or a secret manager reference.
- `ONSHAPE_CREDENTIAL_REFERENCE`: optional reference name for secret-manager-backed credentials.

Raw secret values are not returned by the API and should not be logged. Request errors are redacted before they are stored.

## OAuth2 Flow

Mission Control uses OAuth2 authorization-code auth for Onshape API calls. API keys are no longer the primary integration path.

1. Configure the backend OAuth variables above.
2. In the CAD / Onshape panel, use the OAuth connect action to request an authorization URL.
3. Onshape redirects back to `/api/onshape/oauth/callback` with `code` and `state`.
4. The backend exchanges the code for access/refresh tokens and stores them in the backend runtime credential cache.
5. Sync actions use bearer tokens only from backend state/env and refresh tokens when they are near expiry.

The frontend never receives the client secret, access token, or refresh token.

OAuth credential management routes are restricted to leads, mentors, and admins when Mission Control auth is enabled:

- `POST /api/onshape/oauth/authorization-url` creates a short-lived state value, sets an HTTP-only callback cookie, and returns the Onshape authorization URL.
- `GET /api/onshape/oauth/callback` exchanges the authorization code, validates the stored state, writes the runtime token set, clears the callback cookie, and returns a small completion page.
- `POST /api/onshape/oauth/refresh` refreshes the active runtime or environment refresh token.

## Linking URLs

Users paste an Onshape URL in the CAD / Onshape workspace area. Link-only save parses and stores:

- `documentId`
- `workspaceId`, `versionId`, or `microversionId`
- `elementId` when present
- original URL and parsed URL JSON

Link-only does not spend Onshape API calls.

Reference and overview routes:

- `GET /api/onshape/overview` returns connection status, document references, import runs, snapshots, latest tree data, warnings, and budget status.
- `GET /api/onshape/document-refs` lists saved references.
- `POST /api/onshape/document-refs` validates an Onshape URL and saves the parsed reference plus optional project, season, subsystem, and mechanism links.
- `GET /api/onshape/import-estimate` estimates calls and budget fit for a saved reference and selected sync level.
- `GET /api/onshape/budget` returns the current runtime budget record.

## Sync Levels

- `link_only`: stores the parsed reference only. No Onshape calls.
- `shallow`: manually verifies/caches top-level document or assembly metadata.
- `bom`: recommended default. Imports assembly nodes, part definitions, part instances, quantities, and metadata from bulk-style assembly data.
- `deep_release`: explicit higher-budget action. The MVP uses the same safe importer path plus a higher call allowance; deeper per-part manufacturing metadata should be wired only through isolated `OnshapeCadClient` methods.

Workspace references are draft-like. Use Onshape versions or microversions for design review, release, or as-built snapshots.

Import and read routes:

- `POST /api/onshape/import-runs` starts a link-only, shallow, BOM, or deep-release import.
- `GET /api/onshape/import-runs` lists import runs, optionally by document reference.
- `GET /api/onshape/import-runs/:importRunId` returns one run with request logs, warnings, and snapshots.
- `GET /api/onshape/snapshots` lists snapshots, optionally by document reference.
- `GET /api/onshape/cad-tree` returns assembly nodes for the requested snapshot or latest snapshot.
- `GET /api/onshape/parts` returns part definitions and part instances for the requested snapshot or latest snapshot.
- `GET /api/onshape/warnings` lists warnings, optionally by snapshot.

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

- The Onshape MVP path currently uses the runtime store. Prisma schema and SQL artifacts define the durable shape for a future persistence pass, but Onshape import data is not yet routed through the generic CAD Prisma store.
- Real Onshape endpoint paths are isolated in `src/onshape/onshapeCadClient.ts`; update that module only when endpoint behavior is verified.
- The importer does not create Onshape versions, write CAD data, fetch thumbnails, export geometry, or poll automatically.
- Deep release sync is intentionally minimal until verified manufacturing metadata endpoints are selected.
- Assembly-to-subsystem/mechanism mapping is inferred and stored as candidates only; manual mapping should be added later.

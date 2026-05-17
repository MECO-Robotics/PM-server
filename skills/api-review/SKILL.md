---
name: api-review
description: Use when changing or reviewing Mission Control API routes, schemas, payloads, persistence, or client data contracts.
---

# API Review

The platform API is the contract source for Mission Control payloads and persistence behavior.

## Workflow

- Inspect route schemas, validators, and persistence code before changing client types.
- Distinguish request validation, runtime snapshot state, and durable database storage.
- Backfill missing routes or fields at the API boundary instead of masking contract drift in the UI.
- Keep migrations, Prisma schema changes, and route handlers scoped to the owning domain.
- Validate with API tests and typechecks, then run any affected web or mobile consumer checks.

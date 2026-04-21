# MECO Platform

DigitalOcean-ready backend starter for the MECO Robotics project management and manufacturing workflow app.

## Why this is a separate repo

The product request asked for a React Native app with DigitalOcean hosting. The clean split is:

- `meco-mobile`: Expo/React Native client for students, mentors, and admins.
- `meco-platform`: API and Postgres-backed workflow engine hosted on DigitalOcean.

That keeps mobile delivery focused on Expo/app-store builds while the backend, database, and deployment pipeline live in a standard hosted service repo.

## Included in this starter

- Fastify + TypeScript API shell with typed route responses.
- Completion-gating logic for work logs, mentor QA approval, and documentation evidence.
- Prisma schema covering members, subsystems, tasks, iteration tasks, work logs, attendance, manufacturing, purchases, QA reviews, and risks.
- `.do/app.yaml` spec for DigitalOcean App Platform plus a managed Postgres database.
- Dockerfile for local container parity if you want it later.

## API endpoints

- `GET /health`
- `GET /api/dashboard`
- `GET /api/tasks`
- `GET /api/meetings`
- `GET /api/manufacturing`
- `GET /api/purchases`
- `GET /api/qa`
- `GET /api/metrics`

## Local commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Deployment outline

1. Push this repo to `MECO-Robotics/meco-platform`.
2. In DigitalOcean App Platform, deploy from GitHub or apply `.do/app.yaml`.
3. Provision the managed Postgres database referenced by the app spec.
4. Point the mobile client at the deployed API URL with an Expo public env var.

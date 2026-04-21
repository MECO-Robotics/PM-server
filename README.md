# MECO Platform

DigitalOcean-ready backend starter for the MECO Robotics project management and manufacturing workflow app.

## Why this is a separate repo

The product request asked for a React Native app with DigitalOcean hosting. The clean split is:

- `meco-mobile`: Expo/React Native client for students, mentors, and admins.
- `meco-web`: React/Vite browser dashboard for mentors, admins, and wider desktop access.
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

1. Add a GitHub Actions secret named `DIGITALOCEAN_ACCESS_TOKEN` with App Platform access.
2. Push this repo to `MECO-Robotics/PM-server`.
3. Let `.github/workflows/deploy-digitalocean.yml` validate and deploy the app from `.do/app.yaml`.
4. Provision the managed Postgres database referenced by the app spec on the first deploy.
5. Point the mobile and web clients at the deployed API URL with frontend env vars.

## GitHub Actions deployment

This repo now includes a production workflow at `.github/workflows/deploy-digitalocean.yml`.

- `push` to `main`: runs typecheck, build, Prisma schema validation, and then deploys to DigitalOcean App Platform.
- `workflow_dispatch`: lets you trigger the same deployment manually from GitHub.

Required GitHub secret:

- `DIGITALOCEAN_ACCESS_TOKEN`: a DigitalOcean personal access token with App Platform permissions.

The workflow uses the official `digitalocean/app_action/deploy@v2` action and deploys directly from `.do/app.yaml`.

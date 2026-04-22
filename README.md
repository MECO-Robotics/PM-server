# MECO Platform

Backend starter for the MECO Robotics project-management and manufacturing workflow app.

## Hosting direction

This repo now targets a self-managed Linux VPS instead of App Platform.

The current recommended low-cost target is:

- `Hetzner CX23` in Germany for the cheapest sensible x86 starting point

The deployment path is intentionally provider-neutral, so the same repo can also run on:

- Hetzner
- DigitalOcean Droplets
- Vultr
- nearly any Ubuntu VPS with Docker installed

That keeps costs down and gives you one inexpensive box for:

- the Fastify API
- PostgreSQL
- Docker-based deployment

For an MVP, `1 vCPU / 2 GB RAM` is the minimum I’d be comfortable with when Node and Postgres are sharing one machine.

## Included in this starter

- Fastify + TypeScript API shell with typed route responses
- Completion-gating logic for work logs, mentor QA approval, and documentation evidence
- Prisma schema for members, tasks, attendance, manufacturing, purchases, QA reviews, and risks
- `docker-compose.prod.yml` for API + Postgres on one VPS
- GitHub Actions workflow that deploys over SSH to the VPS
- `deploy/bootstrap-vps.sh` for first-time Docker setup on Ubuntu

## API endpoints

- `GET /health`
- `GET /api/auth/config`
- `POST /api/auth/google`
- `GET /api/auth/me`
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

## Production files

- `docker-compose.prod.yml`: production stack for the VPS
- `.env.production`: runtime environment file on the VPS
- `.github/workflows/deploy-vps.yml`: CI + deployment workflow
- `deploy/bootstrap-vps.sh`: first-time Docker bootstrap for Ubuntu

## First-time VPS setup

1. Create an Ubuntu VPS.
2. If you want the cheapest suggested option, start with `Hetzner CX23`.
3. SSH into it as your deploy user.
4. Run `deploy/bootstrap-vps.sh` once.
5. Make sure `/opt/pm-server` exists and is writable by your deploy user.
6. Add a DNS record or reverse proxy later if you want a custom domain and TLS.

## Required GitHub secrets

Add these secrets to `MECO-Robotics/PM-server`:

- `VPS_HOST`: public IP or hostname of the server
- `VPS_USER`: deploy user, for example `root` or `deploy`
- `VPS_SSH_KEY`: private SSH key used by GitHub Actions
- `PRODUCTION_ENV_FILE`: full contents of the `.env.production` file

## Example production env file

Use this shape for the `PRODUCTION_ENV_FILE` secret:

```env
NODE_ENV=production
PORT=8080
PUBLIC_PORT=8080
POSTGRES_DB=meco_platform
POSTGRES_USER=meco
POSTGRES_PASSWORD=change-this
DATABASE_URL=postgresql://meco:change-this@postgres:5432/meco_platform?schema=public
CORS_ORIGIN=https://your-web-domain.example
GOOGLE_ALLOWED_HOSTED_DOMAIN=mecorobotics.org
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
AUTH_JWT_SECRET=replace-with-a-long-random-secret
AUTH_TOKEN_TTL=12h
```

## Google SSO

Google Identity Services sends a Google ID token to the web app, and the web app exchanges that token with `POST /api/auth/google`.

- The server verifies the Google token against `GOOGLE_CLIENT_ID`.
- The server enforces the hosted-domain check with `GOOGLE_ALLOWED_HOSTED_DOMAIN`.
- The server issues its own signed app session token with `AUTH_JWT_SECRET`.
- The server does not need a Google client secret for this flow.

For production, the web origin must be configured in the Google Cloud Console OAuth client and should be served over HTTPS before SSO is enabled on the public site.

## Deployment behavior

On every push to `main`, GitHub Actions will:

1. install dependencies
2. typecheck and build the server
3. validate the Prisma schema
4. connect to the VPS over SSH
5. sync the repo to `/opt/pm-server`
6. write `.env.production`
7. run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`

The app container runs `prisma db push` on startup so the schema is applied before the server begins serving traffic.

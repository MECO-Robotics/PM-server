# MECO Platform

Backend starter for the MECO Robotics project-management and manufacturing workflow app.

## Hosting direction

This repo now targets a self-managed DigitalOcean Droplet instead of App Platform.

That keeps costs down and gives you one inexpensive box for:

- the Fastify API
- PostgreSQL
- Docker-based deployment

For an MVP, the best starting point is usually a Basic Ubuntu Droplet with at least `1 vCPU / 2 GB RAM`, because running both Node and Postgres on `1 GB` is usually tighter than it sounds.

## Included in this starter

- Fastify + TypeScript API shell with typed route responses
- Completion-gating logic for work logs, mentor QA approval, and documentation evidence
- Prisma schema for members, tasks, attendance, manufacturing, purchases, QA reviews, and risks
- `docker-compose.prod.yml` for API + Postgres on one Droplet
- GitHub Actions workflow that deploys over SSH to the Droplet
- `deploy/bootstrap-droplet.sh` for first-time Docker setup on Ubuntu

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

## Production files

- `docker-compose.prod.yml`: production stack for the Droplet
- `.env.production`: runtime environment file on the Droplet
- `.github/workflows/deploy-digitalocean.yml`: CI + deployment workflow
- `deploy/bootstrap-droplet.sh`: first-time Docker bootstrap for Ubuntu

## First-time Droplet setup

1. Create a DigitalOcean Ubuntu Droplet.
2. SSH into it as your deploy user.
3. Run `deploy/bootstrap-droplet.sh` once.
4. Make sure `/opt/pm-server` exists and is writable by your deploy user.
5. Add a DNS record or reverse proxy later if you want a custom domain and TLS.

## Required GitHub secrets

Add these secrets to `MECO-Robotics/PM-server`:

- `DROPLET_HOST`: public IP or hostname of the Droplet
- `DROPLET_USER`: deploy user, for example `root` or `deploy`
- `DROPLET_SSH_KEY`: private SSH key used by GitHub Actions
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
```

## Deployment behavior

On every push to `main`, GitHub Actions will:

1. install dependencies
2. typecheck and build the server
3. validate the Prisma schema
4. connect to the Droplet over SSH
5. sync the repo to `/opt/pm-server`
6. write `.env.production`
7. run `docker compose -f docker-compose.prod.yml up -d --build`

The app container runs `prisma db push` on startup so the schema is applied before the server begins serving traffic.

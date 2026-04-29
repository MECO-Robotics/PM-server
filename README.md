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
- `POST /api/auth/email/start`
- `POST /api/auth/email/verify`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/home`
- `POST /api/media/presign-upload`
- `GET /api/tasks`
- `GET /api/meetings`
- `GET /api/manufacturing`
- `GET /api/purchases`
- `GET /api/qa`
- `GET /api/metrics`

## Request protection

- The server enforces a 64 KB JSON body limit to reject oversized payloads early.
- `GET /api/*` requests are rate limited per IP so a single client cannot flood the API.
- Auth routes have their own per-IP budget, and the email sign-in flow uses a stricter limit.
- Email verification still keeps its existing per-address cooldown and wrong-code attempt cap.
- Tuning knobs live in `API_RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_MAX_REQUESTS`, and `AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS` plus their matching `*_WINDOW_SECONDS` settings.

## Local commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Local env example

Use this shape for a local `.env` file when the web app is running on Vite's
default `http://localhost:5173` origin:

```env
NODE_ENV=development
PORT=8080
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public
API_RATE_LIMIT_MAX_REQUESTS=300
API_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_MAX_REQUESTS=60
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS=10
AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS=60
GOOGLE_CLIENT_ID=your-local-or-primary-google-client-id.apps.googleusercontent.com
AUTH_JWT_SECRET=replace-with-a-long-random-secret
GOOGLE_ALLOWED_HOSTED_DOMAIN=mecorobotics.org
AUTH_TOKEN_TTL=12h
# Local SMTP sink for email-code testing.
AUTH_EMAIL_SMTP_HOST=127.0.0.1
AUTH_EMAIL_SMTP_PORT=1025
AUTH_EMAIL_FROM="MECO Robotics <no-reply@mecorobotics.org>"
AUTH_EMAIL_CODE_TTL_MINUTES=10
AUTH_EMAIL_CODE_LENGTH=6
AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS=60
AUTH_EMAIL_MAX_VERIFY_ATTEMPTS=5
S3_ACCESS_KEY_ID=your-s3-access-key
S3_SECRET_ACCESS_KEY=your-s3-secret-key
S3_ENDPOINT=https://your-s3-endpoint.example
S3_PUBLIC_BASE_URL=https://your-public-cdn-or-bucket-host.example
S3_REGION=us-east-1
S3_BUCKET=meco-pm
S3_PRESIGN_TTL_SECONDS=300
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_ALERT_USERGROUP_HANDLES=allmentors,allstudents
SLACK_CHANNEL_ANNOUNCEMENTS_ID=CS6SKSDD4
SLACK_CHANNEL_BUILD_ID=C03171JMMB4
SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID=C03MXBFGAM6
SLACK_CHANNEL_PROGRAMMING_ID=C02BLURKRED
SLACK_CHANNEL_SCOUTING_STRATEGY_ID=C05SW57962E
SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID=C088N9VC6H4
```

If you keep separate Google OAuth clients for local and production, you can
comma-separate them in `GOOGLE_CLIENT_ID` and put the client you want the web
app to use first.

To inspect local email deliveries, run the bundled SMTP sink in another
terminal:

```bash
npm run smtp:dev
```

It listens on `127.0.0.1:1025` and logs each received message to the console so
you can copy the sign-in code during local testing.

When the server runs with auth configured outside production, it also exposes a
development-only `/api/auth/dev-bypass` endpoint that the web app can use for a
local access button. Production builds do not register that route.

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
- `PRODUCTION_ENV_FILE`: full contents of the `.env.production` file, including SMTP settings if you want email sign-in enabled
- `RESEND_API_KEY`: optional Resend API key for email sign-in

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
# Production deployments must use explicit web origins. Use a comma-separated list if needed.
CORS_ORIGIN=https://your-web-domain.example
API_RATE_LIMIT_MAX_REQUESTS=300
API_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_MAX_REQUESTS=60
AUTH_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS=10
AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS=60
GOOGLE_ALLOWED_HOSTED_DOMAIN=mecorobotics.org
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
AUTH_JWT_SECRET=replace-with-a-long-random-secret
AUTH_TOKEN_TTL=12h
AUTH_EMAIL_SMTP_HOST=smtp.your-provider.example
AUTH_EMAIL_SMTP_PORT=587
AUTH_EMAIL_SMTP_USER=your-smtp-username
AUTH_EMAIL_SMTP_PASS=your-smtp-password
AUTH_EMAIL_FROM="MECO Robotics <no-reply@mecorobotics.org>"
AUTH_EMAIL_CODE_TTL_MINUTES=10
AUTH_EMAIL_CODE_LENGTH=6
AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS=60
AUTH_EMAIL_MAX_VERIFY_ATTEMPTS=5
S3_ACCESS_KEY_ID=your-s3-access-key
S3_SECRET_ACCESS_KEY=your-s3-secret-key
S3_ENDPOINT=https://your-s3-endpoint.example
S3_PUBLIC_BASE_URL=https://your-public-cdn-or-bucket-host.example
S3_REGION=us-east-1
S3_BUCKET=meco-pm
S3_PRESIGN_TTL_SECONDS=300
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_ALERT_USERGROUP_HANDLES=allmentors,allstudents
SLACK_CHANNEL_ANNOUNCEMENTS_ID=CS6SKSDD4
SLACK_CHANNEL_BUILD_ID=C03171JMMB4
SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID=C03MXBFGAM6
SLACK_CHANNEL_PROGRAMMING_ID=C02BLURKRED
SLACK_CHANNEL_SCOUTING_STRATEGY_ID=C05SW57962E
SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID=C088N9VC6H4
```

## Google SSO

Google Identity Services sends a Google ID token to the web app, and the web app exchanges that token with `POST /api/auth/google`.

- The server verifies the Google token against `GOOGLE_CLIENT_ID`.
- The server enforces the hosted-domain check with `GOOGLE_ALLOWED_HOSTED_DOMAIN`.
- The server issues its own signed app session token with `AUTH_JWT_SECRET`.
- The server does not need a Google client secret for this flow.
- For localhost development, add your frontend origin such as `http://localhost:5173` to the OAuth web client's Authorized JavaScript origins in Google Cloud Console.
- If you use separate Google OAuth client IDs for local and production, set `GOOGLE_CLIENT_ID` to a comma-separated list and put the client ID you want the frontend to use first.

For production, the web origin must be configured in the Google Cloud Console OAuth client and served over HTTPS before SSO is enabled on the public site.
If you only have a static IP, use a mapped HTTPS hostname (for example `178-104-192-162.nip.io` or `178-104-192-162.sslip.io`) while testing and add that exact HTTPS origin in the OAuth client.

## Email sign-in fallback

If you add SMTP settings with `AUTH_EMAIL_SMTP_HOST` and `AUTH_EMAIL_FROM`, or set `RESEND_API_KEY` with `AUTH_EMAIL_FROM`, the server will also expose `POST /api/auth/email/start` and `POST /api/auth/email/verify`.

Brevo SMTP settings:
- `AUTH_EMAIL_SMTP_HOST=smtp-relay.brevo.com`
- `AUTH_EMAIL_SMTP_PORT=587`
- `AUTH_EMAIL_SMTP_USER`: Brevo SMTP login from the SMTP page
- `AUTH_EMAIL_SMTP_PASS`: Brevo SMTP key
- `AUTH_EMAIL_FROM`: verified Brevo sender, for example `"MECO Robotics <no-reply@mecorobotics.org>"`

Resend-specific settings:
- `RESEND_API_KEY`: set in GitHub Secrets as `RESEND_API_KEY` to keep this credential out of the `.env.production` secret blob
- `AUTH_EMAIL_FROM="MECO Robotics <no-reply@mecorobotics.org>"`

When `RESEND_API_KEY` is present and no explicit `AUTH_EMAIL_SMTP_HOST` is configured, the server uses:
- host: `smtp.resend.com`
- user: `resend`
- password: API key value
- Explicit `AUTH_EMAIL_SMTP_*` settings from `PRODUCTION_ENV_FILE` take precedence over this fallback.
- Your `AUTH_EMAIL_FROM` address must use a domain verified in your Resend account (for example, verify `mecorobotics.org` at resend.com/domains).

- The address must end in `@mecorobotics.org` unless you change `GOOGLE_ALLOWED_HOSTED_DOMAIN`.
- On localhost, the bundled SMTP sink gives you a no-password listener at `127.0.0.1:1025`.
- The server sends a one-time code to the entered address and exchanges that code for the same JWT session used by Google sign-in.
- Pending codes are stored in memory, so a server restart clears them.

## Deployment behavior

On every push to `main`, GitHub Actions will:

1. install dependencies
2. typecheck and build the server
3. validate the Prisma schema
4. connect to the VPS over SSH
5. sync the repo to `/opt/pm-server`
6. write `.env.production`
7. run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`

The server refuses to start in production unless authentication is configured and `CORS_ORIGIN` is an explicit allowlist.

The app container runs `prisma db push` on startup so the schema is applied before the server begins serving traffic.


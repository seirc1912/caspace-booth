# SelfBooth

SelfBooth is a public, mobile-first web application for self-photo booth studios. Customers access the production application at `https://booth.caspace.vn`, receive an isolated signed session, select a print template, fill its frames, and create print-ready files.

The frontend provides template selection, photo composition, print preview, and 300-DPI export settings. The export API produces PNG, JPG, and PDF files under session-isolated directories. Photo watching, realtime sync, direct printing, and QR handoff are intentionally not implemented.

Brand name, website, colors, logo, favicon, and copyright settings are centralized in `client/src/config/branding.ts`.
Print layouts are automatically discovered from package folders under `templates/`. Each package contains `template.json`, `background.png`, and `thumbnail.png`.

The frontend also includes an Admin Template Studio at `/admin`. Build the trusted admin deployment with `VITE_APP_ROLE=admin`; customer builds return a neutral not-found page for every admin route. This build-time boundary is ready to be replaced by server-verified administrator authorization when authentication is introduced.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer

## Getting started

```bash
npm install
npm run dev
```

Development uses `http://localhost:5173` with a same-origin `/api` proxy. Production uses relative API requests from `https://booth.caspace.vn` and does not depend on localhost.

Copy `server/.env.example` to `server/.env` before changing server configuration.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
```

See [PROJECT.md](PROJECT.md) for architecture and [TASKS.md](TASKS.md) for the implementation roadmap.

## Production container

```bash
docker build -t selfbooth .
docker run --rm -p 3000:3000 \
  -e SESSION_SECRET="replace-with-a-long-random-production-secret" \
  -e CLIENT_ORIGINS="https://booth.caspace.vn" \
  -v selfbooth-exports:/app/exports \
  selfbooth
```

Terminate TLS for `booth.caspace.vn` at the deployment platform or reverse proxy and forward traffic to port 3000.

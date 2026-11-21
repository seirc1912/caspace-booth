# Cá Space SelfBooth

Mobile-first web app for the Cá Space self-photo booth. Customers compose print frames on their own phone and send the finished files to the shop; staff download them for printing.

Production: `https://caspace.vn` — Vercel project `caspace` (team `caspace1`, root directory `client/`, functions region `icn1`) + Supabase (Seoul).

## How it works

| Step | Route | What happens | Main code |
|---|---|---|---|
| 1 | `/` → `/rooms` → `/editor` | Customer enters a phone number, picks a room and fills each frame **in the browser**. Drafts live in IndexedDB. | `client/src/CustomerApp.tsx`, `hooks/useSelfBooth.ts`, `features/drafts/` |
| 2 | `/editor` save | The phone renders the frame at the template's exact canvas size and exports **JPEG q0.95** (PNG before PR 4), then shares/downloads it. | `features/orders/services/` |
| 3 | `/upload-anh` | Customer sends the saved frames to the private bucket `customer-photo-uploads/{phone}/` via `client/api/photo-uploads/*` (init → direct upload to Supabase, TUS for > 6 MB → server verification). A 400px thumbnail is uploaded to `{phone}/_thumbs/` for staff previews. | `pages/PhotoUploadPage.tsx`, `features/photoUpload/`, `client/api/photo-uploads/` |
| 4 | `/staff/photos` | Staff log in, open a customer folder, preview thumbnails (no Supabase Image Transformations) and download originals / ZIP. | `pages/StaffPhotosPage.tsx`, `client/api/staff/` |
| — | `/admin` | Template/room/branding studio, protected by the Supabase `admin_login` RPC. Same bundle as the customer app, routed by path. | `features/admin/` |
| — | `/color-lab` | Standalone colour tool, not part of the print flow. | `pages/ColorLabPage.tsx` |

Not deployed / legacy: `server/` (Express + Socket.io), `folder-watcher/`, the `Dockerfile`. See `docs/ARCHITECTURE.md` for history and `docs/KE-HOACH-TOI-UU-UPLOAD-ANH.md` for the current upload optimisation plan.

## Development

Requires Node.js 22+ and npm 10+.

```bash
npm install
npm run dev            # Vite on http://localhost:5173
npm test               # node --test, tests/*.test.ts
npm run typecheck -w client
npm run lint -w client
npm run build -w client
```

Environment (Vercel → Project Settings → Environment Variables):

| Variable | Used by |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | browser |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `client/api` functions only — never in `VITE_*` |
| `STAFF_PHOTO_AUTH_EMAIL`, `STAFF_PHOTO_AUTH_USER_ID` | staff login |
| `CRON_SECRET`, `PHOTO_UPLOAD_CLEANUP_ENABLED` | daily 7-day cleanup cron (dry run unless `true`) |

## Operations

- Upload performance report (read-only, Vercel logs): `node scripts/upload-timing-report.mjs --since 30d`. Measurement mode on a phone: open any page with `?measure=wifi` (or `4g`, `5g`, `other`).
- Storage retention: `client/api/cron/cleanup-photo-uploads.ts` (daily 03:00 VN) or `scripts/cleanup-supabase-photo-uploads.mjs [--apply]`.
- Supabase setup notes: `docs/SUPABASE_PHOTO_UPLOAD.md`, `docs/SUPABASE_STAFF_PHOTOS.md`.

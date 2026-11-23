# Booth Auto-Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture One exports on the 4 Windows booth PCs reach Supabase automatically; customers see their booth photos after entering a room, tick the ones they want, compose frames, and send several finished frames to the shop in one tap; everything auto-deletes after 3 days.

**Architecture:** A Node.js agent on each booth PC (`booth-agent/`) watches `Pictures\*\Output`, authenticates with a per-booth key and uploads through new Vercel Functions (`client/api/booth/*`) into `customer-photo-uploads/{phone}/_booth/`. The customer app lists those photos through `client/api/booth-photos/list` (6-hour window), lets the customer pick them, and reuses the existing upload pipeline to send rendered frames. A daily cron removes objects older than 3 days.

**Tech Stack:** TypeScript, Vercel Functions (Node 24), React 19 + Vite, Supabase Storage (`@supabase/supabase-js`), Node 22 + chokidar + sharp on Windows, `node --test` + tsx.

**Spec:** `docs/superpowers/specs/2026-11-23-booth-auto-upload-design.md`

## Global Constraints

- Bucket stays `customer-photo-uploads` (private). Booth originals: `{phone}/_booth/{filename}`; booth thumbnails: `{phone}/_booth/_thumbs/{base}-thumb.jpg`; reopen marker: `{phone}/_booth/_access.json`.
- Phone pattern: `^0(?:3|5|7|8|9)\d{8}$`. Folder → phone: first 10-digit run in the folder name that matches it.
- Same name, different content → keep both: `{base}~{sha256[0..8]}{ext}`.
- Viewing window: `max(newest booth object created_at, _access.json.reopenedAt) + 6h > now`. Reopen writes `{"reopenedAt": <ISO now>}`.
- Agent automatic rescan: session folders modified in the last 24 h. Manual "Gửi lại thư mục": any age.
- Retention: 3 days for every object in the bucket; cron dry-run unless `PHOTO_UPLOAD_CLEANUP_ENABLED=true`.
- Booth keys: env `BOOTH_UPLOAD_KEYS` = JSON `{"booth-1":"<sha256 hex of key>", …}`.
- Never log phone numbers, filenames, object paths or signed URLs; logs carry only numbers/outcomes/boothId.
- No Supabase Image Transformations anywhere.
- Development and testing are local only (local Supabase in Docker + `vercel dev`); nothing is deployed or written to Production until the owner approves.
- Customer copy in the editor follows the existing English UI; new booth-photo screens use Vietnamese like `/upload-anh`.

## Review Focus

- Folder names like `0947860616-1`, `0856650134 tim`, `tim`, `032648341`, `.tmp.drivedownload` → merged / skipped correctly (test in Task 2).
- A JPEG still being written by Capture One (size growing) must not be uploaded half-written (test in Task 2: stable-size check).
- Network down for an hour, then back → queued files upload once, no duplicates (test in Task 2 queue persistence + server idempotency in Task 1).
- Customer with 80+ booth photos on a weak phone → grid shows thumbnails only; originals load only for ticked photos (test in Task 3).
- Phone number with no folder vs. expired folder → both return a generic response with no photo data (test in Task 3).

---

### Task 0: Local development environment

**Files:**
- Create: `scripts/local-dev.md` (how-to), `supabase/seed-local-storage.sql`
- Modify: `.gitignore` (ensure `.env.local`, `booth-agent/config.json`, `booth-agent/state/`)

- [ ] Step 1: Document: Docker Desktop resumed → `npx supabase start` → create private bucket `customer-photo-uploads` in local Supabase (SQL `insert into storage.buckets (id, name, public) values ('customer-photo-uploads','customer-photo-uploads',false) on conflict do nothing;`).
- [ ] Step 2: `client/.env.local`: `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` = Production (catalog is read-only, same as any customer browser); `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` = local Supabase; `BOOTH_UPLOAD_KEYS` = local test keys; staff env pointing to a local auth user.
- [ ] Step 3: Verify `npx vercel dev --listen 0.0.0.0:3000` serves `/` and `POST /api/photo-uploads/session` returns 200 with the local storage env.
- [ ] Step 4: Commit.

### Task 1: Booth upload API (PR A)

**Files:**
- Create: `client/api/_lib/boothAuth.ts`, `client/api/_lib/boothPaths.ts`, `client/api/booth/init.ts`, `client/api/booth/complete.ts`
- Modify: `client/api/_lib/supabaseStorage.ts` (path-explicit upload/verify), `client/api/_lib/uploadValidation.ts` (booth metadata parser)
- Test: `tests/boothUpload.test.ts`

**Interfaces:**
- Produces:
  - `requireBooth(request: ApiRequest, env?: Record<string,string|undefined>): { boothId: string }` — 401 when header missing/unknown.
  - `boothOriginalPath(phone: string, filename: string): string`, `boothThumbnailPath(originalPath: string): string`, `withContentSuffix(path: string, sha256: string): string`, `BOOTH_FOLDER = '_booth'`.
  - `SupabasePhotoUploadService.createSignedUploadAt(objectPath: string, metadata: UploadMetadata)` → same shape as `createSignedUpload`; `verifyUploadedObjectAt(metadata, objectPath)`; `objectSha256(objectPath): Promise<string|null>` (streams and hashes; null when absent).
  - `POST /api/booth/init` body `{ phone, filename, size, sha256, mimeType:'image/jpeg', prefix, variant:'original'|'thumbnail', originalPath? }` → `{ alreadyUploaded, objectPath, uploadUrl?, uploadToken?, completionToken }`.
  - `POST /api/booth/complete` body `{ …same, objectPath, completionToken }` → `{ ok: true, objectPath }`.

- [ ] Step 1: Tests: `requireBooth` accepts `Authorization: Bearer k1` when `BOOTH_UPLOAD_KEYS={"booth-1":sha256("k1")}`, rejects wrong/missing key (401) and malformed env (503); `boothOriginalPath('0947860616','0947860616-103333.jpg') === '0947860616/_booth/0947860616-103333.jpg'`; `boothThumbnailPath(...) === '0947860616/_booth/_thumbs/0947860616-103333-thumb.jpg'`; `withContentSuffix('p/_booth/a.jpg','abcdef0123…') === 'p/_booth/a~abcdef01.jpg'`; init with an existing same-hash object → `alreadyUploaded:true`; existing different-hash object → objectPath gets the `~sha8` suffix; thumbnail variant requires `originalPath` under `{phone}/_booth/` and ≤ 512 KB.
- [ ] Step 2: Run `npm test` → new tests fail.
- [ ] Step 3: Implement. Completion token = HMAC(serviceRoleKey, `caspace-booth-completion:v1:{boothId}:{objectPath}:{sha256}:{size}`). Rate limit `enforceRateLimit(request,{limit:600,windowMs:600_000,scope:'booth-upload'})`. No `enforceSameOrigin`. Logs: `[booth-upload:timing] { stage, durationMs, boothId, outcome }`.
- [ ] Step 4: `npm test && npm run typecheck -w client` pass.
- [ ] Step 5: Commit `feat(api): booth upload endpoints`.

### Task 2: Windows booth agent (PR B)

**Files:**
- Create: `booth-agent/package.json`, `booth-agent/tsconfig.json`, `booth-agent/src/{config,phoneFolder,stableFile,stateStore,uploader,thumbnail,scanner,statusServer,notify,main}.ts`, `booth-agent/install.ps1`, `booth-agent/uninstall.ps1`, `booth-agent/README.md`, `booth-agent/config.example.json`
- Delete: `folder-watcher/` (replace in root `package.json` workspaces)
- Test: `tests/boothAgent.test.ts`

**Interfaces:**
- Consumes: Task 1 endpoints.
- Produces:
  - `phoneFromFolderName(name: string): string | null`
  - `isOutputJpeg(path: string, root: string): { phone: string|null; sessionFolder: string } | null` (only `<root>\<session>\Output\*.jpg|jpeg`, skips names starting with `.`)
  - `waitUntilStable(path, { checks=3, intervalMs=500, timeoutMs=60_000 })`
  - `StateStore` (JSON file `state/uploaded.json`, key = absolute path + size + mtime → objectPath)
  - `uploadFile(path, phone, api: { baseUrl, key }, fetchImpl?)` → `{ objectPath, alreadyUploaded }` (original then thumbnail)
  - Status page `http://127.0.0.1:47821/` listing queue, last errors, unrecognised folders, and a "Gửi lại thư mục" form (folder name).

- [ ] Step 1: Tests: `phoneFromFolderName` → `'0947860616-1'→'0947860616'`, `'0856650134 tim'→'0856650134'`, `'857 tim'→null`, `'tim'→null`, `'032648341'→null`, `'.tmp.driveupload'→null`; `isOutputJpeg` rejects `Capture\x.CR3`, `Output\x.png`, `Output\sub\x.jpg`; `waitUntilStable` resolves only after size is unchanged for 3 checks (simulate growing file with fake fs); state store skips a path already uploaded with same size+mtime; uploader posts init→PUT→complete for original then thumbnail (fake fetch) and treats `alreadyUploaded` as success; a 409 does not retry forever (max 3 then marks failed).
- [ ] Step 2: Run → fail.
- [ ] Step 3: Implement. Concurrency 1 (configurable max 2). Retries with backoff 2s→60s, unlimited for network errors. On startup scan session folders with mtime < 24 h. Thumbnails with `sharp` → 400px long edge JPEG q70, ≤ 512 KB. Toasts via `node-notifier` for unrecognised folders (once per folder) and repeated failures. `install.ps1`: copies to `C:\CaspaceBooth`, `npm ci --omit=dev`, writes `config.json` (prompts baseUrl, boothId, key, watch root default `C:\Users\ADMIN\Pictures`), registers Scheduled Task "Caspace Booth Agent" at logon, creates desktop shortcut to the status page.
- [ ] Step 4: `npm test`, `npx tsc -p booth-agent --noEmit` pass; run agent on the Mac against local API with a fake `Pictures` tree → photos appear in local bucket.
- [ ] Step 5: Commit `feat: booth agent for Capture One exports`.

### Task 3: Customer booth-photo picker (PR C)

**Files:**
- Create: `client/api/_lib/boothPhotos.ts`, `client/api/booth-photos/list.ts`, `client/src/features/boothPhotos/boothPhotosClient.ts`, `client/src/features/boothPhotos/useBoothPhotos.ts`, `client/src/pages/BoothPhotoPickerPage.tsx`
- Modify: `client/src/CustomerApp.tsx` (route `/booth-photos` between room and editor; remove `startPhotoLibrarySession`/`useSessionPhotos`), `client/src/hooks/useSelfBooth.ts` (booth selection state persisted with the draft), `client/src/pages/ComposerPage.tsx` (Auto Fill / Add Photo / Add Image use the selected booth photos when present; "Booth photos" button to return to the picker)
- Delete: `client/src/features/photos/useSessionPhotos.ts`
- Test: `tests/boothPhotos.test.ts`

**Interfaces:**
- Consumes: Task 1 path helpers.
- Produces:
  - `listBoothPhotos(client, phone, now=Date.now()): Promise<{ status:'ok'|'unavailable'; photos: Array<{ id: string; name: string; thumbUrl: string|null; originalUrl: string; uploadedAt: string }>; expiresAt?: string }>` (signed URLs 3600 s; `unavailable` for both "no folder" and "expired").
  - `POST /api/booth-photos/list` (same-origin, `x-upload-session` required, rate limit scope `booth-photos` 120/10 min) body `{ phone }`.
  - Client: `fetchBoothPhotos(phone): Promise<BoothPhotoList>`; `useBoothPhotos(phone, { pollMs: 10_000 })`; `loadBoothPhotoFiles(photos): Promise<File[]>` (downloads originals of ticked photos only, 2 at a time).
  - `useSelfBooth`: `boothSelection: string[]`, `setBoothSelection(ids)`, persisted in draft.

- [ ] Step 1: Tests: window rule (newest 5h59m ago → ok; 6h01m → unavailable; reopenedAt 1h ago with old photos → ok; no folder → unavailable); `_thumbs`, `_access.json` excluded from list; list never uses `render/image` (source pin); picker loads originals only for ticked ids; `CustomerApp` no longer imports `useSessionPhotos`; entering a room with `status:'ok'` navigates to `/booth-photos`, otherwise `/editor`.
- [ ] Step 2: Run → fail.
- [ ] Step 3: Implement picker per spec sketch: grid of thumbnails (lazy), tick toggle, "Chọn tất cả", "Bỏ chọn", counter "Đã chọn N / M", "+ Thêm ảnh từ điện thoại", primary "DÙNG N ẢNH ĐÃ CHỌN →" (disabled at 0 → secondary "Bỏ qua"). On continue: `loadBoothPhotoFiles` → `booth.addUploadedPhotos(files)` then navigate `/editor`. Editor buttons: when booth photos were added, "Auto Fill N Photos" uses the pool (`autoFillAllFrames(poolFiles)`) instead of opening the file input; "Add Photo"/"Add Image" show a small sheet: "Ảnh phòng chụp" (pool thumbnails) or "Từ điện thoại".
- [ ] Step 4: `npm test`, typecheck, lint, build pass; manual check on phone against local stack.
- [ ] Step 5: Commit `feat: customers pick booth photos after entering a room`.

### Task 4: Send several frames to the shop (PR D)

**Files:**
- Create: `client/src/features/orders/services/sendFrames.ts`, `client/src/components/editor/SendFramesSheet.tsx`
- Modify: `client/src/CustomerApp.tsx`, `client/src/pages/ComposerPage.tsx`
- Test: `tests/sendFrames.test.ts`

**Interfaces:**
- Consumes: `prepareCompositionDownload` (JPEG q0.95), `uploadPhotoToStorage`, `queueThumbnailUpload`, `MAX_UPLOAD_CONCURRENCY` (existing).
- Produces: `sendFrames({ frames: Array<{ templateId; template; slots }>, phone, branding, onProgress }): Promise<Array<{ templateId; ok: boolean }>>`; sent ids persisted in the draft (`sentFrameIds`).

- [ ] Step 1: Tests: renders each selected frame once, uploads with the draft phone, concurrency ≤ `MAX_UPLOAD_CONCURRENCY`, a failed frame does not stop others, re-sending an already-sent unchanged frame is skipped, editing a frame clears its sent mark.
- [ ] Step 2: Run → fail.
- [ ] Step 3: Implement sheet: list of completed frames with checkboxes (pre-ticked: completed and not yet sent), per-frame progress, primary "GỬI N KHUNG CHO QUÁN". "Save Photo" stays.
- [ ] Step 4: Tests/typecheck/lint/build pass; manual: frames appear in local bucket `{phone}/` with `_thumbs`.
- [ ] Step 5: Commit `feat: send several finished frames to the shop`.

### Task 5: Staff booth status + reopen (PR E)

**Files:**
- Create: `client/api/staff/booth-access.ts`
- Modify: `client/api/_lib/staffPhotos.ts` (folder summary adds `boothPhotoCount`, `boothViewableUntil`), `client/src/pages/StaffPhotosPage.tsx`
- Test: `tests/staffBoothAccess.test.ts`

**Interfaces:**
- Consumes: `listBoothPhotos` window rule from Task 3 (export `boothViewableUntil(newest: string|null, reopenedAt: string|null): number|null`).
- Produces: `POST /api/staff/booth-access` body `{ phone }` (staff session, same-origin) → writes `{ reopenedAt }` → `{ viewableUntil }`.

- [ ] Step 1: Tests: reopen writes `_access.json` with now (not now+6h); summary counts only `_booth/*.jpg`; unauthenticated → 401.
- [ ] Step 2: Run → fail. Step 3: Implement; page row shows "Ảnh phòng chụp: N · còn Xh / đã hết hạn" + button "Mở lại 6 giờ". Step 4: pass. Step 5: Commit.

### Task 6: 3-day cleanup cron (PR F, replaces #80)

**Files:**
- Create (from branch `feat/scheduled-photo-cleanup`, adapted): `client/api/_lib/photoRetention.ts`, `client/api/cron/cleanup-photo-uploads.ts`
- Modify: `client/vercel.json` (cron `0 20 * * *`), `README.md`, `docs/ROLLBACK-UPLOAD-OPTIMIZATION.md`
- Test: `tests/photoRetention.test.ts`

- [ ] Step 1: Tests: `PHOTO_RETENTION_DAYS === 3`; scans `{p}`, `{p}/_thumbs`, `{p}/_booth`, `{p}/_booth/_thumbs` (and `_access.json`); dry-run unless env `true`; requires `Authorization: Bearer ${CRON_SECRET}`; never logs paths.
- [ ] Step 2–4: fail → implement → pass; run against local Supabase with back-dated objects (dry-run and real).
- [ ] Step 5: Commit.

### Task 7: Rollout docs

- [ ] `booth-agent/README.md` Vietnamese step-by-step install for staff (Parallels test first, then 4 PCs), key generation command, `BOOTH_UPLOAD_KEYS` value for the owner, Drive parallel-run checklist, rollback (disable Scheduled Task; revert PRs).

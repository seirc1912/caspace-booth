# Supabase Storage setup for UPLOAD ẢNH

The existing customer page remains `/upload-anh`. Vercel creates a signed upload permission for exactly one collision-safe path in the private `customer-photo-uploads` bucket. The browser streams the original file directly to Supabase Storage, then the server streams it back privately to validate byte count, MIME signature, and SHA-256 before the UI reports success.

## Security model

- The bucket must stay **private**. Do not add anonymous `select`, `insert`, `update`, or `delete` policies for it.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never use the `VITE_` prefix.
- A customer receives only a short-lived Supabase signed-upload permission for one server-generated object path. It grants no list/read/download permission and has `upsert: false`.
- Phone numbers group files for staff; they are not treated as authentication. Customers cannot use a phone number to read any object.
- The server validates Vietnamese phone format, filename, extension, MIME type, PNG/JPEG magic bytes, per-file size, request ID, and SHA-256. Completion streams the stored bytes through SHA-256 without modifying them.
- Limits are 20 files per selection, 25 MB per file, and 250 MB per selection. Across selections, the API uses a rolling 10-minute 1,000 MB budget per signed browser session plus a 5,000 MB shared-IP safety ceiling, so 10–30 customers behind one cafe/mobile-carrier NAT are not all treated as one person. Requests without a valid server-signed session retain the conservative legacy 250 MB/IP accounting and are rejected so the browser can establish a fresh session.
- The upload session is generated server-side, signed with a server-only secret, bound to the browser user agent, and valid for 24 hours. A separate signed completion receipt binds the session to the exact object path, SHA-256, and byte count. Client-created or rotated identifiers therefore cannot bypass the per-session budget; rotating valid sessions remains bounded by the shared-IP ceiling and session-issuance limit.
- Byte allowance is reserved once per stable upload request ID. Init retries and TUS resume requests do not double-count the same file, while a changed size for the same reservation is rejected.
- Enforcement is a rolling window, but the maps live inside each Vercel function instance and are therefore **not globally authoritative**. The safest global design is a small atomic distributed counter store (for example Vercel KV/Upstash Redis) keyed by HMAC-hashed session/IP and reservation ID with 10-minute TTLs. This is intentionally not enabled because it introduces paid infrastructure and requires owner approval.

## Phase 2 upload performance

- Files up to 6 MB keep the existing one-request signed upload path.
- Files over 6 MB use Supabase TUS resumable upload with 6 MB chunks, bounded retries, and a five-minute inactivity timeout. The signed token still targets one exact object and cannot overwrite it.
- Each customer uploads at most two files concurrently. Save-Data, 2G, and slow-2G connections remain sequential.
- The browser records anonymous stage durations for hashing, initialization, transfer, and verification. Server logs record only duration, coarse size band, and outcome; they never include phone numbers, filenames, object paths, image bytes, or credentials.
- Completion still streams the private object and validates its exact size, MIME signature, and SHA-256. Vercel functions are configured for Seoul (`icn1`) to keep this mandatory read close to the Supabase Seoul project.
- There is no database finalization step in this feature. Client timing reports `finalizationMs: 0` explicitly rather than implying database work occurred.

## Safe Preview performance plan

Use a separate non-production Supabase project or isolated staging bucket with identical private-bucket rules. Do **not** load-test the live project.

1. Prepare deterministic 5 MB JPEG and 12 MB PNG fixtures and record their SHA-256 hashes.
2. Run cohorts of 1, 5, 10, 20, then 30 simulated customers. Each customer should submit a representative 45 MB batch from a distinct browser session; run a second scenario where all sessions share one public IP.
3. For each cohort, capture success rate and p50/p95 for hash, init, transfer, verification, and total time. Confirm no 429 response for the legitimate shared-IP scenario and confirm the session and shared-IP ceilings reject traffic above 1,000 MB and 5,000 MB per rolling 10 minutes respectively.
4. Interrupt a TUS transfer after at least one chunk, retry, and verify only the remaining bytes are sent. Compare the downloaded original with the fixture SHA-256.
5. Confirm anonymous list/read requests return 401/403, overwrite attempts fail, bad signatures fail, and failed files remain retryable.
6. Watch Vercel function duration/error rate and Supabase Storage/egress usage. Stop before advancing a cohort if errors rise or mobile memory/network behavior degrades.

Baseline and optimized measurements must use the same region, fixtures, network shaping, and staging data. Local unit tests validate concurrency and quotas but are not production latency measurements.

## Manual Preview setup (not executed by this change)

1. In the existing Supabase project, copy the project URL and service-role key from **Project Settings → API**. Never paste the service-role key into browser code, chat, or a `VITE_` variable.
2. From a trusted local terminal, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run:

   `node scripts/create-supabase-upload-bucket.mjs`

   This creates `customer-photo-uploads` as private with PNG/JPEG and 25 MB bucket limits. It refuses to accept an existing public bucket.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Vercel **Preview** environment only. The existing `VITE_SUPABASE_URL` and publishable key continue to serve the rest of the site unchanged.
4. Deploy a Preview and upload test PNG/JPEG files. In Supabase Dashboard, verify **Storage → customer-photo-uploads → 0901234567/** contains the original files. Download them as staff and compare SHA-256 with the originals.
5. Confirm an anonymous request cannot list or download objects. Do not add public Storage policies to make this test pass.

No database table, migration, RLS policy, existing bucket, Spend Cap, domain, or production setting is changed by the implementation.

## Seven-day retention option

`scripts/cleanup-supabase-photo-uploads.mjs` is deliberately **not scheduled**. It defaults to a dry run and lists objects older than seven days. Only after explicit approval, run it with `--apply`, or schedule that exact command in a protected job with the two server-only variables. Test a dry run first and retain logs. Do not activate deletion merely by merging this code.

## Cost and monitoring

- Original files consume Storage equal to their unchanged byte size. Completion verification reads each object once. Running the verifying function in Seoul avoids an unnecessary inter-region path, but the Storage read can still count toward bandwidth according to the Supabase plan.
- The Supabase Image Transformations quota applies to transformed image delivery, not these raw signed uploads or exact-byte verification. The staff thumbnail view currently uses transformations and should be monitored separately. Do not change Spend Cap or billing settings as part of upload optimization.
- Monitor **Supabase Dashboard → Reports/Usage → Storage and Egress** and configure billing alerts. Keep the organization's existing Spend Cap unchanged.
- Watch rejected/429 requests in Vercel logs without logging phone numbers or filenames. If abuse appears, tighten Vercel Firewall limits before raising application limits.

## Failure and retry behavior

The object path includes the normalized phone prefix and stable client request ID. A retry of a completed request verifies and reuses the same object; a new selection receives a distinct path. Signed uploads cannot overwrite existing objects. Failed files remain selected in the UI, while already verified files are skipped on retry.

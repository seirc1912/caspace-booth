# Supabase Storage setup for UPLOAD ẢNH

The existing customer page remains `/upload-anh`. Vercel creates a signed upload permission for exactly one collision-safe path in the private `customer-photo-uploads` bucket. The browser streams the original file directly to Supabase Storage, then the server streams it back privately to validate byte count, MIME signature, and SHA-256 before the UI reports success.

## Security model

- The bucket must stay **private**. Do not add anonymous `select`, `insert`, `update`, or `delete` policies for it.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never use the `VITE_` prefix.
- A customer receives only a two-hour Supabase signed-upload permission for one server-generated object path. It grants no list/read/download permission and has `upsert: false`.
- Phone numbers group files for staff; they are not treated as authentication. Customers cannot use a phone number to read any object.
- The server validates Vietnamese phone format, filename, extension, MIME type, PNG/JPEG magic bytes, per-file size, request ID, and SHA-256. Completion streams the stored bytes through SHA-256 without modifying them.
- Limits are 20 files per selection, 25 MB per file, and 250 MB per selection/IP window. The application limiter is best-effort per serverless instance. Configure Vercel Firewall rate limits for `/api/photo-uploads/*` before production to enforce a distributed quota.

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

- Original files consume Storage equal to their unchanged byte size. Completion verification reads each object once, so it also consumes egress/bandwidth approximately equal to the upload volume.
- Monitor **Supabase Dashboard → Reports/Usage → Storage and Egress** and configure billing alerts. Keep the organization's existing Spend Cap unchanged.
- Watch rejected/429 requests in Vercel logs without logging phone numbers or filenames. If abuse appears, tighten Vercel Firewall limits before raising application limits.

## Failure and retry behavior

The object path includes the normalized phone prefix and stable client request ID. A retry of a completed request verifies and reuses the same object; a new selection receives a distinct path. Signed uploads cannot overwrite existing objects. Failed files remain selected in the UI, while already verified files are skipped on retry.

# Google Drive setup for UPLOAD ẢNH

The customer page is `/upload-anh`. It uses two Vercel serverless endpoints to create and verify a one-file Google Drive resumable upload. The browser then sends the original file bytes directly to that session. OAuth credentials never reach frontend code, Vercel never proxies the large image body, and success is shown only after the Drive API confirms the file metadata, parent folder, size, MIME type, request ID, and its own SHA-256 checksum against the client-computed value.

## Security and limits

- OAuth scope: `https://www.googleapis.com/auth/drive.file`.
- Maximum 20 files per submission, 25 MB per file, and 250 MB total.
- PNG/JPEG extension, MIME type, and magic-byte signature are checked.
- Files are never decoded, resized, recompressed, converted, or passed through Canvas.
- Upload initialization is rate-limited per Vercel instance. Configure Vercel Firewall rate limiting on `/api/photo-uploads/*` as an additional distributed production control.
- Client request IDs make completed-file retries idempotent. Duplicate filenames receive ` (2)`, ` (3)`, and so on; Drive files are always created rather than overwritten.
- Customer phone numbers are used only as private Drive folder names and are not written to application logs or returned by the API.

## 1. Create the Google Cloud OAuth client

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) as `caspace.sg@gmail.com` and create or select a project owned by Cá Space.
2. Open **APIs & Services → Library**, find **Google Drive API**, and enable it.
3. Open **Google Auth Platform → Branding** and configure the app name and support email.
4. Configure the audience as **External**. During setup, add `caspace.sg@gmail.com` as a test user.
5. Open **Clients**, create an **OAuth client ID**, and choose **Web application**. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI if OAuth Playground will be used for the one-time authorization.
6. Save the client ID and client secret securely. Never paste them into source files, browser code, GitHub issues, or commits.

## 2. Authorize the Drive account and obtain a refresh token

1. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. In settings, enable **Use your own OAuth credentials**, then enter the client ID and client secret created above.
3. Authorize only `https://www.googleapis.com/auth/drive.file`.
4. Sign in as `caspace.sg@gmail.com`, approve access, and exchange the authorization code for tokens.
5. Copy the refresh token into a password manager or Vercel's encrypted environment variables. Do not commit it.

OAuth consent screens left in **Testing** can issue refresh tokens that expire after seven days. Before production use, complete Google's required app information and move the app to **Production**. The `drive.file` scope is non-sensitive and limits the app to files it creates or files explicitly opened with the app.

## 3. Create the parent folder with the same OAuth app

With the three OAuth variables available only in the current shell, run:

```bash
GOOGLE_CLIENT_ID='…' \
GOOGLE_CLIENT_SECRET='…' \
GOOGLE_REFRESH_TOKEN='…' \
node scripts/create-google-drive-upload-folder.mjs
```

The script creates or reuses **CÁ SPACE - ẢNH KHÁCH** and prints:

```text
GOOGLE_DRIVE_PARENT_FOLDER_ID=...
```

Use this script rather than manually creating the folder. A manually created folder is not necessarily visible to an app authorized with the least-privilege `drive.file` scope. If Cá Space insists on using an unrelated existing folder, it must first be made accessible to this OAuth app (for example through a Google Picker flow) or the broader restricted `drive` scope must be reviewed and authorized; broad Drive access is not recommended here.

## 4. Configure Vercel Preview

In the existing Vercel project, add these server-side variables to **Preview only** first:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_DRIVE_PARENT_FOLDER_ID
```

Do not prefix these variables with `VITE_`; that prefix would expose them to browser bundles. Redeploy the feature branch Preview after setting them.

After a real Preview upload succeeds, inspect Drive as `caspace.sg@gmail.com` and confirm:

1. The normalized phone-number subfolder exists under **CÁ SPACE - ẢNH KHÁCH**.
2. Multiple images and later uploads reuse that folder.
3. Downloaded files have the same byte length and SHA-256 checksum as the originals.
4. Duplicate filenames did not overwrite older files.

Only after that acceptance test should the same variables be added to Vercel Production and the PR be considered for merge. Adding environment variables does not modify Drive data or Supabase.

## 5. Local development

Vite proxies `/api` to the existing Express server, while the production implementation lives in `client/api` as Vercel functions. For end-to-end local function testing, use Vercel's local development runtime from the `client` project directory. Unit tests use mocked Google OAuth/Drive responses and do not need credentials.

## Failure behavior

If one upload fails, already confirmed files remain in Drive and the selected photos remain visible. Retrying the same selection reuses completed request IDs and continues with the failed file. The UI never reports success until every selected file has been verified. Expired or abandoned resumable sessions do not create a Drive file and expire automatically at Google.

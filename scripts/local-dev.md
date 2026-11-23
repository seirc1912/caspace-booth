# Chạy thử local (không đụng Production)

Dùng để thử app phòng chụp, trang chọn ảnh, gửi khung, trang staff và cron xoá 3 ngày
trên máy Mac trước khi deploy. Mọi thao tác ghi đều vào Supabase local trong Docker.

## 1. Supabase local (Docker Desktop phải đang chạy)

Nếu máy đã có một project Supabase local khác chiếm cổng 54321–54329, chạy bản sao với
cổng riêng (55421…) từ một thư mục tạm có `supabase/config.toml` đã đổi cổng và
`project_id`, rồi:

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,inbucket
```

Tạo bucket private `customer-photo-uploads` và một user staff local
(email `staff@local.test`) bằng service key local.

## 2. `client/.env.local` (gitignored)

```
VITE_SUPABASE_URL=<URL Production>           # chỉ ĐỌC catalog bằng khoá public, như khách
VITE_SUPABASE_PUBLISHABLE_KEY=<khoá public>
SUPABASE_URL=http://<IP LAN của Mac>:55421   # Supabase LOCAL — không bao giờ để URL Production
SUPABASE_SERVICE_ROLE_KEY=<service key LOCAL>
BOOTH_UPLOAD_KEYS={"booth-1":"<sha256 của mã test>"}
STAFF_PHOTO_AUTH_EMAIL=staff@local.test
STAFF_PHOTO_AUTH_USER_ID=<id user staff local>
```

Dùng IP LAN (không dùng 127.0.0.1) để điện thoại và máy ảo Parallels tải được ảnh qua signed URL.

## 3. Chạy web + API

```bash
node --import tsx scripts/local-api-server.ts   # API :3000 (từ chối chạy nếu SUPABASE_URL không phải http local)
cd client && npx vite --host 0.0.0.0             # web :5173, /api proxy sang :3000
```

Mở **http://localhost:5173** trên Mac. Trình duyệt chỉ cho tính SHA-256 (`crypto.subtle`)
trên https hoặc `localhost`, nên gửi khung từ điện thoại qua `http://<IP>:5173` sẽ lỗi —
đó là giới hạn của môi trường test, Production chạy https nên không bị.

## 4. App phòng chụp

- Trên Mac: `cd booth-agent && node --import tsx src/main.ts <config.json>` với
  `apiBaseUrl: "http://<IP LAN>:3000"` và `watchRoot` là một thư mục giả lập `Pictures`.
- Trên máy ảo Windows (Parallels, mạng Shared): chạy `CaspaceBoothSetup-*.exe` (build bằng
  `node booth-agent/installer/build.mjs`), ô **Máy chủ** nhập `http://10.211.55.2:3000`.
  Chép ảnh JPEG vào `C:\Users\ADMIN\Pictures\<sđt>\Output\` để giả lập Capture One.

## 5. Cron xoá 3 ngày

```bash
CRON_SECRET=x PHOTO_UPLOAD_CLEANUP_ENABLED=false node --import tsx -e "…gọi handler với Authorization: Bearer x…"
```

Muốn có dữ liệu cũ: sửa `created_at`/`updated_at` trong `storage.objects` của DB local
(`set session_replication_role = replica` để trigger không ghi đè `updated_at`).

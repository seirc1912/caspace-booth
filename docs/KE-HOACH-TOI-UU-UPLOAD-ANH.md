# Kế hoạch: khách gửi ảnh chậm & vượt hạn mức Supabase

- **Trạng thái:** Nháp — chờ owner duyệt từng mục "CẦN OWNER DUYỆT"
- **Ngày lập:** 21/11/2026 (số liệu đo ngày 20–21/11/2026)
- **Phạm vi:** `client/` (Vite + React, Vercel Functions `client/api`, region `icn1`), Supabase Storage. Không đụng `server/` (không deploy).
- **Liên quan:** `docs/SUPABASE_PHOTO_UPLOAD.md`, `docs/SUPABASE_STAFF_PHOTOS.md`

---

## 0. Hướng dẫn cho người/agent thực hiện (Claude Code / Codex)

1. **Không tin tài liệu này mù quáng.** Bước đầu tiên là tự đọc lại code, tự chạy lại các phép đo ở §4 và ghi kết quả vào §4.4. Nếu số liệu hoặc kết luận khác tài liệu này → dừng, ghi lại chỗ khác, báo owner trước khi sửa.
2. **Đo trước – sửa – đo sau.** Mỗi PR phải ghi số đo trước và sau vào §6.
3. **Một việc = một nhánh = một PR.** Không gộp nhiều mục ở §5 vào một PR.
4. **Production chỉ được ĐỌC.** Không ghi/xoá dữ liệu, không đổi bucket, policy, RLS, migration, Spend Cap, biến môi trường Production. Không load test trên project Production (xem `SUPABASE_PHOTO_UPLOAD.md` §Safe Preview).
5. **Bí mật:** không đưa `SUPABASE_SERVICE_ROLE_KEY` hoặc khoá server vào biến `VITE_*`, code trình duyệt, log hay chat. Không log số điện thoại, tên file, đường dẫn object, URL ký.
6. Mục có nhãn **CẦN OWNER DUYỆT** → trình bày phương án, chờ owner chọn rồi mới làm.
7. Kiểm thử trên **Vercel Preview** trước, owner duyệt rồi mới lên Production.

---

## 1. Hệ thống đang chạy thực tế (đã đối chiếu code commit `9625fbd`)

| Bước | Trang | Việc xảy ra | Code chính |
|---|---|---|---|
| 1 | `/` → `/rooms` → `/editor` | Khách nhập SĐT, chọn phòng, ghép ảnh vào từng khung **ngay trên điện thoại**. Ảnh chọn từ máy được vẽ lại tối đa 4096px, JPEG 0.98 và lưu nháp vào IndexedDB. | `CustomerApp.tsx`, `hooks/useSelfBooth.ts`, `features/photos/imageLoader.ts`, `features/drafts/editorDraftStore.ts` |
| 2 | `/editor` – nút lưu | Trình duyệt vẽ khung **đúng kích thước canvas của mẫu** và xuất **PNG (mặc định)**, rồi chia sẻ/tải về máy khách. Chưa gửi lên server. | `features/orders/services/saveComposition.ts`, `downloadComposition.ts` (`format = 'png'`), `renderComposition.ts` |
| 3 | `/upload-anh` | Khách chọn lại các file khung đã lưu, nhập SĐT, gửi lên bucket private `customer-photo-uploads/{sđt}/`. Mỗi file: SHA-256 trên điện thoại → `POST /api/photo-uploads/init` → gửi file trực tiếp lên Supabase (≤ 6 MB một request, > 6 MB dùng TUS) → `POST /api/photo-uploads/complete` (server đọc lại **toàn bộ** object để kiểm SHA-256, MIME, size). **Gửi tuần tự từng file một**; 1 file lỗi thì **dừng cả hàng đợi**. | `pages/PhotoUploadPage.tsx`, `features/photoUpload/uploadClient.ts` (`MAX_UPLOAD_CONCURRENCY = 1`, `runUploadQueue`), `client/api/photo-uploads/*` |
| 4 | `/staff/photos` | Nhân viên đăng nhập, mở thư mục theo SĐT, xem **ảnh xem trước 360px** (Supabase Image Transformations), tải file gốc / ZIP để in. | `pages/StaffPhotosPage.tsx`, `client/api/_lib/staffPhotos.ts` (dòng ~82: `createSignedUrl(..., { transform: { width: 360, ... } })`), `client/api/staff/*` |

**Không còn được dùng (đã xác nhận bằng dữ liệu):**
- `folder-watcher` → bảng `session_photos` chỉ có 7 dòng, mới nhất 07/08/2026.
- Bucket `print-orders` → 0 file trong 14 ngày (chỉ được gọi từ `OrderPreviewPage` không còn route).
- Workspace `server/` (Express + Socket.io) → không deploy lên Vercel.
- `/color-lab` là công cụ riêng, không nằm trong luồng in.

**Kích thước khung đang bật (bảng `templates`, `enabled = true`):** 1500×1500, 1750×2600, 2600×1750, 1500×3500, 1150×3500, 1400×3500, 1200×2400, 2000×1070, 3000×2000, 2500×3300. Cạnh dài tối đa **3500px** → **file khách gửi lên chính là file in thành phẩm, đúng độ phân giải in.**

---

## 2. Số liệu đã đo

### 2.1 Supabase Storage – `customer-photo-uploads`, 14 ngày gần nhất
| Loại file | Số file | Trung bình |
|---|---|---|
| `image/png` | 475 | 3,8 MB |
| `image/jpeg` | 28 | 1,9 MB |

(Một lần chạy khác cho 51 file, TB 4,0 MB, trung vị 3,3 MB, lớn nhất 8,6 MB — cần chạy lại để xác nhận tổng số; xem §4.2.)

### 2.2 Vercel log `[photo-upload:timing]` – 20/11/2026 11:09–11:39 (giờ VN)
- `init`: 84–182 ms (lần đầu sau khi nghỉ: 423–515 ms → cold start).
- `verification`: 392–1.319 ms, trong đó `storageResponseMs` 366–1.022 ms, `streamVerificationMs` 26–298 ms.
- Đợt 9 ảnh liên tiếp lúc 11:31:05 → 11:31:40 ≈ **35 giây ≈ 3,9 giây/ảnh**. Ước tính theo khoảng cách giữa các log: truyền file ~70%, kiểm tra phía server ~20%, khởi tạo + băm SHA-256 ~10%.
- Tất cả `sizeBand: 'small'` (≤ 6 MB, không dùng TUS).
- Log Vercel **không có** thời gian băm và truyền file phía điện thoại (chỉ in ra `console` của máy khách).

### 2.3 Supabase Usage (tổ chức `seirc1912's Org`, gói Pro, chu kỳ 15/11–15/12/2026, lọc "All projects")
| Mục | Đã dùng / hạn mức |
|---|---|
| **Storage Image Transformations** | **1.779 / 100 ảnh gốc (1.779%) – VƯỢT** |
| Storage Size | 24,3 / 100 GB |
| Egress | 16,4 / 250 GB |
| Cached Egress | 28,3 / 250 GB |
| Realtime peak connections | 10 / 500 |

Supabase cảnh báo: *khi bật Spend Cap mà vượt hạn mức, project có thể ngừng phản hồi hoặc chuyển chỉ đọc.*

---

## 3. Vấn đề và nguyên nhân

### Vấn đề A – Khách gửi ảnh ở `/upload-anh` chậm
| # | Nguyên nhân | Bằng chứng | Mức ảnh hưởng |
|---|---|---|---|
| A1 | File khung xuất **PNG** (~3,8 MB). Cùng khung xuất JPEG 0.95 dự kiến ~1–1,5 MB, giữ nguyên số điểm ảnh. | §2.1; `downloadComposition.ts` `format = 'png'` | **Cao** (chiếm phần truyền file ~70%) |
| A2 | Gửi **tuần tự 1 file/lần**, cộng dồn thời gian chờ server + độ trễ mạng. | `MAX_UPLOAD_CONCURRENCY = 1`, `runUploadQueue` | Cao khi nhiều ảnh |
| A3 | Server **đọc lại toàn bộ object** để kiểm SHA-256 sau mỗi file (0,4–1,3 s/file). | §2.2 `verification` | Trung bình (~20%) |
| A4 | Băm SHA-256 **toàn file** trên điện thoại trước khi gửi. | `sha256Blob` | Thấp (~0,3 s/file, máy yếu có thể hơn) |
| A5 | Cold start function lần đầu (~0,4–0,5 s). | §2.2 | Thấp |
| A6 | 1 file lỗi → dừng cả lượt, khách phải gửi lại. | `runUploadQueue` trả về ngay khi lỗi | Trải nghiệm |

**Đã loại trừ (không phải nguyên nhân):**
- Ảnh máy chụp booth tải về điện thoại (folder-watcher không còn dùng).
- Image Transformations (luồng khách gửi ảnh không gọi tới).
- Bị Supabase bóp băng thông (Egress chỉ 7%, `storageResponseMs` bình thường).

**KHÔNG được làm:** thu nhỏ/nén lại ảnh ở `/upload-anh`. File gửi lên là file in thành phẩm (cạnh dài tới 3500px); thu nhỏ sẽ giảm chất lượng in.

### Vấn đề B – Vượt hạn mức Storage Image Transformations
- **Nghiệp vụ:** trang Kho ảnh khách (`/staff/photos`) hiển thị ảnh xem trước 360px để nhân viên nhận diện ảnh trước khi tải về in.
- **Cơ chế:** kho chỉ lưu file gốc. Mỗi lần mở thư mục, server tạo signed URL có `transform` → Supabase thu nhỏ ngay lúc xem. Supabase tính **mỗi ảnh gốc khác nhau được transform trong chu kỳ** là 1 đơn vị; gói Pro gồm 100/tháng.
- **Hậu quả:** vượt 1.779%. Spend Cap đang bật → nguy cơ project bị hạn chế (khi đó khách **không gửi được ảnh**, không chỉ chậm). Trang nhân viên cũng tải chậm vì Supabase phải đọc từng PNG ~4 MB để thu nhỏ.
- **Quan hệ với Vấn đề A:** không gây chậm trực tiếp cho khách; là rủi ro gây **hỏng** dịch vụ nếu bị hạn chế.
- **Chưa rõ:** con số 1.779 có thuộc hết project caspace không (khoảng 500 file trong 14 ngày nhưng 1.779 ảnh được transform từ 15/11). Cần lọc Usage theo từng project (§4.3).

### Vấn đề C – Cấu trúc code & tài liệu (không gấp)
- Code/trang không còn dùng: `OrderPreviewPage`, `ExportPreviewPage`, `TemplatePreviewPage`, `SuccessPage`, `RoomSummaryPage`, `providers/SessionProvider`, `services/api/*`, `services/export/*`, `SupabasePrintOrderRepository` (chỉ dùng bởi trang chết), workspace `server/`, có thể cả `folder-watcher/`.
- Tài liệu lệch thực tế: `README.md` (domain `booth.caspace.vn`, Docker), `PROJECT.md` ở gốc ≠ `docs/PROJECT.md`, `docs/ARCHITECTURE.md` mô tả export phía server (thực tế render trên trình duyệt), `TASKS.md`.
- Trùng lặp: `templates/` ở gốc và `client/public/templates`; thư mục giữ chỗ `photos/`, `exports/`, `assets/`, `prompts/`.
- Logic dịch vụ rải ở `services/` lẫn `features/*/services`; `models/` lẫn `types/`.
- Admin chung bundle với khách, chỉ tách bằng biến build `VITE_APP_ROLE`.
- Bucket `session-photos` để **public** (ai có link đều xem được ảnh khách).
- Script dọn ảnh 7 ngày (`scripts/cleanup-supabase-photo-uploads.mjs`) chưa được lên lịch → Storage tăng dần.

---

## 4. Đo TRƯỚC khi sửa (baseline)

Mọi phép đo chỉ đọc. Ghi kết quả vào §4.4.

### 4.1 Vercel log
```bash
vercel logs --scope caspace1 --project prj_GdrTrN1EUY3CXUCHHyxyCPB9QQK8 \
  --since <ISO-UTC> --until <ISO-UTC> --query 'photo-upload\:timing'
vercel logs ... --query 'photo-upload\:failure'
```
Tính p50/p95 của `init.durationMs`, `verification.durationMs`, `storageResponseMs`; đếm số lỗi. Log chỉ được giữ ngắn → chạy ngay sau đợt gửi thử.

### 4.2 Supabase SQL Editor (chỉ SELECT)
```sql
-- (1) Dung lượng theo bucket, 14 ngày
select bucket_id, count(*) so_file,
  round(avg((metadata->>'size')::numeric)/1048576,1) tb_mb,
  round((percentile_cont(0.5) within group (order by (metadata->>'size')::numeric)/1048576)::numeric,1) trung_vi_mb,
  round(max((metadata->>'size')::numeric)/1048576,1) lon_nhat_mb,
  round(sum((metadata->>'size')::numeric)/1073741824,2) tong_gb
from storage.objects where created_at > now() - interval '14 days'
group by bucket_id order by bucket_id;

-- (2) PNG hay JPEG
select metadata->>'mimetype' loai_file, count(*) so_file,
  round(avg((metadata->>'size')::numeric)/1048576,1) tb_mb
from storage.objects
where bucket_id = 'customer-photo-uploads' and created_at > now() - interval '14 days'
group by 1;

-- (3) Số ảnh mỗi lượt khách (theo thư mục SĐT, mỗi ngày)
select date_trunc('day', created_at) ngay, count(distinct split_part(name,'/',1)) so_khach, count(*) so_file
from storage.objects
where bucket_id = 'customer-photo-uploads' and created_at > now() - interval '14 days'
group by 1 order by 1;

-- (4) Kích thước khung đang bật
select name, editor_data->'template'->'canvas'->>'width' rong_px,
       editor_data->'template'->'canvas'->>'height' cao_px
from public.templates where enabled order by display_order;
```

### 4.3 Supabase Usage
Dashboard → Organization → Usage → chọn **từng project** (không để "All projects"). Chụp mục Storage Image Transformations, Storage Size, Egress. Xác định project nào tạo ra 1.779 ảnh transform.

### 4.4 Thử thật trên điện thoại (bắt buộc – đây là con số khách cảm nhận)
Kịch bản cố định, dùng lại y hệt sau khi sửa:
- 1 iPhone + 1 Android tầm trung; mạng 4G (ghi lại tốc độ từ speedtest) và Wi-Fi tiệm.
- `/editor`: ghép và lưu **3 khung** (1500×1500, 1500×3500, 3000×2000). Ghi thời gian lưu mỗi khung + dung lượng file.
- `/upload-anh`: gửi **9 file** đó (lặp lại 3 lần) bằng SĐT thử. Bấm giờ từ lúc bấm "GỬI ẢNH" đến khi báo thành công.
- `/staff/photos`: mở thư mục SĐT thử, bấm giờ đến khi toàn bộ ảnh xem trước hiện ra.
- Dọn dữ liệu thử: **chỉ owner** xoá thủ công thư mục SĐT thử sau khi đo.

**Module đo (nhánh `feat/client-timing-metrics`, = PR 0):**
- Mở trang với `?measure=wifi` (hoặc `4g`, `5g`, `other`; `?measure=off` để tắt). Nhãn được nhớ trong tab.
- `/editor`: sau mỗi lần lưu, thông báo hiện `ĐO: <giây render> · <MB> · <rộng×cao> PNG` trong 8 s.
- `/upload-anh`: sau khi gửi, khung vàng hiện tổng thời gian từ lúc bấm "GỬI ẢNH" + băm/khởi tạo/truyền/kiểm tra + số file TUS phải gửi lại.
- Mọi lượt (kể cả khách thật, nhãn `null`) được log ẩn danh: `[photo-upload:client-timing]` (từng file: băm/khởi tạo/truyền/kiểm tra, số byte → tốc độ truyền, TUS phải gửi lại), `[photo-upload:client-batch]` (cả lượt: tổng thời gian, ok/lỗi/**bỏ dở khi đóng trang**, **lần bấm gửi thứ mấy**), `[editor:save-timing]`.
- Tổng hợp: `node scripts/upload-timing-report.mjs --since 30d [--measure wifi|none]` (chỉ đọc log Vercel; log giữ ~30 ngày, script cache từng ngày vào `.upload-logs/` để giữ lâu hơn). Báo cáo gồm: bảng §4.4, **tải cao có làm chậm/lỗi không** (theo số file / 5 phút), **các khung 5 phút bất thường** (lỗi, Supabase chậm, truyền chậm, khách bỏ dở), phân bố theo giờ và theo thứ.

| Chỉ số | Trước | Sau |
|---|---|---|
| Dung lượng TB file khung (MB) | _chưa đo — cần quyền Supabase SQL (§4.2)_ | |
| Thời gian lưu 1 khung trên điện thoại (s) | _chưa đo — cần điện thoại thật_ | |
| Gửi 9 file – 4G (s) | _chưa đo — cần điện thoại thật_ | |
| Gửi 9 file – Wi-Fi (s) | _chưa đo — cần điện thoại thật_ | |
| `init` p50 / p95 (ms) | **114 / 643** (n = 2.460; small 114/647, large 113/589) | |
| `verification` p50 / p95 (ms) | **765 / 1.314** (n = 2.198; `storageResponseMs` 558/938, `streamVerificationMs` 180/458; large 932/1.419) | |
| Mở thư mục staff (s) | _chưa đo — cần tài khoản staff; mỗi lần mở tốn thêm Image Transformations_ | |
| Image Transformations đã dùng trong chu kỳ | _chưa đọc — cần quyền Supabase Usage_ | |
| Số lỗi `[photo-upload:failure]` | **456 / 7 ngày**: `STORAGE_TUS_CREATE_400` 275, `STORAGE_STANDARD_NETWORK` 137, `STORAGE_STANDARD_TIMEOUT` 44 | |

> Nguồn số "Trước": Vercel runtime log Production, 14/11 03:15Z → 20/11 17:55Z (7 ngày), deployment `dpl_2U3971…` = commit `9625fbd`. Đo ngày 21/11/2026 bởi Claude Code. Chi tiết chênh lệch so với §1–§3: xem §4.5.

### 4.5 Kết quả kiểm tra lại (§0) — chỗ khác tài liệu
1. **TUS (> 6 MB) gần như luôn hỏng.** §2.2 ghi "tất cả `sizeBand: small`, không dùng TUS". Thực tế 7 ngày có 288 `init` large và 275 lỗi `STORAGE_TUS_CREATE_400` (p50 0,9 s, không retry) → file > 6 MB gần như lần nào cũng hỏng TUS rồi mới rơi về gửi thường (theo `SUPABASE_PHOTO_UPLOAD.md` §Phase 2). Nguyên nhân 400 chưa rõ — cần log Storage của Supabase.
2. **Lỗi gửi thường đáng kể, khách chờ rất lâu.** 137 lỗi mạng (thời gian tới lúc lỗi p50 72 s) + 44 timeout đúng 300 s. Ước tính ~7–8 % file thất bại cuối cùng (181 / (2.198 + 181)). Kết hợp A6 (dừng cả hàng đợi) đây có thể là phần lớn cảm nhận "chậm". Tài liệu chưa nêu.
3. **Lưu lượng lớn hơn nhiều so với §2.1.** 2.198 file xác minh thành công trong 7 ngày (~314/ngày), trong khi §2.1 ghi ~503 file / 14 ngày. Cần chạy lại SQL §4.2 (có thể đã có dọn dữ liệu). Nếu đúng, ~2.200 ảnh/tuần đủ giải thích 1.779 Image Transformations từ 15/11 → nhiều khả năng thuộc caspace (Q2), cần xác nhận ở §4.3.
4. **Region.** `vercel.json` và deployment ghi `icn1`; project mặc định `iad1`; trường `region` trong log là `hkg1`/`sin1` (nhiều khả năng là edge region, chưa xác nhận nơi function chạy). Cần đối chiếu region project Supabase.
5. **`SupabasePrintOrderRepository` vẫn được dùng** bởi `/admin/print-queue` (`AdminApp.tsx:27`, có link trong `AdminShell`) — không chỉ bởi `OrderPreviewPage` như §3C.
6. **Tích hợp folder-watcher vẫn chạy phía khách.** Mỗi lần vào phòng, `CustomerApp.tsx:52` gọi `startPhotoLibrarySession` (ghi `customer_sessions`) và `useSessionPhotos` mở kênh Realtime + đọc bucket `session-photos`. Dữ liệu ảnh không còn nhưng code vẫn ghi DB/giữ kết nối → cần tính khi quyết Q7.
7. `imageLoader.ts`: ảnh nguồn PNG được giữ PNG (không phải luôn JPEG 0.98 như §1 bước 1).
8. `templates/` ở gốc không trùng hẳn `client/public/templates` — gốc có thêm `template.json` mỗi mẫu.
9. Vercel env: `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` đặt chung cho Preview và Production → cần xác nhận Preview có dùng chung project Supabase Production không trước khi "kiểm thử trên Preview" (§0.4, §0.7). `VITE_ADMIN_PASSWORD` có trong env nhưng code không dùng (không bị đóng gói).

10. **Phân tích 30 ngày (22/10–21/11, `scripts/upload-timing-report.mjs`)**: 8.675 file OK, 703 thất bại thật (~7,5 %), 1.085 TUS 400. Tỉ lệ lỗi **giảm** khi tải tăng (1–5 file/5 phút: 11,6 %; 6–15: 5,1 %; 16–30: 3,4 %; 31+: 0 %) và Supabase p95 cũng không tăng theo tải → **không thấy dấu hiệu quá tải server/Supabase**; lỗi chủ yếu ở bước truyền file từ máy khách (`STANDARD_NETWORK`/`TIMEOUT`). Lỗi dồn vào 12h và 19–22h (~11–13 %) so với 14–16h (~3 %). Có 17 khung 5 phút Supabase chậm bất thường (p95 2–10 s), rải rác, không trùng giờ tải cao. Cần số liệu phía điện thoại (mạng, thiết bị, bỏ dở, bấm lại) từ module đo để xác định nguyên nhân lỗi buổi tối.

Khớp tài liệu: PNG mặc định (`downloadComposition.ts:28`, không caller nào truyền `format`), `MAX_UPLOAD_CONCURRENCY = 1`, `runUploadQueue` dừng ở lỗi đầu tiên, server stream lại toàn bộ object để kiểm SHA-256/size/MIME, transform 360px chỉ có ở `staffPhotos.ts:82`, bucket `session-photos` public (migration `20260807130000`), script dọn 7 ngày chưa được lên lịch, các trang chết ở §3C không có route. Test gốc 189/189 pass, typecheck + lint client sạch.

---

## 5. Kế hoạch sửa (mỗi mục = 1 PR, theo thứ tự)

### PR 0 – Đo được thời gian phía điện thoại
- **Mục tiêu:** có số liệu băm/truyền/tổng thời gian từ máy khách trong log Vercel, để so sánh trước/sau mà không phải suy đoán.
- **Cách làm:** khi 1 file gửi xong, gửi `UploadTiming` (`hashMs`, `initializationMs`, `transferMs`, `verificationMs`, `totalMs`, `transport`, nhóm dung lượng) lên endpoint đã có `api/photo-uploads/diagnostics.ts` (thêm loại "success" với schema allow-list như hiện tại), log `[photo-upload:client-timing]`. Không gửi SĐT, tên file, đường dẫn.
- **Nghiệm thu:** log Vercel hiện đủ các trường; test schema từ chối trường lạ; không có PII.
- **Làm trước để có baseline đầy đủ.**

### PR 1 – Ảnh xem trước cho nhân viên không dùng Image Transformations (Vấn đề B) — CẦN OWNER DUYỆT phương án
- **Mục tiêu:** Image Transformations của project caspace về ~0; trang staff mở nhanh hơn.
- **Phương án đề xuất (chọn 1):**
  1. *(khuyến nghị)* Khi khách gửi ảnh, điện thoại tạo thêm ảnh nhỏ ~400px JPEG (~30–50 KB) và gửi kèm vào prefix riêng (vd. `customer-photo-uploads/{sđt}/_thumbs/` hoặc bucket private riêng), đi qua cùng cơ chế init/complete đã có (path do server sinh, `upsert: false`). Trang staff dùng signed URL **không transform** của ảnh nhỏ. Ảnh cũ chưa có thumbnail → fallback hiển thị placeholder + nút "Xem" mở file gốc (không transform).
  2. Server tạo thumbnail **một lần** khi `complete` (đã có sẵn stream object) bằng thư viện ảnh trên Vercel Function rồi lưu lại; cân nhắc CPU/thời gian chạy.
- **Lưu ý:** listing thư mục phải bỏ qua thumbnail khi đếm số ảnh và khi tạo ZIP.
- **Nghiệm thu:** mở thư mục staff không phát sinh request `/render/image`; số Image Transformations không tăng sau khi mở nhiều thư mục (kiểm tra Usage sau ≥ 1 giờ); ZIP và "Tải file gốc" vẫn đúng byte gốc.

### PR 2 – Xuất khung bằng JPEG chất lượng 0.95, giữ đúng kích thước khung (A1) — CẦN OWNER DUYỆT chất lượng in
- **Cách làm:** đổi mặc định `format` trong `downloadComposition.ts` sang `'jpg'` (đã có sẵn nhánh JPEG, nền trắng, quality 0.95 trong `renderComposition.ts`). Giữ nguyên `template.canvas` width/height. Tên file `.jpg`.
- **Kiểm tra trước khi duyệt:** xuất cùng 3 khung ở PNG và JPEG, in thử cả hai trên máy in của tiệm, owner so sánh. Chú ý chữ nhỏ/viền màu mảnh và khung có vùng trong suốt (sẽ thành nền trắng).
- **Nghiệm thu:** kích thước pixel file = canvas mẫu; dung lượng TB giảm ≥ 60%; owner duyệt bản in.

### PR 3 – Gửi song song 2–3 file và không dừng cả lượt khi 1 file lỗi (A2, A6)
- **Bối cảnh:** `SUPABASE_PHOTO_UPLOAD.md` §Phase 2 chủ ý quy định "mỗi khách gửi đúng 1 file một lúc" → mục này **đổi quyết định thiết kế cũ, CẦN OWNER DUYỆT**; cập nhật tài liệu đó trong cùng PR.
- **Cách làm:** `runUploadQueue` thành hàng đợi có giới hạn (mặc định 3, hằng số cấu hình); file lỗi đánh dấu `failed`, các file khác tiếp tục; nút "Gửi lại ảnh lỗi". Giữ nguyên request ID ổn định để không đếm trùng hạn mức byte.
- **Kiểm tra:** rate limit hiện có (`enforceRateLimit` của `init`/`complete`) không chặn 3 request song song; tiến độ tổng vẫn đúng; TUS > 6 MB vẫn chạy.
- **Nghiệm thu:** test đơn vị cho hàng đợi song song + lỗi giữa chừng; đo §4.4 giảm rõ.

### PR 4 – Làm nhẹ bước kiểm tra sau khi gửi (A3, A4) — CẦN OWNER DUYỆT (đánh đổi an toàn)
Hiện server stream lại toàn bộ object để kiểm byte count, MIME signature, SHA-256 (thiết kế có chủ đích). Phương án:
1. Giữ kiểm tra **size** (từ metadata object) + **MIME magic bytes** (Range request vài KB đầu), bỏ SHA-256 toàn file; bỏ băm SHA-256 trên điện thoại.
2. Giữ nguyên SHA-256 nhưng chạy sau (không bắt khách chờ).
3. Giữ nguyên như hiện tại (chỉ hưởng lợi từ PR 2 + PR 3).
- **Nghiệm thu:** `verification` p50 giảm; test vẫn từ chối file sai MIME, sai size, ghi đè.

### PR 5 – Dọn code và tài liệu (Vấn đề C), tách nhiều PR nhỏ
1. Xoá trang/route/provider/service không còn dùng (liệt kê ở §3C) – chạy `tsc`, test, build trước/sau.
2. Cập nhật `README.md`, gộp `PROJECT.md`, sửa `docs/ARCHITECTURE.md` theo luồng thực tế ở §1.
3. Quyết định giữ hay bỏ `server/`, `folder-watcher/`, `templates/` ở gốc — **CẦN OWNER DUYỆT**.
4. Quy ước thư mục: logic nghiệp vụ trong `features/<tên>/`, `services/` chỉ cho hạ tầng dùng chung; gộp `models/` vào `types/`.

### Các việc khác cần owner quyết (không code ngay)
- Bucket `session-photos` public → chuyển private + signed URL (nếu còn dùng folder-watcher), hoặc xoá nếu bỏ tính năng.
- Lên lịch script dọn ảnh 7 ngày (`--apply`) để kiểm soát Storage.
- Rate limit đang lưu trong bộ nhớ từng instance (không toàn cục) – đã ghi nhận trong `SUPABASE_PHOTO_UPLOAD.md`.

---

## 6. Đo SAU khi sửa
- Chạy lại y hệt §4.1–§4.4 sau mỗi PR trên Preview, và sau khi lên Production.
- Điền cột "Sau" của bảng §4.4; ghi rõ commit/PR tương ứng.
- Theo dõi Supabase Usage ≥ 24 giờ sau PR 1 để xác nhận Image Transformations không tăng.
- **Mục tiêu tham chiếu:** gửi 9 file ≤ 12 giây trên Wi-Fi tiệm; file khung TB ≤ 1,5 MB; Image Transformations của caspace không tăng thêm; không phát sinh lỗi mới.

---

## 7. Quyết định cần owner (tổng hợp)
| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| Q1 | Tạm tắt Spend Cap để tránh bị hạn chế project trong lúc chờ PR 1? (phát sinh phí phần vượt Image Transformations — xem giá trên trang Billing) | Rủi ro dịch vụ / chi phí |
| Q2 | 1.779 ảnh transform thuộc project nào? | Phạm vi PR 1 |
| Q3 | Phương án thumbnail PR 1 (1 hay 2)? | PR 1 |
| Q4 | Duyệt chất lượng in JPEG 0.95 sau khi in thử? | PR 2 |
| Q5 | Cho phép gửi song song (đổi thiết kế Phase 2)? Mấy file? | PR 3 |
| Q6 | Mức kiểm tra sau khi gửi (phương án 1/2/3)? | PR 4 |
| Q7 | Giữ hay bỏ `server/`, `folder-watcher/`, bucket `session-photos`? | PR 5 |

---

## 8. Trạng thái thực hiện (21/11/2026)

Kế hoạch đã được điều chỉnh theo kết quả §4.5 (không thấy quá tải server; lỗi nằm ở bước truyền + TUS sai endpoint). Các nhánh **nối tiếp nhau** (mỗi nhánh dựng trên nhánh trước), review/merge theo đúng thứ tự. Chưa push (tài khoản hiện chỉ có quyền READ trên repo).

| # | Nhánh | Nội dung | Mục §3 | Cần owner |
|---|---|---|---|---|
| PR 0 | `feat/client-timing-metrics` | Module đo phía điện thoại + báo cáo log 30 ngày | đo | — |
| PR 1 | `fix/staff-thumbnails-no-transform` | Ảnh xem trước 400px tạo trên điện thoại, staff không dùng Image Transformations | B | Q3 (đã chọn phương án 1) |
| PR 2 | `fix/upload-retry-stall-timeout` | Tự thử lại 3 lần, báo lỗi sau 45 s không tiến triển (thay 300 s), không dừng cả lượt, nút "Gửi lại ảnh lỗi" | A6 + lỗi mạng | — |
| PR 3 | `fix/tus-signed-endpoint` | TUS dùng `/upload/resumable/sign` — sửa 100 % lỗi `TUS_CREATE_400` (đã tái hiện + kiểm chứng trên Supabase local) | mới | — |
| PR 4 | `feat/export-jpeg-q95` | Xuất khung JPEG q0.95, giữ nguyên kích thước | A1 | **Q4: in thử** |
| PR 5 | `feat/parallel-uploads` | Gửi song song 3 file | A2 | **Q5** |
| PR 6 | `fix/rate-limit-per-endpoint` | Mỗi endpoint một bộ đếm rate limit (khách không làm staff bị chặn đăng nhập) | mới | — |
| PR 7 | `feat/scheduled-photo-cleanup` | Cron dọn ảnh 7 ngày (mặc định chỉ đếm), sửa script bỏ sót >1.000 thư mục và `_thumbs/` | C | **bật xoá thật** |
| PR 8 | `chore/remove-dead-pages` | Xoá 30 file không còn được import | C | — |
| PR 9 | `docs/align-with-reality` | README theo hệ thống thật, banner thực trạng cho ARCHITECTURE/PROJECT, bỏ `PROJECT.md` trùng | C | — |

**Không làm (có lý do):**
- *Làm nhẹ bước kiểm tra (A3/A4, Q6):* số liệu cho thấy phần đọc lại toàn bộ file chỉ ~180 ms p50; ~560 ms còn lại là độ trễ phản hồi của Storage mà Range request cũng phải chịu. Lợi ích nhỏ, lại đánh đổi việc kiểm SHA-256 → giữ nguyên. Gửi song song (PR 5) đã che phần lớn thời gian này.
- *Gỡ folder-watcher phía khách (Q7):* `customer_start_photo_session` còn là **khoá của bản nháp editor** (`useSelfBooth.ts:80`) — gỡ sẽ hỏng khôi phục nháp. Chỉ kênh Realtime `session_photos` là thừa (đỉnh 10/500 kết nối). Bucket `session-photos` public: chờ owner quyết.
- *Tách Supabase cho Preview:* việc hạ tầng (Supabase Branching hoặc project riêng + env Preview riêng), không phải code.

**Phát hiện thêm khi làm:** `config/env.ts` (`VITE_APP_ROLE`) chưa từng được import — admin chạy chung bundle, route theo `/admin`, bảo vệ bằng RPC `admin_login` (README cũ mô tả sai).

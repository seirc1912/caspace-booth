# Thiết kế: ảnh phòng chụp tự lên hệ thống (thay Google Drive)

Ngày: 23/11/2026 · Trạng thái: chờ owner duyệt

## 1. Mục đích

Hiện tại (4 phòng, mỗi phòng 1 máy Windows chạy Capture One gắn máy ảnh):

1. Nhân viên đặt phiên Capture One theo số điện thoại khách → ảnh lưu vào `C:\Users\ADMIN\Pictures\<sđt>\Output\<sđt>-<số>.jpg` (JPEG 3,3–4,1 MB/ảnh; thư mục phiên còn RAW, cache… ~1,5 GB).
2. Google Drive for desktop sao lưu `Pictures` lên Drive (không nén; Drive đã dùng 86 %).
3. Nhân viên gửi link Drive cho khách → khách tải ảnh về điện thoại → mở caspace.vn ghép khung → lưu từng khung về máy → vào `/upload-anh` gửi lại → nhân viên tải ở `/staff/photos` để in.

Mục tiêu: **bỏ các bước tay** (gửi link, khách tải về, khách gửi lại). Ảnh chụp xong tự lên Supabase; khách chỉ nhập số điện thoại là thấy ảnh trong trang ghép khung, ghép xong chọn nhiều khung và gửi thẳng cho quán.

## 2. Mục tiêu / Không làm / Thất bại nếu

**Mục tiêu**
- Ảnh trong `Output` xuất hiện trên trang ghép khung của khách trong vài giây sau khi Capture One xuất.
- Khách: nhập SĐT → thấy ảnh phòng chụp → chọn khung, chọn ảnh → tick nhiều khung đã ghép → một nút "Gửi cho quán".
- Ảnh gốc phòng chụp và khung khách gửi **tự xoá sau 3 ngày**.
- Không tăng Storage Image Transformations (Pro: 100 ảnh gốc/chu kỳ, đã vượt).

**Không làm (lần này)**
- Không bỏ Google Drive ngay — chạy song song vài ngày, owner tự quyết khi tắt.
- Không làm OTP/SMS hay mã PIN (owner chọn "chỉ SĐT + giới hạn 6 giờ").
- Không gửi RAW, cache, `Selects`, `Trash` — chỉ JPEG trong `Output`.
- Không thay đổi luồng in ở cửa hàng (nhân viên vẫn tải ở `/staff/photos`).
- Không dùng lại các bảng/RPC cũ `customer_sessions`, `session_photos`, bucket `session-photos` (bản nháp chưa từng chạy; bucket public).

**Thất bại dù chạy được nếu**
- Ảnh của khách này hiện cho khách khác (sai SĐT do tên thư mục lạ).
- Ảnh khách đọc được bằng link công khai không hết hạn.
- Khoá quản trị Supabase (`SUPABASE_SERVICE_ROLE_KEY`) nằm trên máy phòng chụp.
- Máy phòng chụp chậm/giật khi đang chụp vì app gửi ảnh.
- Mạng quán rớt làm mất ảnh (không gửi lại được khi có mạng).

## 3. Ràng buộc (giữ từ kế hoạch tối ưu upload §0)

- Production chỉ ĐỌC khi phát triển/kiểm thử; không load test Production.
- Không đưa khoá server vào `VITE_*`, code trình duyệt, log hay chat. Không log SĐT, tên file, đường dẫn object, URL ký.
- Thay đổi hạ tầng Production (biến môi trường mới, bật xoá thật) → **owner làm/duyệt**.
- Kiểm thử trên Vercel Preview trước; owner duyệt rồi mới merge, merge từng PR, sau 23h.
- Mỗi PR ghi vào `docs/ROLLBACK-UPLOAD-OPTIMIZATION.md` (hoặc tài liệu rollback riêng của dự án này).

## 4. Các cách đã cân nhắc

| Cách | Mô tả | Đánh đổi |
|---|---|---|
| **A. App chạy ngầm trên từng máy Windows → API caspace.vn → Supabase** (owner chọn) | App theo dõi `Pictures\*\Output`, gửi qua API có mã máy riêng | Nhanh (vài giây), không có khoá quản trị trên máy, tái dùng kiểm tra SHA-256/MIME của API hiện có. Phải cài 4 máy một lần. |
| B. Giữ Drive, máy chủ kéo từ Drive sang Supabase | Không cài gì ở phòng | Chậm 1–2 phút, phải cấp quyền Google, ảnh nằm 2 nơi, Drive gần đầy. |
| C. App gửi thẳng Supabase bằng khoá hạn chế | Ít code server | Phải sửa policy/RLS Supabase, khoá trên máy quyền rộng hơn, không kiểm tra phía server. |

## 5. Thiết kế

### 5.1 Lưu trữ

Dùng **bucket hiện có** `customer-photo-uploads` (private) — không tạo bucket, không migration, không đổi policy:

```
customer-photo-uploads/
  0947860616/                       ← khung khách gửi (như hiện nay, trang staff đọc)
  0947860616/_thumbs/               ← ảnh nhỏ khung (như hiện nay)
  0947860616/_booth/<tên file gốc>.jpg        ← ẢNH GỐC PHÒNG CHỤP (mới) — mọi phiên của cùng SĐT dồn chung 1 thư mục
  0947860616/_booth/_thumbs/<tên>-thumb.jpg   ← ảnh nhỏ 400px do app tạo (mới)
  0947860616/_booth/_access.json              ← hạn xem do nhân viên "mở lại" (mới, tuỳ chọn)
```

- Trang staff hiện chỉ liệt kê file ở cấp `{sđt}/` nên ảnh `_booth/` **không lẫn** vào danh sách khung cần in (đúng như `_thumbs/` hôm nay).
- **Mọi phiên của cùng SĐT dồn chung một thư mục** (owner chọn): `0947860616`, `0947860616-1`, `0947860616 tim` → `0947860616/_booth/`. Đường dẫn = `{sđt}/_booth/{tên file}`; gửi lại cùng nội dung là idempotent (đã có → chỉ xác minh).
- **Trùng tên nhưng khác nội dung** (hai phiên cùng bộ đếm, hoặc nhân viên xuất lại): **giữ cả hai**, bản sau thêm đuôi 8 ký tự đầu SHA-256 (`<tên>~<sha8>.jpg`) — không bao giờ mất ảnh; app không thử lại vô hạn khi gặp 409. *(Quyết định của Claude.)*
- Không dùng Image Transformations ở bất kỳ đâu; mọi ảnh xem trước là ảnh nhỏ tạo sẵn, đọc qua signed URL thường.

### 5.2 App phòng chụp (Windows) — `booth-agent/`

Viết mới dựa trên ý tưởng của `folder-watcher/` (chokidar, chờ file ổn định, hàng đợi, thử lại), nhưng gửi qua API caspace.vn thay vì gọi Supabase bằng khoá quản trị. `folder-watcher/` cũ xoá hoặc thay thế.

- **Theo dõi:** `C:\Users\ADMIN\Pictures\*\Output\*.jpg|jpeg` (đường gốc cấu hình được). Bỏ qua thư mục ẩn/`.tmp.*` (Drive), các thư mục con khác của phiên.
- **Lấy SĐT từ tên thư mục phiên:** 10 chữ số liên tiếp đầu tiên khớp `^0[35789]\d{8}`. Ví dụ `0947860616-1` → `0947860616`, `0856650134 tim` → `0856650134`. Không khớp (`857 tim`, `tim`, `ly`, `032648341`…) → **không gửi**, báo cho nhân viên (thông báo Windows + ghi log) để sửa tên thư mục; sửa xong app tự quét lại.
- **Chờ file xuất xong:** kích thước không đổi qua 3 lần kiểm tra cách 500 ms, đọc được JPEG hợp lệ.
- **Ảnh nhỏ:** tạo JPEG cạnh dài 400px (như ảnh nhỏ khách gửi hôm nay, ≤ 512 KB) ngay trên máy.
- **Gửi:** gọi API booth (5.3) → PUT lên signed URL → xác minh. Ảnh ≤ 6 MB nên dùng cách gửi thường; vẫn hỗ trợ TUS nếu file > 6 MB.
- **Không làm chậm máy chụp:** 1 file một lúc (tối đa 2), ưu tiên thấp, không đọc lại RAW.
- **Mất mạng / tắt máy:** hàng đợi lưu trên đĩa; khi khởi động quét lại các thư mục phiên **sửa đổi trong 24 giờ gần nhất** (không phải 3 ngày, để cài lại app không vô tình mở lại hạn xem của khách cũ; cũ hơn thì dùng "Gửi lại thư mục") và gửi những file chưa có (server trả "đã có" nếu trùng). Thử lại có giãn cách, không giới hạn số lần khi lỗi mạng.
- **Gửi lại bằng tay (sau khi Supabase đã xoá):** nhân viên chạm lệnh "Gửi lại thư mục" (menu khay hệ thống hoặc kéo thư mục phiên vào cửa sổ app) → app gửi lại toàn bộ `Output` của phiên đó, bất kể tuổi.
- **Cài đặt:** một file cài đặt/exe cho Windows, tự chạy khi đăng nhập (Task Scheduler hoặc Startup), biểu tượng khay hiển thị trạng thái: đang gửi N ảnh / lỗi mạng / thư mục sai tên.
- **Mã máy:** mỗi phòng một mã bí mật riêng (`booth-1` … `booth-4`), lưu trong file cấu hình chỉ user ADMIN đọc. Mã này chỉ dùng được cho API booth (tạo upload vào `{sđt}/_booth/`), không đọc/xoá được gì.

### 5.3 API mới (Vercel Functions, `client/api/booth/`)

- `POST /api/booth/init` — header `Authorization: Bearer <mã máy>`; body: SĐT, tên file, size, SHA-256, MIME, `variant` (original | thumbnail). Trả signed upload URL vào `{sđt}/_booth/...` (hoặc `alreadyUploaded`). Tái dùng `SupabasePhotoUploadService` (thêm tham số đường dẫn/prefix).
- `POST /api/booth/complete` — xác minh SHA-256/size/MIME như `/api/photo-uploads/complete`.
- Xác thực mã máy: biến môi trường `BOOTH_UPLOAD_KEYS` chứa **hash SHA-256** của từng mã (`{"booth-1":"<hash>",…}`); thu hồi = xoá dòng đó. Owner tạo biến trên Vercel (không lộ mã gốc).
- Không cần same-origin (gọi từ app desktop); rate limit scope riêng `booth-upload` theo mã máy.
- Log chỉ ghi số đo (thời gian, sizeBand, boothId, outcome) — không SĐT, không tên file.

### 5.4 Khách xem ảnh phòng chụp

- `POST /api/booth-photos/list` — body: SĐT; dùng phiên gửi ảnh hiện có (`x-upload-session`, same-origin). Trả danh sách ảnh trong `{sđt}/_booth/` với **signed URL ảnh nhỏ** và **signed URL ảnh gốc** (hạn ngắn, ví dụ 1 giờ; trang tự xin lại khi gần hết hạn).
- **Quy tắc 6 giờ:** chỉ trả ảnh nếu `max(thời điểm Storage nhận ảnh phòng chụp mới nhất, thời điểm mở lại trong _access.json) + 6 giờ > bây giờ`. Đồng hồ tính từ lúc ảnh lên Storage (không phải lúc chụp): ảnh lên trễ do mất mạng thì khách vẫn có đủ 6 giờ — chủ đích. Ngược lại trả trạng thái `expired` → trang hiện "Ảnh đã hết hạn xem, vui lòng liên hệ quán". Không có ảnh → trạng thái `empty` (trang vẫn hoạt động bình thường với ảnh từ điện thoại).
- Chống dò số: rate limit scope `booth-photos` theo phiên + IP (IP rộng vì wifi quán dùng chung). Không tiết lộ khác biệt giữa "không có thư mục" và "hết hạn" ngoài thông điệp cần thiết — (lựa chọn của builder: có thể gộp thành một thông điệp).
- Trang ghép khung: thay luồng cũ `startPhotoLibrarySession`/`useSessionPhotos` (RPC + bucket public + realtime) bằng gọi API trên; **tự kiểm tra lại mỗi ~10 giây** khi đang mở để ảnh mới xuất hiện dần (thay cho realtime). Ảnh hiển thị là ảnh nhỏ; ảnh gốc chỉ tải khi khách đặt ảnh vào khung (để render bản in đúng độ phân giải). Nguồn ảnh `'selfbooth'` đã có sẵn trong kiểu `PhotoAsset`.
- Nút chọn ảnh từ điện thoại giữ nguyên.

**Bước chọn ảnh sau khi vào phòng (owner yêu cầu).** Khi khách bấm "Enter Room" ở `/rooms` mà SĐT có ảnh phòng chụp còn hạn, hiện màn chọn ảnh **trước** trang ghép khung:

```
ẢNH CỦA BẠN TỪ PHÒNG CHỤP · 0947860616            Đã chọn 12 / 48
[Chọn tất cả]  [Bỏ chọn]
┌────┐ ┌────┐ ┌────┐ ┌────┐
│ ✓  │ │    │ │ ✓  │ │    │   ← lưới ảnh nhỏ, chạm để tick / bỏ tick
└────┘ └────┘ └────┘ └────┘
...                     (ảnh mới xuất vẫn tự hiện thêm)
[ + Thêm ảnh từ điện thoại ]        [ DÙNG 12 ẢNH ĐÃ CHỌN → ]
```

- Ảnh đã tick trở thành kho ảnh của trang ghép khung: "Auto Fill N Photos", "Add Photo", "Add Image" trong từng ô dùng các ảnh này (cùng ảnh khách thêm từ điện thoại).
- Mặc định **chưa tick ảnh nào**, có nút "Chọn tất cả" *(quyết định của Claude: khách thường chụp nhiều hơn số ô; tick sẵn tất cả sẽ làm Auto Fill dùng cả ảnh khách không thích)*.
- Trong trang ghép khung có nút quay lại màn này để chọn thêm/bớt; lựa chọn được lưu cùng bản nháp (IndexedDB) để mở lại không mất.
- Không có ảnh phòng chụp (hoặc hết hạn) → bỏ qua màn này, vào thẳng trang ghép khung như hiện nay (kèm thông báo hết hạn nếu có).
- Đổi phòng khác vẫn dùng lại lựa chọn ảnh đó.

### 5.5 Gửi nhiều khung từ trang ghép khung

- Trên trang ghép khung: khách tick các khung đã ghép xong → nút **"Gửi N khung cho quán"**.
- Mỗi khung render JPEG q0.95 (như #88) rồi gửi bằng pipeline hiện có `uploadPhotoToStorage` (song song 2, TUS cho > 6 MB, tự thử lại, ảnh nhỏ `_thumbs`) vào `{sđt}/` — trang staff thấy ngay như hôm nay. SĐT lấy từ bước nhập đầu, không nhập lại.
- Hiện tiến độ từng khung và trạng thái "Đã gửi"; khung đã gửi đánh dấu để tránh gửi trùng (gửi lại cùng nội dung là idempotent nhờ requestId/SHA).
- Vẫn giữ nút lưu khung về điện thoại như hiện nay. `/upload-anh` giữ nguyên cho khách ghép bằng app khác.

### 5.6 Trang staff `/staff/photos`

- Mỗi thư mục khách thêm dòng: số ảnh phòng chụp, trạng thái hạn xem (còn X giờ / hết hạn), nút **"Mở lại 6 giờ"** → ghi `{sđt}/_booth/_access.json` = **thời điểm bấm** (không cộng 6 giờ; quy tắc §5.4 tự cộng → đúng 6 giờ) (API staff, cần đăng nhập staff).
- Không hiển thị ảnh gốc phòng chụp trong lưới khung cần in (chỉ đếm).

### 5.7 Tự xoá sau 3 ngày

- Làm lại cron của #80 (`client/api/cron/cleanup-photo-uploads.ts`, `_lib/photoRetention.ts`) với `PHOTO_RETENTION_DAYS = 3`, quét `{sđt}/`, `{sđt}/_thumbs/`, `{sđt}/_booth/`, `{sđt}/_booth/_thumbs/` (và `_access.json`).
- Chạy hằng ngày 03:00 giờ VN. Mặc định **chạy thử** (chỉ đếm, log số lượng); chỉ xoá thật khi owner đặt `PHOTO_UPLOAD_CLEANUP_ENABLED=true` sau khi xem số lượng.
- Hệ quả owner đã biết: khung đã xoá không khôi phục được (kể cả rollback); quán cần in trong 3 ngày. Ảnh gốc phòng chụp vẫn còn trên máy Capture One → gửi lại được.
- PR #80 cũ (7 ngày) đóng, thay bằng PR này.

## 5.8 Kiểm thử trên Preview

- Preview và Production dùng chung Supabase (kế hoạch tối ưu §4.5). Như các PR trước: Preview chỉ ghi vào **SĐT test**, owner tự xoá thư mục test; không chạy xoá thật trên Preview (cron chỉ chạy thử/đếm).
- Preview có Deployment Protection → app phòng chụp khi test dùng link chia sẻ Preview (cookie bypass) như cách đã test các PR trước; Production không bị ảnh hưởng.

## 6. Thứ tự làm (mỗi bước một PR, Preview → owner duyệt → merge)

1. API booth (`/api/booth/init|complete`) + xác thực mã máy + test.
2. App phòng chụp `booth-agent/` (chạy thử trên 1 máy, trỏ vào Preview) — cài đặt, khay, gửi lại thư mục.
3. API khách xem ảnh + trang ghép khung dùng ảnh phòng chụp (6 giờ, tự cập nhật).
4. Gửi nhiều khung từ trang ghép khung.
5. Trang staff: trạng thái + "Mở lại 6 giờ".
6. Cron xoá 3 ngày (chạy thử → owner bật).
7. Cài 4 máy, chạy song song Drive vài ngày; owner quyết tắt Drive.

## 7. Owner cần làm / duyệt

- Tạo biến `BOOTH_UPLOAD_KEYS` trên Vercel (mình đưa sẵn hash; mã gốc chỉ nằm trên máy phòng).
- Cài app lên 4 máy (mình viết hướng dẫn từng bước).
- Bật `PHOTO_UPLOAD_CLEANUP_ENABLED=true` sau khi xem kết quả chạy thử.
- Quyết thời điểm tắt Google Drive.

## 8. Để builder quyết

- Đóng gói app Windows (Node + exe một file, hoặc ngôn ngữ khác) và cách tự chạy khi khởi động.
- Cách báo thư mục sai tên (thông báo Windows, log, hay cả hai).
- Khoảng thời gian tự kiểm tra ảnh mới trên trang ghép khung (đề xuất 10 giây) và hạn signed URL.
- Thông điệp khi không có ảnh / hết hạn.
- Giao diện chọn nhiều khung, miễn là một nút gửi và có tiến độ từng khung.

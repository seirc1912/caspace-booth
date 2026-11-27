# App gửi ảnh phòng chụp (Caspace Booth Agent)

Chạy ngầm trên máy Windows của mỗi phòng chụp. Khi Capture One xuất ảnh vào
`C:\Users\ADMIN\Pictures\<số điện thoại>\Output\`, app tự gửi ảnh lên caspace.vn để
khách nhập số điện thoại là thấy ảnh. Không cần Google Drive hay gửi link.

## App làm gì

- Chỉ gửi ảnh JPEG trong thư mục `Output` của mỗi phiên (không gửi RAW, cache, `Selects`, `Trash`).
- Số điện thoại lấy từ **10 số đầu tiên** của tên thư mục phiên: `0947860616`, `0947860616-1`,
  `0856650134 tim` đều đúng. Các phiên cùng số dồn chung một chỗ.
- Thư mục không có số 10 số (`tim`, `ly`, `857 tim`, `032648341`) **không được gửi**: app hiện thông báo
  Windows và liệt kê ở trang trạng thái. Đổi tên thư mục cho đúng là app tự gửi.
- Chờ Capture One ghi xong file rồi mới gửi; mỗi lần 1 ảnh để không làm chậm máy.
- Mất mạng: tự thử lại liên tục; có mạng lại là gửi tiếp. Tắt máy rồi bật lại: tự gửi bù ảnh của 6 giờ gần nhất.
- Chỉ gửi ảnh xuất từ ngày 25/11/2026 trở đi; ảnh cũ hơn không bao giờ được gửi (kể cả khi bấm "Gửi lại thư mục").
- Ảnh phòng chụp trên hệ thống tự xoá sau 6 giờ (thư mục trên máy vẫn giữ nguyên). Khách cần ảnh cũ hơn: gửi link Google Drive, hoặc dùng **"Gửi lại thư mục"** ở trang trạng thái (gõ số điện thoại hoặc tên thư mục; nếu không gửi được, trang ghi rõ lý do).
- Mỗi máy gửi 8 ảnh cùng lúc (từ bản 1.1.4; 200 ảnh khoảng 5–8 phút). Ô **"Tốc độ gửi"** ở trang trạng thái cho biết ảnh gốc mất bao nhiêu giây và bao nhiêu Mbps (20 ảnh gần nhất): máy nào chậm hẳn so với máy khác là máy đó có vấn đề (mạng, Google Drive, diệt virus).

## Trang trạng thái

Lối tắt **"Gửi ảnh Caspace"** trên màn hình và trong Start → Caspace (http://127.0.0.1:47821): số ảnh đang chờ, đã gửi, lỗi mạng,
thư mục sai tên, ô "Gửi lại thư mục".

## Cài đặt (làm 1 lần mỗi máy, không cần terminal)

1. Chủ quán tạo mã cho 4 máy (trên máy có repo):
   `node booth-agent/scripts/make-keys.mjs booth-1 booth-2 booth-3 booth-4`
   - Dòng `BOOTH_UPLOAD_KEYS` → dán vào Vercel (Settings → Environment Variables, Production).
   - Mỗi mã `booth-N` dùng ở bước 3 cho đúng máy. Không gửi mã qua chat.
2. Chép file **`CaspaceBoothSetup-<phiên bản>.exe`** sang máy phòng chụp (USB hoặc Drive) và bấm đúp.
   - Windows có thể báo "Windows protected your PC" (file chưa ký số): bấm **More info → Run anyway**.
   - Bấm **Yes** khi Windows hỏi quyền quản trị.
3. Màn "Thông tin máy phòng chụp": chọn **Mã phòng**, nhập **Mã bí mật** (8 ký tự; tick "Hiện mã" để kiểm tra), giữ nguyên
   **Máy chủ** `https://caspace.vn` và **Thư mục ảnh** `C:\Users\ADMIN\Pictures` (đổi nếu Capture One lưu chỗ khác) → **Install**.
4. Màn cuối tick "Mở trang trạng thái" → **Finish**. Trang phải báo "Mạng / máy chủ: bình thường".
5. Chụp thử 1 phiên với số điện thoại test → mở caspace.vn, nhập số đó → thấy ảnh.

Setup cài vào `C:\Program Files\CaspaceBooth` (kèm Node.js riêng, không ảnh hưởng phần mềm khác), tự chạy ngầm khi
đăng nhập Windows (không hiện cửa sổ), tự bật lại nếu bị tắt. Nhật ký: `C:\Program Files\CaspaceBooth\logs\agent.log`.

**Cập nhật phiên bản:** chạy Setup mới, để trống các ô → giữ nguyên mã và cấu hình cũ.

Thử trên máy ảo Parallels với hệ thống local trên Mac: ở ô **Máy chủ** nhập `http://10.211.55.2:3000`
(xem `scripts/local-dev.md`).

## Build Setup.exe (trên Mac)

```bash
brew install makensis        # một lần
node booth-agent/installer/build.mjs
# → booth-agent/build/CaspaceBoothSetup-<version>.exe
```

Build tự tải Node.js Windows (kiểm SHA-256 với nodejs.org) và bản Windows của `sharp`.

## Gỡ / tạm dừng

Windows **Settings → Apps → "Gửi ảnh phòng chụp Caspace" → Uninstall** (hoặc Start → Caspace → Gỡ cài đặt): dừng tự chạy, xoá `C:\Program Files\CaspaceBooth`; ảnh trong `Pictures` giữ nguyên.
Thu hồi một máy: xoá dòng `booth-N` khỏi `BOOTH_UPLOAD_KEYS` trên Vercel.

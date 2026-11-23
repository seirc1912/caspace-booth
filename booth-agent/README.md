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
- Mất mạng: tự thử lại liên tục; có mạng lại là gửi tiếp. Tắt máy rồi bật lại: tự gửi bù ảnh của 24 giờ gần nhất.
- Ảnh trên hệ thống tự xoá sau 3 ngày. Khách cần ảnh cũ hơn: dùng **"Gửi lại thư mục"** ở trang trạng thái.

## Trang trạng thái

Lối tắt **"Gửi ảnh Caspace"** trên màn hình (http://127.0.0.1:47821): số ảnh đang chờ, đã gửi, lỗi mạng,
thư mục sai tên, ô "Gửi lại thư mục".

## Cài đặt (làm 1 lần mỗi máy)

1. Chủ quán tạo mã cho 4 máy trên máy của mình:
   `node booth-agent/scripts/make-keys.mjs booth-1 booth-2 booth-3 booth-4`
   - Dòng `BOOTH_UPLOAD_KEYS` → dán vào Vercel (Settings → Environment Variables, môi trường Production).
   - Mỗi mã `booth-N` → dùng ở bước 3 cho đúng máy. Không gửi mã qua chat.
2. Chép thư mục `booth-agent` sang máy phòng chụp (USB hoặc Drive).
3. Mở PowerShell **Run as Administrator**, vào thư mục đó và chạy:
   `powershell -ExecutionPolicy Bypass -File .\install.ps1`
   Nhập mã phòng (`booth-1`) và mã bí mật của máy.
4. Mở lối tắt "Gửi ảnh Caspace" kiểm tra trạng thái "bình thường".
5. Chụp thử 1 phiên với số điện thoại test → mở caspace.vn, nhập số đó → thấy ảnh.

Thử trên máy ảo (Parallels) với hệ thống local trên Mac:
`.\install.ps1 -ApiBaseUrl http://10.211.55.2:3000` (xem `scripts/local-dev.md`).

## Gỡ / tạm dừng

`powershell -ExecutionPolicy Bypass -File .\uninstall.ps1` — dừng tự chạy; ảnh trong `Pictures` giữ nguyên.
Thu hồi một máy: xoá dòng `booth-N` khỏi `BOOTH_UPLOAD_KEYS` trên Vercel.

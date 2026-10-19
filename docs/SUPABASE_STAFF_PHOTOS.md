# Kho ảnh khách dành cho nhân viên

Trang `/staff/photos` dùng Supabase Auth để đăng nhập một tài khoản staff dùng chung và API phía máy chủ để đọc bucket riêng tư `customer-photo-uploads`. Trình duyệt không nhận email nội bộ, service-role key hoặc access token; phiên Supabase được giữ trong cookie `HttpOnly`, `Secure`, `SameSite=Strict`. Không có API đăng ký tài khoản công khai.

## Cấu hình bắt buộc

Giữ nguyên các biến Supabase hiện có và thêm biến chỉ dùng phía máy chủ:

```text
STAFF_PHOTO_AUTH_EMAIL=internal-staff-identity@example.com
STAFF_PHOTO_AUTH_USER_ID=uuid-cua-supabase-auth-user
```

- Khai báo hai biến này riêng cho môi trường Vercel Preview trước khi kiểm thử.
- Không đặt tiền tố `VITE_`; các biến không được đưa vào bundle trình duyệt.
- Username công khai duy nhất là `caspace_staff`; server ánh xạ username này sang email nội bộ.
- Thiếu email hoặc user ID sẽ từ chối toàn bộ đăng nhập/quyền staff.

Chủ dự án tự tạo đúng một tài khoản nội bộ trong Supabase Dashboard → Authentication → Users, đặt mật khẩu mạnh và lấy UUID của user. Không bật public signup. Mỗi request danh sách, xem trước, tải file hoặc ZIP đều xác minh access token HttpOnly với Supabase rồi so sánh UUID ở phía máy chủ; username do trình duyệt gửi không bao giờ cấp quyền trực tiếp.

### Đổi mật khẩu hoặc thu hồi phiên

1. Chủ dự án đổi mật khẩu của identity nội bộ trong Supabase Dashboard → Authentication → Users.
2. Dùng hành động **Sign out user / Sign out all sessions** trong Dashboard để thu hồi các phiên đang hoạt động.
3. Staff đăng nhập lại bằng username `caspace_staff` và mật khẩu mới.

Không gửi email nội bộ hoặc mật khẩu qua chat, source code hay biến `VITE_*`.

## Mô hình truy cập

- Bucket phải tiếp tục là **PRIVATE**.
- Staff chỉ tìm theo số điện thoại Việt Nam đã chuẩn hóa và chỉ được truy cập object bên trong đúng prefix đó.
- Preview ảnh là signed URL ngắn hạn (5 phút), file gốc là signed URL ngắn hạn (60 giây).
- Không cung cấp API liệt kê toàn bucket và không cho phép đường dẫn chéo sang khách khác.
- Giới hạn tốc độ hiện có áp dụng cho tất cả API staff.

Không cần thay đổi bảng dữ liệu, migration, RLS hoặc policy của bucket. Không thay đổi bucket khác.

## Hiệu năng và ZIP

Sau đăng nhập, trang tự liệt kê các prefix số điện thoại thành lưới thư mục. Danh sách thư mục tải 24 mục mỗi trang và tìm kiếm một phần được thực hiện phía server; mỗi thư mục chỉ đọc metadata để tính số ảnh và lần tải gần nhất, không tải byte ảnh. Các request metadata được giới hạn theo nhóm để tránh dồn tải lên Storage.

Danh sách trong một thư mục tải 40 ảnh mỗi trang; ảnh xem trước dùng transform nhỏ và lazy loading. ZIP được tạo theo kiểu streaming trên server, đọc từng object riêng tư và lưu nguyên byte, không resize hoặc recompress ảnh. Trình duyệt vẫn cần nhận file ZIP hoàn chỉnh để bắt đầu tải xuống; với thư mục cực lớn, nên tải từng file hoặc chia theo đợt để tránh giới hạn bộ nhớ thiết bị và thời gian chạy của Vercel Function.

## Kiểm thử Preview

1. Xác nhận `STAFF_PHOTO_AUTH_EMAIL` và `STAFF_PHOTO_AUTH_USER_ID` chỉ tồn tại trong Preview.
2. Đăng nhập bằng tài khoản được duyệt và tìm một số điện thoại có dữ liệu thử.
3. Kiểm tra thumbnail, tên file, dung lượng và thời gian tải lên.
4. Tải một file gốc và so sánh SHA-256 với object trong Storage.
5. Tải ZIP và xác nhận byte của từng file không đổi.
6. Dùng token/cookie của Supabase user khác: API phải trả `403`.
7. Gọi API không có token hoặc token hết hạn: API phải trả `401`.
8. Thử đường dẫn của prefix khác hoặc `../`: API phải từ chối.

Việc tạo identity nội bộ và thêm hai biến Preview là thao tác thủ công của chủ dự án. Không triển khai Production cho đến khi Preview được duyệt.

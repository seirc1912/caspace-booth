# Kho ảnh khách dành cho nhân viên

Trang `/staff/photos` dùng Supabase Auth để đăng nhập và API phía máy chủ để đọc bucket riêng tư `customer-photo-uploads`. Trình duyệt không bao giờ nhận service-role key và không có API đăng ký tài khoản công khai.

## Cấu hình bắt buộc

Giữ nguyên các biến Supabase hiện có và thêm biến chỉ dùng phía máy chủ:

```text
STAFF_PHOTO_EMAIL_ALLOWLIST=staff1@example.com,staff2@example.com
```

- Khai báo biến này riêng cho môi trường Vercel Preview trước khi kiểm thử.
- Không đặt tiền tố `VITE_`; biến không được đưa vào bundle trình duyệt.
- Email được chuẩn hóa chữ thường và phải khớp chính xác.
- Danh sách trống sẽ từ chối toàn bộ yêu cầu staff.

Chủ dự án tự tạo tài khoản đã duyệt trong Supabase Dashboard → Authentication → Users. Không bật public signup chỉ để phục vụ trang này. Mỗi request danh sách, xem trước, tải file hoặc ZIP đều xác minh access token với Supabase rồi kiểm tra email trong allowlist phía máy chủ.

## Mô hình truy cập

- Bucket phải tiếp tục là **PRIVATE**.
- Staff chỉ tìm theo số điện thoại Việt Nam đã chuẩn hóa và chỉ được truy cập object bên trong đúng prefix đó.
- Preview ảnh là signed URL ngắn hạn (5 phút), file gốc là signed URL ngắn hạn (60 giây).
- Không cung cấp API liệt kê toàn bucket và không cho phép đường dẫn chéo sang khách khác.
- Giới hạn tốc độ hiện có áp dụng cho tất cả API staff.

Không cần thay đổi bảng dữ liệu, migration, RLS hoặc policy của bucket. Không thay đổi bucket khác.

## Hiệu năng và ZIP

Danh sách tải 40 ảnh mỗi trang; ảnh xem trước dùng transform nhỏ và lazy loading. ZIP được tạo theo kiểu streaming trên server, đọc từng object riêng tư và lưu nguyên byte, không resize hoặc recompress ảnh. Trình duyệt vẫn cần nhận file ZIP hoàn chỉnh để bắt đầu tải xuống; với thư mục cực lớn, nên tải từng file hoặc chia theo đợt để tránh giới hạn bộ nhớ thiết bị và thời gian chạy của Vercel Function.

## Kiểm thử Preview

1. Xác nhận `STAFF_PHOTO_EMAIL_ALLOWLIST` chỉ tồn tại trong Preview.
2. Đăng nhập bằng tài khoản được duyệt và tìm một số điện thoại có dữ liệu thử.
3. Kiểm tra thumbnail, tên file, dung lượng và thời gian tải lên.
4. Tải một file gốc và so sánh SHA-256 với object trong Storage.
5. Tải ZIP và xác nhận byte của từng file không đổi.
6. Dùng tài khoản Supabase không có trong allowlist: API phải trả `403`.
7. Gọi API không có token hoặc token hết hạn: API phải trả `401`.
8. Thử đường dẫn của prefix khác hoặc `../`: API phải từ chối.

Việc tạo tài khoản staff và thêm allowlist là thao tác thủ công của chủ dự án. Không triển khai Production cho đến khi Preview được duyệt.

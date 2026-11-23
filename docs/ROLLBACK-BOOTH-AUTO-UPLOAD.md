# Rollback — ảnh phòng chụp tự lên hệ thống

Thiết kế: `docs/superpowers/specs/2026-11-23-booth-auto-upload-design.md`.
Mốc trước khi sửa: deployment Production hiện tại lúc merge PR đầu tiên (ghi vào bảng dưới) và
`main` tại commit đó. Không có migration, RLS, bucket mới hay đổi policy → rollback chỉ là đổi code.

## Tắt nhanh từng phần (không cần deploy)

| Muốn tắt | Làm gì | Hệ quả |
|---|---|---|
| Máy phòng chụp gửi ảnh | Trên máy đó: `uninstall.ps1` (hoặc tắt tác vụ "Caspace Booth Agent") | Ảnh vẫn nằm trong `Pictures`, quay lại cách Google Drive |
| Một máy bị lộ mã | Xoá dòng `booth-N` khỏi `BOOTH_UPLOAD_KEYS` trên Vercel | Máy đó nhận 401, máy khác bình thường |
| Mọi máy phòng chụp | Xoá biến `BOOTH_UPLOAD_KEYS` | API booth trả 503 |
| Xoá ảnh sau 3 ngày | Xoá/đổi `PHOTO_UPLOAD_CLEANUP_ENABLED` ≠ `true` | Cron chỉ đếm, không xoá |

**Không khôi phục được:** ảnh/khung đã bị cron xoá (khi `PHOTO_UPLOAD_CLEANUP_ENABLED=true`).
Ảnh gốc phòng chụp vẫn còn trên máy Capture One → "Gửi lại thư mục".

## Rollback code

- Vercel Instant Rollback về deployment ngay trước PR có vấn đề (bảng dưới), rồi revert merge commit:
  `git revert -m 1 <merge-commit>`.
- Phụ thuộc: trang chọn ảnh (PR C) cần API khách (cùng PR); app phòng chụp (PR B) cần API booth (PR A).
  Gỡ PR A thì gỡ luôn B; gỡ C không ảnh hưởng A/B (ảnh vẫn lên, khách chỉ không thấy).
- Dữ liệu `{sđt}/_booth/` để nguyên cũng không ảnh hưởng code cũ: trang staff cũ chỉ đọc file cấp `{sđt}/`.
- Code cũ dùng RPC `customer_start_photo_session` (bucket public `session-photos`); bản mới không gọi nữa.
  Rollback sẽ gọi lại RPC đó như trước — không cần làm gì thêm.

| PR | Vercel deployment ID | Commit | Ghi chú |
|---|---|---|---|
| (mốc) | | | trước khi merge |

# Rollback — ảnh phòng chụp tự lên hệ thống

Thiết kế: `docs/superpowers/specs/2026-11-23-booth-auto-upload-design.md`.
Mốc trước khi sửa: deployment Production hiện tại lúc merge PR đầu tiên (ghi vào bảng dưới) và
`main` tại commit đó. Không có migration, RLS, bucket mới hay đổi policy → rollback chỉ là đổi code.

## Tắt nhanh từng phần (không cần deploy)

| Muốn tắt | Làm gì | Hệ quả |
|---|---|---|
| Máy phòng chụp gửi ảnh | Trên máy đó: Settings → Apps → "Gửi ảnh phòng chụp Caspace" → Uninstall (hoặc tắt tác vụ "Caspace Booth Agent") | Ảnh vẫn nằm trong `Pictures`, quay lại cách Google Drive |
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
| (mốc) | `dpl_CAzYyLvQq3Upv4xrVuv9Qs1eNsF3` | `00624dd` | trước khi merge (= sau #89) |
| #90 spec + plan | `dpl_HYgTkHfK8Sx5VLQuHst2L8DAG46y` | `1c888b7` | 24/11/2026 01:15, chỉ tài liệu |
| #91 A · API booth | `dpl_HrGJDoBmfHymYzDxZEk8uFNjNMXD` | `11759d6` | `/api/booth/*` trả 503 tới khi có `BOOTH_UPLOAD_KEYS` Production |
| #92 B · booth-agent | `dpl_ZLoC2RDiAfVh54qHfYxe4TBbjTXQ` | `f88df4b` | không đổi web |
| #93 C · chọn ảnh phòng chụp | `dpl_3inahejhN9swa2v2NduGQesFY5KM` | `52863cd` | bỏ RPC `customer_start_photo_session`; không có ảnh → vào editor như cũ |
| #94 D · gửi nhiều khung | `dpl_HLsref5QDx9N8YcWfPu2tHu1J1Hp` | `a3f3a8f` | |
| #95 E · staff mở lại 6 giờ | `dpl_7TQBcYrbeEserjVfEzNXVnZatPYE` | `c0e9d9e` | |
| #96 F · cron 3 ngày | `dpl_6VgbtovzMJ9xVHDZDe6gXpnK7Ko5` | `33b95c7` | cron trả 401 tới khi có `CRON_SECRET` Production → không xoá gì |
| #97 G · tài liệu | `dpl_Euzf7Z8p4kP7tnF1oMePCNJ2KWid` | `c5f940b` | |
| #98 H · Setup.exe, tab ảnh gốc staff | `dpl_Cv3oyMRccQd1ByFVTFRerLyPe9DJ` | `7cf2cdf` | smoke OK, 0 runtime error sau 1 giờ đầu |

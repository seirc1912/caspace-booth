# Rollback — tối ưu gửi ảnh (PR 0 → PR 9)

Mục đích: nếu có sự cố sau khi merge/deploy các PR trong `docs/KE-HOACH-TOI-UU-UPLOAD-ANH.md` §8, đưa hệ thống về **đúng code trước khi sửa**.

## Mốc trước khi sửa

| Mốc | Giá trị |
|---|---|
| Git tag | `baseline/pre-upload-optimization` → commit `9625fbd` (= `main` ngày 21/11/2026) |
| Vercel Production | deployment `dpl_2U3971Gf8aJ75u7t3PimGiz1q5ey` (commit `9625fbd`, tạo 23/10/2026), alias `caspace.vn` |
| Bản sao lưu ngoài repo | `caspace-booth-backup-2026-11-21.bundle` (main + tag + 10 nhánh), khôi phục: `git clone <file>.bundle` |

**Thứ tự bắt buộc khi có quyền Write:** push tag `baseline/pre-upload-optimization` **trước**, rồi mới push các nhánh.

## Rollback có an toàn về dữ liệu không?

Đã kiểm tra — rollback chỉ là đổi code, không cần sửa dữ liệu:
- Không PR nào sửa `supabase/` (không migration, không RLS, không đổi bucket).
- Không có biến môi trường bắt buộc mới. `CRON_SECRET`, `PHOTO_UPLOAD_CLEANUP_ENABLED` là tuỳ chọn; xoá đi không ảnh hưởng.
- Ảnh nhỏ `{sđt}/_thumbs/*.jpg` (PR 1): code cũ lọc `file.id && imagePattern`, bỏ qua thư mục con → không hiện, không tính vào số ảnh, không vào ZIP. Có thể để nguyên (vài chục KB/ảnh).
- File khung `.jpg` (PR 4): code cũ vẫn nhận JPEG ở `/upload-anh` và trang staff.
- File gửi qua TUS `/upload/resumable/sign` (PR 3) là object bình thường.
- Rate limit, số đo: chỉ trong bộ nhớ/log, không lưu dữ liệu.
- **Ngoại lệ duy nhất:** nếu đã bật `PHOTO_UPLOAD_CLEANUP_ENABLED=true` (PR 7), ảnh > 7 ngày đã xoá **không khôi phục bằng rollback được** → chỉ bật sau khi owner duyệt.

## Khi nào rollback

Theo dõi 2 giờ đầu sau mỗi lần lên Production (`node scripts/upload-timing-report.mjs --since 2h`, `vercel logs --scope caspace1 --project caspace --query 'level:error'`). Rollback ngay nếu:
- Tỉ lệ file thất bại hẳn > 10 % (mốc cũ ~7,5 %), hoặc xuất hiện mã lỗi mới tăng liên tục;
- Khách báo không gửi được ảnh / editor không lưu được khung;
- Trang `/staff/photos` không mở được hoặc tải file gốc/ZIP sai;
- Bản in JPEG bị owner đánh giá không đạt (chỉ revert PR 4).

## Cách 1 — Vercel Instant Rollback (nhanh nhất, ~vài giây, không đổi git)

Dùng tài khoản có quyền team `caspace1`.

```bash
vercel rollback dpl_2U3971Gf8aJ75u7t3PimGiz1q5ey --scope caspace1
# hoặc Dashboard → caspace → Deployments → deployment 23/10 (9625fbd) → "Instant Rollback"
```

Lưu ý: sau Instant Rollback, Vercel **tạm dừng tự promote** các deploy Production mới. Khi đã sửa xong, promote lại bằng `vercel promote <deployment-url> --scope caspace1` (hoặc nút "Undo Rollback"). Cách 1 chỉ là biện pháp tức thời — làm tiếp Cách 2 hoặc 3 để `main` khớp với Production.

## Cách 2 — Đưa `main` về đúng code trước khi sửa (toàn bộ)

Một commit tiến (không force-push, không viết lại lịch sử), đã diễn tập: sau lệnh này `git diff baseline/pre-upload-optimization HEAD` rỗng.

```bash
git fetch origin --tags
git switch -c revert/upload-optimization origin/main
git restore --source=baseline/pre-upload-optimization --staged --worktree -- :/
git commit -m "revert: restore code to baseline/pre-upload-optimization"
git diff --stat baseline/pre-upload-optimization HEAD   # phải rỗng
git push -u origin revert/upload-optimization            # mở PR → merge → Vercel deploy
```

## Cách 3 — Chỉ gỡ một PR

Các PR được merge lần lượt (merge commit). Revert merge commit của PR có vấn đề — đã diễn tập với PR 4:

```bash
git switch -c revert/pr-4 origin/main
git revert -m 1 <merge-commit-của-PR>
npm test && npm run typecheck -w client && npm run build -w client
git push -u origin revert/pr-4
```

Phụ thuộc giữa các PR (gỡ PR ở cột trái thì gỡ luôn cột phải):

| Gỡ | Cần gỡ kèm | Ghi chú |
|---|---|---|
| PR 0 (đo) | — | PR 1–9 vẫn chạy; chỉ mất số đo phía điện thoại (sẽ có xung đột nhỏ ở `uploadClient.ts`/`PhotoUploadPage.tsx`, giải quyết bằng cách giữ phần của PR sau) |
| PR 1 (ảnh nhỏ) | — | Trang staff quay lại dùng Image Transformations (vượt hạn mức) |
| PR 2 (thử lại, không dừng lượt) | PR 5 | PR 5 dùng hàng đợi song song của PR 2 |
| PR 3 (TUS) | — | File > 6 MB quay lại lỗi 400 → gửi lại thường |
| PR 4 (JPEG) | — | Quay lại PNG |
| PR 5 (song song) | — | Hoặc chỉ đổi `MAX_UPLOAD_CONCURRENCY` về 1 |
| PR 6 (rate limit) | — | |
| PR 7 (cron dọn) | — | Nhanh nhất: xoá/đặt `PHOTO_UPLOAD_CLEANUP_ENABLED` ≠ `true` (không cần deploy lại code) |
| PR 8, PR 9 | — | Không ảnh hưởng hành vi |

## Quy trình merge để luôn rollback được

1. Push tag `baseline/pre-upload-optimization` trước tiên.
2. Merge **từng PR một** theo thứ tự PR 0 → PR 9 (merge commit, không squash nhiều PR vào một), chờ Vercel Preview + kiểm tra nhanh trước mỗi lần.
3. Sau mỗi lần lên Production: theo dõi 2 giờ như trên; ghi deployment ID mới vào bảng dưới để có thể Instant Rollback về **bước ngay trước**, không chỉ về mốc ban đầu.

| Sau PR | Vercel deployment ID | Commit | Ghi chú |
|---|---|---|---|
| (mốc) | `dpl_2U3971Gf8aJ75u7t3PimGiz1q5ey` | `9625fbd` | trước khi sửa |
| PR 0 (#73) | `dpl_Ctsu8sPcDxtoHJ2JShqAFqxVQjJz` | `59f3c6f` | 22/11/2026 ~00:00 VN, smoke OK |
| PR 1 (#74) | `dpl_CJ9jcdp218TMF75cZZUeWz1TCjLR` | `50467be` | smoke OK |
| PR 2 (#75) | `dpl_4H9AmWazbbzyNbqVerUs5FtaPjbT` | `797af97` | smoke OK |
| PR 3 (#76) | `dpl_5SmycAHyxSESFixQZyVckxN4Dq9x` | `efe6ff2` | smoke OK; chờ owner test thật trên điện thoại (file > 6 MB) |
| #83 (ẩn khung số đo) | `dpl_F7C5e6kop3pJS2sgwZFonEAJXXhp` | `c621410` | chỉ ẩn UI, log giữ nguyên; smoke OK |

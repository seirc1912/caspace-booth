# Cá Space — Bàn giao giao diện "Chrome" cho Claude Code

> Dán phần **Prompt** bên dưới vào Claude Code (chạy ở thư mục gốc repo caspace.vn), kèm file này. Nếu được, đính kèm ảnh chụp các wireframe WF-01 → WF-09 và các màn trên trang "Cá Space · Chrome" của canvas thiết kế.

---

## Prompt

```
Bạn là frontend engineer của repo caspace.vn (Tailwind CSS). Hãy làm lại toàn bộ giao diện theo đặc tả trong file CaSpace-ClaudeCode-Handoff.md (đọc hết trước khi sửa code).

Thứ tự làm:
1. Khảo sát repo: liệt kê route, component, style, asset, chuỗi văn bản, cấu hình admin đang dùng cho /, /rooms, /booth-photos, /editor, bước gửi in, /color-lab, /upload-anh, 404. Báo lại ngắn gọn trước khi sửa.
2. Thêm design token (mục 1) vào Tailwind config + CSS variables, nạp font Be Vietnam Pro và JetBrains Mono (có subset vietnamese).
3. Tạo bộ component dùng chung (mục 2), rồi dựng lại từng màn theo mục 3 (WF-01 → WF-09). Giữ nguyên route, logic gọi API và luồng dữ liệu hiện có; chỉ đổi giao diện, chữ và cấu trúc điều khiển như đặc tả.
4. Dọn dẹp (mục 4): tìm mọi thứ KHÔNG còn được dùng sau redesign và XOÁ HẲN (component, style, asset, chuỗi i18n, biến env, import, file). Không để code chết, không comment-out. Riêng cột DB / trường admin / file trên Supabase: liệt kê và hỏi tôi trước khi xoá.
5. Kiểm tra theo mục 5 (build, lint, type-check, test hiện có, và tự rà checklist). Báo cáo: file đã sửa, file đã xoá, những gì còn cần tôi quyết.

Ràng buộc: toàn bộ chữ tiếng Việt (trừ tên riêng "Cá Color Lab" và tên phòng), mobile-first 390px (dải 360–430px; desktop chỉ căn giữa cột 430px), WCAG AA (chữ ≥ 4.5:1), vùng chạm ≥ 44px, ô nhập chữ ≥ 16px, cuộn bằng body (không dùng khung 100vh overflow-auto), thanh nút chính dính đáy có safe-area iPhone.
Không dùng tagline "Preserve your memories." ở bất kỳ đâu.
```

---

## 1. Design tokens

### Màu

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--cs-ink` | `#0D0E10` | Chữ chính, nút chính, vạch bước đã xong |
| `--cs-ink-2` | `#2E3237` | Chữ phụ trên nền kim loại |
| `--cs-ink-3` | `#3F434A` | Chữ phụ trên panel chrome |
| `--cs-graphite` | `#1C1E22` | Nền LCD (ô nhập, sân khấu editor, footer) |
| `--cs-chrome-50` | `#F4F5F6` | Mặt panel sáng |
| `--cs-chrome-200` | `#D3D5D8` | Đáy gradient nút phụ |
| `--cs-chrome-400` | `#9EA2A8` | Viền |
| `--cs-chrome-600` | `#6E737A` | Viền đứt nét, viền nút phụ đậm |
| `--cs-led` | `#FF2D55` | LED: bước hiện tại, ảnh đã chọn, viền lỗi (KHÔNG dùng làm màu chữ nhỏ) |
| `--cs-red-text` | `#B3122E` | Eyebrow, chữ lỗi |
| `--cs-red-btn` | `#E0244A → #B3122E` | Chỉ nút "Gửi … cho quầy in" |
| `--cs-led-green` | `#34D399` | Chấm hợp lệ |
| `--cs-green-text` | `#15803D` | Chữ "sẵn sàng" |
| `--cs-disabled-bg` / `--cs-disabled-fg` | `#B4B7BB` / `#2A2D32` | Nút khoá (viền đứt `#6E737A`) |
| Alert lỗi | nền `#FFF1F3`, viền `#F3A3B2`, chữ `#8A0A24` | |
| Alert thành công | nền `#ECFDF3`, viền `#86D9A8`, chữ `#0B5A2B` | |

### Bề mặt (CSS, không dùng ảnh nền)

```css
/* Nền kim loại xước — thay ảnh nền Supabase */
.cs-metal {
  background-color: #C6C8CB;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,.14) 0 1px, rgba(0,0,0,.04) 1px 3px),
    linear-gradient(100deg, #A9ACB1 0%, #E8E9EB 20%, #B8BBBF 40%, #F3F4F5 56%, #ADB0B5 74%, #D9DBDE 90%, #A3A7AC 100%);
  background-attachment: fixed; /* tắt trên iOS nếu giật */
}
/* Panel chrome */
.cs-panel {
  background: linear-gradient(180deg, #FBFBFC 0%, #E9EAEC 100%);
  border: 1px solid #fff;
  box-shadow: inset 0 -1px 0 rgba(0,0,0,.06), 0 0 0 1px rgba(70,74,80,.16), 0 20px 40px -18px rgba(20,22,26,.45);
}
/* Màn LCD */
.cs-lcd {
  background: linear-gradient(180deg, #0B0C0E 0%, #1C1E22 100%);
  box-shadow: inset 0 2px 6px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.9);
  color: #F5F6F7;
}
/* Nút chính */
.cs-btn-primary {
  background: linear-gradient(180deg, #33363C 0%, #0D0E10 100%);
  color: #F5F6F7; border: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 10px 22px -10px rgba(0,0,0,.7);
}
/* Nút phụ chrome */
.cs-btn-chrome {
  background: linear-gradient(180deg, #FFFFFF 0%, #D3D5D8 100%);
  color: #0D0E10; border: 1px solid #8E9298;
  box-shadow: inset 0 1px 0 #fff, 0 2px 6px rgba(0,0,0,.14);
}
/* Thanh đáy sticky */
.cs-bottom-bar {
  position: sticky; bottom: 0;
  padding: 12px 16px max(30px, env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(240,241,242,.95), rgba(206,208,211,.98));
  border-top: 1px solid #fff;
  box-shadow: 0 -1px 0 rgba(0,0,0,.12), 0 -16px 32px -12px rgba(0,0,0,.3);
}
/* LED */
.cs-led { background: #FF2D55; box-shadow: 0 0 8px rgba(255,45,85,.8); }
```

### Typography

| Vai trò | Font | Cỡ / đậm | Ghi chú |
| --- | --- | --- | --- |
| H1 màn | Be Vietnam Pro | 28–30 / 900, letter-spacing −0.035em | Tối đa 2 dòng |
| H2 / tiêu đề editor | Be Vietnam Pro | 16–22 / 900 | |
| Logo chữ | Be Vietnam Pro | 17–19 / 900 + chấm LED 9–10px | Không có tagline |
| Nút | Be Vietnam Pro | 16 / 800 (nút chính), 13–14 / 700 (phụ) | |
| Body | Be Vietnam Pro | 14–15 / 400, line-height 1.5 | |
| Ô nhập SĐT | Be Vietnam Pro | 22 / 700 (trang chủ), 18 / 700 (upload) | |
| Nhãn kỹ thuật, eyebrow, số bước | JetBrains Mono | 10–12 / 700, UPPERCASE, letter-spacing 0.08–0.14em | |

### Hình khối

Bo góc: panel 28 · thẻ 20 · nút / ô nhập 16 · ảnh 14 · pill 9999. Lề ngang 16px. Nút chính cao 56px. Icon: SVG nét 2px, bo tròn, 18–20px (không dùng ký tự Unicode hay emoji làm icon).

---

## 2. Component dùng chung

| Component | Biến thể / trạng thái |
| --- | --- |
| `AppHeader` | `home` (logo trái, không tagline) · `flow` (nút quay lại tròn 44 + logo giữa + "0X/06") · `sub` (pill "← Trang chủ" + logo giữa) |
| `Stepper` | 6 vạch: Số điện thoại · Phòng · Mẫu · Ảnh · Ghép khung · Gửi in; trạng thái xong / đang (LED) / chưa; dòng mono "Bước 0X/06 · Tên" + "Tiếp: …" |
| `Button` | primary · chrome (phụ) · icon (56×56) · back pill · send (đỏ); default / pressed (inset, dịch 1px) / disabled (nhãn nói rõ lý do) / loading (spinner) |
| `PhoneInput` | LCD; trống / đang nhập / hợp lệ (chấm xanh) / lỗi (viền LED + aria-invalid + helper đỏ) |
| `FilePicker` | rỗng (viền đứt) / đã chọn (thumbnail, tên, dung lượng, "Đổi ảnh") / đang gửi (progressbar %) / lỗi (viền đỏ) |
| `Alert` | lỗi / thành công; `role="alert"`; dùng cho ~15 thông báo upload |
| `ToolLinkCard` | icon nền đen + tiêu đề + mô tả 1 dòng, cao 64px |
| `RoomCard` | ảnh cover 170:110, mã P01…, tên + chấm màu mood + "N mẫu in" dưới ảnh; cả thẻ là link |
| `TemplateCard` | radio; ảnh vuông; "Khung 0X" + "N ảnh"; chọn = viền 3px LED + dấu ✓ |
| `PhotoTile` | chưa chọn (vòng trắng) / đã chọn (viền trong LED 3px + badge số thứ tự) / đủ số (mờ 55%) / ảnh mới đang tải; nút xem lớn vùng chạm 44 |
| `Lightbox` | đóng · "x / N" · trước/sau · Lưu · "Chọn ảnh này" / "Đã chọn · thứ tự k" |
| `BottomSheet` | menu phụ bước 4, chọn khung khác ở bước 5 |
| `EditorToolbar` | 6 nút icon + nhãn: Tự xếp · Cắt · Phóng to · Đen trắng (toggle) · Thay ảnh · Xoá |
| `SiteFooter` | nền graphite, icon SVG, "357 Điện Biên Phủ", "0949 256 173", caspace.vn, Instagram; mỗi link ≥ 44px; ẩn trên /editor |
| `EmptyState` / `Skeleton` | "Đang tải phòng…", "Chưa có phòng nào", "Chưa có ảnh từ phòng chụp…" |

---

## 3. Đặc tả từng màn (khớp wireframe trên canvas)

Số trong ngoặc là số đánh dấu trên wireframe.

### WF-01 · Bước 1 · Số điện thoại — `/`
1. Header `home`: logo "Cá Space" + LED, **không có tagline**.
2. Stepper bước 1.
3. Panel chrome: eyebrow "In ảnh tại studio" · H1 "Nhập số điện thoại để in ảnh" · mô tả "Dùng đúng số bạn đã đặt lịch chụp tại Cá Space." (các chữ này vẫn đọc từ admin nếu admin đang cấu hình; giao diện phải chịu được chữ dài và màu admin thay đổi).
4. `PhoneInput` 64px (`type=tel inputmode=numeric autocomplete=tel`).
5. Helper: mặc định "Chỉ dùng để tìm ảnh của bạn cho đơn in này." · đang nhập "Còn thiếu N số." · không khớp lịch "Số này chưa có lịch chụp. Kiểm tra lại, hoặc gọi 0949 256 173 để được hỗ trợ."
6. "Công cụ khác": 2 `ToolLinkCard` cạnh nhau → `/color-lab` ("Màu film cho ảnh"), `/upload-anh` ("Gửi ảnh gốc để in").
7. Dòng mono địa chỉ + số điện thoại; `SiteFooter` cuối trang.
8. Thanh đáy sticky: "Tiếp tục →"; khoá = "Nhập đủ 10 số để tiếp tục"; sau lỗi = "Kiểm tra lại số". Không bị bàn phím che.

### WF-02 · Bước 2 · Chọn phòng — `/rooms`
Header `flow` "02/06" + Stepper · H1 "Chọn phòng in" + "Mỗi phòng có phong cách và bộ khung in riêng." · lưới 2 cột `RoomCard` (bỏ nút "Enter Room", bỏ chữ trắng đè ảnh, sửa "Futurictic" → "Futuristic", bỏ chữ "Frame" trong tên phòng) · `SiteFooter`.

### WF-03 · Bước 3 · Chọn mẫu — màn mới
Hiện tại chọn mẫu nằm trong editor dưới dạng tab Frame. Tách thành màn riêng (route gợi ý `/rooms/[roomId]`, chọn theo router hiện có). Chip phòng đang chọn + "Đổi phòng" · H1 "Chọn mẫu khung" + "Số ô trên mẫu là số ảnh bạn sẽ cần chọn." · lưới 2 cột `TemplateCard` (radiogroup) · thanh đáy "Đã chọn Khung 0X · Cần N ảnh" + "Chọn ảnh cho mẫu này →".

### WF-04 · Bước 4 · Chọn ảnh — `/booth-photos`
H1 "Chọn N ảnh để in" (N = số ô của mẫu) + "Đang nhận ảnh mới · lưu 3 ngày" · segmented "Tất cả · X" / "Đã chọn · Y" + link "Bỏ chọn hết" · lưới 3 cột `PhotoTile` (cho phép 2 cột) · thanh đáy: tiến độ N vạch LED + nút `⋯` mở sheet ("Lưu Y ảnh đã chọn về máy", "Dùng ảnh từ điện thoại") + nút chính "Ghép vào khung →" (chưa đủ: khoá "Chọn thêm k ảnh"). Bỏ hướng dẫn "chạm đúp để xem lớn", bỏ nút "Chọn tất cả", bỏ thanh đáy 3 nút cũ. Kèm `Lightbox`.

### WF-05 · Bước 5 · Ghép khung — `/editor`
Một hàng trên: quay lại · "Ghép khung · Khung 0X" + "Đã ghép x/N ô" · "05/06". Sân khấu LCD cao ~474px, góc HUD, khung in giữa; ô đang chỉnh viền LED + 4 tay nắm. `EditorToolbar` 6 nút. Thanh đáy: "Khung khác" (sheet) + "Lưu & tiếp tục →" (thiếu ô: "Còn k ô trống"). Bỏ hàng tab Frame 1–10, hàng "Auto Fill 27 Photos / Add 1 Photo / Auto Fit", nhãn "0/1", thanh "Back · Original · B&W · All B&W · Skip". Ẩn `SiteFooter` trên route này.

### WF-06 · Bước 6 · Gửi in
H1 "Gửi khung cho quầy in" · danh sách khung: đủ ảnh có checkbox; thiếu ảnh hiện "Còn thiếu k ảnh" + nút "Ghép tiếp" · tóm tắt đơn (LCD) · nút đỏ "Gửi N khung cho quầy in". Thành công: "Đã gửi N khung", link Facebook / Instagram / TikTok / Zalo, nút "Về trang chủ".

### WF-07 · Cá Color Lab — `/color-lab`
Header `sub` · eyebrow "Cá Space giới thiệu" · H1 "Cá Color Lab" · mô tả tiếng Việt · khối LCD ảnh mẫu trước/sau + danh sách preset · nút "Chọn ảnh để chỉnh" + "Ảnh ở lại trên máy bạn, không tải lên". Trạng thái đang chỉnh: ảnh lớn, hàng preset (radiogroup), thanh "Cường độ", nút "Ảnh khác" + "Lưu ảnh về máy". Tên preset là đề xuất, giữ đúng preset mà code đang có.

### WF-08 · Upload ảnh — `/upload-anh`
Header `sub` · H1 "Upload ảnh" (không viết HOA) · `Alert` khi lỗi · panel ① `FilePicker` ② `PhoneInput` 56px · thanh đáy "Gửi ảnh" kèm hint theo trạng thái. Đủ 5 trạng thái: rỗng, đã chọn, đang gửi, thành công, lỗi.

### WF-09 · 404
Logo giữa · khối LCD "404" chữ chrome · "Không tìm thấy trang" · "Đường dẫn có thể đã sai hoặc trang không còn nữa." · nút "Về trang chủ Cá Space" · link "Cần hỗ trợ? Gọi 0949 256 173".

---

## 4. Dọn dẹp — phần không dùng thì xoá hẳn

Bắt buộc xoá (code, style, asset, chuỗi, import, test liên quan):

- Tagline **"Preserve your memories."** và component pill hiển thị nó, ở mọi nơi.
- Ảnh nền kim loại tải từ Supabase và code nạp/hiển thị nó (thay bằng `.cs-metal` CSS), cùng lớp nền kem chờ ảnh.
- Font Inter nếu không còn chỗ nào dùng.
- Chuỗi tiếng Anh cũ: "STEP X OF 6", "Choose your room", "Each room has its own mood…", "Enter Room", "N templates", "Choose your template", "Continue to photos", "Your number is used only for this order.", "Back", "Choose Photo", "Bring a photo to the Lab", "Film-inspired color…", "CÁ SPACE PRESENTS", "Auto Fill … Photos", "Add 1 Photo", "Auto Fit", "Add Image", "Original", "B&W", "All B&W", "Skip", "Save Photo", "Loading rooms…", "No rooms available.", "Return to Cá Space", v.v.
- Nút "Enter Room", nút "Chọn tất cả" ở bước 4, thanh đáy 3 nút cũ của bước 4, hàng tab Frame 1–10 và hàng Auto Fill/Add/Auto Fit trong editor, footer website hiển thị trong editor.
- Icon ký tự Unicode (⌖ ☎ ↗ ◎ ⤢ ✦) và emoji dùng làm icon.
- Khung cuộn `main { height: 100vh; overflow: auto }`.
- Mọi component, CSS class, util, hook, asset, key i18n, biến env sau khi sửa không còn được import/tham chiếu (kiểm tra bằng tìm kiếm toàn repo, `tsc --noEmit`/lint "unused", công cụ như `knip`/`ts-prune` nếu cài được).

Hỏi tôi trước khi xoá:

- Cột DB, bảng, trường cấu hình admin (ví dụ trường ảnh nền trang chủ, trường tagline nếu admin có), file trên Supabase Storage.

---

## 5. Tiêu chí nghiệm thu

- [ ] Không còn chuỗi "Preserve your memories" trong repo (`grep -ri "preserve your memories"` rỗng).
- [ ] Không còn chuỗi tiếng Anh hiển thị cho khách (trừ "Cá Color Lab", tên phòng, Facebook/Instagram/TikTok/Zalo).
- [ ] Mọi vùng chạm ≥ 44×44px; ô nhập ≥ 16px; tương phản chữ ≥ 4.5:1 (không dùng `#FF2D55` làm màu chữ nhỏ).
- [ ] Nút chính luôn thấy ở đáy khi bàn phím mở (iOS Safari), có safe-area.
- [ ] Trang cuộn bằng body; chạm status bar iOS về đầu trang.
- [ ] Hiển thị đúng ở 360, 390, 430px; desktop là cột mobile căn giữa.
- [ ] Stepper đúng 6 bước ở mọi màn của luồng.
- [ ] Nội dung trang chủ đổi từ admin (chữ dài, màu khác) không vỡ bố cục.
- [ ] Build, lint, type-check, test hiện có đều qua; không còn import/biến/file chết.
- [ ] Báo cáo cuối: danh sách file sửa, file xoá, và các mục DB/admin đang chờ tôi quyết.

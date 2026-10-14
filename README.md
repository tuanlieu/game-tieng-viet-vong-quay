# Game Tiếng Việt - Vòng Quay May Mắn

Bản mã nguồn **0.1.0 — luồng cốt lõi**, React + TypeScript + Vite, backend Supabase/PostgreSQL. Đây chưa phải sản phẩm đã nghiệm thu toàn bộ yêu cầu 19 mục. Chưa có repository đích hoặc dự án Supabase thật tại thời điểm bàn giao; chưa push, chưa triển khai production.

## Bắt đầu nhanh

1. Cài Node.js 24 LTS và npm.
2. Trong thư mục mã nguồn, chạy `npm ci`.
3. Sao chép `.env.example` thành `.env.local`, điền **URL Supabase và publishable key**. Không điền service-role key vào biến `VITE_*`.
4. Chạy `npm run dev`. Khi chưa cấu hình backend, giao diện vẫn mở và thông báo rõ các chức năng chưa kết nối.
5. Chạy `npm run check`, `npm run scan:secrets`, `npm audit` để kiểm tra mã nguồn.

## Thiết lập Supabase

Đọc [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) trước khi cấu hình. Tạo project riêng, không dùng database của lịch trực hoặc hệ thống khác. Áp dụng hai migration theo thứ tự:

- `supabase/migrations/202610140001_core.sql`
- `supabase/migrations/202610140002_security.sql`

Dùng Supabase CLI đã cài chính thức: `supabase login`, `supabase link --project-ref <project-ref>`, `supabase db push` và `supabase functions deploy username-login`.

Migration chạy một lần. Chưa chạy trên Supabase thật; kiểm tra trong staging trước. Sau khi áp dụng, kiểm tra RLS và grant thực tế, không chỉ kiểm tra file SQL.

## Tài khoản admin

Username khởi tạo là `tamit`. Nhập **email kỹ thuật, mật khẩu ban đầu và service-role key qua môi trường riêng tư**. Chạy `npm run bootstrap`. Mật khẩu theo yêu cầu người dùng không nằm trong mã nguồn, tài liệu hoặc seed. Script không ghi đè admin đã tạo và không in secret. Cần đổi mật khẩu lần đầu; tác vụ quản trị vai trò và nhật ký cần MFA.

Script cần các biến: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`. Chỉ dùng trên máy tin cậy. Không commit `.env` hoặc dán service-role key lên GitHub.

## Dữ liệu mẫu

`public/cau-hoi-mau.json` có 24 câu, đã kiểm tra bộ chữ khớp đáp án và chữ lặp. Tải file mẫu trong mục Bộ câu hỏi và nhập vào một bộ của bạn. Đây là **dữ liệu mẫu công khai dành cho tác giả**, không phải đáp án của phòng chơi. Không khẳng định các câu từng xuất hiện trên truyền hình.

## Vận hành

- [Hướng dẫn quản trị và chơi](docs/OPERATIONS.md)
- [Kiến trúc và bảo mật](docs/ARCHITECTURE.md)
- [Trạng thái từng tính năng](docs/STATUS.md)
- [Báo cáo kiểm thử thực tế](docs/TEST_REPORT.md)
- [Backup/restore/rollback](docs/BACKUP.md)

## Triển khai GitHub Pages

Tên repository đề xuất: `tuanlieu/game-tieng-viet-vong-quay`. Kết nối GitHub hiện có quyền push ở các repository khác, nhưng **không dùng chúng cho dự án này**. Bộ công cụ GitHub hiện được cung cấp không có thao tác tạo repository mới. Người dùng cần tạo repository trống và cung cấp link.

Workflow `ci.yml` kiểm tra mã nguồn. `pages.yml` chỉ chạy theo yêu cầu và chỉ triển khai khi các biến `ALLOW_PRODUCTION_DEPLOY`, `BACKEND_ACCEPTANCE_VERIFIED`, `BROWSER_QA_VERIFIED` đều là `true`. Chỉ bật sau khi kiểm thử backend thật, OAuth, E2E, responsive và restore đáp ứng yêu cầu nghiệm thu. Không bật chỉ vì unit test cục bộ đạt.

GitHub Pages chỉ phục vụ frontend. Auth/database/functions nằm ở Supabase. Điều hướng trong SPA giữ ở trang gốc, link phòng dùng hash nên tải lại không gặp lỗi đường dẫn con. Callback OAuth về đúng thư mục gốc của repository.

## Nguồn kỹ thuật và màu

Đã tra cứu ngày 14/10/2026:

- [Vite: triển khai tĩnh/GitHub Pages](https://vite.dev/guide/static-deploy)
- [Supabase: Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Facebook OAuth](https://supabase.com/docs/guides/auth/social-login/auth-facebook)
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: database functions](https://supabase.com/docs/guides/database/functions)
- [Pantone Cloud Dancer 2026](https://www.pantone.com/color-of-the-year/2026)
- [WGSN Transformative Teal 2026](https://www.wgsn.com/en/blog/key-colours-w-26-27)

Bảng phối website là thiết kế lấy cảm hứng; các mã HEX không được coi là mã chính thức của Pantone/Coloro. Lockfile khóa phiên bản đã cài. Package build/test được cập nhật sau quét dependency để loại các cảnh báo đã phát hiện.

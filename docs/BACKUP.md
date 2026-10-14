# Backup, restore và rollback

## Backup dữ liệu thật

Helper dùng pg_dump custom cho public/private và đọc toàn bộ bucket Storage bằng service-role, bao gồm file trong thư mục lồng nhau. Nội dung đóng gói thành JSON+gzip, manifest từng file có SHA-256 rồi mã hóa age. Temp là thư mục riêng tư; file plaintext được dọn sau thành công/lỗi. Không commit backup thật. Giới hạn helper 50 MiB dữ liệu plaintext; dùng quy trình streaming riêng nếu lớn hơn.

Cần cài `pg_dump` phù hợp phiên bản server và `age`. Biến riêng tư: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_AGE_RECIPIENT. Chạy `npm run backup`. Key giải mã giữ ngoài GitHub. Credentials database truyền bằng PG environment, không nằm trong command arguments/log. Không dùng tuổi đời của mã nguồn như bằng chứng backup dùng được.

Theo mặc định backup **không gồm schema Auth**. Có tùy chọn BACKUP_INCLUDE_AUTH=true nhưng restore helper cố ý từ chối loại này: phục hồi Auth cần quy trình staging riêng phù hợp cấu hình Supabase. OAuth/provider secrets, SMTP, redirect allowlists và cấu hình project không nằm trong dump; cần hồ sơ cấu hình riêng đã bảo vệ. Không hứa khôi phục toàn bộ tài khoản/phiên từ backup ứng dụng.

## Lịch và lưu trữ

Workflow backup.yml là lựa chọn có mã hóa trên repository private, tắt mặc định. ENABLE_ENCRYPTED_BACKUP=true và environment private-backup với secrets riêng mới cho chạy; lịch 18:00 UTC = 01:00 Việt Nam ngày tiếp theo. Chỉ upload file `.age`, giữ artifact 30 ngày. Repo public không chạy workflow này. Ưu tiên kho backup riêng có phân quyền ngoài GitHub; export/move encrypted file sau khi quy trình đã xác minh.

Chính sách đề xuất: 7 bản ngày, 4 bản tuần, 3 bản tháng ở kho riêng; số này chưa được tự động thực thi trong helper. Hạn 30 ngày trong GitHub artifact không thay thế retention theo tuần/tháng. Hằng quý test restore. Cảnh báo thất bại do Actions cung cấp, chưa có dashboard trạng thái backup tổng hợp.

## Restore staging

Chỉ vào project staging khác project nguồn, database ứng dụng chưa có tables. Chuẩn bị sẵn schema Supabase nền, các role chuẩn, pgcrypto trong extensions và **Auth user IDs mà dữ liệu tham chiếu** bằng một quy trình được kiểm duyệt. Không tự giả rằng tài khoản mới có cùng UUID.

Đặt riêng: RESTORE_TARGET=staging, RESTORE_CONFIRM=RESTORE_INTO_EMPTY_STAGING, EXPECTED_STAGING_HOST (host database), EXPECTED_STAGING_SUPABASE_HOST (host API), BACKUP_FILE, BACKUP_AGE_IDENTITY_FILE, DATABASE_URL và Supabase staging service credentials. Chạy `npm run restore`.

Helper giải mã, kiểm tra checksum/version/manifest, từ chối project nguồn, chạy pg_restore --single-transaction, tạo bucket mới và upload với upsert=false. Database giữ ACL từ dump và bỏ ownership gốc. Storage nằm ngoài DB transaction: nếu upload lỗi giữa chừng, staging có thể chứa một phần object; **không dùng kết quả đó cho production**. Reset project kiểm thử rồi retry theo kế hoạch staging riêng, không tự xóa dữ liệu.

Default dump public/private không bao gồm trigger trên auth.users, publication Supabase hoặc cài đặt platform. Sau restore cần kiểm tra/tái tạo hai trigger `on_auth_user_created`, `bootstrap_password_changed`, publication rooms/members/runs/submissions, RLS/grants và provider settings từ source migration theo quy trình có review. Không chạy lại nguyên migration tạo table trên database đã restore.

Xác minh: số lượng từng bảng và object, checksum Storage, canary đăng nhập, tạo câu, chấm điểm/hết giờ, quay cuối, quyền RLS và theme. Chỉ ghi restore_verified=true sau khi chạy đủ. File LAST_BACKUP_STATUS.json do backup tạo luôn giữ restore_verified=false.

**Trong phiên bàn giao chưa chạy pg_dump, age hoặc restore thật** vì không có dịch vụ và CLI. Test checksum không phải test khả năng phục hồi hệ thống.

## Rollback frontend

Giữ commit SHA/version đã chạy ổn. Revert commit frontend bằng commit mới hoặc build lại SHA trước, giữ nguyên cấu hình base/backend; không force push. GitHub Pages redeploy qua workflow sau kiểm tra. Rollback frontend không tự rollback database.

## Migration database

Dùng migration forward-only có review. Trước thay đổi phá vỡ schema, backup mã hóa và restore staging đã xác minh. Thêm cột nullable/version RPC trước rồi cập nhật frontend, sau đó mới loại cột cũ trong cửa sổ bảo trì. Không chạy DROP hoặc migration đảo dữ liệu trên production chỉ để khớp frontend cũ. Trường hợp cần khôi phục toàn database: lập kế hoạch downtime và xác minh phục hồi Auth/Storage/config riêng trước.

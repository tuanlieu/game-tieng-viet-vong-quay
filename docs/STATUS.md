# Trạng thái bàn giao 0.1.0

**Chưa đủ điều kiện nghiệm thu toàn bộ đặc tả hoặc xuất bản production.** Mã nguồn được viết và kiểm thử cục bộ; các dịch vụ thật chưa được cấu hình. Không coi một menu có chữ “chưa sẵn sàng” là tính năng đã hoàn thành.

| Nhóm đặc tả | Đã viết | Kiểm chứng / phần còn thiếu |
|---|---|---|
| React/TypeScript/Vite + Supabase | Frontend, SQL migration, RPC, RLS/policy/Realtime | Build/typecheck/lint đạt; hai migration đã áp dụng trên Supabase thật, Edge Function chưa deploy |
| Màu, ô 3D, sidebar, sáng/tối | Bộ màu yêu cầu, ô chữ bóng mềm, sidebar thu gọn/drawer, reduced motion | Chưa QA bằng ảnh chụp ở 7 kích thước; không có file logo khả dụng |
| Theme xu hướng 2026 | 2 bảng lấy cảm hứng, nguồn và ngày cập nhật | HEX thiết kế, không gắn nhãn mã chính thức |
| Theme sự kiện Việt Nam | 11 bảng phối + Halloween; preview, custom, lưu theme, JSON export | Chưa có họa tiết/banner/ảnh/âm thanh; chưa nhập/restore theme và cảnh báo tương phản |
| Lịch theme | Server time, UTC+7 UI, mốc kết thúc loại trừ, ưu tiên, bật/tạm dừng, khôi phục nền, theme phòng | Unit test thời điểm/ưu tiên; chưa staging lịch thực; không chuyển đổi âm lịch; chưa toàn hệ thống công khai |
| Auth | Email/Google/Facebook, PKCE, quên mật khẩu, username server lookup | Chưa OAuth/SMTP/session thật; nút provider disabled mặc định |
| Admin | Bootstrap riêng tư, buộc đổi mật khẩu, MFA TOTP, đổi vai trò + nhật ký | SQL test MFA gate; bootstrap/Auth trigger chưa kiểm thử GoTrue |
| Hồ sơ | Đổi tên/mật khẩu, đăng xuất, yêu cầu xóa | Chưa upload avatar; yêu cầu xóa cần quản trị xử lý; chưa auto linking tài khoản |
| Bộ câu hỏi | Tạo bộ, trạng thái riêng/công khai/lưu trữ, tạo/sửa/nhân bản/xóa câu, tìm, gợi ý, điểm, time | SQL/Unicode/lặp đạt; chưa rename/clone bộ, reorder, autosave, filter nâng cao |
| Nhập/xuất | CSV/JSON, kiểm tra toàn file trước nhập, thông báo lưu một phần, 24 câu mẫu | 24 mẫu đã test; .xlsx chưa sẵn sàng |
| Chơi | Chạm/click/kéo ô và nhập text bàn phím, bỏ ô, gợi ý, gửi, công bố | Backend chấm điểm đạt; chưa E2E UI; chưa cá nhân tự chuyển câu, ảnh minh họa |
| Đồng hồ | Start/pause/resume/+15s/end/reveal, progress, offset server, khóa nộp | SQL pause/deadline/idempotency đạt; chưa refresh/mất mạng trong browser thật |
| Phòng | Mã/link mời, member/team label, Realtime + polling, khóa/kết thúc/loại, ranking, JSON export, fullscreen | Chưa QR, tổng đội, presence online/away; loại thành viên chưa lưu ban lâu dài |
| Vòng quay | 2–100 quà, trọng số/%/tồn, thử/chính thức, kim dừng, popup, lịch sử, trao quà | Logic/góc/xác suất/SQL stock đạt; chưa kiểm thử nhiều kết nối đồng thời |
| Cấp lượt | MC cấp lượt cho thành viên; server kiểm tra/sử dụng ticket | SQL test giới hạn lượt và quyền đọc/sửa; chưa tự cấp theo đáp án/điểm |
| Quà/vòng nâng cao | Tạo vòng, thêm quà, sửa tồn, bật/tắt/xóa, export lịch sử | Chưa chỉnh tên/trọng số sau tạo, clone/import/reorder, ảnh/nhạc, góc theo xác suất, kho quà chung |
| Bảo mật | RLS, private answers/roles, minimal grants, CSPRNG, transaction/idempotency, rate limit, CSP, CORS | Test SQL quyền và secret/dependency scan đạt; chưa pen test/staging, chưa log đầy đủ nội dung |
| Media/Storage | Backup helper có đọc/ghi Storage | Chưa upload UI, MIME inspection, quota, media library |
| Backup/restore | age encryption, manifest/checksum, app DB/Storage, staging guard, rollback docs, workflow backup opt-in repo private | Chỉ syntax và checksum tests; chưa pg_dump/age/restore thật; Auth/provider recovery không được chứng nhận |
| GitHub/Deploy | Workflow CI, Pages gated, lockfile, docs | Repository đã tạo và push; chưa chạy Actions, deploy hoặc smoke test URL |

## Phụ thuộc bên ngoài đang thiếu

- URL và publishable key của Supabase; quyền thao tác dashboard/CLI ở môi trường tin cậy.
- Credentials Google/Facebook và SMTP chỉ cấu hình ở backend.
- Logo cần cung cấp lại nếu muốn dùng; các đường dẫn ảnh ban đầu không tồn tại.
- Công cụ browser QA được hỗ trợ, PostgreSQL CLI và age để chạy nghiệm thu/restore thật.

Không cần gửi service-role key, database password hoặc OAuth secret vào cuộc trò chuyện.

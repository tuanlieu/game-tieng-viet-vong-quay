# Kiến trúc và ranh giới quyền

Frontend SPA → Supabase Auth/PostgREST/Realtime → PostgreSQL. Edge Function `username-login` chỉ ánh xạ username riêng tư và gọi Supabase Auth, không tự so sánh mật khẩu.

## Bảng và API

| Nhóm | Bảng / schema | Quyền |
|---|---|---|
| Hồ sơ | public.profiles | Chủ tài khoản xem/sửa tên; admin xem |
| Vai trò, bootstrap | private.user_roles, private.username_map | Không có API bảng cho trình duyệt; service-only bootstrap |
| Bộ câu hỏi | public.question_sets, public.questions | Tác giả quản lý; người chơi không đọc câu thô |
| Đáp án | private.answers | Tác giả đọc qua author_answers; người chơi nhận từ current_run sau reveal |
| Phòng | public.rooms, room_members, runs | Chủ phòng và thành viên đọc; MC điều khiển bằng RPC |
| Chấm điểm | public.submissions, private.submitted_answers, hint_uses | RPC kiểm tra hạn giờ/membership, chỉ một lần trả lời |
| Vòng quay | public.wheels, prizes, spins, spin_tickets | Chủ vòng quản lý và quay; spin_wheel là transaction |
| Giao diện | public.themes, event_schedules | Theo tài khoản; current_run/active_theme phục vụ thành viên cùng phòng |
| Quản trị | public.audit_logs, deletion_requests | Nhật ký: admin + MFA; yêu cầu xóa: tài khoản tự gửi |
| Rate limit | private.rate_limits | Backend, không đọc trực tiếp |

Tất cả bảng public của ứng dụng bật RLS; bảng ghi kết quả không cấp insert/update cho authenticated. Hàm SECURITY DEFINER dùng search_path rỗng và tên đầy đủ. Vai trò không lấy từ user_metadata.

## Đồng hồ, điểm, đáp án

control_run khóa dòng phòng và lượt hiện tại. Deadline dùng clock_timestamp. Tạm dừng lưu giây còn lại; tiếp tục lập deadline mới. UI ước lượng offset bằng server_now và trung điểm thời gian request để hiển thị, nhưng server vẫn quyết định nộp có đúng giờ hay không.

submit_answer khóa run, kiểm tra phòng đang chơi và người gửi đang là thành viên, từ chối nộp khi pause/hết giờ. Kết quả đã ghi được trả nguyên khi gọi lại. Đúng: điểm cơ bản + floor(50 × min(giây còn lại / duration, 1)), trừ 10 nếu đã dùng gợi ý. Sai: 0. Việc thêm giờ không làm thưởng tốc độ vượt 50.

current_run trả ô chữ/title/deadline và chỉ thêm đáp án khi state=revealed. Không đưa private.answers vào publication Realtime. Chỉ author_answers cho tác giả/admin đã qua gate được đọc đáp án trước công bố.

## Vòng quay

spin_wheel khóa dòng wheel. Trigger trên prizes dùng cùng khóa để đồng bộ chỉnh quà với lượt quay. Kiểm tra ID lượt đã có trước khi chọn; kết quả và thay đổi tồn kho cùng transaction. CSPRNG dùng 6 byte pgcrypto (48 bit), giá trị trong [0,1). Không dùng random() của PostgreSQL cho kết quả chính thức.

Nếu quà hết, bỏ ô khỏi tập hợp hợp lệ và chuẩn hóa lại trọng số; rule và phân bố có hiệu lực được lưu trong mỗi spin. Hình học hiện chỉ có ô bằng nhau; UI thông báo diện tích không đại diện xác suất. Chủ vòng tự quay hoặc MC cấp lượt cho thành viên bằng grant_spins. Người nhận được đọc vòng/quà và quay theo số lượt, không được sửa vòng.

Browser giữ **ID yêu cầu đang chờ** trong sessionStorage, không chứa đáp án/token. Refresh trong cùng tab cho phép tiếp tục cùng lượt. Lịch sử server là nguồn chính xác; nếu trình duyệt xóa sessionStorage trong khi request không rõ kết quả, xem lịch sử trước khi quay lại. Khôi phục idempotency giữa nhiều thiết bị/tab chưa có cơ chế riêng.

## Phiên, XSS và giới hạn hiện có

Supabase SPA dùng PKCE, detectSessionInUrl và phiên localStorage. HTTPS bắt buộc ở production. Token lưu bởi Supabase SDK trong localStorage, không được ghi log. React text rendering không dùng dangerouslySetInnerHTML. CSP meta cấm script inline/object; GitHub Pages không cho ứng dụng tự cấu hình đầy đủ HTTP headers. Muốn HSTS/frame-ancestors/header động cần hosting/proxy hỗ trợ.

CORS Edge chỉ cho ALLOWED_ORIGIN, không dùng wildcard. Rate limit theo username và hash IP; hash IP phụ thuộc trusted gateway, không coi X-Forwarded-For từ client là chứng cứ độc lập. Auth email/Google/Facebook còn dùng rate limit Supabase. Chưa có kiểm thử tấn công phân tán thực tế hoặc MFA bao phủ mọi thao tác admin.

Backend hiện không cấp tài khoản khách ẩn danh. Storage chưa được dùng để upload tài sản qua UI. Không có service key trong frontend. Script backup có quyền cao và chỉ chạy trong môi trường tin cậy.

## Kiểm chứng

Database tests chạy SQL thật trong PGlite; auth.uid/auth.jwt/auth.users/publication và pgcrypto được thay bằng fixture cục bộ. Không đại diện cho GoTrue, Edge runtime, Storage hoặc truyền Realtime trên Supabase. Quay cạnh tranh nhiều kết nối cần kiểm thử staging riêng.

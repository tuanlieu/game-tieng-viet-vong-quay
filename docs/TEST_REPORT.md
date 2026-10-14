# Báo cáo kiểm thử thực tế — 14/10/2026

Trạng thái: **34/34 bài kiểm thử cục bộ đạt**, không phải nghiệm thu end-to-end trên dịch vụ thật.

| Kiểm tra | Kết quả đã chạy | Giới hạn |
|---|---|---|
| TypeScript | tsc -b đạt | Frontend/Vite; Edge Function Deno chưa type-check bằng Deno |
| Lint | ESLint đạt | Áp dụng frontend; scripts/fixtures có kiểm tra cú pháp riêng |
| Production build | Vite 8.3.4 đạt | Build không có cấu hình dịch vụ thật |
| Unicode/điểm/xác suất/lịch/góc | 15 test đạt | Chỉ logic cục bộ |
| SQL/PGlite | 14 test đạt | Auth, Realtime publication và nguồn random dùng fixture |
| Backup format/checksum | 3 test đạt | Không gọi pg_dump/age/pg_restore thật |
| Dữ liệu mẫu | 1 test đạt | 24 câu khớp ô/đáp án |
| Frontend static render | 1 test đạt | Kiểm tra render HTML ở chế độ chưa cấu hình; không thao tác DOM/browser |
| Dependency audit | 0 vulnerabilities tại lúc quét | Chỉ phạm vi npm audit, không bảo đảm tuyệt đối |
| Secret scan | Không phát hiện mẫu secret đã biết | Scanner regex nội bộ, chưa gitleaks và không thay review thủ công |
| Script cú pháp | node --check backup/restore/bootstrap đạt | Không xác nhận quyền dịch vụ hay dữ liệu phục hồi |

## Các tình huống SQL đã thực thi

- Người ngoài không đọc bộ riêng hoặc phòng chưa tham gia.
- Người chơi không đọc private.answers hoặc raw questions, author_answers không cho truy cập trái phép.
- current_run trước reveal không chứa revealed/đáp án và không trả gợi ý miễn phí.
- Không nâng role bằng update trực tiếp; không sửa bộ người khác hoặc điều khiển MC.
- Câu thiếu/lặp chữ bị backend từ chối.
- Pause chặn nộp; resume phục hồi deadline.
- Gợi ý trừ điểm, đáp án không phân biệt hoa/thường, nộp lại trả cùng submission.
- Deadline quá hạn chặn người chưa nộp.
- Reveal mới trả đáp án.
- Không có ticket thì không được quay vòng của người khác.
- ID lượt trùng giữ nguyên kết quả; tồn quà cuối xuống 0, lượt mới bị chặn.
- MC cấp ticket; thành viên được đọc vòng nhưng không sửa; hết lượt bị chặn; gửi lại ID không mất thêm lượt.
- Theme phòng giữ cùng theme cho MC và thành viên, không bị lịch cá nhân của thành viên ghi đè.
- Mật khẩu bootstrap gate chặn viết; trigger Auth password hash change mới mở gate trong fixture.
- Admin thiếu AAL2 không đổi vai trò.

PGlite là PostgreSQL WASM cục bộ, cùng SQL migration với thay thế dòng create extension và mock gen_random_bytes. Không lấy kết quả này làm chứng cứ chất lượng entropy pgcrypto, JWT thật, CORS Edge hoặc hệ thống Realtime. Test quà cuối hiện là **tuần tự**, chưa chứng minh cạnh tranh nhiều kết nối trên Supabase.

## Phân bố và góc vòng quay

Kiểm tra 100.000 mẫu phân tầng đều cho trọng số 1:3, thu được đúng 25.000 kết quả nhóm A. Đây là kiểm chứng hàm chọn có trọng số, không phải kiểm định thống kê nguồn CSPRNG. Kiểm tra tâm kim với mọi số ô 2–100, xét sai số vòng tròn để xử lý số thực gần 0/360 độ.

## Chưa chạy / không đánh dấu đạt

- Đăng nhập email/xác minh/reset/mật khẩu bootstrap thật; Google/Facebook/MFA thật.
- Edge Function username-login trên Deno/Supabase, rate limit gateway thực.
- E2E tạo câu → tham gia → nộp → hết giờ → reveal → cấp lượt → quay.
- Request song song nhiều kết nối, transaction contention và kho quà cuối thực.
- Refresh/đổi tab/mất mạng/reconnect/token expiration trên trình duyệt.
- Responsive và screenshot ở 360, 390, 768, 1024, 1366, 1920, 3840 px.
- Chrome, Edge, Firefox, Safari; bàn phím/focus/contrast trên browser và assistive tech.
- Backup toàn hệ thống, mã hóa age, restore database/Storage/Auth thực.
- Supabase migration trên project thật, Realtime publication delivery và database grants của platform.
- GitHub push, CI/Pages workflow và smoke test URL thật.

Workspace được quản lý không có control-browser skill được hỗ trợ. Không mở preview server, cài browser hoặc dùng một đường điều khiển browser khác. Không có screenshot để khẳng định bố cục đã QA. Chưa có Supabase/repository game; các phần cần credentials không được giả lập rồi ghi thành “đăng nhập/deploy thành công”.

## Điều kiện trước production

Làm checklist staging trong DEPLOYMENT.md và kiểm tra các phần chưa sẵn sàng trong STATUS.md. Ba biến gate của workflow không nên bật trước khi bằng chứng backend/browser/backup đáp ứng tiêu chí nghiệm thu. Dù unit/SQL test đạt, 0.1.0 chưa hoàn thành toàn bộ 19 mục đặc tả.

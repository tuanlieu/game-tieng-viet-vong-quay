# Cấu hình và triển khai

## 1. Repository

Tạo repository mới `game-tieng-viet-vong-quay` trong tài khoản tuanlieu. Không sử dụng repository của dự án khác. Không thêm dữ liệu thật hoặc file văn bản yêu cầu có mật khẩu vào Git. Khởi tạo local Git, review diff và chạy scan trước khi push. Không force push hoặc ghi đè lịch sử.

## 2. Supabase staging trước

1. Tạo project staging và một project production riêng.
2. Dùng SQL editor hoặc Supabase CLI áp dụng 001 rồi 002. Cần quyền chủ database để tạo private schema, trigger Auth, extension và publication.
3. Xác minh pgcrypto ở schema extensions. Nếu dự án cũ đã có extension ở nơi khác, điều chỉnh sau khi kiểm tra — không chạy migration mù trên database dùng chung.
4. Trong Auth, bật xác minh email, cấu hình SMTP sản xuất; Site URL local `http://localhost:5173/` và redirect URL local tương ứng.
5. Nhập riêng biến Auth/provider, không qua frontend.
6. Deploy username-login; đặt ALLOWED_ORIGIN đúng origin web (ví dụ https://tuanlieu.github.io). Khi chạy local, dùng cấu hình function riêng với origin http://localhost:5173; không nới CORS production tùy tiện.
7. Chạy bootstrap bằng biến riêng tư ở máy tin cậy, đổi mật khẩu và bật MFA. Script bootstrap chưa được chạy ở phiên bàn giao.

## 3. Google OAuth

- Tạo OAuth Web Client tại Google Cloud. Cấu hình consent screen và đối tượng test/published phù hợp.
- Authorized redirect URI cho Google là callback Supabase `https://<project-ref>.supabase.co/auth/v1/callback`.
- Đặt client ID/secret trong Supabase Auth Providers, không đặt VITE.
- Supabase Site URL và Redirect allowlist phải gồm URL website có dấu `/` cuối: `https://tuanlieu.github.io/game-tieng-viet-vong-quay/` và local riêng.
- Bật `VITE_GOOGLE_ENABLED=true` sau khi kiểm tra thực tế thành công.
- Frontend dùng PKCE, redirectTo là origin + BASE_URL; SDK tự xử lý code exchange. Không gửi refresh/access token trong link mời hoặc log.

## 4. Facebook Login

- Tạo app tại Meta Developers và cấu hình Facebook Login.
- Valid OAuth Redirect URI: callback Supabase như trên.
- Thiết lập domain, privacy URL và data deletion callback/instructions theo yêu cầu Meta. Trang quyền riêng tư trong ứng dụng là nội dung khởi đầu; chủ website phải bổ sung email liên hệ và chính sách lưu trữ.
- Đặt App ID/App Secret trong Supabase provider. Kiểm thử với tài khoản được phép; chuyển app sang chế độ phù hợp để người dùng bên ngoài đăng nhập.
- Bật `VITE_FACEBOOK_ENABLED=true` sau khi xác minh. Không gọi nút disabled là đăng nhập thành công.

## 5. GitHub Pages

Trong Settings → Pages, chọn GitHub Actions. Trong Repository Variables:

| Biến | Giá trị |
|---|---|
| VITE_SUPABASE_URL | URL production đã xác minh |
| VITE_SUPABASE_PUBLISHABLE_KEY | Publishable key công khai, không phải service key |
| VITE_GOOGLE_ENABLED / VITE_FACEBOOK_ENABLED | true chỉ khi provider đã cấu hình |
| BACKEND_ACCEPTANCE_VERIFIED | true sau kiểm thử staging/backend thật |
| BROWSER_QA_VERIFIED | true sau E2E/responsive/trình duyệt được yêu cầu |
| ALLOW_PRODUCTION_DEPLOY | true sau mọi điều kiện nghiệm thu |

Workflow tự đặt VITE_BASE_PATH theo tên repository. Với repository tài khoản `<owner>.github.io` hoặc custom domain ở root, đổi workflow base thành `/`. Không tự thay base nếu chưa kiểm tra URL.

pages.yml chạy bằng workflow_dispatch. Kiểm tra Actions không có thất bại, rồi mới xác nhận link website. URL dự kiến không phải URL đã deploy.

## 6. Smoke test sau deploy

- Mở URL thật và tải lại; JS/CSS đúng base, không 404.
- Đăng nhập email, xác minh/quên mật khẩu; đổi mật khẩu bootstrap.
- Google/Facebook thực tế, từ chối quyền và phiên hết hạn.
- Tạo bộ, 2 tài khoản thử quyền, 1 người MC và 2 người chơi.
- Hết giờ, refresh/mất mạng/reconnect; API không trả đáp án trước reveal.
- Quay hai kết nối cạnh tranh với một quà còn cuối; số tồn không âm, không trúng vượt tồn.
- Lịch 20/10, ưu tiên trùng, khôi phục theme nền; không đổi giữa câu/quay.
- Backup, restore staging và smoke test dữ liệu đã phục hồi.

Chỉ đánh dấu đã triển khai khi đã có kết quả workflow và URL thật được xác minh.

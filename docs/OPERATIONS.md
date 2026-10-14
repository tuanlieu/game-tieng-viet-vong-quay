# Hướng dẫn vận hành

## Soạn câu hỏi

Tạo bộ mới → chọn bộ → nhập đáp án → chọn ghép chữ/từ → tạo ô hoặc nhập bộ ô phân cách `/` → đặt 5–600 giây, điểm và gợi ý → lưu. Backend kiểm tra bộ ô đúng đáp án, tính cả số lần lặp. Chữ Việt được chuẩn NFC. Công khai hiện chỉ công khai tên/metadata bộ; trình duyệt người chơi không được đọc câu thô hoặc private answers.

Sửa, nhân bản hoặc xóa từng câu ở danh sách. Chuyển bộ sang riêng tư/công khai/lưu trữ. Xuất CSV/JSON. Nhập file tối đa 2 MB và 200 câu, kiểm tra trước và có bước xác nhận. Nhập từng câu tuần tự: nếu lỗi giữa chừng, thông báo số câu đã lưu; không tự hoàn tác. Export CSV chứa tiếng Việt với BOM, có thể mở bằng Excel, nhưng đây không phải Excel .xlsx.

File mẫu 24 câu có thể tải trong UI. Không dùng đáp án mẫu để chứng minh các câu là từ chương trình truyền hình.

## Phòng MC và người chơi

MC chọn bộ của mình rồi tạo phòng. Gửi mã/link mời; người chơi cần đăng nhập và dùng mã phòng. Có thể nhập tên đội (hiện chỉ nhãn đội, chưa tổng hợp điểm đội). Chủ phòng chọn câu, bắt đầu, pause/resume, thêm 15 giây, dừng/công bố. Chờ công bố xong mới bắt đầu câu khác.

Ô chữ có index riêng nên chữ lặp không bị dùng hai lần. Chạm/click để đưa vào vùng đáp án; click ở vùng đáp án trả ô. Có thao tác kéo từ bộ ô vào vùng trả lời và phương án nhập văn bản tương đương cho bàn phím. Hỗ trợ cảm ứng bằng chạm; kéo thả chưa được xác minh trên thiết bị thật.

Ghép chữ bỏ khoảng trắng khi chấm; ghép từ gộp khoảng trắng. Không phân biệt hoa/thường, giữ dấu tiếng Việt; API có cấu hình ignore_accents nhưng trình biên soạn hiện chưa đưa tùy chọn đó vào UI. Dấu câu . , ! ? ; : bỏ qua. Gợi ý trừ 10 điểm theo cờ đã dùng; bấm nhiều lần không trừ thêm. Một câu một lần nộp.

Realtime cập nhật câu và thành viên, polling 4 giây bù khi mất thông báo; UI không coi polling là chứng cứ đảm bảo reconnect toàn hệ thống. Điểm giảm dần, cùng điểm cùng hạng. Xuất kết quả JSON. Trình chiếu không gọi API đáp án tác giả nhưng vẫn nằm trong phiên tài khoản đang đăng nhập; chưa có endpoint công khai riêng cho TV.

## Vòng quay

Tạo vòng, thêm 2–100 ô; tồn trống nghĩa là không giới hạn. Chọn trọng số hoặc phần trăm (tổng 100%). UI hiển thị xác suất hiệu lực sau khi bỏ quà hết/tắt. Các ô bằng nhau; chữ dài rút gọn và đối chiếu bảng bên cạnh.

Quay chính thức do chủ vòng hoặc người được MC cấp lượt gọi; server chọn và lưu atomically cùng trừ tồn. ID đang chờ lưu trong sessionStorage của tab. Nếu reload/mất mạng, bấm khôi phục cùng ID; không tạo ID mới cho lần retry. Nếu xóa dữ liệu trình duyệt, kiểm tra lịch sử server trước khi thử lại. MC chọn vòng quay trong phòng rồi bấm +1 quay ở thành viên. Không tự cấp lượt theo điểm và chưa hỗ trợ khách ẩn danh.

Quay thử dùng random trình duyệt, có nhãn rõ, không ghi server hoặc trừ quà. Thay tồn, bật/tắt/xóa quà trong danh sách. Quà có lịch sử không xóa được vì khóa ngoại để giữ dữ liệu. Export lịch sử 100 lượt gần nhất JSON; đánh dấu đã trao.

## Theme và sự kiện

Chọn theme → xem trước → áp dụng nền. Lưu theme vào tài khoản để đặt lịch. Các mã HEX đều là bảng phối thiết kế lấy cảm hứng, không phải mã chính thức. Custom color editor có 4 token; màu khó đọc chưa có cảnh báo tự động.

Lịch nhập theo giờ Việt Nam (UTC+7), lưu UTC. Thời điểm kết thúc loại trừ. Lịch 20/10/2026: 00:00 11/10 đến trước 00:00 21/10 = 10 ngày theo lịch. Không có thuật toán âm lịch; Tết/Trung thu phải xác nhận ngày cho từng năm. Lịch tự ưu tiên bằng giờ backend và áp dụng ở chuyển tiếp an toàn. Giao diện nền cũ được giữ để trở lại sau khi lịch kết thúc.

## Tài khoản và quản trị

Admin bootstrap đổi mật khẩu trước khi quản lý nội dung. Trong Hồ sơ, thiết lập TOTP bằng Authenticator hoặc xác minh thiết bị đã có để nâng phiên lên AAL2. Admin không được sửa vai trò chính mình. Đổi vai trò có nhật ký. Không có login giả trong UI.

Yêu cầu xóa tài khoản được ghi vào deletion_requests. Quản trị phải xử lý bằng dashboard Supabase/môi trường tin cậy sau xác minh người yêu cầu; kiểm tra room/question/wheel foreign keys trước khi xóa. Hiện spins tham chiếu Auth user không cascade, cần quyết định xóa/ẩn danh lịch sử phần thưởng theo chính sách lưu trữ trước khi gọi Auth deleteUser. Không hứa thao tác xóa một nút sẽ xóa toàn bộ dữ liệu.

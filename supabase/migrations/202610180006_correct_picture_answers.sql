-- Corrects the supplied answer order for the 50 bundled picture puzzles,
-- including already-created combined sets that reuse these image paths.
with corrected(position, answer) as (values
  (1, 'Báo cáo'), (2, 'Ba hoa'), (3, 'Cung cầu'), (4, 'Ca dao'),
  (5, 'Cân bằng'), (6, 'Mật mã'), (7, 'Giấy bạc'), (8, 'Neo đơn'),
  (9, 'Hành lang'), (10, 'Thảm thiết'), (11, 'Khẩu cung'), (12, 'Hoa hậu'),
  (13, 'Ô ba ma'), (14, 'Bóng bảy'), (15, 'Nhật báo'), (16, 'Dầu cá'),
  (17, 'Tay trắng'), (18, 'Xà kép'), (19, 'Kiến thiết'), (20, 'Mỹ nhân ngư'),
  (21, 'Gạch hoa'), (22, 'Chân thành'), (23, 'Học đường'), (24, 'Xe tăng'),
  (25, 'Cầu mây'), (26, 'Gấu ngựa'), (27, 'Tình trường'), (28, 'Hứng thú'),
  (29, 'Bao hàm'), (30, 'Kinh độ'), (31, 'Đầu gấu'), (32, 'Cá ngựa'),
  (33, 'Mỹ Tâm'), (34, 'Bài bạc'), (35, 'Bao la'), (36, 'Hỏi cung'),
  (37, 'Đầu thú'), (38, 'Nội gián'), (39, 'Lang thang'), (40, 'Công trái'),
  (41, 'Tranh thủ'), (42, 'Chỉ điểm'), (43, 'Bao phủ'), (44, 'Áp đảo'),
  (45, 'Ném đá giấu tay'), (46, 'Cổ Loa'), (47, 'Bỉ ổi'), (48, 'Bạc tình'),
  (49, 'Đồng cam cộng khổ'), (50, 'Chân tướng')
)
update private.answers a set answer = normalize(c.answer, NFC), alternatives = array[]::text[]
from public.questions q join corrected c on q.image_url = 'images/duoi-hinh-bat-chu/cau-' || lpad(c.position::text, 2, '0') || '.jpeg'
where a.question_id = q.id and q.question_type = 'duoi_hinh_bat_chu';

-- Creates the supplied 50-question picture-word set for the authenticated
-- organiser. Answers are kept in private.answers and never sent in current_run
-- until the MC reveals the answer.
create or replace function public.import_duoi_hinh_bat_chu()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set uuid;
  v_question uuid;
  v_row record;
begin
  perform private.require_user();

  insert into public.question_sets(owner_id, title, description, visibility)
  values (
    auth.uid(),
    'Đuổi hình bắt chữ – 50 câu',
    'Bộ 50 câu đuổi hình bắt chữ kèm ảnh minh họa.',
    'private'
  )
  returning id into v_set;

  for v_row in
    select * from (values
      (1, 'Báo cáo'), (2, 'Ba hoa'), (3, 'Cung cầu'), (4, 'Ca dao'),
      (5, 'Cân bằng'), (6, 'Mật mã'), (7, 'Neo đơn'), (8, 'Khẩu cung'),
      (9, 'Giấy bạc'), (10, 'Hoa hậu'), (11, 'Hành lang'), (12, 'Thảm thiết'),
      (13, 'Ô ba ma'), (14, 'Bóng bảy'), (15, 'Nhật báo'), (16, 'Dầu cá'),
      (17, 'Tay trắng'), (18, 'Xà kép'), (19, 'Kiến thiết'), (20, 'Mỹ nhân ngư'),
      (21, 'Chân thành'), (22, 'Gạch hoa'), (23, 'Học đường'), (24, 'Xe tăng'),
      (25, 'Cầu mây'), (26, 'Gấu ngựa'), (27, 'Tình trường'), (28, 'Hứng thú'),
      (29, 'Bao hàm'), (30, 'Kinh độ'), (31, 'Đầu gấu'), (32, 'Cá ngựa'),
      (33, 'Mỹ Tâm'), (34, 'Bài bạc'), (35, 'Bao la'), (36, 'Hỏi cung'),
      (37, 'Nội gián'), (38, 'Đầu thú'), (39, 'Lang thang'), (40, 'Công trái'),
      (41, 'Chỉ điểm'), (42, 'Tranh thủ'), (43, 'Bao phủ'), (44, 'Áp đảo'),
      (45, 'Ném đá giấu tay'), (46, 'Bỉ ổi'), (47, 'Cổ Loa'), (48, 'Bạc tình'),
      (49, 'Chân tướng'), (50, 'Đồng cam cộng khổ')
    ) as rows(position, answer)
  loop
    insert into public.questions(
      set_id, title, mode, tiles, duration, points, position,
      ignore_accents, hint, question_type, image_url
    )
    values (
      v_set,
      'Quan sát hình ảnh và đoán từ hoặc cụm từ có nghĩa',
      'words', array[]::text[], 60, 100, v_row.position,
      true, '', 'duoi_hinh_bat_chu',
      'images/duoi-hinh-bat-chu/cau-' || lpad(v_row.position::text, 2, '0') || '.jpeg'
    )
    returning id into v_question;

    insert into private.answers(question_id, answer, alternatives, explanation)
    values (v_question, normalize(v_row.answer, NFC), array[]::text[], '');
  end loop;

  return v_set;
end;
$$;

grant execute on function public.import_duoi_hinh_bat_chu() to authenticated;

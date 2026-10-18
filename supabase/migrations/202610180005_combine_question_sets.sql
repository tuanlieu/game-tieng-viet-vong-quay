create or replace function public.combine_question_sets(p_vua_set uuid, p_picture_set uuid, p_title text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_set uuid; v_question uuid; v_row record; v_position integer:=0;
begin
  perform private.require_user();
  if not private.owns_set(p_vua_set) or not private.owns_set(p_picture_set) then raise exception 'Bạn chỉ có thể kết hợp bộ câu hỏi của mình.'; end if;
  if p_vua_set=p_picture_set then raise exception 'Hãy chọn hai bộ câu hỏi khác nhau.'; end if;
  if not exists(select 1 from public.questions where set_id=p_vua_set and question_type='vua_tieng_viet') then raise exception 'Bộ Vua Tiếng Việt chưa có câu phù hợp.'; end if;
  if not exists(select 1 from public.questions where set_id=p_picture_set and question_type='duoi_hinh_bat_chu') then raise exception 'Bộ Đuổi hình bắt chữ chưa có câu phù hợp.'; end if;
  insert into public.question_sets(owner_id,title,description,visibility) values(auth.uid(),left(btrim(p_title),150),'Bộ kết hợp Vua Tiếng Việt và Đuổi hình bắt chữ.','private') returning id into v_set;
  for v_row in
    select q.*, a.answer, a.alternatives, a.explanation from public.questions q join private.answers a on a.question_id=q.id
    where q.set_id in (p_vua_set,p_picture_set) order by case when q.question_type='vua_tieng_viet' then 0 else 1 end, q.position
  loop
    v_position:=v_position+1;
    insert into public.questions(set_id,title,mode,tiles,duration,points,position,ignore_accents,hint,question_type,image_url)
    values(v_set,v_row.title,v_row.mode,v_row.tiles,v_row.duration,v_row.points,v_position,v_row.ignore_accents,v_row.hint,v_row.question_type,v_row.image_url)
    returning id into v_question;
    insert into private.answers(question_id,answer,alternatives,explanation) values(v_question,v_row.answer,v_row.alternatives,v_row.explanation);
  end loop;
  return v_set;
end $$;
revoke execute on function public.combine_question_sets(uuid,uuid,text) from public,anon;
grant execute on function public.combine_question_sets(uuid,uuid,text) to authenticated;

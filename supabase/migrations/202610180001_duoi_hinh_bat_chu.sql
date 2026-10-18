-- Adds a safe public projection for image-based questions. Answers remain in
-- private.answers and are returned only once the MC reveals a run.
alter table public.questions
  add column if not exists question_type text not null default 'vua_tieng_viet'
    check (question_type in ('vua_tieng_viet','duoi_hinh_bat_chu')),
  add column if not exists image_url text;

update public.questions
set question_type = 'vua_tieng_viet'
where question_type is null;

create or replace function public.current_run(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.runs;q public.questions;result jsonb;
begin
 if not private.can_read_room(p_room) then raise exception 'Không có quyền xem phòng.';end if;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1;
 if v.id is null then return null;end if;
 select * into q from public.questions where id=v.question_id;
 result:=jsonb_build_object('id',v.id,'room_id',v.room_id,'question_id',v.question_id,'state',v.state,'deadline',v.deadline,'remaining',v.remaining,'duration',v.duration,'tiles',q.tiles,'title',q.title,'mode',q.mode,'question_type',q.question_type,'image_url',q.image_url,'hint',case when v.state='revealed' then q.hint else '' end,'server_now',clock_timestamp());
 if v.state='revealed' then result:=result||jsonb_build_object('revealed',(select jsonb_build_object('answer',answer,'explanation',explanation) from private.answers where question_id=v.question_id));end if;
 return result;
end $$;

create or replace function public.save_image_question(p_set uuid,p_image_url text,p_answer text,p_duration integer default 60,p_points integer default 100) returns uuid language plpgsql security definer set search_path='' as $$
declare q uuid;
begin
 perform private.require_user();
 if not private.owns_set(p_set) then raise exception 'Không có quyền sửa bộ câu hỏi.'; end if;
 if p_image_url !~ '^images/duoi-hinh-bat-chu/cau-[0-9]{2}\\.jpeg$' then raise exception 'Đường dẫn ảnh không hợp lệ.'; end if;
 if length(btrim(p_answer))=0 or length(p_answer)>500 or p_duration not between 5 and 600 or p_points not between 0 and 10000 then raise exception 'Dữ liệu câu hỏi không hợp lệ.'; end if;
 insert into public.questions(set_id,title,mode,tiles,duration,points,position,ignore_accents,hint,question_type,image_url)
 values(p_set,'Quan sát hình ảnh và đoán từ hoặc cụm từ có nghĩa','words',array[]::text[],p_duration,p_points,(select coalesce(max(position),0)+1 from public.questions where set_id=p_set),true,'','duoi_hinh_bat_chu',p_image_url)
 returning id into q;
 insert into private.answers(question_id,answer,alternatives,explanation) values(q,normalize(p_answer,NFC),array[]::text[],'');
 return q;
end $$;
grant execute on function public.save_image_question(uuid,text,text,integer,integer) to authenticated;
revoke execute on function public.save_image_question(uuid,text,text,integer,integer) from anon, public;

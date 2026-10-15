-- Walk-in players use Supabase anonymous sessions.  They never need an email
-- or password, yet retain a unique auth.uid() so scoring remains tamper-safe.
create function private.is_anonymous() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
$$;

alter table public.rooms add column if not exists late_join_enabled boolean not null default true;
alter table public.room_members add column if not exists removed_at timestamptz;
alter table public.room_members add column if not exists last_seen_at timestamptz not null default now();
create index if not exists room_members_activity_idx on public.room_members(room_id,last_seen_at desc) where removed_at is null;

create or replace function private.require_user() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Bạn cần đăng nhập.';end if;
 if private.is_anonymous() then raise exception 'Khách chỉ có thể tham gia và trả lời trong phòng chơi.';end if;
 if exists(select 1 from private.user_roles where user_id=auth.uid() and must_change_password) then raise exception 'Cần đổi mật khẩu ban đầu.';end if;
end $$;

create function private.require_player() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Không thể tạo phiên người chơi. Hãy thử lại.';end if;
end $$;

create or replace function private.can_read_room(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rooms where id=p_id and owner_id=auth.uid())
 or exists(select 1 from public.room_members where room_id=p_id and user_id=auth.uid() and removed_at is null)
 or private.is_admin()
$$;

create or replace function public.my_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'role',case when private.is_anonymous() then 'guest' else coalesce((select role from private.user_roles where user_id=auth.uid()),'guest') end,
   'must_change_password',case when private.is_anonymous() then false else coalesce((select must_change_password from private.user_roles where user_id=auth.uid()),false) end
 )
$$;

drop function public.join_room(text,text);
create function public.join_room(p_code text,p_display_name text,p_team text default null) returns uuid language plpgsql security definer set search_path='' as $$ declare r public.rooms;n text:=regexp_replace(btrim(p_display_name),'\s+',' ','g');begin
 perform private.require_player();
 if length(n) not between 2 and 30 then raise exception 'Nhập tên người chơi hoặc tên đội (2–30 ký tự).';end if;
 perform private.rate_limit('join:'||auth.uid(),20,60);
 select * into r from public.rooms where code=upper(trim(p_code)) for update;
 if r.id is null then raise exception 'Mã phòng không tồn tại.';end if;
 if r.locked then raise exception 'Phòng đang khóa, chưa nhận người chơi mới.';end if;
 if r.status='finished' then raise exception 'Phòng đã kết thúc.';end if;
 if r.status='playing' and not r.late_join_enabled then raise exception 'MC đang tắt tham gia muộn.';end if;
 if exists(select 1 from public.room_members where room_id=r.id and user_id=auth.uid()) then
   if exists(select 1 from public.room_members where room_id=r.id and user_id=auth.uid() and removed_at is not null) then raise exception 'Bạn đã bị loại khỏi phòng và không thể tự vào lại.';end if;
   if exists(select 1 from public.room_members where room_id=r.id and user_id<>auth.uid() and removed_at is null and lower(display_name)=lower(n)) then raise exception 'Tên này đã có trong phòng. Hãy chọn tên khác.';end if;
   update public.room_members set display_name=n,team_name=nullif(left(trim(coalesce(p_team,'')),30),''),last_seen_at=clock_timestamp() where room_id=r.id and user_id=auth.uid();
   return r.id;
 end if;
 if (select count(*) from public.room_members where room_id=r.id and removed_at is null)>=r.max_members then raise exception 'Phòng đã đầy.';end if;
 if exists(select 1 from public.room_members where room_id=r.id and removed_at is null and lower(display_name)=lower(n)) then raise exception 'Tên này đã có trong phòng. Hãy chọn tên khác.';end if;
 insert into public.room_members(room_id,user_id,display_name,team_name,last_seen_at) values(r.id,auth.uid(),n,nullif(left(trim(coalesce(p_team,'')),30),''),clock_timestamp());
 return r.id;
end $$;

create or replace function public.use_hint(p_run uuid) returns text language plpgsql security definer set search_path='' as $$ declare v public.runs;h text;begin
 perform private.require_player();select * into v from public.runs where id=p_run for update;
 if not exists(select 1 from public.room_members where room_id=v.room_id and user_id=auth.uid() and removed_at is null and joined_at<=v.created_at) or v.state<>'running' or clock_timestamp()>=v.deadline then raise exception 'Không thể dùng gợi ý.';end if;
 insert into private.hint_uses values(v.id,auth.uid()) on conflict do nothing;select hint into h from public.questions where id=v.question_id;return h;
end $$;

create or replace function public.submit_answer(p_run uuid,p_answer text) returns jsonb language plpgsql security definer set search_path='' as $$ declare v public.runs;q public.questions;a private.answers;ok boolean;points integer;s public.submissions;left_seconds numeric;begin
 perform private.require_player();perform private.rate_limit('answer:'||auth.uid(),30,60);
 select * into v from public.runs where id=p_run for update;
 if not exists(select 1 from public.room_members m join public.rooms r on r.id=m.room_id where m.room_id=v.room_id and m.user_id=auth.uid() and m.removed_at is null and m.joined_at<=v.created_at and r.status='playing') then raise exception 'Bạn chưa tham gia câu này hoặc phòng đã kết thúc.';end if;
 select * into s from public.submissions where run_id=p_run and user_id=auth.uid();if s.id is not null then return to_jsonb(s);end if;
 if length(p_answer)>500 then raise exception 'Đáp án quá dài.';end if;
 if v.state<>'running' or clock_timestamp()>=v.deadline then raise exception 'Đã hết giờ hoặc đang tạm dừng.';end if;
 select * into q from public.questions where id=v.question_id;select * into a from private.answers where question_id=v.question_id;
 ok:=private.match_answer(p_answer,a.answer,q.mode,q.ignore_accents) or exists(select 1 from unnest(a.alternatives) t where private.match_answer(p_answer,t,q.mode,q.ignore_accents));
 left_seconds:=extract(epoch from v.deadline-clock_timestamp());
 points:=case when ok then greatest(0,q.points+floor(50*least(left_seconds/v.duration,1))::integer-case when exists(select 1 from private.hint_uses where run_id=v.id and user_id=auth.uid()) then 10 else 0 end) else 0 end;
 insert into public.submissions(run_id,user_id,correct,score) values(v.id,auth.uid(),ok,points) returning * into s;
 insert into private.submitted_answers values(s.id,p_answer);return to_jsonb(s);
end $$;

grant execute on function private.is_anonymous(),private.require_player() to authenticated;
grant execute on function public.join_room(text,text,text),public.use_hint(uuid),public.submit_answer(uuid,text),public.my_access() to authenticated;
grant update(late_join_enabled) on public.rooms to authenticated;

create or replace function public.current_run(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare v public.runs;q public.questions;result jsonb;begin
 if not private.can_read_room(p_room) then raise exception 'Không có quyền xem phòng.';end if;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1;
 if v.id is null then return null;end if;select * into q from public.questions where id=v.question_id;
 result:=jsonb_build_object('id',v.id,'room_id',v.room_id,'question_id',v.question_id,'state',v.state,'deadline',v.deadline,'remaining',v.remaining,'duration',v.duration,'tiles',q.tiles,'title',q.title,'mode',q.mode,'hint',case when v.state='revealed' then q.hint else '' end,'server_now',clock_timestamp(),'can_answer',exists(select 1 from public.room_members where room_id=v.room_id and user_id=auth.uid() and removed_at is null and joined_at<=v.created_at));
 if v.state='revealed' then result:=result||jsonb_build_object('revealed',(select jsonb_build_object('answer',answer,'explanation',explanation) from private.answers where question_id=v.question_id));end if;return result;
end $$;

create function public.touch_room_member(p_room uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.require_player();
 update public.room_members set last_seen_at=clock_timestamp() where room_id=p_room and user_id=auth.uid() and removed_at is null;
 if not found then raise exception 'Bạn không còn là người chơi của phòng này.';end if;
end $$;

create function public.remove_room_member(p_room uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.require_user();
 if not exists(select 1 from public.rooms where id=p_room and owner_id=auth.uid()) then raise exception 'Chỉ chủ phòng được loại người chơi.';end if;
 update public.room_members set removed_at=clock_timestamp() where room_id=p_room and user_id=p_user and removed_at is null;
 if not found then raise exception 'Người chơi không còn trong phòng.';end if;
end $$;
grant execute on function public.current_run(uuid),public.touch_room_member(uuid),public.remove_room_member(uuid,uuid) to authenticated;

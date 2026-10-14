-- All authoritative decisions use database time; no player answer or role table is exposed.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema private from public, anon, authenticated;
create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null check(length(display_name) between 1 and 80), avatar_url text, created_at timestamptz not null default now());
create table private.user_roles(user_id uuid primary key references auth.users on delete cascade, role text not null default 'user' check(role in ('admin','user')), must_change_password boolean not null default false);
create table private.username_map(username text primary key,email text not null unique,user_id uuid references auth.users on delete cascade);
create table public.question_sets(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade default auth.uid(),title text not null check(length(title) between 1 and 150),description text not null default '',visibility text not null default 'private' check(visibility in ('private','public','archived')),created_at timestamptz not null default now());
create table public.questions(id uuid primary key default gen_random_uuid(),set_id uuid not null references public.question_sets on delete cascade,title text not null default 'Sắp xếp các chữ cái thành từ hoặc cụm từ có nghĩa',mode text not null default 'letters' check(mode in ('letters','words')),tiles text[] not null,duration integer not null default 60 check(duration between 5 and 600),points integer not null default 100 check(points between 0 and 10000),position integer not null default 0,ignore_accents boolean not null default false,hint text not null default '');
create table private.answers(question_id uuid primary key references public.questions on delete cascade,answer text not null,alternatives text[] not null default '{}',explanation text not null default '');
create table public.rooms(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users on delete cascade,set_id uuid not null references public.question_sets,code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),title text not null check(length(title) between 1 and 150),status text not null default 'waiting' check(status in ('waiting','playing','finished')),locked boolean not null default false,max_members integer not null default 100 check(max_members between 1 and 1000),theme_id uuid,created_at timestamptz default now());
create table public.room_members(room_id uuid not null references public.rooms on delete cascade,user_id uuid not null references auth.users on delete cascade,display_name text not null,team_name text,joined_at timestamptz not null default now(),primary key(room_id,user_id));
create table public.runs(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms on delete cascade,question_id uuid not null references public.questions,state text not null check(state in ('running','paused','ended','revealed')),deadline timestamptz,remaining numeric not null,duration integer not null,created_at timestamptz not null default now());
create unique index one_active_run on public.runs(room_id) where state in ('running','paused','ended');
create table public.submissions(id uuid primary key default gen_random_uuid(),run_id uuid not null references public.runs on delete cascade,user_id uuid not null references auth.users on delete cascade,correct boolean not null,score integer not null,submitted_at timestamptz default now(),unique(run_id,user_id));
create table private.submitted_answers(submission_id uuid primary key references public.submissions on delete cascade,answer text not null);
create table private.hint_uses(run_id uuid references public.runs on delete cascade,user_id uuid references auth.users on delete cascade,primary key(run_id,user_id));
create table public.wheels(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users on delete cascade,title text not null check(length(title) between 1 and 150),duration integer not null default 6 check(duration between 2 and 20),probability_mode text not null default 'weights' check(probability_mode in ('weights','percent')),created_at timestamptz default now());
create table public.prizes(id uuid primary key default gen_random_uuid(),wheel_id uuid not null references public.wheels on delete cascade,label text not null check(length(label) between 1 and 100),color text not null default '#04605E' check(color ~ '^#[0-9A-Fa-f]{6}$'),weight numeric not null check(weight>=0 and weight<1000000),stock integer check(stock>=0),enabled boolean not null default true,position integer not null default 0);
create table public.spin_tickets(wheel_id uuid references public.wheels on delete cascade,user_id uuid references auth.users on delete cascade,remaining integer not null check(remaining>=0),primary key(wheel_id,user_id));
create table public.spins(id uuid primary key, wheel_id uuid not null references public.wheels,user_id uuid not null references auth.users,prize_id uuid not null references public.prizes,result_label text not null,probabilities jsonb not null,delivered boolean not null default false,created_at timestamptz not null default now());
create table public.themes(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users on delete cascade,name text not null check(length(name) between 1 and 100),tokens jsonb not null,description text not null default '',source_url text,year integer,created_at timestamptz default now());
create table public.event_schedules(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users on delete cascade,theme_id uuid not null references public.themes,room_id uuid references public.rooms on delete cascade,starts_at timestamptz not null,ends_at timestamptz not null,priority integer not null default 0,enabled boolean not null default true,check(ends_at>starts_at));
create table public.audit_logs(id bigint generated always as identity primary key,actor_id uuid,action text not null,entity_id uuid,created_at timestamptz default now());
create table public.deletion_requests(user_id uuid primary key references auth.users on delete cascade,requested_at timestamptz default now());
create table private.rate_limits(key text primary key,started_at timestamptz not null default now(),attempts integer not null default 0);
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.user_roles where user_id=auth.uid() and role='admin' and not must_change_password) $$;
create function private.require_user() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Bạn cần đăng nhập.';end if;
 if exists(select 1 from private.user_roles where user_id=auth.uid() and must_change_password) then raise exception 'Cần đổi mật khẩu ban đầu.';end if;
end $$;
create function private.rate_limit(p_key text,p_limit integer,p_seconds integer) returns void language plpgsql security definer set search_path='' as $$ declare n integer;begin
 insert into private.rate_limits(key) values(p_key) on conflict do nothing;
 update private.rate_limits set attempts=case when started_at<clock_timestamp()-make_interval(secs=>p_seconds) then 1 else attempts+1 end,started_at=case when started_at<clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else started_at end where key=p_key returning attempts into n;
 if n>p_limit then raise exception 'Thao tác quá nhanh. Vui lòng thử lại sau.';end if;
end $$;
create function private.owns_set(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.question_sets where id=p_id and owner_id=auth.uid()) or private.is_admin() $$;
create function private.can_read_room(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.rooms where id=p_id and owner_id=auth.uid()) or exists(select 1 from public.room_members where room_id=p_id and user_id=auth.uid()) or private.is_admin() $$;
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id,display_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),nullif(new.raw_user_meta_data->>'full_name',''),'Người chơi'),80));
 insert into private.user_roles(user_id) values(new.id);return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_profile();
create function public.my_access() returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('role',coalesce((select role from private.user_roles where user_id=auth.uid()),'guest'),'must_change_password',coalesce((select must_change_password from private.user_roles where user_id=auth.uid()),false)) $$;
create function public.server_time() returns timestamptz language sql volatile as $$ select clock_timestamp() $$;
create function private.normalize_answer(v text,ignore_marks boolean default false) returns text language plpgsql immutable set search_path='' as $$ declare t text;begin
 t:=lower(trim(regexp_replace(normalize(v,NFC),'\s+',' ','g')));t:=regexp_replace(t,'[.,!?;:]','','g');
 if ignore_marks then t:=translate(regexp_replace(normalize(t,NFD),'[̀-ͯ]','','g'),'đ','d');end if;return t;
end $$;
create function private.match_answer(a text,b text,mode text,ignore_marks boolean) returns boolean language sql immutable set search_path='' as $$ select case when mode='letters' then replace(private.normalize_answer(a,ignore_marks),' ','')=replace(private.normalize_answer(b,ignore_marks),' ','') else private.normalize_answer(a,ignore_marks)=private.normalize_answer(b,ignore_marks) end $$;
create function public.save_question(p_set uuid,p_question uuid,p_title text,p_tiles text[],p_answer text,p_mode text,p_duration integer,p_points integer,p_hint text default '',p_explanation text default '',p_alternatives text[] default '{}',p_ignore_accents boolean default false) returns uuid language plpgsql security definer set search_path='' as $$ declare q uuid;expected text[];actual text[];begin
 perform private.require_user();if not private.owns_set(p_set) then raise exception 'Không có quyền sửa bộ câu hỏi.';end if;
 if length(p_answer)>500 or cardinality(p_tiles)>150 or length(p_answer)=0 or exists(select 1 from unnest(p_tiles) t where t is null or length(t)=0) then raise exception 'Bộ chữ hoặc đáp án không hợp lệ.';end if;
 if p_mode='words' then select array_agg(x order by x) into expected from unnest(string_to_array(private.normalize_answer(p_answer,p_ignore_accents),' ')) x;
 else select array_agg(x order by x) into expected from unnest(regexp_split_to_array(replace(private.normalize_answer(p_answer,p_ignore_accents),' ',''),'')) x;end if;
 select array_agg(private.normalize_answer(x,p_ignore_accents) order by private.normalize_answer(x,p_ignore_accents)) into actual from unnest(p_tiles) x;
 if expected is distinct from actual then raise exception 'Bộ chữ không khớp đáp án: kiểm tra ký tự thiếu/thừa.';end if;
 if p_question is not null then
 update public.questions set title=p_title,tiles=p_tiles,mode=p_mode,duration=p_duration,points=p_points,hint=p_hint,ignore_accents=p_ignore_accents where id=p_question and set_id=p_set returning id into q;
 if q is null then raise exception 'Không tìm thấy câu hỏi.';end if;
 else insert into public.questions(set_id,title,tiles,mode,duration,points,hint,ignore_accents,position) values(p_set,p_title,p_tiles,p_mode,p_duration,p_points,p_hint,p_ignore_accents,(select coalesce(max(position),0)+1 from public.questions where set_id=p_set)) returning id into q;end if;
 insert into private.answers(question_id,answer,alternatives,explanation) values(q,normalize(p_answer,NFC),p_alternatives,p_explanation) on conflict(question_id) do update set answer=excluded.answer,alternatives=excluded.alternatives,explanation=excluded.explanation;return q;
end $$;
create function public.author_answers(p_set uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform private.require_user();if not private.owns_set(p_set) then raise exception 'Không có quyền.';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('question_id',a.question_id,'answer',a.answer,'alternatives',a.alternatives,'explanation',a.explanation)),'[]') from private.answers a join public.questions q on q.id=a.question_id where q.set_id=p_set);
end $$;
create function public.join_room(p_code text,p_team text default null) returns uuid language plpgsql security definer set search_path='' as $$ declare r public.rooms;n text;begin
 perform private.require_user();perform private.rate_limit('join:'||auth.uid(),20,60);
 select * into r from public.rooms where code=upper(trim(p_code)) for update;
 if r.id is null then raise exception 'Mã phòng không tồn tại.';end if;
 if exists(select 1 from public.room_members where room_id=r.id and user_id=auth.uid()) then return r.id;end if;
 if r.locked or r.status='finished' then raise exception 'Phòng đang khóa hoặc đã kết thúc.';end if;
 if (select count(*) from public.room_members where room_id=r.id)>=r.max_members then raise exception 'Phòng đã đầy.';end if;
 select display_name into n from public.profiles where id=auth.uid();
 insert into public.room_members(room_id,user_id,display_name,team_name) values(r.id,auth.uid(),n,left(p_team,80));return r.id;
end $$;
create function public.control_run(p_room uuid,p_action text,p_question uuid default null,p_seconds integer default 15) returns uuid language plpgsql security definer set search_path='' as $$ declare r public.rooms;v public.runs;q public.questions;begin
 perform private.require_user();select * into r from public.rooms where id=p_room for update;
 if r.id is null or (r.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ MC được điều khiển.';end if;
 if r.status='finished' and p_action not in ('end','reveal') then raise exception 'Phòng đã kết thúc.';end if;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1 for update;
 if p_action='start' then
 if exists(select 1 from public.runs where room_id=p_room and state in ('running','paused','ended')) then raise exception 'Cần công bố đáp án trước câu tiếp theo.';end if;
 select * into q from public.questions where id=p_question and set_id=r.set_id;
 if q.id is null then raise exception 'Câu hỏi không thuộc bộ.';end if;
 insert into public.runs(room_id,question_id,state,deadline,remaining,duration) values(p_room,q.id,'running',clock_timestamp()+make_interval(secs=>q.duration),q.duration,q.duration) returning id into v.id;
 update public.rooms set status='playing' where id=p_room;
 elsif p_action='pause' and v.state='running' then update public.runs set state='paused',remaining=greatest(0,extract(epoch from deadline-clock_timestamp())),deadline=null where id=v.id;
 elsif p_action='resume' and v.state='paused' then update public.runs set state='running',deadline=clock_timestamp()+make_interval(secs=>v.remaining::double precision) where id=v.id;
 elsif p_action='extend' and v.state in ('running','paused') then
 if p_seconds not between 1 and 120 then raise exception 'Thêm 1–120 giây.';end if;
 update public.runs set deadline=case when state='running' then greatest(deadline,clock_timestamp())+make_interval(secs=>p_seconds) else null end,remaining=remaining+p_seconds where id=v.id;
 elsif p_action='end' and v.id is not null then update public.runs set state='ended',deadline=null where id=v.id;
 elsif p_action='reveal' and v.id is not null then update public.runs set state='revealed',deadline=null where id=v.id;
 else raise exception 'Thao tác không hợp lệ với trạng thái hiện tại.';end if;
 return v.id;
end $$;
create function public.current_run(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare v public.runs;q public.questions;result jsonb;begin
 if not private.can_read_room(p_room) then raise exception 'Không có quyền xem phòng.';end if;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1;
 if v.id is null then return null;end if;select * into q from public.questions where id=v.question_id;
 result:=jsonb_build_object('id',v.id,'room_id',v.room_id,'question_id',v.question_id,'state',v.state,'deadline',v.deadline,'remaining',v.remaining,'duration',v.duration,'tiles',q.tiles,'title',q.title,'mode',q.mode,'hint',case when v.state='revealed' then q.hint else '' end,'server_now',clock_timestamp());
 if v.state='revealed' then result:=result||jsonb_build_object('revealed',(select jsonb_build_object('answer',answer,'explanation',explanation) from private.answers where question_id=v.question_id));end if;return result;
end $$;
create function public.use_hint(p_run uuid) returns text language plpgsql security definer set search_path='' as $$ declare v public.runs;h text;begin
 perform private.require_user();select * into v from public.runs where id=p_run for update;
 if not exists(select 1 from public.room_members where room_id=v.room_id and user_id=auth.uid()) or v.state<>'running' or clock_timestamp()>=v.deadline then raise exception 'Không thể dùng gợi ý.';end if;
 insert into private.hint_uses values(v.id,auth.uid()) on conflict do nothing;select hint into h from public.questions where id=v.question_id;return h;
end $$;
create function public.submit_answer(p_run uuid,p_answer text) returns jsonb language plpgsql security definer set search_path='' as $$ declare v public.runs;q public.questions;a private.answers;ok boolean;points integer;s public.submissions;left_seconds numeric;begin
 perform private.require_user();perform private.rate_limit('answer:'||auth.uid(),30,60);
 select * into v from public.runs where id=p_run for update;
 if not exists(select 1 from public.room_members m join public.rooms r on r.id=m.room_id where m.room_id=v.room_id and m.user_id=auth.uid() and r.status='playing') then raise exception 'Bạn chưa tham gia phòng hoặc phòng đã kết thúc.';end if;
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
-- Wheel row lock serializes prize edits and all official spins for that wheel.
create function private.lock_wheel() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.wheels where id=case when TG_OP='DELETE' then old.wheel_id else new.wheel_id end for update;
 if TG_OP='UPDATE' and new.wheel_id<>old.wheel_id then raise exception 'Không được chuyển quà sang vòng khác.';end if;
 return case when TG_OP='DELETE' then old else new end;end $$;
create trigger serialize_prizes before insert or update or delete on public.prizes for each row execute function private.lock_wheel();
create function private.secure_random() returns double precision language plpgsql volatile set search_path='' as $$ declare b bytea;n bigint;begin
 b:=extensions.gen_random_bytes(6);n:=get_byte(b,0)::bigint*1099511627776+get_byte(b,1)::bigint*4294967296+get_byte(b,2)::bigint*16777216+get_byte(b,3)::bigint*65536+get_byte(b,4)::bigint*256+get_byte(b,5);return n/281474976710656.0;end $$;
create function public.spin_wheel(p_wheel uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare w public.wheels;s public.spins;p public.prizes;total numeric;c numeric:=0;pick numeric;probs jsonb;begin
 perform private.require_user();select * into w from public.wheels where id=p_wheel for update;
 if w.id is null then raise exception 'Vòng quay không tồn tại.';end if;
 if w.owner_id<>auth.uid() and not exists(select 1 from public.spin_tickets where wheel_id=p_wheel and user_id=auth.uid()) then raise exception 'Cần chủ vòng cấp lượt quay.';end if;
 select * into s from public.spins where id=p_id;if s.id is not null then
 if s.user_id<>auth.uid() or s.wheel_id<>p_wheel then raise exception 'ID lượt quay không hợp lệ.';end if;return to_jsonb(s);end if;
 if w.owner_id<>auth.uid() then update public.spin_tickets set remaining=remaining-1 where wheel_id=p_wheel and user_id=auth.uid() and remaining>0;if not found then raise exception 'Bạn đã hết lượt quay.';end if;end if;
 perform private.rate_limit('spin:'||auth.uid(),20,60);
 if (select count(*) from public.prizes where wheel_id=p_wheel) not between 2 and 100 then raise exception 'Vòng quay cần 2–100 ô.';end if;
 if w.probability_mode='percent' and abs((select coalesce(sum(weight),0) from public.prizes where wheel_id=p_wheel)-100)>0.000001 then raise exception 'Tổng xác suất phải bằng 100%%.';end if;
 select sum(weight),jsonb_agg(jsonb_build_object('id',id,'label',label,'weight',weight) order by position,id) into total,probs from public.prizes where wheel_id=p_wheel and enabled and (stock is null or stock>0) and weight>0;
 if total is null or total<=0 then raise exception 'Không còn phần thưởng hợp lệ.';end if;
 pick:=private.secure_random()*total;
 for p in select * from public.prizes where wheel_id=p_wheel and enabled and (stock is null or stock>0) and weight>0 order by position,id loop c:=c+p.weight;exit when pick<c;end loop;
 update public.prizes set stock=stock-1 where id=p.id and stock is not null;
 insert into public.spins(id,wheel_id,user_id,prize_id,result_label,probabilities) values(p_id,p_wheel,auth.uid(),p.id,p.label,jsonb_build_object('total',total,'entries',probs,'rule','renormalize-available')) returning * into s;return to_jsonb(s);
end $$;
create function public.mark_delivered(p_spin uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.require_user();update public.spins s set delivered=true from public.wheels w where s.id=p_spin and w.id=s.wheel_id and w.owner_id=auth.uid();if not found then raise exception 'Không có quyền.';end if;end $$;
create function public.active_theme(p_room uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$ declare selected uuid;begin
 if p_room is not null and not private.can_read_room(p_room) then raise exception 'Không có quyền.';end if;
 select s.theme_id into selected from public.event_schedules s where s.enabled and s.starts_at<=clock_timestamp() and clock_timestamp()<s.ends_at and ((p_room is not null and s.room_id=p_room) or (s.room_id is null and s.owner_id=case when p_room is null then auth.uid() else (select owner_id from public.rooms where id=p_room) end)) order by s.priority desc,s.starts_at desc,s.id limit 1;
 if selected is null and p_room is not null then select theme_id into selected from public.rooms where id=p_room;end if;
 return jsonb_build_object('server_now',clock_timestamp(),'theme',(select to_jsonb(t) from public.themes t where id=selected));end $$;
create function public.admin_users() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not private.is_admin() or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'Cần admin và MFA.';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'role',r.role)),'[]') from public.profiles p join private.user_roles r on r.user_id=p.id);end $$;
create function public.admin_set_role(p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.is_admin() or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'Cần admin và MFA.';end if;
 if p_user=auth.uid() or p_role not in ('user','admin') then raise exception 'Vai trò không hợp lệ hoặc đang sửa chính mình.';end if;
 update private.user_roles set role=p_role where user_id=p_user;insert into public.audit_logs(actor_id,action,entity_id) values(auth.uid(),'set_role:'||p_role,p_user);end $$;
-- Password update goes through Auth; gate cleared only after Auth user password hash has changed.
create function private.password_changed() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.encrypted_password is distinct from old.encrypted_password then update private.user_roles set must_change_password=false where user_id=new.id;end if;return new;end $$;
create trigger bootstrap_password_changed after update of encrypted_password on auth.users for each row execute function private.password_changed();

create function public.grant_spins(p_room uuid,p_wheel uuid,p_user uuid,p_count integer) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.require_user();
 if p_count not between 1 and 100 or not exists(select 1 from public.rooms where id=p_room and owner_id=auth.uid()) or not exists(select 1 from public.room_members where room_id=p_room and user_id=p_user) then raise exception 'Cần MC và thành viên hợp lệ, số lượt 1–100.';end if;
 perform 1 from public.wheels where id=p_wheel and owner_id=auth.uid() for update;if not found then raise exception 'Vòng quay không thuộc MC.';end if;
 insert into public.spin_tickets values(p_wheel,p_user,p_count) on conflict(wheel_id,user_id) do update set remaining=public.spin_tickets.remaining+excluded.remaining;
 insert into public.audit_logs(actor_id,action,entity_id) values(auth.uid(),'grant_spins:'||p_count,p_user);
end $$;

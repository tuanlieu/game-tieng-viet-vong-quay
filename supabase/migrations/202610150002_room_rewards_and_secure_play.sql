-- Fastest-correct rewards and a deliberately small, safe game-state API.
-- This migration never sends an unrevealed answer, correctness or current-run
-- score to a player browser.

alter table public.rooms add column if not exists reward_fastest_enabled boolean not null default false;
alter table public.rooms add column if not exists reward_wheel_id uuid references public.wheels(id);

create table if not exists public.room_reward_inventory(
  room_id uuid not null references public.rooms on delete cascade,
  prize_id uuid not null,
  label text not null,
  color text not null check(color ~ '^#[0-9A-Fa-f]{6}$'),
  weight numeric not null check(weight >= 0),
  remaining integer check(remaining >= 0),
  enabled boolean not null default true,
  position integer not null default 0,
  primary key(room_id,prize_id)
);
create table if not exists public.run_rewards(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  wheel_id uuid not null references public.wheels,
  user_id uuid not null references auth.users,
  state text not null default 'available' check(state in ('available','spun','void')),
  spin_id uuid unique,
  result_label text,
  result_color text,
  awarded_at timestamptz not null default clock_timestamp(),
  spun_at timestamptz
);
create index if not exists run_rewards_room_idx on public.run_rewards(room_id,awarded_at desc);

alter table public.room_reward_inventory enable row level security;
alter table public.run_rewards enable row level security;
revoke all on public.room_reward_inventory, public.run_rewards from anon, authenticated;
drop policy if exists reward_inventory_owner on public.room_reward_inventory;
drop policy if exists run_rewards_read on public.run_rewards;
create policy reward_inventory_owner on public.room_reward_inventory for select to authenticated using(exists(select 1 from public.rooms r where r.id=room_id and (r.owner_id=auth.uid() or private.is_admin())));
create policy run_rewards_read on public.run_rewards for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.rooms r where r.id=room_id and (r.owner_id=auth.uid() or private.is_admin())));
grant select on public.room_reward_inventory, public.run_rewards to authenticated;

create or replace function public.configure_room_reward(p_room uuid,p_enabled boolean,p_wheel uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms; valid_count integer; total numeric;
begin
 perform private.require_user();
 select * into r from public.rooms where id=p_room for update;
 if r.id is null or (r.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ chủ phòng được cấu hình thưởng.'; end if;
 if r.status <> 'waiting' then raise exception 'Chỉ cấu hình thưởng trước khi bắt đầu phòng.'; end if;
 if not p_enabled then
   update public.rooms set reward_fastest_enabled=false,reward_wheel_id=null where id=p_room;
   delete from public.room_reward_inventory where room_id=p_room;
   return;
 end if;
 if p_wheel is null or not exists(select 1 from public.wheels where id=p_wheel and owner_id=r.owner_id) then raise exception 'Hãy chọn vòng quay thuộc chủ phòng.'; end if;
 select count(*),coalesce(sum(weight),0) into valid_count,total from public.prizes where wheel_id=p_wheel and enabled and weight>0 and (stock is null or stock>0);
 if valid_count not between 2 and 100 or total<=0 then raise exception 'Vòng quay cần 2–100 phần thưởng khả dụng, có trọng số hợp lệ.'; end if;
 if exists(select 1 from public.wheels where id=p_wheel and probability_mode='percent') and abs(total-100)>0.000001 then raise exception 'Tổng xác suất của vòng quay phải bằng một trăm phần trăm.'; end if;
 update public.rooms set reward_fastest_enabled=true,reward_wheel_id=p_wheel where id=p_room;
 delete from public.room_reward_inventory where room_id=p_room;
 insert into public.room_reward_inventory(room_id,prize_id,label,color,weight,remaining,enabled,position)
 select p_room,id,label,color,weight,stock,enabled,position from public.prizes where wheel_id=p_wheel;
end $$;

create or replace function public.validate_room_invitation(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
 perform private.require_player();
 select * into r from public.rooms where code=upper(trim(p_code));
 if r.id is null then raise exception 'Mã phòng không tồn tại.'; end if;
 if r.locked then raise exception 'Phòng đang khóa, chưa nhận người chơi mới.'; end if;
 if r.status='finished' then raise exception 'Phòng đã kết thúc.'; end if;
 if r.status='playing' and not r.late_join_enabled then raise exception 'MC đang tắt tham gia muộn.'; end if;
 if (select count(*) from public.room_members where room_id=r.id and removed_at is null)>=r.max_members then raise exception 'Phòng đã đầy.'; end if;
 return jsonb_build_object('code',r.code,'title',r.title);
end $$;

create or replace function public.duplicate_room(p_room uuid,p_title text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare source_room public.rooms; new_id uuid;
begin
 perform private.require_user();
 select * into source_room from public.rooms where id=p_room;
 if source_room.id is null or (source_room.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ chủ phòng được nhân đôi phòng.'; end if;
 insert into public.rooms(owner_id,set_id,title,max_members,theme_id,late_join_enabled,reward_fastest_enabled,reward_wheel_id)
 values(auth.uid(),source_room.set_id,coalesce(nullif(btrim(p_title),''),source_room.title||' (bản sao)'),source_room.max_members,source_room.theme_id,source_room.late_join_enabled,source_room.reward_fastest_enabled,source_room.reward_wheel_id) returning id into new_id;
 if source_room.reward_wheel_id is not null then
   insert into public.room_reward_inventory(room_id,prize_id,label,color,weight,remaining,enabled,position)
   select new_id,prize_id,label,color,weight,remaining,enabled,position from public.room_reward_inventory where room_id=p_room;
 end if;
 return new_id;
end $$;

create or replace function public.delete_room(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
 perform private.require_user(); select * into r from public.rooms where id=p_room for update;
 if r.id is null or (r.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ chủ phòng được xóa phòng.'; end if;
 if r.status='playing' then raise exception 'Hãy kết thúc phòng trước khi xóa.'; end if;
 delete from public.rooms where id=p_room;
end $$;

-- Replace control_run so that one idempotent ticket is granted only at reveal.
create or replace function public.control_run(p_room uuid,p_action text,p_question uuid default null,p_seconds integer default 15) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rooms;v public.runs;q public.questions; winner uuid;
begin
 perform private.require_user(); select * into r from public.rooms where id=p_room for update;
 if r.id is null or (r.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ MC được điều khiển.';end if;
 if r.status='finished' and p_action not in ('end','reveal') then raise exception 'Phòng đã kết thúc.';end if;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1 for update;
 if p_action='start' then
   if exists(select 1 from public.runs where room_id=p_room and state in ('running','paused','ended')) then raise exception 'Cần công bố đáp án trước câu tiếp theo.';end if;
   select * into q from public.questions where id=p_question and set_id=r.set_id;
   if q.id is null then raise exception 'Câu hỏi không thuộc bộ.';end if;
   if r.reward_fastest_enabled and not exists(select 1 from public.room_reward_inventory where room_id=p_room and enabled and weight>0 and (remaining is null or remaining>0)) then raise exception 'Không còn phần thưởng khả dụng; hãy tắt thưởng hoặc cấu hình lại trước khi bắt đầu.'; end if;
   insert into public.runs(room_id,question_id,state,deadline,remaining,duration) values(p_room,q.id,'running',clock_timestamp()+make_interval(secs=>q.duration),q.duration,q.duration) returning * into v;
   update public.rooms set status='playing' where id=p_room;
 elsif p_action='pause' and v.state='running' then update public.runs set state='paused',remaining=greatest(0,extract(epoch from deadline-clock_timestamp())),deadline=null where id=v.id;
 elsif p_action='resume' and v.state='paused' then update public.runs set state='running',deadline=clock_timestamp()+make_interval(secs=>v.remaining::double precision) where id=v.id;
 elsif p_action='extend' and v.state in ('running','paused') then
   if p_seconds not between 1 and 120 then raise exception 'Thêm 1–120 giây.';end if;
   update public.runs set deadline=case when state='running' then greatest(deadline,clock_timestamp())+make_interval(secs=>p_seconds) else null end,remaining=remaining+p_seconds where id=v.id;
 elsif p_action='end' and v.id is not null then update public.runs set state='ended',deadline=null where id=v.id;
 elsif p_action='reveal' and v.id is not null then
   update public.runs set state='revealed',deadline=null where id=v.id and state <> 'revealed';
   if found and r.reward_fastest_enabled and r.reward_wheel_id is not null then
     select user_id into winner from public.submissions where run_id=v.id and correct order by submitted_at,id limit 1;
     if winner is not null then insert into public.run_rewards(run_id,room_id,wheel_id,user_id) values(v.id,p_room,r.reward_wheel_id,winner) on conflict(run_id) do nothing; end if;
   end if;
 else raise exception 'Thao tác không hợp lệ với trạng thái hiện tại.';end if;
 return v.id;
end $$;

create or replace function public.spin_room_reward(p_reward uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.run_rewards; p public.room_reward_inventory; total numeric; pick numeric; cursor numeric:=0; new_spin uuid:=gen_random_uuid();
begin
 perform private.require_player();
 select * into t from public.run_rewards where id=p_reward for update;
 if t.id is null or t.user_id<>auth.uid() then raise exception 'Lượt quay không hợp lệ.'; end if;
 if t.state='spun' then return jsonb_build_object('id',t.id,'state',t.state,'label',t.result_label,'color',t.result_color,'spin_id',t.spin_id); end if;
 if t.state<>'available' then raise exception 'Lượt quay không còn khả dụng.'; end if;
 perform private.rate_limit('room-spin:'||auth.uid(),10,60);
 -- Lock the frozen inventory. Later edits to the source wheel cannot change this game.
 perform 1 from public.room_reward_inventory where room_id=t.room_id order by position,prize_id for update;
 select coalesce(sum(weight),0) into total from public.room_reward_inventory where room_id=t.room_id and enabled and weight>0 and (remaining is null or remaining>0);
 if total<=0 then raise exception 'Không còn phần thưởng khả dụng. Lượt quay của bạn vẫn được giữ.'; end if;
 pick:=private.secure_random()*total;
 for p in select * from public.room_reward_inventory where room_id=t.room_id and enabled and weight>0 and (remaining is null or remaining>0) order by position,prize_id loop cursor:=cursor+p.weight; exit when pick<cursor; end loop;
 update public.room_reward_inventory set remaining=remaining-1 where room_id=t.room_id and prize_id=p.prize_id and remaining is not null;
 update public.run_rewards set state='spun',spin_id=new_spin,result_label=p.label,result_color=p.color,spun_at=clock_timestamp() where id=t.id;
 return jsonb_build_object('id',t.id,'state','spun','label',p.label,'color',p.color,'spin_id',new_spin);
end $$;

-- Safe projection. Scores from the current question and all correctness flags
-- stay private until reveal. A player can see only that they have submitted.
create or replace function public.room_play_state(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.runs; own_answer text; own_submission public.submissions; current jsonb; latest_reward public.run_rewards;
begin
 if not private.can_read_room(p_room) then raise exception 'Không có quyền xem phòng.'; end if;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1;
 if v.id is not null then
   select * into own_submission from public.submissions where run_id=v.id and user_id=auth.uid();
   if own_submission.id is not null then select answer into own_answer from private.submitted_answers where submission_id=own_submission.id; end if;
 end if;
 current:=public.current_run(p_room);
 select * into latest_reward from public.run_rewards where room_id=p_room order by awarded_at desc limit 1;
 return jsonb_build_object(
  'run',current,
  'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,'team_name',m.team_name,'last_seen_at',m.last_seen_at,'score',coalesce((select sum(s.score) from public.submissions s join public.runs rr on rr.id=s.run_id where s.user_id=m.user_id and rr.room_id=p_room and rr.state='revealed'),0)) order by m.display_name),'[]'::jsonb) from public.room_members m where m.room_id=p_room and m.removed_at is null),
  'my_submission',case when own_submission.id is null then null else jsonb_build_object('submitted',true,'answer',own_answer,'correct',case when v.state='revealed' then own_submission.correct else null end,'score',case when v.state='revealed' then own_submission.score else null end) end,
  'reward',case when latest_reward.id is null then null else jsonb_build_object('id',latest_reward.id,'run_id',latest_reward.run_id,'winner',(select display_name from public.room_members where room_id=p_room and user_id=latest_reward.user_id),'state',case when latest_reward.user_id=auth.uid() then latest_reward.state else case when latest_reward.state='spun' then 'spun' else 'available' end end,'mine',latest_reward.user_id=auth.uid(),'label',case when latest_reward.state='spun' then latest_reward.result_label else null end,'color',case when latest_reward.state='spun' then latest_reward.result_color else null end) end
 );
end $$;

-- Direct table reads were leaking correct/score through the Realtime payload.
drop policy if exists submissions_read on public.submissions;
create policy submissions_read_safe on public.submissions for select to authenticated using(
  exists(select 1 from public.rooms r join public.runs rr on rr.room_id=r.id where rr.id=run_id and r.owner_id=auth.uid())
  or (user_id=auth.uid() and exists(select 1 from public.runs rr where rr.id=run_id and rr.state='revealed'))
);
grant execute on function public.configure_room_reward(uuid,boolean,uuid),public.validate_room_invitation(text),public.duplicate_room(uuid,text),public.delete_room(uuid),public.spin_room_reward(uuid),public.room_play_state(uuid),public.control_run(uuid,text,uuid,integer) to authenticated;
grant update(reward_fastest_enabled,reward_wheel_id) on public.rooms to authenticated;
alter publication supabase_realtime add table public.run_rewards;

-- Monetary reward values are explicit, never inferred from the prize label.
-- Snapshots on room inventory and awarded rewards keep historical totals stable.

alter table public.prizes
  add column if not exists reward_kind text not null default 'gift' check(reward_kind in ('gift','cash')),
  add column if not exists cash_value bigint not null default 0 check(cash_value >= 0);
alter table public.room_reward_inventory
  add column if not exists reward_kind text not null default 'gift' check(reward_kind in ('gift','cash')),
  add column if not exists cash_value bigint not null default 0 check(cash_value >= 0);
alter table public.run_rewards
  add column if not exists result_kind text not null default 'gift' check(result_kind in ('gift','cash')),
  add column if not exists result_cash_value bigint not null default 0 check(result_cash_value >= 0);

create or replace function public.configure_room_reward(p_room uuid,p_enabled boolean,p_wheel uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms; valid_count integer; total numeric; active_run boolean;
begin
 perform private.require_user();
 select * into r from public.rooms where id=p_room for update;
 if r.id is null or (r.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ chủ phòng được cấu hình thưởng.'; end if;
 select exists(select 1 from public.runs where room_id=p_room and state in ('running','paused','ended')) into active_run;
 if active_run then raise exception 'Có thể thay đổi sau khi kết thúc câu hiện tại.'; end if;
 if r.status='finished' then raise exception 'Phòng đã kết thúc, không thể thay đổi cấu hình thưởng.'; end if;
 if r.status='playing' and p_enabled and p_wheel is distinct from r.reward_wheel_id and exists(select 1 from public.run_rewards where room_id=p_room) then raise exception 'Không thể đổi vòng quay sau khi đã cấp thưởng; bạn vẫn có thể bật hoặc tắt thưởng cho các câu tiếp theo.'; end if;
 if not p_enabled then
   update public.rooms set reward_fastest_enabled=false where id=p_room;
   if r.status='waiting' then update public.rooms set reward_wheel_id=null where id=p_room; delete from public.room_reward_inventory where room_id=p_room; end if;
   return;
 end if;
 if p_wheel is null or not exists(select 1 from public.wheels where id=p_wheel and owner_id=r.owner_id) then raise exception 'Hãy chọn vòng quay thuộc chủ phòng.'; end if;
 select count(*),coalesce(sum(weight),0) into valid_count,total from public.prizes where wheel_id=p_wheel and enabled and weight>0 and (stock is null or stock>0);
 if valid_count not between 2 and 100 or total<=0 then raise exception 'Vòng quay cần 2–100 phần thưởng khả dụng, có trọng số hợp lệ.'; end if;
 if exists(select 1 from public.wheels where id=p_wheel and probability_mode='percent') and abs(total-100)>0.000001 then raise exception 'Tổng xác suất của vòng quay phải bằng một trăm phần trăm.'; end if;
 update public.rooms set reward_fastest_enabled=true,reward_wheel_id=p_wheel where id=p_room;
 if r.status='waiting' or p_wheel is distinct from r.reward_wheel_id then
   delete from public.room_reward_inventory where room_id=p_room;
   insert into public.room_reward_inventory(room_id,prize_id,label,color,weight,remaining,enabled,position,reward_kind,cash_value)
   select p_room,id,label,color,weight,stock,enabled,position,reward_kind,cash_value from public.prizes where wheel_id=p_wheel;
 end if;
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
 perform 1 from public.room_reward_inventory where room_id=t.room_id order by position,prize_id for update;
 select coalesce(sum(weight),0) into total from public.room_reward_inventory where room_id=t.room_id and enabled and weight>0 and (remaining is null or remaining>0);
 if total<=0 then raise exception 'Không còn phần thưởng khả dụng. Lượt quay của bạn vẫn được giữ.'; end if;
 pick:=private.secure_random()*total;
 for p in select * from public.room_reward_inventory where room_id=t.room_id and enabled and weight>0 and (remaining is null or remaining>0) order by position,prize_id loop cursor:=cursor+p.weight; exit when pick<cursor; end loop;
 update public.room_reward_inventory set remaining=remaining-1 where room_id=t.room_id and prize_id=p.prize_id and remaining is not null;
 update public.run_rewards set state='spun',spin_id=new_spin,result_label=p.label,result_color=p.color,result_kind=p.reward_kind,result_cash_value=p.cash_value,spun_at=clock_timestamp() where id=t.id;
 return jsonb_build_object('id',t.id,'state','spun','label',p.label,'color',p.color,'spin_id',new_spin);
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
   insert into public.room_reward_inventory(room_id,prize_id,label,color,weight,remaining,enabled,position,reward_kind,cash_value)
   select new_id,prize_id,label,color,weight,remaining,enabled,position,reward_kind,cash_value from public.room_reward_inventory where room_id=p_room;
 end if;
 return new_id;
end $$;

create or replace function public.reward_totals(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare player_gifts bigint:=0; player_cash bigint:=0; host_gifts bigint:=0; host_cash bigint:=0; is_host boolean:=false;
begin
 if not private.can_read_room(p_room) then raise exception 'Không có quyền xem phòng.'; end if;
 select exists(select 1 from public.rooms where id=p_room and owner_id=auth.uid()) into is_host;
 select count(*) filter(where coalesce(result_kind,'gift')='gift'),coalesce(sum(result_cash_value) filter(where coalesce(result_kind,'gift')='cash'),0)
 into player_gifts,player_cash from public.run_rewards where user_id=auth.uid() and state='spun';
 if is_host then
   select count(*) filter(where coalesce(result_kind,'gift')='gift'),coalesce(sum(result_cash_value) filter(where coalesce(result_kind,'gift')='cash'),0)
   into host_gifts,host_cash from public.run_rewards where room_id=p_room and state='spun';
 end if;
 return jsonb_build_object('player',jsonb_build_object('gifts',coalesce(player_gifts,0),'cash',coalesce(player_cash,0)),'host',case when is_host then jsonb_build_object('gifts',coalesce(host_gifts,0),'cash',coalesce(host_cash,0)) else null end);
end $$;

create or replace function public.room_play_state(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.runs; own_answer text; own_submission public.submissions; current jsonb; latest_reward public.run_rewards; room_row public.rooms;
begin
 if not private.can_read_room(p_room) then raise exception 'Không có quyền xem phòng.'; end if;
 select * into room_row from public.rooms where id=p_room;
 select * into v from public.runs where room_id=p_room order by created_at desc limit 1;
 if v.id is not null then select * into own_submission from public.submissions where run_id=v.id and user_id=auth.uid(); if own_submission.id is not null then select answer into own_answer from private.submitted_answers where submission_id=own_submission.id; end if; end if;
 current:=public.current_run(p_room);
 select * into latest_reward from public.run_rewards where room_id=p_room order by awarded_at desc limit 1;
 return jsonb_build_object(
  'run',current,
  'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,'team_name',m.team_name,'last_seen_at',m.last_seen_at,'score',coalesce((select sum(s.score) from public.submissions s join public.runs rr on rr.id=s.run_id where s.user_id=m.user_id and rr.room_id=p_room and rr.state='revealed'),0)) order by m.display_name),'[]'::jsonb) from public.room_members m where m.room_id=p_room and m.removed_at is null),
  'my_submission',case when own_submission.id is null then null else jsonb_build_object('submitted',true,'answer',own_answer,'correct',case when v.state='revealed' then own_submission.correct else null end,'score',case when v.state='revealed' then own_submission.score else null end) end,
  'reward',case when latest_reward.id is null then null else jsonb_build_object('id',latest_reward.id,'run_id',latest_reward.run_id,'winner',(select display_name from public.room_members where room_id=p_room and user_id=latest_reward.user_id),'state',case when latest_reward.user_id=auth.uid() then latest_reward.state else case when latest_reward.state='spun' then 'spun' else 'available' end end,'mine',latest_reward.user_id=auth.uid(),'label',case when latest_reward.state='spun' then latest_reward.result_label else null end,'color',case when latest_reward.state='spun' then latest_reward.result_color else null end) end,
  'reward_status',jsonb_build_object(
    'enabled',room_row.reward_fastest_enabled,
    'available_count',(select count(*) from public.run_rewards where room_id=p_room and user_id=auth.uid() and state='available'),
    'wheel',case when room_row.reward_wheel_id is null then null else jsonb_build_object('id',room_row.reward_wheel_id,'title',coalesce((select title from public.wheels where id=room_row.reward_wheel_id),'Vòng quay phần thưởng'),'items',(select coalesce(jsonb_agg(jsonb_build_object('id',prize_id,'label',label,'color',color,'remaining',remaining,'position',position,'reward_kind',reward_kind,'cash_value',cash_value) order by position,prize_id),'[]'::jsonb) from public.room_reward_inventory where room_id=p_room and enabled)) end,
    'history',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'label',result_label,'color',result_color,'awarded_at',awarded_at,'spun_at',spun_at) order by awarded_at desc),'[]'::jsonb) from (select * from public.run_rewards where room_id=p_room and user_id=auth.uid() order by awarded_at desc limit 12) own_rewards)),
  'reward_totals',public.reward_totals(p_room)
 );
end $$;

grant execute on function public.configure_room_reward(uuid,boolean,uuid),public.spin_room_reward(uuid),public.duplicate_room(uuid,text),public.reward_totals(uuid),public.room_play_state(uuid) to authenticated;
notify pgrst, 'reload schema';

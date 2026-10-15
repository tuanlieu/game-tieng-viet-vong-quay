-- Safe follow-up: reward settings may change between questions, and question
-- bulk actions stay server-authorized. All objects are replaceable/re-runnable.

create or replace function public.configure_room_reward(p_room uuid,p_enabled boolean,p_wheel uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.rooms; valid_count integer; total numeric; active_run boolean;
begin
 perform private.require_user();
 select * into r from public.rooms where id=p_room for update;
 if r.id is null or (r.owner_id<>auth.uid() and not private.is_admin()) then raise exception 'Chỉ chủ phòng được cấu hình thưởng.'; end if;
 select exists(select 1 from public.runs where room_id=p_room and state in ('running','paused','ended')) into active_run;
 if active_run then raise exception 'Có thể thay đổi sau khi kết thúc câu hiện tại.'; end if;
 if r.status='finished' then raise exception 'Phòng đã kết thúc, không thể thay đổi cấu hình thưởng.'; end if;
 -- Existing tickets remain attached to the current frozen inventory. The MC
 -- may still toggle rewards for future questions between questions.
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
   insert into public.room_reward_inventory(room_id,prize_id,label,color,weight,remaining,enabled,position)
   select p_room,id,label,color,weight,stock,enabled,position from public.prizes where wheel_id=p_wheel;
 end if;
end $$;

create or replace function public.bulk_update_questions(p_set uuid,p_questions uuid[],p_duration integer default null,p_points integer default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare total_count integer; changed_count integer;
begin
 perform private.require_user();
 if not private.owns_set(p_set) then raise exception 'Không có quyền sửa bộ câu hỏi.'; end if;
 if cardinality(p_questions) is null or cardinality(p_questions)=0 then raise exception 'Chưa chọn câu hỏi.'; end if;
 if p_duration is not null and p_duration not between 5 and 600 then raise exception 'Thời gian phải từ 5 đến 600 giây.'; end if;
 if p_points is not null and p_points not between 0 and 10000 then raise exception 'Điểm phải từ 0 đến 10000.'; end if;
 select count(*) into total_count from public.questions where set_id=p_set and id=any(p_questions);
 if total_count<>cardinality(p_questions) then raise exception 'Có câu hỏi không thuộc bộ hiện tại.'; end if;
 if exists(select 1 from public.runs r where r.question_id=any(p_questions) and r.state in ('running','paused','ended')) then raise exception 'Không thể sửa hoặc xóa câu đang được dùng trong phòng chơi.'; end if;
 if p_delete then
   if exists(select 1 from public.runs where question_id=any(p_questions)) then raise exception 'Không thể xóa câu đã có dữ liệu phiên chơi.'; end if;
   delete from public.questions where set_id=p_set and id=any(p_questions); get diagnostics changed_count=row_count;
 else
   if p_duration is null and p_points is null then raise exception 'Chọn thời gian hoặc điểm cần cập nhật.'; end if;
   update public.questions set duration=coalesce(p_duration,duration),points=coalesce(p_points,points) where set_id=p_set and id=any(p_questions); get diagnostics changed_count=row_count;
 end if;
 return jsonb_build_object('requested',cardinality(p_questions),'changed',changed_count,'deleted',p_delete);
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
  'reward_status',jsonb_build_object('enabled',room_row.reward_fastest_enabled,'available_count',(select count(*) from public.run_rewards where room_id=p_room and user_id=auth.uid() and state='available'),'history',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'label',result_label,'color',result_color,'awarded_at',awarded_at,'spun_at',spun_at) order by awarded_at desc),'[]'::jsonb) from (select * from public.run_rewards where room_id=p_room and user_id=auth.uid() order by awarded_at desc limit 12) own_rewards))
 );
end $$;

grant execute on function public.configure_room_reward(uuid,boolean,uuid),public.bulk_update_questions(uuid,uuid[],integer,integer,boolean),public.room_play_state(uuid) to authenticated;

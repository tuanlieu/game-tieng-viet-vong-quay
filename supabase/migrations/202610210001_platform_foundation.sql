-- Platform foundation for the three-step game studio.
-- This migration is additive: existing sets, questions, rooms, rewards and
-- room links remain untouched. Rollback: drop the new table/function/indexes
-- and the added columns only after confirming no new studio data uses them.

alter table public.question_sets
  add column if not exists game_template text not null default 'vua_tieng_viet'
    check (game_template in ('vua_tieng_viet', 'duoi_hinh_bat_chu', 'ket_hop')),
  add column if not exists cover_url text,
  add column if not exists game_settings jsonb not null default '{}'::jsonb;

-- Old sets remain playable. Infer the template from their existing questions.
update public.question_sets s
set game_template = case
  when exists (select 1 from public.questions q where q.set_id = s.id and q.question_type = 'duoi_hinh_bat_chu')
       and exists (select 1 from public.questions q where q.set_id = s.id and q.question_type = 'vua_tieng_viet') then 'ket_hop'
  when exists (select 1 from public.questions q where q.set_id = s.id and q.question_type = 'duoi_hinh_bat_chu') then 'duoi_hinh_bat_chu'
  else 'vua_tieng_viet'
end;

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(event_type) between 1 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.game_events enable row level security;

drop policy if exists game_events_owner_read on public.game_events;
create policy game_events_owner_read on public.game_events
for select to authenticated
using (
  exists (
    select 1 from public.rooms r
    where r.id = game_events.room_id
      and (r.owner_id = (select auth.uid()) or private.is_admin())
  )
);

-- Query support for the room dashboard, lists and realtime room state.
create index if not exists questions_set_position_idx on public.questions(set_id, position);
create index if not exists rooms_owner_created_idx on public.rooms(owner_id, created_at desc);
create index if not exists runs_room_created_idx on public.runs(room_id, created_at desc);
create index if not exists room_members_room_active_idx on public.room_members(room_id) where removed_at is null;
create index if not exists submissions_run_user_idx on public.submissions(run_id, user_id);
create index if not exists run_rewards_room_state_idx on public.run_rewards(room_id, state);
create index if not exists game_events_room_created_idx on public.game_events(room_id, created_at desc);

-- Removes the mutable search_path advisory without changing the public RPC.
create or replace function public.server_time()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select clock_timestamp() $$;

-- A public-safe aggregate for an organiser's own dashboard. No question
-- answers, player answer text or other organisers' records are returned.
create or replace function public.owner_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  perform private.require_user();
  return jsonb_build_object(
    'sets', (select count(*) from public.question_sets where owner_id = v_user),
    'questions', (select count(*) from public.questions q join public.question_sets s on s.id = q.set_id where s.owner_id = v_user),
    'rooms', (select count(*) from public.rooms where owner_id = v_user),
    'waiting_rooms', (select count(*) from public.rooms where owner_id = v_user and status = 'waiting'),
    'playing_rooms', (select count(*) from public.rooms where owner_id = v_user and status = 'playing'),
    'finished_rooms', (select count(*) from public.rooms where owner_id = v_user and status = 'finished'),
    'players', (select count(distinct m.user_id) from public.room_members m join public.rooms r on r.id = m.room_id where r.owner_id = v_user and m.removed_at is null),
    'gifts_awarded', (select count(*) from public.run_rewards rr join public.rooms r on r.id = rr.room_id where r.owner_id = v_user and rr.state = 'spun' and coalesce(rr.result_kind, 'gift') = 'gift'),
    'cash_awarded', (select coalesce(sum(rr.result_cash_value), 0) from public.run_rewards rr join public.rooms r on r.id = rr.room_id where r.owner_id = v_user and rr.state = 'spun' and coalesce(rr.result_kind, 'gift') = 'cash'),
    'recent_rooms', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'code', r.code, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
      from (select * from public.rooms where owner_id = v_user order by created_at desc limit 8) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.owner_dashboard() from public, anon;
grant execute on function public.owner_dashboard() to authenticated;

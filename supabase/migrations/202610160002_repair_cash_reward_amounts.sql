-- Repair two incorrectly entered cash amounts. Prize labels and explicit VND
-- values now agree, including for the already-spun reward.
alter table public.prizes disable trigger ready_write_prizes;

update public.prizes
set cash_value = case id
  when '2ed13a6f-d65f-4fdf-9180-e1152650e35a'::uuid then 10000
  when 'f4b74b7b-65d0-4a46-ad8c-02e1f6c1a737'::uuid then 20000
  else cash_value
end
where id in (
  '2ed13a6f-d65f-4fdf-9180-e1152650e35a'::uuid,
  'f4b74b7b-65d0-4a46-ad8c-02e1f6c1a737'::uuid
);

alter table public.prizes enable trigger ready_write_prizes;

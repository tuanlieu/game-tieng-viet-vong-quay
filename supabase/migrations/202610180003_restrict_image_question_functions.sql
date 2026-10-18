-- PostgreSQL grants EXECUTE to PUBLIC by default. Restrict these organiser-only
-- helpers to signed-in sessions explicitly.
revoke execute on function public.save_image_question(uuid,text,text,integer,integer) from anon, public;
grant execute on function public.save_image_question(uuid,text,text,integer,integer) to authenticated;

revoke execute on function public.import_duoi_hinh_bat_chu() from anon, public;
grant execute on function public.import_duoi_hinh_bat_chu() to authenticated;

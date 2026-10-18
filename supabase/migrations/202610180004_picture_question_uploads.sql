-- Public files are puzzle images only; answers stay in private.answers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists question_images_upload on storage.objects;
create policy question_images_upload on storage.objects for insert to authenticated
with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists question_images_update on storage.objects;
create policy question_images_update on storage.objects for update to authenticated
using (bucket_id = 'question-images' and owner_id = auth.uid()::text)
with check (bucket_id = 'question-images' and owner_id = auth.uid()::text);
drop policy if exists question_images_delete on storage.objects;
create policy question_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'question-images' and owner_id = auth.uid()::text);

create or replace function public.save_picture_question(
  p_set uuid, p_question uuid, p_image_url text, p_answer text,
  p_duration integer, p_points integer, p_hint text default '',
  p_explanation text default '', p_alternatives text[] default array[]::text[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.require_user();
  if not private.owns_set(p_set) then raise exception 'Không có quyền sửa bộ câu hỏi.'; end if;
  if p_image_url !~ '^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/question-images/'
     and p_image_url !~ '^images/duoi-hinh-bat-chu/cau-[0-9]{2}\\.jpeg$' then
    raise exception 'Đường dẫn ảnh không hợp lệ.';
  end if;
  if length(btrim(p_answer))=0 or length(p_answer)>500 or p_duration not between 5 and 600 or p_points not between 0 and 10000 then
    raise exception 'Dữ liệu câu hỏi không hợp lệ.';
  end if;
  if p_question is null then
    insert into public.questions(set_id,title,mode,tiles,duration,points,position,ignore_accents,hint,question_type,image_url)
    values(p_set,'Quan sát hình ảnh và đoán từ hoặc cụm từ có nghĩa','words',array[]::text[],p_duration,p_points,(select coalesce(max(position),0)+1 from public.questions where set_id=p_set),true,coalesce(p_hint,''),'duoi_hinh_bat_chu',p_image_url)
    returning id into v_id;
  else
    if not exists(select 1 from public.questions where id=p_question and set_id=p_set) then raise exception 'Không tìm thấy câu hỏi.'; end if;
    update public.questions set title='Quan sát hình ảnh và đoán từ hoặc cụm từ có nghĩa', mode='words', tiles=array[]::text[], duration=p_duration, points=p_points, ignore_accents=true, hint=coalesce(p_hint,''), question_type='duoi_hinh_bat_chu', image_url=p_image_url where id=p_question;
    v_id:=p_question;
  end if;
  insert into private.answers(question_id,answer,alternatives,explanation) values(v_id,normalize(p_answer,NFC),coalesce(p_alternatives,array[]::text[]),coalesce(p_explanation,''))
  on conflict (question_id) do update set answer=excluded.answer, alternatives=excluded.alternatives, explanation=excluded.explanation;
  return v_id;
end $$;
revoke execute on function public.save_picture_question(uuid,uuid,text,text,integer,integer,text,text,text[]) from public, anon;
grant execute on function public.save_picture_question(uuid,uuid,text,text,integer,integer,text,text,text[]) to authenticated;

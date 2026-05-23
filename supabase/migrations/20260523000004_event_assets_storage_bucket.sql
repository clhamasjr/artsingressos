-- ============================================================
-- Bucket público pra imagens dos eventos (banner, programação, croqui).
-- Público porque a Evolution API precisa baixar via HTTP pra enviar.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-assets', 'event-assets', true, 8388608,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event-assets read public" on storage.objects;
create policy "event-assets read public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-assets');

drop policy if exists "event-assets insert admin" on storage.objects;
create policy "event-assets insert admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and private.is_admin());

drop policy if exists "event-assets update admin" on storage.objects;
create policy "event-assets update admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-assets' and private.is_admin())
  with check (bucket_id = 'event-assets' and private.is_admin());

drop policy if exists "event-assets delete admin" on storage.objects;
create policy "event-assets delete admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and private.is_admin());

alter table public.events
  add column if not exists programming_image_url text;

comment on column public.events.programming_image_url is 'URL de imagem (cartaz/flyer) com a programação. Alternativa ao texto programming.';
comment on column public.events.map_url is 'URL de imagem do croqui INTERNO do local (planta com palco, bar, banheiros). NAO eh link externo de localizacao.';

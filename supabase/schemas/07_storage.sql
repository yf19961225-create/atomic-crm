--
-- Storage
-- This file declares storage bucket policies.
--

create policy "Attachments 1mt4rzk_0" on storage.objects for select to authenticated using (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_1" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_3" on storage.objects for delete to authenticated using (bucket_id = 'attachments');

-- Marking images are versioned immutable objects; defaults only remove references.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('romiku-marking-assets','romiku-marking-assets',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy romiku_marking_read on storage.objects for select to authenticated
using (bucket_id='romiku-marking-assets' and auth.uid() is not null);
create policy romiku_marking_insert on storage.objects for insert to authenticated
with check (bucket_id='romiku-marking-assets' and auth.uid() is not null
  and (storage.foldername(name))[1]=auth.uid()::text);
-- No UPDATE / DELETE policy: replacing or removing a reference cannot break history.

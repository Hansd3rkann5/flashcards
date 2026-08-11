-- Supabase Storage setup for the AI-assistant knowledge base.
-- Run once in the Supabase SQL Editor (project: flashcards-22260).
--
-- Knowledge METADATA is stored per user in the existing public.records table
-- (store = 'knowledge'), which is already protected by the records RLS from
-- supabase_multitenant_setup.sql — nothing extra is needed there.
--
-- This script only provisions the Storage bucket that holds the uploaded
-- lecture files and their extracted plain-text, isolated per user by folder:
--   knowledge/<uid>/<subjectId>/<knowledgeId>/original.<ext>
--   knowledge/<uid>/<subjectId>/<knowledgeId>/text.txt

begin;

-- 1) Private bucket (no public reads; access only through signed URLs / RLS).
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false)
on conflict (id) do nothing;

-- 2) Per-user folder isolation: the first path segment must equal auth.uid().
--    Mirrors the records RLS model (owner = auth.uid()).
drop policy if exists knowledge_read_own on storage.objects;
drop policy if exists knowledge_insert_own on storage.objects;
drop policy if exists knowledge_update_own on storage.objects;
drop policy if exists knowledge_delete_own on storage.objects;

create policy knowledge_read_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy knowledge_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy knowledge_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy knowledge_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

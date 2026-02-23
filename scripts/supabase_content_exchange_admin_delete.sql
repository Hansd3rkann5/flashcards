-- Supabase content-exchange admin delete policy for table public.records.
-- Grants one admin user cross-user DELETE rights in exchange workflows.
-- Run once in Supabase SQL Editor.

begin;

drop policy if exists records_delete_admin_exchange on public.records;

create policy records_delete_admin_exchange
  on public.records
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'simon-bader@gmx.net'
  );

commit;

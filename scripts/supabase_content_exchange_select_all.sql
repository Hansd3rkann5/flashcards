-- Supabase content-exchange policy setup for table public.records.
-- Use this when the app should list/import content across authenticated users.
-- Run once in Supabase SQL Editor.
--
-- Result:
-- - SELECT: all authenticated users can read all rows from public.records
-- - INSERT/UPDATE/DELETE: unchanged (still owner-scoped via existing uid policies)

begin;

drop policy if exists records_select_own on public.records;
drop policy if exists records_select_authenticated_all on public.records;

create policy records_select_authenticated_all
  on public.records
  for select
  to authenticated
  using (true);

commit;

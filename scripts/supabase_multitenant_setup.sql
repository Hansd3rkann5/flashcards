-- Supabase multi-tenant setup for flashcards `records` table.
-- Run this once in Supabase SQL Editor (project: flashcards-22260).
-- It links existing rows to one user email and enables per-user isolation via RLS.

begin;

-- 1) Add owner column + FK (if missing).
alter table public.records
  add column if not exists owner_id uuid;

alter table public.records
  alter column owner_id set default auth.uid();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.records'::regclass
      and conname = 'records_owner_id_fkey'
  ) then
    alter table public.records
      add constraint records_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- 2) Assign all existing rows to your account (change email if needed).
update public.records r
set owner_id = u.id
from auth.users u
where u.email = 'simon-bader@gmx.net'
  and r.owner_id is null;

-- 3) Replace old uniqueness (store,record_key) with tenant-safe uniqueness.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.records'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ~* '\(store,\s*record_key\)'
  loop
    execute format('alter table public.records drop constraint %I', c.conname);
  end loop;
end $$;

do $$
declare i record;
begin
  for i in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'records'
      and indexdef ilike 'create unique index%'
      and indexdef ~* '\(store,\s*record_key\)'
  loop
    execute format('drop index if exists public.%I', i.indexname);
  end loop;
end $$;

create unique index if not exists records_owner_store_key_uidx
  on public.records (owner_id, store, record_key);

-- 4) Ensure no unassigned rows remain.
do $$
begin
  if exists (select 1 from public.records where owner_id is null) then
    raise exception 'records.owner_id contains NULL rows. Assign all rows before enabling NOT NULL + RLS.';
  end if;
end $$;

alter table public.records
  alter column owner_id set not null;

-- 5) Enable strict per-user access.
alter table public.records enable row level security;
alter table public.records force row level security;

drop policy if exists records_select_own on public.records;
drop policy if exists records_insert_own on public.records;
drop policy if exists records_update_own on public.records;
drop policy if exists records_delete_own on public.records;

create policy records_select_own
  on public.records
  for select
  using (owner_id = auth.uid());

create policy records_insert_own
  on public.records
  for insert
  with check (owner_id = auth.uid());

create policy records_update_own
  on public.records
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy records_delete_own
  on public.records
  for delete
  using (owner_id = auth.uid());

commit;

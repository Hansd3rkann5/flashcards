-- Supabase multi-tenant setup for flashcards `records` table.
-- Variant for tenant column: uid (text).
-- Run this once in Supabase SQL Editor (project: flashcards-22260).
-- It enforces per-user isolation via RLS and tenant-safe keys.

begin;

-- 1) Add tenant column (if missing).
alter table public.records
  add column if not exists uid text;

alter table public.records
  alter column uid set default auth.uid()::text;

-- 3) Replace old uniqueness (store,record_key) with tenant-safe uniqueness.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.records'::regclass
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) ~* '\(store,\s*record_key\)'
  loop
    execute format('alter table public.records drop constraint %I', c.conname);
  end loop;
end $$;

do $$
declare i record;
begin
  for i in
    select idx.indexname
    from pg_indexes idx
    join pg_class ic
      on ic.relname = idx.indexname
     and ic.relnamespace = 'public'::regnamespace
    join pg_index pi
      on pi.indexrelid = ic.oid
    left join pg_constraint pc
      on pc.conindid = pi.indexrelid
    where idx.schemaname = 'public'
      and idx.tablename = 'records'
      and idx.indexdef ilike 'create unique index%'
      and idx.indexdef ~* '\(store,\s*record_key\)'
      and pc.oid is null
  loop
    execute format('drop index if exists public.%I', i.indexname);
  end loop;
end $$;

-- 4) Ensure no unassigned rows remain.
do $$
begin
  if exists (select 1 from public.records where uid is null or uid = '') then
    raise exception 'records.uid contains NULL/empty rows. Assign all rows before enabling NOT NULL + RLS.';
  end if;
end $$;

alter table public.records
  alter column uid set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.records'::regclass
      and contype = 'p'
  ) then
    alter table public.records
      add constraint records_pkey primary key (uid, store, record_key);
  end if;
end $$;

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
  using (uid = auth.uid()::text);

create policy records_insert_own
  on public.records
  for insert
  with check (uid = auth.uid()::text);

create policy records_update_own
  on public.records
  for update
  using (uid = auth.uid()::text)
  with check (uid = auth.uid()::text);

create policy records_delete_own
  on public.records
  for delete
  using (uid = auth.uid()::text);

commit;

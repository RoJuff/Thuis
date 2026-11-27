-- Thuis: database-opzet voor Supabase
-- Plak dit hele bestand in Supabase → SQL Editor → New query → Run.

create table if not exists public.records (
  id          text primary key,
  kind        text not null,            -- 'shop' | 'event' | 'chore' | 'settings'
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists records_kind_idx on public.records (kind);

-- Alleen ingelogde gebruikers (jij en Isabel) mogen lezen en schrijven.
alter table public.records enable row level security;

drop policy if exists "huishouden leest" on public.records;
drop policy if exists "huishouden schrijft" on public.records;

create policy "huishouden leest" on public.records
  for select to authenticated using (true);

create policy "huishouden schrijft" on public.records
  for all to authenticated using (true) with check (true);

-- Live bijwerken op alle apparaten.
alter table public.records replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;

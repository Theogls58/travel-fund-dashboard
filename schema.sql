-- Run this once in Supabase SQL Editor.

create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('Theo', 'Partner')),
  currency text not null check (currency in ('EUR', 'CAD')),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id integer primary key,
  goal_eur numeric(12,2) not null default 5000,
  partner_name text not null default 'Partner'
);

insert into public.settings (id, goal_eur, partner_name)
values (1, 5000, 'Partner')
on conflict (id) do nothing;

alter table public.contributions enable row level security;
alter table public.settings enable row level security;

-- This is intentionally simple: anyone with the app URL + anon key can read/write.
-- For a private couple-only app, add Supabase Auth later.
create policy "public read contributions"
on public.contributions for select
to anon
using (true);

create policy "public insert contributions"
on public.contributions for insert
to anon
with check (true);

create policy "public read settings"
on public.settings for select
to anon
using (true);

create policy "public update settings"
on public.settings for update
to anon
using (true)
with check (true);

create policy "public insert settings"
on public.settings for insert
to anon
with check (true);

-- Optional: add tables to realtime publication.
alter publication supabase_realtime add table public.contributions;
alter publication supabase_realtime add table public.settings;

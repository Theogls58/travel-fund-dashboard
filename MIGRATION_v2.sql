-- Run this ONCE in Supabase SQL Editor before deploying v2.

alter table public.contributions
drop constraint if exists contributions_amount_check;

alter table public.contributions
add constraint contributions_amount_check check (amount <> 0);

drop policy if exists "public delete contributions"
on public.contributions;

create policy "public delete contributions"
on public.contributions
for delete
to anon
using (true);

grant delete on table public.contributions to anon;

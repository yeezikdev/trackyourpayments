-- =====================================================================
--  Track your payments – tabella per il salvataggio dei dati dell'app
--  Supabase → SQL Editor → New query → incolla → Run (si può rieseguire)
-- =====================================================================
create table if not exists public.app_state (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb  not null,                 -- rate, subscription, pagamenti, stipendi, impostazioni
  updated_ms  bigint not null default 0,       -- ora dell'ultima modifica (serve a sincronizzare i dispositivi)
  updated_at  timestamptz not null default now()
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.app_state to authenticated;
revoke all on public.app_state from anon;

alter table public.app_state enable row level security;
drop policy if exists "solo i miei dati" on public.app_state;
create policy "solo i miei dati" on public.app_state
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
--  Track your payments – schema database Supabase
--  Incolla tutto in Supabase → SQL Editor → New query → Run
--  (si può rieseguire senza problemi)
-- =====================================================================

-- ---------- RATE (pagamenti rateizzati) ----------
create table if not exists public.rate (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome             text not null,
  importo_rata     numeric(12,2) not null check (importo_rata > 0),
  num_rate         int  not null check (num_rate > 0),
  data_prima_rata  date not null,
  rate_gia_pagate  int  not null default 0 check (rate_gia_pagate >= 0),
  note             text,
  created_at       timestamptz not null default now()
);

-- ---------- ABBONAMENTI (rinnovo mensile) ----------
create table if not exists public.abbonamenti (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome            text not null,
  importo         numeric(12,2) not null check (importo > 0),
  giorno_rinnovo  int  not null check (giorno_rinnovo between 1 and 31),
  data_inizio     date not null default current_date,
  data_fine       date,                       -- valorizzata quando disdici
  categoria       text not null default 'Abbonamenti',
  created_at      timestamptz not null default now()
);

-- ---------- MOVIMENTI (entrate e uscite) ----------
create table if not exists public.movimenti (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo            text not null check (tipo in ('entrata','uscita')),
  importo         numeric(12,2) not null check (importo > 0),
  categoria       text not null default 'Altro',
  descrizione     text,
  data            date not null default current_date,
  -- collegamenti opzionali: un'uscita può essere il pagamento di una rata o di un abbonamento
  rata_id         uuid references public.rate(id) on delete set null,
  abbonamento_id  uuid references public.abbonamenti(id) on delete set null,
  scadenza        date,                       -- quale scadenza è stata pagata
  created_at      timestamptz not null default now()
);

create index if not exists movimenti_user_data on public.movimenti (user_id, data);
-- impedisce di pagare due volte la stessa scadenza
create unique index if not exists movimenti_rata_scadenza
  on public.movimenti (rata_id, scadenza) where rata_id is not null;
create unique index if not exists movimenti_abb_scadenza
  on public.movimenti (abbonamento_id, scadenza) where abbonamento_id is not null;

-- ---------- SICUREZZA: ognuno vede solo i propri dati ----------
-- permessi espliciti per gli utenti loggati (servono se "Automatically expose new tables" è disattivato)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.rate, public.abbonamenti, public.movimenti to authenticated;
revoke all on public.rate, public.abbonamenti, public.movimenti from anon;

alter table public.rate        enable row level security;
alter table public.abbonamenti enable row level security;
alter table public.movimenti   enable row level security;

drop policy if exists "solo i miei dati" on public.rate;
drop policy if exists "solo i miei dati" on public.abbonamenti;
drop policy if exists "solo i miei dati" on public.movimenti;

create policy "solo i miei dati" on public.rate
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo i miei dati" on public.abbonamenti
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo i miei dati" on public.movimenti
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

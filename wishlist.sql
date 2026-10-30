-- =====================================================================
--  Track your payments – Wishlist (già applicato su Supabase, ottobre 2026)
--  Tabelle dei prodotti desiderati e dello storico prezzi.
-- =====================================================================
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  url text,
  image_url text,
  store text,
  category text,
  priority smallint not null default 2 check (priority between 1 and 3),
  price numeric(10,2),
  sale_price numeric(10,2),
  discount numeric(10,2) generated always as (case when price is not null and sale_price is not null then price - sale_price end) stored,
  discount_pct numeric(6,2) generated always as (case when price > 0 and sale_price is not null then round((price - sale_price) / price * 100, 2) end) stored,
  purchased boolean not null default false,
  rata_id text,                                   -- id della rata in app_state, se comprato a rate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wishlist_price_history (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.wishlist_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  price numeric(10,2),
  sale_price numeric(10,2),
  recorded_at timestamptz not null default now()
);

-- permessi: solo utenti loggati, ognuno vede solo i propri prodotti (RLS)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.wishlist_items to authenticated;
grant select, insert, delete on public.wishlist_price_history to authenticated;
grant usage, select on sequence public.wishlist_price_history_id_seq to authenticated;
revoke all on public.wishlist_items from anon;
revoke all on public.wishlist_price_history from anon;

alter table public.wishlist_items enable row level security;
alter table public.wishlist_price_history enable row level security;
-- policy "*_own": auth.uid() = user_id per select/insert/update/delete

-- trigger: ogni cambio di prezzo (o nuovo prodotto) viene registrato nello storico
--   wishlist_items_touch      BEFORE UPDATE  -> aggiorna updated_at
--   wishlist_items_price_log  AFTER INSERT OR UPDATE -> inserisce in wishlist_price_history

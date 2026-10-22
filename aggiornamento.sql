-- =====================================================================
--  Track your payments – aggiornamento (ottobre 2026)
--  Supabase → SQL Editor → New query → incolla tutto → Run
--  Si può rieseguire senza problemi.
-- =====================================================================

-- 1) Sincronizzazione in tempo reale: Supabase avvisa l'app appena
--    un altro dispositivo salva i dati.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

-- 2) Pulizia: elimina le tabelle della prima versione dell'app,
--    che non vengono più usate. ATTENZIONE: l'eliminazione è definitiva.
--    I dati dell'app attuale stanno in app_state e NON vengono toccati.
drop table if exists public.movimenti   cascade;
drop table if exists public.rate        cascade;
drop table if exists public.abbonamenti cascade;

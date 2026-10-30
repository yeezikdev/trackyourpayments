# Wishlist Black Friday

Lista dei desideri per il Black Friday: foto presa dal link, prezzo pieno, prezzo scontato, sconto in € e in %, variazione e storico dei prezzi.

- **Frontend:** `index.html` (una sola pagina, GitHub Pages)
- **Database:** Supabase, progetto `trackyourpayments` (tabelle `wishlist_items` e `wishlist_price_history`) — già creato
- **Lettura link:** Edge Function `wishlist-scrape` — già pubblicata

## Pubblicare su GitHub Pages

1. La pagina sta nella cartella `wishlist/` del repo `yeezikdev/trackyourpayments`.
2. Carica `index.html` (e questo README) nella radice del repo.
3. Repo → **Settings → Pages** → Source: *Deploy from a branch* → branch `main`, cartella `/ (root)` → Save.
4. Dopo un minuto la trovi su `https://yeezikdev.github.io/trackyourpayments/wishlist/`.

## Login

Usa lo stesso account di Track your payments (stesso progetto Supabase). Ognuno vede solo i propri prodotti.

Se crei un account nuovo, l'email di conferma deve riportarti alla wishlist:
Supabase → **Authentication → URL Configuration → Redirect URLs** → aggiungi `https://yeezikdev.github.io/trackyourpayments/wishlist/`.

## Come funziona

- **Leggi dal link:** la funzione apre la pagina del negozio e cerca foto, nome, descrizione e prezzo (tag Open Graph, dati prodotto JSON-LD, casi speciali per Amazon). Alcuni siti bloccano le letture automatiche: in quel caso compili a mano o incolli tu l'URL della foto.
- **Sconto:** scrivi prezzo pieno + prezzo scontato *oppure* la percentuale; sconto in € e % vengono calcolati (anche nel database).
- **Variazione:** ogni volta che cambi un prezzo viene salvato nello storico. La card mostra di quanto è salito/sceso rispetto al prezzo precedente, con un mini-grafico; il pulsante 📈 apre lo storico completo.
- **↻ Ricontrolla prezzi:** rilegge il prezzo dal sito per uno o tutti i prodotti. Se è sotto al prezzo pieno diventa il prezzo scontato.

## File Supabase (già applicati, qui come copia)

- `supabase/functions/wishlist-scrape/index.ts` — la funzione che legge i link

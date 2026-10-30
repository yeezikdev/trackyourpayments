# 💸 Track your payments

App web personale per tenere traccia di **entrate e uscite mese per mese**, **pagamenti rateizzati** e **abbonamenti** (Netflix, Spotify…), con calendario delle scadenze e grafici.

Frontend statico (un solo `index.html`) ospitato su **GitHub Pages**, dati salvati su **Supabase**.

## Cosa fa

Dashboard con quanto c'è da pagare nel mese, prossima scadenza, rate e subscription attive; avvisi per pagamenti scaduti o in arrivo; calendario; elenco pagamenti con filtri; sezione "In arrivo"; entrate e uscite mese per mese; analisi; impostazioni con categorie, metodi di pagamento, backup ed esportazione.

I dati vengono salvati nel tuo account Supabase (tabella `app_state`) e restano sincronizzati tra telefono e computer. Se la connessione manca, l'app continua a funzionare con i dati del dispositivo e li carica appena torna online.

## Setup (10 minuti)

### 1. Supabase
1. Crea un progetto gratuito su [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, incolla il contenuto di `schema.sql` e premi **Run** (crea la tabella `app_state`).
3. **Project Settings → API**: copia **Project URL** e la chiave **anon** (o *publishable*).
4. **Authentication → URL Configuration**: in *Site URL* metti l'indirizzo della tua app, es. `https://yeezikdev.github.io/trackyourpayments/`.
   - Se non vuoi l'email di conferma: **Authentication → Sign In / Providers → Email** e disattiva *Confirm email*.

### 2. Chiavi nell'app
Apri `index.html` e compila in cima allo script:
```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'la-tua-anon-key';
```
(Se le lasci vuote, l'app te le chiede al primo avvio e le salva nel browser.)

La chiave anon è fatta per stare nel codice pubblico: i dati sono protetti dalle policy RLS, ognuno vede solo i propri.

### 3. GitHub Pages
1. Crea un repo, es. `trackyourpayments`, e carica `index.html` (e se vuoi `schema.sql` e questo README).
2. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/trackyourpayments/`.

### 4. Primo accesso
1. Apri l'app → **Crea account** con la tua email.
2. **Importante:** dopo esserti registrato, su Supabase vai in **Authentication → Sign In / Providers** e disattiva **Allow new users to sign up**, così nessun altro può crearsi un account sul tuo progetto.

Su iPhone: Safari → Condividi → *Aggiungi alla schermata Home* per usarla come un'app.

## Note
- Le rate cadono lo stesso giorno di ogni mese della prima rata (es. 31 → 28/29 febbraio, 30 aprile…).
- “Rate già pagate” serve per le rateizzazioni iniziate prima di usare l'app.
- Il pagamento di una scadenza viene contato nel mese della **data di pagamento** che inserisci.

## Wishlist

Nel menu c'è la sezione **Wishlist** per i prodotti da prendere (pensata per il Black Friday).

- Incolli il link del prodotto e premi «Leggi dal link»: foto, nome, descrizione e prezzo vengono letti dalla pagina del negozio dalla funzione Supabase `wishlist-scrape` (codice in `supabase/functions/wishlist-scrape/`).
- Prezzo pieno, prezzo scontato, sconto in € e in %: scrivi il prezzo scontato oppure la percentuale e l'altro si calcola.
- Ogni cambio di prezzo finisce nello storico (tabella `wishlist_price_history`): la scheda mostra la variazione e un mini-grafico.
- «Ricontrolla prezzi» rilegge i prezzi dai siti.
- **Comprato → L'ho preso a rate** apre una nuova rata già compilata con nome, prezzo e PayPal/Amazon; quando la salvi il prodotto viene segnato come comprato e collegato alla rata («Vedi la rata»).

I prodotti stanno nelle tabelle `wishlist_items` e `wishlist_price_history`, separate da `app_state`, nello stesso progetto Supabase.

# 💸 Track your payments

App web personale per tenere traccia di **entrate e uscite mese per mese**, **pagamenti rateizzati** e **abbonamenti** (Netflix, Spotify…), con calendario delle scadenze e grafici.

Frontend statico (un solo `index.html`) ospitato su **GitHub Pages**, dati salvati su **Supabase**.

## Cosa fa

- **Panoramica** – entrate, uscite, differenza e % di uscite sulle entrate del mese; scadenze ancora da pagare e saldo previsto a fine mese; grafici degli ultimi 12 mesi (entrate/uscite/differenza, andamento della %), uscite per categoria, prossime scadenze.
- **Movimenti** – aggiungi, modifica ed elimina entrate e uscite con categoria e descrizione.
- **Rate** – ogni rateizzazione con importo, numero rate, rate pagate, residuo, prossima e ultima scadenza.
- **Abbonamenti** – rinnovo mensile, costo mensile e annuale, disdici/riattiva.
- **Calendario** – tutte le scadenze del mese. Tocca una scadenza → “Segna come pagata” e l'app registra in automatico l'uscita nei movimenti.

## Setup (10 minuti)

### 1. Supabase
1. Crea un progetto gratuito su [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, incolla il contenuto di `schema.sql` e premi **Run**.
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

# Project Rules

# MESAPPA Plugin On-Prem — Development Rules

## Stack fisso

- **Frontend:** Angular 16 con `@angular-architects/module-federation` compatibile NG16
- **Backend:** Node.js + Express + TypeScript, compilato con `tsc` in `dist/`
- **Database:** SQL Server on-prem — preferenza Windows Authentication (`mssql` + `msnodesqlv8`). Fallback: SQL Auth con utente a privilegi minimi, password solo in `.env` o segreti Windows
- **Autenticazione API:** JWT dell'host MESAPPA (token passato dal frontend via `InputData`)
- **LLM / AI esterna:** nessuna integrazione obbligatoria

## Struttura repository

```
frontend/projects/<nome-plugin>/   → Componenti, servizi, modelli; public-api.ts minimale
frontend/src/app/                  → App shell solo per sviluppo locale
backend/src/server.ts              → Entry point Express
backend/src/routes/                → Solo routing e validazione input, delegano ai servizi
backend/src/services/              → Accesso SQL e logica di dominio
backend/src/middleware/authJwt.ts  → Verifica JWT host
backend/src/config/env.ts          → Lettura variabili da process.env
scripts/                           → start-local.ps1, deploy.ps1
docs/                              → URL MESAPPA cliente, variabili .env, flussi funzionali
```

## Vincoli obbligatori (verificare PRIMA di considerare completa ogni risposta)

| ID | Vincolo |
|----|---------|
| V1 | Nessun segreto (password, connection string completa, chiave JWT, token) in file tracciati da git |
| V2 | Ogni endpoint (tranne `/api/health` se concordato) richiede JWT valido nell'header `Authorization: Bearer` |
| V3 | Ogni input utente validato prima dell'uso; query SQL sempre parametrizzate (prepared statements). Mai concatenare stringhe utente in SQL |
| V4 | Risposte di errore al client senza stack trace e senza messaggi interni. `error.message` solo nei log server |
| V5 | Nessun file di logica oltre ~400 righe senza proporre uno split |
| V6 | Logica di business in `src/services/`; le `routes` solo orchestrano e validano input |
| V7 | Build produzione: `ng build --configuration production` per frontend, `tsc` o script `build` per backend |
| V8 | `.env` in `.gitignore`; solo `.env.example` committato con valori fittizi |
| V9 | Angular 16 e `@angular-architects/module-federation` compatibile con NG16. Non usare versioni diverse |
| V10 | CORS con whitelist esplicita delle origini. Mai `Access-Control-Allow-Origin: *` con credenziali |
| V11 | Prima di creare un nuovo file, verificare se esiste già un modulo con responsabilità simile |

## Sicurezza

- **Segreti:** `.env.example` (committato, valori fittizi) → `.env` (gitignore, valori reali dev) → In produzione: variabili d'ambiente del processo/servizio Windows o file fuori dal repo con permessi ristretti
- **JWT:** il backend valida firma e scadenza usando chiave pubblica/secret da `process.env` (variabili: `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PUBLIC_KEY` o `JWT_SECRET`). Rifiutare richieste senza token. Non loggare mai il token intero. Librerie: `jsonwebtoken` o `jose`
- **SQL Server:** con Windows Auth il processo Node gira sotto account di servizio autorizzato. Con SQL Auth: utente a privilegi minimi, password rotabile
- **CORS:** elenco esplicito origini (URL MESAPPA cliente + `http://localhost:4200` in dev)
- **HTTPS:** in produzione tramite IIS reverse proxy o TLS diretto se Node è esposto
- **Firewall:** aprire solo le porte necessarie. "Siamo in intranet" non basta
- **`.gitignore` minimo:** `.env`, `node_modules/`, `dist/`, `build/`, log locali

## Frontend — regole

- `public-api.ts`: solo modulo, componente root, tipi `Configuration` / `InputData`. Niente mock
- Module Federation: `shared` con `singleton` e `strictVersion` coerenti con l'host MESAPPA
- Componenti e servizi piccoli e focalizzati (~250-400 righe max per file di logica)
- TypeScript strict dove possibile

## Backend — regole

- `server.ts`: avvio app, middleware globali (CORS con whitelist da `process.env.CORS_ORIGINS`, JSON parser con limit, gestione errori centralizzata)
- Routes: solo routing e validazione input, chiamano i servizi
- Services: accesso SQL e logica di dominio
- Validazione: ogni body/query/param usato in query SQL deve essere controllato (tipo, lunghezza, whitelist)
- Pool SQL (`mssql`): connessione con `trustedConnection: true` per Windows Auth, server e database da variabili d'ambiente. Gestire errori di connessione senza esporre dettagli al client

## Deploy e infrastruttura

- Ambienti distinti (sviluppo / collaudo cliente / produzione) con `.env` separati, mai mischiati
- Deploy in produzione solo con processo scritto e ripetibile: script versionato + elenco passi + chi esegue + data
- Frontend servito da IIS (file statici del build Angular) o infrastruttura esistente MESAPPA
- Backend Node: standalone su porta dedicata o dietro IIS come reverse proxy. Documentare la scelta in `docs/`
- Backend in produzione come servizio (pm2, NSSM, Windows Service) con riavvio automatico
- Smoke test post-deploy: `GET /api/health` (verifica raggiungibilità DB con `SELECT 1`) + schermata plugin in MESAPPA
- Build frontend mai in modalità development per consegna cliente
- Script senza path assoluti (`C:\Users\...`): usare `$PSScriptRoot` o variabili
- Negli script ufficiali di build: `npm ci` con `package-lock.json` versionato

## Anti-pattern da bloccare

- File monolitici da migliaia di righe
- Mock esportati in `public-api.ts`
- Segreti nel codice o in file versionati
- Build Angular development per consegna cliente
- Porte aperte verso Internet senza necessità
- `CORS: *` con credenziali
- Path assoluti hardcoded negli script
- Stack trace o messaggi SQL nelle risposte HTTP al client
- Concatenazione di stringhe utente in query SQL

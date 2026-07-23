# Listy

Lista della spesa condivisa in famiglia. PWA React + Vite, backend su Netlify Functions, database Postgres su Neon, realtime via Ably, offline-first con Dexie/IndexedDB.

## Sviluppo

```bash
npm install
cp .env.example .env   # compila DATABASE_URL, SESSION_SECRET, ABLY_API_KEY
npx netlify dev
```

`netlify dev` serve sia il frontend Vite sia le Netlify Functions su `http://localhost:8888`, con `/api/*` instradato verso `netlify/functions/`.

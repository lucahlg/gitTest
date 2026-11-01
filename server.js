import path from 'node:path';
import { createApp } from './src/app.js';
import { seed } from './src/seed.js';

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'db.json');

const { server, store, movies } = createApp({
  dbFile: DB_FILE,
  omdbKey: process.env.OMDB_API_KEY || null,
  secureCookies: process.env.SECURE_COOKIES === '1',
});

if (store.isEmpty() && process.env.NO_SEED !== '1') {
  seed(store);
  store.flush();
  console.log('Demo-Daten angelegt (Login z. B. lena@demo.kinobuddy.de / kino1234)');
}

server.listen(PORT, () => {
  console.log(`🍿 KinoBuddy läuft auf http://localhost:${PORT}`);
  console.log(movies.hasImdb ? 'IMDb-Anbindung (OMDb) aktiv.' : 'Lokaler Filmkatalog aktiv (für IMDb-Suche OMDB_API_KEY setzen).');
});

function shutdown() {
  store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

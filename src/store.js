// Einfacher, dateibasierter JSON-Speicher. Für ein MVP völlig ausreichend,
// später leicht durch eine echte Datenbank (z. B. Postgres) ersetzbar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const COLLECTIONS = [
  'users', 'sessions', 'watchlist', 'movies', 'connections',
  'messages', 'events', 'blocks', 'reports', 'reads',
];

function empty() {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
}

export function createStore(file) {
  const data = empty();
  if (file && fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of COLLECTIONS) if (Array.isArray(loaded[c])) data[c] = loaded[c];
  }

  let timer = null;

  function flush() {
    if (!file) return;
    clearTimeout(timer);
    timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  function save() {
    if (!file) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 100);
  }

  return {
    data,
    save,
    flush,
    id: () => crypto.randomUUID(),
    isEmpty: () => data.users.length === 0,
  };
}

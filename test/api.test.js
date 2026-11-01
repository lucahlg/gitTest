import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { scoreMatch } from '../src/matching.js';

let server;
let base;

before(async () => {
  ({ server } = createApp({ dbFile: null, omdbKey: null, rateLimit: 10000 }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

function client() {
  let cookie = '';
  return async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  };
}

let n = 0;
async function newUser(props = {}) {
  const c = client();
  n += 1;
  const r = await c('POST', '/api/auth/register', { email: `user${n}@test.de`, password: 'geheim123', name: props.name || `User${n}`, city: props.city || 'Berlin' });
  assert.equal(r.status, 201, r.error);
  return { c, user: r.user };
}

test('Registrierung validiert Eingaben', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { email: 'kaputt', password: 'geheim123', name: 'Anna', city: 'Berlin' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'a@b.de', password: 'kurz', name: 'Anna', city: 'Berlin' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'a@b.de', password: 'geheim123', name: '', city: 'Berlin' })).status, 400);
  const ok = await c('POST', '/api/auth/register', { email: 'A@B.de', password: 'geheim123', name: 'Anna', city: 'Berlin' });
  assert.equal(ok.status, 201);
  assert.equal(ok.user.email, 'a@b.de');
  assert.equal(ok.user.passwordHash, undefined);
  assert.equal((await client()('POST', '/api/auth/register', { email: 'a@b.de', password: 'geheim123', name: 'Anna', city: 'Berlin' })).status, 409);
});

test('Login, Session und Logout', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { email: 'login@test.de', password: 'geheim123', name: 'Lou', city: 'Köln' });
  await c('POST', '/api/auth/logout');
  assert.equal((await c('GET', '/api/me')).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { email: 'login@test.de', password: 'falsch!!' })).status, 401);
  const r = await c('POST', '/api/auth/login', { email: 'LOGIN@test.de', password: 'geheim123' });
  assert.equal(r.status, 200);
  assert.equal((await c('GET', '/api/me')).user.name, 'Lou');
});

test('geschützte Routen brauchen Anmeldung', async () => {
  const c = client();
  for (const path of ['/api/me', '/api/movies', '/api/matches', '/api/events', '/api/connections']) {
    assert.equal((await c('GET', path)).status, 401, path);
  }
  assert.equal((await c('GET', '/api/meta')).status, 200);
});

test('Cross-Origin-Schreibzugriffe werden abgelehnt', async () => {
  const { c } = await newUser();
  const r = await c('PUT', '/api/me', { bio: 'hack' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('Profil bearbeiten filtert ungültige Werte', async () => {
  const { c } = await newUser();
  const r = await c('PUT', '/api/me', { bio: 'Ich liebe Kino', genres: ['Drama', 'Quatsch', 'Drama'], favorites: ['tt0816692', 'gibtsnicht'], intent: 'open', age: 30 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.user.genres, ['Drama']);
  assert.deepEqual(r.user.favorites, ['tt0816692']);
  assert.equal(r.user.intent, 'open');
  assert.equal((await c('PUT', '/api/me', { intent: 'egal' })).status, 400);
  assert.equal((await c('PUT', '/api/me', { age: 12 })).status, 400);
});

test('Filme: Suche, Merkliste, eigene Filme', async () => {
  const { c } = await newUser();
  const all = await c('GET', '/api/movies');
  assert.ok(all.movies.length > 20);
  const search = await c('GET', '/api/movies?q=dune');
  assert.ok(search.movies.some((m) => m.id === 'tt15239678'));
  assert.equal((await c('POST', '/api/watchlist/tt15239678')).movie.inMyList, true);
  assert.equal((await c('POST', '/api/watchlist/tt15239678')).status, 200); // idempotent
  const detail = await c('GET', '/api/movies/tt15239678');
  assert.equal(detail.movie.inMyList, true);
  assert.equal(detail.movie.imdbUrl, 'https://www.imdb.com/title/tt15239678/');
  assert.equal((await c('GET', '/api/watchlist')).movies.length, 1);
  await c('DELETE', '/api/watchlist/tt15239678');
  assert.equal((await c('GET', '/api/watchlist')).movies.length, 0);
  assert.equal((await c('POST', '/api/watchlist/unbekannt')).status, 404);

  const custom = await c('POST', '/api/movies', { title: 'Neuer Kinostart', year: 2026, genres: ['Drama'] });
  assert.equal(custom.status, 200);
  assert.match(custom.movie.id, /^custom-/);
  const again = await c('POST', '/api/movies', { title: 'neuer kinostart', year: 2026 });
  assert.equal(again.movie.id, custom.movie.id); // keine Duplikate
});

test('Matching bevorzugt gemeinsame Wunschfilme und Stadt', async () => {
  const a = await newUser({ city: 'Leipzig' });
  const b = await newUser({ city: 'Leipzig' });
  const c = await newUser({ city: 'Leipzig' });
  await a.c('PUT', '/api/me', { genres: ['Sci-Fi', 'Drama'] });
  await b.c('PUT', '/api/me', { genres: ['Sci-Fi', 'Drama'] });
  await c.c('PUT', '/api/me', { genres: ['Horror'] });
  await a.c('POST', '/api/watchlist/tt0816692');
  await b.c('POST', '/api/watchlist/tt0816692');

  const { matches } = await a.c('GET', '/api/matches');
  assert.equal(matches.length, 2);
  assert.equal(matches[0].user.id, b.user.id);
  assert.ok(matches[0].match.score > matches[1].match.score);
  assert.deepEqual(matches[0].match.sharedWatch.map((m) => m.title), ['Interstellar']);
  assert.equal(matches[0].user.email, undefined, 'E-Mail darf nicht öffentlich sein');

  const other = await a.c('GET', '/api/matches?city=Nirgendwo');
  assert.equal(other.matches.length, 0);

  const film = await a.c('GET', '/api/movies/tt0816692');
  assert.equal(film.people.length, 1);
  assert.equal(film.people[0].id, b.user.id);
});

test('scoreMatch liefert 0–100', () => {
  const sets = { a: new Set(['x', 'y', 'z']), b: new Set(['x', 'y', 'z']) };
  const r = scoreMatch(
    { id: 'a', city: 'Berlin', genres: ['Drama'], favorites: ['f1', 'f2'] },
    { id: 'b', city: 'berlin ', genres: ['Drama'], favorites: ['f1', 'f2'] },
    (id) => sets[id],
  );
  assert.equal(r.score, 100);
  const zero = scoreMatch({ id: 'a' }, { id: 'c' }, (id) => sets[id] || new Set());
  assert.equal(zero.score, 0);
});

test('Kontakte: Anfrage, Annehmen, Nachrichten', async () => {
  const a = await newUser();
  const b = await newUser();
  assert.equal((await a.c('POST', `/api/messages/${b.user.id}`, { text: 'Hi' })).status, 403, 'ohne Verbindung keine Nachrichten');

  const req = await a.c('POST', '/api/connections', { userId: b.user.id });
  assert.equal(req.connection.status, 'outgoing');
  const inc = await b.c('GET', '/api/connections');
  assert.equal(inc.incoming.length, 1);
  assert.equal((await b.c('GET', '/api/notifications')).incomingRequests, 1);
  assert.equal((await a.c('POST', `/api/connections/${inc.incoming[0].id}/accept`)).status, 404, 'nur Empfänger:in darf annehmen');
  assert.equal((await b.c('POST', `/api/connections/${inc.incoming[0].id}/accept`)).status, 200);

  assert.equal((await a.c('POST', `/api/messages/${b.user.id}`, { text: 'Lust auf Dune?' })).status, 200);
  assert.equal((await b.c('GET', '/api/notifications')).unreadMessages, 1);
  const thread = await b.c('GET', `/api/messages/${a.user.id}`);
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].text, 'Lust auf Dune?');
  assert.equal((await b.c('GET', '/api/notifications')).unreadMessages, 0);
  assert.equal((await a.c('POST', `/api/messages/${b.user.id}`, { text: '   ' })).status, 400);
});

test('Gegenseitige Anfrage verbindet automatisch', async () => {
  const a = await newUser();
  const b = await newUser();
  await a.c('POST', '/api/connections', { userId: b.user.id });
  const r = await b.c('POST', '/api/connections', { userId: a.user.id });
  assert.equal(r.connection.status, 'connected');
});

test('Kinotreffen: erstellen, beitreten, voll, Gruppenchat, absagen', async () => {
  const host = await newUser({ city: 'Dresden' });
  const g1 = await newUser({ city: 'Dresden' });
  const g2 = await newUser({ city: 'Dresden' });
  const startsAt = new Date(Date.now() + 2 * 86400000).toISOString();

  assert.equal((await host.c('POST', '/api/events', { movieId: 'tt0816692', cinema: 'Schauburg', maxPeople: 2, startsAt: '2001-01-01T20:00:00Z' })).status, 400);
  assert.equal((await host.c('POST', '/api/events', { movieId: 'nix', cinema: 'Schauburg', maxPeople: 2, startsAt })).status, 400);

  const created = await host.c('POST', '/api/events', { movieId: 'tt0816692', cinema: 'Schauburg', maxPeople: 2, startsAt, note: 'OV!' });
  assert.equal(created.status, 200, created.error);
  const id = created.event.id;
  assert.equal(created.event.city, 'Dresden');
  assert.equal(created.event.isHost, true);

  const list = await g1.c('GET', '/api/events');
  assert.ok(list.events.some((e) => e.id === id));

  assert.equal((await g1.c('GET', `/api/events/${id}/messages`)).status, 403);
  assert.equal((await g1.c('POST', `/api/events/${id}/join`)).event.joined, true);
  assert.equal((await g2.c('POST', `/api/events/${id}/join`)).status, 409, 'voll');

  await g1.c('POST', `/api/events/${id}/messages`, { text: 'Treffen wir uns vorher?' });
  const chat = await host.c('GET', `/api/events/${id}/messages`);
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].fromName, g1.user.name);

  assert.equal((await host.c('POST', `/api/events/${id}/leave`)).status, 400, 'Host kann nicht austreten');
  assert.equal((await g1.c('DELETE', `/api/events/${id}`)).status, 403);
  await g1.c('POST', `/api/events/${id}/leave`);
  assert.equal((await g2.c('POST', `/api/events/${id}/join`)).status, 200, 'Platz wieder frei');
  assert.equal((await host.c('DELETE', `/api/events/${id}`)).status, 200);
  assert.equal((await g2.c('GET', `/api/events/${id}`)).status, 404);
});

test('Blockieren versteckt Profile in beide Richtungen', async () => {
  const a = await newUser({ city: 'Bonn' });
  const b = await newUser({ city: 'Bonn' });
  await a.c('POST', '/api/connections', { userId: b.user.id });
  assert.equal((await a.c('POST', '/api/blocks', { userId: b.user.id })).status, 200);
  assert.equal((await b.c('GET', `/api/users/${a.user.id}`)).status, 404);
  assert.equal((await a.c('GET', `/api/users/${b.user.id}`)).status, 404);
  assert.ok(!(await b.c('GET', '/api/matches')).matches.some((m) => m.user.id === a.user.id));
  assert.equal((await b.c('GET', '/api/connections')).incoming.length, 0);
  assert.equal((await b.c('POST', '/api/connections', { userId: a.user.id })).status, 404);
  assert.equal((await b.c('POST', '/api/reports', { userId: a.user.id, reason: 'Spam' })).status, 200);
});

test('Rate-Limit bremst Passwort-Raten', async () => {
  const { server: s2 } = createApp({ rateLimit: 3 });
  await new Promise((r) => s2.listen(0, r));
  const url = `http://127.0.0.1:${s2.address().port}/api/auth/login`;
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@y.de', password: 'falsch123' }) });
    codes.push(r.status);
  }
  await new Promise((r) => s2.close(r));
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});

test('Demo-Daten lassen sich laden', async () => {
  const { store } = createApp({ dbFile: null });
  const users = seed(store);
  assert.equal(users.length, 10);
  assert.ok(store.data.events.every((e) => new Date(e.startsAt) > new Date()));
});

test('Frontend wird ausgeliefert, Path-Traversal nicht', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /KinoBuddy/);
  assert.equal((await fetch(`${base}/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  const evil = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok(!(await evil.text()).includes('"scripts"'));
});

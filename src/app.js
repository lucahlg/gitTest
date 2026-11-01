import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { hashPassword, verifyPassword, newToken, parseCookies, createRateLimiter } from './auth.js';
import { createMovieService, GENRES } from './movies.js';
import { scoreMatch, normCity } from './matching.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SESSION_DAYS = 30;
const MAX_BODY = 64 * 1024;
const AVATAR_COLORS = ['#e94560', '#f5a623', '#2ec4b6', '#7b61ff', '#ff6b9d', '#3a86ff', '#06d6a0', '#ff8c42'];
const INTENTS = ['friends', 'open'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => { throw new HttpError(status, message); };

// ---------- Validierung ----------
function str(v, field, { min = 0, max = 200, required = false } = {}) {
  if (v == null || v === '') {
    if (required || min > 0) fail(400, `${field} fehlt.`);
    return '';
  }
  if (typeof v !== 'string') fail(400, `${field} ist ungültig.`);
  const s = v.trim();
  if (s.length < min) fail(400, `${field} muss mindestens ${min} Zeichen haben.`);
  if (s.length > max) fail(400, `${field} darf höchstens ${max} Zeichen haben.`);
  return s;
}

function int(v, field, { min, max, optional = false } = {}) {
  if ((v == null || v === '') && optional) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${field} muss zwischen ${min} und ${max} liegen.`);
  return n;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

export function createApp({ dbFile = null, omdbKey = process.env.OMDB_API_KEY || null, secureCookies = false, rateLimit = 20 } = {}) {
  const store = createStore(dbFile);
  const { data } = store;
  const movies = createMovieService(store, { omdbKey });
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: rateLimit });

  // ---------- Hilfsfunktionen auf den Daten ----------
  const userById = (id) => data.users.find((u) => u.id === id);

  const isBlocked = (a, b) =>
    data.blocks.some((x) => (x.userId === a && x.blockedId === b) || (x.userId === b && x.blockedId === a));

  const watchSetOf = (userId) =>
    new Set(data.watchlist.filter((w) => w.userId === userId).map((w) => w.movieId));

  const wantCount = (movieId) => data.watchlist.filter((w) => w.movieId === movieId).length;

  function connectionBetween(a, b) {
    return data.connections.find((c) => (c.fromId === a && c.toId === b) || (c.fromId === b && c.toId === a));
  }

  const isConnected = (a, b) => connectionBetween(a, b)?.status === 'accepted';

  function publicUser(u) {
    return {
      id: u.id,
      name: u.name,
      city: u.city,
      age: u.age ?? null,
      bio: u.bio || '',
      genres: u.genres || [],
      favorites: u.favorites || [],
      intent: u.intent || 'friends',
      cinemas: u.cinemas || '',
      avatarColor: u.avatarColor,
      createdAt: u.createdAt,
    };
  }

  const privateUser = (u) => ({ ...publicUser(u), email: u.email });

  function movieOut(mv, me) {
    return {
      ...mv,
      wantCount: wantCount(mv.id),
      inMyList: me ? data.watchlist.some((w) => w.userId === me.id && w.movieId === mv.id) : false,
      imdbUrl: /^tt\d+$/.test(mv.id) ? `https://www.imdb.com/title/${mv.id}/` : null,
    };
  }

  const titled = (ids) => ids.map(movies.getMovie).filter(Boolean).map((mv) => ({ id: mv.id, title: mv.title }));
  function matchOut(me, other) {
    const mt = scoreMatch(me, other, watchSetOf);
    return { ...mt, sharedWatch: titled(mt.sharedWatch), sharedFavorites: titled(mt.sharedFavorites) };
  }

  const isUpcoming = (ev) => new Date(ev.startsAt).getTime() > Date.now() - 3 * 60 * 60 * 1000;

  function eventOut(ev, me) {
    const host = userById(ev.hostId);
    const mv = movies.getMovie(ev.movieId);
    return {
      ...ev,
      movie: mv ? { id: mv.id, title: mv.title, year: mv.year, poster: mv.poster, genres: mv.genres } : null,
      host: host ? { id: host.id, name: host.name, avatarColor: host.avatarColor } : null,
      attendees: ev.attendees.map(userById).filter(Boolean).map((u) => ({ id: u.id, name: u.name, avatarColor: u.avatarColor })),
      isHost: me ? ev.hostId === me.id : false,
      joined: me ? ev.attendees.includes(me.id) : false,
      full: ev.attendees.length >= ev.maxPeople,
    };
  }

  function unreadFor(me) {
    const lastRead = new Map(data.reads.filter((r) => r.userId === me.id).map((r) => [r.key, r.at]));
    let count = 0;
    for (const msg of data.messages) {
      if (msg.fromId === me.id || isBlocked(me.id, msg.fromId)) continue;
      if (msg.toId === me.id || (msg.eventId && data.events.find((e) => e.id === msg.eventId)?.attendees.includes(me.id))) {
        const key = msg.eventId ? `ev:${msg.eventId}` : `dm:${msg.fromId}`;
        if (!lastRead.has(key) || msg.createdAt > lastRead.get(key)) count += 1;
      }
    }
    return count;
  }

  function markRead(userId, key) {
    const now = new Date().toISOString();
    const r = data.reads.find((x) => x.userId === userId && x.key === key);
    if (r) r.at = now; else data.reads.push({ userId, key, at: now });
    store.save();
  }

  // ---------- Router ----------
  const routes = [];
  function route(method, pattern, handler, { auth = true } = {}) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler, auth });
  }

  function sessionCookie(token, maxAge) {
    return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  }

  function startSession(user, ctx) {
    const token = newToken();
    data.sessions.push({
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(),
    });
    store.save();
    ctx.setHeader('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
  }

  // --- Auth ---
  route('POST', '/api/auth/register', ({ body, ip }, ctx) => {
    if (loginLimiter(`reg:${ip}`)) fail(429, 'Zu viele Versuche. Bitte warte kurz.');
    const email = str(body.email, 'E-Mail', { required: true, max: 120 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) fail(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
    if (password.length > 200) fail(400, 'Das Passwort ist zu lang.');
    const name = str(body.name, 'Name', { min: 2, max: 40 });
    const city = str(body.city, 'Stadt', { min: 2, max: 60 });
    const age = int(body.age, 'Alter', { min: 16, max: 120, optional: true });
    if (data.users.some((u) => u.email === email)) fail(409, 'Diese E-Mail ist schon registriert.');

    const user = {
      id: store.id(),
      email,
      passwordHash: hashPassword(password),
      name,
      city,
      age,
      bio: '',
      genres: [],
      favorites: [],
      intent: 'friends',
      cinemas: '',
      avatarColor: AVATAR_COLORS[data.users.length % AVATAR_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    startSession(user, ctx);
    ctx.status = 201;
    return { user: privateUser(user) };
  }, { auth: false });

  route('POST', '/api/auth/login', ({ body, ip }, ctx) => {
    if (loginLimiter(`login:${ip}`)) fail(429, 'Zu viele Anmeldeversuche. Bitte warte ein paar Minuten.');
    const email = String(body.email || '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const user = data.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) fail(401, 'E-Mail oder Passwort ist falsch.');
    startSession(user, ctx);
    return { user: privateUser(user) };
  }, { auth: false });

  route('POST', '/api/auth/logout', ({ token }, ctx) => {
    const i = data.sessions.findIndex((s) => s.token === token);
    if (i >= 0) data.sessions.splice(i, 1);
    store.save();
    ctx.setHeader('Set-Cookie', sessionCookie('', 0));
    return { ok: true };
  }, { auth: false });

  // --- Profil ---
  route('GET', '/api/me', ({ me }) => ({ user: privateUser(me) }));
  route('GET', '/api/session', ({ me }) => ({ user: me ? privateUser(me) : null }), { auth: false });

  route('PUT', '/api/me', ({ me, body }) => {
    if (body.name !== undefined) me.name = str(body.name, 'Name', { min: 2, max: 40 });
    if (body.city !== undefined) me.city = str(body.city, 'Stadt', { min: 2, max: 60 });
    if (body.age !== undefined) me.age = int(body.age, 'Alter', { min: 16, max: 120, optional: true });
    if (body.bio !== undefined) me.bio = str(body.bio, 'Über mich', { max: 500 });
    if (body.cinemas !== undefined) me.cinemas = str(body.cinemas, 'Lieblingskinos', { max: 200 });
    if (body.intent !== undefined) {
      if (!INTENTS.includes(body.intent)) fail(400, 'Ungültige Auswahl.');
      me.intent = body.intent;
    }
    if (body.genres !== undefined) {
      if (!Array.isArray(body.genres)) fail(400, 'Genres sind ungültig.');
      me.genres = [...new Set(body.genres.filter((g) => GENRES.includes(g)))].slice(0, 10);
    }
    if (body.favorites !== undefined) {
      if (!Array.isArray(body.favorites)) fail(400, 'Lieblingsfilme sind ungültig.');
      me.favorites = [...new Set(body.favorites.filter((id) => typeof id === 'string' && movies.getMovie(id)))].slice(0, 10);
    }
    store.save();
    return { user: privateUser(me) };
  });

  route('GET', '/api/meta', () => ({ genres: GENRES, imdb: movies.hasImdb }), { auth: false });

  route('GET', '/api/notifications', ({ me }) => ({
    incomingRequests: data.connections.filter((c) => c.toId === me.id && c.status === 'pending').length,
    unreadMessages: unreadFor(me),
  }));

  // --- Filme ---
  route('GET', '/api/movies', async ({ me, query }) => {
    const list = await movies.search(query.get('q'));
    const out = list.map((mv) => movieOut(mv, me));
    if (!query.get('q')) out.sort((a, b) => b.wantCount - a.wantCount || (b.year || 0) - (a.year || 0));
    return { movies: out };
  });

  route('GET', '/api/movies/:id', async ({ me, params }) => {
    let mv = movies.getMovie(params.id);
    if (!mv) fail(404, 'Film nicht gefunden.');
    mv = await movies.enrich(mv);
    const people = data.watchlist
      .filter((w) => w.movieId === mv.id && w.userId !== me.id)
      .map((w) => userById(w.userId))
      .filter((u) => u && !isBlocked(me.id, u.id))
      .map((u) => ({ ...publicUser(u), match: matchOut(me, u) }))
      .sort((a, b) => Number(b.match.sameCity) - Number(a.match.sameCity) || b.match.score - a.match.score);
    const events = data.events
      .filter((e) => e.movieId === mv.id && isUpcoming(e) && !isBlocked(me.id, e.hostId))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => eventOut(e, me));
    return { movie: movieOut(mv, me), people, events };
  });

  route('POST', '/api/movies', ({ me, body }) => {
    const title = str(body.title, 'Titel', { min: 1, max: 120 });
    const year = int(body.year, 'Jahr', { min: 1890, max: 2100, optional: true });
    const genres = Array.isArray(body.genres) ? body.genres.filter((g) => GENRES.includes(g)).slice(0, 4) : [];
    const mv = movies.addCustom({ title, year, genres }, me.id);
    return { movie: movieOut(mv, me) };
  });

  route('POST', '/api/watchlist/:movieId', async ({ me, params }) => {
    const mv = movies.getMovie(params.movieId);
    if (!mv) fail(404, 'Film nicht gefunden.');
    if (!data.watchlist.some((w) => w.userId === me.id && w.movieId === mv.id)) {
      data.watchlist.push({ userId: me.id, movieId: mv.id, createdAt: new Date().toISOString() });
      store.save();
    }
    movies.enrich(mv); // Details im Hintergrund nachladen
    return { movie: movieOut(mv, me) };
  });

  route('DELETE', '/api/watchlist/:movieId', ({ me, params }) => {
    const i = data.watchlist.findIndex((w) => w.userId === me.id && w.movieId === params.movieId);
    if (i >= 0) data.watchlist.splice(i, 1);
    store.save();
    return { ok: true };
  });

  route('GET', '/api/watchlist', ({ me }) => ({
    movies: data.watchlist
      .filter((w) => w.userId === me.id)
      .map((w) => movies.getMovie(w.movieId))
      .filter(Boolean)
      .map((mv) => movieOut(mv, me)),
  }));

  // --- Matching / Leute ---
  route('GET', '/api/matches', ({ me, query }) => {
    const city = query.has('city') ? normCity(query.get('city')) : normCity(me.city);
    const friendsOnly = query.get('friendsOnly') === '1';
    const results = data.users
      .filter((u) => u.id !== me.id && !isBlocked(me.id, u.id))
      .filter((u) => !city || normCity(u.city) === city)
      .filter((u) => !friendsOnly || (u.intent || 'friends') === 'friends')
      .map((u) => ({ user: publicUser(u), match: matchOut(me, u), connection: connectionStatus(me.id, u.id) }))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 60);
    return { matches: results };
  });

  function connectionStatus(meId, otherId) {
    const c = connectionBetween(meId, otherId);
    if (!c) return { status: 'none' };
    if (c.status === 'accepted') return { status: 'connected', id: c.id };
    return { status: c.fromId === meId ? 'outgoing' : 'incoming', id: c.id };
  }

  route('GET', '/api/users/:id', ({ me, params }) => {
    const u = userById(params.id);
    if (!u || (u.id !== me.id && isBlocked(me.id, u.id))) fail(404, 'Profil nicht gefunden.');
    const match = matchOut(me, u);
    const watch = [...watchSetOf(u.id)].map(movies.getMovie).filter(Boolean).map((mv) => movieOut(mv, me));
    const favorites = (u.favorites || []).map(movies.getMovie).filter(Boolean).map((mv) => ({ id: mv.id, title: mv.title, year: mv.year }));
    const events = data.events
      .filter((e) => e.attendees.includes(u.id) && isUpcoming(e))
      .map((e) => eventOut(e, me));
    const iBlocked = data.blocks.some((b) => b.userId === me.id && b.blockedId === u.id);
    return {
      user: publicUser(u),
      match,
      watchlist: watch,
      favorites,
      events,
      connection: connectionStatus(me.id, u.id),
      iBlocked,
    };
  });

  // --- Kontakte ---
  route('GET', '/api/connections', ({ me }) => {
    const mine = data.connections.filter((c) => c.fromId === me.id || c.toId === me.id);
    const view = (c) => {
      const other = userById(c.fromId === me.id ? c.toId : c.fromId);
      if (!other || isBlocked(me.id, other.id)) return null;
      const lastMsg = data.messages
        .filter((x) => !x.eventId && ((x.fromId === me.id && x.toId === other.id) || (x.fromId === other.id && x.toId === me.id)))
        .at(-1);
      return { id: c.id, user: publicUser(other), createdAt: c.createdAt, lastMessage: lastMsg || null };
    };
    return {
      incoming: mine.filter((c) => c.status === 'pending' && c.toId === me.id).map(view).filter(Boolean),
      outgoing: mine.filter((c) => c.status === 'pending' && c.fromId === me.id).map(view).filter(Boolean),
      connected: mine.filter((c) => c.status === 'accepted').map(view).filter(Boolean)
        .sort((a, b) => (b.lastMessage?.createdAt || b.createdAt).localeCompare(a.lastMessage?.createdAt || a.createdAt)),
    };
  });

  route('POST', '/api/connections', ({ me, body }) => {
    const other = userById(body.userId);
    if (!other || other.id === me.id || isBlocked(me.id, other.id)) fail(404, 'Profil nicht gefunden.');
    const note = str(body.note, 'Nachricht', { max: 300 });
    const existing = connectionBetween(me.id, other.id);
    if (existing) {
      // Gegenseitige Anfrage -> automatisch verbinden
      if (existing.status === 'pending' && existing.toId === me.id) existing.status = 'accepted';
      store.save();
      return { connection: connectionStatus(me.id, other.id) };
    }
    data.connections.push({ id: store.id(), fromId: me.id, toId: other.id, status: 'pending', note, createdAt: new Date().toISOString() });
    store.save();
    return { connection: connectionStatus(me.id, other.id) };
  });

  route('POST', '/api/connections/:id/accept', ({ me, params }) => {
    const c = data.connections.find((x) => x.id === params.id && x.toId === me.id && x.status === 'pending');
    if (!c) fail(404, 'Anfrage nicht gefunden.');
    c.status = 'accepted';
    store.save();
    return { ok: true };
  });

  route('DELETE', '/api/connections/:id', ({ me, params }) => {
    const i = data.connections.findIndex((x) => x.id === params.id && (x.fromId === me.id || x.toId === me.id));
    if (i < 0) fail(404, 'Verbindung nicht gefunden.');
    data.connections.splice(i, 1);
    store.save();
    return { ok: true };
  });

  // --- Direktnachrichten ---
  route('GET', '/api/messages/:userId', ({ me, params }) => {
    const other = userById(params.userId);
    if (!other || isBlocked(me.id, other.id)) fail(404, 'Profil nicht gefunden.');
    const msgs = data.messages.filter((x) => !x.eventId &&
      ((x.fromId === me.id && x.toId === other.id) || (x.fromId === other.id && x.toId === me.id)));
    markRead(me.id, `dm:${other.id}`);
    return { user: publicUser(other), connected: isConnected(me.id, other.id), messages: msgs.slice(-200) };
  });

  route('POST', '/api/messages/:userId', ({ me, params, body }) => {
    const other = userById(params.userId);
    if (!other || isBlocked(me.id, other.id)) fail(404, 'Profil nicht gefunden.');
    if (!isConnected(me.id, other.id)) fail(403, 'Ihr müsst verbunden sein, um euch zu schreiben.');
    const text = str(body.text, 'Nachricht', { min: 1, max: 1000 });
    const msg = { id: store.id(), fromId: me.id, toId: other.id, text, createdAt: new Date().toISOString() };
    data.messages.push(msg);
    store.save();
    return { message: msg };
  });

  // --- Kinotreffen ---
  route('GET', '/api/events', ({ me, query }) => {
    const city = query.has('city') ? normCity(query.get('city')) : normCity(me.city);
    const movieId = query.get('movieId');
    const mineOnly = query.get('mine') === '1';
    const events = data.events
      .filter(isUpcoming)
      .filter((e) => !isBlocked(me.id, e.hostId))
      .filter((e) => (mineOnly ? e.attendees.includes(me.id) : (!city || normCity(e.city) === city)))
      .filter((e) => !movieId || e.movieId === movieId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => eventOut(e, me));
    return { events };
  });

  route('POST', '/api/events', ({ me, body }) => {
    const mv = movies.getMovie(body.movieId);
    if (!mv) fail(400, 'Bitte wähle einen Film aus.');
    const cinema = str(body.cinema, 'Kino', { min: 2, max: 100 });
    const city = str(body.city || me.city, 'Stadt', { min: 2, max: 60 });
    const note = str(body.note, 'Beschreibung', { max: 500 });
    const meetingPoint = str(body.meetingPoint, 'Treffpunkt', { max: 120 });
    const maxPeople = int(body.maxPeople, 'Gruppengröße', { min: 2, max: 20 });
    const start = new Date(body.startsAt);
    if (Number.isNaN(start.getTime())) fail(400, 'Bitte gib Datum und Uhrzeit an.');
    if (start.getTime() < Date.now()) fail(400, 'Das Kinotreffen muss in der Zukunft liegen.');
    if (start.getTime() > Date.now() + 365 * 86400000) fail(400, 'Das Kinotreffen liegt zu weit in der Zukunft.');
    const ev = {
      id: store.id(),
      hostId: me.id,
      movieId: mv.id,
      cinema,
      city,
      meetingPoint,
      note,
      maxPeople,
      startsAt: start.toISOString(),
      attendees: [me.id],
      createdAt: new Date().toISOString(),
    };
    data.events.push(ev);
    if (!data.watchlist.some((w) => w.userId === me.id && w.movieId === mv.id)) {
      data.watchlist.push({ userId: me.id, movieId: mv.id, createdAt: new Date().toISOString() });
    }
    store.save();
    return { event: eventOut(ev, me) };
  });

  const eventFor = (me, id) => {
    const ev = data.events.find((e) => e.id === id);
    if (!ev || isBlocked(me.id, ev.hostId)) fail(404, 'Kinotreffen nicht gefunden.');
    return ev;
  };

  route('GET', '/api/events/:id', ({ me, params }) => ({ event: eventOut(eventFor(me, params.id), me) }));

  route('POST', '/api/events/:id/join', ({ me, params }) => {
    const ev = eventFor(me, params.id);
    if (!isUpcoming(ev)) fail(400, 'Dieses Kinotreffen ist schon vorbei.');
    if (!ev.attendees.includes(me.id)) {
      if (ev.attendees.length >= ev.maxPeople) fail(409, 'Dieses Kinotreffen ist leider schon voll.');
      ev.attendees.push(me.id);
      store.save();
    }
    return { event: eventOut(ev, me) };
  });

  route('POST', '/api/events/:id/leave', ({ me, params }) => {
    const ev = eventFor(me, params.id);
    if (ev.hostId === me.id) fail(400, 'Als Gastgeber:in kannst du das Treffen nur absagen.');
    ev.attendees = ev.attendees.filter((id) => id !== me.id);
    store.save();
    return { event: eventOut(ev, me) };
  });

  route('DELETE', '/api/events/:id', ({ me, params }) => {
    const ev = eventFor(me, params.id);
    if (ev.hostId !== me.id) fail(403, 'Nur die Gastgeber:in kann das Treffen absagen.');
    data.events.splice(data.events.indexOf(ev), 1);
    data.messages = data.messages.filter((x) => x.eventId !== ev.id);
    store.save();
    return { ok: true };
  });

  route('GET', '/api/events/:id/messages', ({ me, params }) => {
    const ev = eventFor(me, params.id);
    if (!ev.attendees.includes(me.id)) fail(403, 'Tritt dem Treffen bei, um den Gruppenchat zu sehen.');
    markRead(me.id, `ev:${ev.id}`);
    const msgs = data.messages.filter((x) => x.eventId === ev.id).slice(-200).map((x) => {
      const u = userById(x.fromId);
      return { ...x, fromName: u?.name || 'Gelöscht', fromColor: u?.avatarColor || '#666' };
    });
    return { messages: msgs };
  });

  route('POST', '/api/events/:id/messages', ({ me, params, body }) => {
    const ev = eventFor(me, params.id);
    if (!ev.attendees.includes(me.id)) fail(403, 'Tritt dem Treffen bei, um mitzuschreiben.');
    const text = str(body.text, 'Nachricht', { min: 1, max: 1000 });
    const msg = { id: store.id(), eventId: ev.id, fromId: me.id, text, createdAt: new Date().toISOString() };
    data.messages.push(msg);
    store.save();
    return { message: msg };
  });

  // --- Sicherheit: Blockieren & Melden ---
  route('POST', '/api/blocks', ({ me, body }) => {
    const other = userById(body.userId);
    if (!other || other.id === me.id) fail(404, 'Profil nicht gefunden.');
    if (!data.blocks.some((b) => b.userId === me.id && b.blockedId === other.id)) {
      data.blocks.push({ userId: me.id, blockedId: other.id, createdAt: new Date().toISOString() });
    }
    data.connections = data.connections.filter((c) => !((c.fromId === me.id && c.toId === other.id) || (c.fromId === other.id && c.toId === me.id)));
    store.save();
    return { ok: true };
  });

  route('DELETE', '/api/blocks/:userId', ({ me, params }) => {
    data.blocks = data.blocks.filter((b) => !(b.userId === me.id && b.blockedId === params.userId));
    store.save();
    return { ok: true };
  });

  route('POST', '/api/reports', ({ me, body }) => {
    const other = userById(body.userId);
    if (!other || other.id === me.id) fail(404, 'Profil nicht gefunden.');
    const reason = str(body.reason, 'Grund', { min: 3, max: 1000 });
    data.reports.push({ id: store.id(), reporterId: me.id, userId: other.id, reason, createdAt: new Date().toISOString() });
    store.save();
    return { ok: true };
  });

  route('GET', '/api/health', () => ({ ok: true }), { auth: false });

  // ---------- HTTP-Verarbeitung ----------
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new HttpError(413, 'Anfrage zu groß.'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
        } catch {
          reject(new HttpError(400, 'Ungültiges JSON.'));
        }
      });
      req.on('error', reject);
    });
  }

  function currentUser(token) {
    if (!token) return null;
    const s = data.sessions.find((x) => x.token === token);
    if (!s) return null;
    if (new Date(s.expiresAt).getTime() < Date.now()) {
      data.sessions.splice(data.sessions.indexOf(s), 1);
      store.save();
      return null;
    }
    return userById(s.userId) || null;
  }

  async function handleApi(req, res, url) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS };
    const ctx = { status: 200, setHeader: (k, v) => { headers[k] = v; } };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // CSRF-Schutz: Cross-Origin-Anfragen ablehnen
        const origin = req.headers.origin;
        if (origin) {
          let same = false;
          try { same = new URL(origin).host === req.headers.host; } catch { same = false; }
          if (!same) fail(403, 'Ungültiger Ursprung.');
        }
      }
      const match = routes
        .map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.re) }))
        .find((x) => x.m);
      if (!match) {
        const exists = routes.some((r) => r.re.test(url.pathname));
        fail(exists ? 405 : 404, exists ? 'Methode nicht erlaubt.' : 'Nicht gefunden.');
      }
      const { r, m } = match;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const token = parseCookies(req.headers.cookie).sid;
      const me = currentUser(token);
      if (r.auth && !me) fail(401, 'Bitte melde dich an.');
      const body = req.method === 'GET' ? {} : await readBody(req);
      const ip = req.socket.remoteAddress || 'unknown';
      const result = await r.handler({ me, body, params, query: url.searchParams, token, ip }, ctx);
      res.writeHead(ctx.status, headers);
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      res.writeHead(status, headers);
      res.end(JSON.stringify({ error: status === 500 ? 'Interner Fehler. Bitte versuche es erneut.' : err.message }));
    }
  }

  function serveStatic(req, res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { rel = '/'; }
    let file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403); res.end(); return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    return serveStatic(req, res, url);
  });

  return { server, store, movies };
}

// KinoBuddy – Frontend (Vanilla JS, keine Build-Tools nötig)

const $app = document.getElementById('app');
const state = { me: null, meta: { genres: [], imdb: false }, timers: [] };

// ---------- Helfer ----------
// Wie el.replaceChildren(), ignoriert aber null/false (statt "null" anzuzeigen).
const fill = (el, ...nodes) => el.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* leer */ }
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    state.me = null;
    go('#/');
  }
  if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast${isError ? ' err' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const every = (ms, fn) => state.timers.push(setInterval(fn, ms));

function hue(str) {
  let x = 0;
  for (const ch of String(str)) x = (x * 31 + ch.charCodeAt(0)) % 360;
  return x;
}

const avatar = (u, size = '') => h('div', { class: `avatar ${size}`, style: { background: u.avatarColor || '#666' }, title: u.name }, (u.name || '?')[0]);

function poster(movie) {
  const hu = hue(movie.id);
  const el = h('div', {
    class: 'poster',
    style: { background: `linear-gradient(160deg, hsl(${hu} 60% 40%), hsl(${(hu + 50) % 360} 55% 18%))` },
  });
  if (movie.poster) {
    const img = h('img', { src: movie.poster, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    el.append(img);
  } else {
    el.append(h('span', { class: 'ptitle' }, movie.title));
  }
  if (movie.wantCount) el.append(h('span', { class: 'pin' }, `🙋 ${movie.wantCount}`));
  return el;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const fmtTime = (d) => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => new Date(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
function fmtRelative(d) {
  const date = new Date(d);
  const today = new Date();
  const diff = Math.round((new Date(date.toDateString()) - new Date(today.toDateString())) / 86400000);
  if (diff === 0) return `Heute, ${fmtTime(d)}`;
  if (diff === 1) return `Morgen, ${fmtTime(d)}`;
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}

const intentTag = (intent) => intent === 'open'
  ? h('span', { class: 'tag gold' }, '💛 offen für mehr')
  : h('span', { class: 'tag ok' }, '🤝 Freundschaft');

function scoreRing(score) {
  return h('div', { class: 'score', style: { '--p': String(score) }, title: 'Match-Score' }, h('span', {}, `${score}%`));
}

function empty(icon, title, text, action) {
  return h('div', { class: 'card empty' }, h('div', { class: 'big' }, icon), h('h3', {}, title), h('p', {}, text), action || null);
}

function setLoading() { fill($app, h('div', { class: 'loading' }, 'Lädt …')); }

async function refreshBadge() {
  if (!state.me) return;
  try {
    const n = await api('GET', '/api/notifications');
    const total = n.incomingRequests + n.unreadMessages;
    const b = document.getElementById('badge');
    b.hidden = total === 0;
    b.textContent = total > 9 ? '9+' : String(total);
  } catch { /* ignorieren */ }
}

// ---------- Komponenten ----------
function personCard({ user, match }) {
  return h('a', { class: 'card person', href: `#/person/${user.id}` },
    h('div', { class: 'row' },
      avatar(user),
      h('div', { class: 'spacer' },
        h('h3', { class: 'ellipsis' }, user.name, user.age ? h('span', { class: 'muted' }, `, ${user.age}`) : null),
        h('div', { class: 'muted small' }, `📍 ${user.city}`)),
      match ? scoreRing(match.score) : null),
    user.bio ? h('p', { class: 'bio' }, user.bio) : null,
    h('div', { class: 'tags' },
      intentTag(user.intent),
      (match?.sharedGenres || []).slice(0, 3).map((g) => h('span', { class: 'tag' }, g))),
    match?.sharedWatch?.length
      ? h('div', { class: 'small' }, '🎬 Will auch sehen: ', h('b', {}, match.sharedWatch.map((m) => m.title || m).join(', ')))
      : null);
}

function movieCard(movie) {
  return h('a', { class: 'movie', href: `#/film/${encodeURIComponent(movie.id)}` },
    poster(movie),
    h('div', {},
      h('div', { class: 'mtitle' }, movie.title),
      h('div', { class: 'muted small' }, [movie.year, (movie.genres || []).slice(0, 2).join(' · ')].filter(Boolean).join(' · ')),
      movie.inMyList ? h('div', { class: 'small', style: { color: 'var(--ok)' } }, '✓ Auf meiner Liste') : null));
}

function eventCard(ev) {
  const d = new Date(ev.startsAt);
  const free = ev.maxPeople - ev.attendees.length;
  return h('a', { class: 'card event', href: `#/treffen/${ev.id}` },
    h('div', { class: 'when' },
      h('div', { class: 'datebox' }, h('small', {}, WEEKDAYS[d.getDay()]), h('b', {}, d.getDate()), h('small', {}, MONTHS[d.getMonth()])),
      h('div', { class: 'spacer' },
        h('h3', { class: 'ellipsis' }, ev.movie?.title || 'Film'),
        h('div', { class: 'muted small' }, `${fmtTime(ev.startsAt)} · ${ev.cinema}`),
        h('div', { class: 'muted small' }, `📍 ${ev.city}`))),
    ev.note ? h('p', { class: 'muted small', style: { margin: '0' } }, ev.note.length > 110 ? `${ev.note.slice(0, 110)}…` : ev.note) : null,
    h('div', { class: 'row between' },
      h('div', { class: 'avatars' }, ev.attendees.slice(0, 6).map((a) => avatar(a, 'sm'))),
      ev.joined ? h('span', { class: 'tag ok' }, ev.isHost ? '⭐ Gastgeber:in' : '✓ Dabei')
        : ev.full ? h('span', { class: 'tag' }, 'Voll')
          : h('span', { class: 'tag hot' }, `${free} ${free === 1 ? 'Platz' : 'Plätze'} frei`)));
}

function watchButton(movie, onChange) {
  const btn = h('button', { class: movie.inMyList ? 'btn ok' : 'btn' });
  const paint = () => { btn.className = movie.inMyList ? 'btn ok' : 'btn'; btn.textContent = movie.inMyList ? '✓ Will ich im Kino sehen' : '🙋 Will ich im Kino sehen'; };
  paint();
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (movie.inMyList) {
        await api('DELETE', `/api/watchlist/${encodeURIComponent(movie.id)}`);
        movie.inMyList = false;
        movie.wantCount = Math.max(0, (movie.wantCount || 1) - 1);
      } else {
        await api('POST', `/api/watchlist/${encodeURIComponent(movie.id)}`);
        movie.inMyList = true;
        movie.wantCount = (movie.wantCount || 0) + 1;
        toast('Gemerkt! Wir zeigen dir Leute, die ihn auch sehen wollen.');
      }
      paint();
      onChange?.();
    } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
  });
  return btn;
}

function genrePicker(selected) {
  const set = new Set(selected);
  const wrap = h('div', { class: 'chips' });
  for (const g of state.meta.genres) {
    const chip = h('button', { type: 'button', class: `chip${set.has(g) ? ' on' : ''}`, 'aria-pressed': String(set.has(g)) }, g);
    chip.addEventListener('click', () => {
      if (set.has(g)) set.delete(g); else set.add(g);
      chip.classList.toggle('on', set.has(g));
      chip.setAttribute('aria-pressed', String(set.has(g)));
    });
    wrap.append(chip);
  }
  wrap.getValue = () => [...set];
  return wrap;
}

// ---------- Views ----------
function viewLanding() {
  document.getElementById('topbar').hidden = true;
  let mode = 'register';
  const err = h('p', { class: 'error' });
  const form = h('form', { novalidate: true });
  const tabs = h('div', { class: 'tabs' });

  function draw() {
    fill(tabs,
      h('button', { type: 'button', class: mode === 'register' ? 'on' : '', onclick: () => { mode = 'register'; draw(); } }, 'Registrieren'),
      h('button', { type: 'button', class: mode === 'login' ? 'on' : '', onclick: () => { mode = 'login'; draw(); } }, 'Anmelden'));
    err.textContent = '';
    fill(form,
      mode === 'register' ? h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'Vorname'), h('input', { id: 'f-name', name: 'name', required: true, maxlength: 40, autocomplete: 'given-name' })),
        h('div', { class: 'field' }, h('label', { for: 'f-city' }, 'Stadt'), h('input', { id: 'f-city', name: 'city', required: true, maxlength: 60, placeholder: 'z. B. Berlin', autocomplete: 'address-level2' }))) : null,
      h('div', { class: 'field' }, h('label', { for: 'f-email' }, 'E-Mail'), h('input', { id: 'f-email', name: 'email', type: 'email', required: true, autocomplete: 'email' })),
      h('div', { class: 'field' }, h('label', { for: 'f-pw' }, 'Passwort', mode === 'register' ? h('span', { class: 'hint' }, ' (mind. 8 Zeichen)') : null),
        h('input', { id: 'f-pw', name: 'password', type: 'password', required: true, minlength: 8, autocomplete: mode === 'register' ? 'new-password' : 'current-password' })),
      err,
      h('button', { class: 'btn block', type: 'submit' }, mode === 'register' ? 'Kostenlos loslegen' : 'Anmelden'),
      h('div', { class: 'demo-hint' }, '👀 Nur mal reinschauen? Melde dich mit ', h('b', {}, 'lena@demo.kinobuddy.de'), ' und Passwort ', h('b', {}, 'kino1234'), ' an.'));
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('POST', mode === 'register' ? '/api/auth/register' : '/api/auth/login', fd);
      state.me = user;
      go(mode === 'register' ? '#/profil?willkommen' : '#/entdecken');
    } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
  });
  draw();

  const feature = (ico, title, text) => h('div', { class: 'feature' }, h('div', { class: 'ico' }, ico), h('div', {}, h('b', {}, title), h('p', {}, text)));

  fill($app, h('section', { class: 'hero' },
    h('div', {},
      h('div', { class: 'brand', style: { 'margin-bottom': '28px' } }, h('span', { class: 'brand-icon' }, '🍿'), 'KinoBuddy'),
      h('h1', {}, 'Niemand geht gern ', h('em', {}, 'alleine'), ' ins Kino.'),
      h('p', { class: 'lead' }, 'Finde Leute in deiner Stadt, die denselben Film sehen wollen – und quatscht vorher und nachher darüber. Für neue Freundschaften, Kino-Crews und gute Gespräche.'),
      h('div', { class: 'features' },
        feature('🎬', 'Sag, was du sehen willst', 'Markiere Filme, die du im Kino sehen möchtest – optional mit IMDb-Daten.'),
        feature('🤝', 'Match nach Filmgeschmack', 'Wir zeigen dir Menschen mit ähnlichem Geschmack und gemeinsamen Filmen.'),
        feature('🎟️', 'Kinotreffen planen', 'Erstelle ein Treffen oder schließ dich einer Gruppe an – mit Gruppenchat.'),
        feature('💛', 'Platonisch zuerst', 'Es geht um Freundschaft. Wer offen für mehr ist, kann das im Profil angeben.'))),
    h('div', { class: 'card' }, tabs, form)));
}

async function viewDiscover() {
  const rid = renderId;
  const me = state.me;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const city = params.has('stadt') ? params.get('stadt') : me.city;
  const friendsOnly = params.get('nurfreunde') === '1';

  const [{ matches }, { events }, { movies: watch }] = await Promise.all([
    api('GET', `/api/matches?city=${encodeURIComponent(city)}${friendsOnly ? '&friendsOnly=1' : ''}`),
    api('GET', `/api/events?city=${encodeURIComponent(city)}`),
    api('GET', '/api/watchlist'),
  ]);
  if (rid !== renderId) return;

  const cityInput = h('input', { value: city, placeholder: 'Stadt (leer = überall)', 'aria-label': 'Stadt' });
  const friendsBox = h('input', { type: 'checkbox', checked: friendsOnly });
  const apply = () => go(`#/entdecken?stadt=${encodeURIComponent(cityInput.value.trim())}${friendsBox.checked ? '&nurfreunde=1' : ''}`);
  cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  friendsBox.addEventListener('change', apply);

  const profileIncomplete = !me.genres.length || !watch.length;

  fill($app,
    h('div', { class: 'row between' },
      h('div', {}, h('h1', {}, `Hey ${me.name} 👋`), h('p', { class: 'muted' }, 'Diese Leute passen zu deinem Filmgeschmack.'))),
    profileIncomplete ? h('div', { class: 'banner' },
      h('b', {}, 'Bessere Matches in 1 Minute: '),
      !me.genres.length ? h('a', { href: '#/profil' }, 'Lieblingsgenres wählen') : null,
      !me.genres.length && !watch.length ? ' und ' : null,
      !watch.length ? h('a', { href: '#/filme' }, 'Filme markieren, die du im Kino sehen willst') : null,
      '.') : null,
    h('div', { class: 'filters' },
      cityInput,
      h('button', { class: 'btn secondary', onclick: apply }, 'Suchen'),
      h('label', { class: 'check' }, friendsBox, 'Nur „Freundschaft“')),
    events.length ? h('div', {},
      h('div', { class: 'row between' }, h('h2', {}, `🎟️ Bald${city ? ` in ${city}` : ''}`), h('a', { href: '#/treffen', class: 'muted small' }, 'Alle Kinotreffen →')),
      h('div', { class: 'grid events' }, events.slice(0, 3).map(eventCard))) : null,
    h('div', { class: 'section' },
      h('h2', {}, '🤝 Deine Matches'),
      matches.length
        ? h('div', { class: 'grid people' }, matches.map(personCard))
        : empty('🔍', 'Noch niemand hier', city ? `In „${city}“ haben wir noch niemanden gefunden. Probier eine andere Stadt oder lade Freund:innen ein!` : 'Noch keine Profile.', null)));
}

async function viewMovies() {
  const rid = renderId;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const q = params.get('q') || '';
  const { movies } = await api('GET', `/api/movies${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  if (rid !== renderId) return;

  const input = h('input', { type: 'search', value: q, placeholder: state.meta.imdb ? 'Film in der IMDb suchen …' : 'Film, Regie oder Jahr suchen …', 'aria-label': 'Filmsuche' });
  const search = () => go(`#/filme${input.value.trim() ? `?q=${encodeURIComponent(input.value.trim())}` : ''}`);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

  const mine = movies.filter((m) => m.inMyList);

  fill($app,
    h('h1', {}, '🎬 Filme'),
    h('p', { class: 'muted' }, 'Markiere Filme, die du im Kino sehen willst. So finden dich Leute mit demselben Plan.',
      state.meta.imdb ? ' Die Suche nutzt die IMDb-Datenbank.' : ''),
    h('div', { class: 'filters' },
      input,
      h('button', { class: 'btn secondary', onclick: search }, 'Suchen'),
      h('button', { class: 'btn ghost', onclick: () => openAddMovie(input.value.trim()) }, '＋ Film fehlt?')),
    !q && mine.length ? h('div', { class: 'stack' }, h('h2', {}, '✓ Auf deiner Liste'), h('div', { class: 'grid movies' }, mine.map(movieCard))) : null,
    h('div', { class: 'section stack' },
      h('h2', {}, q ? `Ergebnisse für „${q}“` : '🔥 Beliebt bei KinoBuddy'),
      movies.length
        ? h('div', { class: 'grid movies' }, (q ? movies : movies.filter((m) => !m.inMyList)).map(movieCard))
        : empty('🎞️', 'Nichts gefunden', 'Läuft gerade ein neuer Film? Füge ihn einfach selbst hinzu.',
          h('button', { class: 'btn', onclick: () => openAddMovie(q) }, '＋ Film hinzufügen'))));
}

function openAddMovie(prefill = '') {
  const genres = genrePicker([]);
  const err = h('p', { class: 'error' });
  const dlg = h('dialog', {});
  const form = h('form', { method: 'dialog' },
    h('h2', {}, 'Film hinzufügen'),
    h('p', { class: 'muted small' }, 'Für aktuelle Kinostarts, die noch nicht im Katalog sind.'),
    h('div', { class: 'field' }, h('label', { for: 'am-title' }, 'Titel'), h('input', { id: 'am-title', name: 'title', value: prefill, required: true, maxlength: 120 })),
    h('div', { class: 'field' }, h('label', { for: 'am-year' }, 'Jahr'), h('input', { id: 'am-year', name: 'year', type: 'number', min: 1890, max: 2100, value: String(new Date().getFullYear()) })),
    h('div', { class: 'field' }, h('label', {}, 'Genres'), genres),
    err,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Hinzufügen'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    try {
      const { movie } = await api('POST', '/api/movies', { title: fd.title, year: fd.year ? Number(fd.year) : null, genres: genres.getValue() });
      dlg.close();
      go(`#/film/${encodeURIComponent(movie.id)}`);
    } catch (ex) { err.textContent = ex.message; }
  });
  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

async function viewMovie(id) {
  const rid = renderId;
  const { movie, people, events } = await api('GET', `/api/movies/${encodeURIComponent(id)}`);
  if (rid !== renderId) return;
  const sameCity = people.filter((p) => p.match.sameCity);
  const others = people.filter((p) => !p.match.sameCity);

  fill($app,
    h('a', { href: '#/filme', class: 'back' }, '← Filme'),
    h('div', { class: 'movie-hero' },
      poster({ ...movie, wantCount: 0 }),
      h('div', { class: 'stack' },
        h('div', {},
          h('h1', {}, movie.title),
          h('div', { class: 'muted' }, [movie.year, movie.director ? `Regie: ${movie.director}` : null].filter(Boolean).join(' · '))),
        h('div', { class: 'tags' },
          (movie.genres || []).map((g) => h('span', { class: 'tag' }, g)),
          movie.imdbRating ? h('span', { class: 'tag gold' }, `⭐ ${movie.imdbRating} IMDb`) : null),
        movie.plot ? h('p', {}, movie.plot) : null,
        h('p', { class: 'muted' }, `🙋 ${movie.wantCount} ${movie.wantCount === 1 ? 'Person will' : 'Personen wollen'} diesen Film im Kino sehen.`),
        h('div', { class: 'row' },
          watchButton(movie, () => render()),
          h('a', { class: 'btn secondary', href: `#/treffen/neu?film=${encodeURIComponent(movie.id)}` }, '🎟️ Kinotreffen planen'),
          movie.imdbUrl ? h('a', { class: 'btn ghost', href: movie.imdbUrl, target: '_blank', rel: 'noopener noreferrer' }, 'IMDb ↗') : null))),
    h('div', { class: 'section stack' },
      h('h2', {}, '🎟️ Kinotreffen zu diesem Film'),
      events.length ? h('div', { class: 'grid events' }, events.map(eventCard))
        : empty('🎟️', 'Noch kein Treffen geplant', 'Sei die erste Person und lade andere ein!',
          h('a', { class: 'btn', href: `#/treffen/neu?film=${encodeURIComponent(movie.id)}` }, 'Treffen erstellen'))),
    h('div', { class: 'section stack' },
      h('h2', {}, `🙋 Wollen ihn auch sehen${state.me.city ? ` – in ${state.me.city}` : ''}`),
      sameCity.length ? h('div', { class: 'grid people' }, sameCity.map((p) => personCard({ user: p, match: p.match })))
        : h('p', { class: 'muted' }, 'In deiner Stadt hat ihn noch niemand markiert.')),
    others.length ? h('div', { class: 'section stack' },
      h('h2', {}, '🌍 Andere Städte'),
      h('div', { class: 'grid people' }, others.map((p) => personCard({ user: p, match: p.match })))) : null);
}

async function viewEvents() {
  const rid = renderId;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const city = params.has('stadt') ? params.get('stadt') : state.me.city;
  const [{ events }, { events: mine }] = await Promise.all([
    api('GET', `/api/events?city=${encodeURIComponent(city)}`),
    api('GET', '/api/events?mine=1'),
  ]);
  if (rid !== renderId) return;
  const cityInput = h('input', { value: city, placeholder: 'Stadt (leer = überall)', 'aria-label': 'Stadt' });
  const apply = () => go(`#/treffen?stadt=${encodeURIComponent(cityInput.value.trim())}`);
  cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });

  fill($app,
    h('div', { class: 'row between' },
      h('div', {}, h('h1', {}, '🎟️ Kinotreffen'), h('p', { class: 'muted' }, 'Schließ dich einer Gruppe an oder plane selbst einen Kinoabend.')),
      h('a', { class: 'btn', href: '#/treffen/neu' }, '＋ Treffen erstellen')),
    mine.length ? h('div', { class: 'stack' }, h('h2', {}, '⭐ Deine Termine'), h('div', { class: 'grid events' }, mine.map(eventCard))) : null,
    h('div', { class: 'section stack' },
      h('div', { class: 'filters' }, cityInput, h('button', { class: 'btn secondary', onclick: apply }, 'Suchen')),
      h('h2', {}, city ? `In ${city}` : 'Überall'),
      events.filter((e) => !e.joined).length
        ? h('div', { class: 'grid events' }, events.filter((e) => !e.joined).map(eventCard))
        : empty('🍿', 'Keine offenen Treffen', 'Erstelle das erste Kinotreffen – andere freuen sich darüber!',
          h('a', { class: 'btn', href: '#/treffen/neu' }, 'Treffen erstellen'))));
}

async function viewNewEvent() {
  const rid = renderId;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const preselect = params.get('film');
  const { movies } = await api('GET', '/api/movies');
  if (rid !== renderId) return;
  if (preselect && !movies.some((m) => m.id === preselect)) {
    try { const { movie } = await api('GET', `/api/movies/${encodeURIComponent(preselect)}`); movies.unshift(movie); } catch { /* ignorieren */ }
  }
  movies.sort((a, b) => Number(b.inMyList) - Number(a.inMyList) || a.title.localeCompare(b.title, 'de'));

  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(20, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const defaultDt = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T20:00`;

  const err = h('p', { class: 'error' });
  const form = h('form', { class: 'card', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'ev-movie' }, 'Film'),
      h('select', { id: 'ev-movie', name: 'movieId', required: true },
        h('option', { value: '' }, '– Film wählen –'),
        movies.map((m) => h('option', { value: m.id, selected: m.id === preselect }, `${m.inMyList ? '★ ' : ''}${m.title}${m.year ? ` (${m.year})` : ''}`))),
      h('div', { class: 'hint' }, 'Film nicht dabei? ', h('a', { href: '#/filme' }, 'Such ihn unter „Filme“ oder füge ihn hinzu.'))),
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'ev-cinema' }, 'Kino'), h('input', { id: 'ev-cinema', name: 'cinema', required: true, maxlength: 100, placeholder: 'z. B. Kino International' })),
      h('div', { class: 'field' }, h('label', { for: 'ev-city' }, 'Stadt'), h('input', { id: 'ev-city', name: 'city', required: true, maxlength: 60, value: state.me.city })),
      h('div', { class: 'field' }, h('label', { for: 'ev-dt' }, 'Datum & Uhrzeit (Filmstart)'), h('input', { id: 'ev-dt', name: 'startsAt', type: 'datetime-local', required: true, value: defaultDt })),
      h('div', { class: 'field' }, h('label', { for: 'ev-max' }, 'Max. Personen (inkl. dir)'), h('input', { id: 'ev-max', name: 'maxPeople', type: 'number', min: 2, max: 20, value: '4', required: true }))),
    h('div', { class: 'field' }, h('label', { for: 'ev-meet' }, 'Treffpunkt ', h('span', { class: 'hint' }, '(optional)')), h('input', { id: 'ev-meet', name: 'meetingPoint', maxlength: 120, placeholder: 'z. B. 15 Min. vorher am Eingang' })),
    h('div', { class: 'field' }, h('label', { for: 'ev-note' }, 'Beschreibung ', h('span', { class: 'hint' }, '(optional)')), h('textarea', { id: 'ev-note', name: 'note', maxlength: 500, placeholder: 'OV oder synchronisiert? Danach noch was trinken? Erzähl den anderen, worauf sie sich freuen können.' })),
    h('p', { class: 'muted small' }, '💡 Tipp: Jede:r kauft das eigene Ticket. Trefft euch beim ersten Mal an einem öffentlichen Ort – das Kino ist dafür perfekt.'),
    err,
    h('button', { class: 'btn', type: 'submit' }, 'Kinotreffen erstellen'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    if (!fd.movieId) { err.textContent = 'Bitte wähle einen Film aus.'; return; }
    const start = new Date(fd.startsAt);
    if (Number.isNaN(start.getTime())) { err.textContent = 'Bitte gib Datum und Uhrzeit an.'; return; }
    try {
      const { event } = await api('POST', '/api/events', { ...fd, maxPeople: Number(fd.maxPeople), startsAt: start.toISOString() });
      toast('Kinotreffen erstellt! 🎉');
      go(`#/treffen/${event.id}`);
    } catch (ex) { err.textContent = ex.message; }
  });

  if (rid !== renderId) return;
  fill($app, h('a', { href: '#/treffen', class: 'back' }, '← Kinotreffen'), h('h1', {}, 'Kinotreffen planen'), form);
}

async function viewEvent(id) {
  const rid = renderId;
  const { event: ev } = await api('GET', `/api/events/${encodeURIComponent(id)}`);
  if (rid !== renderId) return;
  const action = async (method, url, msg) => {
    try { await api(method, url); if (msg) toast(msg); render(); } catch (e) { toast(e.message, true); }
  };

  let chat = null;
  if (ev.joined) chat = buildChat({
    load: async () => (await api('GET', `/api/events/${ev.id}/messages`)).messages,
    send: (text) => api('POST', `/api/events/${ev.id}/messages`, { text }),
    group: true,
    emptyText: 'Sagt Hallo! Wer kauft wo Tickets, wer kommt direkt von der Arbeit?',
  });

  fill($app,
    h('a', { href: '#/treffen', class: 'back' }, '← Kinotreffen'),
    h('div', { class: 'movie-hero' },
      h('a', { href: `#/film/${encodeURIComponent(ev.movieId)}` }, poster({ id: ev.movieId, title: ev.movie?.title || 'Film', poster: ev.movie?.poster })),
      h('div', { class: 'stack' },
        h('div', {},
          h('div', { class: 'tag hot' }, fmtRelative(ev.startsAt)),
          h('h1', { style: { 'margin-top': '10px' } }, ev.movie?.title || 'Film'),
          h('div', { class: 'muted' }, `🎦 ${ev.cinema} · 📍 ${ev.city}`),
          ev.meetingPoint ? h('div', { class: 'muted' }, `🤝 Treffpunkt: ${ev.meetingPoint}`) : null),
        ev.note ? h('p', {}, ev.note) : null,
        h('div', {},
          h('h3', {}, `Dabei (${ev.attendees.length}/${ev.maxPeople})`),
          h('div', { class: 'row' }, ev.attendees.map((a) => h('a', { href: `#/person/${a.id}`, class: 'row', style: { 'text-decoration': 'none', gap: '8px' } },
            avatar(a, 'sm'), h('span', {}, a.name, a.id === ev.host?.id ? ' ⭐' : ''))))),
        h('div', { class: 'row' },
          ev.isHost
            ? h('button', { class: 'btn danger', onclick: async () => {
              if (!confirm('Kinotreffen wirklich absagen?')) return;
              try { await api('DELETE', `/api/events/${ev.id}`); toast('Treffen abgesagt.'); go('#/treffen'); } catch (e) { toast(e.message, true); }
            } }, 'Treffen absagen')
            : ev.joined
              ? h('button', { class: 'btn ghost', onclick: () => action('POST', `/api/events/${ev.id}/leave`, 'Du bist ausgetreten.') }, 'Doch nicht dabei')
              : h('button', { class: 'btn', disabled: ev.full, onclick: () => action('POST', `/api/events/${ev.id}/join`, 'Du bist dabei! 🍿') }, ev.full ? 'Leider voll' : 'Ich bin dabei!')))),
    h('div', { class: 'section' },
      h('h2', {}, '💬 Gruppenchat'),
      chat || h('div', { class: 'card muted' }, 'Tritt dem Treffen bei, um mit der Gruppe zu chatten.')));
}

function buildChat({ load, send, group, emptyText, disabled }) {
  const list = h('div', { class: 'messages' });
  const input = h('input', { placeholder: disabled ? 'Ihr müsst verbunden sein, um zu schreiben.' : 'Nachricht schreiben …', maxlength: 1000, disabled: Boolean(disabled), 'aria-label': 'Nachricht' });
  const form = h('form', { class: 'composer' }, input, h('button', { class: 'btn', type: 'submit', disabled: Boolean(disabled) }, 'Senden'));
  let lastKey = '';

  async function refresh() {
    try {
      const msgs = await load();
      const key = msgs.map((m) => m.id).join(',');
      if (key === lastKey) return;
      lastKey = key;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      fill(list, ...(msgs.length ? msgs.map((m) => h('div', { class: `msg${m.fromId === state.me.id ? ' me' : ''}` },
        group && m.fromId !== state.me.id ? h('div', { class: 'from', style: { color: m.fromColor } }, m.fromName) : null,
        m.text,
        h('div', { class: 'meta' }, `${new Date(m.createdAt).toLocaleDateString('de-DE')} ${fmtTime(m.createdAt)}`))) : [h('p', { class: 'muted empty' }, emptyText)]));
      if (atBottom || !list.dataset.init) { list.scrollTop = list.scrollHeight; list.dataset.init = '1'; }
    } catch { /* still */ }
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await send(text); await refresh(); list.scrollTop = list.scrollHeight; } catch (ex) { toast(ex.message, true); input.value = text; }
  });
  refresh();
  every(3000, refresh);
  return h('div', { class: 'card chat' }, list, form);
}

async function viewPerson(id) {
  const rid = renderId;
  if (id === state.me.id) return go('#/profil');
  const data = await api('GET', `/api/users/${encodeURIComponent(id)}`);
  if (rid !== renderId) return;
  const { user, match, watchlist, favorites, events, connection, iBlocked } = data;

  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); render(); refreshBadge(); } catch (e) { toast(e.message, true); } };

  let actions;
  if (connection.status === 'connected') {
    actions = [h('a', { class: 'btn', href: `#/chat/${user.id}` }, '💬 Nachricht schreiben'),
      h('button', { class: 'btn ghost small', onclick: () => { if (confirm(`Verbindung mit ${user.name} lösen?`)) act(() => api('DELETE', `/api/connections/${connection.id}`), 'Verbindung gelöst.'); } }, 'Verbindung lösen')];
  } else if (connection.status === 'outgoing') {
    actions = [h('button', { class: 'btn secondary', disabled: true }, '⏳ Anfrage gesendet'),
      h('button', { class: 'btn ghost small', onclick: () => act(() => api('DELETE', `/api/connections/${connection.id}`), 'Anfrage zurückgezogen.') }, 'Zurückziehen')];
  } else if (connection.status === 'incoming') {
    actions = [h('button', { class: 'btn ok', onclick: () => act(() => api('POST', `/api/connections/${connection.id}/accept`), 'Ihr seid jetzt verbunden! 🎉') }, '✓ Anfrage annehmen'),
      h('button', { class: 'btn ghost', onclick: () => act(() => api('DELETE', `/api/connections/${connection.id}`), 'Anfrage abgelehnt.') }, 'Ablehnen')];
  } else {
    actions = [h('button', { class: 'btn', onclick: () => act(() => api('POST', '/api/connections', { userId: user.id }), `Anfrage an ${user.name} gesendet!`) }, '🤝 Verbinden')];
  }

  const report = () => {
    const reason = prompt(`Warum möchtest du ${user.name} melden? Unser Team schaut sich das an.`);
    if (reason && reason.trim()) act(() => api('POST', '/api/reports', { userId: user.id, reason: reason.trim() }), 'Danke für deine Meldung.');
  };
  const block = () => {
    if (confirm(`${user.name} blockieren? Ihr seht euch dann gegenseitig nicht mehr.`)) {
      api('POST', '/api/blocks', { userId: user.id })
        .then(() => { toast(`${user.name} wurde blockiert.`); go('#/entdecken'); refreshBadge(); })
        .catch((e) => toast(e.message, true));
    }
  };

  fill($app,
    h('a', { href: '#/entdecken', class: 'back' }, '← Entdecken'),
    h('div', { class: 'card stack' },
      h('div', { class: 'row' },
        avatar(user, 'lg'),
        h('div', { class: 'spacer' },
          h('h1', { style: { margin: '0' } }, user.name, user.age ? h('span', { class: 'muted' }, `, ${user.age}`) : null),
          h('div', { class: 'muted' }, `📍 ${user.city}`),
          h('div', { class: 'tags', style: { 'margin-top': '6px' } }, intentTag(user.intent))),
        scoreRing(match.score)),
      user.bio ? h('p', {}, user.bio) : null,
      user.cinemas ? h('p', { class: 'muted' }, `🎦 Lieblingskinos: ${user.cinemas}`) : null,
      user.genres.length ? h('div', { class: 'tags' }, user.genres.map((g) => h('span', { class: match.sharedGenres.includes(g) ? 'tag hot' : 'tag' }, g))) : null,
      h('div', { class: 'row' }, actions),
      iBlocked ? null : h('div', { class: 'row small' },
        h('button', { class: 'btn ghost small', onclick: report }, '🚩 Melden'),
        h('button', { class: 'btn danger small', onclick: block }, '⛔ Blockieren'))),
    match.sharedWatch.length || match.sharedFavorites.length ? h('div', { class: 'banner', style: { 'margin-top': '24px' } },
      h('b', {}, '✨ Ihr habt was gemeinsam: '),
      [match.sharedWatch.length ? `${match.sharedWatch.length} gemeinsame${match.sharedWatch.length === 1 ? 'r' : ''} Wunschfilm${match.sharedWatch.length === 1 ? '' : 'e'}` : null,
        match.sharedFavorites.length ? `${match.sharedFavorites.length} gemeinsame${match.sharedFavorites.length === 1 ? 'r' : ''} Lieblingsfilm${match.sharedFavorites.length === 1 ? '' : 'e'}` : null,
        match.sharedGenres.length ? `${match.sharedGenres.length} gemeinsame Genres` : null].filter(Boolean).join(' · ')) : null,
    watchlist.length ? h('div', { class: 'section stack' }, h('h2', {}, `🎬 ${user.name} will im Kino sehen`), h('div', { class: 'grid movies' }, watchlist.map(movieCard))) : null,
    favorites.length ? h('div', { class: 'section stack' }, h('h2', {}, '❤️ Lieblingsfilme'),
      h('div', { class: 'tags' }, favorites.map((f) => h('a', { class: 'tag', href: `#/film/${encodeURIComponent(f.id)}` }, `${f.title}${f.year ? ` (${f.year})` : ''}`)))) : null,
    events.length ? h('div', { class: 'section stack' }, h('h2', {}, '🎟️ Kommende Kinotreffen'), h('div', { class: 'grid events' }, events.map(eventCard))) : null);
}

async function viewConnections() {
  const rid = renderId;
  const { incoming, outgoing, connected } = await api('GET', '/api/connections');
  if (rid !== renderId) return;
  const act = async (fn, msg) => { try { await fn(); toast(msg); render(); refreshBadge(); } catch (e) { toast(e.message, true); } };

  const item = (c, extra) => h('div', { class: 'list-item' },
    avatar(c.user),
    h('a', { class: 'grow', href: extra === 'chat' ? `#/chat/${c.user.id}` : `#/person/${c.user.id}` },
      h('b', {}, c.user.name), h('span', { class: 'muted small' }, ` · ${c.user.city}`),
      h('div', { class: 'muted small ellipsis' },
        extra === 'chat' ? (c.lastMessage ? `${c.lastMessage.fromId === state.me.id ? 'Du: ' : ''}${c.lastMessage.text}` : 'Noch keine Nachrichten – sag Hallo!') : (c.user.bio || ''))),
    extra === 'incoming' ? h('div', { class: 'row' },
      h('button', { class: 'btn ok small', onclick: () => act(() => api('POST', `/api/connections/${c.id}/accept`), 'Verbunden! 🎉') }, 'Annehmen'),
      h('button', { class: 'btn ghost small', onclick: () => act(() => api('DELETE', `/api/connections/${c.id}`), 'Abgelehnt.') }, 'Ablehnen')) : null,
    extra === 'outgoing' ? h('span', { class: 'tag' }, 'ausstehend') : null,
    extra === 'chat' ? h('a', { class: 'btn secondary small', href: `#/chat/${c.user.id}` }, 'Chat') : null);

  fill($app,
    h('h1', {}, '💬 Kontakte'),
    incoming.length ? h('div', { class: 'card', style: { 'margin-bottom': '20px' } }, h('h2', {}, `📩 Anfragen (${incoming.length})`), incoming.map((c) => item(c, 'incoming'))) : null,
    connected.length ? h('div', { class: 'card' }, h('h2', {}, 'Deine Kino-Buddies'), connected.map((c) => item(c, 'chat')))
      : empty('🤝', 'Noch keine Kontakte', 'Entdecke Leute mit deinem Filmgeschmack und schick ihnen eine Anfrage.', h('a', { class: 'btn', href: '#/entdecken' }, 'Leute entdecken')),
    outgoing.length ? h('div', { class: 'card', style: { 'margin-top': '20px' } }, h('h2', {}, 'Gesendete Anfragen'), outgoing.map((c) => item(c, 'outgoing'))) : null);
}

async function viewChat(userId) {
  const rid = renderId;
  const first = await api('GET', `/api/messages/${encodeURIComponent(userId)}`);
  if (rid !== renderId) return;
  const other = first.user;
  const chat = buildChat({
    load: async () => (await api('GET', `/api/messages/${encodeURIComponent(userId)}`)).messages,
    send: (text) => api('POST', `/api/messages/${encodeURIComponent(userId)}`, { text }),
    emptyText: `Schreib ${other.name}, welchen Film ihr zusammen sehen könntet! 🍿`,
    disabled: !first.connected,
  });
  fill($app,
    h('a', { href: '#/kontakte', class: 'back' }, '← Kontakte'),
    h('a', { href: `#/person/${other.id}`, class: 'row', style: { 'text-decoration': 'none', 'margin-bottom': '16px' } },
      avatar(other), h('div', {}, h('h2', { style: { margin: '0' } }, other.name), h('div', { class: 'muted small' }, `📍 ${other.city}`))),
    chat);
  setTimeout(refreshBadge, 500);
}

async function viewProfile() {
  const rid = renderId;
  const me = state.me;
  const welcome = location.hash.includes('willkommen');
  const { movies } = await api('GET', '/api/movies');
  if (rid !== renderId) return;
  const genres = genrePicker(me.genres);
  const favSet = new Set(me.favorites);
  const favChips = h('div', { class: 'chips' }, movies.slice().sort((a, b) => a.title.localeCompare(b.title, 'de')).map((m) => {
    const chip = h('button', { type: 'button', class: `chip${favSet.has(m.id) ? ' on' : ''}`, 'aria-pressed': String(favSet.has(m.id)) }, m.title);
    chip.addEventListener('click', () => {
      if (favSet.has(m.id)) favSet.delete(m.id);
      else if (favSet.size >= 10) { toast('Maximal 10 Lieblingsfilme.', true); return; } else favSet.add(m.id);
      chip.classList.toggle('on', favSet.has(m.id));
      chip.setAttribute('aria-pressed', String(favSet.has(m.id)));
    });
    return chip;
  }));

  const err = h('p', { class: 'error' });
  const form = h('form', { class: 'card', novalidate: true },
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'p-name' }, 'Vorname'), h('input', { id: 'p-name', name: 'name', value: me.name, maxlength: 40 })),
      h('div', { class: 'field' }, h('label', { for: 'p-city' }, 'Stadt'), h('input', { id: 'p-city', name: 'city', value: me.city, maxlength: 60 })),
      h('div', { class: 'field' }, h('label', { for: 'p-age' }, 'Alter ', h('span', { class: 'hint' }, '(optional)')), h('input', { id: 'p-age', name: 'age', type: 'number', min: 16, max: 120, value: me.age ?? '' })),
      h('div', { class: 'field' }, h('label', { for: 'p-intent' }, 'Ich suche …'),
        h('select', { id: 'p-intent', name: 'intent' },
          h('option', { value: 'friends', selected: me.intent === 'friends' }, '🤝 Kino-Freundschaften (platonisch)'),
          h('option', { value: 'open', selected: me.intent === 'open' }, '💛 Freundschaft – und offen für mehr')))),
    h('div', { class: 'field' }, h('label', { for: 'p-bio' }, 'Über mich'),
      h('textarea', { id: 'p-bio', name: 'bio', maxlength: 500, placeholder: 'Was für Filme magst du? OV oder Synchro? Popcorn süß oder salzig? Was machst du gern nach dem Kino?', value: me.bio })),
    h('div', { class: 'field' }, h('label', { for: 'p-cinemas' }, 'Lieblingskinos ', h('span', { class: 'hint' }, '(optional)')), h('input', { id: 'p-cinemas', name: 'cinemas', value: me.cinemas, maxlength: 200 })),
    h('div', { class: 'field' }, h('label', {}, 'Lieblingsgenres'), genres),
    h('div', { class: 'field' }, h('label', {}, 'Lieblingsfilme ', h('span', { class: 'hint' }, '(bis zu 10)')), favChips),
    err,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, welcome ? 'Weiter: Filme auswählen →' : 'Speichern'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', onclick: logout }, 'Abmelden')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    try {
      const { user } = await api('PUT', '/api/me', {
        ...fd,
        age: fd.age === '' ? null : Number(fd.age),
        genres: genres.getValue(),
        favorites: [...favSet],
      });
      state.me = user;
      toast('Profil gespeichert ✓');
      if (welcome) go('#/filme');
    } catch (ex) { err.textContent = ex.message; }
  });

  fill($app,
    welcome ? h('div', { class: 'banner' }, h('h2', {}, `Willkommen bei KinoBuddy, ${me.name}! 🍿`),
      h('p', { style: { margin: '0' } }, 'Erzähl kurz etwas über deinen Filmgeschmack – danach zeigen wir dir passende Leute und Kinotreffen.')) : null,
    h('div', { class: 'row between' }, h('h1', {}, 'Dein Profil'), h('span', { class: 'muted small' }, me.email)),
    form);
}

async function logout() {
  try { await api('POST', '/api/auth/logout'); } catch { /* egal */ }
  state.me = null;
  go('#/');
}

// ---------- Router ----------
const ROUTES = [
  [/^#\/entdecken/, viewDiscover, 'entdecken'],
  [/^#\/filme/, viewMovies, 'filme'],
  [/^#\/film\/([^?]+)/, viewMovie, 'filme'],
  [/^#\/treffen\/neu/, viewNewEvent, 'treffen'],
  [/^#\/treffen\/([^?]+)/, viewEvent, 'treffen'],
  [/^#\/treffen/, viewEvents, 'treffen'],
  [/^#\/person\/([^?]+)/, viewPerson, 'entdecken'],
  [/^#\/kontakte/, viewConnections, 'kontakte'],
  [/^#\/chat\/([^?]+)/, viewChat, 'kontakte'],
  [/^#\/profil/, viewProfile, 'profil'],
];

let renderId = 0;
async function render() {
  const myRender = ++renderId;
  state.timers.forEach(clearInterval);
  state.timers = [];
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  const hash = location.hash || '#/';

  if (!state.me) { viewLanding(); return; }
  document.getElementById('topbar').hidden = false;

  const found = ROUTES.find(([re]) => re.test(hash));
  if (!found) { go('#/entdecken'); return; }
  const [re, view, nav] = found;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  const m = hash.match(re);
  setLoading();
  window.scrollTo(0, 0);
  try {
    await view(m[1] ? decodeURIComponent(m[1]) : undefined);
  } catch (e) {
    if (myRender !== renderId || !state.me) return;
    fill($app, empty('😕', 'Hoppla', e.message, h('a', { class: 'btn', href: '#/entdecken' }, 'Zur Startseite')));
  }
}

async function init() {
  try { state.meta = await (await fetch('/api/meta')).json(); } catch { /* Standardwerte */ }
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    if (res.ok) state.me = (await res.json()).user || null;
  } catch { /* offline */ }
  window.addEventListener('hashchange', render);
  await render();
  refreshBadge();
  setInterval(refreshBadge, 15000);
}

init();

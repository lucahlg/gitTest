// Demo-Daten, damit die Plattform beim ersten Start nicht leer ist.
// Alle Demo-Accounts haben das Passwort: kino1234
import { hashPassword } from './auth.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PEOPLE = [
  { name: 'Lena', city: 'Berlin', age: 27, intent: 'friends', genres: ['Sci-Fi', 'Drama', 'Thriller'], favorites: ['tt1856101', 'tt0816692'], watch: ['tt15239678', 'tt6751668', 'tt1375666'], cinemas: 'Kino International, Babylon', bio: 'Neu in Berlin und suche Leute für Sneak Previews. Nach dem Film unbedingt noch auf ein Getränk und diskutieren!' },
  { name: 'Jonas', city: 'Berlin', age: 31, intent: 'friends', genres: ['Sci-Fi', 'Action', 'Abenteuer'], favorites: ['tt1392190', 'tt0133093'], watch: ['tt15239678', 'tt1392190', 'tt1856101'], cinemas: 'Zoo Palast, CineStar IMAX', bio: 'IMAX-Fan. Wenn Villeneuve draufsteht, bin ich dabei.' },
  { name: 'Aylin', city: 'Berlin', age: 24, intent: 'open', genres: ['Romantik', 'Komödie', 'Musical'], favorites: ['tt3783958', 'tt0211915'], watch: ['tt3783958', 'tt1517268', 'tt0211915'], cinemas: 'Delphi Filmpalast', bio: 'Popcorn süß und salzig gemischt. Ich liebe Kinos mit Samtsesseln.' },
  { name: 'Mehmet', city: 'Berlin', age: 35, intent: 'friends', genres: ['Krimi', 'Drama', 'Thriller'], favorites: ['tt0068646', 'tt0407887'], watch: ['tt6751668', 'tt7286456', 'tt0405094'], cinemas: 'Yorck Kinos', bio: 'Mag OmU-Vorstellungen und lange Gespräche danach.' },
  { name: 'Sophie', city: 'Hamburg', age: 29, intent: 'friends', genres: ['Animation', 'Fantasy', 'Familie'], favorites: ['tt0245429', 'tt2380307'], watch: ['tt0245429', 'tt2380307', 'tt1517268'], cinemas: 'Abaton, Zeise Kinos', bio: 'Ghibli-Marathon jemand? Ich bringe Snacks mit.' },
  { name: 'Finn', city: 'Hamburg', age: 26, intent: 'open', genres: ['Horror', 'Mystery', 'Thriller'], favorites: ['tt5052448', 'tt0081505'], watch: ['tt5052448', 'tt0114369', 'tt0081505'], cinemas: 'Savoy', bio: 'Horror alleine gucken ist doof – zusammen schreien macht mehr Spaß.' },
  { name: 'Clara', city: 'München', age: 33, intent: 'friends', genres: ['Drama', 'Biografie', 'Historie'], favorites: ['tt15398776', 'tt0405094'], watch: ['tt15398776', 'tt2582802', 'tt0405094'], cinemas: 'Museum Lichtspiele, Mathäser', bio: 'Arthouse und große Biopics. Danach gerne ein Spaziergang an der Isar.' },
  { name: 'Noah', city: 'München', age: 22, intent: 'friends', genres: ['Action', 'Sci-Fi', 'Komödie'], favorites: ['tt0468569', 'tt6710474'], watch: ['tt15239678', 'tt6710474', 'tt0468569'], cinemas: 'Mathäser', bio: 'Student, immer für den Kinotag zu haben.' },
  { name: 'Mia', city: 'Köln', age: 28, intent: 'friends', genres: ['Komödie', 'Drama', 'Musik'], favorites: ['tt2582802', 'tt2278388'], watch: ['tt2582802', 'tt2278388', 'tt3783958'], cinemas: 'Odeon, Filmpalast', bio: 'Wes-Anderson-Ästhetik in meinem Herzen. Suche eine feste Kino-Crew.' },
  { name: 'Ben', city: 'Köln', age: 30, intent: 'open', genres: ['Krimi', 'Action', 'Thriller'], favorites: ['tt0110912', 'tt0130827'], watch: ['tt0110912', 'tt7286456', 'tt0130827'], cinemas: 'Cinedom', bio: 'Tarantino-Nerd. Zitate-Battle nach dem Film garantiert.' },
];

const COLORS = ['#e94560', '#f5a623', '#2ec4b6', '#7b61ff', '#ff6b9d', '#3a86ff', '#06d6a0', '#ff8c42'];

function inDays(days, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function seed(store) {
  const { data } = store;
  const hash = hashPassword('kino1234');
  const now = new Date().toISOString();
  const users = PEOPLE.map((p, i) => {
    const u = {
      id: store.id(),
      email: `${p.name.toLowerCase()}@demo.kinobuddy.de`,
      passwordHash: hash,
      name: p.name,
      city: p.city,
      age: p.age,
      bio: p.bio,
      genres: p.genres,
      favorites: p.favorites,
      intent: p.intent,
      cinemas: p.cinemas,
      avatarColor: COLORS[i % COLORS.length],
      createdAt: now,
      demo: true,
    };
    data.users.push(u);
    for (const movieId of p.watch) data.watchlist.push({ userId: u.id, movieId, createdAt: now });
    return u;
  });
  const by = Object.fromEntries(users.map((u) => [u.name, u]));

  const ev = (host, movieId, cinema, city, startsAt, maxPeople, note, meetingPoint, others = []) => {
    const e = {
      id: store.id(), hostId: by[host].id, movieId, cinema, city, startsAt, maxPeople, note, meetingPoint,
      attendees: [by[host].id, ...others.map((n) => by[n].id)], createdAt: now,
    };
    data.events.push(e);
    return e;
  };

  const e1 = ev('Jonas', 'tt15239678', 'CineStar IMAX Sony Center', 'Berlin', inDays(2, 20, 0), 5,
    'Wiederaufführung in IMAX! Danach noch auf ein Bier in der Nähe und über den Soundtrack nerden.', 'Vor dem Eingang, 19:40', ['Lena']);
  ev('Mehmet', 'tt6751668', 'Babylon Mitte', 'Berlin', inDays(4, 19, 30), 4,
    'OmU-Vorstellung. Ich hab den Film schon gesehen, aber zusammen ist er noch besser.', 'Foyer an der Bar');
  ev('Aylin', 'tt3783958', 'Delphi Filmpalast', 'Berlin', inDays(6, 18, 0), 6,
    'Sing-along-Stimmung erlaubt. Danach Pizza?', 'Kasse');
  ev('Sophie', 'tt0245429', 'Abaton Kino', 'Hamburg', inDays(3, 17, 0), 6,
    'Ghibli-Sonntag! Auch perfekt, wenn du neu in Hamburg bist.', 'Vor dem Kino');
  ev('Clara', 'tt15398776', 'Museum Lichtspiele', 'München', inDays(5, 19, 0), 4,
    'In 70mm – drei Stunden Kino, danach brauchen wir definitiv einen Absacker.', 'Eingang Lilienstraße');
  ev('Mia', 'tt2278388', 'Odeon Kino', 'Köln', inDays(7, 20, 15), 5,
    'Wes Anderson Abend. Bonuspunkte für pastellfarbene Outfits.', 'Vor dem Odeon', ['Ben']);

  data.connections.push({ id: store.id(), fromId: by.Lena.id, toId: by.Jonas.id, status: 'accepted', note: '', createdAt: now });
  data.messages.push(
    { id: store.id(), eventId: e1.id, fromId: by.Jonas.id, text: 'Hey Lena, schön, dass du dabei bist! Ich habe schon Plätze in Reihe 9 im Blick.', createdAt: now },
    { id: store.id(), eventId: e1.id, fromId: by.Lena.id, text: 'Perfekt! Ich freu mich riesig 🍿', createdAt: now },
  );
  store.save();
  return users;
}

// CLI: `npm run seed` setzt die Datenbank zurück und befüllt sie neu.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createStore } = await import('./store.js');
  const file = process.env.DB_FILE || path.join(process.cwd(), 'data', 'db.json');
  if (process.argv.includes('--reset') && fs.existsSync(file)) fs.rmSync(file);
  const store = createStore(file);
  seed(store);
  store.flush();
  console.log(`Demo-Daten angelegt in ${file} (Passwort für alle Demo-Accounts: kino1234)`);
}

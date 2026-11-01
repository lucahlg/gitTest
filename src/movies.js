// Film-Katalog. Ohne API-Key wird ein lokaler Katalog (mit echten IMDb-IDs)
// verwendet. Mit OMDB_API_KEY (IMDb-Daten über https://www.omdbapi.com) wird
// die Suche live gegen die IMDb-Datenbank ausgeführt und Poster/Details geladen.

export const GENRES = [
  'Action', 'Abenteuer', 'Animation', 'Biografie', 'Dokumentation', 'Drama',
  'Familie', 'Fantasy', 'Historie', 'Horror', 'Komödie', 'Krimi', 'Musik',
  'Musical', 'Mystery', 'Romantik', 'Sci-Fi', 'Sport', 'Thriller', 'Kriegsfilm', 'Western',
];

const GENRE_MAP = {
  Action: 'Action', Adventure: 'Abenteuer', Animation: 'Animation', Biography: 'Biografie',
  Documentary: 'Dokumentation', Drama: 'Drama', Family: 'Familie', Fantasy: 'Fantasy',
  History: 'Historie', Horror: 'Horror', Comedy: 'Komödie', Crime: 'Krimi', Music: 'Musik',
  Musical: 'Musical', Mystery: 'Mystery', Romance: 'Romantik', 'Sci-Fi': 'Sci-Fi',
  Sport: 'Sport', Thriller: 'Thriller', War: 'Kriegsfilm', Western: 'Western',
};

export function mapGenres(str = '') {
  return [...new Set(String(str).split(',').map((g) => GENRE_MAP[g.trim()]).filter(Boolean))];
}

const m = (id, title, year, genres, director) => ({ id, title, year, genres, director, poster: null, source: 'catalog' });

export const CATALOG = [
  m('tt15239678', 'Dune: Part Two', 2024, ['Sci-Fi', 'Abenteuer', 'Drama'], 'Denis Villeneuve'),
  m('tt1160419', 'Dune', 2021, ['Sci-Fi', 'Abenteuer', 'Drama'], 'Denis Villeneuve'),
  m('tt15398776', 'Oppenheimer', 2023, ['Biografie', 'Drama', 'Historie'], 'Christopher Nolan'),
  m('tt1517268', 'Barbie', 2023, ['Komödie', 'Fantasy', 'Abenteuer'], 'Greta Gerwig'),
  m('tt6710474', 'Everything Everywhere All at Once', 2022, ['Action', 'Abenteuer', 'Komödie'], 'Daniel Kwan, Daniel Scheinert'),
  m('tt6751668', 'Parasite', 2019, ['Drama', 'Thriller'], 'Bong Joon Ho'),
  m('tt7286456', 'Joker', 2019, ['Krimi', 'Drama', 'Thriller'], 'Todd Phillips'),
  m('tt5052448', 'Get Out', 2017, ['Horror', 'Mystery', 'Thriller'], 'Jordan Peele'),
  m('tt1856101', 'Blade Runner 2049', 2017, ['Sci-Fi', 'Drama', 'Action'], 'Denis Villeneuve'),
  m('tt2380307', 'Coco', 2017, ['Animation', 'Familie', 'Musik'], 'Lee Unkrich'),
  m('tt3783958', 'La La Land', 2016, ['Romantik', 'Musical', 'Drama'], 'Damien Chazelle'),
  m('tt1392190', 'Mad Max: Fury Road', 2015, ['Action', 'Abenteuer', 'Sci-Fi'], 'George Miller'),
  m('tt2582802', 'Whiplash', 2014, ['Drama', 'Musik'], 'Damien Chazelle'),
  m('tt0816692', 'Interstellar', 2014, ['Sci-Fi', 'Abenteuer', 'Drama'], 'Christopher Nolan'),
  m('tt2278388', 'Grand Budapest Hotel', 2014, ['Komödie', 'Abenteuer', 'Krimi'], 'Wes Anderson'),
  m('tt1375666', 'Inception', 2010, ['Sci-Fi', 'Action', 'Thriller'], 'Christopher Nolan'),
  m('tt0468569', 'The Dark Knight', 2008, ['Action', 'Krimi', 'Drama'], 'Christopher Nolan'),
  m('tt0405094', 'Das Leben der Anderen', 2006, ['Drama', 'Thriller', 'Historie'], 'Florian Henckel von Donnersmarck'),
  m('tt0407887', 'The Departed', 2006, ['Krimi', 'Drama', 'Thriller'], 'Martin Scorsese'),
  m('tt0266543', 'Findet Nemo', 2003, ['Animation', 'Abenteuer', 'Familie'], 'Andrew Stanton'),
  m('tt0317248', 'City of God', 2002, ['Krimi', 'Drama'], 'Fernando Meirelles'),
  m('tt0245429', 'Chihiros Reise ins Zauberland', 2001, ['Animation', 'Fantasy', 'Abenteuer'], 'Hayao Miyazaki'),
  m('tt0211915', 'Die fabelhafte Welt der Amélie', 2001, ['Komödie', 'Romantik'], 'Jean-Pierre Jeunet'),
  m('tt0133093', 'Matrix', 1999, ['Sci-Fi', 'Action'], 'Lana & Lilly Wachowski'),
  m('tt0130827', 'Lola rennt', 1998, ['Thriller', 'Krimi'], 'Tom Tykwer'),
  m('tt0119217', 'Good Will Hunting', 1997, ['Drama', 'Romantik'], 'Gus Van Sant'),
  m('tt0120338', 'Titanic', 1997, ['Drama', 'Romantik'], 'James Cameron'),
  m('tt0114369', 'Sieben', 1995, ['Krimi', 'Mystery', 'Thriller'], 'David Fincher'),
  m('tt0110912', 'Pulp Fiction', 1994, ['Krimi', 'Drama'], 'Quentin Tarantino'),
  m('tt0109830', 'Forrest Gump', 1994, ['Drama', 'Romantik'], 'Robert Zemeckis'),
  m('tt0111161', 'Die Verurteilten', 1994, ['Drama'], 'Frank Darabont'),
  m('tt0081505', 'Shining', 1980, ['Horror', 'Drama'], 'Stanley Kubrick'),
  m('tt0068646', 'Der Pate', 1972, ['Krimi', 'Drama'], 'Francis Ford Coppola'),
];

const CATALOG_BY_ID = new Map(CATALOG.map((x) => [x.id, x]));

export function createMovieService(store, { omdbKey } = {}) {
  const { data } = store;

  function getMovie(id) {
    return CATALOG_BY_ID.get(id) || data.movies.find((x) => x.id === id) || null;
  }

  function allMovies() {
    return [...CATALOG, ...data.movies];
  }

  function cache(movie) {
    const existing = data.movies.find((x) => x.id === movie.id);
    if (existing) {
      Object.assign(existing, Object.fromEntries(Object.entries(movie).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))));
      store.save();
      return existing;
    }
    data.movies.push(movie);
    store.save();
    return movie;
  }

  async function omdb(params) {
    const url = new URL('https://www.omdbapi.com/');
    url.searchParams.set('apikey', omdbKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`OMDb ${res.status}`);
    return res.json();
  }

  function localSearch(q) {
    const needle = q.toLowerCase();
    return allMovies().filter((x) =>
      x.title.toLowerCase().includes(needle) ||
      (x.director || '').toLowerCase().includes(needle) ||
      String(x.year) === needle);
  }

  async function search(q) {
    q = String(q || '').trim();
    if (!q) return allMovies();
    const local = localSearch(q);
    if (!omdbKey) return local;
    try {
      const json = await omdb({ s: q, type: 'movie' });
      const remote = (json.Search || []).map((r) => {
        if (CATALOG_BY_ID.has(r.imdbID)) return CATALOG_BY_ID.get(r.imdbID);
        return cache({
          id: r.imdbID,
          title: r.Title,
          year: parseInt(r.Year, 10) || null,
          genres: [],
          director: null,
          poster: r.Poster && r.Poster !== 'N/A' ? r.Poster : null,
          source: 'imdb',
        });
      });
      const seen = new Set(remote.map((x) => x.id));
      return [...remote, ...local.filter((x) => !seen.has(x.id))];
    } catch {
      return local; // IMDb/OMDb nicht erreichbar -> lokale Ergebnisse
    }
  }

  // Lädt Details (Genres, Regie, Poster, Plot) nach, falls ein API-Key gesetzt ist.
  async function enrich(movie) {
    if (!movie || !omdbKey || !/^tt\d+$/.test(movie.id)) return movie;
    if (movie.plot && movie.poster && movie.genres?.length) return movie;
    try {
      const d = await omdb({ i: movie.id, plot: 'short' });
      if (d.Response === 'False') return movie;
      const details = {
        id: movie.id,
        title: movie.title,
        year: movie.year,
        source: movie.source,
        genres: movie.genres?.length ? movie.genres : mapGenres(d.Genre),
        director: movie.director || (d.Director !== 'N/A' ? d.Director : null),
        poster: movie.poster || (d.Poster && d.Poster !== 'N/A' ? d.Poster : null),
        plot: d.Plot && d.Plot !== 'N/A' ? d.Plot : null,
        imdbRating: d.imdbRating && d.imdbRating !== 'N/A' ? d.imdbRating : null,
      };
      return cache(details);
    } catch {
      return movie;
    }
  }

  function addCustom({ title, year, genres }, userId) {
    const t = title.toLowerCase();
    const dup = allMovies().find((x) => x.title.toLowerCase() === t && (!year || x.year === year));
    if (dup) return dup;
    return cache({
      id: `custom-${store.id().slice(0, 8)}`,
      title,
      year: year || null,
      genres,
      director: null,
      poster: null,
      source: 'custom',
      createdBy: userId,
    });
  }

  return { getMovie, allMovies, search, enrich, addCustom, hasImdb: Boolean(omdbKey) };
}

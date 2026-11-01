// Matching: Wer passt zu mir für einen Kinoabend?
//  - gemeinsame Filme auf der "Will ich im Kino sehen"-Liste (stärkstes Signal)
//  - Überschneidung der Lieblingsgenres (Jaccard-Ähnlichkeit)
//  - gemeinsame Lieblingsfilme
//  - gleiche Stadt (man muss ja ins selbe Kino)

export const normCity = (c) => String(c || '').trim().toLowerCase();

export function scoreMatch(me, other, watchSetOf) {
  const mine = watchSetOf(me.id);
  const theirs = watchSetOf(other.id);
  const sharedWatch = [...mine].filter((id) => theirs.has(id));

  const g1 = new Set(me.genres || []);
  const g2 = new Set(other.genres || []);
  const sharedGenres = [...g1].filter((g) => g2.has(g));
  const union = new Set([...g1, ...g2]).size;
  const genreSim = union ? sharedGenres.length / union : 0;

  const favs = new Set(other.favorites || []);
  const sharedFavorites = (me.favorites || []).filter((f) => favs.has(f));

  const sameCity = Boolean(normCity(me.city)) && normCity(me.city) === normCity(other.city);

  const score =
    (Math.min(sharedWatch.length, 3) / 3) * 45 +
    genreSim * 30 +
    (Math.min(sharedFavorites.length, 2) / 2) * 15 +
    (sameCity ? 10 : 0);

  return {
    score: Math.round(score),
    sharedWatch,
    sharedGenres,
    sharedFavorites,
    sameCity,
  };
}

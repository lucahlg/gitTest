# 🍿 KinoBuddy

**Niemand geht gern alleine ins Kino.** KinoBuddy verbindet Menschen, die denselben Film im Kino sehen wollen oder einen ähnlichen Filmgeschmack haben, damit man vorher und nachher über den Film reden kann.

Im Mittelpunkt stehen **platonische Freundschaften** und neue Kontakte. Wer offen für mehr ist, kann das im Profil angeben („💛 offen für mehr“). Alle anderen sind standardmäßig „🤝 Freundschaft“, und man kann gezielt nur nach Freundschafts-Profilen filtern.

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Profil & Onboarding** | Name, Stadt, Alter, Bio, Lieblingskinos, Lieblingsgenres, bis zu 10 Lieblingsfilme, Absicht (Freundschaft / offen für mehr) |
| **Filme** | Katalog mit echten IMDb-IDs, Suche, „🙋 Will ich im Kino sehen“-Liste, Zähler, wie viele Leute einen Film sehen wollen, IMDb-Link, eigene Filme hinzufügen (für neue Kinostarts) |
| **IMDb-Anbindung** | Optional über die [OMDb API](https://www.omdbapi.com/) (IMDb-Daten): Live-Suche in der IMDb, Poster, Genres, Regie, Handlung und IMDb-Rating |
| **Matching** | Score von 0 bis 100 % aus gemeinsamen Wunschfilmen (45), gemeinsamen Genres (30), gemeinsamen Lieblingsfilmen (15) und derselben Stadt (10) |
| **Kinotreffen** | Treffen mit Film, Kino, Zeit, Treffpunkt und max. Gruppengröße erstellen, beitreten und verlassen, Gruppenchat für alle Teilnehmenden, Absagen durch die Gastgeber:in |
| **Kontakte & Chat** | Verbindungsanfragen (gegenseitige Anfragen verbinden automatisch), Direktnachrichten nur zwischen verbundenen Personen, Badge für Anfragen und ungelesene Nachrichten |
| **Sicherheit** | Blockieren (wirkt in beide Richtungen), Melden, Passwort-Hashing mit scrypt, HttpOnly-Session-Cookies, CSRF-Schutz, Rate-Limit beim Login, strikte Content-Security-Policy, E-Mail-Adressen sind nie öffentlich |

Die Oberfläche ist komplett auf Deutsch und für Desktop und Smartphone ausgelegt (auf dem Handy mit Navigation unten).

## Schnellstart

Du brauchst nur **Node.js ≥ 20**. Es gibt keine Abhängigkeiten und kein `npm install`.

```bash
npm start
# → http://localhost:3000
```

Beim ersten Start werden Demo-Daten angelegt (10 Personen in Berlin, Hamburg, München und Köln mit Kinotreffen). Zum Ausprobieren:

- **E-Mail:** `lena@demo.kinobuddy.de` (oder `jonas@`, `aylin@`, `sophie@` … `@demo.kinobuddy.de`)
- **Passwort:** `kino1234`

### IMDb-Anbindung aktivieren

1. Kostenlosen API-Key auf https://www.omdbapi.com/apikey.aspx holen
2. Starten mit:

```bash
OMDB_API_KEY=dein_key npm start
```

Ohne Key läuft die App mit dem eingebauten Filmkatalog. Ist die OMDb-API nicht erreichbar, nutzt die App automatisch wieder den lokalen Katalog.

### Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `DB_FILE` | `./data/db.json` | Speicherort der Daten |
| `OMDB_API_KEY` | – | aktiviert die IMDb-Suche |
| `NO_SEED` | – | `1` = keine Demo-Daten beim ersten Start |
| `SECURE_COOKIES` | – | `1` = Cookies nur über HTTPS (für Produktion) |

## Entwicklung

```bash
npm run dev    # Neustart bei Dateiänderungen
npm test       # API-Tests (node:test)
npm run seed   # Datenbank zurücksetzen und Demo-Daten neu anlegen
```

### Aufbau

```
server.js          Einstiegspunkt (Server starten, Demo-Daten)
src/app.js         HTTP-Server, REST-API, Auslieferung der statischen Dateien
src/store.js       JSON-Dateispeicher (leicht gegen Postgres o. ä. austauschbar)
src/auth.js        Passwort-Hashing, Sessions, Rate-Limiter
src/movies.js      Filmkatalog und IMDb-/OMDb-Anbindung
src/matching.js    Match-Score
src/seed.js        Demo-Daten
public/            Frontend (Vanilla JS als Single-Page-App, ohne Build-Schritt)
test/              API-Tests
```

### Ideen für danach

- Kinoprogramme einbinden, damit Spielzeiten automatisch vorgeschlagen werden
- Push- und E-Mail-Benachrichtigungen
- Verifizierte Profile und Moderations-Dashboard für Meldungen
- Bewertungen nach dem Kinoabend („Würde wieder mit X ins Kino gehen“)
- Echte Datenbank und WebSockets für Chats, sobald mehr los ist

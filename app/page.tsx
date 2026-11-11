import styles from "./page.module.css";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "search", label: "Search" },
  { id: "profile", label: "Profile" },
  { id: "images", label: "Images" },
  { id: "steam", label: "Steam" },
  { id: "lists", label: "Lists" },
  { id: "seasons", label: "Seasons" },
  { id: "charts", label: "Charts" },
  { id: "schema", label: "Media schema" },
  { id: "caching", label: "Caching" },
  { id: "errors", label: "Errors" },
];

const SEARCH_PARAMS = [
  { name: "q", type: "string", required: true, description: "Search text, 1–100 characters. Leading and trailing whitespace is trimmed." },
  { name: "limit", type: "integer", required: false, description: "Results per type. Defaults to 5, clamped between 1 and 10." },
  { name: "adult", type: "boolean", required: false, description: "Set to true to include 18+ titles. They are excluded by default." },
];

const PROFILE_PARAMS = [
  { name: "type", type: "string", required: true, description: "One of anime, manga or game." },
  { name: "id", type: "integer", required: true, description: "The sourceId of a search result: the MyAnimeList id for anime and manga, the IGDB id for games." },
];

const PROFILE_QUERY_PARAMS = [
  { name: "adult", type: "boolean", required: false, description: "Set to true to allow 18+ titles. Without it, they return 403 and are not saved." },
];

const IMAGE_PARAMS = [
  { name: "type", type: "string", required: true, description: "One of anime, manga or game." },
  { name: "id", type: "integer", required: true, description: "The sourceId of a search result: the MyAnimeList id for anime and manga, the IGDB id for games." },
  { name: "image", type: "string", required: true, description: "cover or banner." },
];

const STEAM_PARAMS = [
  { name: "ids", type: "string", required: true, description: "1 to 200 comma-separated Steam app ids." },
];

const LIST_PARAMS = [
  { name: "type", type: "string", required: true, description: "One of anime, manga or game." },
  { name: "list", type: "string", required: true, description: "One of trending, season, top or upcoming." },
];

const LIST_QUERY_PARAMS = [
  { name: "adult", type: "boolean", required: false, description: "Set to true to include 18+ titles. They are excluded by default, and each version is cached separately." },
];

const LISTS = [
  { list: "trending", anime: "Trending right now.", manga: "Trending right now.", game: "Most visited right now." },
  { list: "season", anime: "This season's anime, most popular first.", manga: "Series that started in the last 6 months and are still running, most popular first.", game: "Released in the last 90 days, most anticipated first." },
  { list: "top", anime: "Highest rated of all time.", manga: "Highest rated of all time.", game: "Highest rated of all time, from games with at least 300 ratings." },
  { list: "upcoming", anime: "Not yet released, most popular first.", manga: "Not yet released, most popular first.", game: "Not yet released, most anticipated first." },
];

const SEASON_PARAMS = [
  { name: "type", type: "string", required: true, description: "One of anime, manga or game." },
  { name: "season", type: "string", required: true, description: "A year and season such as 2027-winter. Seasons follow the calendar in UTC: winter is January to March, spring April to June, summer July to September and fall October to December. Only the previous, current and next season are available; any other returns 404." },
];

const SEASONS = [
  { type: "anime", contents: "Anime of that season, most popular first." },
  { type: "manga", contents: "Manga that start publishing during the season, most popular first. Titles with only a start year are left out." },
  { type: "game", contents: "Games released during the season, most anticipated first. Games with only a release year, or no date yet, are left out." },
];

const SEASON_FIELDS = [
  { name: "type", type: '"ANIME" | "MANGA" | "GAME"', description: "Media type of the season." },
  { name: "season", type: '"winter" | "spring" | "summer" | "fall"', description: "The season." },
  { name: "year", type: "number", description: "The year of the season." },
  { name: "startsAt", type: "string", description: "ISO date the season starts, the first of its first month at 00:00 UTC." },
  { name: "endsAt", type: "string", description: "ISO date the season ends, the first day of the next season at 00:00 UTC." },
  { name: "items", type: "object[]", description: "Up to 20 titles, in the same shape as list items." },
  { name: "updatedAt", type: "string", description: "ISO date the current copy was made." },
];

const CHART_PARAMS = [
  { name: "type", type: "string", required: true, description: "One of anime, manga or game." },
];

const CHART_QUERY_PARAMS = [
  { name: "week", type: "string", required: false, description: "An ISO week such as 2026-W46. Weeks start on Monday at 00:00 UTC. Defaults to the current week." },
  { name: "adult", type: "boolean", required: false, description: "Set to true to include 18+ titles. They are excluded by default, and each version is a separate chart." },
];

const CHARTS = [
  { type: "anime", ranking: "Trending titles that are currently airing." },
  { type: "manga", ranking: "Trending titles that are currently publishing." },
  { type: "game", ranking: "The most visited games, as in the trending list." },
];

const CHART_FIELDS = [
  { name: "type", type: '"ANIME" | "MANGA" | "GAME"', description: "Media type of the chart." },
  { name: "week", type: "string", description: "The ISO week of the chart, e.g. 2026-W46." },
  { name: "startsAt", type: "string", description: "ISO date the week starts, Monday 00:00 UTC." },
  { name: "endsAt", type: "string", description: "ISO date the week ends, the next Monday 00:00 UTC." },
  { name: "previousWeek", type: "string | null", description: "The nearest earlier week with a saved chart, or null." },
  { name: "nextWeek", type: "string | null", description: "The nearest later week with a saved chart, or null." },
  { name: "entries[].rank", type: "number", description: "Position on the chart, starting at 1." },
  { name: "entries[].previousRank", type: "number | null", description: "Position on the previous saved chart, or null if the title wasn't on it." },
  { name: "entries[].movement", type: '"up" | "down" | "same" | "new"', description: "How the title moved since the previous saved chart." },
  { name: "entries[].weeksOnChart", type: "number", description: "Saved charts in a row the title has been on, counting this one." },
  { name: "entries[].peak", type: "number", description: "The title's best position on any saved chart." },
  { name: "entries[].media", type: "object", description: "The title, in the same shape as list items." },
  { name: "updatedAt", type: "string", description: "ISO date the chart was built." },
];

const SCHEMA_FIELDS = [
  { name: "id", type: "string", description: "Type and source id joined, e.g. ANIME_52991. Also the Firestore document id." },
  { name: "type", type: '"ANIME" | "MANGA" | "GAME"', description: "Media type." },
  { name: "sourceId", type: "string", description: "MyAnimeList id for anime and manga, IGDB id for games." },
  { name: "title", type: "string", description: "Primary title." },
  { name: "altTitles", type: "string[]", description: "Other known titles." },
  { name: "synopsis", type: "string | null", description: "Plot summary or description." },
  { name: "coverImage", type: "string | null", description: "Cover art URL." },
  { name: "bannerImage", type: "string | null", description: "Wide banner or artwork URL." },
  { name: "year", type: "number | null", description: "Year of first release." },
  { name: "status", type: "string | null", description: "Release status as reported by the provider." },
  { name: "genres", type: "string[]", description: "Genres and themes." },
  { name: "score", type: "number | null", description: "Rating normalized to 0–10." },
  { name: "isAdult", type: "boolean", description: "Whether the title is 18+. Only true when adult=true was passed." },
  { name: "source", type: "{ provider, url }", description: "myanimelist for anime and manga or igdb for games, with a link to the title's page there." },
  { name: "details", type: "object", description: "Type-specific fields, listed below." },
  { name: "createdAt", type: "string", description: "Profile only. ISO date the item was first saved." },
  { name: "updatedAt", type: "string", description: "Profile only. ISO date the item was last refreshed." },
];

const DETAILS = [
  { type: "ANIME", fields: "format, episodes, duration, season, studios, airedFrom, airedFromPrecision, airedTo" },
  { type: "MANGA", fields: "format, chapters, volumes, authors, publishedFrom, publishedFromPrecision, publishedTo" },
  { type: "GAME", fields: "platforms, developers, publishers, releaseDate, releaseDatePrecision, steamUrl (the Steam store page, or null when the game isn't on Steam)" },
];

const ERRORS = [
  { status: "400", when: "Search was called without q, q is longer than 100 characters, or Steam was called without valid ids." },
  { status: "403", when: "An 18+ title was requested without adult=true. The body is { \"error\": \"Adult content\" }." },
  { status: "404", when: "Unknown type, list or image, non-numeric id, no item with that id, an item without that image, or a chart week that is malformed, in the future or was never saved." },
  { status: "429", when: "More than 60 requests in a minute from the same address, or 300 for images. The Retry-After header says how many seconds to wait." },
  { status: "502", when: "The provider or database failed and no saved copy could be returned." },
];

const IMAGE_RESPONSE = `HTTP/2 302
location: https://…/media/ANIME_52991/cover-….webp
cache-control: public, max-age=3600`;

const SEARCH_RESPONSE = `{
  "query": "frieren",
  "results": {
    "anime": [
      {
        "id": "ANIME_52991",
        "type": "ANIME",
        "sourceId": "52991",
        "title": "Sousou no Frieren",
        "altTitles": ["Frieren: Beyond Journey's End"],
        "coverImage": "https://…/cover.jpg",
        "bannerImage": "https://…/banner.jpg",
        "year": 2023,
        "score": 9.1,
        "isAdult": false,
        "source": { "provider": "myanimelist", "url": "https://myanimelist.net/anime/52991" },
        "details": { "format": "TV", "episodes": 28, … }
      }
    ],
    "manga": [ … ],
    "game": [ … ]
  }
}`;

const PARTIAL_RESPONSE = `{
  "query": "frieren",
  "results": { "anime": [ … ], "manga": [ … ], "game": [] },
  "errors": { "game": "Search failed" }
}`;

const STEAM_RESPONSE = `{
  "results": {
    "367520": {
      "id": "GAME_14593",
      "type": "GAME",
      "sourceId": "14593",
      "title": "Hollow Knight",
      "coverImage": "https://images.igdb.com/…/co93cr.jpg",
      "year": 2017,
      "isAdult": false
    }
  }
}`;

const LIST_RESPONSE = `{
  "type": "ANIME",
  "list": "top",
  "items": [
    {
      "id": "ANIME_52991",
      "type": "ANIME",
      "sourceId": "52991",
      "title": "Sousou no Frieren",
      "score": 9.1,
      …
    },
    …
  ],
  "updatedAt": "2026-10-31T08:00:00.000Z"
}`;

const SEASON_RESPONSE = `{
  "type": "ANIME",
  "season": "winter",
  "year": 2027,
  "startsAt": "2027-01-01T00:00:00.000Z",
  "endsAt": "2027-04-01T00:00:00.000Z",
  "items": [
    {
      "id": "ANIME_61338",
      "type": "ANIME",
      "sourceId": "61338",
      "title": "Shangri-La Frontier 3rd Season",
      …
    },
    …
  ],
  "updatedAt": "2026-11-11T08:00:00.000Z"
}`;

const CHART_RESPONSE = `{
  "type": "ANIME",
  "week": "2026-W46",
  "startsAt": "2026-11-09T00:00:00.000Z",
  "endsAt": "2026-11-16T00:00:00.000Z",
  "previousWeek": "2026-W45",
  "nextWeek": null,
  "entries": [
    {
      "rank": 1,
      "previousRank": 3,
      "movement": "up",
      "weeksOnChart": 6,
      "peak": 1,
      "media": {
        "id": "ANIME_52991",
        "type": "ANIME",
        "sourceId": "52991",
        "title": "Sousou no Frieren",
        …
      }
    },
    …
  ],
  "updatedAt": "2026-11-09T08:00:00.000Z"
}`;

const PROFILE_RESPONSE = `{
  "id": "ANIME_52991",
  "type": "ANIME",
  "title": "Sousou no Frieren",
  …
  "createdAt": "2026-10-10T08:00:00.000Z",
  "updatedAt": "2026-10-10T08:00:00.000Z"
}`;

function Params({ rows }: { rows: { name: string; type: string; required: boolean; description: string }[] }) {
  return (
    <dl className={styles.fields}>
      {rows.map((row) => (
        <div key={row.name} className={styles.field}>
          <dt>
            <code className={styles.name}>{row.name}</code>
            <span className={styles.type}>{row.type}</span>
            {row.required && <span className={styles.required}>required</span>}
          </dt>
          <dd>{row.description}</dd>
        </div>
      ))}
    </dl>
  );
}

function Endpoint({ path }: { path: string }) {
  return (
    <p className={styles.endpoint}>
      <span className={styles.method}>GET</span>
      <code>{path}</code>
    </p>
  );
}

function Example({ label, children }: { label: string; children: string }) {
  return (
    <figure className={styles.example}>
      <figcaption>{label}</figcaption>
      <pre>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

export default function Home() {
  return (
    <div className={styles.page}>
      <nav className={styles.toc} aria-label="Sections">
        <p className={styles.brand}>Library API</p>
        <ol>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <main className={styles.main}>
        <header id="overview" className={styles.header}>
          <p className={styles.eyebrow}>Reference</p>
          <h1>Library API</h1>
          <p className={styles.lead}>
            Search anime, manga and games from one endpoint, then fetch any result as a profile
            that follows the same schema.
          </p>
          <p className={styles.note}>
            The API is public and read-only. All endpoints accept <code>GET</code> only and return
            JSON, except images, which redirect to the image file. Each address can make 60
            requests a minute, plus 300 a minute for images.
          </p>
        </header>

        <section id="search" className={styles.section}>
          <h2>Search</h2>
          <Endpoint path="/api/search?q={text}&limit={n}" />
          <p>
            Searches every media type at once and returns a separate list for each. Anime and manga
            without a MyAnimeList id are left out. Searching does not save anything.
          </p>

          <h3>Query parameters</h3>
          <Params rows={SEARCH_PARAMS} />

          <h3>Example</h3>
          <Example label="Request">{"curl '/api/search?q=frieren&limit=3'"}</Example>
          <Example label="Response">{SEARCH_RESPONSE}</Example>

          <h3>Partial results</h3>
          <p>
            Each provider is searched independently. If one fails, the other lists are still
            returned, the failed list is empty, and an <code>errors</code> object names the type
            that failed. Partial responses are only cached for a minute.
          </p>
          <Example label="Response with a failed provider">{PARTIAL_RESPONSE}</Example>
        </section>

        <section id="profile" className={styles.section}>
          <h2>Profile</h2>
          <Endpoint path="/api/{type}/{id}" />
          <p>
            Returns a single item. The first request for an item fetches it from the provider and
            saves it to Firestore. Later requests are served from the saved copy, which is
            refreshed once it is older than 30 days.
          </p>

          <h3>Path parameters</h3>
          <Params rows={PROFILE_PARAMS} />

          <h3>Query parameters</h3>
          <Params rows={PROFILE_QUERY_PARAMS} />

          <h3>Example</h3>
          <Example label="Request">{"curl /api/anime/52991"}</Example>
          <Example label="Response">{PROFILE_RESPONSE}</Example>

          <p className={styles.note}>
            Use the <code>type</code> and <code>sourceId</code> of a search result to build the
            profile URL, e.g. <code>ANIME</code> and <code>52991</code> become{" "}
            <code>/api/anime/52991</code>.
          </p>
        </section>

        <section id="images" className={styles.section}>
          <h2>Images</h2>
          <Endpoint path="/api/{type}/{id}/{image}" />
          <p>
            Redirects to the current cover or banner of a single item. Image files get a new
            address whenever they change, and the old file is deleted, so save this URL instead of
            the <code>coverImage</code> or <code>bannerImage</code> of a profile. The item is loaded
            the same way as its profile.
          </p>

          <h3>Path parameters</h3>
          <Params rows={IMAGE_PARAMS} />

          <h3>Query parameters</h3>
          <Params rows={PROFILE_QUERY_PARAMS} />

          <h3>Example</h3>
          <Example label="Request">{"curl -I /api/anime/52991/cover"}</Example>
          <Example label="Response">{IMAGE_RESPONSE}</Example>
        </section>

        <section id="steam" className={styles.section}>
          <h2>Steam</h2>
          <Endpoint path="/api/steam?ids={appids}" />
          <p>
            Matches Steam app ids to games. Each match has the <code>type</code> and{" "}
            <code>sourceId</code> to load the full game from the profile endpoint. When a Steam id
            belongs to several games, the main game wins over editions, bundles and DLC. Ids with
            no match are left out. Matching does not save anything.
          </p>

          <h3>Query parameters</h3>
          <Params rows={STEAM_PARAMS} />

          <h3>Example</h3>
          <Example label="Request">{"curl '/api/steam?ids=367520,999999999'"}</Example>
          <Example label="Response">{STEAM_RESPONSE}</Example>

          <p className={styles.note}>
            18+ games are matched like any other. Loading one still needs <code>adult=true</code>.
          </p>
        </section>

        <section id="lists" className={styles.section}>
          <h2>Lists</h2>
          <Endpoint path="/api/lists/{type}/{list}" />
          <p>
            Returns up to 20 titles for a ready-made list, such as what&apos;s trending or the
            highest rated. Items follow the media schema, so any of them can be opened with the
            profile endpoint. Anime and manga without a MyAnimeList id are left out, so a list can
            have fewer than 20 titles or none. Every title in a list is saved as a profile, and its
            covers and banners point at the library&apos;s own copies.
          </p>

          <h3>Path parameters</h3>
          <Params rows={LIST_PARAMS} />

          <h3>Query parameters</h3>
          <Params rows={LIST_QUERY_PARAMS} />

          <h3>What each list contains</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">List</th>
                <th scope="col">Anime</th>
                <th scope="col">Manga</th>
                <th scope="col">Game</th>
              </tr>
            </thead>
            <tbody>
              {LISTS.map((row) => (
                <tr key={row.list}>
                  <td>
                    <code className={styles.name}>{row.list}</code>
                  </td>
                  <td>{row.anime}</td>
                  <td>{row.manga}</td>
                  <td>{row.game}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Example</h3>
          <Example label="Request">{"curl /api/lists/anime/top"}</Example>
          <Example label="Response">{LIST_RESPONSE}</Example>

          <p className={styles.note}>
            Lists are rebuilt from the provider once a day. <code>updatedAt</code> says when the
            current copy was made.
          </p>
        </section>

        <section id="seasons" className={styles.section}>
          <h2>Seasons</h2>
          <Endpoint path="/api/seasons/{type}/{season}" />
          <p>
            Returns up to 20 titles that start in a season, for this season&apos;s lineup or a look
            at what&apos;s coming next. Items follow the media schema, so any of them can be opened
            with the profile endpoint. Every title is saved as a profile, and its covers and banners
            point at the library&apos;s own copies.
          </p>

          <h3>Path parameters</h3>
          <Params rows={SEASON_PARAMS} />

          <h3>Query parameters</h3>
          <Params rows={LIST_QUERY_PARAMS} />

          <h3>What each season contains</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Titles</th>
              </tr>
            </thead>
            <tbody>
              {SEASONS.map((row) => (
                <tr key={row.type}>
                  <td>
                    <code className={styles.name}>{row.type}</code>
                  </td>
                  <td>{row.contents}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Fields</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {SEASON_FIELDS.map((field) => (
                <tr key={field.name}>
                  <td>
                    <code className={styles.name}>{field.name}</code>
                  </td>
                  <td className={styles.type}>{field.type}</td>
                  <td>{field.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Example</h3>
          <Example label="Request">{"curl /api/seasons/anime/2027-winter"}</Example>
          <Example label="Response">{SEASON_RESPONSE}</Example>

          <p className={styles.note}>
            Seasons are rebuilt from the provider once a day, like lists. <code>updatedAt</code>{" "}
            says when the current copy was made.
          </p>
        </section>

        <section id="charts" className={styles.section}>
          <h2>Charts</h2>
          <Endpoint path="/api/charts/{type}?week={week}" />
          <p>
            Returns the weekly chart for a type: up to 20 titles ranked by what&apos;s trending
            that week, with how each one moved since the previous chart. Items follow the media
            schema, so any of them can be opened with the profile endpoint.
          </p>
          <p>
            The first request of a week builds that week&apos;s chart and saves it, and the saved
            chart never changes after that. Movement compares against the most recent earlier
            saved chart, which can be more than a week old if no chart was requested in between.
            Past weeks that were never saved are not built afterwards. Every title on a chart is
            saved as a profile when the chart is built, and its covers and banners point at the
            library&apos;s own copies, so they keep working for past weeks.
          </p>

          <h3>Path parameters</h3>
          <Params rows={CHART_PARAMS} />

          <h3>Query parameters</h3>
          <Params rows={CHART_QUERY_PARAMS} />

          <h3>How each chart is ranked</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Ranking</th>
              </tr>
            </thead>
            <tbody>
              {CHARTS.map((row) => (
                <tr key={row.type}>
                  <td>
                    <code className={styles.name}>{row.type}</code>
                  </td>
                  <td>{row.ranking}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Fields</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {CHART_FIELDS.map((field) => (
                <tr key={field.name}>
                  <td>
                    <code className={styles.name}>{field.name}</code>
                  </td>
                  <td className={styles.type}>{field.type}</td>
                  <td>{field.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Example</h3>
          <Example label="Request">{"curl '/api/charts/anime?week=2026-W46'"}</Example>
          <Example label="Response">{CHART_RESPONSE}</Example>
        </section>

        <section id="schema" className={styles.section}>
          <h2>Media schema</h2>
          <p>Search results and profiles share the same shape for every type.</p>

          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {SCHEMA_FIELDS.map((field) => (
                <tr key={field.name}>
                  <td>
                    <code className={styles.name}>{field.name}</code>
                  </td>
                  <td className={styles.type}>{field.type}</td>
                  <td>{field.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Details by type</h3>
          <p>
            Each start or release date comes with a precision: <code>day</code>,{" "}
            <code>month</code>, <code>quarter</code> (games only) or <code>year</code>, or{" "}
            <code>null</code> when there&apos;s no date or it hasn&apos;t been decided. A date known
            only to the month or year is saved as its first day, or as the provider&apos;s
            placeholder for games, so check the precision before showing the day.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Fields</th>
              </tr>
            </thead>
            <tbody>
              {DETAILS.map((row) => (
                <tr key={row.type}>
                  <td>
                    <code className={styles.name}>{row.type}</code>
                  </td>
                  <td className={styles.type}>{row.fields}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="caching" className={styles.section}>
          <h2>Caching</h2>
          <ul className={styles.list}>
            <li>
              <strong>Search and Steam, 7 days.</strong> Results are cached in Redis. Search ignores
              letter case, so <code>q=Naruto</code> and <code>q=naruto</code> share a result, and
              Steam app ids are cached one by one, including ids with no match. A search where any
              provider failed is not cached.
            </li>
            <li>
              <strong>Profiles, 30 days.</strong> Profiles are saved to Firestore. Once the saved
              copy is older than 30 days, it is still returned right away and a fresh copy is
              fetched from the provider in the background for the next request.
            </li>
            <li>
              <strong>Lists and seasons, 1 day.</strong> Each list and season is saved to
              Firestore and rebuilt from the provider once the saved copy is a day old. If the
              provider is unavailable, the older copy is returned.
            </li>
            <li>
              <strong>Charts, until the week ends.</strong> Each week&apos;s chart is saved to
              Firestore on the first request of the week and is never rebuilt. The current week is
              cached until it ends. A past week is cached for 7 days once a later chart exists, and
              until the current week ends before that. If the provider is unavailable, nothing is
              saved or cached, so a later request tries again.
            </li>
            <li>
              <strong>Images, 1 hour.</strong> Browsers keep each redirect for an hour, then ask
              again in case the image has changed.
            </li>
          </ul>
          <p>
            Every response also sends a <code>Cache-Control</code> header, so browsers and any CDN in
            front of the API can keep it for the same time.
          </p>
        </section>

        <section id="errors" className={styles.section}>
          <h2>Errors</h2>
          <p>
            Errors return a JSON body of the form <code>{'{ "error": "…" }'}</code>.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((row) => (
                <tr key={row.status}>
                  <td>
                    <code className={styles.name}>{row.status}</code>
                  </td>
                  <td>{row.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

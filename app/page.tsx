import styles from "./page.module.css";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "search", label: "Search" },
  { id: "profile", label: "Profile" },
  { id: "steam", label: "Steam" },
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
  { name: "id", type: "integer", required: true, description: "The sourceId of a search result." },
];

const PROFILE_QUERY_PARAMS = [
  { name: "adult", type: "boolean", required: false, description: "Set to true to allow 18+ titles. Without it, they return 403 and are not saved." },
];

const STEAM_PARAMS = [
  { name: "ids", type: "string", required: true, description: "1 to 200 comma-separated Steam app ids." },
];

const SCHEMA_FIELDS = [
  { name: "id", type: "string", description: "Type and source id joined, e.g. ANIME_154587. Also the Firestore document id." },
  { name: "type", type: '"ANIME" | "MANGA" | "GAME"', description: "Media type." },
  { name: "sourceId", type: "string", description: "Id at the source provider." },
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
  { name: "source", type: "{ provider, url }", description: "The data provider and a link to the original page." },
  { name: "details", type: "object", description: "Type-specific fields, listed below." },
  { name: "createdAt", type: "string", description: "Profile only. ISO date the item was first saved." },
  { name: "updatedAt", type: "string", description: "Profile only. ISO date the item was last refreshed." },
];

const DETAILS = [
  { type: "ANIME", fields: "malId, format, episodes, duration, season, studios, airedFrom, airedTo" },
  { type: "MANGA", fields: "malId, format, chapters, volumes, authors, publishedFrom, publishedTo" },
  { type: "GAME", fields: "platforms, developers, publishers, releaseDate" },
];

const ERRORS = [
  { status: "400", when: "Search was called without q, q is longer than 100 characters, or Steam was called without valid ids." },
  { status: "403", when: "An 18+ title was requested without adult=true. The body is { \"error\": \"Adult content\" }." },
  { status: "404", when: "Unknown type, non-numeric id, or no item with that id." },
  { status: "502", when: "The provider or database failed and no saved copy could be returned." },
];

const SEARCH_RESPONSE = `{
  "query": "frieren",
  "results": {
    "anime": [
      {
        "id": "ANIME_154587",
        "type": "ANIME",
        "sourceId": "154587",
        "title": "Sousou no Frieren",
        "altTitles": ["Frieren: Beyond Journey's End"],
        "coverImage": "https://…/cover.jpg",
        "bannerImage": "https://…/banner.jpg",
        "year": 2023,
        "score": 9.1,
        "isAdult": false,
        "source": { "provider": "…", "url": "https://…" },
        "details": { "malId": 52991, "format": "TV", "episodes": 28, … }
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

const PROFILE_RESPONSE = `{
  "id": "ANIME_154587",
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
            The API is public and read-only. All endpoints return JSON and accept <code>GET</code>{" "}
            only.
          </p>
        </header>

        <section id="search" className={styles.section}>
          <h2>Search</h2>
          <Endpoint path="/api/search?q={text}&limit={n}" />
          <p>
            Searches every media type at once and returns a separate list for each. Searching does
            not save anything.
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
          <Example label="Request">{"curl /api/anime/154587"}</Example>
          <Example label="Response">{PROFILE_RESPONSE}</Example>

          <p className={styles.note}>
            Use the <code>type</code> and <code>sourceId</code> of a search result to build the
            profile URL, e.g. <code>ANIME</code> and <code>154587</code> become{" "}
            <code>/api/anime/154587</code>.
          </p>
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
          <p>There are two layers of caching.</p>
          <ul className={styles.list}>
            <li>
              <strong>CDN, 7 days.</strong> Successful responses are cached at the edge for 7 days,
              keyed by the full URL. Note that <code>q=Naruto</code> and <code>q=naruto</code> are
              cached separately.
            </li>
            <li>
              <strong>Firestore, 30 days.</strong> Profiles are refreshed from the provider once the
              saved copy is older than 30 days. If the provider is unavailable, the older copy is
              returned instead.
            </li>
          </ul>
          <p>Data can therefore be up to about 37 days old.</p>
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

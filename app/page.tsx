import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatScore, mediaPath } from "@/lib/format";
import { searchAll } from "@/lib/search";
import type { Media, MediaSegment } from "@/lib/types";
import styles from "./page.module.css";

const RESULT_LIMIT = 10;
const MAX_QUERY_LENGTH = 100;

const SECTIONS: { segment: MediaSegment; label: string }[] = [
  { segment: "anime", label: "Anime" },
  { segment: "manga", label: "Manga" },
  { segment: "game", label: "Games" },
];

function SearchForm({ query }: { query: string }) {
  return (
    <Form action="/" className={styles.form} role="search">
      <label htmlFor="q" className={styles.label}>
        Search anime, manga and games
      </label>
      <div className={styles.field}>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Try “frieren” or “zelda”"
          maxLength={MAX_QUERY_LENGTH}
          required
          className={styles.input}
        />
        <button type="submit" className={styles.button}>
          Search
        </button>
      </div>
    </Form>
  );
}

function MediaCard({ media }: { media: Media }) {
  const meta = [media.year, media.score !== null ? formatScore(media.score) : null].filter(
    (value) => value !== null,
  );

  return (
    <li>
      <Link href={mediaPath(media)} className={styles.card}>
        <div className={styles.cover}>
          {media.coverImage && (
            <Image src={media.coverImage} alt="" fill sizes="180px" className={styles.coverImage} />
          )}
        </div>
        <p className={styles.title}>{media.title}</p>
        {meta.length > 0 && <p className={styles.meta}>{meta.join(" · ")}</p>}
      </Link>
    </li>
  );
}

async function Results({ query }: { query: string }) {
  await connection();

  const { results, errors } = await searchAll(query, RESULT_LIMIT);

  return SECTIONS.map(({ segment, label }) => (
    <section key={segment} className={styles.section} aria-labelledby={`${segment}-heading`}>
      <h2 id={`${segment}-heading`} className={styles.heading}>
        {label}
        <span className={styles.count}>{results[segment].length}</span>
      </h2>
      {errors[segment] ? (
        <p className={styles.empty}>Couldn’t load {label.toLowerCase()} right now. Try again later.</p>
      ) : results[segment].length === 0 ? (
        <p className={styles.empty}>No {label.toLowerCase()} found.</p>
      ) : (
        <ul className={styles.grid}>
          {results[segment].map((media) => (
            <MediaCard key={media.id} media={media} />
          ))}
        </ul>
      )}
    </section>
  ));
}

function ResultsSkeleton() {
  return SECTIONS.map(({ segment, label }) => (
    <section key={segment} className={styles.section} aria-busy="true">
      <h2 className={styles.heading}>{label}</h2>
      <ul className={styles.grid}>
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index}>
            <div className={styles.cover} />
            <div className={styles.skeletonLine} />
          </li>
        ))}
      </ul>
    </section>
  ));
}

async function Search({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim().slice(0, MAX_QUERY_LENGTH);

  return (
    <>
      <SearchForm query={query} />
      {query ? (
        <Suspense key={query} fallback={<ResultsSkeleton />}>
          <Results query={query} />
        </Suspense>
      ) : (
        <p className={styles.hint}>
          Results are grouped by type. Open any title to see its full profile.
        </p>
      )}
    </>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/">) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<SearchForm query="" />}>
        <Search searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

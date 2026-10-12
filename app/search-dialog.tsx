"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatScore, mediaPath } from "@/lib/format";
import type { Media, MediaSegment } from "@/lib/types";
import styles from "./search-dialog.module.css";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 5;

const SECTIONS: { segment: MediaSegment; label: string }[] = [
  { segment: "anime", label: "Anime" },
  { segment: "manga", label: "Manga" },
  { segment: "game", label: "Games" },
];

type SearchResponse =
  | {
      query: string;
      results: Record<MediaSegment, Media[]>;
      errors?: Partial<Record<MediaSegment, string>>;
    }
  | { query: string; failed: true };

function ResultItem({ media, onSelect }: { media: Media; onSelect: () => void }) {
  const meta = [media.year, media.score !== null ? formatScore(media.score) : null].filter(
    (value) => value !== null,
  );

  return (
    <li>
      <Link href={mediaPath(media)} className={styles.result} onClick={onSelect}>
        <span className={styles.thumb}>
          {media.coverImage && (
            <Image src={media.coverImage} alt="" fill sizes="40px" className={styles.thumbImage} />
          )}
        </span>
        <span className={styles.resultText}>
          <span className={styles.resultTitle}>{media.title}</span>
          {meta.length > 0 && <span className={styles.resultMeta}>{meta.join(" · ")}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function SearchDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const trimmed = query.trim();

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialogRef.current?.showModal();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed, limit: String(RESULT_LIMIT) });
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });

        if (!res.ok) {
          throw new Error(`Search failed with status ${res.status}`);
        }

        setResponse(await res.json());
      } catch {
        if (!controller.signal.aborted) {
          setResponse({ query: trimmed, failed: true });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed]);

  const current = response?.query === trimmed ? response : null;

  function renderBody() {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return <p className={styles.status}>Type at least {MIN_QUERY_LENGTH} characters to search.</p>;
    }

    if (!current) {
      return <p className={styles.status}>Searching…</p>;
    }

    if ("failed" in current) {
      return <p className={styles.status}>Search isn’t available right now. Try again later.</p>;
    }

    const total = SECTIONS.reduce((sum, { segment }) => sum + current.results[segment].length, 0);

    if (total === 0 && !current.errors) {
      return <p className={styles.status}>No results for “{trimmed}”.</p>;
    }

    return SECTIONS.map(({ segment, label }) => {
      const items = current.results[segment];
      const failed = current.errors?.[segment];

      if (items.length === 0 && !failed) {
        return null;
      }

      return (
        <section key={segment} className={styles.section} aria-label={label}>
          <h3 className={styles.sectionHeading}>{label}</h3>
          {failed ? (
            <p className={styles.status}>Couldn’t load {label.toLowerCase()} right now.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((media) => (
                <ResultItem key={media.id} media={media} onSelect={close} />
              ))}
            </ul>
          )}
        </section>
      );
    });
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={open}>
        Search
        <kbd className={styles.shortcut}>⌘K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label="Search"
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            close();
          }
        }}
      >
        <div className={styles.panel}>
          <div className={styles.field}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search anime, manga and games"
              aria-label="Search anime, manga and games"
              maxLength={100}
              className={styles.input}
            />
            <button type="button" className={styles.close} onClick={close}>
              Esc
            </button>
          </div>
          <div className={styles.body} aria-live="polite">
            {renderBody()}
          </div>
        </div>
      </dialog>
    </>
  );
}

import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatDate, formatScore, humanize } from "@/lib/format";
import { AdultContentError, NotFoundError } from "@/lib/http";
import { getOrFetchMedia } from "@/lib/media";
import { toMediaType, type Media, type MediaType, type StoredMedia } from "@/lib/types";
import styles from "./page.module.css";

const TYPE_LABELS: Record<MediaType, string> = {
  ANIME: "Anime",
  MANGA: "Manga",
  GAME: "Game",
};

function text(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value.length > 0 ? value : null;
}

function list(value: unknown): string | null {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : null;
}

function dateRange(from: unknown, to: unknown): string | null {
  if (typeof from !== "string") {
    return null;
  }

  return typeof to === "string" ? `${formatDate(from)} – ${formatDate(to)}` : formatDate(from);
}

function detailRows(media: Media): [string, string | null][] {
  const details = media.details;

  if (media.type === "ANIME") {
    const season = text(details.season);

    return [
      ["Format", text(details.format) && humanize(String(details.format))],
      ["Episodes", text(details.episodes)],
      ["Duration", text(details.duration)],
      ["Season", season && media.year ? `${humanize(season)} ${media.year}` : null],
      ["Studios", list(details.studios)],
      ["Aired", dateRange(details.airedFrom, details.airedTo)],
    ];
  }

  if (media.type === "MANGA") {
    return [
      ["Format", text(details.format) && humanize(String(details.format))],
      ["Chapters", text(details.chapters)],
      ["Volumes", text(details.volumes)],
      ["Authors", list(details.authors)],
      ["Published", dateRange(details.publishedFrom, details.publishedTo)],
    ];
  }

  return [
    ["Platforms", list(details.platforms)],
    ["Developers", list(details.developers)],
    ["Publishers", list(details.publishers)],
    ["Released", dateRange(details.releaseDate, null)],
  ];
}

async function loadMedia(type: MediaType, id: string): Promise<StoredMedia> {
  await connection();

  try {
    return await getOrFetchMedia(type, id, false);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof AdultContentError) {
      notFound();
    }

    throw error;
  }
}

async function Profile({ params }: { params: PageProps<"/[type]/[id]">["params"] }) {
  const { type: segment, id } = await params;
  const type = toMediaType(segment);

  if (!type || !/^\d+$/.test(id)) {
    notFound();
  }

  const media = await loadMedia(type, id);
  const facts = [
    media.year,
    media.status && humanize(media.status),
    media.score !== null ? `Score ${formatScore(media.score)}` : null,
  ].filter(Boolean);
  const rows = detailRows(media).filter((row): row is [string, string] => row[1] !== null);
  const paragraphs = (media.synopsis ?? "").split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <article>
      {media.bannerImage && (
        <div className={styles.banner}>
          <Image src={media.bannerImage} alt="" fill priority className={styles.bannerImage} />
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.cover}>
          {media.coverImage && (
            <Image
              src={media.coverImage}
              alt={`Cover of ${media.title}`}
              fill
              priority
              className={styles.coverImage}
            />
          )}
        </div>

        <div className={styles.body}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>{TYPE_LABELS[media.type]}</p>
            <h1 className={styles.title}>{media.title}</h1>
            {media.altTitles.length > 0 && (
              <p className={styles.altTitles}>{media.altTitles.slice(0, 3).join(" · ")}</p>
            )}
            {facts.length > 0 && <p className={styles.facts}>{facts.join(" · ")}</p>}
            {media.genres.length > 0 && (
              <p className={styles.genres}>{media.genres.join(", ")}</p>
            )}
          </header>

          {paragraphs.length > 0 && (
            <section className={styles.section} aria-labelledby="synopsis-heading">
              <h2 id="synopsis-heading" className={styles.heading}>
                Synopsis
              </h2>
              <div className={styles.synopsis}>
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph.trim()}</p>
                ))}
              </div>
            </section>
          )}

          {rows.length > 0 && (
            <section className={styles.section} aria-labelledby="details-heading">
              <h2 id="details-heading" className={styles.heading}>
                Details
              </h2>
              <dl className={styles.details}>
                {rows.map(([label, value]) => (
                  <div key={label} className={styles.detail}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <p className={styles.source}>
            <a href={media.source.url} target="_blank" rel="noopener noreferrer">
              View original page ↗
            </a>
          </p>
        </div>
      </div>
    </article>
  );
}

function ProfileSkeleton() {
  return (
    <div className={styles.layout} aria-busy="true">
      <div className={styles.cover} />
      <div className={styles.body}>
        <div className={styles.skeletonTitle} />
        <div className={styles.skeletonLine} />
        <div className={styles.skeletonLine} />
      </div>
    </div>
  );
}

export default function ProfilePage({ params }: PageProps<"/[type]/[id]">) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

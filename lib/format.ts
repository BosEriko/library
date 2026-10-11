import type { Media } from "@/lib/types";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function humanize(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();

  return value.length <= 3 ? value : words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function mediaPath(media: Pick<Media, "type" | "sourceId">): string {
  return `/${media.type.toLowerCase()}/${media.sourceId}`;
}

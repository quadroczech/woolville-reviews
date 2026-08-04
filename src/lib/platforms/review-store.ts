import fs from "node:fs";
import path from "node:path";
import type { PlatformSource, Review } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");

function fileFor(platform: PlatformSource): string {
  return path.join(DATA_DIR, `${platform}-reviews.json`);
}

function readFile(platform: PlatformSource): Review[] {
  try {
    return JSON.parse(fs.readFileSync(fileFor(platform), "utf8"));
  } catch {
    return [];
  }
}

function writeFile(platform: PlatformSource, reviews: Review[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(fileFor(platform), JSON.stringify(reviews, null, 2), "utf8");
}

function byDateDesc(a: Review, b: Review): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function getAllReviews(platform: PlatformSource): Review[] {
  return readFile(platform);
}

export function getLatestReviewDate(platform: PlatformSource): Date | null {
  const reviews = readFile(platform);
  if (!reviews.length) return null;
  const newest = reviews.reduce((max, r) => {
    const t = new Date(r.created_at).getTime();
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, 0);
  return newest ? new Date(newest) : null;
}

export function upsertReview(platform: PlatformSource, review: Review): void {
  const reviews = readFile(platform);
  const idx = reviews.findIndex(
    (r) => r.external_review_id === review.external_review_id
  );
  if (idx >= 0) reviews[idx] = review;
  else reviews.unshift(review);
  writeFile(platform, reviews);
}

export function upsertMany(
  platform: PlatformSource,
  newReviews: Review[]
): number {
  const byId = new Map(
    readFile(platform).map((r) => [r.external_review_id, r])
  );
  for (const r of newReviews) byId.set(r.external_review_id, r);
  const merged = Array.from(byId.values()).sort(byDateDesc);
  writeFile(platform, merged);
  return merged.length;
}

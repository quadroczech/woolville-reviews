import fs from "node:fs";
import path from "node:path";
import type { Review } from "@/lib/types";

const DATA_FILE = path.join(process.cwd(), "data", "trustpilot-reviews.json");

function readFile(): Review[] {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeFile(reviews: Review[]): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(reviews, null, 2), "utf8");
}

export function getAllReviews(): Review[] {
  return readFile();
}

export function upsertReview(review: Review): void {
  const reviews = readFile();
  const idx = reviews.findIndex((r) => r.external_review_id === review.external_review_id);
  if (idx >= 0) reviews[idx] = review;
  else reviews.unshift(review);
  writeFile(reviews);
}

export function upsertMany(newReviews: Review[]): number {
  const reviews = readFile();
  const byId = new Map(reviews.map((r) => [r.external_review_id, r]));
  for (const r of newReviews) byId.set(r.external_review_id, r);
  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  writeFile(merged);
  return merged.length;
}

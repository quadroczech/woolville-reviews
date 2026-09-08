// Sklik API Fenix connector for Zbozi.cz shop reviews ("Nakupy" module).
// Replaces the Zbozi API, shut down 2026-03-16 (see HANDOFF.md).
//
// API base is https://api.sklik.cz/v1 — NOT the /fenix/v1 path the docs gateway
// lives at (that only serves the HTML API explorer and redirects nowhere useful).
// Discovered via the openapi spec at https://api.sklik.cz/v1/openapi.json.
import axios from "axios";

export interface SklikFenixConfig {
  refreshToken: string;
  premiseId: number;
}

export interface SklikReview {
  shopReviewId: number;
  createDatetime: string;
  positiveComment: string;
  negativeComment: string;
  orderId: string | null;
  userName: string;
  state: "new" | "approved";
  shopReaction: string | null;
  shopReactionState: "new" | "approved" | "denied" | null;
  satisfaction: {
    communication: "yes" | "no" | null;
    deliveryDate: "yes" | "no" | null;
    deliveryQuality: "yes" | "no" | null;
    overall: "yes" | "yes_but" | "no";
  };
}

const API_BASE = process.env.SKLIK_API_BASE ?? "https://api.sklik.cz/v1";
const PAGE_SIZE = 100;
// The reviews endpoint is rate-limited to 1 request/second.
const REQUEST_INTERVAL_MS = 1100;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(refreshToken: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 10_000) {
    return cachedToken.token;
  }

  const { data } = await axios.post(
    `${API_BASE}/user/token`,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchReviewsOptions {
  fromDatetime?: string;
  toDatetime?: string;
}

export async function fetchShopReviews(
  config: SklikFenixConfig,
  opts: FetchReviewsOptions = {}
): Promise<SklikReview[]> {
  const all: SklikReview[] = [];
  let offset = 0;

  for (;;) {
    const token = await getAccessToken(config.refreshToken);
    const params: Record<string, string | number> = {
      premiseId: config.premiseId,
      limit: PAGE_SIZE,
      offset,
    };
    if (opts.fromDatetime) params.fromDatetime = opts.fromDatetime;
    if (opts.toDatetime) params.toDatetime = opts.toDatetime;

    const { data } = await axios.get(`${API_BASE}/nakupy/reviews/`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });

    const items: SklikReview[] = data.items ?? [];
    all.push(...items);

    offset += items.length;
    // Only stop early on a confirmed total; a missing meta.count must not be treated
    // as "no more pages" — that silently truncates to one page (see backfill script).
    if (items.length < PAGE_SIZE) break;
    if (typeof data.meta?.count === "number" && offset >= data.meta.count) break;

    await sleep(REQUEST_INTERVAL_MS);
  }

  return all;
}

// Overall satisfaction is a yes/yes_but/no tri-state, not a 1-5 score — map it onto
// the app's 1-5 scale so Zbozi reviews sort and average alongside other platforms.
function ratingFromSatisfaction(overall: SklikReview["satisfaction"]["overall"]): number {
  if (overall === "yes") return 5;
  if (overall === "yes_but") return 3;
  return 1;
}

export function reviewRating(review: SklikReview): number {
  return ratingFromSatisfaction(review.satisfaction.overall);
}

export function buildReviewText(review: SklikReview): string {
  const parts: string[] = [];
  if (review.positiveComment) parts.push(`+: ${review.positiveComment}`);
  if (review.negativeComment) parts.push(`-: ${review.negativeComment}`);
  if (review.shopReaction) parts.push(`Reakce obchodu: ${review.shopReaction}`);
  return parts.join("\n") || "(bez textu)";
}

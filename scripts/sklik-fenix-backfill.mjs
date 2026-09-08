// One-off (or re-runnable) full backfill of Zbozi.cz shop reviews via Sklik API Fenix
// into the file store. For ongoing incremental syncs use POST /api/sync/zbozi instead —
// this script exists because pulling the entire history (tens of thousands of reviews,
// rate-limited to 1 req/s) is a one-time job that shouldn't block on a running server.
//
// Usage:
//   SKLIK_API_KEY=<key> SKLIK_PREMISE_ID=<id> node scripts/sklik-fenix-backfill.mjs
//
// Reads .env.local automatically if present and the vars aren't already set.
import fs from "node:fs";
import path from "node:path";

const ENV_FILE = path.join(process.cwd(), ".env.local");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

const API_BASE = process.env.SKLIK_API_BASE ?? "https://api.sklik.cz/v1";
const REFRESH_TOKEN = process.env.SKLIK_API_KEY;
const PREMISE_ID = process.env.SKLIK_PREMISE_ID;
const PAGE_SIZE = 100;
const REQUEST_INTERVAL_MS = 1100;
const OUT_FILE = path.join(process.cwd(), "data", "zbozi-reviews.json");

if (!REFRESH_TOKEN || !PREMISE_ID) {
  console.error("Missing SKLIK_API_KEY or SKLIK_PREMISE_ID (env or .env.local).");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken() {
  const res = await fetch(`${API_BASE}/user/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

function ratingFromSatisfaction(overall) {
  if (overall === "yes") return 5;
  if (overall === "yes_but") return 3;
  return 1;
}

function buildReviewText(r) {
  const parts = [];
  if (r.positiveComment) parts.push(`+: ${r.positiveComment}`);
  if (r.negativeComment) parts.push(`-: ${r.negativeComment}`);
  if (r.shopReaction) parts.push(`Reakce obchodu: ${r.shopReaction}`);
  return parts.join("\n") || "(bez textu)";
}

function sentimentFor(rating) {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
}

function toReview(r) {
  const rating = ratingFromSatisfaction(r.satisfaction.overall);
  return {
    id: `zbozi-${r.shopReviewId}`,
    platform_source: "zbozi",
    external_review_id: String(r.shopReviewId),
    country_code: "CZ",
    rating,
    review_text: buildReviewText(r),
    review_text_cz: null,
    customer_name_extracted: r.userName || null,
    order_id: r.orderId,
    match_confidence: "unverified",
    ai_category: null,
    ai_sentiment: sentimentFor(rating),
    response_draft: null,
    status: "pending",
    created_at: r.createDatetime,
    replied_at: null,
    order: null,
  };
}

let accessToken = await getAccessToken();
let tokenIssuedAt = Date.now();

async function authedGet(url) {
  // Access tokens live 300s; re-issue a bit before that to stay safe on a long run.
  if (Date.now() - tokenIssuedAt > 250_000) {
    accessToken = await getAccessToken();
    tokenIssuedAt = Date.now();
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const byId = new Map();
if (fs.existsSync(OUT_FILE)) {
  for (const review of JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))) {
    byId.set(review.external_review_id, review);
  }
}
const before = byId.size;

let offset = 0;
let total = null;
const started = Date.now();

for (;;) {
  const params = new URLSearchParams({
    premiseId: PREMISE_ID,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    fromDatetime: "2010-01-01T00:00:00Z",
  });
  const data = await authedGet(`${API_BASE}/nakupy/reviews/?${params}`);
  total = data.meta?.count ?? total;

  for (const item of data.items ?? []) {
    byId.set(String(item.shopReviewId), toReview(item));
  }

  offset += (data.items ?? []).length;
  const pct = total ? ((offset / total) * 100).toFixed(1) : "?";
  process.stdout.write(`\r  fetched ${offset}/${total ?? "?"} (${pct}%)`);

  if (!data.items?.length || offset >= (total ?? offset)) break;
  await sleep(REQUEST_INTERVAL_MS);
}

console.log();

const merged = Array.from(byId.values()).sort(
  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2), "utf8");

const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);
console.log(
  `Done in ${elapsedMin} min. Store went ${before} -> ${merged.length} review(s) (fetched ${offset} from API).`
);

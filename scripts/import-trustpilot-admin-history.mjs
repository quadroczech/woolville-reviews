// One-off import: convert the raw Trustpilot admin scrape (data/trustpilot-history-raw.json,
// collected manually from businessapp.b2b.trustpilot.com since there is no API access on
// this plan) into the app's Review shape and merge it into data/trustpilot-reviews.json.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_FILE = path.join(ROOT, "data", "trustpilot-history-raw.json");
const OUT_FILE = path.join(ROOT, "data", "trustpilot-reviews.json");

const raw = JSON.parse(fs.readFileSync(RAW_FILE, "utf8"));

function buildText(title, text) {
  if (!title) return text || null;
  if (!text) return title;
  return text.trim() === title.trim() || text.startsWith(title) ? text : `${title}\n${text}`;
}

function sentiment(rating) {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
}

const transformed = raw.map((r) => ({
  id: `tp-${r.id}`,
  platform_source: "trustpilot",
  external_review_id: r.id,
  country_code: "DE",
  rating: r.rating,
  review_text: buildText(r.title, r.text),
  review_text_cz: null,
  customer_name_extracted: r.consumerEmail || r.consumerName || null,
  order_id: null,
  match_confidence: "unverified",
  ai_category: null,
  ai_sentiment: sentiment(r.rating),
  response_draft: null,
  status: "pending",
  created_at: r.createdAt || "1970-01-01T00:00:00.000Z",
  replied_at: null,
  order: null,
}));

const byId = new Map();
let existing = [];
if (fs.existsSync(OUT_FILE)) {
  existing = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
}
for (const r of existing) byId.set(r.external_review_id, r);
for (const r of transformed) byId.set(r.external_review_id, r);

const merged = Array.from(byId.values()).sort(
  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2), "utf8");

const undated = transformed.filter((r) => r.created_at === "1970-01-01T00:00:00.000Z").length;
console.log(`Imported ${transformed.length} scraped reviews, merged store now has ${merged.length}.`);
if (undated) console.log(`Warning: ${undated} review(s) had no parseable date and were set to 1970-01-01 as a sentinel.`);

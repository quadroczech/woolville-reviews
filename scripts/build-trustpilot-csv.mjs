// Build CSV from manually-scraped Trustpilot review JSON (public pages, no API).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const OUT_DIR = path.join(ROOT, "exports", `trustpilot-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const COLUMNS = [
  "platform",
  "country_code",
  "external_review_id",
  "rating",
  "review_date",
  "title",
  "review_text",
  "reviewer_name",
  "reviewer_country",
  "reviewer_review_count",
  "date_of_experience",
  "label",
  "review_url",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toRow(record) {
  return COLUMNS.map((c) => csvEscape(record[c])).join(",");
}

function writeCsv(filePath, records) {
  const lines = [COLUMNS.join(","), ...records.map(toRow)];
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function normalize(raw, market) {
  const idMatch = (raw.reviewUrl || "").match(/\/reviews\/([a-f0-9]+)/i);
  return {
    platform: `trustpilot_${market.toLowerCase()}`,
    country_code: market,
    external_review_id: idMatch ? idMatch[1] : "",
    rating: raw.rating ?? "",
    review_date: raw.submittedAt ?? "",
    title: raw.title ?? "",
    review_text: raw.text ?? "",
    reviewer_name: raw.name ?? "",
    reviewer_country: raw.country ?? "",
    reviewer_review_count: raw.reviewerReviewCount ?? "",
    date_of_experience: raw.dateOfExperience ?? "",
    label: raw.label ?? "",
    review_url: raw.reviewUrl ? `https://www.trustpilot.com${raw.reviewUrl}` : "",
  };
}

const deRaw = JSON.parse(fs.readFileSync("/tmp/tp_de_reviews.json", "utf8"));
const deRecords = deRaw.map((r) => normalize(r, "DE"));
deRecords.sort((a, b) => new Date(a.review_date || 0) - new Date(b.review_date || 0));

const dkRecord = normalize(
  {
    name: "Sally S",
    country: "DK",
    reviewerReviewCount: "42",
    rating: "5",
    title: "Trustworthy, beautiful products, reasonable prices",
    text: "Thanks Woolville\nThis was my first time to order from this website, I ordered a sandals from this website. I was not sure but I try it my chance , second day I received order confirmation from them, The good thing is that they are replying in Danish.\nI really recommend this websites and the product is really original",
    submittedAt: "2026-07-14T00:00:00.000Z",
    dateOfExperience: "July 14, 2026",
    label: "Unprompted review",
    reviewUrl: null,
  },
  "DK"
);

writeCsv(path.join(OUT_DIR, "reviews-trustpilot-DE.csv"), deRecords);
writeCsv(path.join(OUT_DIR, "reviews-trustpilot-DK.csv"), [dkRecord]);
writeCsv(path.join(OUT_DIR, "reviews-trustpilot-all.csv"), [...deRecords, dkRecord]);

const dates = deRecords.map((r) => r.review_date).filter(Boolean).sort();
console.log("DE reviews collected:", deRecords.length, "of 353 total on Trustpilot");
console.log("DE date range collected:", dates[0], "to", dates[dates.length - 1]);
console.log("DK reviews collected: 1 of 1 total (complete)");
console.log("Output dir:", OUT_DIR);

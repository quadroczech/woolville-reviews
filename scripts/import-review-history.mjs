// Import a manually exported review history into the app's file store.
//
// Neither Zbozi.cz nor Firmy.cz offers a usable review export API (the Zbozi API was
// shut down on 2026-03-16 and folded into Sklik API Fenix), so history has to be pulled
// out of their admin UIs by hand — same approach as the Trustpilot import.
//
// Usage:
//   node scripts/import-review-history.mjs <zbozi|firmy> <path-to-export.json|csv>
//
// Accepted input: a JSON array of objects, or a CSV with a header row. Recognised
// column/field names per target field (first match wins, case-insensitive):
//   id       <- id, review_id, external_review_id
//   rating   <- rating, hodnoceni, stars, pocet_hvezd            (required, 1-5)
//   date     <- date, created_at, datum                          (required)
//   text     <- text, review_text, komentar, recenze
//   title    <- title, titulek, nadpis
//   pros     <- pros, plusy, kladny, co_se_mi_libilo
//   cons     <- cons, minusy, zapory, co_se_mi_nelibilo
//   author   <- author, name, jmeno, zakaznik
//   orderId  <- order_id, orderId, cislo_objednavky
//
// Rows without a usable rating or date are skipped and reported — nothing is invented.
import fs from "node:fs";
import path from "node:path";

const PLATFORMS = ["zbozi", "firmy"];

const [platform, inputPath] = process.argv.slice(2);

if (!PLATFORMS.includes(platform) || !inputPath) {
  console.error(
    `Usage: node scripts/import-review-history.mjs <${PLATFORMS.join("|")}> <export.json|export.csv>`
  );
  process.exit(1);
}

const OUT_FILE = path.join(process.cwd(), "data", `${platform}-reviews.json`);

const FIELD_ALIASES = {
  id: ["id", "review_id", "external_review_id"],
  rating: ["rating", "hodnoceni", "stars", "pocet_hvezd"],
  date: ["date", "created_at", "datum"],
  text: ["text", "review_text", "komentar", "recenze"],
  title: ["title", "titulek", "nadpis"],
  pros: ["pros", "plusy", "kladny", "co_se_mi_libilo"],
  cons: ["cons", "minusy", "zapory", "co_se_mi_nelibilo"],
  author: ["author", "name", "jmeno", "zakaznik"],
  orderId: ["order_id", "orderid", "cislo_objednavky"],
};

function normalizeKey(key) {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function pick(row, field) {
  for (const alias of FIELD_ALIASES[field]) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

// Picked from the header line only: accepting both , and ; at once would split
// unquoted cells that legitimately contain the other character.
function detectDelimiter(content) {
  const header = content.split("\n", 1)[0];
  const semicolons = (header.match(/;/g) ?? []).length;
  const commas = (header.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsv(content) {
  const delimiter = detectDelimiter(content);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => normalizeKey(h));
  return body.map((cells) =>
    Object.fromEntries(keys.map((key, idx) => [key, cells[idx] ?? ""]))
  );
}

function readInput(file) {
  const content = fs.readFileSync(file, "utf8");
  if (file.toLowerCase().endsWith(".csv")) return parseCsv(content);
  const parsed = JSON.parse(content);
  const rows = Array.isArray(parsed) ? parsed : (parsed.reviews ?? []);
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
    )
  );
}

function parseRating(raw) {
  const value = parseFloat(String(raw).replace(",", "."));
  if (Number.isNaN(value)) return null;
  // Some exports use a percentage or a 0-100 scale for the overall score.
  const rating = value > 5 ? Math.round((value / 100) * 5) : Math.round(value);
  return rating >= 1 && rating <= 5 ? rating : null;
}

function parseDate(raw) {
  // Czech admin exports commonly use D. M. YYYY.
  const cz = String(raw).match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  const iso = cz ? `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}` : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildText(row) {
  const parts = [];
  const title = pick(row, "title");
  const pros = pick(row, "pros");
  const cons = pick(row, "cons");
  const text = pick(row, "text");
  if (title) parts.push(title);
  if (pros) parts.push(`+: ${pros}`);
  if (cons) parts.push(`-: ${cons}`);
  if (text && text !== title) parts.push(text);
  return parts.join("\n") || null;
}

function sentiment(rating) {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
}

const rows = readInput(inputPath);
const transformed = [];
const skipped = [];

rows.forEach((row, idx) => {
  const rating = parseRating(pick(row, "rating"));
  const createdAt = parseDate(pick(row, "date"));

  if (rating === null || createdAt === null) {
    skipped.push({
      row: idx + 1,
      reason: rating === null ? "unreadable rating" : "unreadable date",
    });
    return;
  }

  const externalId = pick(row, "id") ?? `${platform}-${createdAt}-${idx}`;

  transformed.push({
    id: `${platform}-${externalId}`,
    platform_source: platform,
    external_review_id: externalId,
    country_code: "CZ",
    rating,
    review_text: buildText(row),
    review_text_cz: null,
    customer_name_extracted: pick(row, "author"),
    order_id: pick(row, "orderId"),
    match_confidence: "unverified",
    ai_category: null,
    ai_sentiment: sentiment(rating),
    response_draft: null,
    status: "pending",
    created_at: createdAt,
    replied_at: null,
    order: null,
  });
});

const byId = new Map();
if (fs.existsSync(OUT_FILE)) {
  for (const review of JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))) {
    byId.set(review.external_review_id, review);
  }
}
const before = byId.size;
for (const review of transformed) byId.set(review.external_review_id, review);

const merged = Array.from(byId.values()).sort(
  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2), "utf8");

console.log(
  `${platform}: read ${rows.length} row(s), imported ${transformed.length}, store went ${before} -> ${merged.length}.`
);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} row(s):`);
  for (const s of skipped.slice(0, 10)) {
    console.log(`  row ${s.row}: ${s.reason}`);
  }
  if (skipped.length > 10) console.log(`  ...and ${skipped.length - 10} more`);
}

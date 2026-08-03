// One-off full export of ALL reviews (Trusted Shops + Heureka) split by country to CSV.
// Run with: node scripts/export-reviews.mjs
import axios from "axios";
import { parseStringPromise } from "xml2js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env.local") });

const OUT_DIR = path.join(ROOT, "exports", `reviews-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const COLUMNS = [
  "platform",
  "country_code",
  "external_review_id",
  "rating",
  "review_date",
  "title",
  "review_text",
  "pros",
  "cons",
  "summary",
  "recommends",
  "sub_delivery_time",
  "sub_transport_quality",
  "sub_communication",
  "sub_pickup_time",
  "sub_pickup_quality",
  "customer_email",
  "order_reference",
  "created_at_raw",
  "submitted_at_raw",
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

// ---------- Trusted Shops ----------

async function getTrustedShopsToken(clientId, clientSecret) {
  const { data } = await axios.post(
    "https://login.etrusted.com/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: "https://api.etrusted.com",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data.access_token;
}

async function fetchAllTrustedShopsReviews(clientId, clientSecret) {
  const token = await getTrustedShopsToken(clientId, clientSecret);
  const all = [];
  let after;
  const PAGE_SIZE = 50;
  const MAX_PAGES = 5000; // safety ceiling well above known ~13.5k reviews

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { count: PAGE_SIZE };
    if (after) params.after = after;

    const { data } = await axios.get("https://api.etrusted.com/reviews", {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });

    const items = data.items ?? [];
    if (items.length === 0) break;
    all.push(...items);
    after = items[items.length - 1].id;
    if (page % 20 === 0) console.log(`  Trusted Shops: fetched ${all.length} reviews so far...`);
    if (items.length < PAGE_SIZE) break;
  }

  return all;
}

// ---------- Heureka ----------

async function fetchHeurekaReviews(secretKey, country) {
  const domain = country === "sk" ? "heureka.sk" : "heureka.cz";
  const url = `https://www.${domain}/direct/dotaznik/export-review.php?key=${secretKey}`;
  const { data: xml } = await axios.get(url, { responseType: "text" });
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const items = parsed?.reviews?.review;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

// ---------- Main ----------

async function main() {
  const summary = [];
  const byCountry = new Map();

  function push(country, record) {
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(record);
  }

  // Trusted Shops
  const tsClientId = process.env.TRUSTED_SHOPS_CLIENT_ID;
  const tsClientSecret = process.env.TRUSTED_SHOPS_CLIENT_SECRET;
  const channelConfig = JSON.parse(process.env.TRUSTED_SHOPS_CHANNELS ?? "[]");
  const channelToCountry = {};
  for (const ch of channelConfig) channelToCountry[ch.channelId] = ch.country;

  if (tsClientId && tsClientSecret) {
    console.log("Fetching Trusted Shops reviews (all channels)...");
    const tsReviews = await fetchAllTrustedShopsReviews(tsClientId, tsClientSecret);
    console.log(`Trusted Shops: ${tsReviews.length} reviews total.`);

    for (const r of tsReviews) {
      const country = channelToCountry[r.channelRef] ?? "UNKNOWN";
      push(country, {
        platform: "trusted_shops",
        country_code: country,
        external_review_id: r.id,
        rating: r.rating,
        review_date: r.submittedAt ?? r.createdAt ?? "",
        title: r.title ?? "",
        review_text: r.comment ?? "",
        pros: "",
        cons: "",
        summary: "",
        recommends: "",
        sub_delivery_time: "",
        sub_transport_quality: "",
        sub_communication: "",
        sub_pickup_time: "",
        sub_pickup_quality: "",
        customer_email: r.customer?.email ?? "",
        order_reference: r.transaction?.reference ?? "",
        created_at_raw: r.createdAt ?? "",
        submitted_at_raw: r.submittedAt ?? "",
      });
    }
    summary.push({ source: "trusted_shops (all channels)", count: tsReviews.length });
  } else {
    console.log("Trusted Shops: skipped (credentials not configured).");
  }

  // Heureka CZ/SK
  for (const country of ["cz", "sk"]) {
    const key = country === "cz" ? process.env.HEUREKA_CZ_KEY : process.env.HEUREKA_SK_KEY;
    if (!key) {
      console.log(`Heureka ${country.toUpperCase()}: skipped (key not configured).`);
      continue;
    }
    console.log(`Fetching Heureka ${country.toUpperCase()} reviews...`);
    const items = await fetchHeurekaReviews(key, country);
    console.log(`Heureka ${country.toUpperCase()}: ${items.length} reviews.`);

    for (const r of items) {
      const rating = parseInt(r.total_rating ?? "3", 10);
      push(country.toUpperCase(), {
        platform: `heureka_${country}`,
        country_code: country.toUpperCase(),
        external_review_id: r.rating_id ?? "",
        rating: Math.min(5, Math.max(1, rating)),
        review_date: r.unix_timestamp
          ? new Date(parseInt(r.unix_timestamp, 10) * 1000).toISOString()
          : "",
        title: "",
        review_text: "",
        pros: r.pros ?? "",
        cons: r.cons ?? "",
        summary: r.summary ?? "",
        recommends: r.recommends === "1" ? "true" : "false",
        sub_delivery_time: r.delivery_time ?? "",
        sub_transport_quality: r.transport_quality ?? "",
        sub_communication: r.communication ?? "",
        sub_pickup_time: r.pickup_time ?? "",
        sub_pickup_quality: r.pickup_quality ?? "",
        customer_email: "",
        order_reference: r.order_id ?? "",
        created_at_raw: r.unix_timestamp ?? "",
        submitted_at_raw: "",
      });
    }
    summary.push({ source: `heureka_${country}`, count: items.length });
  }

  // Write per-country CSVs + combined file
  const allRecords = [];
  const countryStats = [];

  for (const [country, records] of byCountry.entries()) {
    records.sort((a, b) => new Date(a.review_date || 0) - new Date(b.review_date || 0));
    const filePath = path.join(OUT_DIR, `reviews-${country}.csv`);
    writeCsv(filePath, records);
    allRecords.push(...records);

    const dates = records.map((r) => r.review_date).filter(Boolean).sort();
    countryStats.push({
      country,
      count: records.length,
      first: dates[0] ?? "-",
      last: dates[dates.length - 1] ?? "-",
      file: path.relative(ROOT, filePath),
    });
  }

  allRecords.sort((a, b) => new Date(a.review_date || 0) - new Date(b.review_date || 0));
  const combinedPath = path.join(OUT_DIR, "reviews-all-countries.csv");
  writeCsv(combinedPath, allRecords);

  console.log("\n=== SOURCE SUMMARY ===");
  console.table(summary);

  console.log("\n=== PER-COUNTRY SUMMARY ===");
  console.table(countryStats);

  console.log(`\nTotal reviews exported: ${allRecords.length}`);
  console.log(`Output directory: ${OUT_DIR}`);
  console.log(`Combined file: ${path.relative(ROOT, combinedPath)}`);
}

main().catch((err) => {
  console.error("Export failed:", err.response?.data ?? err.message ?? err);
  process.exit(1);
});

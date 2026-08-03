// Export of Heureka PRODUCT reviews (CZ + SK) to CSV.
// Note: Heureka caps this feed to the last 6 months by design (the &from= param can only
// narrow that window further, never extend it) - this is a platform limit, not a script bug.
// Run with: node scripts/export-product-reviews.mjs
import axios from "axios";
import { parseStringPromise } from "xml2js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env.local") });

const OUT_DIR = path.join(ROOT, "exports", `product-reviews-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const COLUMNS = [
  "platform",
  "country_code",
  "external_review_id",
  "rating_id_type",
  "rating",
  "review_date",
  "pros",
  "cons",
  "summary",
  "recommends",
  "product_name",
  "product_url",
  "product_price",
  "product_ean",
  "product_sku",
  "order_reference",
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

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

async function fetchProductReviews(key, country) {
  const domain = country === "sk" ? "heureka.sk" : "heureka.cz";
  const url = `https://www.${domain}/direct/dotaznik/export-product-review.php?key=${key}`;
  const { data: xml } = await axios.get(url, { responseType: "text" });
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const products = asArray(parsed?.products?.product);

  const rows = [];
  for (const p of products) {
    const reviews = asArray(p.reviews?.review);
    for (const r of reviews) {
      const rating = parseFloat(r.rating ?? "3");
      rows.push({
        platform: `heureka_product_${country}`,
        country_code: country.toUpperCase(),
        external_review_id: r.rating_id ?? "",
        rating_id_type: r.rating_id_type ?? "",
        rating,
        review_date: r.unix_timestamp
          ? new Date(parseInt(r.unix_timestamp, 10) * 1000).toISOString()
          : "",
        pros: r.pros ?? "",
        cons: r.cons ?? "",
        summary: r.summary ?? "",
        recommends: r.recommends === "1" ? "true" : "false",
        product_name: p.product_name ?? "",
        product_url: p.url ?? "",
        product_price: p.price ?? p.cena ?? "",
        product_ean: p.ean ?? "",
        product_sku: p.productno ?? "",
        order_reference: p.order_id ?? "",
      });
    }
  }
  return rows;
}

async function main() {
  const summary = [];
  const allRows = [];

  for (const country of ["cz", "sk"]) {
    const key = country === "cz" ? process.env.HEUREKA_CZ_KEY : process.env.HEUREKA_SK_KEY;
    if (!key) {
      console.log(`Heureka product reviews ${country.toUpperCase()}: skipped (key not configured).`);
      continue;
    }
    console.log(`Fetching Heureka product reviews ${country.toUpperCase()}...`);
    const rows = await fetchProductReviews(key, country);
    rows.sort((a, b) => new Date(a.review_date || 0) - new Date(b.review_date || 0));

    const filePath = path.join(OUT_DIR, `product-reviews-${country.toUpperCase()}.csv`);
    writeCsv(filePath, rows);
    allRows.push(...rows);

    const dates = rows.map((r) => r.review_date).filter(Boolean).sort();
    summary.push({
      country: country.toUpperCase(),
      product_lines: rows.length,
      unique_reviews: new Set(rows.map((r) => r.external_review_id)).size,
      first: dates[0] ?? "-",
      last: dates[dates.length - 1] ?? "-",
      file: path.relative(ROOT, filePath),
    });
  }

  allRows.sort((a, b) => new Date(a.review_date || 0) - new Date(b.review_date || 0));
  const combinedPath = path.join(OUT_DIR, "product-reviews-all.csv");
  writeCsv(combinedPath, allRows);

  console.log("\n=== SUMMARY ===");
  console.table(summary);
  console.log(`\nNote: each review appears once per matched product/offer variant (size/color), so "product_lines" > "unique_reviews" is expected.`);
  console.log(`Output directory: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Export failed:", err.response?.data ?? err.message ?? err);
  process.exit(1);
});

// Discovery helper for Sklik API Fenix (the replacement for the Zbozi API that
// Seznam shut down on 2026-03-16).
//
// Run this on a machine that can reach api.sklik.cz. It exchanges the Fenix API key
// (a refresh token) for an access token, then lists the endpoints the API exposes so
// the review/rating endpoint can be identified before a connector is written.
//
// The exact shape of the token exchange is not publicly documented, so this tries
// several variants and reports which one the server accepted.
//
// Usage:
//   SKLIK_API_KEY=<fenix-api-key> node scripts/sklik-fenix-discover.mjs
//
// Writes the findings to sklik-fenix-discovery.json in the current directory.
// The file contains endpoint metadata only — no tokens are written to it.
import fs from "node:fs";

const BASE = (process.env.SKLIK_API_BASE ?? "https://api.sklik.cz/fenix/v1").replace(/\/$/, "");
const API_KEY = process.env.SKLIK_API_KEY;

if (!API_KEY) {
  console.error("Missing SKLIK_API_KEY. Usage:");
  console.error("  SKLIK_API_KEY=<fenix-api-key> node scripts/sklik-fenix-discover.mjs");
  process.exit(1);
}

const REVIEW_KEYWORDS = /rating|review|feedback|hodnocen|recenz|satisfaction/i;

const findings = { base: BASE, tokenExchange: null, specUrl: null, endpoints: [], reviewEndpoints: [], notes: [] };

function mask(token) {
  if (!token) return null;
  return `${token.slice(0, 8)}...${token.slice(-6)} (len ${token.length})`;
}

async function tryJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON response (HTML error page, plain text) — keep the raw body for the report.
  }
  return { status: res.status, ok: res.ok, json, text };
}

// ---------------------------------------------------------------- token exchange
const TOKEN_ATTEMPTS = [
  {
    label: "POST /user/token with Authorization: Bearer <key>",
    path: "/user/token",
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: "{}",
    },
  },
  {
    label: "POST /user/token with body {refreshToken}",
    path: "/user/token",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: API_KEY }),
    },
  },
  {
    label: "POST /user/token with body {refresh_token}",
    path: "/user/token",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: API_KEY }),
    },
  },
  {
    label: "GET /user/token with Authorization: Bearer <key>",
    path: "/user/token",
    init: { method: "GET", headers: { Authorization: `Bearer ${API_KEY}` } },
  },
];

function extractAccessToken(json) {
  if (!json || typeof json !== "object") return null;
  const direct =
    json.accessToken ?? json.access_token ?? json.token ?? json.data?.accessToken ?? json.data?.access_token;
  return typeof direct === "string" ? direct : null;
}

let accessToken = null;

console.log(`Base URL: ${BASE}\n`);
console.log("=== Step 1: exchange API key for an access token ===");

for (const attempt of TOKEN_ATTEMPTS) {
  const url = `${BASE}${attempt.path}`;
  try {
    const res = await tryJson(url, attempt.init);
    const token = extractAccessToken(res.json);
    console.log(`  [${res.status}] ${attempt.label}${token ? "  <-- got a token" : ""}`);
    if (token) {
      accessToken = token;
      findings.tokenExchange = { variant: attempt.label, status: res.status, responseKeys: Object.keys(res.json ?? {}) };
      console.log(`      access token: ${mask(token)}`);
      break;
    }
    if (!res.json) {
      findings.notes.push(`${attempt.label} -> ${res.status}, non-JSON body: ${res.text.slice(0, 200)}`);
    } else {
      findings.notes.push(`${attempt.label} -> ${res.status}, keys: ${Object.keys(res.json).join(", ")}`);
    }
  } catch (err) {
    console.log(`  [ERR] ${attempt.label}: ${err.message}`);
    findings.notes.push(`${attempt.label} -> network error: ${err.message}`);
  }
}

if (!accessToken) {
  console.log("\nNo access token obtained. The notes below show what each attempt returned —");
  console.log("paste them back so the exchange can be corrected.\n");
  for (const n of findings.notes) console.log(`  - ${n}`);
  fs.writeFileSync("sklik-fenix-discovery.json", JSON.stringify(findings, null, 2));
  console.log("\nWrote sklik-fenix-discovery.json");
  process.exit(2);
}

const authHeaders = { Authorization: `Bearer ${accessToken}` };

// ------------------------------------------------------------------- spec lookup
console.log("\n=== Step 2: locate the endpoint list / OpenAPI spec ===");

const SPEC_PATHS = ["/openapi.json", "/openapi", "/swagger.json", "/spec", "/docs.json", "/", ""];
let spec = null;

for (const path of SPEC_PATHS) {
  const url = `${BASE}${path}`;
  try {
    const res = await tryJson(url, { headers: authHeaders });
    const isSpec = res.json && (res.json.paths || res.json.openapi || res.json.swagger);
    console.log(`  [${res.status}] ${url}${isSpec ? "  <-- OpenAPI spec" : ""}`);
    if (isSpec) {
      spec = res.json;
      findings.specUrl = url;
      break;
    }
    // The root endpoint is documented to return metadata including a documentation URL.
    if (res.json && !spec) {
      const docUrl = res.json.documentation ?? res.json.documentationUrl ?? res.json.docs;
      if (docUrl) {
        console.log(`      metadata points at documentation: ${docUrl}`);
        findings.notes.push(`root metadata documentation URL: ${docUrl}`);
      }
      findings.notes.push(`${url} -> ${res.status}, keys: ${Object.keys(res.json).join(", ")}`);
    }
  } catch (err) {
    console.log(`  [ERR] ${url}: ${err.message}`);
  }
}

// ---------------------------------------------------------------- endpoint report
console.log("\n=== Step 3: endpoints ===");

if (spec?.paths) {
  for (const [path, methods] of Object.entries(spec.paths)) {
    const verbs = Object.keys(methods)
      .filter((k) => ["get", "post", "put", "patch", "delete"].includes(k.toLowerCase()))
      .map((v) => v.toUpperCase());
    const summary = Object.values(methods).find((m) => m?.summary)?.summary ?? "";
    const entry = { path, methods: verbs, summary };
    findings.endpoints.push(entry);
    if (REVIEW_KEYWORDS.test(path) || REVIEW_KEYWORDS.test(summary)) {
      findings.reviewEndpoints.push(entry);
    }
  }

  console.log(`  Found ${findings.endpoints.length} path(s).`);
  if (findings.reviewEndpoints.length) {
    console.log("\n  Review/rating related:");
    for (const e of findings.reviewEndpoints) {
      console.log(`    ${e.methods.join(",")} ${e.path}${e.summary ? ` — ${e.summary}` : ""}`);
    }
  } else {
    console.log("\n  No path matched review/rating keywords. Full list:");
    for (const e of findings.endpoints) {
      console.log(`    ${e.methods.join(",")} ${e.path}${e.summary ? ` — ${e.summary}` : ""}`);
    }
  }
} else {
  console.log("  No machine-readable spec found — probing likely review paths instead.");
  const GUESSES = [
    "/shops",
    "/shops/reviews",
    "/reviews",
    "/ratings",
    "/shop/ratings",
    "/shop/reviews",
    "/premises",
  ];
  for (const path of GUESSES) {
    const url = `${BASE}${path}`;
    try {
      const res = await tryJson(url, { headers: authHeaders });
      const keys = res.json ? Object.keys(res.json).join(", ") : "(non-JSON)";
      console.log(`  [${res.status}] ${url} — ${keys}`);
      findings.endpoints.push({ path, probedStatus: res.status, responseKeys: keys });
    } catch (err) {
      console.log(`  [ERR] ${url}: ${err.message}`);
    }
  }
}

fs.writeFileSync("sklik-fenix-discovery.json", JSON.stringify(findings, null, 2));
console.log("\nWrote sklik-fenix-discovery.json — send that file (it contains no tokens).");

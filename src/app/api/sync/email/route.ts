import { NextRequest, NextResponse } from "next/server";
import {
  fetchEmailReviews,
  parseEmailReview,
  type EmailSource,
} from "@/lib/platforms/email-reviews";
import { getLatestReviewDate, upsertMany } from "@/lib/platforms/review-store";

const SOURCES: EmailSource[] = ["zbozi", "firmy"];

interface SourceResult {
  source: EmailSource;
  fetched: number;
  parsed: number;
  stored: number;
  unparsed: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    return NextResponse.json(
      { error: "IMAP is not configured (IMAP_HOST, IMAP_USER, IMAP_PASS)" },
      { status: 503 }
    );
  }

  const port = parseInt(process.env.IMAP_PORT ?? "993", 10);
  const config = { host, port, secure: port === 993, auth: { user, pass } };

  const body = await request.json().catch(() => ({}));
  const requested: EmailSource[] = Array.isArray(body.sources)
    ? SOURCES.filter((s) => body.sources.includes(s))
    : SOURCES;

  const results: SourceResult[] = [];

  for (const source of requested) {
    try {
      const latest = getLatestReviewDate(source);
      const emails = await fetchEmailReviews(config, {
        source,
        since: latest ?? undefined,
      });

      const reviews = [];
      const unparsed: string[] = [];
      for (const email of emails) {
        const review = parseEmailReview(email);
        if (review) reviews.push(review);
        else unparsed.push(email.subject);
      }

      const stored = reviews.length ? upsertMany(source, reviews) : 0;

      results.push({
        source,
        fetched: emails.length,
        parsed: reviews.length,
        stored,
        unparsed,
      });
    } catch (err) {
      results.push({
        source,
        fetched: 0,
        parsed: 0,
        stored: 0,
        unparsed: [],
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}

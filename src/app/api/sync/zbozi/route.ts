import { NextRequest, NextResponse } from "next/server";
import {
  fetchShopReviews,
  reviewRating,
  buildReviewText,
  type SklikReview,
} from "@/lib/platforms/sklik-fenix";
import { getLatestReviewDate, upsertMany } from "@/lib/platforms/review-store";
import type { AiSentiment, Review } from "@/lib/types";

function sentimentFor(rating: number): AiSentiment {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
}

function toReview(r: SklikReview): Review {
  const rating = reviewRating(r);
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

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const refreshToken = process.env.SKLIK_API_KEY;
  const premiseId = process.env.SKLIK_PREMISE_ID
    ? parseInt(process.env.SKLIK_PREMISE_ID, 10)
    : null;

  if (!refreshToken || !premiseId) {
    return NextResponse.json(
      { error: "Sklik Fenix is not configured (SKLIK_API_KEY, SKLIK_PREMISE_ID)" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const full = body.full === true;
  const latest = getLatestReviewDate("zbozi");
  const fromDatetime = full
    ? undefined
    : (latest ?? new Date("2010-01-01T00:00:00Z")).toISOString();

  try {
    const reviews = await fetchShopReviews(
      { refreshToken, premiseId },
      { fromDatetime }
    );
    const stored = reviews.length ? upsertMany("zbozi", reviews.map(toReview)) : 0;

    return NextResponse.json({
      results: [{ platform: "zbozi", fetched: reviews.length, stored }],
    });
  } catch (err) {
    return NextResponse.json(
      {
        results: [
          {
            platform: "zbozi",
            fetched: 0,
            stored: 0,
            error: err instanceof Error ? err.message : "Unknown error",
          },
        ],
      },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  categorizeReview,
  generateReply,
  generateCountryActionItems,
  type PainPointSummary,
} from "@/lib/ai-worker";
import type { AiCategory } from "@/lib/types";

// Processes every not-yet-categorized review (both shop-level `reviews` and
// per-product `product_reviews`) with AI, then turns the pain points surfaced
// across this batch into per-country action items. Bounded to BATCH_SIZE per
// call — like /api/sync/wpj, call again while `done` is false to work through
// a large backlog without hitting a serverless function's execution limit.
const BATCH_SIZE = 25;
// Only worth surfacing as an action item once a pain point recurs — a single
// mention is still visible on the review itself, just not promoted to the list.
const MIN_MENTIONS_FOR_ACTION_ITEM = 2;
const MAX_PAIN_POINTS_PER_COUNTRY = 15;

function productReviewText(r: { pros: string | null; cons: string | null; summary: string | null }): string {
  return [r.pros && `+: ${r.pros}`, r.cons && `-: ${r.cons}`, r.summary]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = await createClient();
  const errors: string[] = [];
  // country -> phrase -> aggregated mentions, fed into generateCountryActionItems.
  const painPointsByCountry = new Map<string, Map<string, PainPointSummary>>();

  function recordPainPoint(country: string, phrase: string, category: AiCategory, quote: string) {
    const forCountry = painPointsByCountry.get(country) ?? new Map<string, PainPointSummary>();
    const existing = forCountry.get(phrase);
    if (existing) existing.count++;
    else forCountry.set(phrase, { phrase, count: 1, exampleQuote: quote, category });
    painPointsByCountry.set(country, forCountry);
  }

  const { data: pendingReviews } = await supabase
    .from("reviews")
    .select("id, review_text, country_code")
    .is("ai_category", null)
    .not("review_text", "is", null)
    .limit(BATCH_SIZE);

  let shopProcessed = 0;
  for (const review of pendingReviews ?? []) {
    try {
      const categorization = await categorizeReview(review.review_text!, review.country_code);
      const reply = await generateReply(review.review_text!, 3, review.country_code, "unverified");

      const { error } = await supabase
        .from("reviews")
        .update({
          review_text_cz: categorization.translation_cz,
          ai_sentiment: categorization.sentiment,
          ai_category: categorization.category,
          ai_pain_points: categorization.pain_points,
          response_draft: reply,
        })
        .eq("id", review.id);
      if (error) throw new Error(error.message);

      for (const phrase of categorization.pain_points) {
        recordPainPoint(review.country_code, phrase, categorization.category, review.review_text!.slice(0, 200));
      }
      shopProcessed++;
    } catch (err) {
      errors.push(`review ${review.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const { data: pendingProductReviews } = await supabase
    .from("product_reviews")
    .select("id, pros, cons, summary, country_code, rating")
    .is("ai_category", null)
    .limit(BATCH_SIZE);

  let productProcessed = 0;
  for (const review of pendingProductReviews ?? []) {
    const text = productReviewText(review);
    if (!text) continue;
    try {
      const categorization = await categorizeReview(text, review.country_code);
      const reply = await generateReply(text, review.rating, review.country_code, "exact");

      const { error } = await supabase
        .from("product_reviews")
        .update({
          ai_sentiment: categorization.sentiment,
          ai_category: categorization.category,
          ai_pain_points: categorization.pain_points,
          response_draft: reply,
        })
        .eq("id", review.id);
      if (error) throw new Error(error.message);

      for (const phrase of categorization.pain_points) {
        recordPainPoint(review.country_code, phrase, categorization.category, text.slice(0, 200));
      }
      productProcessed++;
    } catch (err) {
      errors.push(`product_review ${review.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  let actionItemsCreated = 0;
  for (const [country, phrases] of painPointsByCountry) {
    const topPainPoints = Array.from(phrases.values())
      .filter((p) => p.count >= MIN_MENTIONS_FOR_ACTION_ITEM)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_PAIN_POINTS_PER_COUNTRY);

    if (!topPainPoints.length) continue;

    try {
      const items = await generateCountryActionItems(country, topPainPoints);
      if (!items.length) continue;

      const { error } = await supabase.from("country_action_items").insert(
        items.map((item) => ({
          country_code: country,
          title: item.title,
          description: item.description,
          severity: item.severity,
          category: item.category,
        }))
      );
      if (error) throw new Error(error.message);
      actionItemsCreated += items.length;
    } catch (err) {
      errors.push(`action items for ${country}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const done = (pendingReviews?.length ?? 0) < BATCH_SIZE && (pendingProductReviews?.length ?? 0) < BATCH_SIZE;

  return NextResponse.json({
    shopReviewsProcessed: shopProcessed,
    productReviewsProcessed: productProcessed,
    actionItemsCreated,
    done,
    errors,
  });
}

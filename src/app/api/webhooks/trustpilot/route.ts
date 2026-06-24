import { NextRequest, NextResponse } from "next/server";
import type { Review } from "@/lib/types";

const WEBHOOK_SECRET = process.env.TRUSTPILOT_WEBHOOK_SECRET ?? "";

// In-memory store for webhook reviews (until Supabase is active)
const webhookReviews: Review[] = [];

export function getWebhookReviews(): Review[] {
  return webhookReviews;
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const signature = request.headers.get("x-trustpilot-signature") ?? "";
    if (signature !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = await request.json();
  const eventType = payload.eventType ?? payload.event ?? "";

  if (
    eventType === "service-review-created" ||
    eventType === "product-review-created" ||
    eventType === "review-created"
  ) {
    const data = payload.data ?? payload;
    const review: Review = {
      id: `tp-${data.id ?? data.reviewId ?? Date.now()}`,
      platform_source: "trustpilot",
      external_review_id: data.id ?? data.reviewId ?? `tp-${Date.now()}`,
      country_code: "DE",
      rating: data.stars ?? data.rating ?? 3,
      review_text: [data.title, data.text ?? data.comment]
        .filter(Boolean)
        .join("\n"),
      review_text_cz: null,
      customer_name_extracted:
        data.consumer?.displayName ?? data.customerName ?? null,
      order_id: data.referenceId ?? data.transaction?.reference ?? null,
      match_confidence: "unverified",
      ai_category: null,
      ai_sentiment:
        (data.stars ?? data.rating ?? 3) >= 4
          ? "positive"
          : (data.stars ?? data.rating ?? 3) >= 3
            ? "neutral"
            : "negative",
      response_draft: null,
      status: "pending",
      created_at: data.createdAt ?? new Date().toISOString(),
      replied_at: null,
      order: null,
    };

    webhookReviews.unshift(review);

    // Keep max 1000 in memory
    if (webhookReviews.length > 1000) {
      webhookReviews.length = 1000;
    }
  }

  return NextResponse.json({ received: true });
}

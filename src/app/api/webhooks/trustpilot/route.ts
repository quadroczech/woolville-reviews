import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Review } from "@/lib/types";
import { upsertReview } from "@/lib/platforms/trustpilot-store";

const WEBHOOK_SECRET = process.env.TRUSTPILOT_WEBHOOK_SECRET ?? "";

function isValidSignature(rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (WEBHOOK_SECRET) {
    const signature = request.headers.get("x-trustpilot-signature") ?? "";
    if (!signature || !isValidSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody);
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

    upsertReview(review);
  }

  return NextResponse.json({ received: true });
}

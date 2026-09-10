import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as trustedShops from "@/lib/platforms/trusted-shops";
import * as sklikFenix from "@/lib/platforms/sklik-fenix";

// Sends a reply directly through the source platform's API — only possible for
// platforms that have one (Trusted Shops, Zbozi.cz via Sklik Fenix). Everything
// else (Heureka, Firmy.cz, Trustpilot on the free plan, Google Business) has no
// write access from this app; the UI falls back to copy + a deep link to the
// review on that platform instead of calling this endpoint.
const API_REPLY_PLATFORMS = new Set(["trusted_shops", "zbozi"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: review, error: fetchError } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  if (!API_REPLY_PLATFORMS.has(review.platform_source)) {
    return NextResponse.json(
      { error: `${review.platform_source} has no reply API — use copy + the platform link instead` },
      { status: 422 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const replyText: string | undefined = body.replyText ?? review.response_draft ?? undefined;
  if (!replyText) {
    return NextResponse.json({ error: "No reply text (draft is empty)" }, { status: 400 });
  }

  try {
    if (review.platform_source === "trusted_shops") {
      const clientId = process.env.TRUSTED_SHOPS_CLIENT_ID ?? "";
      const clientSecret = process.env.TRUSTED_SHOPS_CLIENT_SECRET ?? "";
      const channels = JSON.parse(process.env.TRUSTED_SHOPS_CHANNELS ?? "[]") as Array<{
        channelId: string;
        country: string;
      }>;
      // One channel per market in this setup, so country -> channel is a 1:1 reverse
      // lookup of the country -> channel mapping used at sync time.
      const channelId = channels.find((c) => c.country === review.country_code)?.channelId;
      if (!clientId || !clientSecret || !channelId) {
        return NextResponse.json(
          { error: `No Trusted Shops channel configured for country ${review.country_code}` },
          { status: 503 }
        );
      }
      await trustedShops.replyToReview({ clientId, clientSecret, channelId }, review.external_review_id, replyText);
    } else if (review.platform_source === "zbozi") {
      const refreshToken = process.env.SKLIK_API_KEY;
      const premiseId = process.env.SKLIK_PREMISE_ID ? parseInt(process.env.SKLIK_PREMISE_ID, 10) : null;
      if (!refreshToken || !premiseId) {
        return NextResponse.json({ error: "Sklik Fenix is not configured" }, { status: 503 });
      }
      await sklikFenix.postReviewReaction(
        { refreshToken, premiseId },
        parseInt(review.external_review_id, 10),
        replyText
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sending the reply failed" },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("reviews")
    .update({ status: "replied", replied_at: now, response_draft: replyText })
    .eq("id", id)
    .select("*, order:orders(*)")
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("review_reply_log").insert({
    review_table: "reviews",
    review_id: id,
    sent_via: "api",
    reply_text: replyText,
  });

  return NextResponse.json(updated);
}

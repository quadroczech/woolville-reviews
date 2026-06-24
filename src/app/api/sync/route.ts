import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as trustedShops from "@/lib/platforms/trusted-shops";
import * as trustpilot from "@/lib/platforms/trustpilot";
import * as heureka from "@/lib/platforms/heureka";
import { matchReviewToOrder } from "@/lib/order-matching";
import { Order } from "@/lib/types";

interface SyncResult {
  platform: string;
  fetched: number;
  inserted: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const platforms: string[] = body.platforms ?? ["all"];
  const results: SyncResult[] = [];

  const { data: orders } = await supabase.from("orders").select("*");
  const orderList: Order[] = orders ?? [];

  if (platforms.includes("all") || platforms.includes("trusted_shops")) {
    const clientId = process.env.TRUSTED_SHOPS_CLIENT_ID ?? "";
    const clientSecret = process.env.TRUSTED_SHOPS_CLIENT_SECRET ?? "";
    const channelCountry: Record<string, string> = {};
    const channels = JSON.parse(process.env.TRUSTED_SHOPS_CHANNELS ?? "[]") as Array<{
      channelId: string;
      country: string;
    }>;
    for (const ch of channels) channelCountry[ch.channelId] = ch.country;

    if (clientId && clientSecret) {
      try {
        const reviews = await trustedShops.fetchAllAccountReviews({ clientId, clientSecret });
        let inserted = 0;

        for (const r of reviews) {
          const country = channelCountry[r.channelRef] ?? "DE";
          const reviewData = {
            platform_source: "trusted_shops" as const,
            external_review_id: r.id,
            country_code: country,
            rating: Math.round(r.rating),
            review_text: r.comment || r.title,
            customer_name_extracted: r.customer?.email ?? null,
            created_at: r.submittedAt ?? r.createdAt,
          };

          const match = matchReviewToOrder(
            { ...reviewData, review_text: reviewData.review_text },
            orderList
          );

          const { error } = await supabase.from("reviews").upsert(
            {
              ...reviewData,
              order_id: match.order?.id ?? null,
              match_confidence: match.confidence,
            },
            { onConflict: "external_review_id" }
          );

          if (!error) inserted++;
        }

        results.push({
          platform: "trusted_shops",
          fetched: reviews.length,
          inserted,
        });
      } catch (err) {
        results.push({
          platform: "trusted_shops",
          fetched: 0,
          inserted: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  if (platforms.includes("all") || platforms.includes("trustpilot")) {
    try {
      const config = {
        apiKey: process.env.TRUSTPILOT_API_KEY ?? "",
        apiSecret: process.env.TRUSTPILOT_API_SECRET ?? "",
        businessUnitId: process.env.TRUSTPILOT_BUSINESS_UNIT_ID ?? "",
        username: process.env.TRUSTPILOT_USERNAME ?? "",
        password: process.env.TRUSTPILOT_PASSWORD ?? "",
      };

      const reviews = await trustpilot.fetchReviews(config);
      let inserted = 0;

      for (const r of reviews) {
        const reviewData = {
          platform_source: "trustpilot" as const,
          external_review_id: r.id,
          country_code: "DE",
          rating: r.stars,
          review_text: r.text || r.title,
          customer_name_extracted: r.consumer?.displayName ?? null,
          created_at: r.createdAt,
        };

        const match = matchReviewToOrder(reviewData, orderList);

        const { error } = await supabase.from("reviews").upsert(
          {
            ...reviewData,
            order_id: match.order?.id ?? null,
            match_confidence: match.confidence,
          },
          { onConflict: "external_review_id" }
        );

        if (!error) inserted++;
      }

      results.push({ platform: "trustpilot", fetched: reviews.length, inserted });
    } catch (err) {
      results.push({
        platform: "trustpilot",
        fetched: 0,
        inserted: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (platforms.includes("all") || platforms.includes("heureka")) {
    for (const country of ["cz", "sk"] as const) {
      const key =
        country === "cz"
          ? process.env.HEUREKA_CZ_KEY
          : process.env.HEUREKA_SK_KEY;

      if (!key) continue;

      try {
        const reviews = await heureka.fetchReviews({ secretKey: key, country });
        let inserted = 0;

        for (const r of reviews) {
          const reviewData = {
            platform_source: "heureka" as const,
            external_review_id: r.id,
            country_code: country.toUpperCase(),
            rating: r.rating,
            review_text: heureka.buildReviewText(r),
            customer_name_extracted: null,
            created_at: r.date,
          };

          const match = matchReviewToOrder(
            { ...reviewData, review_text: reviewData.review_text },
            orderList
          );

          const { error } = await supabase.from("reviews").upsert(
            {
              ...reviewData,
              order_id: match.order?.id ?? null,
              match_confidence: match.confidence,
            },
            { onConflict: "external_review_id" }
          );

          if (!error) inserted++;
        }

        results.push({
          platform: `heureka_${country}`,
          fetched: reviews.length,
          inserted,
        });
      } catch (err) {
        results.push({
          platform: `heureka_${country}`,
          fetched: 0,
          inserted: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return NextResponse.json({ results });
}

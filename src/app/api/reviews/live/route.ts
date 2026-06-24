import { NextResponse } from "next/server";
import * as heureka from "@/lib/platforms/heureka";
import * as trustedShops from "@/lib/platforms/trusted-shops";
import { getWebhookReviews } from "@/app/api/webhooks/trustpilot/route";
import type { Review } from "@/lib/types";

const CHANNEL_TO_COUNTRY: Record<string, string> = {
  "chl-696c5534-f496-4e45-b046-72cae755c32c": "AT",
  "chl-051708d6-e145-4297-bb15-e0a420ddbd6e": "BE",
  "chl-d81bb7a7-243a-48ab-b56a-1cd6c5c2721a": "CH",
  "chl-ca14e753-5588-4a4c-892e-f9a38592a417": "DE",
  "chl-21e2e62e-b074-426a-a5b7-2378ab4c6b77": "FR",
  "chl-c918a231-ff43-4210-9531-52bea88a6e35": "IT",
  "chl-e59e5aa8-dea1-44c8-8975-b5b9c83d1a98": "NL",
};

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: Review[]; fetchedAt: number } | null = null;
let fetchPromise: Promise<Review[]> | null = null;

async function fetchAllLiveReviews(): Promise<Review[]> {
  const reviews: Review[] = [];

  const heurekaPromises = (["cz", "sk"] as const).map(async (country) => {
    const key =
      country === "cz"
        ? process.env.HEUREKA_CZ_KEY
        : process.env.HEUREKA_SK_KEY;
    if (!key) return [];

    try {
      const heurekaReviews = await heureka.fetchReviews({
        secretKey: key,
        country,
      });
      return heurekaReviews.map((r) => ({
        id: `heureka-${country}-${r.id}`,
        platform_source: "heureka" as const,
        external_review_id: r.id,
        country_code: country.toUpperCase(),
        rating: r.rating,
        review_text: heureka.buildReviewText(r),
        review_text_cz: null,
        customer_name_extracted: null,
        order_id: r.orderId ?? null,
        match_confidence: "unverified" as const,
        ai_category: null,
        ai_sentiment: (r.rating >= 4 ? "positive" : r.rating >= 3 ? "neutral" : "negative") as Review["ai_sentiment"],
        response_draft: null,
        status: "pending" as const,
        created_at: r.date,
        replied_at: null,
        order: null,
      }));
    } catch (err) {
      console.error(`Heureka ${country} fetch error:`, err);
      return [];
    }
  });

  const tsClientId = process.env.TRUSTED_SHOPS_CLIENT_ID;
  const tsClientSecret = process.env.TRUSTED_SHOPS_CLIENT_SECRET;

  const tsPromise = tsClientId && tsClientSecret
    ? (async () => {
        try {
          const tsReviews = await trustedShops.fetchAllAccountReviews({
            clientId: tsClientId,
            clientSecret: tsClientSecret,
          });
          return tsReviews.map((r) => ({
            id: `ts-${r.id}`,
            platform_source: "trusted_shops" as const,
            external_review_id: r.id,
            country_code: CHANNEL_TO_COUNTRY[r.channelRef] ?? "DE",
            rating: r.rating,
            review_text: r.comment || r.title || "(no text)",
            review_text_cz: null,
            customer_name_extracted: r.customer?.email ?? null,
            order_id: r.transaction?.reference ?? null,
            match_confidence: "unverified" as const,
            ai_category: null,
            ai_sentiment: (r.rating >= 4 ? "positive" : r.rating >= 3 ? "neutral" : "negative") as Review["ai_sentiment"],
            response_draft: null,
            status: "pending" as const,
            created_at: r.submittedAt ?? r.createdAt,
            replied_at: null,
            order: null,
          }));
        } catch (err) {
          console.error("Trusted Shops fetch error:", err);
          return [];
        }
      })()
    : Promise.resolve([]);

  const results = await Promise.all([...heurekaPromises, tsPromise]);
  for (const batch of results) {
    reviews.push(...batch);
  }

  reviews.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return reviews;
}

export async function GET() {
  const trustpilotReviews = getWebhookReviews();

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    const merged = [...trustpilotReviews, ...cache.data].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json(merged);
  }

  if (!fetchPromise) {
    fetchPromise = fetchAllLiveReviews()
      .then((data) => {
        cache = { data, fetchedAt: Date.now() };
        fetchPromise = null;
        return data;
      })
      .catch((err) => {
        fetchPromise = null;
        throw err;
      });
  }

  const data = await fetchPromise;
  const merged = [...trustpilotReviews, ...data].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return NextResponse.json(merged);
}

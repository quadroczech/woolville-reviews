import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchProductReviewsPage,
  fetchProductsByIds,
  countryForSource,
  type WpjProductReview,
} from "@/lib/platforms/wpj";

// Pulls WPJ's product catalog + per-product reviews into Supabase (products,
// product_reviews). WPJ's GraphQL API has no date filter and no sort input, so a
// full backfill has to page through the whole collection from offset 0. Each call
// is capped to MAX_PAGES so it stays well inside a serverless function's execution
// limit — the response reports whether more pages remain and the offset to resume
// from; call this endpoint again with that offset until done is true.
const MAX_PAGES_PER_CALL = 20;

function sentimentFor(rating: number): "positive" | "neutral" | "negative" {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
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
  const body = await request.json().catch(() => ({}));
  let offset: number = Number.isInteger(body.offset) ? body.offset : 0;

  let pagesFetched = 0;
  let reviewsUpserted = 0;
  let productsUpserted = 0;
  let hasNextPage = true;
  const collected: WpjProductReview[] = [];

  try {
    while (hasNextPage && pagesFetched < MAX_PAGES_PER_CALL) {
      const page = await fetchProductReviewsPage(offset);
      collected.push(...page.items);
      offset += page.items.length;
      hasNextPage = page.hasNextPage;
      pagesFetched++;
      if (!page.items.length) break;
    }

    if (collected.length) {
      const productIds = [...new Set(collected.map((r) => r.productId))];
      const products = await fetchProductsByIds(productIds);
      productsUpserted = products.length;

      if (products.length) {
        const { error: productsError } = await supabase.from("products").upsert(
          products.map((p) => ({
            id: p.id,
            code: p.code,
            ean: p.ean,
            title: p.title,
            producer_name: p.producer?.name ?? null,
            section_name: p.sections[0]?.name ?? null,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: "id" }
        );
        if (productsError) throw new Error(`products upsert: ${productsError.message}`);
      }

      // Best-effort order linkage: stub-upsert an order row per unique WPJ orderId so
      // product_reviews.order_id can point at it. Not blocking — a review still gets
      // stored (with order_id left null) if this step fails for any reason.
      const orderIdMap = new Map<number, string>();
      const orderIds = [...new Set(collected.map((r) => r.orderId).filter((id): id is number => id !== null))];
      if (orderIds.length) {
        const { data: orderRows, error: ordersError } = await supabase
          .from("orders")
          .upsert(
            orderIds.map((id) => ({ external_order_id: String(id) })),
            { onConflict: "external_order_id", ignoreDuplicates: false }
          )
          .select("id, external_order_id");
        if (!ordersError && orderRows) {
          for (const row of orderRows) orderIdMap.set(Number(row.external_order_id), row.id);
        }
      }

      const { error: reviewsError } = await supabase.from("product_reviews").upsert(
        collected.map((r) => ({
          wpj_review_id: r.id,
          product_id: r.productId,
          order_id: r.orderId !== null ? orderIdMap.get(r.orderId) ?? null : null,
          source: r.source,
          country_code: countryForSource(r.source),
          rating: r.rating,
          recommends: r.recommends,
          pros: r.pros,
          cons: r.cons,
          summary: r.summary,
          reviewer_name: r.name,
          language_code: r.language.code,
          shop_response: r.response?.response ?? null,
          shop_response_at: r.response?.dateCreated ?? null,
          ai_sentiment: sentimentFor(r.rating),
          created_at: r.dateCreated,
        })),
        { onConflict: "wpj_review_id" }
      );
      if (reviewsError) throw new Error(`product_reviews upsert: ${reviewsError.message}`);
      reviewsUpserted = collected.length;
    }

    return NextResponse.json({
      fetched: collected.length,
      reviewsUpserted,
      productsUpserted,
      nextOffset: offset,
      done: !hasNextPage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "WPJ sync failed", nextOffset: offset },
      { status: 502 }
    );
  }
}

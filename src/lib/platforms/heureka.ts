import axios from "axios";
import { parseStringPromise } from "xml2js";

interface HeurekaConfig {
  secretKey: string;
  country: "cz" | "sk";
}

export interface HeurekaReview {
  id: string;
  rating: number;
  pros: string;
  cons: string;
  summary: string;
  orderId?: string;
  date: string;
  recommends: boolean;
  subRatings: {
    deliveryTime?: number;
    transportQuality?: number;
    communication?: number;
    pickupTime?: number;
    pickupQuality?: number;
  };
}

export async function fetchReviews(
  config: HeurekaConfig
): Promise<HeurekaReview[]> {
  const domain = config.country === "sk" ? "heureka.sk" : "heureka.cz";
  const url = `https://www.${domain}/direct/dotaznik/export-review.php?key=${config.secretKey}`;

  const { data: xml } = await axios.get(url, { responseType: "text" });
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const items = parsed?.reviews?.review;
  if (!items) return [];

  const reviews = Array.isArray(items) ? items : [items];

  return reviews.map((r: Record<string, string>) => {
    const totalRating = parseInt(r.total_rating ?? "3", 10);

    return {
      id: r.rating_id ?? `heu-${Date.now()}-${Math.random()}`,
      rating: Math.min(5, Math.max(1, totalRating)),
      pros: r.pros ?? "",
      cons: r.cons ?? "",
      summary: r.summary ?? "",
      orderId: r.order_id,
      date: r.unix_timestamp
        ? new Date(parseInt(r.unix_timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      recommends: r.recommends === "1",
      subRatings: {
        deliveryTime: r.delivery_time ? parseInt(r.delivery_time, 10) : undefined,
        transportQuality: r.transport_quality ? parseInt(r.transport_quality, 10) : undefined,
        communication: r.communication ? parseInt(r.communication, 10) : undefined,
        pickupTime: r.pickup_time ? parseInt(r.pickup_time, 10) : undefined,
        pickupQuality: r.pickup_quality ? parseInt(r.pickup_quality, 10) : undefined,
      },
    };
  });
}

export function buildReviewText(review: HeurekaReview): string {
  const parts: string[] = [];
  if (review.pros) parts.push(`+: ${review.pros}`);
  if (review.cons) parts.push(`-: ${review.cons}`);
  if (review.summary) parts.push(review.summary);
  const subs: string[] = [];
  if (review.subRatings.deliveryTime) subs.push(`Dodání: ${review.subRatings.deliveryTime}/5`);
  if (review.subRatings.transportQuality) subs.push(`Přeprava: ${review.subRatings.transportQuality}/5`);
  if (review.subRatings.communication) subs.push(`Komunikace: ${review.subRatings.communication}/5`);
  if (subs.length) parts.push(subs.join(" | "));
  if (review.recommends) parts.push("✓ Doporučuje");
  return parts.join("\n") || "(bez textu)";
}

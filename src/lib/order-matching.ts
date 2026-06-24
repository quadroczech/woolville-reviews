import { Order, MatchConfidence, Review } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const FUZZY_WINDOW_DAYS = 14;

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function nameDistance(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 0;
  if (na.includes(nb) || nb.includes(na)) return 1;
  const partsA = na.split(/\s+/);
  const partsB = nb.split(/\s+/);
  const overlap = partsA.filter((p) => partsB.includes(p)).length;
  return overlap >= 1 ? 2 : Infinity;
}

export function matchReviewToOrder(
  review: Partial<Review>,
  orders: Order[]
): { order: Order | null; confidence: MatchConfidence } {
  if (!orders.length) return { order: null, confidence: "unverified" };

  const reviewText = review.review_text ?? "";
  for (const order of orders) {
    if (reviewText.includes(order.external_order_id)) {
      return { order, confidence: "exact" };
    }
  }

  if (review.customer_name_extracted) {
    const reviewDate = review.created_at
      ? new Date(review.created_at).getTime()
      : Date.now();

    let bestOrder: Order | null = null;
    let bestScore = Infinity;

    for (const order of orders) {
      if (!order.customer_name) continue;
      const dist = nameDistance(review.customer_name_extracted, order.customer_name);
      if (dist > 2) continue;

      const orderDate = new Date(order.created_at).getTime();
      const daysDiff = Math.abs(reviewDate - orderDate) / DAY_MS;
      if (daysDiff > FUZZY_WINDOW_DAYS) continue;

      const score = dist * 100 + daysDiff;
      if (score < bestScore) {
        bestScore = score;
        bestOrder = order;
      }
    }

    if (bestOrder) {
      return { order: bestOrder, confidence: "fuzzy" };
    }
  }

  return { order: null, confidence: "unverified" };
}

import type { Review } from "./types";

// Deep link to a specific review on its source platform, for the copy-paste reply
// flow on platforms with no reply API (see /api/reviews/[id]/reply). Only built
// where the URL pattern is actually known — guessing one would send an operator to
// a broken link, which is worse than no link at all.
export function platformReviewUrl(review: Pick<Review, "platform_source" | "external_review_id" | "country_code">): string | null {
  switch (review.platform_source) {
    case "trustpilot":
      // Public, per-review URL — confirmed stable regardless of plan tier.
      return `https://www.trustpilot.com/reviews/${review.external_review_id}`;

    case "heureka": {
      // Heureka has no confirmed stable per-review deep link; fall back to the
      // shop's own ratings page if its URL is configured.
      const base =
        review.country_code === "SK" ? process.env.HEUREKA_SK_SHOP_URL : process.env.HEUREKA_CZ_SHOP_URL;
      return base || null;
    }

    case "firmy":
      // No public per-review URL either; link to the business's own Firmy.cz page.
      return process.env.FIRMY_CZ_SHOP_URL || null;

    // Zbozi.cz replies go out via the Sklik Fenix API directly (see
    // /api/reviews/[id]/reply) — no manual link needed. Trusted Shops and Google
    // likewise reply via API or aren't wired up yet.
    default:
      return null;
  }
}

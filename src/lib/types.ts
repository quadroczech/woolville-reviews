export type PlatformSource =
  | "heureka"
  | "google"
  | "trustpilot"
  | "trusted_shops"
  | "zbozi"
  | "firmy";

export type MatchConfidence = "exact" | "fuzzy" | "unverified";

export type AiCategory =
  | "product"
  | "logistics"
  | "web"
  | "service"
  | "mixed";

export type AiSentiment = "positive" | "neutral" | "negative";

export type ReviewStatus = "pending" | "replied" | "ignored";

export interface Order {
  id: string;
  external_order_id: string;
  customer_email: string;
  customer_name: string;
  shipping_country: string;
  created_at: string;
}

export interface Review {
  id: string;
  platform_source: PlatformSource;
  external_review_id: string;
  country_code: string;
  rating: number;
  review_text: string | null;
  review_text_cz: string | null;
  customer_name_extracted: string | null;
  order_id: string | null;
  match_confidence: MatchConfidence;
  ai_category: AiCategory | null;
  ai_sentiment: AiSentiment | null;
  ai_pain_points: string[] | null;
  response_draft: string | null;
  // Deep link to this review on the source platform, for platforms with no reply
  // API (Heureka, Firmy.cz, Trustpilot on the free plan).
  platform_review_url: string | null;
  status: ReviewStatus;
  created_at: string;
  replied_at: string | null;
  order?: Order | null;
}

// Product reviews (about the goods themselves, not the shopping experience) —
// synced from WPJ, which already aggregates Heureka/Arukereso/Compari/Zbozi
// product reviews with the product and order already resolved. See Review above
// for shop-level reviews (delivery, communication, the shop itself).
export type ProductReviewSource =
  | "HEUREKA_CZ"
  | "HEUREKA_SK"
  | "ARUKRESO_HU"
  | "COMPARI_RO"
  | "ZBOZI_CZ";

export interface Product {
  id: number;
  code: string | null;
  ean: string | null;
  title: string;
  producer_name: string | null;
  section_name: string | null;
}

export interface ProductReview {
  id: string;
  wpj_review_id: number;
  product_id: number | null;
  order_id: string | null;
  source: ProductReviewSource;
  country_code: string;
  rating: number;
  recommends: boolean | null;
  pros: string | null;
  cons: string | null;
  summary: string | null;
  reviewer_name: string | null;
  language_code: string | null;
  shop_response: string | null;
  shop_response_at: string | null;
  ai_category: AiCategory | null;
  ai_sentiment: AiSentiment | null;
  ai_pain_points: string[] | null;
  response_draft: string | null;
  status: ReviewStatus;
  created_at: string;
  product?: Product | null;
}

export type ActionItemSeverity = "low" | "medium" | "high";
export type ActionItemStatus = "open" | "done";

export interface CountryActionItem {
  id: string;
  country_code: string;
  title: string;
  description: string;
  severity: ActionItemSeverity;
  category: AiCategory | null;
  related_product_id: number | null;
  source_review_ids: string[];
  status: ActionItemStatus;
  created_at: string;
  resolved_at: string | null;
}

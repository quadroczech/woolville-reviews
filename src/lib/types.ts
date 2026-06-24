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
  response_draft: string | null;
  status: ReviewStatus;
  created_at: string;
  replied_at: string | null;
  order?: Order | null;
}

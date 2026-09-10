// WPJ e-shop connector (GraphQL Admin API). Provides the product catalog and
// per-product reviews WPJ already aggregates from Heureka CZ/SK, Arukereso HU,
// Compari RO and Zbozi.cz — with productId/orderId already resolved, so no fuzzy
// text matching is needed to know which product a review is about.
//
// Auth is a custom X-Access-Token header, not Authorization: Bearer.
// Docs: https://graphql-docs.wpjshop.cz/

const API_URL = process.env.WPJ_API_URL ?? "";
const API_KEY = process.env.WPJ_API_KEY ?? "";
const PAGE_SIZE = 100;

export type WpjProductReviewSource =
  | "HEUREKA_CZ"
  | "HEUREKA_SK"
  | "ARUKRESO_HU"
  | "COMPARI_RO"
  | "ZBOZI_CZ";

// WPJ's review sources are each tied to a single national storefront/marketplace,
// so the country follows directly from the source — no separate order lookup needed.
const SOURCE_COUNTRY: Record<WpjProductReviewSource, string> = {
  HEUREKA_CZ: "CZ",
  HEUREKA_SK: "SK",
  ARUKRESO_HU: "HU",
  COMPARI_RO: "RO",
  ZBOZI_CZ: "CZ",
};

export function countryForSource(source: WpjProductReviewSource): string {
  return SOURCE_COUNTRY[source];
}

export interface WpjProductReview {
  id: number;
  productId: number;
  orderId: number | null;
  rating: number;
  recommends: boolean;
  pros: string | null;
  cons: string | null;
  summary: string | null;
  name: string | null;
  dateCreated: string;
  source: WpjProductReviewSource;
  language: { code: string };
  response: { response: string; dateCreated: string } | null;
}

export interface WpjProduct {
  id: number;
  title: string;
  code: string | null;
  ean: string | null;
  producer: { name: string } | null;
  sections: { name: string }[];
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  if (!API_URL || !API_KEY) {
    throw new Error("WPJ is not configured (WPJ_API_URL, WPJ_API_KEY)");
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`WPJ API ${res.status}: ${await res.text()}`);
  }

  const body: GraphQLResponse<T> = await res.json();
  if (body.errors?.length) {
    throw new Error(`WPJ API error: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  if (!body.data) {
    throw new Error("WPJ API returned no data");
  }
  return body.data;
}

const REVIEW_FIELDS = `
  id productId orderId rating recommends pros cons summary name dateCreated source
  language { code }
  response { response dateCreated }
`;

export interface ProductReviewPage {
  items: WpjProductReview[];
  hasNextPage: boolean;
}

// A single page of the reviews query. WPJ's API has no date filter and no sort
// input, so the caller is responsible for paging from offset 0 for a full backfill,
// or from a previously-recorded offset for an incremental sync — see the sync route
// for how the offset is chosen. Ordering (ascending by id, oldest first) was
// confirmed empirically; it isn't a documented guarantee, so an incremental sync
// still upserts by wpj_review_id and re-checks hasNextPage rather than trusting the
// offset blindly.
export async function fetchProductReviewsPage(
  offset: number,
  limit: number = PAGE_SIZE
): Promise<ProductReviewPage> {
  const data = await graphqlRequest<{
    reviews: { items: WpjProductReview[]; hasNextPage: boolean };
  }>(
    `query($offset: Int, $limit: Int) {
      reviews(offset: $offset, limit: $limit, filter: { figure: [APPROVED, TOP] }) {
        items { ${REVIEW_FIELDS} }
        hasNextPage
      }
    }`,
    { offset, limit }
  );
  return data.reviews;
}

export async function fetchProductsByIds(ids: number[]): Promise<WpjProduct[]> {
  if (!ids.length) return [];
  const unique = Array.from(new Set(ids));
  const all: WpjProduct[] = [];

  // ProductFilterInput.id takes a list, but keep batches modest to stay well under
  // any request-size limit on the WPJ side.
  for (let i = 0; i < unique.length; i += PAGE_SIZE) {
    const batch = unique.slice(i, i + PAGE_SIZE);
    const data = await graphqlRequest<{ products: { items: WpjProduct[] } }>(
      `query($ids: [Int]) {
        products(limit: ${PAGE_SIZE}, filter: { id: $ids }) {
          items { id title code ean producer { name } sections { name } }
        }
      }`,
      { ids: batch }
    );
    all.push(...data.products.items);
  }

  return all;
}

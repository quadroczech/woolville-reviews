import { Review, CountryActionItem } from "./types";
import { mockReviews } from "./mock-data";

const USE_SUPABASE = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function fetchReviews(params?: {
  status?: string;
  platform?: string;
}): Promise<Review[]> {
  if (USE_SUPABASE) {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.platform) sp.set("platform", params.platform);

    const res = await fetch(`/api/reviews?${sp.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch reviews");
    return res.json();
  }

  const res = await fetch("/api/reviews/live");
  if (res.ok) {
    let data: Review[] = await res.json();
    if (data.length > 0) {
      if (params?.status && params.status !== "all") {
        data = data.filter((r) => r.status === params.status);
      }
      if (params?.platform && params.platform !== "all") {
        data = data.filter((r) => r.platform_source === params.platform);
      }
      return data;
    }
  }

  let data = [...mockReviews];
  if (params?.status && params.status !== "all") {
    data = data.filter((r) => r.status === params.status);
  }
  if (params?.platform && params.platform !== "all") {
    data = data.filter((r) => r.platform_source === params.platform);
  }
  return data;
}

export async function updateReview(
  id: string,
  updates: Partial<Review>
): Promise<Review> {
  if (!USE_SUPABASE) {
    const review = mockReviews.find((r) => r.id === id);
    if (!review) throw new Error("Review not found");
    return { ...review, ...updates };
  }

  const res = await fetch(`/api/reviews/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update review");
  return res.json();
}

export async function processReviewAI(id: string): Promise<Review> {
  if (!USE_SUPABASE) {
    const review = mockReviews.find((r) => r.id === id);
    if (!review) throw new Error("Review not found");
    return review;
  }

  const res = await fetch(`/api/reviews/${id}/ai`, { method: "POST" });
  if (!res.ok) throw new Error("AI processing failed");
  return res.json();
}

export async function syncPlatforms(
  platforms?: string[]
): Promise<{ results: Array<{ platform: string; fetched: number; inserted: number; error?: string }> }> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platforms: platforms ?? ["all"] }),
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

export interface BatchAIProgress {
  shopReviewsProcessed: number;
  productReviewsProcessed: number;
  actionItemsCreated: number;
  errors: string[];
}

// The endpoint processes at most ~25 reviews of each kind per call to stay inside a
// serverless function's execution limit, so this drives it to completion here and
// reports running totals via onProgress after every call.
export async function processBatchAI(
  onProgress?: (progress: BatchAIProgress) => void
): Promise<BatchAIProgress> {
  const totals: BatchAIProgress = {
    shopReviewsProcessed: 0,
    productReviewsProcessed: 0,
    actionItemsCreated: 0,
    errors: [],
  };

  for (;;) {
    const res = await fetch("/api/reviews/ai/process-batch", { method: "POST" });
    if (!res.ok) throw new Error("AI batch processing failed");
    const page = await res.json();

    totals.shopReviewsProcessed += page.shopReviewsProcessed ?? 0;
    totals.productReviewsProcessed += page.productReviewsProcessed ?? 0;
    totals.actionItemsCreated += page.actionItemsCreated ?? 0;
    totals.errors.push(...(page.errors ?? []));
    onProgress?.({ ...totals });

    if (page.done) break;
  }

  return totals;
}

export async function fetchActionItems(params?: {
  status?: string;
  country?: string;
}): Promise<CountryActionItem[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.country) sp.set("country", params.country);

  const res = await fetch(`/api/action-items?${sp.toString()}`);
  if (!res.ok) return [];
  return res.json();
}

export async function updateActionItem(
  id: string,
  status: "open" | "done"
): Promise<CountryActionItem> {
  const res = await fetch(`/api/action-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update action item");
  return res.json();
}

export async function sendReply(id: string, replyText?: string): Promise<Review> {
  const res = await fetch(`/api/reviews/${id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(replyText ? { replyText } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Sending the reply failed");
  return body;
}

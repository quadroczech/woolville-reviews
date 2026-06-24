import { Review } from "./types";
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

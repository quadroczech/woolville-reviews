import axios from "axios";

interface GoogleBusinessConfig {
  accessToken: string;
  accountId: string;
  locationId: string;
}

export interface GoogleReview {
  name: string;
  reviewId: string;
  reviewer: { displayName: string };
  starRating: string;
  comment: string;
  createTime: string;
  updateTime: string;
}

const STAR_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function mapStarRating(starRating: string): number {
  return STAR_MAP[starRating] ?? 3;
}

export async function fetchReviews(
  config: GoogleBusinessConfig,
  pageToken?: string
): Promise<{ reviews: GoogleReview[]; nextPageToken?: string }> {
  const { data } = await axios.get(
    `https://mybusinessreviews.googleapis.com/v1/accounts/${config.accountId}/locations/${config.locationId}/reviews`,
    {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      params: { pageSize: 50, pageToken },
    }
  );
  return {
    reviews: data.reviews ?? [],
    nextPageToken: data.nextPageToken,
  };
}

export async function replyToReview(
  config: GoogleBusinessConfig,
  reviewName: string,
  comment: string
): Promise<void> {
  await axios.put(
    `https://mybusinessreviews.googleapis.com/v1/${reviewName}/reply`,
    { comment },
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );
}

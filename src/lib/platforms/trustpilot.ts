import axios from "axios";

interface TrustpilotConfig {
  apiKey: string;
  apiSecret: string;
  businessUnitId: string;
  username: string;
  password: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: TrustpilotConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${config.apiKey}:${config.apiSecret}`
  ).toString("base64");

  const { data } = await axios.post(
    "https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken",
    new URLSearchParams({
      grant_type: "password",
      username: config.username,
      password: config.password,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export interface TrustpilotReview {
  id: string;
  title: string;
  text: string;
  stars: number;
  createdAt: string;
  consumer: { displayName: string };
}

export async function fetchReviews(
  config: TrustpilotConfig,
  params?: { perPage?: number; page?: number }
): Promise<TrustpilotReview[]> {
  const { data } = await axios.get(
    `https://api.trustpilot.com/v1/business-units/${config.businessUnitId}/reviews`,
    {
      headers: { apikey: config.apiKey },
      params: {
        perPage: params?.perPage ?? 20,
        page: params?.page ?? 1,
      },
    }
  );
  return data.reviews ?? [];
}

export async function replyToReview(
  config: TrustpilotConfig,
  reviewId: string,
  message: string
): Promise<void> {
  const token = await getAccessToken(config);
  await axios.post(
    `https://api.trustpilot.com/v1/private/business-units/${config.businessUnitId}/reviews/${reviewId}/reply`,
    { message },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

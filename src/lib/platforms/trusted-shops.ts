import axios from "axios";

interface TrustedShopsAuthConfig {
  clientId: string;
  clientSecret: string;
}

interface TrustedShopsConfig extends TrustedShopsAuthConfig {
  channelId: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: TrustedShopsAuthConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const { data } = await axios.post(
    "https://login.etrusted.com/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: "https://api.etrusted.com",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export interface TrustedShopsReview {
  id: string;
  title: string;
  comment: string;
  rating: number;
  createdAt: string;
  submittedAt: string;
  customer?: { email?: string };
  transaction?: { reference?: string; date?: string };
  channelRef: string;
}

export async function fetchAllAccountReviews(
  config: TrustedShopsAuthConfig
): Promise<TrustedShopsReview[]> {
  const token = await getAccessToken(config);
  const all: TrustedShopsReview[] = [];
  let after: string | undefined;

  for (let page = 0; page < 40; page++) {
    const queryParams: Record<string, string | number> = { count: 50 };
    if (after) queryParams.after = after;

    const { data } = await axios.get("https://api.etrusted.com/reviews", {
      headers: { Authorization: `Bearer ${token}` },
      params: queryParams,
    });

    const items: TrustedShopsReview[] = data.items ?? [];
    if (items.length === 0) break;
    all.push(...items);
    after = items[items.length - 1].id;
    if (items.length < 50) break;
  }

  return all;
}

export async function replyToReview(
  config: TrustedShopsConfig,
  reviewId: string,
  comment: string
): Promise<void> {
  const token = await getAccessToken(config);
  await axios.post(
    `https://api.etrusted.com/reviews/${reviewId}/responses`,
    { comment },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

"use client";

import { useState, useEffect } from "react";
import { fetchReviews } from "@/lib/api-client";
import { Review } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Loader2 } from "lucide-react";

function CountryFlag({ code, size = 24 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w80/${code.toLowerCase()}.png`}
      alt={code}
      width={size}
      height={Math.round(size * 0.75)}
      className="inline-block rounded-sm"
      style={{ verticalAlign: "middle" }}
    />
  );
}

interface MarketConfig {
  code: string;
  name: string;
  platforms: string[];
}

const markets: MarketConfig[] = [
  { code: "CZ", name: "Czechia", platforms: ["Heureka.cz", "Zbozi.cz", "Firmy.cz"] },
  { code: "SK", name: "Slovakia", platforms: ["Heureka.sk"] },
  { code: "DE", name: "Germany", platforms: ["Trustpilot", "Trusted Shops"] },
  { code: "AT", name: "Austria", platforms: ["Trusted Shops"] },
  { code: "CH", name: "Switzerland", platforms: ["Trusted Shops"] },
  { code: "FR", name: "France", platforms: ["Trusted Shops"] },
  { code: "IT", name: "Italy", platforms: ["Trusted Shops"] },
  { code: "NL", name: "Netherlands", platforms: ["Trusted Shops"] },
  { code: "BE", name: "Belgium", platforms: ["Trusted Shops"] },
  { code: "HU", name: "Hungary", platforms: ["Trusted Shops"] },
  { code: "RO", name: "Romania", platforms: ["Trusted Shops"] },
];

export default function MarketsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews().then((data) => {
      setReviews(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const byCountry = reviews.reduce<
    Record<string, { count: number; sum: number; pending: number; negative: number }>
  >((acc, r) => {
    if (!acc[r.country_code])
      acc[r.country_code] = { count: 0, sum: 0, pending: 0, negative: 0 };
    acc[r.country_code].count++;
    acc[r.country_code].sum += r.rating;
    if (r.status === "pending") acc[r.country_code].pending++;
    if (r.ai_sentiment === "negative") acc[r.country_code].negative++;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
        <p className="text-sm text-muted-foreground">
          Review coverage across all Woolville markets &middot; {reviews.length.toLocaleString()} reviews
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {markets.map((market) => {
          const data = byCountry[market.code];
          const avg = data ? (data.sum / data.count).toFixed(1) : "—";
          const hasData = !!data;

          return (
            <Card
              key={market.code}
              className={!hasData ? "opacity-60" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CountryFlag code={market.code} />
                    {market.name}
                  </CardTitle>
                  {hasData && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-bold">{avg}</span>
                      <span className="text-sm text-muted-foreground">/ 5.0</span>
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    </div>
                  )}
                </div>
                <CardDescription>{market.code}</CardDescription>
              </CardHeader>
              <CardContent>
                {hasData && (
                  <div className="mb-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(Number(avg) / 5) * 100}%`,
                          backgroundColor: Number(avg) >= 4.5 ? "#16a34a" : Number(avg) >= 4.0 ? "#ca8a04" : Number(avg) >= 3.0 ? "#ea580c" : "#dc2626",
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1 mb-3">
                  {market.platforms.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
                {hasData ? (
                  <div className="flex gap-4 text-sm">
                    <span>
                      <strong>{data.count}</strong>{" "}
                      <span className="text-muted-foreground">{data.count === 1 ? "review" : "reviews"}</span>
                    </span>
                    {data.pending > 0 && (
                      <span className="text-yellow-600">
                        {data.pending} pending
                      </span>
                    )}
                    {data.negative > 0 && (
                      <span className="text-red-600">
                        {data.negative} negative
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No reviews yet — configure API keys in Settings
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

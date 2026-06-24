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
import {
  Star,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Loader2,
} from "lucide-react";

function CountryFlag({ code, size = 16 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={code}
      width={size}
      height={Math.round(size * 0.75)}
      className="inline-block rounded-sm"
      style={{ verticalAlign: "middle" }}
    />
  );
}

export default function AnalyticsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews().then((data) => {
      setReviews(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  const total = reviews.length;
  const avgRating = (
    reviews.reduce((s, r) => s + r.rating, 0) / total
  ).toFixed(1);
  const pending = reviews.filter((r) => r.status === "pending").length;
  const replied = reviews.filter((r) => r.status === "replied").length;
  const positive = reviews.filter((r) => r.ai_sentiment === "positive").length;
  const negative = reviews.filter((r) => r.ai_sentiment === "negative").length;
  const neutral = reviews.filter((r) => r.ai_sentiment === "neutral").length;

  const byPlatform = reviews.reduce<Record<string, { count: number; sum: number }>>(
    (acc, r) => {
      if (!acc[r.platform_source]) acc[r.platform_source] = { count: 0, sum: 0 };
      acc[r.platform_source].count++;
      acc[r.platform_source].sum += r.rating;
      return acc;
    },
    {}
  );

  const byCountry = reviews.reduce<Record<string, { count: number; sum: number }>>(
    (acc, r) => {
      if (!acc[r.country_code]) acc[r.country_code] = { count: 0, sum: 0 };
      acc[r.country_code].count++;
      acc[r.country_code].sum += r.rating;
      return acc;
    },
    {}
  );

  const byCategory = reviews.reduce<Record<string, number>>((acc, r) => {
    const cat = r.ai_category ?? "uncategorized";
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  const ratingDist = [1, 2, 3, 4, 5].map(
    (star) => reviews.filter((r) => r.rating === star).length
  );
  const maxBar = Math.max(...ratingDist, 1);

  const platformLabels: Record<string, string> = {
    heureka: "Heureka",
    trustpilot: "Trustpilot",
    trusted_shops: "Trusted Shops",
    zbozi: "Zbozi.cz",
    firmy: "Firmy.cz",
    google: "Google",
  };

  const categoryColors: Record<string, string> = {
    product: "bg-blue-100 text-blue-800",
    logistics: "bg-orange-100 text-orange-800",
    web: "bg-purple-100 text-purple-800",
    service: "bg-emerald-100 text-emerald-800",
    mixed: "bg-gray-100 text-gray-800",
    uncategorized: "bg-gray-50 text-gray-500",
  };

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
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Overview of review performance across all markets &middot; {total.toLocaleString()} reviews
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Reviews</CardDescription>
            <CardTitle className="text-3xl">{total}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {pending} pending response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Rating</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              {avgRating}
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {Number(avgRating) >= 4 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              across all platforms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Response Rate</CardDescription>
            <CardTitle className="text-3xl">
              {total > 0 ? Math.round((replied / total) * 100) : 0}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {replied} of {total} replied
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sentiment Split</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-3">
              <span className="flex items-center gap-1 text-green-600">
                <ThumbsUp className="h-4 w-4" /> {positive}
              </span>
              <span className="flex items-center gap-1 text-gray-400">
                <Minus className="h-4 w-4" /> {neutral}
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <ThumbsDown className="h-4 w-4" /> {negative}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              AI-detected sentiment
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rating distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="flex items-center gap-3">
                <span className="w-8 text-sm text-right">{star} <Star className="inline h-3 w-3 fill-yellow-400 text-yellow-400" /></span>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded transition-all"
                    style={{
                      width: `${(ratingDist[star - 1] / maxBar) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-6 text-sm text-muted-foreground text-right">
                  {ratingDist[star - 1]}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By platform */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byPlatform)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([platform, data]) => (
                  <div
                    key={platform}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm font-medium">
                      {platformLabels[platform] ?? platform}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {data.count} reviews
                      </span>
                      <Badge variant="outline">
                        {(data.sum / data.count).toFixed(1)} <Star className="ml-0.5 inline h-3 w-3 fill-yellow-400 text-yellow-400" />
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* By country */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Country</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byCountry)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([code, data]) => (
                  <div key={code} className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <CountryFlag code={code} /> {code}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {data.count} reviews
                      </span>
                      <Badge variant="outline">
                        {(data.sum / data.count).toFixed(1)} <Star className="ml-0.5 inline h-3 w-3 fill-yellow-400 text-yellow-400" />
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* By category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Category</CardTitle>
            <CardDescription>AI-detected review topics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <Badge className={categoryColors[cat] ?? ""}>
                      {cat}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

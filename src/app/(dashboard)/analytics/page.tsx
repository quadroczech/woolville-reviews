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
  ArrowUpRight,
  ArrowDownRight,
  Equal,
  Calendar,
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

  const now = new Date();

  function periodStats(from: Date, to: Date, countryFilter?: string) {
    const inRange = reviews.filter((r) => {
      const d = new Date(r.created_at);
      if (d < from || d >= to) return false;
      if (countryFilter && r.country_code !== countryFilter) return false;
      return true;
    });
    const count = inRange.length;
    const avg = count > 0 ? inRange.reduce((s, r) => s + r.rating, 0) / count : 0;
    const neg = inRange.filter((r) => r.ai_sentiment === "negative").length;
    return { count, avg, neg };
  }

  const countries = [...new Set(reviews.map((r) => r.country_code))].sort();

  const countryNames: Record<string, string> = {
    CZ: "Czechia", SK: "Slovakia", DE: "Germany", AT: "Austria",
    CH: "Switzerland", FR: "France", IT: "Italy", NL: "Netherlands",
    BE: "Belgium", HU: "Hungary", RO: "Romania",
  };

  function startOfWeek(d: Date) {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = day === 0 ? 6 : day - 1;
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  const thisWeekStart = startOfWeek(now);
  const prevWeekStart = new Date(thisWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevYearEnd = new Date(now.getFullYear(), 0, 1);

  const wow = {
    current: periodStats(thisWeekStart, now),
    previous: periodStats(prevWeekStart, thisWeekStart),
  };
  const mom = {
    current: periodStats(thisMonthStart, now),
    previous: periodStats(prevMonthStart, thisMonthStart),
  };
  const yoy = {
    current: periodStats(thisYearStart, now),
    previous: periodStats(prevYearStart, prevYearEnd),
  };

  function deltaIcon(current: number, previous: number) {
    if (previous === 0) return <Minus className="h-3.5 w-3.5 text-gray-400" />;
    if (current > previous + 0.05) return <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />;
    if (current < previous - 0.05) return <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />;
    return <Equal className="h-3.5 w-3.5 text-gray-400" />;
  }

  function deltaColor(current: number, previous: number) {
    if (previous === 0) return "text-gray-500";
    if (current > previous + 0.05) return "text-green-600";
    if (current < previous - 0.05) return "text-red-600";
    return "text-gray-500";
  }

  function formatDelta(current: number, previous: number) {
    if (previous === 0) return "—";
    const diff = current - previous;
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(2)}`;
  }

  function countDelta(current: number, previous: number) {
    if (previous === 0) return current > 0 ? "+∞%" : "—";
    const pct = ((current - previous) / previous) * 100;
    const sign = pct > 0 ? "+" : "";
    return `${sign}${Math.round(pct)}%`;
  }

  const ratingDist = [1, 2, 3, 4, 5].map(
    (star) => reviews.filter((r) => Math.round(r.rating) === star).length
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

      {/* Period comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Period Comparison</CardTitle>
          </div>
          <CardDescription>Rating and volume trends week-over-week, month-over-month, year-over-year</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              { label: "Week over Week", data: wow, periodLabel: ["This week", "Last week"] },
              { label: "Month over Month", data: mom, periodLabel: ["This month", "Last month"] },
              { label: "Year over Year", data: yoy, periodLabel: [String(now.getFullYear()), String(now.getFullYear() - 1)] },
            ] as const).map(({ label, data: d, periodLabel }) => (
              <div key={label} className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold">{label}</h3>

                {/* Rating comparison */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Rating</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {d.current.count > 0 ? d.current.avg.toFixed(2) : "—"}
                    </span>
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {d.current.count > 0 && d.previous.count > 0 && (
                      <span className={`text-sm font-medium flex items-center gap-0.5 ${deltaColor(d.current.avg, d.previous.avg)}`}>
                        {deltaIcon(d.current.avg, d.previous.avg)}
                        {formatDelta(d.current.avg, d.previous.avg)}
                      </span>
                    )}
                  </div>
                  {d.previous.count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {periodLabel[1]}: {d.previous.avg.toFixed(2)} <Star className="inline h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    </p>
                  )}
                </div>

                {/* Volume comparison */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Reviews</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{d.current.count.toLocaleString()}</span>
                    {d.previous.count > 0 && (
                      <span className={`text-xs font-medium ${d.current.count >= d.previous.count ? "text-green-600" : "text-red-600"}`}>
                        {countDelta(d.current.count, d.previous.count)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel[1]}: {d.previous.count.toLocaleString()}
                  </p>
                </div>

                {/* Negative reviews */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Negative</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{d.current.neg}</span>
                    {d.current.count > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({d.current.count > 0 ? ((d.current.neg / d.current.count) * 100).toFixed(1) : 0}%)
                      </span>
                    )}
                  </div>
                  {d.previous.count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {periodLabel[1]}: {d.previous.neg} ({((d.previous.neg / d.previous.count) * 100).toFixed(1)}%)
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-country period comparison */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Comparison by Country</CardTitle>
          </div>
          <CardDescription>WoW / MoM / YoY rating and volume per market</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">Country</th>
                  <th className="text-center px-2 py-2 font-medium" colSpan={3}>Week over Week</th>
                  <th className="text-center px-2 py-2 font-medium border-l" colSpan={3}>Month over Month</th>
                  <th className="text-center px-2 py-2 font-medium border-l" colSpan={3}>Year over Year</th>
                </tr>
                <tr className="border-b text-xs text-muted-foreground">
                  <th></th>
                  <th className="px-2 py-1 font-normal">Rating</th>
                  <th className="px-2 py-1 font-normal">Vol</th>
                  <th className="px-2 py-1 font-normal">Neg%</th>
                  <th className="px-2 py-1 font-normal border-l">Rating</th>
                  <th className="px-2 py-1 font-normal">Vol</th>
                  <th className="px-2 py-1 font-normal">Neg%</th>
                  <th className="px-2 py-1 font-normal border-l">Rating</th>
                  <th className="px-2 py-1 font-normal">Vol</th>
                  <th className="px-2 py-1 font-normal">Neg%</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((code) => {
                  const cWow = {
                    current: periodStats(thisWeekStart, now, code),
                    previous: periodStats(prevWeekStart, thisWeekStart, code),
                  };
                  const cMom = {
                    current: periodStats(thisMonthStart, now, code),
                    previous: periodStats(prevMonthStart, thisMonthStart, code),
                  };
                  const cYoy = {
                    current: periodStats(thisYearStart, now, code),
                    previous: periodStats(prevYearStart, prevYearEnd, code),
                  };

                  function renderPeriod(d: { current: { count: number; avg: number; neg: number }; previous: { count: number; avg: number; neg: number } }, borderLeft?: boolean) {
                    const cur = d.current;
                    const prev = d.previous;
                    const negPct = cur.count > 0 ? (cur.neg / cur.count) * 100 : 0;
                    const prevNegPct = prev.count > 0 ? (prev.neg / prev.count) * 100 : 0;
                    return (
                      <>
                        <td className={`px-2 py-2 text-center ${borderLeft ? "border-l" : ""}`}>
                          {cur.count > 0 ? (
                            <span className="flex items-center justify-center gap-1">
                              <span className="font-medium">{cur.avg.toFixed(1)}</span>
                              {prev.count > 0 && (
                                <span className={`text-xs ${deltaColor(cur.avg, prev.avg)}`}>
                                  {formatDelta(cur.avg, prev.avg)}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {cur.count > 0 ? (
                            <span className="flex items-center justify-center gap-1">
                              <span>{cur.count}</span>
                              {prev.count > 0 && (
                                <span className={`text-xs ${cur.count >= prev.count ? "text-green-600" : "text-red-600"}`}>
                                  {countDelta(cur.count, prev.count)}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {cur.count > 0 ? (
                            <span className={negPct > 10 ? "text-red-600 font-medium" : negPct > 5 ? "text-orange-600" : ""}>
                              {negPct.toFixed(0)}%
                              {prev.count > 0 && prevNegPct > 0 && (
                                <span className={`text-xs ml-1 ${negPct < prevNegPct ? "text-green-600" : negPct > prevNegPct ? "text-red-600" : "text-gray-400"}`}>
                                  {negPct < prevNegPct ? "↓" : negPct > prevNegPct ? "↑" : "="}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </>
                    );
                  }

                  return (
                    <tr key={code} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-2 font-medium">
                          <CountryFlag code={code} />
                          {countryNames[code] ?? code}
                        </span>
                      </td>
                      {renderPeriod(cWow)}
                      {renderPeriod(cMom, true)}
                      {renderPeriod(cYoy, true)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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

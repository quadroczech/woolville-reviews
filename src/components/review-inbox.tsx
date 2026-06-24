"use client";

import { useState, useEffect, useCallback } from "react";
import { mockReviews } from "@/lib/mock-data";
import { Review, PlatformSource, ReviewStatus, MatchConfidence } from "@/lib/types";
import {
  fetchReviews as apiFetchReviews,
  updateReview,
  processReviewAI,
  syncPlatforms,
} from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  ExternalLink,
  Copy,
  Check,
  X,
  MessageSquare,
  Filter,
  Calendar,
  RefreshCw,
  Sparkles,
  Loader2,
} from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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

function CountryLabel({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <CountryFlag code={code} />
      <span>{code}</span>
    </span>
  );
}

const platformLabels: Record<PlatformSource, string> = {
  heureka: "Heureka",
  google: "Google",
  trustpilot: "Trustpilot",
  trusted_shops: "Trusted Shops",
  zbozi: "Zbozi.cz",
  firmy: "Firmy.cz",
};

const platformUrls: Record<PlatformSource, string> = {
  heureka: "https://www.heureka.cz/",
  google: "https://business.google.com/reviews",
  trustpilot: "https://www.trustpilot.com/evaluate/woolville.de",
  trusted_shops: "https://www.trustedshops.com/",
  zbozi: "https://www.zbozi.cz/",
  firmy: "https://www.firmy.cz/",
};

const platformColors: Record<PlatformSource, string> = {
  heureka: "bg-green-100 text-green-800",
  google: "bg-blue-100 text-blue-800",
  trustpilot: "bg-emerald-100 text-emerald-800",
  trusted_shops: "bg-yellow-100 text-yellow-800",
  zbozi: "bg-orange-100 text-orange-800",
  firmy: "bg-purple-100 text-purple-800",
};

const sentimentColors: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  neutral: "bg-gray-100 text-gray-800",
  negative: "bg-red-100 text-red-800",
};

const statusColors: Record<ReviewStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  replied: "bg-green-100 text-green-800",
  ignored: "bg-gray-100 text-gray-500",
};

const matchColors: Record<MatchConfidence, string> = {
  exact: "bg-green-100 text-green-800",
  fuzzy: "bg-amber-100 text-amber-800",
  unverified: "bg-red-100 text-red-700",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-yellow-400 text-yellow-400"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

function ReviewDetail({
  review,
  onClose,
  onUpdate,
}: {
  review: Review;
  onClose: () => void;
  onUpdate: (updated: Review) => void;
}) {
  const [draft, setDraft] = useState(review.response_draft ?? "");
  const [copied, setCopied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(review.response_draft ?? "");
  }, [review.id, review.response_draft]);

  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAIProcess = async () => {
    setAiLoading(true);
    try {
      const updated = await processReviewAI(review.id);
      onUpdate(updated);
    } catch {
      // AI not configured
    } finally {
      setAiLoading(false);
    }
  };

  const handleStatusChange = async (status: ReviewStatus) => {
    setSaving(true);
    try {
      const updates: Partial<Review> = { status };
      if (status === "replied") {
        updates.replied_at = new Date().toISOString();
        updates.response_draft = draft;
      }
      const updated = await updateReview(review.id, updates);
      onUpdate(updated);
    } catch {
      // ignore in mock mode
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">
            {review.customer_name_extracted ?? "Anonymous"}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            {platformLabels[review.platform_source]} &middot;{" "}
            <CountryLabel code={review.country_code} />
          </p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StarRating rating={review.rating} />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(review.created_at)}
          </span>
          <Badge variant="outline" className={matchColors[review.match_confidence]}>
            {review.match_confidence === "fuzzy"
              ? "Suggested Match"
              : review.match_confidence}
          </Badge>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Original Review
          </p>
          <p className="mt-1 text-sm">{review.review_text}</p>
        </div>

        {review.review_text_cz &&
          review.review_text_cz !== review.review_text && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Czech Translation
              </p>
              <p className="mt-1 text-sm">{review.review_text_cz}</p>
            </div>
          )}

        {review.order && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wider">Matched Order</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {review.order.external_order_id} &mdash;{" "}
              {review.order.customer_name} ({review.order.customer_email})
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {review.ai_category && (
            <Badge variant="outline">{review.ai_category}</Badge>
          )}
          {review.ai_sentiment && (
            <Badge
              variant="outline"
              className={sentimentColors[review.ai_sentiment]}
            >
              {review.ai_sentiment}
            </Badge>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider">
            Response Draft
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="AI-generated response will appear here..."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleAIProcess} disabled={aiLoading}>
              {aiLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              {aiLoading ? "Processing..." : "AI Process"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? (
                <Check className="mr-1 h-3 w-3" />
              ) : (
                <Copy className="mr-1 h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  platformUrls[review.platform_source],
                  "_blank",
                  "noopener"
                )
              }
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Open {platformLabels[review.platform_source]}
            </Button>
          </div>
          {review.status === "pending" && (
            <div className="mt-3 flex gap-2 border-t pt-3">
              <Button
                size="sm"
                variant="default"
                disabled={saving || !draft}
                onClick={() => handleStatusChange("replied")}
              >
                <Check className="mr-1 h-3 w-3" />
                Mark Replied
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => handleStatusChange("ignored")}
              >
                <X className="mr-1 h-3 w-3" />
                Ignore
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReviewInbox() {
  const [reviews, setReviews] = useState<Review[]>(mockReviews);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const loadReviews = useCallback(async () => {
    try {
      const data = await apiFetchReviews({
        status: statusFilter,
        platform: platformFilter,
      });
      setReviews(data);
    } catch {
      // keep mock data on failure
    }
  }, [statusFilter, platformFilter]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncPlatforms();
      await loadReviews();
    } catch {
      // ignore when not configured
    } finally {
      setSyncing(false);
    }
  };

  const handleReviewUpdate = (updated: Review) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
    setSelectedReview(updated);
  };

  const filtered = reviews.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (platformFilter !== "all" && r.platform_source !== platformFilter) return false;
    if (countryFilter !== "all" && r.country_code !== countryFilter) return false;
    return true;
  });

  const uniqueCountries = [...new Set(reviews.map((r) => r.country_code))].sort();

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, platformFilter, countryFilter]);

  const pendingCount = reviews.filter((r) => r.status === "pending").length;
  const negativeCount = reviews.filter(
    (r) => r.ai_sentiment === "negative"
  ).length;

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Main list area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Review Inbox
            </h1>
            <p className="text-sm text-muted-foreground">
              {pendingCount} pending &middot; {negativeCount} negative &middot;{" "}
              {reviews.length} total
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              {syncing ? "Syncing..." : "Sync"}
            </Button>
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={countryFilter} onValueChange={(v) => setCountryFilter(v ?? "all")}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {uniqueCountries.map((code) => (
                  <SelectItem key={code} value={code}>
                    <CountryLabel code={code} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v ?? "all")}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="heureka">Heureka</SelectItem>
                <SelectItem value="trustpilot">Trustpilot</SelectItem>
                <SelectItem value="trusted_shops">Trusted Shops</SelectItem>
                <SelectItem value="zbozi">Zbozi.cz</SelectItem>
                <SelectItem value="firmy">Firmy.cz</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="table" className="p-4">
            <TabsList>
              <TabsTrigger value="table">Table View</TabsTrigger>
              <TabsTrigger value="cards">Card View</TabsTrigger>
            </TabsList>

            <TabsContent value="table" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Source</TableHead>
                      <TableHead className="w-[80px]">Country</TableHead>
                      <TableHead className="w-[100px]">Rating</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="w-[140px]">Matched Order</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((review) => (
                      <TableRow
                        key={review.id}
                        className={`cursor-pointer ${
                          selectedReview?.id === review.id
                            ? "bg-muted/50"
                            : ""
                        }`}
                        onClick={() => setSelectedReview(review)}
                      >
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={platformColors[review.platform_source]}
                          >
                            {platformLabels[review.platform_source]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <CountryLabel code={review.country_code} />
                        </TableCell>
                        <TableCell>
                          <StarRating rating={review.rating} />
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">
                          {review.review_text_cz ?? review.review_text}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(review.created_at)}
                        </TableCell>
                        <TableCell>
                          {review.order ? (
                            <Badge
                              variant="outline"
                              className={matchColors[review.match_confidence]}
                            >
                              {review.match_confidence === "fuzzy"
                                ? "Suggested"
                                : review.order.external_order_id.slice(-7)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Unverified
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColors[review.status]}
                          >
                            {review.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No reviews match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-3">
                <p className="text-sm text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            <TabsContent value="cards" className="mt-4">
              <div className="grid gap-3 md:grid-cols-2">
                {paged.map((review) => (
                  <Card
                    key={review.id}
                    className={`cursor-pointer transition-shadow hover:shadow-md ${
                      selectedReview?.id === review.id
                        ? "ring-2 ring-primary"
                        : ""
                    }`}
                    onClick={() => setSelectedReview(review)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={platformColors[review.platform_source]}
                        >
                          {platformLabels[review.platform_source]}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={statusColors[review.status]}
                        >
                          {review.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-sm flex items-center gap-1">
                        {review.customer_name_extracted ?? "Anonymous"}{" "}
                        <span className="font-normal text-muted-foreground inline-flex items-center gap-1">
                          (<CountryLabel code={review.country_code} />)
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <StarRating rating={review.rating} />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(review.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {review.review_text_cz ?? review.review_text}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Detail side panel */}
      {selectedReview && (
        <div className="w-[420px] shrink-0 border-l bg-background overflow-hidden">
          <ReviewDetail
            review={selectedReview}
            onClose={() => setSelectedReview(null)}
            onUpdate={handleReviewUpdate}
          />
        </div>
      )}
    </div>
  );
}

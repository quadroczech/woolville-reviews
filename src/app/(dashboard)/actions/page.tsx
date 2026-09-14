"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchActionItems, updateActionItem } from "@/lib/api-client";
import { CountryActionItem, ActionItemSeverity } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Undo2 } from "lucide-react";

function CountryFlag({ code, size = 20 }: { code: string; size?: number }) {
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

const severityOrder: Record<ActionItemSeverity, number> = { high: 0, medium: 1, low: 2 };

const severityColors: Record<ActionItemSeverity, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-gray-100 text-gray-700",
};

function severityLabel(s: ActionItemSeverity): string {
  return { high: "Vysoká priorita", medium: "Střední priorita", low: "Nízká priorita" }[s];
}

export default function ActionsPage() {
  const [items, setItems] = useState<CountryActionItem[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchActionItems({ status: showDone ? "all" : "open" });
    setItems(data);
    setLoading(false);
  }, [showDone]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (item: CountryActionItem) => {
    setUpdatingId(item.id);
    try {
      const updated = await updateActionItem(item.id, item.status === "open" ? "done" : "open");
      setItems((prev) =>
        showDone || updated.status === "open"
          ? prev.map((i) => (i.id === updated.id ? updated : i))
          : prev.filter((i) => i.id !== updated.id)
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const byCountry = new Map<string, CountryActionItem[]>();
  for (const item of items) {
    const list = byCountry.get(item.country_code) ?? [];
    list.push(item);
    byCountry.set(item.country_code, list);
  }
  const countries = [...byCountry.keys()].sort();
  for (const list of byCountry.values()) {
    list.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Akční kroky</h1>
          <p className="text-sm text-muted-foreground">
            Opakující se problémy z recenzí, seskupené po zemích — výstup dávkového AI zpracování.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Jen otevřené" : "Zobrazit i vyřešené"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám…
          </div>
        ) : countries.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            Zatím žádné akční kroky. Spusť &bdquo;Zpracovat nové recenze&ldquo; v Inboxu.
          </p>
        ) : (
          <div className="space-y-8">
            {countries.map((country) => (
              <section key={country}>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
                  <CountryFlag code={country} />
                  {country}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {byCountry.get(country)!.map((item) => (
                    <Card key={item.id} className={item.status === "done" ? "opacity-60" : ""}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className={severityColors[item.severity]}>
                            {severityLabel(item.severity)}
                          </Badge>
                          {item.category && <Badge variant="outline">{item.category}</Badge>}
                        </div>
                        <CardTitle className="text-sm">{item.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="text-sm">{item.description}</CardDescription>
                        <Button
                          size="sm"
                          variant={item.status === "done" ? "outline" : "default"}
                          className="mt-3"
                          disabled={updatingId === item.id}
                          onClick={() => handleToggle(item)}
                        >
                          {updatingId === item.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : item.status === "done" ? (
                            <Undo2 className="mr-1 h-3 w-3" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          {item.status === "done" ? "Znovu otevřít" : "Vyřešeno"}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

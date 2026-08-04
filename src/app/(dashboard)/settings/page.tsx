"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Database,
  Bot,
  Mail,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface ConnectionConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  envKeys: string[];
  docsHint: string;
  markets: string[];
}

const connections: ConnectionConfig[] = [
  {
    id: "supabase",
    name: "Supabase",
    icon: <Database className="h-5 w-5" />,
    description: "Database & authentication backend",
    envKeys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    docsHint: "Create project at supabase.com, run schema.sql in SQL Editor",
    markets: ["All"],
  },
  {
    id: "ai",
    name: "AI Provider",
    icon: <Bot className="h-5 w-5" />,
    description: "Categorization, translation, and reply generation",
    envKeys: ["AI_API_URL", "AI_API_KEY", "AI_MODEL"],
    docsHint: "Anthropic API key or OpenAI-compatible endpoint",
    markets: ["All"],
  },
  {
    id: "trusted_shops",
    name: "Trusted Shops (eTrusted)",
    icon: <Shield className="h-5 w-5" />,
    description: "OAuth 2.0 Client Credentials, per-channel config",
    envKeys: ["TRUSTED_SHOPS_CHANNELS"],
    docsHint: "JSON array: [{clientId, clientSecret, channelId, country}]",
    markets: ["DE", "AT", "CH", "FR", "IT", "NL", "BE"],
  },
  {
    id: "trustpilot",
    name: "Trustpilot",
    icon: <Shield className="h-5 w-5" />,
    description: "Business API with Basic + Password auth",
    envKeys: [
      "TRUSTPILOT_API_KEY",
      "TRUSTPILOT_API_SECRET",
      "TRUSTPILOT_BUSINESS_UNIT_ID",
      "TRUSTPILOT_USERNAME",
      "TRUSTPILOT_PASSWORD",
    ],
    docsHint: "Register at business.trustpilot.com for API access",
    markets: ["DE"],
  },
  {
    id: "heureka",
    name: "Heureka CZ / SK",
    icon: <Shield className="h-5 w-5" />,
    description: "XML review export via secret key",
    envKeys: ["HEUREKA_CZ_KEY", "HEUREKA_SK_KEY"],
    docsHint: "Get API key from Heureka merchant admin panel",
    markets: ["CZ", "SK"],
  },
  {
    id: "imap",
    name: "Email (IMAP)",
    icon: <Mail className="h-5 w-5" />,
    description: "Fetches Zbozi.cz and Firmy.cz reviews from email",
    envKeys: ["IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASS"],
    docsHint: "IMAP credentials for mailbox receiving review notifications",
    markets: ["CZ"],
  },
  {
    id: "google",
    name: "Google Business (Experimental)",
    icon: <Shield className="h-5 w-5" />,
    description: "Google Business Profile API — OAuth 2.0 Bearer",
    envKeys: ["GOOGLE_ACCESS_TOKEN", "GOOGLE_ACCOUNT_ID", "GOOGLE_LOCATION_ID"],
    docsHint: "Requires Google Business Profile API access and OAuth setup",
    markets: ["Global"],
  },
];

function CountryFlag({ code }: { code: string }) {
  if (code === "All" || code === "Global") return <span className="text-xs">{code}</span>;
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      alt={code}
      width={16}
      height={12}
      className="inline-block rounded-sm"
      style={{ verticalAlign: "middle" }}
    />
  );
}

export default function SettingsPage() {
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});

  const handleTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch("/api/reviews/live");
      if (res.ok) {
        const data = await res.json();
        const platformIds: Record<string, string[]> = {
          heureka: ["heureka"],
          trusted_shops: ["trusted_shops"],
          trustpilot: ["trustpilot"],
          imap: ["zbozi", "firmy"],
        };
        const expected = platformIds[id];
        if (expected) {
          setTestResults((prev) => ({
            ...prev,
            [id]: data.some((r: { platform_source: string }) =>
              expected.includes(r.platform_source)
            ),
          }));
        } else {
          setTestResults((prev) => ({ ...prev, [id]: data.length > 0 }));
        }
      } else {
        setTestResults((prev) => ({ ...prev, [id]: false }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure API connections — set values in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.local</code>{" "}
          and restart the server
        </p>
      </div>

      <div className="space-y-4">
        {connections.map((conn) => {
          const result = testResults[conn.id];
          return (
            <Card key={conn.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md border p-2 bg-muted/50">
                      {conn.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base">{conn.name}</CardTitle>
                      <CardDescription>{conn.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {result === true && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                    {result === false && (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTest(conn.id)}
                      disabled={result === null}
                    >
                      {result === null ? "Testing..." : "Test"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Required env variables
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {conn.envKeys.map((key) => (
                      <code
                        key={key}
                        className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                      >
                        {key}
                      </code>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {conn.docsHint}
                  </p>
                  <div className="flex items-center gap-1">
                    {conn.markets.map((m) => (
                      <Badge key={m} variant="outline" className="text-xs gap-1">
                        <CountryFlag code={m} /> {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

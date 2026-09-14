import axios from "axios";
import { AiCategory, AiSentiment, MatchConfidence } from "./types";

const AI_API_URL =
  process.env.AI_API_URL ?? "https://api.anthropic.com/v1/messages";
const AI_API_KEY = process.env.AI_API_KEY ?? "";
const AI_MODEL = process.env.AI_MODEL ?? "claude-sonnet-4-6";

interface CategorizeResult {
  translation_cz: string;
  sentiment: AiSentiment;
  category: AiCategory;
  pain_points: string[];
}

export interface ActionItemDraft {
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  category: AiCategory | null;
}

// Same company, different storefront name per market: CZ and SK trade under
// their original local names, everywhere else it's the Woolville brand.
function brandNameFor(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code === "CZ") return "Ovečkárna";
  if (code === "SK") return "Ovečkáreň";
  return "Woolville";
}

async function callAI(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const isAnthropic = AI_API_URL.includes("anthropic.com");

  if (isAnthropic) {
    const { data } = await axios.post(
      AI_API_URL,
      {
        model: AI_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      },
      {
        headers: {
          "x-api-key": AI_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      }
    );
    return data.content[0].text;
  }

  const { data } = await axios.post(
    AI_API_URL,
    {
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1024,
    },
    {
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return data.choices[0].message.content;
}

export async function categorizeReview(
  reviewText: string,
  countryCode: string
): Promise<CategorizeResult> {
  const systemPrompt =
    "You are an analytical assistant for Woolville (a European e-commerce selling wool products).";
  const userMessage = `${reviewText} (Country: ${countryCode})

Return a JSON object with exactly 4 keys:
1. "translation_cz": Translate the review to Czech (if already Czech, return as is).
2. "sentiment": 'positive', 'neutral', or 'negative'.
3. "category": Must be one of ['product', 'logistics', 'web', 'service', 'mixed']. Focus heavily on logistics if shipping carriers are mentioned.
4. "pain_points": Array of short, concrete phrases naming what specifically went wrong (e.g. "pomalé doručení", "poškozený obal", "nefunkční zip"). Empty array if the review has no complaint (e.g. a positive review).

Return ONLY valid JSON, no markdown fences.`;

  const raw = await callAI(systemPrompt, userMessage);

  const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    translation_cz: parsed.translation_cz ?? reviewText,
    sentiment: parsed.sentiment ?? "neutral",
    category: parsed.category ?? "mixed",
    pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points : [],
  };
}

export async function generateReply(
  reviewText: string,
  rating: number,
  countryCode: string,
  matchConfidence: MatchConfidence
): Promise<string> {
  const brand = brandNameFor(countryCode);
  const systemPrompt = `You are an empathetic and professional customer support agent for ${brand}. Your goal is to draft a reply to a customer review.`;

  const userMessage = `Rating: ${rating}/5 | Review: ${reviewText} | Order Match: ${matchConfidence} (If 'unverified', politely ask for the order number).

Draft a response in the language of the review (derived from country code: ${countryCode}). The tone must be polite, helpful, and natural. Do not use corporate jargon. If 1-3 stars, apologize and offer a solution. If 4-5 stars, thank them for shopping at ${brand}. Do not promise a specific refund amount, discount, or timeline — only that the team will follow up. Sign off as "Tým ${brand}" translated/localized naturally into the reply's own language (e.g. "Team ${brand}", "Echipa ${brand}"). Return ONLY the drafted text.`;

  return callAI(systemPrompt, userMessage);
}

export interface PainPointSummary {
  phrase: string;
  count: number;
  exampleQuote: string;
  category: AiCategory;
}

// Turns a country's most frequent pain points (already counted by the caller —
// see the batch endpoint, which groups reviews' pain_points by exact phrase since
// clustering near-duplicate phrasings would need embeddings) into a short list of
// concrete, actionable steps. One call per country keeps this independent of how
// many individual reviews fed into the summary.
export async function generateCountryActionItems(
  countryCode: string,
  painPoints: PainPointSummary[]
): Promise<ActionItemDraft[]> {
  if (!painPoints.length) return [];

  const systemPrompt =
    "You are an operations analyst for Woolville, a European wool-products e-commerce company. " +
    "Turn recurring customer complaints into a short list of concrete, actionable steps for the local " +
    "market team — not a restatement of the complaint.";

  const userMessage = `Country: ${countryCode}
Recurring pain points seen in customer reviews, most frequent first:
${painPoints
  .map((p, i) => `${i + 1}. "${p.phrase}" — mentioned ${p.count}x (category: ${p.category}). Example: "${p.exampleQuote}"`)
  .join("\n")}

Return a JSON array, one object per action item worth acting on (merge overlapping pain points into one item; skip anything too vague or a single one-off to act on). Each object has exactly 4 keys:
1. "title": short imperative title (max 80 chars), in Czech.
2. "description": 1-3 sentences explaining the concrete problem and what to change, in Czech.
3. "severity": 'low', 'medium', or 'high', based on frequency and customer impact.
4. "category": one of ['product', 'logistics', 'web', 'service', 'mixed'].

Return ONLY valid JSON, no markdown fences.`;

  const raw = await callAI(systemPrompt, userMessage);
  const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => ({
    title: String(item.title ?? "").slice(0, 255),
    description: String(item.description ?? ""),
    severity: ["low", "medium", "high"].includes(item.severity) ? item.severity : "medium",
    category: item.category ?? null,
  }));
}

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

Return a JSON object with exactly 3 keys:
1. "translation_cz": Translate the review to Czech (if already Czech, return as is).
2. "sentiment": 'positive', 'neutral', or 'negative'.
3. "category": Must be one of ['product', 'logistics', 'web', 'service', 'mixed']. Focus heavily on logistics if shipping carriers are mentioned.

Return ONLY valid JSON, no markdown fences.`;

  const raw = await callAI(systemPrompt, userMessage);

  const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    translation_cz: parsed.translation_cz ?? reviewText,
    sentiment: parsed.sentiment ?? "neutral",
    category: parsed.category ?? "mixed",
  };
}

export async function generateReply(
  reviewText: string,
  rating: number,
  countryCode: string,
  matchConfidence: MatchConfidence
): Promise<string> {
  const systemPrompt =
    "You are an empathetic and professional customer support agent for Woolville. Your goal is to draft a reply to a customer review.";

  const userMessage = `Rating: ${rating}/5 | Review: ${reviewText} | Order Match: ${matchConfidence} (If 'unverified', politely ask for the order number).

Draft a response in the language of the review (derived from country code: ${countryCode}). The tone must be polite, helpful, and natural. Do not use corporate jargon. If 1-3 stars, apologize and offer a solution. If 4-5 stars, thank them for shopping at Woolville. Return ONLY the drafted text.`;

  return callAI(systemPrompt, userMessage);
}

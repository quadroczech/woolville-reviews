import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import type { Review } from "@/lib/types";

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

export type EmailSource = "zbozi" | "firmy";

export interface EmailReview {
  messageId: string;
  source: EmailSource;
  subject: string;
  rawText: string;
  date: string;
}

const SOURCE_FILTERS: Record<EmailSource, string> = {
  zbozi: "zbozi.cz",
  firmy: "firmy.cz",
};

export async function fetchEmailReviews(
  config: ImapConfig,
  options?: { since?: Date; source?: EmailSource }
): Promise<EmailReview[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    logger: false,
  });

  const results: EmailReview[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const sources = options?.source
        ? [options.source]
        : (Object.keys(SOURCE_FILTERS) as EmailSource[]);

      for (const source of sources) {
        const searchCriteria: Record<string, unknown> = {
          from: SOURCE_FILTERS[source],
        };
        if (options?.since) {
          searchCriteria.since = options.since;
        }

        const messages = client.fetch(searchCriteria, {
          source: true,
          envelope: true,
        });

        for await (const msg of messages) {
          if (!msg.source) continue;
          const parsed = (await simpleParser(msg.source)) as unknown as ParsedMail;
          const messageId = msg.envelope?.messageId;
          if (!messageId) continue;
          results.push({
            messageId,
            source,
            subject: parsed.subject ?? "",
            rawText: parsed.text ?? "",
            date: parsed.date?.toISOString() ?? new Date().toISOString(),
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return results;
}

// Patterns for the Czech review-notification emails. Neither Zbozi.cz nor Firmy.cz
// documents a stable template, so these were derived from the wording their
// notifications use and must be re-checked against a real sample when the mailbox
// is connected — parseEmailReview returns null rather than guessing a rating.
const RATING_PATTERNS: RegExp[] = [
  /hodnocen[íi]\s*[:\-]?\s*([1-5])\s*(?:\/|z)\s*5/i,
  /([1-5])\s*(?:\/|z)\s*5\s*(?:hv[ěe]zd|bod)/i,
  /([1-5])\s*hv[ěe]zd/i,
];

const STAR_PATTERN = /(★+)/;

const FIELD_PATTERNS = {
  pros: /(?:co\s+se\s+mi\s+l[íi]bilo|kladi?y|plusy|v[ýy]hody)\s*[:\-]?\s*(.+)/i,
  cons: /(?:co\s+se\s+mi\s+nel[íi]bilo|z[áa]pory|minusy|nev[ýy]hody)\s*[:\-]?\s*(.+)/i,
  comment: /(?:koment[áa][řr]|recenze|text\s+hodnocen[íi]|zpr[áa]va)\s*[:\-]?\s*(.+)/i,
  author: /(?:z[áa]kazn[íi]k|autor|jm[ée]no|hodnotil)\s*[:\-]?\s*(.+)/i,
  orderId: /(?:[čc][íi]slo\s+objedn[áa]vky|objedn[áa]vka)\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
};

function extractRating(text: string): number | null {
  for (const pattern of RATING_PATTERNS) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  const stars = text.match(STAR_PATTERN);
  if (stars && stars[1].length <= 5) return stars[1].length;
  return null;
}

function extractField(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() || null : null;
}

function sentimentFor(rating: number): Review["ai_sentiment"] {
  if (rating >= 4) return "positive";
  if (rating >= 3) return "neutral";
  return "negative";
}

/**
 * Returns null when the rating cannot be read from the email — an unparsed
 * notification is reported back to the operator instead of being stored with a
 * made-up rating that would skew the averages.
 */
export function parseEmailReview(email: EmailReview): Review | null {
  const body = `${email.subject}\n${email.rawText}`;
  const rating = extractRating(body);
  if (rating === null) return null;

  const pros = extractField(email.rawText, FIELD_PATTERNS.pros);
  const cons = extractField(email.rawText, FIELD_PATTERNS.cons);
  const comment = extractField(email.rawText, FIELD_PATTERNS.comment);

  const textParts: string[] = [];
  if (pros) textParts.push(`+: ${pros}`);
  if (cons) textParts.push(`-: ${cons}`);
  if (comment) textParts.push(comment);

  return {
    id: `${email.source}-${email.messageId}`,
    platform_source: email.source,
    external_review_id: email.messageId,
    country_code: "CZ",
    rating,
    review_text: textParts.join("\n") || email.rawText.trim() || null,
    review_text_cz: null,
    customer_name_extracted: extractField(email.rawText, FIELD_PATTERNS.author),
    order_id: extractField(email.rawText, FIELD_PATTERNS.orderId),
    match_confidence: "unverified",
    ai_category: null,
    ai_sentiment: sentimentFor(rating),
    response_draft: null,
    status: "pending",
    created_at: email.date,
    replied_at: null,
    order: null,
  };
}

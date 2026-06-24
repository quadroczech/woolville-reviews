import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

export interface EmailReview {
  messageId: string;
  source: "zbozi" | "firmy";
  subject: string;
  rawText: string;
  date: string;
}

const SOURCE_FILTERS = {
  zbozi: "hodnoceni@zbozi.cz",
  firmy: "firmy.cz",
} as const;

export async function fetchEmailReviews(
  config: ImapConfig,
  options?: { since?: Date; source?: "zbozi" | "firmy" }
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
        : (Object.keys(SOURCE_FILTERS) as Array<"zbozi" | "firmy">);

      for (const source of sources) {
        const fromAddress = SOURCE_FILTERS[source];
        const searchCriteria: Record<string, unknown> = { from: fromAddress };
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
          results.push({
            messageId:
              msg.envelope?.messageId ??
              `email-${source}-${Date.now()}-${Math.random()}`,
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

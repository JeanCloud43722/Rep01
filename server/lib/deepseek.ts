import { createHash } from "crypto";
import { logger } from "./logger";
import { getConfig } from "../env-validation";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_MESSAGES = 5;
const MAX_MESSAGE_LENGTH = 100;
const MAX_LAST_CUSTOMER_LENGTH = 500;

interface CacheEntry {
  suggestion: string;
  timestamp: number;
}

const suggestionCache = new Map<string, CacheEntry>();

function buildCacheKey(orderId: string, messages: Array<{ text: string; sender: string }>): string {
  const normalized = messages
    .slice(-MAX_MESSAGES)
    .map((m) => `${m.sender}:${m.text.slice(0, MAX_MESSAGE_LENGTH)}`)
    .join("|");
  return createHash("sha256").update(`${orderId}:${normalized}`).digest("hex");
}

function truncateMessages(messages: Array<{ text: string; sender: string; sentAt: string }>) {
  return messages.slice(-MAX_MESSAGES).map((m) => ({
    sender: m.sender,
    text: m.text.slice(0, MAX_MESSAGE_LENGTH),
    sentAt: m.sentAt,
  }));
}

function buildPrompt(
  messages: Array<{ text: string; sender: string }>,
  lastCustomerMessageFull: string | undefined
): string {
  const history = messages
    .map((m) => `${m.sender === "staff" ? "Staff" : "Customer"}: ${m.text}`)
    .join("\n");

  let languageInstruction = "";
  if (lastCustomerMessageFull && lastCustomerMessageFull.length > 0) {
    languageInstruction = `\n\nIMPORTANT: The customer's last message was: "${lastCustomerMessageFull}"\nRespond in the EXACT SAME LANGUAGE as this message. Do not translate. Match the language precisely.`;
  }

  return `You are a helpful restaurant staff assistant. Based on this conversation, suggest a short, friendly reply from the staff to the customer. Keep it under 100 characters. Reply with ONLY the suggested message text, nothing else.${languageInstruction}\n\nConversation:\n${history}\n\nSuggested staff reply:`;
}

export interface GuestAnswerResult {
  answer: string;
  usedWebSearch: boolean;
}

export async function getGuestAnswer(
  question: string,
  knowledgeChunks: Array<{ text: string; source: string; category: string }>,
  searchResults: Array<{ title: string; snippet: string; link: string }>,
): Promise<GuestAnswerResult> {
  const config = getConfig();
  const apiKey = config.deepseekApiKey;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const hasKB = knowledgeChunks.length > 0;
  const hasWeb = searchResults.length > 0;

  let context = "";
  if (hasKB) {
    context += "## Restaurant Knowledge Base\n";
    for (const chunk of knowledgeChunks) {
      context += `[${chunk.category}/${chunk.source}]\n${chunk.text}\n\n`;
    }
  }
  if (hasWeb) {
    context += "## Web Search Results\n";
    for (const r of searchResults) {
      context += `${r.title}: ${r.snippet}\n`;
    }
  }
  if (!hasKB && !hasWeb) {
    context = "No additional information is available in the knowledge base.";
  }

  const systemPrompt = `You are a friendly and knowledgeable AI guest assistant for a restaurant. Answer the guest's question accurately and concisely based on the provided context. If the information is not in the context, say so honestly but politely. Keep answers under 200 words. Respond in the EXACT SAME LANGUAGE as the guest's question.`;

  const userMessage = `Context:\n${context}\n\nGuest question: ${question}`;

  logger.info("Guest assistant AI call", {
    source: "deepseek",
    hasKB,
    hasWeb,
    chunks: knowledgeChunks.length,
  });

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("DeepSeek API error (guest)", { source: "deepseek", status: response.status, body });
    throw new Error(`DeepSeek API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Empty response from DeepSeek API");

  return { answer, usedWebSearch: hasWeb };
}

export async function getReplySuggestion(
  orderId: string,
  messageHistory: Array<{ text: string; sender: string; sentAt: string }>
): Promise<string> {
  const config = getConfig();
  const apiKey = config.deepseekApiKey;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const truncated = truncateMessages(messageHistory);
  const cacheKey = buildCacheKey(orderId, truncated);

  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.info("AI suggestion served from cache", { source: "deepseek", orderId });
    return cached.suggestion;
  }

  const lastCustomerMessageFull = [...messageHistory]
    .reverse()
    .find((m) => m.sender === "customer")?.text
    .slice(0, MAX_LAST_CUSTOMER_LENGTH);

  const prompt = buildPrompt(truncated, lastCustomerMessageFull);

  logger.info("Requesting AI reply suggestion", { source: "deepseek", orderId, messageCount: truncated.length });

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("DeepSeek API error", { source: "deepseek", status: response.status, body });
    throw new Error(`DeepSeek API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const suggestion = data.choices?.[0]?.message?.content?.trim();
  if (!suggestion) {
    throw new Error("Empty response from DeepSeek API");
  }

  suggestionCache.set(cacheKey, { suggestion, timestamp: Date.now() });
  logger.info("AI suggestion cached", { source: "deepseek", orderId });

  return suggestion;
}

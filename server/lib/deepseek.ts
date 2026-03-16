import { createHash } from "crypto";
import { logger } from "./logger";
import { getConfig } from "../env-validation";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_MESSAGES = 5;
const MAX_MESSAGE_LENGTH = 100;

interface CacheEntry {
  suggestion: string;
  timestamp: number;
}

const suggestionCache = new Map<string, CacheEntry>();

function buildCacheKey(
  orderId: string,
  messages: Array<{ text: string; sender: string }>,
  language: string
): string {
  const normalized = messages
    .slice(-MAX_MESSAGES)
    .map((m) => `${m.sender}:${m.text.slice(0, MAX_MESSAGE_LENGTH)}`)
    .join("|");
  return createHash("sha256")
    .update(`${orderId}:${normalized}:${language}`)
    .digest("hex");
}

function truncateMessages(messages: Array<{ text: string; sender: string; sentAt: string }>) {
  return messages.slice(-MAX_MESSAGES).map((m) => ({
    sender: m.sender,
    text: m.text.slice(0, MAX_MESSAGE_LENGTH),
    sentAt: m.sentAt,
  }));
}

function detectLanguage(text: string): string {
  const germanKeywords = [
    "danke",
    "bitte",
    "hallo",
    "guten",
    "morgen",
    "abend",
    "tag",
    "ja",
    "nein",
    "wie",
    "geht",
    "dir",
    "euch",
    "ihnen",
    "können",
    "möchte",
    "würde",
  ];
  const lowerText = text.toLowerCase();
  const germanMatches = germanKeywords.filter((kw) => lowerText.includes(kw)).length;
  return germanMatches >= 2 ? "de" : "en";
}

function buildPrompt(
  messages: Array<{ text: string; sender: string }>,
  language: string = "en"
): string {
  const history = messages
    .map((m) => `${m.sender === "staff" ? "Staff" : "Customer"}: ${m.text}`)
    .join("\n");

  const langInstruction =
    language === "de"
      ? "Antworte auf Deutsch."
      : "Reply in English.";

  return `You are a helpful restaurant staff assistant. Based on this conversation, suggest a short, friendly reply from the staff to the customer. Keep it under 100 characters. ${langInstruction} Reply with ONLY the suggested message text, nothing else.\n\nConversation:\n${history}\n\nSuggested staff reply:`;
}

export async function getReplySuggestion(
  orderId: string,
  messageHistory: Array<{ text: string; sender: string; sentAt: string }>,
  language?: string
): Promise<string> {
  const config = getConfig();
  const apiKey = config.deepseekApiKey;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const truncated = truncateMessages(messageHistory);
  
  // Auto-detect language from the last customer message if not provided
  let detectedLanguage = language || "en";
  if (!language) {
    const lastCustomerMsg = [...truncated].reverse().find((m) => m.sender === "customer");
    if (lastCustomerMsg) {
      detectedLanguage = detectLanguage(lastCustomerMsg.text);
    }
  }

  const cacheKey = buildCacheKey(orderId, truncated, detectedLanguage);

  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.info("AI suggestion served from cache", {
      source: "deepseek",
      orderId,
      language: detectedLanguage,
    });
    return cached.suggestion;
  }

  const prompt = buildPrompt(truncated, detectedLanguage);

  logger.info("Requesting AI reply suggestion", {
    source: "deepseek",
    orderId,
    messageCount: truncated.length,
    language: detectedLanguage,
  });

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
  logger.info("AI suggestion cached", { source: "deepseek", orderId, language: detectedLanguage });

  return suggestion;
}

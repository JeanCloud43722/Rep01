import { logger } from "./logger";
import { getConfig } from "../env-validation";

export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

export async function webSearch(query: string, numResults = 3): Promise<SearchResult[]> {
  const config = getConfig();

  // Try SerpApi first
  if (config.serpApiKey) {
    try {
      const url = new URL("https://serpapi.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", config.serpApiKey);
      url.searchParams.set("num", String(numResults));
      url.searchParams.set("engine", "google");

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`SerpApi ${res.status}`);

      const data = (await res.json()) as {
        organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
      };

      return (data.organic_results ?? []).slice(0, numResults).map((r) => ({
        title: r.title ?? "",
        snippet: r.snippet ?? "",
        link: r.link ?? "",
      }));
    } catch (err) {
      logger.warn("SerpApi search failed", { source: "web-search", err: String(err) });
    }
  }

  // Try Google Custom Search
  if (config.googleSearchApiKey && config.googleSearchEngineId) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("q", query);
      url.searchParams.set("key", config.googleSearchApiKey);
      url.searchParams.set("cx", config.googleSearchEngineId);
      url.searchParams.set("num", String(numResults));

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Google Search ${res.status}`);

      const data = (await res.json()) as {
        items?: Array<{ title?: string; snippet?: string; link?: string }>;
      };

      return (data.items ?? []).slice(0, numResults).map((r) => ({
        title: r.title ?? "",
        snippet: r.snippet ?? "",
        link: r.link ?? "",
      }));
    } catch (err) {
      logger.warn("Google Custom Search failed", { source: "web-search", err: String(err) });
    }
  }

  return [];
}

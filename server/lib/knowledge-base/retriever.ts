import { logger } from "../logger";

export interface Chunk {
  id: string;
  text: string;
  metadata: {
    source: string;
    category: string;
    filename: string;
    chunkIndex: number;
  };
}

export interface RetrievalResult {
  chunk: Chunk;
  score: number;
}

let chunks: Chunk[] = [];

export function setChunks(newChunks: Chunk[]): void {
  chunks = newChunks;
  logger.info("Knowledge base loaded into retriever", { source: "retriever", count: chunks.length });
}

export function getChunkCount(): number {
  return chunks.length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export function retrieveRelevantChunks(query: string, topK = 5): RetrievalResult[] {
  if (chunks.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const N = chunks.length;

  // Compute document frequency for each query term
  const df = new Map<string, number>();
  for (const chunk of chunks) {
    const termSet = new Set(tokenize(chunk.text));
    for (const term of queryTerms) {
      if (termSet.has(term)) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
  }

  // Score each chunk with TF-IDF
  const scored: RetrievalResult[] = chunks.map((chunk) => {
    const terms = tokenize(chunk.text);
    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTerms) {
      const tfScore = (tf.get(term) ?? 0) / Math.max(terms.length, 1);
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1));
      score += tfScore * idf;
    }

    return { chunk, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

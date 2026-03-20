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
    // Normalize German umlauts and accents before removing special chars
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    // Remove other special characters but keep word boundaries
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
  // Uses prefix matching to handle compound words (e.g., "pute" matches "putenbruststeaks")
  const df = new Map<string, number>();
  for (const chunk of chunks) {
    const terms = tokenize(chunk.text);
    for (const queryTerm of queryTerms) {
      const matches = terms.some((term) => term.startsWith(queryTerm) || queryTerm.startsWith(term));
      if (matches) {
        df.set(queryTerm, (df.get(queryTerm) ?? 0) + 1);
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
    for (const queryTerm of queryTerms) {
      // TF: use prefix matching to find matching terms
      let termTF = 0;
      for (const term of terms) {
        if (term.startsWith(queryTerm) || queryTerm.startsWith(term)) {
          termTF += (tf.get(term) ?? 0);
        }
      }

      const tfScore = termTF / Math.max(terms.length, 1);
      const idf = Math.log((N + 1) / ((df.get(queryTerm) ?? 0) + 1));
      score += tfScore * idf;
    }

    return { chunk, score };
  });

  const results = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  logger.info("RAG retrieval results", {
    source: "retriever",
    query,
    queryTerms,
    documentsFound: results.length,
    topScores: results.map((r) => ({ score: r.score.toFixed(4), source: r.chunk.metadata.source })),
  });

  return results;
}

import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { logger } from "../logger";
import { Chunk, setChunks } from "./retriever";

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const KB_PATH = process.env.KNOWLEDGE_BASE_PATH ?? path.join(process.cwd(), "knowledge-base");

function splitIntoChunks(
  text: string,
  source: string,
  category: string,
  filename: string,
): Chunk[] {
  const result: Chunk[] = [];
  let i = 0;
  let chunkIndex = 0;

  while (i < text.length) {
    const end = Math.min(i + CHUNK_SIZE, text.length);
    const slice = text.slice(i, end).trim();
    if (slice.length > 50) {
      const id = createHash("md5").update(`${source}:${chunkIndex}`).digest("hex");
      result.push({ id, text: slice, metadata: { source, category, filename, chunkIndex } });
      chunkIndex++;
    }
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return result;
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const buf = await fs.readFile(filePath);

  if (ext === ".txt" || ext === ".md") {
    return buf.toString("utf-8");
  }

  if (ext === ".pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buf);
      return data.text;
    } catch (err) {
      logger.warn("PDF parse failed", { source: "processor", file: filePath, err: String(err) });
      return "";
    }
  }

  if (ext === ".docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value;
    } catch (err) {
      logger.warn("DOCX parse failed", { source: "processor", file: filePath, err: String(err) });
      return "";
    }
  }

  return "";
}

async function scanDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await scanDirectory(full)));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".txt", ".md", ".pdf", ".docx"].includes(ext)) {
          files.push(full);
        }
      }
    }
  } catch {
    // Directory doesn't exist yet — silently skip
  }
  return files;
}

export async function processKnowledgeBase(): Promise<void> {
  logger.info("Knowledge base processing started", { source: "processor", path: KB_PATH });

  const files = await scanDirectory(KB_PATH);
  if (files.length === 0) {
    logger.info("No documents in knowledge base — guest assistant will use web search only", {
      source: "processor",
    });
    return;
  }

  const allChunks: Chunk[] = [];

  for (const filePath of files) {
    try {
      const rel = path.relative(KB_PATH, filePath);
      const parts = rel.split(path.sep);
      const category = parts.length > 1 ? parts[0] : "general";
      const filename = path.basename(filePath);

      const text = await extractText(filePath);
      if (!text.trim()) continue;

      const chunks = splitIntoChunks(text, rel, category, filename);
      allChunks.push(...chunks);
      logger.info("Document indexed", { source: "processor", file: rel, chunks: chunks.length });
    } catch (err) {
      logger.warn("Document processing failed", {
        source: "processor",
        file: filePath,
        err: String(err),
      });
    }
  }

  setChunks(allChunks);
  logger.info("Knowledge base ready", { source: "processor", totalChunks: allChunks.length });
}

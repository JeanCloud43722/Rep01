declare module 'pdf-parse' {
  interface PdfParseData {
    text: string;
    version: string;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    numpages: number;
  }
  function pdf(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseData>;
  export = pdf;
}

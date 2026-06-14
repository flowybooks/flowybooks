// Use the lib entry to avoid pdf-parse loading test fixtures (e.g. 05-versions-space.pdf)
import pdf from 'pdf-parse/lib/pdf-parse.js';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  info: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
}

export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  // Extract text using pdf-parse
  const data = await pdf(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    info: {
      title: data.info?.Title,
      author: data.info?.Author,
      creationDate: data.info?.CreationDate,
    },
  };
}

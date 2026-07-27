import { MAX_EXTRACTED_TEXT_CHARACTERS } from './material-processing-runner';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 500;
export const LOCAL_PDF_PROCESSOR_VERSION = 'pdfjs-5.4.530-text-v1';

export type LocalPdfExtractionErrorCode =
  | 'empty_pdf_text'
  | 'invalid_pdf'
  | 'pdf_input_too_large'
  | 'pdf_output_too_large'
  | 'pdf_page_limit_exceeded'
  | 'password_protected_pdf';

export class LocalPdfExtractionError extends Error {
  constructor(public readonly code: LocalPdfExtractionErrorCode) {
    super(code);
    this.name = 'LocalPdfExtractionError';
  }
}

function normalizePageText(items: Array<Record<string, unknown>>): string {
  let text = '';

  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str) continue;
    text += item.str;
    text += item.hasEOL === true ? '\n' : ' ';
  }

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapPdfError(error: unknown): LocalPdfExtractionError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') {
    return new LocalPdfExtractionError('password_protected_pdf');
  }
  return new LocalPdfExtractionError('invalid_pdf');
}

export async function extractLocalPdfText(
  input: Uint8Array
): Promise<{ text: string; pageCount: number; processorVersion: string }> {
  if (input.byteLength < 5 || input.byteLength > MAX_PDF_BYTES) {
    throw new LocalPdfExtractionError('pdf_input_too_large');
  }

  const { getDocument, VerbosityLevel } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(input),
    disableFontFace: true,
    isEvalSupported: false,
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    maxImageSize: 1,
    stopAtErrors: true,
    useSystemFonts: false,
    useWasm: false,
    useWorkerFetch: false,
    verbosity: VerbosityLevel.ERRORS,
  });

  let document: Awaited<typeof loadingTask.promise> | null = null;

  try {
    document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
      throw new LocalPdfExtractionError('pdf_page_limit_exceeded');
    }

    const pages: string[] = [];
    let extractedCharacters = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      });
      const pageText = normalizePageText(
        content.items as unknown as Array<Record<string, unknown>>
      );

      if (pageText) {
        extractedCharacters += pageText.length;
        if (extractedCharacters > MAX_EXTRACTED_TEXT_CHARACTERS) {
          throw new LocalPdfExtractionError('pdf_output_too_large');
        }
        pages.push(pageText);
      }
      page.cleanup();
    }

    const text = pages.join('\n\n').trim();
    if (!text) {
      throw new LocalPdfExtractionError('empty_pdf_text');
    }

    return {
      text,
      pageCount: document.numPages,
      processorVersion: LOCAL_PDF_PROCESSOR_VERSION,
    };
  } catch (error) {
    if (error instanceof LocalPdfExtractionError) throw error;
    throw mapPdfError(error);
  } finally {
    if (document) {
      await document.destroy();
    } else {
      await loadingTask.destroy();
    }
  }
}

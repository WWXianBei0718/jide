import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractLocalPdfText,
  LOCAL_PDF_PROCESSOR_VERSION,
  LocalPdfExtractionError,
  MAX_PDF_BYTES,
} from '../src/lib/local-pdf-extraction';

function buildPdf(contentStream: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

test('extracts embedded PDF text locally with a pinned processor version', async () => {
  const pdf = buildPdf('BT /F1 12 Tf 72 720 Td (Remembered local PDF text) Tj ET');
  const result = await extractLocalPdfText(pdf);

  assert.equal(result.text, 'Remembered local PDF text');
  assert.equal(result.pageCount, 1);
  assert.equal(result.processorVersion, LOCAL_PDF_PROCESSOR_VERSION);
});

test('distinguishes image-only PDFs from corrupt PDFs without exposing parser errors', async () => {
  const imageOnly = buildPdf('q Q');
  await assert.rejects(
    () => extractLocalPdfText(imageOnly),
    (error: unknown) =>
      error instanceof LocalPdfExtractionError && error.code === 'empty_pdf_text'
  );

  await assert.rejects(
    () => extractLocalPdfText(new Uint8Array(Buffer.from('%PDF-broken', 'ascii'))),
    (error: unknown) =>
      error instanceof LocalPdfExtractionError && error.code === 'invalid_pdf'
  );
});

test('rejects oversized PDF input before parsing', async () => {
  await assert.rejects(
    () => extractLocalPdfText(new Uint8Array(MAX_PDF_BYTES + 1)),
    (error: unknown) =>
      error instanceof LocalPdfExtractionError && error.code === 'pdf_input_too_large'
  );
});

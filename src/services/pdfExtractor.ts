import pdfParse from 'pdf-parse';
import { logger } from '../infrastructure/logger';
import { config } from '../config';

function isUsableText(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 30) return false;
  const words = normalized.match(/[a-zA-Z]{3,}/g) ?? [];
  return words.length >= 8;
}

export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

export function truncateText(rawText: string, limit: number = config.FULL_TEXT_LIMIT): string {
  return rawText.length > limit ? rawText.slice(0, limit) + '\n...[truncated]' : rawText;
}

async function tryStrategy1(buffer: Buffer): Promise<string | null> {
  try {
    const data = await pdfParse(buffer);
    const text = (data.text ?? '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      logger.info('[pdf] S1 (pdf-parse) extracted', { chars: text.length });
      return text;
    }
    logger.warn('[pdf] S1 returned insufficient text, trying S2');
  } catch (e) {
    logger.warn('[pdf] S1 threw', { error: (e as Error).message });
  }
  return null;
}

async function tryStrategy2(buffer: Buffer): Promise<string | null> {
  try {
    const data = await pdfParse(buffer, {
      pagerender(pageData: any) {
        return pageData.getTextContent({ normalizeWhitespace: true }).then((tc: any) => {
          let out = '';
          let lastY: number | null = null;
          for (const item of tc.items) {
            if (!item.str) continue;
            const y = item.transform != null ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) out += '\n';
            out += item.str;
            lastY = y;
          }
          return out;
        });
      }
    });
    const text = (data.text ?? '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      logger.info('[pdf] S2 (item renderer) extracted', { chars: text.length });
      return text;
    }
    logger.warn('[pdf] S2 returned insufficient text, trying S3');
  } catch (e) {
    logger.warn('[pdf] S2 threw', { error: (e as Error).message });
  }
  return null;
}

async function tryStrategy3(buffer: Buffer): Promise<string | null> {
  try {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const pdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise;

    let out = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const tc = await page.getTextContent({ normalizeWhitespace: true });
      let lastY: number | null = null;
      for (const item of tc.items) {
        if (!item.str) continue;
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) out += '\n';
        out += item.str;
        lastY = y;
      }
      out += '\n\n';
    }

    pdfDoc.destroy();

    const text = out.replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      logger.info('[pdf] S3 (pdfjs-dist) extracted', { chars: text.length });
      return text;
    }
  } catch (e) {
    logger.warn('[pdf] S3 threw', { error: (e as Error).message });
  }
  return null;
}

export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  return (await tryStrategy1(buffer)) ?? (await tryStrategy2(buffer)) ?? (await tryStrategy3(buffer));
}

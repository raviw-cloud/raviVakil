'use strict';
const pdfParse = require('pdf-parse');
const { FULL_TEXT_LIMIT } = require('./config');

function extractText(rawText, limit = FULL_TEXT_LIMIT) {
  return rawText.length > limit ? rawText.slice(0, limit) + '\n...[truncated]' : rawText;
}

function isUsableText(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 30) return false;
  const words = normalized.match(/[a-zA-Z]{3,}/g) || [];
  return words.length >= 8;
}

async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S1 (pdf-parse) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S1 returned insufficient text, trying S2');
  } catch (e) {
    console.warn('[pdf] S1 threw:', e.message, 'trying S2');
  }

  try {
    const data = await pdfParse(buffer, {
      pagerender(pageData) {
        return pageData.getTextContent({ normalizeWhitespace: true }).then(function (tc) {
          let out = '';
          let lastY = null;
          for (let i = 0; i < tc.items.length; i++) {
            const item = tc.items[i];
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

    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (isUsableText(text)) {
      console.log('[pdf] S2 (item renderer) extracted', text.length, 'chars');
      return text;
    }
    console.warn('[pdf] S2 returned insufficient text, trying S3');
  } catch (e) {
    console.warn('[pdf] S2 threw:', e.message, 'trying S3');
  }

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
      let lastY = null;
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
      console.log('[pdf] S3 (pdfjs-dist) extracted', text.length, 'chars');
      return text;
    }
  } catch (e) {
    console.warn('[pdf] S3 threw:', e.message);
  }

  return null;
}

module.exports = { extractText, isUsableText, extractPdfText };

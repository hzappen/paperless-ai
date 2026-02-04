const config = require('../config/config');
const visionService = require('./visionService');

class OcrService {
  async extractDocumentText(documentId, options = {}) {
    if (config.ocr?.enabled !== 'yes') {
      return { text: '', pages: [] };
    }

    const maxPages = options.maxPages || config.ocr.maxPages || 50;
    const imageFormat = options.imageFormat || config.ocr.imageFormat || 'png';
    const dpi = options.dpi || config.ocr.dpi || 150;
    const prompt = options.prompt || config.ocr.prompt || 'Convert to markdown.';
    const maxNewTokens = options.maxNewTokens || config.ocr.maxNewTokens || 4096;

    const images = await visionService.getDocumentImages(documentId, {
      maxPages,
      imageFormat,
      dpi
    });

    if (!images || images.length === 0) {
      return { text: '', pages: [] };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.ocr.timeoutMs || 120000);

    try {
      const response = await fetch(`${config.ocr.serviceUrl}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          prompt,
          max_new_tokens: maxNewTokens
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OCR service error: ${response.status}`);
      }

      const payload = await response.json();
      const text = typeof payload.text === 'string' ? payload.text : '';
      const pages = Array.isArray(payload.pages) ? payload.pages : [];

      if (!text) {
        return { text: '', pages };
      }

      const maxChars = config.ocr.maxChars || 50000;
      const trimmed = text.length > maxChars ? text.substring(0, maxChars) : text;

      return { text: trimmed, pages };
    } catch (error) {
      console.error('[ERROR] OCR extraction failed:', error.message);
      return { text: '', pages: [] };
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new OcrService();

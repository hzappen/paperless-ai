const config = require('../config/config');
const paperlessService = require('./paperlessService');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class VisionService {
  async getDocumentImages(documentId, options = {}) {
    const maxPages = options.maxPages || config.vision.maxPages || 1;
    const imageFormat = (options.imageFormat || config.vision.imageFormat || 'png').toLowerCase();
    const dpi = options.dpi || config.vision.dpi || 150;

    let tempDir = null;
    let downloadedFilePath = null;

    try {
      const document = await paperlessService.getDocument(documentId);
      const download = await paperlessService.downloadDocument(documentId);
      downloadedFilePath = download.filePath;

      if (document?.mime_type && document.mime_type.startsWith('image/')) {
        const buffer = await fs.promises.readFile(downloadedFilePath);
        const base64 = buffer.toString('base64');
        const mime = document.mime_type || 'image/png';
        return [`data:${mime};base64,${base64}`];
      }

      if (document?.mime_type !== 'application/pdf') {
        console.warn(`[DEBUG] Unsupported mime type for vision: ${document?.mime_type || 'unknown'}`);
        return [];
      }

      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'paperless-vision-'));
      const outputPrefix = path.join(tempDir, 'page');
      const useJpeg = imageFormat === 'jpg' || imageFormat === 'jpeg';
      const formatFlag = useJpeg ? '-jpeg' : '-png';
      const extension = useJpeg ? 'jpg' : 'png';

      const args = [
        formatFlag,
        '-f', '1',
        '-l', String(maxPages),
        '-r', String(dpi),
        downloadedFilePath,
        outputPrefix
      ];

      await execFileAsync('pdftoppm', args);

      const files = (await fs.promises.readdir(tempDir))
        .filter((file) => file.startsWith('page-') && file.endsWith(`.${extension}`))
        .sort((a, b) => {
          const aNum = parseInt(a.match(/page-(\d+)/)?.[1] || '0', 10);
          const bNum = parseInt(b.match(/page-(\d+)/)?.[1] || '0', 10);
          return aNum - bNum;
        });

      const images = [];
      for (const file of files) {
        const buffer = await fs.promises.readFile(path.join(tempDir, file));
        const base64 = buffer.toString('base64');
        const mime = useJpeg ? 'image/jpeg' : 'image/png';
        images.push(`data:${mime};base64,${base64}`);
      }

      return images;
    } catch (error) {
      console.error(`[ERROR] Failed to render document ${documentId} for vision:`, error.message);
      return [];
    } finally {
      if (downloadedFilePath) {
        fs.promises.unlink(downloadedFilePath).catch(() => {});
      }
      if (tempDir) {
        fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

module.exports = new VisionService();

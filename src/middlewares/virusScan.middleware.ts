import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { scanFile } from '../services/clamav.service.js';

/**
 * Middleware that scans any uploaded file for viruses using ClamAV.
 * If infected, the file is immediately purged from disk and a 400 Bad Request is returned.
 */
export const scanUploadedFile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const file = (req as any).file;

  if (!file || !file.path) {
    return next();
  }

  try {
    const { isInfected, viruses } = await scanFile(file.path);

    if (isInfected) {
      // Clean up the infected file immediately
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {
          console.error(`[ClamAV] Error removing infected file ${file.path}:`, unlinkErr);
        }
      }

      console.warn(
        `🚨 [MALWARE BLOCKED] File "${file.originalname}" was detected as infected with: ${viruses.join(', ') || 'Unknown signature'}`
      );

      res.status(400).json({
        success: false,
        message: 'Security Alert: Attachment rejected because malware or a virus was detected.',
        viruses: viruses.length > 0 ? viruses : ['Threat detected'],
      });
      return;
    }

    next();
  } catch (error: any) {
    // If scanning failed under strict security policy, remove the file and return 503
    if (fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }

    console.error('[ClamAV] Scanning failure:', error);
    res.status(503).json({
      success: false,
      message: 'Attachment scanning failed. Upload rejected due to security policy.',
      error: error?.message,
    });
  }
};

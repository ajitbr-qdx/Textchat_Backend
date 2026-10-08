import NodeClam from 'clamscan';
import fs from 'fs';
import { config } from '../config/env.js';

export interface ScanResult {
  isInfected: boolean;
  viruses: string[];
  skipped?: boolean;
}

let clamscanInstance: NodeClam | null = null;
let isInitializing = false;

/**
 * Initializes the ClamAV client instance connected to the clamd daemon.
 */
export const initClamAV = async (): Promise<NodeClam | null> => {
  if (!config.clamav.enabled) {
    return null;
  }

  if (clamscanInstance) {
    return clamscanInstance;
  }

  if (isInitializing) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return clamscanInstance;
  }

  isInitializing = true;
  try {
    const { host, port, timeout } = config.clamav;

    const clam = await new NodeClam().init({
      clamdscan: {
        host,
        port,
        timeout,
        localFallback: false,
        bypassTest: false,
        multiscan: false,
        reloadDb: false,
        active: true,
      },
      preference: 'clamdscan',
    });

    clamscanInstance = clam;
    console.log(`[ClamAV] Antivirus daemon connected successfully at ${host}:${port}`);
    return clamscanInstance;
  } catch (err: any) {
    console.warn(`[ClamAV] Scanner unavailable at ${config.clamav.host}:${config.clamav.port} (${err?.message || err}).`);
    return null;
  } finally {
    isInitializing = false;
  }
};

/**
 * Scans a file by streaming its contents over TCP to the ClamAV daemon.
 * Streaming ensures cross-platform compatibility even when ClamAV runs in Docker.
 */
export const scanFile = async (filePath: string): Promise<ScanResult> => {
  if (!config.clamav.enabled) {
    return { isInfected: false, viruses: [], skipped: true };
  }

  try {
    const scanner = await initClamAV();

    if (!scanner) {
      if (config.clamav.blockOnFail) {
        throw new Error('Antivirus scanner is offline and security policy rejects uploads.');
      }
      console.warn(`[ClamAV] Scanner is offline. Permitting file: ${filePath}`);
      return { isInfected: false, viruses: [], skipped: true };
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found for scanning: ${filePath}`);
    }

    const fileStream = fs.createReadStream(filePath);
    const result = await scanner.scanStream(fileStream);

    return {
      isInfected: Boolean(result?.isInfected),
      viruses: Array.isArray(result?.viruses) ? result.viruses : [],
    };
  } catch (error: any) {
    if (config.clamav.blockOnFail) {
      throw error;
    }
    console.warn(`[ClamAV] Scan error (${error?.message || error}). Passing file through.`);
    return { isInfected: false, viruses: [], skipped: true };
  }
};

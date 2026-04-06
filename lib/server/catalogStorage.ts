/**
 * Catalogue / offer image files — same VPS disk policy as `vpsStorage.ts` (no split backends).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { isPlaceholderUploadDirPath } from '@/lib/server/vpsStorage';

const DEFAULT_TOTAL_MAX_BYTES = 150 * 1024 * 1024;
const DEFAULT_VPS_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'catalogue');
const DEFAULT_VPS_BASE_URL = '/uploads/catalogue';

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name || 'catalog.pdf');
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '-');
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function sanitizeGenericFileName(name: string, fallback: string): string {
  const base = path.basename(name || fallback);
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '-');
  return safe || fallback;
}

export function getCatalogStorageLimits() {
  const maxTotalBytes = readNumberEnv('VPS_MAX_BYTES', DEFAULT_TOTAL_MAX_BYTES);
  return { maxTotalBytes };
}

function resolveCatalogUploadDir(): string {
  const raw = process.env.VPS_UPLOAD_DIR?.trim();
  if (raw) {
    const resolved = path.resolve(raw);
    if (isPlaceholderUploadDirPath(resolved)) {
      console.warn(
        '[catalogStorage] VPS_UPLOAD_DIR is a documentation placeholder; using <cwd>/public/uploads/catalogue.'
      );
      return DEFAULT_VPS_UPLOAD_DIR;
    }
    return resolved;
  }
  return DEFAULT_VPS_UPLOAD_DIR;
}

export async function uploadCatalogFileToVpsStorage(opts: {
  fileBuffer: Buffer;
  originalFileName: string;
}) {
  const dir = resolveCatalogUploadDir();
  const baseUrl = (process.env.VPS_PUBLIC_BASE_URL || DEFAULT_VPS_BASE_URL).trim().replace(/\/+$/, '');
  const safeName = sanitizeFileName(opts.originalFileName);
  const uniquePrefix = `${Date.now()}-${crypto.randomUUID()}`;
  const savedFileName = `${uniquePrefix}-${safeName}`;

  await mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, savedFileName);
  try {
    await writeFile(absolutePath, opts.fileBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`VPS storage write failed: ${message}`);
  }

  return {
    fileUrl: `${baseUrl}/${savedFileName}`,
    storagePath: absolutePath,
  };
}

export async function uploadOfferImageToVpsStorage(opts: {
  fileBuffer: Buffer;
  originalFileName: string;
}) {
  const dir = resolveCatalogUploadDir();
  const targetDir = path.join(dir, '..', 'offer-items');
  const baseUrlRoot = (process.env.VPS_PUBLIC_BASE_URL || DEFAULT_VPS_BASE_URL).trim().replace(/\/+$/, '');
  const baseUrl = `${baseUrlRoot.replace(/\/catalogue$/, '')}/offer-items`;
  const safeName = sanitizeGenericFileName(opts.originalFileName, 'item-image');
  const uniquePrefix = `${Date.now()}-${crypto.randomUUID()}`;
  const savedFileName = `${uniquePrefix}-${safeName}`;

  await mkdir(targetDir, { recursive: true });
  const absolutePath = path.join(targetDir, savedFileName);
  try {
    await writeFile(absolutePath, opts.fileBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`VPS storage write failed: ${message}`);
  }

  return {
    fileUrl: `${baseUrl}/${savedFileName}`,
    storagePath: absolutePath,
  };
}

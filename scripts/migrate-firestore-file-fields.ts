/**
 * One-time migration: copy legacy Firestore fields on project file documents:
 *   cloudinaryUrl → fileUrl (when fileUrl missing)
 *   cloudinaryPublicId → fileKey (when fileKey missing)
 * Optionally remove the legacy fields after copying.
 *
 * Usage (from admin-panel/):
 *   npx tsx scripts/migrate-firestore-file-fields.ts --dry-run
 *   npx tsx scripts/migrate-firestore-file-fields.ts --remove-legacy-fields
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY (JSON) or admin-panel/.env.local with that key.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp, getApps } from 'firebase-admin/app';
import type { DocumentData, DocumentReference, UpdateData } from 'firebase-admin/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const LEGACY_URL = 'cloudinaryUrl';
const LEGACY_KEY = 'cloudinaryPublicId';

function loadServiceAccountJson(): string {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (fromEnv) return fromEnv;
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) {
    throw new Error('Set FIREBASE_SERVICE_ACCOUNT_KEY or create admin-panel/.env.local');
  }
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    if (key !== 'FIREBASE_SERVICE_ACCOUNT_KEY') continue;
    let v = t.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local');
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const removeLegacy = args.includes('--remove-legacy-fields');

  const json = loadServiceAccountJson();
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(json)) });
  }
  const db = getFirestore();

  let batch = db.batch();
  let batchCount = 0;
  let docsTouched = 0;

  const commit = async () => {
    if (batchCount === 0) return;
    if (!dryRun) await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  const enqueue = async (ref: DocumentReference, payload: Record<string, unknown>) => {
    batch.update(ref, payload as UpdateData<DocumentData>);
    batchCount++;
    docsTouched++;
    if (batchCount >= 450) await commit();
  };

  const projectsParent = db.collection('files').doc('projects');
  const projectCols = await projectsParent.listCollections();
  console.log(`Projects (under files/projects): ${projectCols.length}`);

  for (const projCol of projectCols) {
    const projectId = projCol.id;
    const folderDocs = await projCol.get();
    for (const folderDoc of folderDocs.docs) {
      const filesSnap = await folderDoc.ref.collection('files').get();
      for (const fdoc of filesSnap.docs) {
        const data = fdoc.data();
        const legacyUrl = data[LEGACY_URL];
        const legacyKey = data[LEGACY_KEY];
        const hasLegacyUrl = isNonEmptyString(legacyUrl);
        const hasLegacyKey = isNonEmptyString(legacyKey);

        if (!hasLegacyUrl && !hasLegacyKey) continue;

        const hasFileUrl = isNonEmptyString(data.fileUrl);
        const hasFileKey = isNonEmptyString(data.fileKey);

        const payload: Record<string, unknown> = {};

        if (hasLegacyUrl && !hasFileUrl) payload.fileUrl = legacyUrl;
        if (hasLegacyKey && !hasFileKey) payload.fileKey = legacyKey;

        if (removeLegacy) {
          if (hasLegacyUrl) payload[LEGACY_URL] = FieldValue.delete();
          if (hasLegacyKey) payload[LEGACY_KEY] = FieldValue.delete();
        }

        if (Object.keys(payload).length === 0) continue;

        if (dryRun) {
          console.log(`[dry-run] ${fdoc.ref.path} keys=${Object.keys(payload).join(', ')}`);
          docsTouched++;
          continue;
        }

        await enqueue(fdoc.ref, payload);
      }
    }
  }

  await commit();
  console.log(
    dryRun
      ? `[dry-run] Would update ${docsTouched} document(s). Run without --dry-run to apply.`
      : `Done. Updated ${docsTouched} document(s).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

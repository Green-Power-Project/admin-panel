import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const CONFIG_COLLECTION = 'config';
const GALLERY_DOC_ID = 'gallery';

const GALLERY_CONFIG_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let galleryConfigCache: { data: Record<string, unknown> | null; ts: number } | null = null;

function clearGalleryConfigCache() {
  galleryConfigCache = null;
}

/** Single read of config/gallery; cached for TTL. Call clearGalleryConfigCache after writes. */
async function getGalleryConfigDoc(db: Firestore): Promise<Record<string, unknown> | null> {
  if (galleryConfigCache && Date.now() - galleryConfigCache.ts < GALLERY_CONFIG_CACHE_TTL_MS) {
    return galleryConfigCache.data;
  }
  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  galleryConfigCache = { data, ts: Date.now() };
  return data;
}

/** Default category keys (same as galleryConstants – single source for storage keys). */
export const DEFAULT_CATEGORY_KEYS = [
  'Pflaster & Einfahrten',
  'Terrassen & Plattenbeläge',
  'Naturstein & Feinsteinzeug',
  'Mauern, L-Steine & Hangbefestigung',
  'Treppen & Podeste',
  'Gartenwege & Eingänge',
  'Entwässerung & Drainage',
  'Erdarbeiten & Unterbau',
  'Rasen, Rollrasen & Grünflächen',
  'Bepflanzung & Gartengestaltung',
  'Zäune, Sichtschutz & Einfriedungen',
  'Außenanlagen Komplett',
  'Vorher / Nachher',
  'Highlights & Referenzprojekte',
] as const;

export type GalleryCategoryKey = (typeof DEFAULT_CATEGORY_KEYS)[number];

/** Map from category key (storage value) to display name. Missing keys fall back to the key. */
export type CategoryLabelsMap = Record<string, string>;

/**
 * Get gallery category labels from Firestore. Returns empty object if no config.
 * Uses shared cache with getGalleryCategoryKeys (single doc read).
 */
export async function getGalleryCategoryLabels(db: Firestore): Promise<CategoryLabelsMap> {
  const data = await getGalleryConfigDoc(db);
  if (!data) return {};
  const labels = data.categoryLabels;
  return typeof labels === 'object' && labels !== null ? { ...labels } as CategoryLabelsMap : {};
}

/**
 * Get gallery category keys from Firestore. Returns DEFAULT_CATEGORY_KEYS if not set.
 * Uses shared cache with getGalleryCategoryLabels (single doc read).
 */
export async function getGalleryCategoryKeys(db: Firestore): Promise<string[]> {
  const data = await getGalleryConfigDoc(db);
  if (!data) return [...DEFAULT_CATEGORY_KEYS];
  const keys = data.categoryKeys;
  if (Array.isArray(keys) && keys.length > 0) return keys.filter((k) => typeof k === 'string');
  return [...DEFAULT_CATEGORY_KEYS];
}

/**
 * Save gallery category keys and optionally labels to Firestore (merge).
 */
export async function setGalleryCategoryKeys(
  db: Firestore,
  keys: string[],
  labels?: CategoryLabelsMap
): Promise<void> {
  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  const payload: { categoryKeys: string[]; categoryLabels?: CategoryLabelsMap } = { categoryKeys: keys };
  if (labels !== undefined) payload.categoryLabels = labels;
  await setDoc(ref, payload, { merge: true });
  clearGalleryConfigCache();
}

/**
 * Save gallery category labels to Firestore (merge). Keys should be from category keys.
 */
export async function setGalleryCategoryLabels(
  db: Firestore,
  labels: CategoryLabelsMap
): Promise<void> {
  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  await setDoc(ref, { categoryLabels: labels }, { merge: true });
  clearGalleryConfigCache();
}

/** Get display name for a category key (custom label or key). */
export function getCategoryDisplayName(labels: CategoryLabelsMap, key: string): string {
  if (labels[key]?.trim()) return labels[key].trim();
  return key;
}

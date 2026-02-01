import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const CONFIG_COLLECTION = 'config';
const GALLERY_DOC_ID = 'gallery';

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
 */
export async function getGalleryCategoryLabels(db: Firestore): Promise<CategoryLabelsMap> {
  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data();
  const labels = data?.categoryLabels;
  return typeof labels === 'object' && labels !== null ? { ...labels } : {};
}

/**
 * Save gallery category labels to Firestore (merge). Keys should be from DEFAULT_CATEGORY_KEYS.
 */
export async function setGalleryCategoryLabels(
  db: Firestore,
  labels: CategoryLabelsMap
): Promise<void> {
  const ref = doc(db, CONFIG_COLLECTION, GALLERY_DOC_ID);
  await setDoc(ref, { categoryLabels: labels }, { merge: true });
}

/** Get display name for a category key (custom label or key). */
export function getCategoryDisplayName(labels: CategoryLabelsMap, key: string): string {
  if (labels[key]?.trim()) return labels[key].trim();
  return key;
}

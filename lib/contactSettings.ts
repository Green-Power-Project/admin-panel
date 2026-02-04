import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const CONTACT_SETTINGS_COLLECTION = 'siteSettings';
export const CONTACT_SETTINGS_DOC_ID = 'contact';

export interface ContactSettingsData {
  phone?: string;
  email?: string;
  whatsApp?: string;
  website?: string;
  companyName?: string;
  address?: string;
  managingDirector?: string;
}

const CONTACT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let contactSettingsCache: { data: ContactSettingsData; ts: number } | null = null;

function getCachedContactSettings(): ContactSettingsData | null {
  if (!contactSettingsCache || Date.now() - contactSettingsCache.ts > CONTACT_CACHE_TTL_MS) return null;
  return contactSettingsCache.data;
}

function setCachedContactSettings(data: ContactSettingsData) {
  contactSettingsCache = { data: { ...data }, ts: Date.now() };
}

export function clearCachedContactSettings() {
  contactSettingsCache = null;
}

/**
 * Get contact settings from Firestore (used in admin panel and customer portal).
 * Cached for 2 minutes to avoid repeated reads.
 */
export async function getContactSettings(db: Firestore): Promise<ContactSettingsData> {
  const cached = getCachedContactSettings();
  if (cached) return cached;
  const ref = doc(db, CONTACT_SETTINGS_COLLECTION, CONTACT_SETTINGS_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data();
  const result = {
    phone: data.phone ?? '',
    email: data.email ?? '',
    whatsApp: data.whatsApp ?? '',
    website: data.website ?? '',
    companyName: data.companyName ?? '',
    address: data.address ?? '',
    managingDirector: data.managingDirector ?? '',
  };
  setCachedContactSettings(result);
  return result;
}

/**
 * Normalize WhatsApp number for storage: digits only (strip +, spaces, dashes, etc.).
 * wa.me links require digits only.
 */
function normalizeWhatsApp(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly;
}

/**
 * Save contact settings to Firestore (admin only).
 * WhatsApp is stored as digits only so wa.me links work regardless of how admin entered it (+49..., 49..., etc.).
 */
export async function setContactSettings(
  db: Firestore,
  data: ContactSettingsData
): Promise<void> {
  const ref = doc(db, CONTACT_SETTINGS_COLLECTION, CONTACT_SETTINGS_DOC_ID);
  const payload = {
    phone: (data.phone ?? '').trim(),
    email: (data.email ?? '').trim(),
    whatsApp: normalizeWhatsApp(data.whatsApp ?? ''),
    website: (data.website ?? '').trim(),
    companyName: (data.companyName ?? '').trim(),
    address: (data.address ?? '').trim(),
    managingDirector: (data.managingDirector ?? '').trim(),
  };
  await setDoc(ref, payload, { merge: true });
  setCachedContactSettings(payload);
}

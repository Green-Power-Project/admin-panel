import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const CONTACT_SETTINGS_COLLECTION = 'siteSettings';
export const CONTACT_SETTINGS_DOC_ID = 'contact';

export interface ContactSettingsData {
  phone?: string;
  email?: string;
  whatsApp?: string;
  website?: string;
}

/**
 * Get contact settings from Firestore (used in admin panel and customer portal).
 */
export async function getContactSettings(db: Firestore): Promise<ContactSettingsData> {
  const ref = doc(db, CONTACT_SETTINGS_COLLECTION, CONTACT_SETTINGS_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data();
  return {
    phone: data.phone ?? '',
    email: data.email ?? '',
    whatsApp: data.whatsApp ?? '',
    website: data.website ?? '',
  };
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
  await setDoc(ref, {
    phone: (data.phone ?? '').trim(),
    email: (data.email ?? '').trim(),
    whatsApp: normalizeWhatsApp(data.whatsApp ?? ''),
    website: (data.website ?? '').trim(),
  }, { merge: true });
}

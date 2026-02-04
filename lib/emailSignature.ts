import type { Firestore } from 'firebase-admin/firestore';
import { CONTACT_SETTINGS_COLLECTION, CONTACT_SETTINGS_DOC_ID } from './contactSettings';

const DEFAULT_COMPANY_NAME = 'Grün Power';
const DEFAULT_SIGNATURE = 'Grün Power Garten- und Landschaftsbau';
const DEFAULT_MANAGING_DIRECTOR = 'Albion Berisha';
const DEFAULT_ADDRESS = 'Waldseestraße 22, 88255 Baienfurt';
const DEFAULT_PHONE = '01573 1709686';
const DEFAULT_EMAIL = 'info@gruen-power.de';
const DEFAULT_WEBSITE = 'https://gruen-power.de/';
const ADMIN_PANEL_URL_DEFAULT = 'http://localhost:3000';

/**
 * Absolute URL for the email logo (hosted from admin panel public folder).
 * Used in all outgoing emails so the logo displays in client mail apps.
 */
export function getEmailLogoUrl(): string {
  const base = process.env.ADMIN_PANEL_URL || ADMIN_PANEL_URL_DEFAULT;
  return `${base.replace(/\/$/, '')}/email-logo.png`;
}

/**
 * HTML block to show the Grün Power logo at the top of email body.
 * Use in all email templates for consistent branding.
 */
export function buildEmailLogoHtml(): string {
  const url = getEmailLogoUrl();
  return `<div style="text-align: center; margin-bottom: 20px;"><img src="${url}" alt="Grün Power" width="180" style="max-width: 200px; height: auto;" /></div>`;
}

export interface ContactForEmail {
  companyName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  managingDirector?: string;
}

/**
 * Fetch contact settings from Firestore (Admin SDK) for use in email templates.
 */
export async function getContactForEmail(db: Firestore | null): Promise<ContactForEmail> {
  if (!db) return {};
  try {
    const snap = await db.collection(CONTACT_SETTINGS_COLLECTION).doc(CONTACT_SETTINGS_DOC_ID).get();
    if (!snap.exists) return {};
    const d = snap.data() || {};
    return {
      companyName: (d.companyName as string)?.trim() || '',
      email: (d.email as string)?.trim() || '',
      phone: (d.phone as string)?.trim() || '',
      website: (d.website as string)?.trim() || '',
      address: (d.address as string)?.trim() || '',
      managingDirector: (d.managingDirector as string)?.trim() || '',
    };
  } catch {
    return {};
  }
}

/**
 * Build professional email footer HTML and plain text for all portal emails.
 */
export function buildEmailSignature(contact: ContactForEmail): { html: string; text: string } {
  const company = contact.companyName || DEFAULT_COMPANY_NAME;
  const signature = contact.managingDirector
    ? `${company}<br>${contact.managingDirector}`
    : (contact.companyName ? company : DEFAULT_SIGNATURE);
  const lines: string[] = [];
  if (contact.address) lines.push(contact.address);
  if (contact.phone) lines.push(`Tel: ${contact.phone}`);
  if (contact.email) lines.push(`E-Mail: ${contact.email}`);
  if (contact.website) lines.push(contact.website);
  const footerHtml = `
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px; text-align: center;">
      <p style="margin: 0 0 6px 0; font-weight: bold; color: #333;">${company}</p>
      ${contact.address ? `<p style="margin: 0 0 4px 0;">${contact.address}</p>` : ''}
      ${contact.managingDirector ? `<p style="margin: 0 0 4px 0;">${contact.managingDirector}</p>` : ''}
      ${contact.phone ? `<p style="margin: 0 0 4px 0;">Tel: ${contact.phone}</p>` : ''}
      ${contact.email ? `<p style="margin: 0 0 4px 0;">E-Mail: <a href="mailto:${contact.email}">${contact.email}</a></p>` : ''}
      ${contact.website ? `<p style="margin: 0 0 4px 0;"><a href="${contact.website}">${contact.website}</a></p>` : ''}
      <p style="margin: 12px 0 0 0;">This is an automated notification from ${company}.</p>
    </div>`;
  const footerText = [
    '—',
    company,
    ...lines,
    '',
    `This is an automated notification from ${company}.`,
  ].join('\n');
  return { html: footerHtml, text: footerText };
}

/**
 * German closing block for portal emails (Mit freundlichen Grüßen + company + Geschäftsführer + contact).
 * Matches the standard Grün Power layout used in customer/project notifications.
 */
export function buildGermanEmailClosing(contact: ContactForEmail): { html: string; text: string } {
  const company = contact.companyName || DEFAULT_SIGNATURE;
  const director = contact.managingDirector || DEFAULT_MANAGING_DIRECTOR;
  const address = contact.address || DEFAULT_ADDRESS;
  const phone = contact.phone || DEFAULT_PHONE;
  const email = contact.email || DEFAULT_EMAIL;
  const website = contact.website || DEFAULT_WEBSITE;
  const html = `
    <p style="margin: 24px 0 8px 0;">Mit freundlichen Grüßen</p>
    <p style="margin: 0 0 4px 0; font-weight: bold; color: #333;">${company}</p>
    <p style="margin: 0 0 4px 0;">Geschäftsführer: ${director}</p>
    <p style="margin: 8px 0 2px 0;">📍 ${address}</p>
    <p style="margin: 0 0 2px 0;">📞 ${phone}</p>
    <p style="margin: 0 0 2px 0;">📧 <a href="mailto:${email}">${email}</a></p>
    <p style="margin: 0 0 0 0;">🌐 <a href="${website}">${website}</a></p>`;
  const text = [
    'Mit freundlichen Grüßen',
    company,
    `Geschäftsführer: ${director}`,
    `📍 ${address}`,
    `📞 ${phone}`,
    `📧 ${email}`,
    `🌐 ${website}`,
  ].join('\n');
  return { html, text };
}

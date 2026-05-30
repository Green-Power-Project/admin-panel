const APP_ID = process.env.ONESIGNAL_APP_ID ?? '';
const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY ?? '';

// Use PORTAL_URL env var when it points to production; otherwise fall back to known production domain.
const PORTAL_BASE = (() => {
  const v = (process.env.PORTAL_URL ?? '').replace(/\/$/, '');
  return v.startsWith('https://') ? v : 'https://customer.gruen-power.cloud';
})();

export interface OneSignalPushPayload {
  externalUserId: string; // Firebase UID (= customerId stored on projects)
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a Web Push notification to a specific customer via OneSignal.
 * Fire-and-forget safe: call with void and .catch() — never awaited in the critical path.
 */
export async function sendOneSignalPush(payload: OneSignalPushPayload): Promise<void> {
  if (!APP_ID || !REST_API_KEY) {
    console.log('[OneSignal] ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY not set — skipping push');
    return;
  }

  const notifBody = {
    app_id: APP_ID,
    include_external_user_ids: [payload.externalUserId],
    channel_for_external_user_ids: 'push',
    headings: { en: payload.title, de: payload.title },
    contents: { en: payload.body, de: payload.body },
    ...(payload.url ? { url: payload.url } : {}),
    chrome_web_icon: `${PORTAL_BASE}/196.png`,
    chrome_web_badge: `${PORTAL_BASE}/196.png`,
  };

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${REST_API_KEY}`,
      },
      body: JSON.stringify(notifBody),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok || data.errors) {
      console.warn('[OneSignal] Push failed:', JSON.stringify(data));
    } else {
      console.log('[OneSignal] Push sent. ID:', data.id, '| Recipients:', data.recipients);
    }
  } catch (e) {
    console.warn('[OneSignal] Push error (non-blocking):', e);
  }
}


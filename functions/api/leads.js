import { clean, json, validEmail } from './_shared.js';

export async function onRequestPost({ request, env }) {
  let data; try { data = await request.json(); } catch { return json({ ok: false, code: 'invalid_request', error: 'Invalid request.' }, 400); }
  const lead = Object.fromEntries(['name','email','phone','company','interest','message','role','country','volume','timeline','source','language'].map(key => [key, clean(data[key]) ]));
  if (!lead.name || !validEmail(lead.email) || data.consent !== true) return json({ ok: false, code: 'invalid_lead', error: 'Name, valid email, and consent are required.' }, 422);
  if (!env.GOOGLE_SHEETS_WEBHOOK_URL || !env.LEAD_WEBHOOK_SECRET) return json({ ok: false, code: 'lead_storage_not_configured', error: 'Lead storage is not configured.' }, 503);
  lead.createdAt = new Date().toISOString(); lead.consent = true; lead.webhookSecret = env.LEAD_WEBHOOK_SECRET;
  try {
    const response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(lead) });
    if (!response.ok) throw new Error('Google Sheets webhook failed');
    const result = await response.json().catch(() => ({}));
    if (!result.ok) throw new Error('Google Sheets rejected lead');
    return json({ ok: true, saved: true, emailed: false, storage: 'Google Sheets' }, 201);
  } catch { return json({ ok: false, code: 'lead_storage_failed', error: 'The lead could not be saved.' }, 502); }
}

import { json } from './_shared.js';

export async function onRequestGet({ env }) {
  const configured = Boolean(env.GEMINI_API_KEY);
  return json({ ok: true, version: 'cloudflare-v1', aiConfigured: configured, aiReady: configured, emailReady: false, leadStorage: 'Google Sheets' });
}

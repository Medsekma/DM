import { clean, json } from './_shared.js';

const CONTEXT = `You are DM Assistant, DM PHARMA's concise commercial website assistant in Monastir, Tunisia.
Public facts only: DM PHARMA manufactures sterile single-use medical devices, including syringes in 3 mL and 5 mL formats and insulin syringes in 0.5 mL and 1 mL formats under the SOFTJECT brand. Commercial contact: direction@dmpharma.com.tn.
Answer only the exact question. Default to one short sentence; use at most two short sentences when necessary and normally stay under 35 words. Do not open with a company overview, repeat facts, or add unrequested details.
Never volunteer internal, regulatory, certification, qualification, capacity, pricing, customer, supplier, equipment, launch, availability, or timeline details. Never describe certification status. If asked about quality or regulatory documents, briefly say the DM PHARMA team can confirm the applicable documents and invite an inquiry.
Do not give medical advice or request patient information. Direct complaints, adverse events, or suspected defects to a human quality contact.
Use recent conversation context. When the visitor shows buying, quotation, distribution, partnership, volume, delivery, or market interest, answer briefly and invite them to use the website's inquiry option. Do not ask follow-up commercial or contact-detail questions, because the guided inquiry flow collects those separately.`;

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ ok: false, code: 'missing_key', error: 'Gemini is not configured.' }, 503);
  let data; try { data = await request.json(); } catch { return json({ ok: false, code: 'invalid_request', error: 'Invalid request.' }, 400); }
  const message = clean(data.message, 3000);
  if (!message) return json({ ok: false, code: 'empty_message', error: 'Message required.' }, 422);
 const websiteLanguage = ['fr', 'en', 'ar'].includes(clean(data.language, 5))
  ? clean(data.language, 5)
  : 'fr';

const fallbackLanguage = ({ fr: 'French', en: 'English', ar: 'Arabic' })[websiteLanguage];
  const history = Array.isArray(data.history) ? data.history.slice(-6) : [];
  const contents = history.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: clean(item.text, 900) }] })).filter(item => item.parts[0].text);
  contents.push({
  role: 'user',
  parts: [{
    text: `${CONTEXT}

Return ONLY valid JSON in exactly this format:
{"language":"fr","answer":"..."}

Language rule:
- Detect the language from the CURRENT visitor question only.
- If it is clearly French, return "fr".
- If it is clearly English, return "en".
- If it is clearly Arabic, return "ar".
- If the message is too ambiguous to identify reliably, genuinely mixed-language, or has no meaningful language signal, use "${websiteLanguage}".
- Do not use the website language when the current message is clearly written in another supported language.
- Do not use conversation history to decide the language.
- Put the visitor-facing response only in "answer".

The website language is ${fallbackLanguage}.
Current visitor question: ${message}`
  }]
});
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  try {
    const endpoint = 'https:' + '//' + 'generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY);
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
  contents,
  generationConfig: {
    temperature: 0.25,
    topP: 0.8,
    maxOutputTokens: 180,
    responseMimeType: 'application/json'
  }
}),
    });
    const result = await response.json();
    if (!response.ok) return json({ ok: false, code: response.status === 429 ? 'free_quota' : 'provider_error', error: 'Gemini could not answer right now.' }, response.status === 429 ? 429 : 502);
    const rawAnswer = (result.candidates?.[0]?.content?.parts || [])
  .map(part => clean(part.text))
  .filter(Boolean)
  .join(' ')
  .trim();

let parsedAnswer = null;
try {
  parsedAnswer = JSON.parse(rawAnswer);
} catch {}

const detectedLanguage = ['fr', 'en', 'ar'].includes(parsedAnswer?.language)
  ? parsedAnswer.language
  : websiteLanguage;

const answer = clean(
  typeof parsedAnswer?.answer === 'string' ? parsedAnswer.answer : rawAnswer
);

if (!answer) {
  return json({ ok: false, code: 'empty_response', error: 'Gemini returned no answer.' }, 502);
}
    const combined = [message, ...history.map(item => clean(item.text))].join(' ');
    const commercial = /quote|price|pricing|buy|order|distribut|partner|supply|volume|delivery|devis|prix|tarif|acheter|commande|distribu|parten|livraison|عرض|سعر|شراء|طلب|موزع|شريك|توريد|كمية/i.test(combined);
    return json({
  ok: true,
  version: 'cloudflare-v1',
  model,
  answer,
  language: detectedLanguage,
  intent: commercial ? 'quote' : 'other',
  suggestedReplies: []
});
  } catch { return json({ ok: false, code: 'timeout', error: 'Gemini could not answer right now.' }, 504); }
}

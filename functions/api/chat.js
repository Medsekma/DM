import { clean, json } from './_shared.js';

const CONTEXT = `You are DM Assistant, DM PHARMA's helpful commercial website assistant in Monastir, Tunisia.

Verified public facts:
- DM PHARMA manufactures sterile single-use medical devices.
- Products include 3 mL and 5 mL syringes and 0.5 mL and 1 mL insulin syringes under the Softject brand.
- Commercial contact: direction@dmpharma.com.tn.

Conversation style:
- Answer the visitor's actual question naturally and directly.
- Sound like a capable human assistant, not a form or a decision tree.
- Keep most answers to one or two short sentences, normally under 55 words.
- Use recent conversation history for meaning and continuity, but never repeat a question already answered.
- Ask at most one useful follow-up question, and only when it genuinely helps.
- Do not repeatedly push the contact form or email. Offer a contact action only when the visitor expresses commercial intent, asks to contact the company, requests information you cannot confirm, or is ready for a human follow-up.
- Never ask for the visitor's name, email, phone number, or company inside the chat. The website contact form handles personal details.
- Never claim that an inquiry was submitted unless the website confirms it.

Safety and scope:
- Never invent internal, regulatory, certification, qualification, capacity, pricing, customer, supplier, equipment, launch, availability, or delivery information.
- Never describe certification status. For quality or regulatory documentation, say the DM PHARMA team can confirm the applicable documents and offer a contact action.
- Do not give medical advice or request patient information.
- Direct complaints, adverse events, or suspected product defects to the human team and offer contact actions.`;

const LANGUAGE_NAMES = { fr: 'French', en: 'English', ar: 'Arabic' };
const VALID_LANGUAGES = new Set(Object.keys(LANGUAGE_NAMES));
const VALID_INTENTS = new Set(['general', 'commercial', 'contact', 'quality', 'complaint']);
const VALID_ACTIONS = new Set(['start_inquiry', 'contact_form', 'email']);

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return json({ ok: false, code: 'missing_key', error: 'Gemini is not configured.' }, 503);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, code: 'invalid_request', error: 'Invalid request.' }, 400);
  }

  const message = clean(data.message, 3000);
  if (!message) {
    return json({ ok: false, code: 'empty_message', error: 'Message required.' }, 422);
  }

  const requestedWebsiteLanguage = clean(data.language, 5);
  const websiteLanguage = VALID_LANGUAGES.has(requestedWebsiteLanguage)
    ? requestedWebsiteLanguage
    : 'fr';

  const history = Array.isArray(data.history) ? data.history.slice(-8) : [];
  const contents = history
    .map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: clean(item.text, 1200) }],
    }))
    .filter(item => item.parts[0].text);

  contents.push({
    role: 'user',
    parts: [{
      text: `${CONTEXT}

Respond as strict JSON with this exact shape:
{"language":"fr","answer":"...","intent":"general","actions":[]}

Language decision:
- Detect language from the CURRENT visitor message only.
- Use "fr" for clearly French, "en" for clearly English, and "ar" for clearly Arabic.
- If the current message is too short, ambiguous, language-neutral, or genuinely mixed-language, use the website fallback language: "${websiteLanguage}" (${LANGUAGE_NAMES[websiteLanguage]}).
- Write the answer in the selected language.

Intent values:
- "general": ordinary product or company question.
- "commercial": quote, pricing, purchasing, distribution, partnership, order, volume, supply, or delivery interest.
- "contact": the visitor explicitly wants to contact or speak with the company.
- "quality": quality, regulatory, certification, or documentation question.
- "complaint": complaint, adverse event, or suspected product defect.

Action rules:
- actions may contain only "start_inquiry", "contact_form", and/or "email".
- For clear commercial intent, return "start_inquiry" and "contact_form". This lets the visitor either share minimal lead details in chat or use the full form.
- For explicit contact intent, return "contact_form" and "email".
- For quality questions needing confirmation, or complaints, return "contact_form" and "email".
- For general questions, return no actions unless human follow-up is genuinely useful.
- Return no more than two actions. Actions are buttons outside the answer. Do not list URLs or give step-by-step form instructions in the answer.

CURRENT visitor message: ${message}`,
    }],
  });

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  try {
    const endpoint = 'https://' +
      'generativelanguage.googleapis.com/v1beta/models/' +
      model +
      ':generateContent?key=' +
      encodeURIComponent(env.GEMINI_API_KEY);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.35,
          topP: 0.85,
          maxOutputTokens: 240,
          responseMimeType: 'application/json',
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      return json({
        ok: false,
        code: response.status === 429 ? 'free_quota' : 'provider_error',
        error: 'Gemini could not answer right now.',
      }, response.status === 429 ? 429 : 502);
    }

    const raw = (result.candidates?.[0]?.content?.parts || [])
      .map(part => clean(part.text, 4000))
      .filter(Boolean)
      .join(' ')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ ok: false, code: 'invalid_response', error: 'Gemini returned an invalid answer.' }, 502);
    }

    const language = VALID_LANGUAGES.has(parsed?.language)
      ? parsed.language
      : websiteLanguage;
    const answer = clean(parsed?.answer, 1800);
    const intent = VALID_INTENTS.has(parsed?.intent) ? parsed.intent : 'general';
    const actions = Array.isArray(parsed?.actions)
      ? [...new Set(parsed.actions.filter(action => VALID_ACTIONS.has(action)))].slice(0, 2)
      : [];

    if (!answer) {
      return json({ ok: false, code: 'empty_response', error: 'Gemini returned no answer.' }, 502);
    }

    return json({
      ok: true,
      version: 'cloudflare-v2',
      model,
      answer,
      language,
      intent,
      actions,
    });
  } catch {
    return json({ ok: false, code: 'timeout', error: 'Gemini could not answer right now.' }, 504);
  }
}

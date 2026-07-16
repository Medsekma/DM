/** DM PHARMA lead collector — Version 1 (Google Sheets only).
 * Before deployment: set Script Properties LEAD_WEBHOOK_SECRET to a long random value.
 */
const SHEET_NAME = 'Leads';
const HEADERS = ['Received at','Source','Name','Email','Phone','Organization','Product interest','Message','Language','Consent'];

function doPost(e) {
  try {
    const lead = JSON.parse(e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('LEAD_WEBHOOK_SECRET');
    if (!expected || lead.webhookSecret !== expected) return reply_({ ok: false, error: 'Unauthorized' });
    if (!lead.name || !lead.email || lead.consent !== true) return reply_({ ok: false, error: 'Invalid lead' });
    const sheet = getSheet_();
    sheet.appendRow([lead.createdAt || new Date().toISOString(), lead.source || '', lead.name, lead.email, lead.phone || '', lead.company || '', lead.interest || '', lead.message || '', lead.language || 'fr', 'Yes']);
    return reply_({ ok: true, saved: true, emailed: false });
  } catch (error) { return reply_({ ok: false, error: String(error) }); }
}
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}
function reply_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }


/** Sends a CSV attachment containing only leads not included in the prior digest.
 * Create a time-driven Apps Script trigger for this function and choose the frequency in the Google UI.
 */
function sendLeadDigest() {
  const recipient = PropertiesService.getScriptProperties().getProperty('LEAD_DIGEST_RECIPIENT') || 'medsekmasn@gmail.com';
  const sheet = getSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return;
  const properties = PropertiesService.getScriptProperties();
  const lastSentRow = Number(properties.getProperty('LAST_DIGEST_ROW') || '1');
  const newRows = values.slice(Math.max(1, lastSentRow));
  if (!newRows.length) return;
  const csv = [values[0], ...newRows].map(toCsvLine_).join('\n');
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  MailApp.sendEmail({
    to: recipient,
    subject: `DM PHARMA — ${newRows.length} new lead(s)`,
    body: `Attached is the latest DM PHARMA lead export (${newRows.length} new lead(s)).`,
    attachments: [Utilities.newBlob(csv, 'text/csv', `dmpharma-leads-${timestamp}.csv`)],
    name: 'DM PHARMA Leads'
  });
  properties.setProperty('LAST_DIGEST_ROW', String(values.length));
}
function toCsvLine_(row) { return row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(','); }

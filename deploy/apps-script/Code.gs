// AnalytIQ mailer and activation registry for the website checkout.
//
// Deploy as a web app: Execute as "Me", Who has access "Anyone". The site
// calls it after Paystack confirms a payment (email + leads) and when a
// customer activates a licence (one key, one computer).
//
// Fill in both values, then Deploy > New deployment > Web app.

const SECRET = ''; // long random text, also set as APPS_SCRIPT_SECRET
const OWNER_EMAIL = ''; // your email for new demo/quote leads

function doGet() {
  return json_({ ok: true, service: 'analytiq-mail' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SECRET || body.secret !== SECRET) {
      return json_({ ok: false, error: 'forbidden' });
    }
    if (body.action === 'email') {
      return sendKey_(body);
    }
    if (body.action === 'lead') {
      return saveLead_(body.lead || {});
    }
    if (body.action === 'activate') {
      return activate_(body);
    }
    if (body.action === 'deactivate') {
      return deactivate_(body);
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function sendKey_(body) {
  var to = String(body.to || '').trim();
  var text = String(body.text || '');
  if (!to || !text) return json_({ ok: false, error: 'missing recipient or text' });
  GmailApp.sendEmail(to, String(body.subject || 'Your AnalytIQ licence key'), text, {
    name: 'AnalytIQ',
  });
  return json_({ ok: true });
}

function saveLead_(lead) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = leadSheet_();
    sheet.appendRow([
      new Date(),
      lead.kind || '',
      lead.name || '',
      lead.business || '',
      lead.phone || '',
      lead.email || '',
      lead.businessType || '',
      lead.tills || '',
      lead.branches || '',
      lead.locations || '',
      lead.notes || '',
    ]);
    if (OWNER_EMAIL) {
      GmailApp.sendEmail(
        OWNER_EMAIL,
        'New AnalytIQ lead: ' + (lead.business || lead.name || 'unknown'),
        JSON.stringify(lead, null, 2)
      );
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function leadSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LEADS_SHEET_ID');
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];

  var spreadsheet = SpreadsheetApp.create('AnalytIQ leads');
  props.setProperty('LEADS_SHEET_ID', spreadsheet.getId());
  var sheet = spreadsheet.getSheets()[0];
  sheet.appendRow([
    'Received',
    'Kind',
    'Name',
    'Business',
    'Phone',
    'Email',
    'Business type',
    'Tills',
    'Branches',
    'Locations',
    'Notes',
  ]);
  return sheet;
}

// --- Activation registry: one key, one computer -----------------------------
// Column 2 (Install id) is the binding. To move a customer to a new computer,
// clear that cell in the sheet (or let the app release it) and activate again.

function activate_(body) {
  var licenceId = String(body.licenceId || '').trim();
  var installId = String(body.installId || '').trim();
  if (!licenceId || !installId) return json_({ ok: false, error: 'missing ids' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = activationSheet_();
    var row = findLicenceRow_(sheet, licenceId);
    var now = new Date().toISOString();
    if (!row) {
      sheet.appendRow([licenceId, installId, body.business || '', body.plan || '', now, now, '']);
      return json_({ ok: true, state: 'bound', boundAt: now });
    }
    var values = row.values;
    var boundTo = String(values[1] || '').trim();
    if (boundTo && boundTo !== installId) {
      return json_({ ok: true, state: 'taken', boundAt: values[4] || null });
    }
    sheet.getRange(row.index, 2).setValue(installId);
    sheet.getRange(row.index, 6).setValue(now);
    if (!boundTo) sheet.getRange(row.index, 7).setValue('');
    return json_({ ok: true, state: 'bound', boundAt: values[4] || now });
  } finally {
    lock.releaseLock();
  }
}

function deactivate_(body) {
  var licenceId = String(body.licenceId || '').trim();
  var installId = String(body.installId || '').trim();
  if (!licenceId || !installId) return json_({ ok: false, error: 'missing ids' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = activationSheet_();
    var row = findLicenceRow_(sheet, licenceId);
    if (!row) return json_({ ok: true, state: 'unbound' });
    var boundTo = String(row.values[1] || '').trim();
    if (boundTo && boundTo !== installId) {
      return json_({ ok: true, state: 'taken', boundAt: row.values[4] || null });
    }
    var now = new Date().toISOString();
    sheet.getRange(row.index, 2).setValue('');
    sheet.getRange(row.index, 6).setValue(now);
    sheet.getRange(row.index, 7).setValue(now);
    return json_({ ok: true, state: 'released', boundAt: null });
  } finally {
    lock.releaseLock();
  }
}

function findLicenceRow_(sheet, licenceId) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i += 1) {
    if (String(ids[i][0]) === licenceId) {
      var index = i + 2;
      return { index: index, values: sheet.getRange(index, 1, 1, 7).getValues()[0] };
    }
  }
  return null;
}

function activationSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ACTIVATIONS_SHEET_ID');
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];

  var spreadsheet = SpreadsheetApp.create('AnalytIQ activations');
  props.setProperty('ACTIVATIONS_SHEET_ID', spreadsheet.getId());
  var sheet = spreadsheet.getSheets()[0];
  sheet.setName('activations');
  sheet.appendRow([
    'Licence id',
    'Install id',
    'Business',
    'Plan',
    'Activated at',
    'Updated at',
    'Released at',
  ]);
  return sheet;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}

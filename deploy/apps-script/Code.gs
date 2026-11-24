// AnalytIQ mailer, activation registry and lightweight sales analytics.
//
// Deploy as a web app: Execute as "Me", Who has access "Anyone". The site
// calls it after Paystack confirms a payment (email + orders), when a customer
// activates a licence (one key, one computer), and when a dashboard reads stats.
//
// Fill in SECRET, then Deploy > New deployment > Web app.

const SECRET = ''; // long random text, also set as APPS_SCRIPT_SECRET
const OWNER_EMAIL = ''; // your email for new demo/quote leads

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action === 'stats') {
    if (!SECRET || params.secret !== SECRET) {
      return json_({ ok: false, error: 'forbidden' });
    }
    return stats_();
  }
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
    if (body.action === 'order') {
      return saveOrder_(body.order || {});
    }
    if (body.action === 'download') {
      return saveDownload_(body.download || {});
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

// --- Sales analytics --------------------------------------------------------
// Paystack remains the accounting ledger. These sheets answer the small daily
// questions: how many installer clicks, which promo was used, and where users
// are (from CDN headers, so approximate).

const ORDER_COLUMNS = [
  'Reference',
  'Created',
  'Paid at',
  'Email',
  'Business',
  'Plan',
  'Original kobo',
  'Discount kobo',
  'Discount code',
  'Amount kobo',
  'Country',
  'City',
];

const DOWNLOAD_COLUMNS = [
  'Seen at',
  'Reference',
  'Email',
  'Business',
  'Source',
  'Installer version',
  'Country',
  'City',
  'User agent',
];

function saveOrder_(order) {
  var reference = String(order.reference || '').trim();
  if (!reference) return json_({ ok: false, error: 'missing reference' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = analyticsSheet_('orders', ORDER_COLUMNS);
    var row = [
      reference,
      String(order.createdAt || ''),
      String(order.paidAt || ''),
      String(order.email || ''),
      String(order.business || ''),
      String(order.plan || ''),
      number_(order.originalAmountKobo),
      number_(order.discountKobo),
      String(order.discountCode || '').toUpperCase(),
      number_(order.amountKobo),
      String(order.country || ''),
      String(order.city || ''),
    ];
    var index = findRow_(sheet, 1, reference);
    if (index) sheet.getRange(index, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return json_({ ok: true, duplicate: !!index });
  } finally {
    lock.releaseLock();
  }
}

function saveDownload_(download) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = analyticsSheet_('downloads', DOWNLOAD_COLUMNS);
    sheet.appendRow([
      new Date(),
      String(download.reference || ''),
      String(download.email || ''),
      String(download.business || ''),
      String(download.source || 'public'),
      String(download.installerVersion || ''),
      String(download.country || ''),
      String(download.city || ''),
      String(download.userAgent || '').slice(0, 300),
    ]);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function analyticsSheet_(name, header) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ANALYTICS_SHEET_ID');
  var spreadsheet;
  if (id) {
    spreadsheet = SpreadsheetApp.openById(id);
  } else {
    spreadsheet = SpreadsheetApp.create('AnalytIQ analytics');
    props.setProperty('ANALYTICS_SHEET_ID', spreadsheet.getId());
    var existing = spreadsheet.getSheets();
    for (var s = 0; s < existing.length; s += 1) {
      spreadsheet.deleteSheet(existing[s]);
    }
  }
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(header);
  }
  return sheet;
}

function findRow_(sheet, column, value) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var values = sheet.getRange(2, column, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === value) return i + 2;
  }
  return 0;
}

function number_(value) {
  var amount = Number(value);
  return isFinite(amount) && amount >= 0 ? amount : 0;
}

function rowsOf_(name) {
  var id = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SHEET_ID');
  if (!id) return [];
  var spreadsheet = SpreadsheetApp.openById(id);
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i += 1) {
    var row = {};
    for (var j = 0; j < headers.length; j += 1) {
      row[headers[j]] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function countBy_(rows, pick) {
  var counts = {};
  rows.forEach(function (row) {
    var key = String(pick(row) || '').trim();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts)
    .map(function (key) {
      return { name: key, count: counts[key] };
    })
    .sort(function (a, b) {
      return b.count - a.count;
    })
    .slice(0, 20);
}

function stats_() {
  var orders = rowsOf_('orders');
  var downloads = rowsOf_('downloads');
  var leads = leadRows_();
  var activations = activationRows_();
  var revenueKobo = 0;
  var discountKobo = 0;
  var discounts = {};

  orders.forEach(function (order) {
    var amount = number_(order['Amount kobo']);
    var discount = number_(order['Discount kobo']);
    var code = String(order['Discount code'] || '').trim().toUpperCase();
    revenueKobo += amount;
    discountKobo += discount;
    if (!code) return;
    if (!discounts[code]) {
      discounts[code] = { code: code, redemptions: 0, discountKobo: 0, revenueKobo: 0 };
    }
    discounts[code].redemptions += 1;
    discounts[code].discountKobo += discount;
    discounts[code].revenueKobo += amount;
  });

  var recent = downloads.slice(-20).reverse().map(function (row) {
    return {
      at: row['Seen at'] instanceof Date ? row['Seen at'].toISOString() : String(row['Seen at'] || ''),
      reference: String(row['Reference'] || ''),
      email: String(row['Email'] || ''),
      business: String(row['Business'] || ''),
      source: String(row['Source'] || ''),
      installerVersion: String(row['Installer version'] || ''),
      country: String(row['Country'] || ''),
      city: String(row['City'] || ''),
    };
  });

  return json_({
    ok: true,
    generatedAt: new Date().toISOString(),
    totals: {
      downloads: downloads.length,
      paidOrders: orders.length,
      revenueKobo: revenueKobo,
      discountKobo: discountKobo,
      redemptions: Object.keys(discounts).reduce(function (sum, code) {
        return sum + discounts[code].redemptions;
      }, 0),
      leads: leads.length,
      activeLicences: activations.filter(function (row) {
        return !!String(row['Install id'] || '').trim();
      }).length,
    },
    discounts: Object.keys(discounts)
      .sort()
      .map(function (code) {
        return discounts[code];
      }),
    downloadsByCountry: countBy_(downloads, function (row) {
      return row['Country'];
    }),
    downloadsByCity: countBy_(downloads, function (row) {
      return row['City'];
    }),
    leadsByLocation: countBy_(leads, function (row) {
      return row['Locations'];
    }),
    recentDownloads: recent,
  });
}

function leadRows_() {
  try {
    return rowsFromSheetByProperty_('LEADS_SHEET_ID');
  } catch (error) {
    return [];
  }
}

function activationRows_() {
  try {
    return rowsFromSheetByProperty_('ACTIVATIONS_SHEET_ID');
  } catch (error) {
    return [];
  }
}

function rowsFromSheetByProperty_(property) {
  var id = PropertiesService.getScriptProperties().getProperty(property);
  if (!id) return [];
  var sheet = SpreadsheetApp.openById(id).getSheets()[0];
  if (sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values[0].map(String);
  var rows = [];
  for (var i = 1; i < values.length; i += 1) {
    var row = {};
    for (var j = 0; j < headers.length; j += 1) {
      row[headers[j]] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
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

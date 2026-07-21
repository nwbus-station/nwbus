/**
 * ============================================================
 *  NWBUS — نسخ احتياطي تلقائي يومي: Google Sheets + إيميل
 * ============================================================
 *  يسحب بيانات NWBUS من Supabase يومياً:
 *   1. تبويب لكل محطة (بيانات الترحيل بعناوين عربية — للعرض).
 *   2. تبويب خام لكل جدول أساسي (نسخة كاملة قابلة للاسترجاع).
 *   3. يصدّر الملف كـ Excel ويرسله للإيميل تلقائياً.
 *   4. عند أي فشل — يرسل إيميل تنبيه بالخطأ.
 *
 *  يعمل على سيرفرات Google تلقائياً 24/7.
 *  خطوات التركيب في README.
 * ============================================================
 */

// ─── الإعدادات ─── عدّل القيم التالية فقط ───
const SUPABASE_URL  = 'https://kjngtbwcnyilemuiwjbp.supabase.co';
const SERVICE_KEY   = 'ضع_هنا_مفتاح_service_role_من_لوحة_Supabase';
const BACKUP_EMAIL  = 'abo_rakan449@hotmail.com'; // يستقبل النسخة يومياً (يمكن أكثر من إيميل بفاصلة)
// ───────────────────────────────────────────────

// الجداول التي تُنسخ نسخاً خاماً كاملاً (تبويب لكل جدول)
const RAW_TABLES = [
  'stations',
  'users',
  'trip_schedule',
  'trip_schedule_stops',
  'trip_records',
  'trip_transit_records',
  'trip_cancellations',
  'lost_found_items',
  'sales_records',
];

// أعمدة الترحيل وعناوينها العربية في تبويبات المحطات
const COLUMNS = [
  ['record_date',        'التاريخ'],
  ['bus_number',         'رقم الباص'],
  ['passenger_count',    'عدد الركاب'],
  ['missed_count',       'عدد المتخلفين'],
  ['actual_departure',   'وقت المغادرة الفعلي'],
  ['operational_status', 'الحالة التشغيلية'],
  ['is_extra_trip',      'رحلة إضافية'],
  ['is_cancelled',       'ملغاة'],
  ['notes',              'ملاحظات'],
  ['created_by_name',    'أُدخل بواسطة'],
  ['trip_schedule_id',   'رقم الرحلة'],
];

/**
 * الدالة الرئيسية — تُشغَّل يومياً.
 */
function backupTransportation() {
  try {
    runBackup();
  } catch (err) {
    notifyFailure(err);
    throw err;
  }
}

function runBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const stations = sbGet('stations', 'id,name_ar,name_en');
  const records  = sbGet('trip_records', '*', 'order=record_date.desc');

  // اسم المحطة حسب المعرّف
  const stationName = {};
  stations.forEach(function (s) {
    stationName[s.id] = (s.name_ar || s.name_en || ('محطة ' + s.id)).toString();
  });

  // تجميع السجلات حسب المحطة
  const byStation = {};
  records.forEach(function (r) {
    const sid = r.station_id;
    if (!byStation[sid]) byStation[sid] = [];
    byStation[sid].push(r);
  });

  // تبويب لكل محطة
  stations.forEach(function (s) {
    const rows = byStation[s.id] || [];
    writeStationSheet(ss, sheetName(stationName[s.id]), rows);
  });

  // نسخة خام كاملة لكل جدول
  let totalRaw = 0;
  RAW_TABLES.forEach(function (table) {
    const rows = (table === 'trip_records') ? records : sbGet(table, '*');
    writeRawSheet(ss, table, rows);
    totalRaw += rows.length;
  });

  // تحديث وقت آخر نسخة
  updateStatusSheet(ss, stations.length, records.length, totalRaw);

  // إرسال النسخة للإيميل
  SpreadsheetApp.flush();
  sendBackupEmail(ss, stations.length, records.length, totalRaw);
}

/**
 * كتابة بيانات محطة في تبويبها (مسح وإعادة كتابة كاملة = مرآة دقيقة).
 */
function writeStationSheet(ss, name, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();

  const header = COLUMNS.map(function (c) { return c[1]; });
  const data = rows.map(function (r) {
    return COLUMNS.map(function (c) {
      const v = r[c[0]];
      if (v === null || v === undefined) return '';
      if (v === true)  return 'نعم';
      if (v === false) return 'لا';
      return v;
    });
  });

  const out = [header].concat(data);
  sheet.getRange(1, 1, out.length, header.length).setValues(out);

  // تنسيق الرأس
  const hr = sheet.getRange(1, 1, 1, header.length);
  hr.setBackground('#16315e').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
}

/**
 * تبويب خام لجدول كامل — أسماء الأعمدة كما في قاعدة البيانات (للاسترجاع).
 */
function writeRawSheet(ss, table, rows) {
  const name = '📦 ' + table;
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();

  // اتحاد أسماء الأعمدة عبر كل الصفوف (تحسّباً لاختلاف المفاتيح)
  const keySet = {};
  const keys = [];
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) {
      if (!keySet[k]) { keySet[k] = true; keys.push(k); }
    });
  });

  if (keys.length === 0) {
    sheet.getRange(1, 1).setValue('(الجدول فارغ — ' + table + ')');
    return;
  }

  const data = rows.map(function (r) {
    return keys.map(function (k) {
      const v = r[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  });

  const out = [keys].concat(data);
  sheet.getRange(1, 1, out.length, keys.length).setValues(out);

  const hr = sheet.getRange(1, 1, 1, keys.length);
  hr.setBackground('#333f48').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

/**
 * تبويب "الحالة" — يبيّن وقت آخر نسخة احتياطية.
 */
function updateStatusSheet(ss, stationCount, recordCount, totalRaw) {
  let sheet = ss.getSheetByName('ℹ️ الحالة');
  if (!sheet) sheet = ss.insertSheet('ℹ️ الحالة', 0);
  sheet.clear();
  const tz = Session.getScriptTimeZone();
  const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  sheet.getRange(1, 1, 5, 2).setValues([
    ['آخر نسخة احتياطية', now],
    ['عدد المحطات', stationCount],
    ['إجمالي سجلات الترحيل', recordCount],
    ['إجمالي الصفوف المنسوخة (كل الجداول)', totalRaw],
    ['المصدر', 'NWBUS — Supabase'],
  ]);
  sheet.getRange(1, 1, 5, 1).setFontWeight('bold');
  sheet.autoResizeColumns(1, 2);
}

/**
 * تصدير الملف كـ Excel وإرساله بالإيميل.
 */
function sendBackupEmail(ss, stationCount, recordCount, totalRaw) {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');

  const exportUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  const blob = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  }).getBlob().setName('NWBUS_Backup_' + today + '.xlsx');

  MailApp.sendEmail({
    to: BACKUP_EMAIL,
    subject: '📦 NWBUS — النسخة الاحتياطية اليومية ' + today,
    htmlBody:
      '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px">' +
      '<h3>✅ اكتملت النسخة الاحتياطية اليومية</h3>' +
      '<table cellpadding="6" style="border-collapse:collapse">' +
      '<tr><td><b>الوقت</b></td><td>' + now + '</td></tr>' +
      '<tr><td><b>عدد المحطات</b></td><td>' + stationCount + '</td></tr>' +
      '<tr><td><b>سجلات الترحيل</b></td><td>' + recordCount + '</td></tr>' +
      '<tr><td><b>إجمالي الصفوف (كل الجداول)</b></td><td>' + totalRaw + '</td></tr>' +
      '</table>' +
      '<p>النسخة الكاملة مرفقة كملف Excel، وهي متاحة أيضاً في ملف Google Sheets.</p>' +
      '<p style="color:#888">NWBUS — نسخ احتياطي تلقائي</p>' +
      '</div>',
    attachments: [blob],
  });
}

/**
 * إيميل تنبيه عند فشل النسخة الاحتياطية.
 */
function notifyFailure(err) {
  try {
    MailApp.sendEmail({
      to: BACKUP_EMAIL,
      subject: '⚠️ NWBUS — فشلت النسخة الاحتياطية اليومية',
      htmlBody:
        '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px">' +
        '<h3>⚠️ فشلت النسخة الاحتياطية</h3>' +
        '<p>الخطأ:</p>' +
        '<pre dir="ltr" style="background:#f4f4f4;padding:10px">' + String(err && err.message || err) + '</pre>' +
        '<p>افتح Apps Script → Executions لمعرفة التفاصيل.</p>' +
        '</div>',
    });
  } catch (e) {
    // حتى لو فشل الإرسال نفسه — نكمل لرمي الخطأ الأصلي
  }
}

/**
 * قراءة من Supabase REST API — مع ترقيم صفحات (Supabase يحدّ كل طلب بـ 1000 صف).
 */
function sbGet(table, select, extra) {
  const pageSize = 1000;
  let all = [];
  let offset = 0;

  while (true) {
    let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + encodeURIComponent(select);
    if (extra) url += '&' + extra;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        'Range-Unit': 'items',
        Range: offset + '-' + (offset + pageSize - 1),
      },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code !== 200 && code !== 206) {
      throw new Error('فشل جلب ' + table + ' — رمز ' + code + ': ' + res.getContentText());
    }
    const page = JSON.parse(res.getContentText());
    all = all.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

/**
 * اسم تبويب صالح (Google يمنع بعض الرموز ويحدّ الطول 100 حرف).
 */
function sheetName(name) {
  return name.replace(/[\\/?*\[\]:]/g, ' ').substring(0, 90).trim() || 'محطة';
}

/**
 * إعداد المُشغّل اليومي — شغّلها مرة واحدة فقط.
 */
function createDailyTrigger() {
  // حذف أي مُشغّل سابق لتفادي التكرار
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupTransportation') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupTransportation')
    .timeBased()
    .everyDays(1)
    .atHour(23)      // 11 مساءً
    .create();
}

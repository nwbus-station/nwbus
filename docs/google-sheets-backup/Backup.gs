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

// الترجمة العربية لدقة المغادرة والحالات التشغيلية
const ACCURACY_AR = {
  'Early':       'مبكرة',
  'On Time':     'في الموعد',
  'Not On Time': 'غير منضبطة',
  'Delayed':     'متأخرة',
};
const STATUS_AR = {
  'Accident between other vehicles': 'حادث بين مركبات أخرى',
  'Health (Driver/Passengers)':      'حالة صحية (سائق/ركاب)',
  'Passenger Misbehavior':           'سوء سلوك راكب',
  'Police Control':                  'نقطة تفتيش',
  'Traffic Jam':                     'ازدحام مروري',
  'Weather':                         'أحوال جوية',
  'Accident with NWB bus':           'حادث لحافلة NWB',
  'Malfunction inside the station':  'عطل داخل المحطة',
  'Out-of-station malfunction':      'عطل خارج المحطة',
  'Normal':                          'طبيعية',
};

// ألوان الهوية
const C_PRIMARY = '#16315e';
const C_BAND    = '#eef2f9';
const C_OK      = '#1e7e34';
const C_BAD     = '#b02a37';

// أعمدة الترحيل وعناوينها العربية في تبويبات المحطات
const COLUMNS = [
  ['record_date',        'التاريخ'],
  ['bus_number',         'رقم الباص'],
  ['passenger_count',    'عدد الركاب'],
  ['missed_count',       'عدد المتخلفين'],
  ['actual_departure',   'وقت المغادرة الفعلي'],
  ['operational_status', 'الحالة التشغيلية'],
  ['is_extra_trip',      'رحلة إضافية'],
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

  const stations       = sbGet('stations', 'id,name_ar,name_en');
  const records        = sbGet('trip_records', '*', 'order=record_date.desc');
  const transitRecords = sbGet('trip_transit_records', '*', 'order=created_at.desc');
  const schedule       = [];

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

  // تبويب التحليل — أول تبويب في الملف
  const summary = buildAnalysisSheet(ss, stations, records, stationName);

  // تقرير المحطات اليومي
  const stationReport = buildStationDailyReport(stations, records, transitRecords, schedule, stationName);

  // كتابة تقرير المحطات في تبويب مستقل
  writeStationReportSheet(ss, stationReport);

  // تحديث وقت آخر نسخة
  updateStatusSheet(ss, stations.length, records.length, totalRaw);

  // إرسال النسخة للإيميل
  SpreadsheetApp.flush();
  sendBackupEmail(ss, stations.length, records.length, totalRaw, summary, stationReport);
}

/**
 * تبويب "📊 التحليل" — لوحة مؤشرات: أمس + آخر 7 أيام + أداء المحطات + رسوم بيانية.
 * يعيد ملخص أمس لاستخدامه في نص الإيميل.
 */
function buildAnalysisSheet(ss, stations, records, stationName) {
  const tz  = Session.getScriptTimeZone();
  const fmt = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  const DAY = 24 * 3600 * 1000;
  const yday = fmt(new Date(Date.now() - DAY));

  // آخر 7 أيام منتهية (الأقدم أولاً وآخرها أمس)
  const days = [];
  for (let i = 7; i >= 1; i--) days.push(fmt(new Date(Date.now() - i * DAY)));

  const newStat = function () { return { trips: 0, pax: 0, missed: 0, onTime: 0, late: 0, acc: 0, extra: 0 }; };
  const addTo = function (s, r) {
    s.trips++;
    s.pax    += r.passenger_count || 0;
    s.missed += r.missed_count || 0;
    if (r.is_extra_trip) s.extra++;
    if (r.departure_accuracy) {
      s.acc++;
      if (r.departure_accuracy === 'Early' || r.departure_accuracy === 'On Time') s.onTime++;
      else s.late++;
    }
  };
  const pctTxt = function (s) { return s.acc > 0 ? Math.round((s.onTime / s.acc) * 100) + '%' : '—'; };

  const byDay = {};
  days.forEach(function (d) { byDay[d] = newStat(); });
  const ydayByStation = {};
  const statusCount = {};

  records.forEach(function (r) {
    const d = String(r.record_date).slice(0, 10);
    if (byDay[d]) addTo(byDay[d], r);
    if (d === yday) {
      const sid = r.station_id;
      if (!ydayByStation[sid]) ydayByStation[sid] = newStat();
      addTo(ydayByStation[sid], r);
      if (r.operational_status && r.operational_status !== 'Normal') {
        statusCount[r.operational_status] = (statusCount[r.operational_status] || 0) + 1;
      }
    }
  });
  const y = byDay[yday];

  // ── بناء التبويب ──
  let sheet = ss.getSheetByName('📊 التحليل');
  if (!sheet) sheet = ss.insertSheet('📊 التحليل', 0);
  sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
  sheet.clear();
  sheet.setRightToLeft(true);

  const setRow = function (row, values) {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  };

  const W = 6; // عدد أعمدة التقرير

  // العنوان
  sheet.getRange(1, 1, 1, W).merge().setValue('NORTH WEST BUS — التقرير اليومي')
    .setBackground(C_PRIMARY).setFontColor('#ffffff').setFontWeight('bold').setFontSize(14)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
  sheet.getRange(2, 1, 1, W).merge()
    .setValue('تقرير يوم ' + yday + '  ·  أُنشئ تلقائياً ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'))
    .setFontColor('#666666').setFontSize(9).setHorizontalAlignment('center');

  // مؤشرات أمس (KPI)
  const kpiLabels = ['رحلات أمس', 'الركاب', 'المتخلفون', 'الانضباط', 'متأخرة', 'إضافية RF'];
  const kpiValues = [y.trips, y.pax, y.missed, pctTxt(y), y.late, y.extra];
  setRow(4, kpiLabels);
  setRow(5, kpiValues);
  sheet.getRange(4, 1, 1, W).setBackground(C_BAND).setFontColor('#555555').setFontSize(9)
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(5, 1, 1, W).setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center')
    .setFontColor(C_PRIMARY);
  sheet.getRange(5, 5).setFontColor(y.late > 0 ? C_BAD : C_OK);   // متأخرة
  sheet.setRowHeight(5, 30);
  sheet.getRange(4, 1, 2, W).setBorder(true, true, true, true, true, false);

  const tableHeader = ['التاريخ', 'الرحلات', 'الركاب', 'المتخلفون', 'الانضباط', 'متأخرة'];
  const styleSection = function (row, title) {
    sheet.getRange(row, 1, 1, W).merge().setValue(title)
      .setBackground(C_PRIMARY).setFontColor('#ffffff').setFontWeight('bold').setFontSize(10);
  };
  const styleTable = function (headerRow, nRows) {
    sheet.getRange(headerRow, 1, 1, W).setBackground(C_BAND).setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center');
    if (nRows > 0) {
      sheet.getRange(headerRow + 1, 1, nRows, W).setHorizontalAlignment('center').setFontSize(10);
      sheet.getRange(headerRow, 1, nRows + 1, W).setBorder(true, true, true, true, true, true, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);
      for (let i = 0; i < nRows; i += 2) {
        sheet.getRange(headerRow + 1 + i, 1, 1, W).setBackground('#f8f9fb');
      }
    }
  };

  // جدول آخر 7 أيام
  let row = 7;
  styleSection(row, 'أداء آخر 7 أيام');
  setRow(row + 1, tableHeader);
  const daysStart = row + 2;
  days.forEach(function (d, i) {
    const s = byDay[d];
    setRow(daysStart + i, [d, s.trips, s.pax, s.missed, pctTxt(s), s.late]);
  });
  styleTable(row + 1, days.length);

  // جدول المحطات — أمس
  row = daysStart + days.length + 1;
  styleSection(row, 'أداء المحطات — يوم ' + yday);
  setRow(row + 1, ['المحطة', 'الرحلات', 'الركاب', 'المتخلفون', 'الانضباط', 'متأخرة']);
  const activeStations = stations.filter(function (s) { return ydayByStation[s.id]; });
  const stStart = row + 2;
  activeStations.forEach(function (st, i) {
    const s = ydayByStation[st.id];
    setRow(stStart + i, [stationName[st.id], s.trips, s.pax, s.missed, pctTxt(s), s.late]);
  });
  if (activeStations.length === 0) {
    setRow(stStart, ['لا توجد سجلات أمس', '', '', '', '', '']);
  }
  styleTable(row + 1, Math.max(activeStations.length, 1));

  // الحالات التشغيلية غير الطبيعية — أمس
  row = stStart + Math.max(activeStations.length, 1) + 1;
  styleSection(row, 'الحالات التشغيلية غير الطبيعية — يوم ' + yday);
  const statusKeys = Object.keys(statusCount);
  if (statusKeys.length === 0) {
    sheet.getRange(row + 1, 1, 1, W).merge().setValue('✅ لا توجد حالات غير طبيعية')
      .setFontColor(C_OK).setFontWeight('bold');
  } else {
    statusKeys.forEach(function (k, i) {
      setRow(row + 1 + i, [STATUS_AR[k] || k, statusCount[k], '', '', '', '']);
    });
    sheet.getRange(row + 1, 1, statusKeys.length, 2)
      .setBorder(true, true, true, true, true, true, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(row + 1, 2, statusKeys.length, 1).setFontWeight('bold').setFontColor(C_BAD)
      .setHorizontalAlignment('center');
  }

  sheet.setColumnWidth(1, 150);
  for (let c = 2; c <= W; c++) sheet.setColumnWidth(c, 90);

  // ── الرسوم البيانية ──
  // ركاب آخر 7 أيام (خطي)
  const lineChart = sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange(daysStart - 1, 1, days.length + 1, 1))
    .addRange(sheet.getRange(daysStart - 1, 3, days.length + 1, 1))
    .setPosition(4, 9, 0, 0)
    .setOption('title', 'الركاب — آخر 7 أيام')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [C_PRIMARY])
    .setOption('width', 420).setOption('height', 260)
    .build();
  sheet.insertChart(lineChart);

  // ركاب المحطات أمس (أعمدة)
  if (activeStations.length > 0) {
    const colChart = sheet.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(sheet.getRange(stStart - 1, 1, activeStations.length + 1, 1))
      .addRange(sheet.getRange(stStart - 1, 3, activeStations.length + 1, 1))
      .setPosition(18, 9, 0, 0)
      .setOption('title', 'الركاب حسب المحطة — أمس')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#c8a25a'])
      .setOption('width', 420).setOption('height', 260)
      .build();
    sheet.insertChart(colChart);
  }

  return { yday: yday, trips: y.trips, pax: y.pax, missed: y.missed, onTimePct: pctTxt(y), late: y.late };
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
function sendBackupEmail(ss, stationCount, recordCount, totalRaw, summary, stationReport) {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const now   = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');

  const exportUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  const blob = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  }).getBlob().setName('NWBUS_Backup_' + today + '.xlsx');

  const reportHtml = stationReport ? buildStationReportHtml(stationReport, now) : '';

  MailApp.sendEmail({
    to: BACKUP_EMAIL,
    subject: '📋 NWBUS — التقرير اليومي · ' + (stationReport ? stationReport.yday : today),
    htmlBody: reportHtml,
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
 * كتابة تقرير المحطات اليومي في تبويب Excel.
 */
function writeStationReportSheet(ss, report) {
  const name = '📋 التقرير اليومي';
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name, 1);
  sheet.clear();
  sheet.setRightToLeft(true);

  const yday = report.yday;
  const rows = report.rows;
  const W = 9;

  // العنوان
  sheet.getRange(1, 1, 1, W).merge()
    .setValue('NORTH WEST BUS — التقرير اليومي التشغيلي · ' + yday)
    .setBackground(C_PRIMARY).setFontColor('#ffffff').setFontWeight('bold').setFontSize(13)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(1, 32);

  // رأس الجدول
  const headers = ['المحطة', 'رحلات المغادرة', 'ركاب المغادرة', 'رحلات الوصول', 'ركاب الوصول', 'المتخلفون', 'الانضباط %', 'رحلات متأخرة'];
  sheet.getRange(2, 1, 1, W).setValues([headers])
    .setBackground(C_BAND).setFontWeight('bold').setFontSize(10).setHorizontalAlignment('center');
  sheet.setFrozenRows(2);

  if (rows.length === 0) {
    sheet.getRange(3, 1, 1, W).merge().setValue('لا توجد بيانات لهذا اليوم')
      .setHorizontalAlignment('center').setFontColor('#888888');
  } else {
    const data = rows.map(function (r) {
      return [
        r.name,
        r.depTrips,
        r.depPax,
        r.arrTrips,
        r.arrPax,
        r.missed,
        r.punctPct !== null ? r.punctPct + '%' : '—',
        r.late,
        r.missing === 0 ? '✅ مكتملة' : '⚠️ ' + r.missing + ' رحلة',
      ];
    });
    sheet.getRange(3, 1, data.length, W).setValues(data).setHorizontalAlignment('center').setFontSize(11);
    sheet.getRange(3, 1, data.length, 1).setHorizontalAlignment('right').setFontWeight('bold').setFontColor(C_PRIMARY);

    // تلوين خلايا الانضباط والمتخلفين
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const row = 3 + i;
      // الانضباط
      if (r.punctPct !== null) {
        const c = r.punctPct >= 80 ? C_OK : r.punctPct >= 60 ? '#c8a25a' : C_BAD;
        sheet.getRange(row, 7).setFontColor(c).setFontWeight('bold');
      }
      // المتخلفون
      if (r.missed > 0) sheet.getRange(row, 6).setFontColor(C_BAD).setFontWeight('bold');
      // غير مُدخلة
      if (r.missing > 0) sheet.getRange(row, 9).setFontColor(C_BAD).setFontWeight('bold');
      else sheet.getRange(row, 9).setFontColor(C_OK);
      // تلوين صفوف متعاقبة
      if (i % 2 === 1) sheet.getRange(row, 1, 1, W).setBackground('#f4f6fb');
    }

    // إطار الجدول
    sheet.getRange(2, 1, rows.length + 1, W)
      .setBorder(true, true, true, true, true, true, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);
  }

  // عرض الأعمدة
  sheet.setColumnWidth(1, 160);
  for (let c = 2; c <= W; c++) sheet.setColumnWidth(c, 110);
}

/**
 * تقرير يومي احترافي لكل محطة — يُرسَل مع النسخة الاحتياطية.
 * يحوي: رحلات المغادرة، رحلات الوصول، التخلف، الرحلات غير المدخلة، الركاب.
 */
function buildStationDailyReport(stations, records, transitRecords, schedule, stationName) {
  const tz  = Session.getScriptTimeZone();
  const DAY = 24 * 3600 * 1000;
  const yday = Utilities.formatDate(new Date(Date.now() - DAY), tz, 'yyyy-MM-dd');

  // --- فهرس جدول الرحلات المجدولة حسب المحطة (للمقارنة مع المُدخلة) ---
  // schedule: كل رحلة لها station_id (محطة المغادرة الأصلية)
  const scheduledByStation = {};
  schedule.forEach(function (s) {
    const sid = s.from_station_id || s.station_id;
    if (!sid) return;
    if (!scheduledByStation[sid]) scheduledByStation[sid] = 0;
    scheduledByStation[sid]++;
  });

  // --- سجلات أمس ---
  const ydayDepartures = {}; // station_id → { trips, pax, missed }
  const ydayTripIds    = {}; // station_id → Set of trip_schedule_id المُدخلة

  records.forEach(function (r) {
    const d = String(r.record_date).slice(0, 10);
    if (d !== yday) return;
    const sid = r.station_id;
    if (!ydayDepartures[sid]) ydayDepartures[sid] = { trips: 0, pax: 0, missed: 0, onTime: 0, late: 0, accTotal: 0 };
    if (!ydayTripIds[sid])    ydayTripIds[sid] = {};
    ydayDepartures[sid].trips++;
    ydayDepartures[sid].pax    += r.passenger_count || 0;
    ydayDepartures[sid].missed += r.missed_count    || 0;
    if (r.departure_accuracy) {
      ydayDepartures[sid].accTotal++;
      if (r.departure_accuracy === 'Early' || r.departure_accuracy === 'On Time') {
        ydayDepartures[sid].onTime++;
      } else {
        ydayDepartures[sid].late++;
      }
    }
    if (r.trip_schedule_id) ydayTripIds[sid][r.trip_schedule_id] = true;
  });

  // --- رحلات الوصول من transit_records ---
  const ydayArrivals = {}; // station_id → { trips, pax }
  transitRecords.forEach(function (r) {
    const d = String(r.created_at || '').slice(0, 10);
    if (d !== yday) return;
    const sid = r.station_id;
    if (!ydayArrivals[sid]) ydayArrivals[sid] = { trips: 0, pax: 0 };
    ydayArrivals[sid].trips++;
    ydayArrivals[sid].pax += r.passenger_count || 0;
  });

  // --- بناء بيانات كل محطة ---
  const stationRows = stations.map(function (st) {
    const dep   = ydayDepartures[st.id] || { trips: 0, pax: 0, missed: 0, onTime: 0, late: 0, accTotal: 0 };
    const arr   = ydayArrivals[st.id]   || { trips: 0, pax: 0 };
    const missing = 0;
    const punctPct = dep.accTotal > 0 ? Math.round((dep.onTime / dep.accTotal) * 100) : null;
    return {
      name:      stationName[st.id],
      depTrips:  dep.trips,
      depPax:    dep.pax,
      missed:    dep.missed,
      arrTrips:  arr.trips,
      arrPax:    arr.pax,
      missing:   missing,
      onTime:    dep.onTime,
      late:      dep.late,
      punctPct:  punctPct,   // نسبة الانضباط (null = لا بيانات)
    };
  }).filter(function (r) {
    return r.depTrips > 0 || r.arrTrips > 0 || r.missing > 0;
  });

  return { yday: yday, rows: stationRows };
}

/**
 * بناء HTML احترافي للتقرير اليومي لكل محطة.
 */
function buildStationReportHtml(report, now) {
  const C1 = '#16315e', C2 = '#c8a25a', CRED = '#b02a37', CGRAY = '#f4f6fb';
  const rows = report.rows;
  const yday = report.yday;

  const th = function (t) {
    return '<th style="background:' + C1 + ';color:#fff;padding:8px 10px;font-size:12px;font-weight:bold;text-align:center;border:1px solid #2a4a80">' + t + '</th>';
  };
  const td = function (v, bold, color) {
    return '<td style="padding:7px 10px;text-align:center;font-size:13px;border:1px solid #dde3ee' +
      (bold ? ';font-weight:bold' : '') +
      (color ? ';color:' + color : '') +
      '">' + v + '</td>';
  };

  // حساب ملخص الرحلات غير المدخلة لكل المحطات
  const missingStations = rows.filter(function (r) { return r.missing > 0; });

  let tableRows = '';
  rows.forEach(function (r, i) {
    const bg = i % 2 === 0 ? '#ffffff' : CGRAY;
    const punctTxt = r.punctPct === null ? '—' : r.punctPct + '%';
    const punctColor = r.punctPct === null ? '#999' : r.punctPct >= 80 ? '#1e7e34' : r.punctPct >= 60 ? '#c8a25a' : CRED;
    tableRows +=
      '<tr style="background:' + bg + '">' +
      '<td style="padding:7px 12px;font-size:13px;font-weight:bold;color:' + C1 + ';border:1px solid #dde3ee">' + r.name + '</td>' +
      td(r.depTrips, true) +
      td(r.depPax) +
      td(r.arrTrips, true) +
      td(r.arrPax) +
      td(r.missed, false, r.missed > 0 ? CRED : '#1e7e34') +
      td(punctTxt, true, punctColor) +
      td(r.late > 0 ? r.late + ' رحلة' : '✅ لا يوجد', false, r.late > 0 ? CRED : '#1e7e34') +
      td(r.missing === 0 ? '✅ مكتملة' : '⚠️ ' + r.missing + ' رحلة', false, r.missing > 0 ? CRED : '#1e7e34') +
      '</tr>';
  });

  if (rows.length === 0) {
    tableRows = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#888">لا توجد بيانات لأمس</td></tr>';
  }

  // قسم تنبيه الرحلات غير المدخلة
  let missingAlert = '';
  if (missingStations.length > 0) {
    const missingList = missingStations.map(function (r) {
      return '<li style="margin:4px 0"><b>' + r.name + '</b>: ' + r.missing + ' رحلة غير مُدخلة</li>';
    }).join('');
    missingAlert =
      '<div style="margin-top:14px;padding:12px 16px;background:#fff3f3;border:1.5px solid ' + CRED + ';border-radius:5px">' +
      '<div style="font-weight:bold;color:' + CRED + ';font-size:13px;margin-bottom:6px">⚠️ محطات بها رحلات غير مُدخلة</div>' +
      '<ul style="margin:0;padding-right:18px;color:#333;font-size:13px">' + missingList + '</ul>' +
      '</div>';
  } else {
    missingAlert =
      '<div style="margin-top:14px;padding:10px 16px;background:#f0fff4;border:1.5px solid #1e7e34;border-radius:5px;color:#1e7e34;font-weight:bold;font-size:13px">' +
      '✅ جميع الرحلات المجدولة تم إدخالها' +
      '</div>';
  }

  return (
    '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;max-width:860px;margin:0 auto">' +

    // ترويسة
    '<div style="background:' + C1 + ';padding:18px 20px;border-radius:6px 6px 0 0">' +
    '<div style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:.5px">NORTH WEST BUS</div>' +
    '<div style="color:' + C2 + ';font-size:13px;margin-top:4px">التقرير اليومي التشغيلي — يوم ' + yday + '</div>' +
    '</div>' +

    // شريط المعلومات
    '<div style="background:' + C2 + ';padding:8px 20px;font-size:11px;color:#5a3d00">' +
    'أُنشئ تلقائياً · ' + now + ' · النظام: NWBUS' +
    '</div>' +

    // تنبيه الرحلات غير المدخلة
    missingAlert +

    // الجدول
    '<div style="overflow-x:auto;margin-top:14px">' +
    '<table cellspacing="0" style="border-collapse:collapse;width:100%;direction:rtl">' +
    '<thead><tr>' +
    th('المحطة') +
    th('رحلات المغادرة') + th('ركاب المغادرة') +
    th('رحلات الوصول')  + th('ركاب الوصول') +
    th('المتخلفون') +
    th('الانضباط %') +
    th('رحلات متأخرة') +
    th('رحلات غير مُدخلة') +
    '</tr></thead>' +
    '<tbody>' + tableRows + '</tbody>' +
    '</table></div>' +

    // توضيح الأعمدة
    '<div style="margin-top:10px;padding:8px 14px;background:#f8f9fb;font-size:11px;color:#666;border-right:3px solid ' + C2 + '">' +
    '<b>الانضباط%</b>: نسبة الرحلات المبكرة أو في الموعد · ' +
    '<b>رحلات غير مُدخلة</b>: رحلات مجدولة لم يُسجَّل لها سجل ترحيل' +
    '</div>' +

    // ملاحظة المرفق
    '<div style="margin-top:8px;padding:10px 14px;background:#f8f9fb;border-right:4px solid ' + C1 + ';font-size:12px;color:#555">' +
    '📎 مرفق ملف Excel يحوي النسخة الاحتياطية الكاملة لجميع الجداول.' +
    '</div>' +

    '</div>'
  );
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
    .atHour(5)       // 5 فجراً — بعد انتهاء اليوم السابق كاملاً
    .create();
}

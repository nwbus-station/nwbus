/**
 * ============================================================
 *  NWBUS — النسخة الاحتياطية + التقرير التحليلي (Google Sheets → Excel → إيميل)
 * ============================================================
 *  الإعدادات (الإيميلات، التفعيل، ساعة الإرسال، زر "إرسال الآن") تُدار من التطبيق:
 *  الإعدادات ← النسخ الاحتياطي والتقرير اليومي. السكربت يتفقدها كل 5 دقائق.
 *
 *  الملف الناتج (Excel):
 *   ① لوحة القيادة     مؤشرات 30 يوماً مع المقارنة + ملاحظات تحليلية تلقائية + 4 رسوم + ترتيب المحطات
 *   ② الاتجاهات        جدول يومي لآخر 30 يوماً مع تلوين
 *   ③ التقرير اليومي   أداء كل محطة أمس (مغادرة/وصول/تخلف/انضباط)
 *   ④ ورقة لكل محطة    مؤشرات المحطة + سجل الترحيل الكامل بتنسيق احترافي
 *   ⑤ نسخة خام 📦      كل الجداول للاسترجاع
 *
 *  خطوات التركيب في README.
 * ============================================================
 */

// ─── الإعدادات الثابتة ─── عدّل القيم التالية فقط ───
const SUPABASE_URL   = 'https://kjngtbwcnyilemuiwjbp.supabase.co';
const SERVICE_KEY    = 'ضع_هنا_مفتاح_service_role_من_لوحة_Supabase';
const FALLBACK_EMAIL = 'abo_rakan449@hotmail.com';   // يُستخدم فقط لو ما فيه إيميلات محفوظة بالتطبيق
const LOGO_URL       = 'https://nwbus-frontend.vercel.app/nw-logo.png';
const TZ             = 'Asia/Riyadh';
// ───────────────────────────────────────────────

// الجداول التي تُنسخ نسخاً خاماً كاملاً (تبويب لكل جدول)
const RAW_TABLES = [
  'stations', 'users', 'trip_schedule', 'trip_schedule_stops', 'trip_records',
  'trip_transit_records', 'trip_cancellations', 'lost_found_items', 'sales_records',
];

const ACCURACY_AR = { 'Early': 'مبكرة', 'On Time': 'في الموعد', 'Not On Time': 'غير منضبطة', 'Delayed': 'متأخرة' };
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
const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ألوان الهوية
const C = {
  navy: '#264673', orange: '#EE712D', ink: '#1d1d1c', grey: '#6b7280', light: '#f1f5f9', zebra: '#f8fafc',
  line: '#d9dee7', ok: '#15803d', warn: '#b45309', bad: '#b91c1c', white: '#ffffff', soft: '#e8eef7',
};
const FONT = 'Tahoma';
const N0 = '#,##0';

// أعمدة سجل الترحيل في ورقة المحطة
const COLUMNS = [
  ['record_date', 'التاريخ'], ['bus_number', 'رقم الباص'], ['passenger_count', 'عدد الركاب'], ['missed_count', 'المتخلفون'],
  ['actual_departure', 'المغادرة الفعلية'], ['departure_accuracy', 'دقة المغادرة'], ['operational_status', 'الحالة التشغيلية'],
  ['is_extra_trip', 'رحلة إضافية'], ['notes', 'ملاحظات'], ['created_by_name', 'أُدخل بواسطة'],
];

/* ════════════════════════════════════════════════════════════
 *  نقطة التشغيل: كل 5 دقائق — تفحص إعدادات التطبيق وتقرر هل ترسل
 * ════════════════════════════════════════════════════════════ */
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;            // تشغيل سابق ما زال شغّالاً
  try {
    let cfg = null;
    try {
      cfg = sbGet('backup_settings', '*', 'id=eq.1')[0] || null;
    } catch (e) {
      // الجدول غير مثبّت بعد → نتجاهل بهدوء؛ أي خطأ آخر (مثل مفتاح غلط) نظهره في Executions
      if (/PGRST205|42P01|does not exist|Could not find/i.test(String(e && e.message))) return;
      throw e;
    }
    if (!cfg) { console.error('backup_settings: لا يوجد صف id=1'); return; }
    if (String(SERVICE_KEY).indexOf('ضع_هنا') === 0) throw new Error('لم يتم وضع SERVICE_KEY في أعلى السكربت');

    const now = new Date();
    const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
    const hourNow = Number(Utilities.formatDate(now, TZ, 'H'));
    const lastRun = cfg.last_run_at ? new Date(cfg.last_run_at) : null;
    const requested = !!cfg.send_now_at && (!lastRun || new Date(cfg.send_now_at) > lastRun);
    const due = !!cfg.enabled && hourNow >= Number(cfg.send_hour) && String(cfg.last_scheduled_on || '') !== today;
    if (!requested && !due) return;

    runAndReport(cfg, due ? today : null);
  } finally {
    lock.releaseLock();
  }
}

function runAndReport(cfg, scheduledDay) {
  const t0 = Date.now();
  const recipients = (cfg.emails && cfg.emails.length) ? cfg.emails : [FALLBACK_EMAIL];
  const patch = {};
  try {
    const res = runBackup(recipients);
    patch.last_ok = true;
    patch.last_message = 'تم الإرسال بنجاح — ' + res.stations + ' محطة · ' + res.records + ' سجل ترحيل · ' + res.sheets + ' ورقة';
    patch.last_rows = res.rows;
  } catch (err) {
    notifyFailure(err, recipients);
    patch.last_ok = false;
    patch.last_message = String((err && err.message) || err).substring(0, 500);
  }
  patch.last_run_at = new Date().toISOString();
  patch.last_recipients = recipients;
  patch.last_seconds = Math.round((Date.now() - t0) / 1000);
  patch.updated_at = new Date().toISOString();
  if (scheduledDay) patch.last_scheduled_on = scheduledDay;
  sbPatch('backup_settings', 'id=eq.1', patch);
}

/** تشغيل يدوي (للتجربة من محرر Apps Script) — يرسل للإيميلات المحفوظة بالتطبيق */
function backupTransportation() {
  let cfg = null;
  try { cfg = sbGet('backup_settings', '*', 'id=eq.1')[0] || null; } catch (e) { /* قد يكون الجدول غير مثبّت */ }
  runAndReport(cfg || { emails: [] }, null);
}

/* ════════════════════════════════════════════════════════════
 *  بناء الملف
 * ════════════════════════════════════════════════════════════ */
function runBackup(recipients) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ss.setSpreadsheetTimeZone(TZ); } catch (e) { /* غير حرج */ }

  let stations;
  try { stations = sbGet('stations', 'id,name_ar,name_en,is_agent'); }
  catch (e) { stations = sbGet('stations', 'id,name_ar,name_en'); }   // العمود is_agent غير مثبّت بعد
  const records        = sbGet('trip_records', '*', 'order=record_date.desc');

  const stationName = {};
  stations.forEach(function (s) { stationName[s.id] = (s.name_ar || s.name_en || ('محطة ' + s.id)).toString() + (s.is_agent ? ' (وكيل)' : ''); });

  // المغادرة فقط: محطة المنشأ = مغادرة، محطة الوجهة = وصول (نستبعده)، محطة العبور حسب is_arrival
  const schedule = {};
  sbGet('trip_schedule', 'id,from_station_id,to_station_id').forEach(function (t) { schedule[t.id] = t; });
  const departures = records.filter(function (r) { return isDeparture(r, schedule); });

  const A = analyze(departures, stations, stationName);
  const logo = fetchLogo();

  // تجميع سجلات المغادرة حسب المحطة
  const byStation = {};
  departures.forEach(function (r) { (byStation[r.station_id] = byStation[r.station_id] || []).push(r); });

  const order = [];
  const sheetsWritten = [];

  // بيانات الرسوم (ورقة مساعدة) ثم لوحة القيادة
  buildChartData(ss, A);
  buildDashboard(ss, A, logo);
  order.push('📊 لوحة القيادة');
  buildTrendSheet(ss, A, logo);
  order.push('📈 الاتجاهات');
  const stationReport = buildStationDailyReport(stations, departures, stationName);
  writeStationReportSheet(ss, stationReport, logo);
  order.push('📋 التقرير اليومي');

  // ورقة لكل محطة
  stations.forEach(function (s) {
    const nm = sheetName(stationName[s.id]);
    writeStationSheet(ss, nm, stationName[s.id], byStation[s.id] || [], A.byStation30[s.id] || newStat(), A.byStationPrev[s.id] || newStat(), logo);
    order.push(nm);
  });

  // نسخة خام
  let totalRaw = 0;
  RAW_TABLES.forEach(function (table) {
    const rows = (table === 'trip_records') ? records : sbGet(table, '*');
    writeRawSheet(ss, table, rows);
    totalRaw += rows.length;
    order.push('📦 ' + table);
  });

  order.push('📉 بيانات الرسوم');
  updateStatusSheet(ss, stations.length, records.length, totalRaw, recipients);
  order.push('ℹ️ الحالة');

  // ترتيب الأوراق
  order.forEach(function (name, i) {
    const sh = ss.getSheetByName(name);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); sheetsWritten.push(name); }
  });
  ss.setActiveSheet(ss.getSheetByName('📊 لوحة القيادة'));

  SpreadsheetApp.flush();
  sendBackupEmail(ss, recipients, A, stationReport, stations.length, departures.length);

  return { stations: stations.length, records: records.length, rows: totalRaw, sheets: sheetsWritten.length };
}

/** سجل مغادرة؟ (نفس منطق صفحة التقارير بالتطبيق) */
function isDeparture(r, schedule) {
  const t = schedule[r.trip_schedule_id];
  if (t && t.from_station_id && t.from_station_id === r.station_id) return true;    // محطة المنشأ
  if (t && t.to_station_id && t.to_station_id === r.station_id) return false;       // محطة الوجهة = وصول
  if (r.is_arrival !== null && r.is_arrival !== undefined) return r.is_arrival === false;
  return !(r.actual_arrival && !r.actual_departure);
}

/* ════════════════════════════════════════════════════════════
 *  التحليل
 * ════════════════════════════════════════════════════════════ */
function newStat() { return { trips: 0, pax: 0, missed: 0, extra: 0, acc: 0, onTime: 0, late: 0 }; }
function addStat(s, r) {
  s.trips++;
  s.pax    += Number(r.passenger_count) || 0;
  s.missed += Number(r.missed_count) || 0;
  if (r.is_extra_trip) s.extra++;
  if (r.departure_accuracy) {
    s.acc++;
    if (r.departure_accuracy === 'Early' || r.departure_accuracy === 'On Time') s.onTime++; else s.late++;
  }
}
function punct(s) { return s.acc > 0 ? s.onTime / s.acc : null; }
function missedRate(s) { return (s.pax + s.missed) > 0 ? s.missed / (s.pax + s.missed) : 0; }
function avgPax(s) { return s.trips > 0 ? s.pax / s.trips : 0; }
function pctChange(cur, prev) { return prev > 0 ? (cur - prev) / prev : null; }

function ymd(daysAgo) { return Utilities.formatDate(new Date(Date.now() - daysAgo * 24 * 3600 * 1000), TZ, 'yyyy-MM-dd'); }

function analyze(records, stations, stationName) {
  const yday = ymd(1);
  const s30 = ymd(30), e30 = ymd(1);            // آخر 30 يوماً (تنتهي أمس)
  const sP = ymd(60), eP = ymd(31);             // الـ30 يوماً السابقة لها

  const days = [];                               // الأقدم أولاً
  for (let i = 30; i >= 1; i--) days.push(ymd(i));

  const A = {
    yday: yday, from30: s30, to30: e30, days: days,
    total30: newStat(), totalPrev: newStat(), y: newStat(),
    byStation30: {}, byStationPrev: {}, byDay: {}, status30: {}, acc30: { 'Early': 0, 'On Time': 0, 'Not On Time': 0, 'Delayed': 0 },
    dow: [0, 1, 2, 3, 4, 5, 6].map(function () { return { pax: 0, trips: 0, days: {} }; }),
    ydayStations: {}, stations: stations, stationName: stationName,
  };
  days.forEach(function (d) { A.byDay[d] = newStat(); });

  records.forEach(function (r) {
    const d = String(r.record_date || '').slice(0, 10);
    if (!d) return;
    const sid = r.station_id;
    if (d >= s30 && d <= e30) {
      addStat(A.total30, r);
      addStat(A.byDay[d], r);
      addStat(A.byStation30[sid] = A.byStation30[sid] || newStat(), r);
      if (r.operational_status && r.operational_status !== 'Normal') A.status30[r.operational_status] = (A.status30[r.operational_status] || 0) + 1;
      if (r.departure_accuracy && A.acc30[r.departure_accuracy] !== undefined) A.acc30[r.departure_accuracy]++;
      const dw = new Date(d + 'T00:00:00Z').getUTCDay();
      A.dow[dw].pax += Number(r.passenger_count) || 0; A.dow[dw].trips++; A.dow[dw].days[d] = true;
    } else if (d >= sP && d <= eP) {
      addStat(A.totalPrev, r);
      addStat(A.byStationPrev[sid] = A.byStationPrev[sid] || newStat(), r);
    }
    if (d === yday) { addStat(A.y, r); addStat(A.ydayStations[sid] = A.ydayStations[sid] || newStat(), r); }
  });

  // صفوف ترتيب المحطات
  A.rows = stations.map(function (st) {
    const s = A.byStation30[st.id] || newStat(), p = A.byStationPrev[st.id] || newStat();
    return { id: st.id, name: stationName[st.id], agent: !!st.is_agent, s: s, p: p, change: pctChange(s.pax, p.pax) };
  }).sort(function (a, b) { return b.s.pax - a.s.pax; });   // كل المحطات (حتى بدون سجلات) — الوكلاء تظهر بعلامة (وكيل)

  A.insights = buildInsights(A);
  return A;
}

function fmtN(n) { return Utilities.formatString('%s', Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }

function buildInsights(A) {
  const out = [];
  const t = A.total30, p = A.totalPrev;
  if (t.trips === 0) return ['لا توجد سجلات ترحيل ضمن آخر 30 يوماً.'];

  let line = 'خلال آخر 30 يوماً نُفّذت ' + fmtN(t.trips) + ' رحلة نقلت ' + fmtN(t.pax) + ' راكباً بمتوسط ' + avgPax(t).toFixed(1) + ' راكب للرحلة.';
  const ch = pctChange(t.pax, p.pax);
  if (ch != null) line += ' عدد الركاب ' + (ch >= 0 ? 'أعلى' : 'أقل') + ' بنسبة ' + Math.abs(Math.round(ch * 100)) + '% من الـ30 يوماً السابقة.';
  out.push(line);

  const pu = punct(t);
  if (pu != null) {
    let l = 'الانضباط العام في المغادرة ' + fmtPct(pu) + ' (' + (pu >= 0.85 ? 'مستوى ممتاز' : pu >= 0.7 ? 'مستوى جيد ويحتاج متابعة' : 'مستوى منخفض يحتاج تدخلاً') + ').';
    const pp = punct(p);
    if (pp != null) l += ' ' + (pu >= pp ? 'تحسّن' : 'تراجع') + ' بمقدار ' + Math.abs(Math.round((pu - pp) * 100)) + ' نقطة عن الفترة السابقة.';
    out.push(l);
  }

  const withAcc = A.rows.filter(function (r) { return r.s.acc >= 5; });
  if (withAcc.length >= 2) {
    const sorted = withAcc.slice().sort(function (a, b) { return punct(b.s) - punct(a.s); });
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if (punct(best.s) - punct(worst.s) >= 0.01) out.push('أفضل انضباط: ' + best.name + ' (' + fmtPct(punct(best.s)) + ')، وأقله: ' + worst.name + ' (' + fmtPct(punct(worst.s)) + ') ويستحق المراجعة.');
  }

  if (A.rows.length) {
    const top = A.rows[0];
    out.push('أكثر المحطات حركة: ' + top.name + ' بـ ' + fmtN(top.s.pax) + ' راكب (' + Math.round(top.s.pax / t.pax * 100) + '% من الإجمالي).');
  }

  const dowActive = A.dow.map(function (d, i) { return { i: i, avg: Object.keys(d.days).length ? d.pax / Object.keys(d.days).length : 0 }; }).filter(function (d) { return d.avg > 0; });
  if (dowActive.length >= 3) {
    dowActive.sort(function (a, b) { return b.avg - a.avg; });
    out.push('أعلى أيام الأسبوع ازدحاماً: ' + WEEKDAYS_AR[dowActive[0].i] + ' بمتوسط ' + fmtN(dowActive[0].avg) + ' راكب يومياً، وأهدؤها ' + WEEKDAYS_AR[dowActive[dowActive.length - 1].i] + ' (' + fmtN(dowActive[dowActive.length - 1].avg) + ').');
  }

  const missedRows = A.rows.filter(function (r) { return r.s.pax + r.s.missed >= 50; }).sort(function (a, b) { return missedRate(b.s) - missedRate(a.s); });
  if (t.missed > 0 && missedRows.length) {
    out.push('المتخلفون: ' + fmtN(t.missed) + ' راكباً (' + (missedRate(t) * 100).toFixed(1) + '%)، وأعلى نسبة في ' + missedRows[0].name + ' (' + (missedRate(missedRows[0].s) * 100).toFixed(1) + '%).');
  }

  const grow = A.rows.filter(function (r) { return r.p.pax >= 100 && r.change != null; }).sort(function (a, b) { return b.change - a.change; });
  if (grow.length >= 2) {
    const g = grow[0], d = grow[grow.length - 1];
    if (g.change > 0.05) out.push('أكبر نمو في الركاب: ' + g.name + ' (+' + Math.round(g.change * 100) + '%).');
    if (d.change < -0.05) out.push('أكبر تراجع في الركاب: ' + d.name + ' (' + Math.round(d.change * 100) + '%) — يُنصح بمعرفة السبب.');
  }

  const agentRows = A.rows.filter(function (r) { return r.agent; });
  if (agentRows.length) {
    const agPax = agentRows.reduce(function (sum, r) { return sum + r.s.pax; }, 0);
    const agIdle = agentRows.filter(function (r) { return r.s.trips === 0; }).map(function (r) { return r.name; });
    out.push('محطات الوكلاء: ' + agentRows.length + ' محطة نقلت ' + fmtN(agPax) + ' راكباً (' + (t.pax ? Math.round(agPax / t.pax * 100) : 0) + '% من الإجمالي)' +
      (agIdle.length ? '، وبلا أي سجل ضمن الفترة: ' + agIdle.slice(0, 6).join('، ') : '') + '.');
  }

  const stKeys = Object.keys(A.status30).sort(function (a, b) { return A.status30[b] - A.status30[a]; });
  if (stKeys.length) out.push('أكثر حالة تشغيلية غير طبيعية: ' + (STATUS_AR[stKeys[0]] || stKeys[0]) + ' (' + A.status30[stKeys[0]] + ' مرة)، وإجمالي الحالات غير الطبيعية ' + stKeys.reduce(function (s, k) { return s + A.status30[k]; }, 0) + '.');

  const silent = A.rows.filter(function (r) { return r.s.trips > 0 && !A.ydayStations[r.id]; }).map(function (r) { return r.name; });
  if (silent.length) out.push('محطات بلا أي تسجيل أمس رغم نشاطها المعتاد: ' + silent.slice(0, 8).join('، ') + (silent.length > 8 ? '…' : '') + '.');

  return out;
}

/* ════════════════════════════════════════════════════════════
 *  أدوات التنسيق
 * ════════════════════════════════════════════════════════════ */
function prepSheet(ss, name, index) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name, index === undefined ? ss.getNumSheets() : index);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  try { sh.getImages().forEach(function (im) { im.remove(); }); } catch (e) { /* لا صور */ }
  try { sh.getDataRange().breakApart(); } catch (e) { /* لا دمج */ }
  try { const f = sh.getFilter(); if (f) f.remove(); } catch (e) { /* لا فلتر */ }
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.setRightToLeft(true);
  sh.setHiddenGridlines(true);
  return sh;
}

function merged(sh, row, c1, c2, value, o) {
  o = o || {};
  const r = sh.getRange(row, c1, o.rows || 1, c2 - c1 + 1);
  if (c2 > c1 || (o.rows || 1) > 1) r.merge();
  r.setValue(value).setFontFamily(FONT)
    .setFontSize(o.size || 10).setFontWeight(o.bold ? 'bold' : 'normal').setFontColor(o.color || C.ink)
    .setHorizontalAlignment(o.align || 'right').setVerticalAlignment(o.v || 'middle').setWrap(o.wrap !== false);
  if (o.bg) r.setBackground(o.bg);
  if (o.fmt) r.setNumberFormat(o.fmt);
  return r;
}

function sectionBar(sh, row, W, title) {
  sh.setRowHeight(row, 28);
  merged(sh, row, 1, W, title, { bg: C.navy, color: C.white, bold: true, size: 12 }).setHorizontalAlignment('right');
  sh.getRange(row, 1).setHorizontalAlignment('right');
}

/** ترويسة بيضاء: الشعار + العنوان + الوصف + خط برتقالي */
function headerBand(sh, W, title, subtitle, logo) {
  sh.setRowHeight(1, 30); sh.setRowHeight(2, 28); sh.setRowHeight(3, 24);
  const c0 = Math.min(3, W - 1);
  merged(sh, 1, c0, W, title, { size: 20, bold: true, color: C.navy, rows: 2 });
  merged(sh, 3, c0, W, subtitle, { size: 10, color: C.grey });
  sh.getRange(3, 1, 1, W).setBorder(null, null, true, null, null, null, C.orange, SpreadsheetApp.BorderStyle.SOLID_THICK);
  if (logo) {
    try { const im = sh.insertImage(logo, 1, 1); im.setWidth(150).setHeight(77); im.setAnchorCell(sh.getRange(1, 1)); } catch (e) { /* بدون شعار */ }
  }
}

/** بطاقة مؤشر: تسمية + قيمة كبيرة + سطر مقارنة */
function kpiCard(sh, row, col, span, label, value, sub, subColor, accent, fmt) {
  const c2 = col + span - 1;
  sh.setRowHeight(row, 22); sh.setRowHeight(row + 1, 40); sh.setRowHeight(row + 2, 22);
  merged(sh, row, col, c2, label, { size: 9, bold: true, color: C.grey, align: 'center', bg: C.light });
  merged(sh, row + 1, col, c2, value, { size: 22, bold: true, color: accent || C.navy, align: 'center', bg: C.light, fmt: fmt });
  merged(sh, row + 2, col, c2, sub || '', { size: 9, bold: true, color: subColor || C.grey, align: 'center', bg: C.light });
  const box = sh.getRange(row, col, 3, span);
  box.setBorder(true, true, true, true, null, null, C.line, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(row, col, 1, span).setBorder(true, null, null, null, null, null, accent || C.navy, SpreadsheetApp.BorderStyle.SOLID_THICK);
}

function deltaText(cur, prev, goodWhenUp, unit) {
  const ch = pctChange(cur, prev);
  if (ch == null) return { t: 'لا توجد فترة سابقة للمقارنة', c: C.grey };
  const up = ch >= 0;
  const good = goodWhenUp ? up : !up;
  return { t: (up ? '▲ ' : '▼ ') + Math.abs(Math.round(ch * 100)) + '% عن الـ30 يوماً السابقة', c: Math.abs(ch) < 0.005 ? C.grey : (good ? C.ok : C.bad) };
}
function deltaPoints(cur, prev) {
  if (cur == null || prev == null) return { t: 'لا توجد فترة سابقة للمقارنة', c: C.grey };
  const d = Math.round((cur - prev) * 100);
  return { t: (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' نقطة عن الـ30 يوماً السابقة', c: d === 0 ? C.grey : (d > 0 ? C.ok : C.bad) };
}

function tableHeader(sh, row, spec) {
  // spec: [[c1, c2, 'عنوان'], ...]
  sh.setRowHeight(row, 30);
  spec.forEach(function (s) { merged(sh, row, s[0], s[1], s[2], { size: 10, bold: true, color: C.white, bg: C.navy, align: 'center' }); });
  const last = spec[spec.length - 1][1];
  sh.getRange(row, 1, 1, last).setBorder(null, null, true, null, null, null, C.orange, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function tableRowCells(sh, row, spec, values, zebra) {
  // spec: [[c1, c2, fmt, align, bold, color]]
  spec.forEach(function (s, i) {
    const r = merged(sh, row, s[0], s[1], values[i], { size: 10, align: s[3] || 'center', bold: !!s[4], color: s[5] || C.ink, fmt: s[2] });
    if (zebra) r.setBackground(C.zebra);
  });
  const last = spec[spec.length - 1][1];
  sh.getRange(row, 1, 1, last).setBorder(true, true, true, true, true, null, C.line, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(row, 24);
}

function addRule(sh, rule) { const rules = sh.getConditionalFormatRules(); rules.push(rule); sh.setConditionalFormatRules(rules); }
function gradient(sh, range, lo, mid, hi, loV, midV, hiV) {
  let b = SpreadsheetApp.newConditionalFormatRule().setRanges([range]);
  b = loV === undefined ? b.setGradientMinpoint(lo) : b.setGradientMinpointWithValue(lo, SpreadsheetApp.InterpolationType.NUMBER, String(loV));
  if (mid) b = b.setGradientMidpointWithValue(mid, SpreadsheetApp.InterpolationType.NUMBER, String(midV));
  b = hiV === undefined ? b.setGradientMaxpoint(hi) : b.setGradientMaxpointWithValue(hi, SpreadsheetApp.InterpolationType.NUMBER, String(hiV));
  addRule(sh, b.build());
}
function signColors(sh, range) {
  addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor(C.ok).setBold(true).setRanges([range]).build());
  addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor(C.bad).setBold(true).setRanges([range]).build());
}

/* ════════════════════════════════════════════════════════════
 *  بيانات الرسوم (ورقة مساعدة)
 * ════════════════════════════════════════════════════════════ */
function buildChartData(ss, A) {
  const sh = prepSheet(ss, '📉 بيانات الرسوم');
  sh.setHiddenGridlines(false);
  // A:C — يومي
  const daily = [['التاريخ', 'الركاب', 'الرحلات']].concat(A.days.map(function (d) { return [d.slice(5), A.byDay[d].pax, A.byDay[d].trips]; }));
  sh.getRange(1, 1, daily.length, 3).setValues(daily);
  // E:F — أعلى 10 محطات
  const top = A.rows.filter(function (r) { return r.s.pax > 0; }).slice(0, 10);
  const st = [['المحطة', 'الركاب']].concat(top.map(function (r) { return [r.name, r.s.pax]; }));
  sh.getRange(1, 5, st.length, 2).setValues(st);
  // H:I — دقة المغادرة
  const acc = [['الدقة', 'الرحلات']].concat(Object.keys(A.acc30).map(function (k) { return [ACCURACY_AR[k], A.acc30[k]]; }));
  sh.getRange(1, 8, acc.length, 2).setValues(acc);
  // K:L — أيام الأسبوع (متوسط الركاب اليومي)
  const dw = [['اليوم', 'متوسط الركاب']].concat(WEEKDAYS_AR.map(function (n, i) {
    const days = Object.keys(A.dow[i].days).length;
    return [n, days ? Math.round(A.dow[i].pax / days) : 0];
  }));
  sh.getRange(1, 11, dw.length, 2).setValues(dw);
  sh.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground(C.light);
  sh.getRange(1, 1, 1, 12).setFontFamily(FONT);
  return { daily: daily.length, stations: st.length, acc: acc.length, dow: dw.length };
}

/* ════════════════════════════════════════════════════════════
 *  لوحة القيادة
 * ════════════════════════════════════════════════════════════ */
function buildDashboard(ss, A, logo) {
  const sh = prepSheet(ss, '📊 لوحة القيادة', 0);
  const W = 12;
  for (let c = 1; c <= W; c++) sh.setColumnWidth(c, 100);
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

  headerBand(sh, W, 'التقرير التحليلي التشغيلي',
    'الفترة المحلَّلة: ' + A.from30 + ' إلى ' + A.to30 + '  (آخر 30 يوماً)  ·  أُنشئ ' + now + ' (توقيت الرياض)', logo);

  let row = 5;
  sectionBar(sh, row++, W, 'المؤشرات الرئيسية — آخر 30 يوماً مقارنة بالـ30 يوماً السابقة');
  row++;
  const t = A.total30, p = A.totalPrev;
  const pu = punct(t), pp = punct(p);
  const dPax = deltaText(t.pax, p.pax, true), dTrips = deltaText(t.trips, p.trips, true), dPu = deltaPoints(pu, pp);
  const dMiss = deltaText(t.missed, p.missed, false), dAvg = deltaText(avgPax(t), avgPax(p), true), dExtra = deltaText(t.extra, p.extra, true);
  kpiCard(sh, row, 1,  2, 'إجمالي الركاب',        t.pax,    dPax.t,   dPax.c,   C.navy,   N0);
  kpiCard(sh, row, 3,  2, 'عدد الرحلات',          t.trips,  dTrips.t, dTrips.c, C.navy,   N0);
  kpiCard(sh, row, 5,  2, 'الانضباط في المغادرة', pu == null ? '—' : pu, dPu.t, dPu.c, pu == null ? C.grey : (pu >= 0.85 ? C.ok : pu >= 0.7 ? C.warn : C.bad), '0%');
  kpiCard(sh, row, 7,  2, 'المتخلفون',            t.missed, dMiss.t,  dMiss.c,  t.missed > 0 ? C.bad : C.ok, N0);
  kpiCard(sh, row, 9,  2, 'متوسط الركاب للرحلة',  avgPax(t), dAvg.t,  dAvg.c,   C.navy,   '0.0');
  kpiCard(sh, row, 11, 2, 'رحلات إضافية',         t.extra,  dExtra.t, dExtra.c, C.orange, N0);
  row += 4;

  // أمس
  sectionBar(sh, row++, W, 'أمس — ' + A.yday);
  const y = A.y, yp = punct(y);
  const yspec = [[1, 2, N0], [3, 4, N0], [5, 6, N0], [7, 8, '0%'], [9, 10, N0], [11, 12, N0]];
  tableHeader(sh, row++, [[1, 2, 'الرحلات'], [3, 4, 'الركاب'], [5, 6, 'المتخلفون'], [7, 8, 'الانضباط'], [9, 10, 'رحلات متأخرة'], [11, 12, 'إضافية']]);
  tableRowCells(sh, row, yspec.map(function (s) { return [s[0], s[1], s[2], 'center', true, C.navy]; }), [y.trips, y.pax, y.missed, yp == null ? '—' : yp, y.late, y.extra], false);
  row += 2;

  // الملاحظات التحليلية
  sectionBar(sh, row++, W, 'أبرز الملاحظات التحليلية');
  A.insights.forEach(function (txt, i) {
    sh.setRowHeight(row, Math.max(26, Math.ceil(txt.length / 120) * 20 + 8));
    merged(sh, row, 1, W, '●  ' + txt, { size: 11, color: C.ink, bg: i % 2 ? C.white : C.zebra });
    row++;
  });
  row++;

  // الرسوم البيانية — منطقة محجوزة
  sectionBar(sh, row++, W, 'الرسوم البيانية');
  const chartsTop = row;
  const data = ss.getSheetByName('📉 بيانات الرسوم');
  const nDaily = A.days.length + 1, nSt = Math.min(A.rows.length, 10) + 1;

  const mk = function (type, ranges, title, colors, r, c, extra) {
    let b = sh.newChart().setChartType(type);
    ranges.forEach(function (rg) { b = b.addRange(rg); });
    b = b.setPosition(r, c, 4, 4)
      .setOption('title', title)
      .setOption('titleTextStyle', { color: C.navy, fontSize: 13, bold: true })
      .setOption('colors', colors)
      .setOption('backgroundColor', '#ffffff')
      .setOption('width', 590).setOption('height', 285)
      .setOption('legend', { position: 'bottom' });
    if (extra) Object.keys(extra).forEach(function (k) { b = b.setOption(k, extra[k]); });
    sh.insertChart(b.build());
  };

  mk(Charts.ChartType.LINE, [data.getRange(1, 1, nDaily, 2)], 'الركاب يومياً — آخر 30 يوماً', [C.navy], chartsTop, 7,
     { legend: { position: 'none' }, curveType: 'function', pointSize: 4, lineWidth: 3 });
  if (A.rows.length) {
    mk(Charts.ChartType.COLUMN, [data.getRange(1, 5, nSt, 2)], 'الركاب حسب المحطة (الأعلى 10)', [C.orange], chartsTop, 1, { legend: { position: 'none' } });
  }
  const accTotal = Object.keys(A.acc30).reduce(function (s, k) { return s + A.acc30[k]; }, 0);
  if (accTotal > 0) {
    mk(Charts.ChartType.PIE, [data.getRange(1, 8, 5, 2)], 'توزيع دقة المغادرة', ['#15803d', '#84cc16', '#f59e0b', '#b91c1c'], chartsTop + 15, 7,
       { pieHole: 0.5, pieSliceText: 'percentage' });
  }
  mk(Charts.ChartType.COLUMN, [data.getRange(1, 11, 8, 2)], 'متوسط الركاب حسب أيام الأسبوع', [C.navy], chartsTop + 15, 1, { legend: { position: 'none' } });
  row = chartsTop + 31;

  // ترتيب المحطات
  sectionBar(sh, row++, W, 'ترتيب المحطات — آخر 30 يوماً');
  tableHeader(sh, row++, [[1, 1, '#'], [2, 3, 'المحطة'], [4, 4, 'الرحلات'], [5, 5, 'الركاب'], [6, 6, 'ركاب/رحلة'], [7, 7, 'المتخلفون'],
    [8, 8, 'نسبة التخلف'], [9, 9, 'الانضباط'], [10, 10, 'متأخرة'], [11, 11, 'إضافية'], [12, 12, 'تغيّر الركاب']]);
  const spec = [[1, 1, '0'], [2, 3, '@', 'right', true, C.navy], [4, 4, N0], [5, 5, N0, 'center', true], [6, 6, '0.0'], [7, 7, N0], [8, 8, '0.0%'], [9, 9, '0%'], [10, 10, N0], [11, 11, N0], [12, 12, '+0%;-0%;0%']];
  const stFirst = row;
  A.rows.forEach(function (r, i) {
    tableRowCells(sh, row++, spec, [i + 1, r.name, r.s.trips, r.s.pax, avgPax(r.s), r.s.missed, missedRate(r.s), punct(r.s) == null ? '—' : punct(r.s), r.s.late, r.s.extra, r.change == null ? '—' : r.change], i % 2 === 1);
  });
  if (A.rows.length) {
    const stLast = row - 1;
    // الإجمالي
    tableRowCells(sh, row, spec.map(function (s) { return [s[0], s[1], s[2], s[3], true, C.navy]; }),
      ['', 'الإجمالي', t.trips, t.pax, avgPax(t), t.missed, missedRate(t), pu == null ? '—' : pu, t.late, t.extra, pctChange(t.pax, p.pax) == null ? '—' : pctChange(t.pax, p.pax)], false);
    sh.getRange(row, 1, 1, W).setBackground(C.soft).setBorder(true, null, null, null, null, null, C.navy, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    row += 2;
    gradient(sh, sh.getRange(stFirst, 9, A.rows.length, 1), '#f4c7c3', '#fff2cc', '#b7e1cd', 0.5, 0.8, 1);
    gradient(sh, sh.getRange(stFirst, 5, A.rows.length, 1), '#ffffff', null, '#a9c4eb');
    gradient(sh, sh.getRange(stFirst, 8, A.rows.length, 1), '#ffffff', null, '#f4a6a1');
    signColors(sh, sh.getRange(stFirst, 12, A.rows.length, 1));
  } else {
    merged(sh, row, 1, W, 'لا توجد سجلات ترحيل ضمن الفترة', { align: 'center', color: C.grey });
    row += 2;
  }

  // الحالات التشغيلية + دقة المغادرة
  sectionBar(sh, row++, W, 'الحالات التشغيلية ودقة المغادرة — آخر 30 يوماً');
  tableHeader(sh, row, [[1, 4, 'الحالة التشغيلية غير الطبيعية'], [5, 5, 'العدد'], [6, 6, 'النسبة']]);
  merged(sh, row, 8, 10, 'دقة المغادرة', { size: 10, bold: true, color: C.white, bg: C.navy, align: 'center' });
  merged(sh, row, 11, 11, 'الرحلات', { size: 10, bold: true, color: C.white, bg: C.navy, align: 'center' });
  merged(sh, row, 12, 12, 'النسبة', { size: 10, bold: true, color: C.white, bg: C.navy, align: 'center' });
  row++;
  const stKeys = Object.keys(A.status30).sort(function (a, b) { return A.status30[b] - A.status30[a]; });
  const stTotal = stKeys.reduce(function (s, k) { return s + A.status30[k]; }, 0);
  const accKeys = ['Early', 'On Time', 'Not On Time', 'Delayed'];
  const accTot = accKeys.reduce(function (s, k) { return s + A.acc30[k]; }, 0);
  const accColor = { 'Early': C.ok, 'On Time': C.ok, 'Not On Time': C.warn, 'Delayed': C.bad };
  const nRows = Math.max(stKeys.length, accKeys.length, 1);
  for (let i = 0; i < nRows; i++) {
    sh.setRowHeight(row + i, 24);
    if (stKeys[i]) {
      merged(sh, row + i, 1, 4, STATUS_AR[stKeys[i]] || stKeys[i], { size: 10, color: C.ink, bg: i % 2 ? C.zebra : C.white });
      merged(sh, row + i, 5, 5, A.status30[stKeys[i]], { size: 10, bold: true, color: C.bad, align: 'center', fmt: N0, bg: i % 2 ? C.zebra : C.white });
      merged(sh, row + i, 6, 6, stTotal ? A.status30[stKeys[i]] / stTotal : 0, { size: 10, align: 'center', fmt: '0%', bg: i % 2 ? C.zebra : C.white });
    } else if (i === 0) {
      merged(sh, row, 1, 6, '✅ لا توجد حالات تشغيلية غير طبيعية', { size: 10, bold: true, color: C.ok, align: 'center' });
    }
    if (accKeys[i]) {
      merged(sh, row + i, 8, 10, ACCURACY_AR[accKeys[i]], { size: 10, bold: true, color: accColor[accKeys[i]], bg: i % 2 ? C.zebra : C.white });
      merged(sh, row + i, 11, 11, A.acc30[accKeys[i]], { size: 10, align: 'center', fmt: N0, bg: i % 2 ? C.zebra : C.white });
      merged(sh, row + i, 12, 12, accTot ? A.acc30[accKeys[i]] / accTot : 0, { size: 10, align: 'center', fmt: '0%', bg: i % 2 ? C.zebra : C.white });
    }
  }
  sh.getRange(row - 1, 1, nRows + 1, 6).setBorder(true, true, true, true, null, true, C.line, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(row - 1, 8, nRows + 1, 5).setBorder(true, true, true, true, null, true, C.line, SpreadsheetApp.BorderStyle.SOLID);
  row += nRows + 1;

  merged(sh, row, 1, W, 'الانضباط % = الرحلات المبكرة أو في الموعد ÷ الرحلات المقيَّمة · نسبة التخلف = المتخلفون ÷ (الركاب + المتخلفون) · تغيّر الركاب مقارنةً بالـ30 يوماً السابقة · الألوان في الجدول تدرّج من الأضعف للأقوى.',
    { size: 9, color: C.grey });
  sh.setFrozenRows(0);
}

/* ════════════════════════════════════════════════════════════
 *  ورقة الاتجاهات (يومياً)
 * ════════════════════════════════════════════════════════════ */
function buildTrendSheet(ss, A, logo) {
  const sh = prepSheet(ss, '📈 الاتجاهات');
  const W = 8;
  const widths = [120, 100, 100, 110, 110, 110, 110, 110];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  headerBand(sh, W, 'الاتجاه اليومي — آخر 30 يوماً', 'الفترة: ' + A.from30 + ' إلى ' + A.to30 + ' · كل الشبكة', logo);
  let row = 5;
  tableHeader(sh, row++, [[1, 1, 'التاريخ'], [2, 2, 'اليوم'], [3, 3, 'الرحلات'], [4, 4, 'الركاب'], [5, 5, 'المتخلفون'], [6, 6, 'ركاب/رحلة'], [7, 7, 'الانضباط'], [8, 8, 'متأخرة']]);
  const spec = [[1, 1, '@', 'center', true, C.navy], [2, 2, '@'], [3, 3, N0], [4, 4, N0, 'center', true], [5, 5, N0], [6, 6, '0.0'], [7, 7, '0%'], [8, 8, N0]];
  const first = row;
  A.days.forEach(function (d, i) {
    const s = A.byDay[d];
    tableRowCells(sh, row++, spec, [d, WEEKDAYS_AR[new Date(d + 'T00:00:00Z').getUTCDay()], s.trips, s.pax, s.missed, avgPax(s), punct(s) == null ? '—' : punct(s), s.late], i % 2 === 1);
  });
  const last = row - 1, n = A.days.length;
  const t = A.total30;
  tableRowCells(sh, row, spec.map(function (s) { return [s[0], s[1], s[2], s[3], true, C.navy]; }), ['الإجمالي', '',
    '=SUM(C' + first + ':C' + last + ')', '=SUM(D' + first + ':D' + last + ')', '=SUM(E' + first + ':E' + last + ')',
    '=IFERROR(D' + row + '/C' + row + ',0)', punct(t) == null ? '—' : punct(t), '=SUM(H' + first + ':H' + last + ')'], false);
  sh.getRange(row, 1, 1, W).setBackground(C.soft).setBorder(true, null, null, null, null, null, C.navy, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  gradient(sh, sh.getRange(first, 4, n, 1), '#ffffff', null, '#a9c4eb');
  gradient(sh, sh.getRange(first, 7, n, 1), '#f4c7c3', '#fff2cc', '#b7e1cd', 0.5, 0.8, 1);
  gradient(sh, sh.getRange(first, 5, n, 1), '#ffffff', null, '#f4a6a1');
  sh.setFrozenRows(5);
}

/* ════════════════════════════════════════════════════════════
 *  ورقة المحطة
 * ════════════════════════════════════════════════════════════ */
function writeStationSheet(ss, name, label, rows, s30, sPrev, logo) {
  const sh = prepSheet(ss, name);
  const W = COLUMNS.length;
  const widths = [105, 90, 90, 90, 120, 120, 170, 90, 220, 140];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  headerBand(sh, W, label, 'تقرير المحطة · سجل الترحيل الكامل · آخر تحديث ' + now, logo);

  const pu = punct(s30), pp = punct(sPrev);
  const dPax = deltaText(s30.pax, sPrev.pax, true), dPu = deltaPoints(pu, pp);
  const tableHead = 9, first = tableHead + 1, last = tableHead + Math.max(rows.length, 1);
  kpiCard(sh, 5, 1, 2, 'إجمالي السجلات', rows.length ? '=COUNTA(A' + first + ':A' + last + ')' : 0, 'منذ بداية التسجيل', C.grey, C.navy, N0);
  kpiCard(sh, 5, 3, 2, 'إجمالي الركاب', rows.length ? '=SUM(C' + first + ':C' + last + ')' : 0, 'منذ بداية التسجيل', C.grey, C.navy, N0);
  kpiCard(sh, 5, 5, 2, 'ركاب آخر 30 يوماً', s30.pax, dPax.t, dPax.c, C.navy, N0);
  kpiCard(sh, 5, 7, 2, 'الانضباط (30 يوماً)', pu == null ? '—' : pu, dPu.t, dPu.c, pu == null ? C.grey : (pu >= 0.85 ? C.ok : pu >= 0.7 ? C.warn : C.bad), '0%');
  kpiCard(sh, 5, 9, 2, 'المتخلفون (30 يوماً)', s30.missed, (missedRate(s30) * 100).toFixed(1) + '% من الركاب', s30.missed > 0 ? C.bad : C.ok, s30.missed > 0 ? C.bad : C.ok, N0);

  tableHeader(sh, tableHead, COLUMNS.map(function (c, i) { return [i + 1, i + 1, c[1]]; }));
  if (rows.length) {
    const data = rows.map(function (r) {
      return COLUMNS.map(function (c) {
        let v = r[c[0]];
        if (v === null || v === undefined) return '';
        if (v === true) return 'نعم';
        if (v === false) return 'لا';
        if (c[0] === 'departure_accuracy') return ACCURACY_AR[v] || v;
        if (c[0] === 'operational_status') return STATUS_AR[v] || v;
        if (c[0] === 'passenger_count' || c[0] === 'missed_count') return Number(v) || 0;
        return v;
      });
    });
    const body = sh.getRange(first, 1, data.length, W);
    body.setValues(data).setFontFamily(FONT).setFontSize(10).setVerticalAlignment('middle').setHorizontalAlignment('center');
    body.setBorder(true, true, true, true, true, true, C.line, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(first, 9, data.length, 1).setHorizontalAlignment('right').setWrap(true);
    sh.getRange(first, 3, data.length, 2).setNumberFormat(N0);
    sh.getRange(first, 3, data.length, 1).setFontWeight('bold');
    // تظليل متبادل + تلوين الدقة والتخلف
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISEVEN(ROW())').setBackground(C.zebra).setRanges([body]).build());
    const acc = sh.getRange(first, 6, data.length, 1);
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('متأخرة').setFontColor(C.bad).setBold(true).setRanges([acc]).build());
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('غير منضبطة').setFontColor(C.warn).setBold(true).setRanges([acc]).build());
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('في الموعد').setFontColor(C.ok).setBold(true).setRanges([acc]).build());
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('مبكرة').setFontColor(C.ok).setBold(true).setRanges([acc]).build());
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor(C.bad).setBold(true).setRanges([sh.getRange(first, 4, data.length, 1)]).build());
    sh.getRange(tableHead, 1, data.length + 1, W).createFilter();
  } else {
    merged(sh, first, 1, W, 'لا توجد سجلات ترحيل لهذه المحطة', { align: 'center', color: C.grey });
  }
  sh.setFrozenRows(tableHead);
}

/* ════════════════════════════════════════════════════════════
 *  النسخة الخام والحالة
 * ════════════════════════════════════════════════════════════ */
function writeRawSheet(ss, table, rows) {
  const name = '📦 ' + table;
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();

  const keySet = {};
  const keys = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (!keySet[k]) { keySet[k] = true; keys.push(k); } }); });
  if (keys.length === 0) { sheet.getRange(1, 1).setValue('(الجدول فارغ — ' + table + ')'); return; }

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
  sheet.getRange(1, 1, 1, keys.length).setBackground('#333f48').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function updateStatusSheet(ss, stationCount, recordCount, totalRaw, recipients) {
  const sh = prepSheet(ss, 'ℹ️ الحالة');
  sh.setHiddenGridlines(false);
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  sh.getRange(1, 1, 6, 2).setValues([
    ['آخر نسخة احتياطية', now + ' (توقيت الرياض)'],
    ['المُرسَل إلى', recipients.join('، ')],
    ['عدد المحطات', stationCount],
    ['إجمالي سجلات الترحيل', recordCount],
    ['إجمالي الصفوف المنسوخة (كل الجداول)', totalRaw],
    ['المصدر', 'NWBUS — Supabase'],
  ]);
  sh.getRange(1, 1, 6, 1).setFontWeight('bold').setBackground(C.light);
  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 360);
}

/* ════════════════════════════════════════════════════════════
 *  التقرير اليومي لكل محطة (أمس)
 * ════════════════════════════════════════════════════════════ */
function buildStationDailyReport(stations, departures, stationName) {
  const yday = ymd(1);
  const dep = {};
  departures.forEach(function (r) {
    if (String(r.record_date).slice(0, 10) !== yday) return;
    const s = dep[r.station_id] = dep[r.station_id] || newStat();
    addStat(s, r);
  });
  const rows = stations.map(function (st) {
    const d = dep[st.id] || newStat();
    return { name: stationName[st.id], depTrips: d.trips, depPax: d.pax, missed: d.missed, punct: punct(d), late: d.late, extra: d.extra };
  }).filter(function (r) { return r.depTrips > 0; })
    .sort(function (a, b) { return b.depPax - a.depPax; });
  return { yday: yday, rows: rows };
}

function writeStationReportSheet(ss, report, logo) {
  const sh = prepSheet(ss, '📋 التقرير اليومي');
  const W = 7;
  [180, 110, 110, 110, 110, 110, 110].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  headerBand(sh, W, 'التقرير اليومي لكل محطة — المغادرة', 'يوم ' + report.yday + ' · رحلات المغادرة والركاب والتخلف والانضباط (الوصول مستبعد)', logo);
  tableHeader(sh, 5, [[1, 1, 'المحطة'], [2, 2, 'رحلات المغادرة'], [3, 3, 'ركاب المغادرة'], [4, 4, 'المتخلفون'], [5, 5, 'الانضباط'], [6, 6, 'رحلات متأخرة'], [7, 7, 'إضافية']]);
  const spec = [[1, 1, '@', 'right', true, C.navy], [2, 2, N0], [3, 3, N0, 'center', true], [4, 4, N0], [5, 5, '0%'], [6, 6, N0], [7, 7, N0]];
  let row = 6;
  if (!report.rows.length) {
    merged(sh, row, 1, W, 'لا توجد بيانات لهذا اليوم', { align: 'center', color: C.grey });
  } else {
    const first = row;
    report.rows.forEach(function (r, i) {
      tableRowCells(sh, row++, spec, [r.name, r.depTrips, r.depPax, r.missed, r.punct == null ? '—' : r.punct, r.late, r.extra], i % 2 === 1);
    });
    const last = row - 1;
    tableRowCells(sh, row, spec.map(function (s) { return [s[0], s[1], s[2], s[3], true, C.navy]; }), ['الإجمالي',
      '=SUM(B' + first + ':B' + last + ')', '=SUM(C' + first + ':C' + last + ')', '=SUM(D' + first + ':D' + last + ')', '',
      '=SUM(F' + first + ':F' + last + ')', '=SUM(G' + first + ':G' + last + ')'], false);
    sh.getRange(row, 1, 1, W).setBackground(C.soft).setBorder(true, null, null, null, null, null, C.navy, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    gradient(sh, sh.getRange(first, 5, report.rows.length, 1), '#f4c7c3', '#fff2cc', '#b7e1cd', 0.5, 0.8, 1);
    addRule(sh, SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor(C.bad).setBold(true).setRanges([sh.getRange(first, 4, report.rows.length, 1)]).build());
  }
  sh.setFrozenRows(5);
}

/* ════════════════════════════════════════════════════════════
 *  الإيميل
 * ════════════════════════════════════════════════════════════ */
function sendBackupEmail(ss, recipients, A, report, stationCount, recordCount) {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  }).getBlob().setName('NWBUS_Report_' + today + '.xlsx');

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: '📊 NWBUS — التقرير التحليلي والنسخة الاحتياطية · ' + report.yday,
    htmlBody: buildEmailHtml(A, report, now, stationCount, recordCount),
    attachments: [blob],
  });
}

function notifyFailure(err, recipients) {
  try {
    MailApp.sendEmail({
      to: (recipients && recipients.length ? recipients : [FALLBACK_EMAIL]).join(','),
      subject: '⚠️ NWBUS — فشلت النسخة الاحتياطية',
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px"><h3>⚠️ فشلت النسخة الاحتياطية</h3><p>الخطأ:</p>' +
        '<pre dir="ltr" style="background:#f4f4f4;padding:10px">' + String((err && err.message) || err) + '</pre>' +
        '<p>افتح Apps Script ← Executions لمعرفة التفاصيل.</p></div>',
    });
  } catch (e) { /* نكمل لرمي الخطأ الأصلي */ }
}

function buildEmailHtml(A, report, now, stationCount, recordCount) {
  const t = A.total30, p = A.totalPrev, pu = punct(t);
  const card = function (label, value, sub, color) {
    return '<td style="width:25%;padding:6px"><div style="background:#f1f5f9;border-top:4px solid ' + color + ';border-radius:6px;padding:12px 8px;text-align:center">' +
      '<div style="font-size:11px;color:#6b7280;font-weight:bold">' + label + '</div>' +
      '<div style="font-size:24px;font-weight:bold;color:' + color + ';margin:4px 0">' + value + '</div>' +
      '<div style="font-size:10px;color:#6b7280">' + sub + '</div></div></td>';
  };
  const dp = deltaText(t.pax, p.pax, true), dt = deltaText(t.trips, p.trips, true);
  const th = function (x) { return '<th style="background:' + C.navy + ';color:#fff;padding:8px 6px;font-size:12px;border:1px solid #2a4a80">' + x + '</th>'; };
  const td = function (x, b, c) { return '<td style="padding:7px 6px;text-align:center;font-size:13px;border:1px solid #dde3ee' + (b ? ';font-weight:bold' : '') + (c ? ';color:' + c : '') + '">' + x + '</td>'; };
  let rowsHtml = '';
  report.rows.forEach(function (r, i) {
    const pc = r.punct == null ? '#999' : r.punct >= 0.8 ? C.ok : r.punct >= 0.6 ? C.warn : C.bad;
    rowsHtml += '<tr style="background:' + (i % 2 ? '#f8fafc' : '#fff') + '"><td style="padding:7px 10px;font-weight:bold;color:' + C.navy + ';border:1px solid #dde3ee">' + r.name + '</td>' +
      td(r.depTrips, true) + td(r.depPax) + td(r.missed, false, r.missed > 0 ? C.bad : C.ok) +
      td(r.punct == null ? '—' : Math.round(r.punct * 100) + '%', true, pc) + td(r.late > 0 ? r.late : '✓', false, r.late > 0 ? C.bad : C.ok) + '</tr>';
  });
  if (!rowsHtml) rowsHtml = '<tr><td colspan="6" style="text-align:center;padding:18px;color:#888">لا توجد بيانات لأمس</td></tr>';
  const insights = A.insights.map(function (x) { return '<li style="margin:6px 0;line-height:1.7">' + x + '</li>'; }).join('');

  return '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:820px;margin:0 auto;color:#1d1d1c">' +
    '<div style="background:' + C.navy + ';padding:18px 20px;border-radius:8px 8px 0 0"><div style="color:#fff;font-size:20px;font-weight:bold">NORTH WEST BUS</div>' +
    '<div style="color:#f5b48d;font-size:13px;margin-top:4px">التقرير التحليلي التشغيلي (المغادرة) — حتى ' + report.yday + '</div></div>' +
    '<div style="height:4px;background:' + C.orange + '"></div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:12px"><tr>' +
    card('ركاب المغادرة (30 يوماً)', fmtN(t.pax), dp.t, C.navy) +
    card('رحلات المغادرة', fmtN(t.trips), dt.t, C.navy) +
    card('الانضباط', pu == null ? '—' : Math.round(pu * 100) + '%', 'في المغادرة', pu == null ? C.grey : pu >= 0.85 ? C.ok : pu >= 0.7 ? C.warn : C.bad) +
    card('المتخلفون', fmtN(t.missed), (missedRate(t) * 100).toFixed(1) + '% من الركاب', t.missed > 0 ? C.bad : C.ok) +
    '</tr></table>' +
    '<h3 style="color:' + C.navy + ';margin:18px 0 6px;font-size:15px">أبرز الملاحظات</h3><ul style="padding-right:20px;margin:0;font-size:13px">' + insights + '</ul>' +
    '<h3 style="color:' + C.navy + ';margin:18px 0 6px;font-size:15px">أداء مغادرة المحطات أمس — ' + report.yday + '</h3>' +
    '<table cellspacing="0" style="border-collapse:collapse;width:100%;direction:rtl"><thead><tr>' + th('المحطة') + th('رحلات المغادرة') + th('ركاب المغادرة') + th('المتخلفون') + th('الانضباط') + th('متأخرة') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<div style="margin-top:14px;padding:12px 14px;background:#f8f9fb;border-right:4px solid ' + C.orange + ';font-size:12px;color:#555;line-height:1.8">' +
    '📎 مرفق ملف Excel: لوحة القيادة التحليلية · الاتجاهات · التقرير اليومي · ورقة لكل محطة · نسخة كاملة من الجداول (' + stationCount + ' محطة · ' + fmtN(recordCount) + ' سجل ترحيل).<br>' +
    'أُنشئ تلقائياً ' + now + ' · يمكنك تغيير الإيميلات ووقت الإرسال من التطبيق ← الإعدادات.</div></div>';
}

/* ════════════════════════════════════════════════════════════
 *  الاتصال بـ Supabase والأدوات
 * ════════════════════════════════════════════════════════════ */
function sbGet(table, select, extra) {
  const pageSize = 1000;
  let all = [], offset = 0;
  while (true) {
    let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + encodeURIComponent(select);
    if (extra) url += '&' + extra;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Range-Unit': 'items', Range: offset + '-' + (offset + pageSize - 1) },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code !== 200 && code !== 206) throw new Error('فشل جلب ' + table + ' — رمز ' + code + ': ' + res.getContentText());
    const page = JSON.parse(res.getContentText());
    all = all.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function sbPatch(table, filter, body) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + filter, {
    method: 'patch',
    contentType: 'application/json',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Prefer: 'return=minimal' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('فشل تحديث ' + table + ' — رمز ' + code + ': ' + res.getContentText());
}

function fetchLogo() {
  try {
    const res = UrlFetchApp.fetch(LOGO_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return res.getBlob();
  } catch (e) { /* نكمل بدون شعار */ }
  return null;
}

function sheetName(name) { return name.replace(/[\\/?*\[\]:]/g, ' ').substring(0, 90).trim() || 'محطة'; }

/**
 * التركيب — شغّلها مرة واحدة فقط: تحذف المشغّلات القديمة وتنشئ مشغّلاً كل 5 دقائق.
 */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'backupTransportation' || f === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
}
/** للتوافق مع التعليمات القديمة */
function createDailyTrigger() { setup(); }

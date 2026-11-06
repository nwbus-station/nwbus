// كود Power Query (لغة M) لاتصال Excel المباشر بالنظام. يُنسخ مرة واحدة كاستعلام اسمه fnFeed،
// ثم لكل ورقة بيانات استعلام قصير: = fnFeed("sales")
export const FEED_DATASETS = [
  { id: 'sales', ar: 'المبيعات', en: 'Sales' },
  { id: 'trips', ar: 'الترحيل (الرحلات)', en: 'Trips' },
  { id: 'leaves', ar: 'الإجازات', en: 'Leaves' },
  { id: 'evaluations', ar: 'تقييمات الأداء', en: 'Performance evaluations' },
  { id: 'supervisor_evals', ar: 'تقييمات المشرفين', en: 'Supervisor evaluations' },
  { id: 'station_evals', ar: 'تقييمات المحطات', en: 'Station evaluations' },
  { id: 'customer_ratings', ar: 'تقييمات العملاء', en: 'Customer ratings' },
  { id: 'customer_surveys', ar: 'استبيانات العملاء', en: 'Customer surveys' },
  { id: 'lost_found', ar: 'المفقودات والموجودات', en: 'Lost & found' },
  { id: 'lost_reports', ar: 'بلاغات المفقودات', en: 'Lost reports' },
  { id: 'daily_survey', ar: 'الاستبيان اليومي', en: 'Daily survey' },
  { id: 'audit', ar: 'سجل النشاط', en: 'Activity log' },
  { id: 'employees', ar: 'الموظفون', en: 'Employees' },
  { id: 'stations', ar: 'المحطات', en: 'Stations' },
  { id: 'schedule', ar: 'جدول الرحلات الثابت', en: 'Trip schedule' },
]

export function feedCode({ url, anonKey, token }) {
  return `(ds as text, optional days as nullable number) as table =>
let
    Days = if days = null then 365 else days,
    Today = Date.From(DateTime.LocalNow()),
    Body = Json.FromValue([
        p_token = "${token}",
        p_dataset = ds,
        p_from = Date.ToText(Date.AddDays(Today, -Days), [Format = "yyyy-MM-dd", Culture = "en-US"]),
        p_to = Date.ToText(Date.AddDays(Today, 31), [Format = "yyyy-MM-dd", Culture = "en-US"])
    ]),
    Raw = Json.Document(Web.Contents("${url}/rest/v1/rpc/excel_feed", [
        Headers = [#"Content-Type" = "application/json", apikey = "${anonKey}", Authorization = "Bearer ${anonKey}"],
        Content = Body,
        ManualStatusHandling = {400, 401, 403, 404}
    ])),
    Rows = if Raw is list then Raw else error Error.Record("NW Station", Record.FieldOrDefault(Raw, "message", "تعذّر الاتصال: تأكد من المفتاح"), Raw),
    Tbl = if List.IsEmpty(Rows) then #table({}, {}) else Table.FromRecords(Rows),
    Names = Table.ColumnNames(Tbl),
    DateCols = List.Select(Names, each Text.EndsWith(_, "_date") or _ = "date"),
    StampCols = List.Select(Names, each Text.EndsWith(_, "_at") or _ = "actual_departure"),
    AsDate = Table.TransformColumns(Tbl, List.Transform(DateCols, (c) => {c, (v) => try Date.FromText(Text.Start(v, 10), [Format = "yyyy-MM-dd", Culture = "en-US"]) otherwise null, type nullable date})),
    AsStamp = Table.TransformColumns(AsDate, List.Transform(StampCols, (c) => {c, (v) => try DateTimeZone.RemoveZone(DateTimeZone.SwitchZone(DateTimeZone.FromText(v), 3)) otherwise null, type nullable datetime}))
in
    AsStamp`
}

// سكربت Google Apps Script: يبني ملف الشيت بكل الأقسام (تبويب لكل قسم + Settings) ويحدّثها تلقائياً بمؤقّت.
// يُلصق مرة واحدة في Extensions > Apps Script ثم تشغّل setup. المفتاح يُدخل في نافذة، ولا يُكتب داخل الكود.
const SHEET_TABS = [
  ['sales', 'المبيعات'], ['trips', 'الترحيل'], ['leaves', 'الإجازات'], ['evaluations', 'تقييمات الأداء'], ['supervisor_evals', 'تقييمات المشرفين'],
  ['station_evals', 'تقييمات المحطات'], ['customer_ratings', 'تقييمات العملاء'], ['customer_surveys', 'استبيانات العملاء'],
  ['lost_found', 'المفقودات'], ['lost_reports', 'بلاغات المفقودات'], ['daily_survey', 'الاستبيان اليومي'],
  ['employees', 'الموظفون'], ['stations', 'المحطات'], ['schedule', 'جدول الرحلات'],
]

export function sheetsScript({ baseUrl, minutes = 15, days = 90 }) {
  const tabs = SHEET_TABS.map(([id, name]) => `  ['${id}', '${name}'],`).join('\n')
  return `// NW Station — يبني كل الأقسام كتبويبات ويحدّثها تلقائياً
const BASE_URL = '${baseUrl}/functions/v1/sheet-feed';
const EVERY_MINUTES = ${minutes};   // يقبل 1 أو 5 أو 10 أو 15 أو 30
const DAYS_BACK = ${days};          // كم يوماً للخلف في الأقسام ذات التاريخ
const TABS = [
${tabs}
  // لإضافة سجل النشاط: ['audit', 'سجل النشاط'],  (كبير الحجم، تفعيله على مسؤوليتك)
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('NW Station')
    .addItem('تحديث الآن', 'refreshNow')
    .addItem('إعداد الأوراق (أول مرة)', 'setup')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('مفتاح الاتصال', 'الصق المفتاح من إعدادات النظام (يبدأ بـ nwx_):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const key = r.getResponseText().trim();
  if (!/^nwx_[0-9a-f]{64}$/.test(key)) { ui.alert('المفتاح غير صحيح. انسخه كاملاً من الإعدادات.'); return; }

  const st = ss.getSheetByName('Settings') || ss.insertSheet('Settings', 0);
  st.clear();
  st.getRange('A1:B4').setValues([['رابط الدالة', BASE_URL], ['المفتاح', key], ['عدّاد التحديث', 1], ['عدد الأيام للخلف', DAYS_BACK]]);
  st.getRange('A6').setValue('تتحدث الأوراق تلقائياً كل ' + EVERY_MINUTES + ' دقيقة. لا تحذف هذه الخلايا ولا تشارك الملف مع أحد: المفتاح بداخله.');
  st.setColumnWidth(1, 160); st.setColumnWidth(2, 420);

  TABS.forEach(function (t) {
    const sh = ss.getSheetByName(t[1]) || ss.insertSheet(t[1]);
    sh.clear();
    sh.getRange('A1').setFormula('=IMPORTDATA(Settings!$B$1&"?key="&Settings!$B$2&"&d=' + t[0] + '&days="&Settings!$B$4&"&t="&Settings!$B$3)');
    sh.setFrozenRows(1);
  });

  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'refreshNow') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('refreshNow').timeBased().everyMinutes(EVERY_MINUTES).create();
  ui.alert('تم. تظهر البيانات خلال ثوانٍ، وتتحدث تلقائياً كل ' + EVERY_MINUTES + ' دقيقة.');
}

function refreshNow() {
  const st = SpreadsheetApp.getActive().getSheetByName('Settings');
  if (st) st.getRange('B3').setValue(Date.now());
}
`
}

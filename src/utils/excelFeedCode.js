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

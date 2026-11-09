// مركز البيانات المباشر: فهرس الأقسام + أدوات الأعمدة والعرض والتصدير لشبكة بيانات بنمط Excel
import { createBook, XL } from './excelExport'
import { COL_AR } from './masterWorkbook'
import { supabase } from '../lib/supabase'

export const HUB_GROUPS = [
  { id: 'ops', ar: 'التشغيل والترحيل', en: 'Operations', color: '#0ea5e9' },
  { id: 'sales', ar: 'الإيرادات', en: 'Revenue', color: '#10b981' },
  { id: 'hr', ar: 'الموظفون والإجازات والتقييم', en: 'Staff, leaves & evaluation', color: '#8b5cf6' },
  { id: 'cust', ar: 'العملاء والركاب', en: 'Customers & passengers', color: '#ec4899' },
  { id: 'lost', ar: 'الموجودات', en: 'Lost & found', color: '#f59e0b' },
  { id: 'sys', ar: 'النظام', en: 'System', color: '#64748b' },
]

// table: الجدول الأصلي (لتحديث الصفحة لحظياً عند أي تغيير) · dated: يتأثر بالفترة المختارة
export const HUB_SETS = [
  { id: 'trips', ar: 'سجلات الترحيل', en: 'Trip records', group: 'ops', table: 'trip_records', dated: true },
  { id: 'station_trips', ar: 'رحلات المحطات', en: 'Station trips', group: 'ops', table: 'station_trips' },
  { id: 'schedule', ar: 'جدول الرحلات الثابت', en: 'Trip schedule', group: 'ops', table: 'trip_schedule' },
  { id: 'shipments', ar: 'الشحنات', en: 'Shipments', group: 'ops', table: 'shipments', dated: true },
  { id: 'sales', ar: 'الإيرادات اليومية', en: 'Daily revenue', group: 'sales', table: 'sales_records', dated: true },
  { id: 'employees', ar: 'الموظفون', en: 'Employees', group: 'hr', table: 'users' },
  { id: 'leaves', ar: 'الإجازات', en: 'Leaves', group: 'hr', table: 'leaves', dated: true },
  { id: 'evaluations', ar: 'تقييمات الأداء', en: 'Performance evaluations', group: 'hr', table: 'employee_evaluations', dated: true },
  { id: 'supervisor_evals', ar: 'تقييمات المشرفين', en: 'Supervisor evaluations', group: 'hr', table: 'supervisor_evaluations', dated: true },
  { id: 'station_evals', ar: 'تقييمات المحطات', en: 'Station evaluations', group: 'hr', table: 'station_evaluations', dated: true },
  { id: 'customer_ratings', ar: 'تقييمات العملاء', en: 'Customer ratings', group: 'cust', table: 'customer_ratings', dated: true },
  { id: 'customer_surveys', ar: 'استبيانات العملاء', en: 'Customer surveys', group: 'cust', table: 'customer_surveys', dated: true },
  { id: 'daily_survey', ar: 'الاستبيان اليومي', en: 'Daily survey', group: 'cust', table: 'user_daily_survey', dated: true },
  { id: 'lost_found', ar: 'المفقودات والموجودات', en: 'Lost & found items', group: 'lost', table: 'lost_found_items', dated: true },
  { id: 'lost_reports', ar: 'بلاغات المفقودات', en: 'Lost reports', group: 'lost', table: 'lost_reports', dated: true },
  { id: 'stations', ar: 'المحطات', en: 'Stations', group: 'sys', table: 'stations' },
  { id: 'audit', ar: 'سجل النشاط', en: 'Activity log', group: 'sys', table: 'audit_log', dated: true },
]

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
const pad = n => String(n).padStart(2, '0')
export const riyadhText = s => { const d = new Date(new Date(s).getTime() + 3 * 3600 * 1000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }

const isoDay = x => x.toISOString().slice(0, 10)

// الفترة: «اليوم» بتوقيت الرياض افتراضياً، أو أمس، أو آخر N يوماً، أو الكل، أو تاريخ/فترة محددة
export const riyadhToday = () => isoDay(new Date(Date.now() + 3 * 3600 * 1000))
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }
export const PERIODS = [['today', 'اليوم', 'Today'], ['yesterday', 'أمس', 'Yesterday'], ['7', '7 أيام', '7 days'], ['30', '30 يوماً', '30 days'], ['90', '90 يوماً', '90 days'], ['all', 'الكل', 'All']]
export function resolvePeriod(p) {
  const t = riyadhToday()
  const m = p?.mode || 'today'
  if (m === 'today') return [t, t]
  if (m === 'yesterday') { const y = addDays(t, -1); return [y, y] }
  if (m === 'all') return [addDays(t, -1500), addDays(t, 31)]
  if (m === 'custom') { const f = p.from || t, e = p.to || f; return f <= e ? [f, e] : [e, f] }
  return [addDays(t, -(Number(m) - 1)), t]
}

async function rpcRaw(id, from, to) {
  const { data, error } = await supabase.rpc('excel_feed_admin', { p_dataset: id, p_from: from ?? null, p_to: to ?? null })
  if (error) throw new Error(/not allowed/i.test(error.message) ? 'ليس لديك صلاحية' : /does not exist|not find|schema cache/i.test(error.message) ? 'SETUP' : error.message)
  return Array.isArray(data) ? data : []
}

// جداول صغيرة (المحطات/الموظفون/الجدول) تُجلب مرة وتُحفظ 5 دقائق؛ الربط بالأسماء يتم هنا بدل الخادم (أسرع بكثير)
let LOOK = null, LOOK_AT = 0, LOOK_P = null
async function lookups() {
  if (LOOK && Date.now() - LOOK_AT < 300000) return LOOK
  if (!LOOK_P) {
    LOOK_P = (async () => {
      const safe = id => rpcRaw(id).catch(() => [])
      const [st, us, sc] = await Promise.all([safe('stations'), safe('employees'), safe('schedule')])
      const stations = new Map(st.map(r => [r.id, r.name_ar || r.name_en || null]))
      const users = new Map(us.map(r => [r.id, r]))
      const sched = new Map(sc.map(r => [r.id, r]))
      LOOK = { stations, users, sched }; LOOK_AT = Date.now()
      return LOOK
    })().finally(() => { LOOK_P = null })
  }
  return LOOK_P
}
const USER_COLS = ['user_id', 'employee_id', 'created_by', 'evaluator_id', 'supervisor_id', 'evaluated_by', 'approved_by']

function enrich(id, rows, L) {
  if (!rows.length) return rows
  const sample = rows[0]
  const hasStation = 'station_id' in sample
  const hasTrip = 'trip_schedule_id' in sample
  const uCols = id === 'employees' ? [] : USER_COLS.filter(c => c in sample)
  if (!hasStation && !hasTrip && !uCols.length) return rows
  return rows.map(r => {
    const o = { ...r }
    if (hasStation && !('station_name' in o)) o.station_name = L.stations.get(r.station_id) ?? null
    if (hasTrip && !('trip_number' in o)) {
      const t = L.sched.get(r.trip_schedule_id)
      o.trip_number = t?.trip_number ?? null
      o.scheduled_departure = t?.scheduled_departure ?? null
      o.from_station = t ? (L.stations.get(t.from_station_id) ?? null) : null
      o.to_station = t ? (L.stations.get(t.to_station_id) ?? null) : null
    }
    for (const c of uCols) {
      if (`${c}_name` in o) continue
      const u = L.users.get(r[c])
      o[`${c}_name`] = u?.full_name_ar ?? null
      o[`${c}_job`] = u?.job_number ?? null
    }
    return o
  })
}

// عمود التاريخ لكل قسم (نفس ترتيب الخادم) لتصفية «اليوم» بتوقيت الرياض بدقة
const DATE_KEYS = {
  sales: ['sale_date'], trips: ['record_date'], leaves: ['start_date', 'from_date', 'created_at'],
  evaluations: ['evaluation_date', 'eval_date', 'created_at'], supervisor_evals: ['evaluation_date', 'eval_date', 'created_at'], station_evals: ['evaluation_date', 'eval_date', 'created_at'],
  customer_ratings: ['created_at'], customer_surveys: ['created_at'], lost_found: ['found_date', 'created_at'], lost_reports: ['created_at'],
  daily_survey: ['survey_date', 'created_at'], audit: ['created_at'], shipments: ['created_at'],
}
const dayOf = (r, keys) => {
  for (const k of keys) if (k in r) { const v = r[k]; return !v ? null : TS.test(v) ? riyadhText(v).slice(0, 10) : String(v).slice(0, 10) }
  return null
}

export async function loadHubSet(id, from, to) {
  const keys = DATE_KEYS[id]
  // نوسّع الطلب يوماً من كل جهة (توقيت الخادم UTC) ثم نصفّي بتاريخ الرياض هنا
  const [rows, L] = await Promise.all([
    rpcRaw(id, keys ? addDays(from, -1) : null, keys ? addDays(to, 1) : null),
    lookups(),
  ])
  const kept = keys ? rows.filter(r => { const d = dayOf(r, keys); return d && d >= from && d <= to }) : rows
  return enrich(id, kept, L)
}


// ترجمة أسماء الأعمدة: القاموس الجاهز أولاً، وإلا ترجمة كلمات الاسم وعكس ترتيبها بالإضافة العربية (ticket_number ← رقم التذكرة)
const TOK = {
  number: 'رقم', name: 'اسم', type: 'نوع', count: 'عدد', date: 'تاريخ', at: 'وقت', by: 'بواسطة', amount: 'مبلغ', status: 'حالة', total: 'إجمالي', note: 'ملاحظة', notes: 'ملاحظات', reason: 'سبب', description: 'وصف', phone: 'جوال', mobile: 'جوال', time: 'وقت', title: 'عنوان', text: 'نص', message: 'رسالة', value: 'قيمة', rate: 'نسبة', score: 'درجة', rating: 'تقييم', comment: 'تعليق',
  customer: 'العميل', ticket: 'التذكرة', report: 'البلاغ', contact: 'التواصل', station: 'المحطة', trip: 'الرحلة', employee: 'الموظف', user: 'المستخدم', bus: 'الحافلة', passenger: 'الراكب', passengers: 'الركاب', item: 'الغرض', found: 'الموجود', lost: 'المفقود', cash: 'النقد', shift: 'الوردية', driver: 'السائق', city: 'المدينة', supervisor: 'المشرف', evaluator: 'المقيّم', leave: 'الإجازة', sale: 'المبيعات', sales: 'المبيعات', survey: 'الاستبيان', shipment: 'الشحنة', donation: 'التبرع', post: 'المنشور', schedule: 'الجدول', stop: 'التوقف', departure: 'المغادرة', arrival: 'الوصول', start: 'البداية', end: 'النهاية', created: 'الإنشاء', updated: 'التعديل', confirmed: 'التأكيد', approved: 'الاعتماد', expected: 'المتوقع', actual: 'الفعلي', first: 'الأول', last: 'الأخير', job: 'الوظيفي', city_name: 'المدينة', sender: 'المرسل', receiver: 'المستلم', recipient: 'المستلم', image: 'الصورة', photo: 'الصورة', file: 'الملف', url: 'الرابط', email: 'البريد', address: 'العنوان', location: 'الموقع', day: 'اليوم', month: 'الشهر', year: 'السنة', week: 'الأسبوع', priority: 'الأولوية', source: 'المصدر', category: 'الفئة', code: 'رمز', ref: 'مرجع', reference: 'مرجع', order: 'ترتيب', label: 'تسمية', language: 'اللغة', lang: 'اللغة', ar: '(عربي)', en: '(EN)',
}
const VERB = { is: '؟', has: '؟' }
export function smartLabel(k) {
  if (COL_AR[k]) return COL_AR[k]
  const parts = k.split('_').filter(Boolean)
  if (!parts.length) return k
  let q = false
  if (VERB[parts[0]]) { q = true; parts.shift() }
  if (!parts.length) return k
  const ar = parts.map(w => TOK[w] || w)
  if (!parts.some(w => TOK[w])) return k.replace(/_/g, ' ')
  return ar.reverse().join(' ') + (q ? '؟' : '')
}

// أعمدة تقنية لا تفيد القارئ: تُخفى افتراضياً (وتبقى في قائمة الأعمدة وفي لوحة تفاصيل الصف)
const TECH_KEY = /(^id$|_id$|^updated_at$|updated_by|token|password|hash|^auth_|push|fcm|avatar|signature|^is_cancelled$|^deleted|lat$|lng$|^lang$|_url$|^sort|^order_index|^version$)/i
const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)

// ترتيب وتسميات وقيم عربية جاهزة لأقسام معيّنة (الأعمدة في force تظهر دائماً حتى لو كانت قيمها فارغة)
const STATUS_AR = {
  Normal: 'طبيعية', 'Traffic Jam': 'ازدحام مروري', Weather: 'أحوال جوية', 'Police Control': 'نقطة تفتيش / ضبط', 'Health (Driver/Passengers)': 'حالة صحية (سائق/ركاب)',
  'Passenger Misbehavior': 'سلوك راكب', 'Accident between other vehicles': 'حادث بين مركبات أخرى', 'Accident with NWB bus': 'حادث مع حافلة NWB',
  'Malfunction inside the station': 'عطل داخل المحطة', 'Out-of-station malfunction': 'عطل خارج المحطة',
}
const ACC_AR = { Early: 'مبكرة', 'On Time': 'في الموعد', 'Not On Time': 'خارج الموعد', Delayed: 'متأخرة' }
const ARR_TONES = { true: ['var(--gold-dim)', 'var(--accent)'], false: ['var(--surface-2)', 'var(--text-2)'] }
export const PRESETS = {
  trips: {
    order: ['record_date', 'station_name', 'trip_number', 'bus_number', 'is_arrival', 'from_station', 'to_station', 'passenger_count', 'operational_status', 'created_by_name', 'scheduled_departure', 'actual_departure', 'actual_arrival', 'departure_accuracy', 'delay_minutes', 'missed_count', 'is_extra_trip', 'notes'],
    force: ['record_date', 'station_name', 'trip_number', 'bus_number', 'is_arrival', 'from_station', 'to_station', 'passenger_count', 'operational_status', 'created_by_name'],
    labels: { is_arrival: 'النوع', bus_number: 'الحافلة', trip_number: 'رقم الرحلة', from_station: 'من', to_station: 'إلى', passenger_count: 'عدد الركاب', operational_status: 'حالة الحافلة', created_by_name: 'أدخلها', scheduled_departure: 'موعد الجدول', actual_departure: 'المغادرة الفعلية', actual_arrival: 'الوصول الفعلي', departure_accuracy: 'الالتزام بالموعد', delay_minutes: 'التأخير (د)', missed_count: 'المتخلفون', is_extra_trip: 'إضافية' },
    fmt: { is_arrival: v => (v ? 'وصول' : 'مغادرة'), operational_status: v => STATUS_AR[v] || v, departure_accuracy: v => ACC_AR[v] || v },
    tones: { is_arrival: ARR_TONES },
  },
}

// أعمدة القسم من عيّنة الصفوف: النوع يحدد المحاذاة والتنسيق والفرز والتصفية
export function inferCols(rows, setId) {
  const P = PRESETS[setId]
  const keys = [...new Set(rows.slice(0, 300).flatMap(r => Object.keys(r)))]
  const cols = keys.map(key => {
    const sample = rows.find(r => !isEmpty(r[key]))?.[key]
    let type = 'text'
    if (typeof sample === 'number') type = 'num'
    else if (typeof sample === 'boolean') type = 'bool'
    else if (typeof sample === 'string') type = TS.test(sample) ? 'stamp' : DATE.test(sample) ? 'date' : UUID.test(sample) ? 'id' : 'text'
    const label = P?.labels?.[key] || smartLabel(key)
    const fmt = P?.fmt?.[key]
    const lens = rows.slice(0, 80).map(r => display({ type, fmt }, r[key]).length)
    const textW = Math.min(Math.max(label.length * 9 + 34, Math.max(0, ...lens) * 7.5 + 24), 240)
    const width = { num: Math.max(96, label.length * 8 + 40), date: 112, stamp: 142, bool: 86, id: 120 }[type] ?? Math.max(110, textW)
    // فارغ أو صفر في كل الصفوف المحمَّلة ← مخفي افتراضياً
    const empty = rows.every(r => isEmpty(r[key]) || r[key] === false || r[key] === 0)
    const hidden = P?.force?.includes(key) ? false : (type === 'id' || TECH_KEY.test(key) || empty)
    return { key, label, type, width, hidden, fmt, tones: P?.tones?.[key] }
  })
  // الأعمدة المهمة أولاً: التاريخ ثم المحطة/الاسم ثم الباقي، وأوقات التسجيل التقنية في الآخر
  const rank = c => (c.hidden ? 9 : /(^|_)date$|^date$/.test(c.key) ? 0 : /station_name|^name_|full_name|_name$/.test(c.key) ? 1 : /(^|_)at$/.test(c.key) ? 3 : 2)
  if (P?.order) {
    const o = k => { const i = P.order.indexOf(k); return i < 0 ? 999 : i }
    return cols.map((c, i) => ({ ...c, i })).sort((a, b) => (a.hidden - b.hidden) || (o(a.key) - o(b.key)) || (rank(a) - rank(b)) || (a.i - b.i))
  }
  return cols.map((c, i) => ({ ...c, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i)
}

export function display(col, v) {
  if (v === null || v === undefined || v === '') return ''
  if (col.fmt) return String(col.fmt(v))
  if (col.type === 'num') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (col.type === 'bool') return v ? 'نعم' : 'لا'
  if (col.type === 'stamp') return riyadhText(v)
  if (Array.isArray(v)) return v.map(x => (x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x))).join('، ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export const sortVal = (col, v) => (v === null || v === undefined ? null : col.type === 'num' ? Number(v) : col.type === 'bool' ? (v ? 1 : 0) : String(v))

// شرط عمود: للأرقام يدعم  >100  <=5  =10  10..50  وللنص «يحتوي»
export function matches(col, v, q) {
  const t = q.trim()
  if (!t) return true
  if (col.type === 'num') {
    const n = Number(v)
    let m
    if ((m = /^(>=|<=|>|<|=)\s*(-?[\d.]+)$/.exec(t))) { const x = Number(m[2]); return m[1] === '>' ? n > x : m[1] === '<' ? n < x : m[1] === '>=' ? n >= x : m[1] === '<=' ? n <= x : n === x }
    if ((m = /^(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/.exec(t))) return n >= Number(m[1]) && n <= Number(m[2])
  }
  return display(col, v).toLowerCase().includes(t.toLowerCase())
}

// تصدير العرض الحالي (بعد الفلاتر والترتيب والأعمدة الظاهرة) إلى Excel
export async function exportViewXlsx({ isAr = true, title, subtitle = '', cols, rows, filename }) {
  const book = await createBook({ isAr })
  const S = book.sheet(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28), cols.length ? cols.map(c => Math.min(Math.max(10, c.label.length + 2, Math.round(c.width / 8)), 42)) : [20], { tab: XL.navy })
  S.header({ title, subtitle })
  const ws = S.ws
  const hr = ws.addRow(cols.map(c => c.label))
  hr.height = 28
  hr.eachCell(c => {
    c.font = { bold: true, size: 10, color: { argb: XL.white } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.navy } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = { bottom: { style: 'medium', color: { argb: XL.orange } } }
  })
  for (const r of rows) {
    ws.addRow(cols.map(c => {
      const v = r[c.key]
      if (v === null || v === undefined) return null
      if (c.fmt) return display(c, v)
      if (c.type === 'bool') return v ? 'نعم' : 'لا'
      if (c.type === 'stamp') return riyadhText(v)
      if (c.type === 'date') return new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)))
      if (typeof v === 'object') return display(c, v)
      return v
    }))
  }
  cols.forEach((c, j) => { const col = ws.getColumn(j + 1); if (c.type === 'num') col.numFmt = '#,##0.##'; else if (c.type === 'date') col.numFmt = 'yyyy-mm-dd' })
  if (cols.length) {
    ws.autoFilter = { from: { row: hr.number, column: 1 }, to: { row: hr.number, column: cols.length } }
    ws.views = [{ rightToLeft: isAr, showGridLines: true, state: 'frozen', ySplit: hr.number }]
    ws.pageSetup = { ...ws.pageSetup, paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${hr.number}:${hr.number}` }
  }
  await book.save(filename)
}

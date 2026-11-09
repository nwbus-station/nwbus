// مركز البيانات المباشر: فهرس الأقسام + أدوات الأعمدة والعرض والتصدير لشبكة بيانات بنمط Excel
import { createBook, XL } from './excelExport'
import { colLabel } from './masterWorkbook'
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
  { id: 'schedule_stops', ar: 'توقفات الرحلات', en: 'Trip stops', group: 'ops', table: 'trip_schedule_stops' },
  { id: 'schedule_uploads', ar: 'رفع الجداول', en: 'Schedule uploads', group: 'ops', table: 'schedule_uploads', dated: true },
  { id: 'shipments', ar: 'الشحنات', en: 'Shipments', group: 'ops', table: 'shipments', dated: true },
  { id: 'sales', ar: 'الإيرادات اليومية', en: 'Daily revenue', group: 'sales', table: 'sales_records', dated: true },
  { id: 'charity', ar: 'التبرعات', en: 'Donations', group: 'sales', table: 'charity_donations', dated: true },
  { id: 'employees', ar: 'الموظفون', en: 'Employees', group: 'hr', table: 'users' },
  { id: 'leaves', ar: 'الإجازات', en: 'Leaves', group: 'hr', table: 'leaves', dated: true },
  { id: 'evaluations', ar: 'تقييمات الأداء', en: 'Performance evaluations', group: 'hr', table: 'employee_evaluations', dated: true },
  { id: 'supervisor_evals', ar: 'تقييمات المشرفين', en: 'Supervisor evaluations', group: 'hr', table: 'supervisor_evaluations', dated: true },
  { id: 'station_evals', ar: 'تقييمات المحطات', en: 'Station evaluations', group: 'hr', table: 'station_evaluations', dated: true },
  { id: 'supervisor_assign', ar: 'تعيينات مشرفي الورديات', en: 'Shift supervisor assignments', group: 'hr', table: 'shift_supervisor_assignments' },
  { id: 'user_stations', ar: 'محطات الموظفين', en: 'User stations', group: 'hr', table: 'user_stations' },
  { id: 'titles', ar: 'المسميات المخصصة', en: 'Custom titles', group: 'hr', table: 'custom_titles' },
  { id: 'customer_ratings', ar: 'تقييمات العملاء', en: 'Customer ratings', group: 'cust', table: 'customer_ratings', dated: true },
  { id: 'customer_surveys', ar: 'استبيانات العملاء', en: 'Customer surveys', group: 'cust', table: 'customer_surveys', dated: true },
  { id: 'rating_messages', ar: 'رسائل تقييم المحطات', en: 'Station rating messages', group: 'cust', table: 'station_rating_messages', dated: true },
  { id: 'daily_survey', ar: 'الاستبيان اليومي', en: 'Daily survey', group: 'cust', table: 'user_daily_survey', dated: true },
  { id: 'survey_cities', ar: 'مدن الاستبيان', en: 'Survey cities', group: 'cust', table: 'survey_cities' },
  { id: 'lost_found', ar: 'المفقودات والموجودات', en: 'Lost & found items', group: 'lost', table: 'lost_found_items', dated: true },
  { id: 'lost_reports', ar: 'بلاغات المفقودات', en: 'Lost reports', group: 'lost', table: 'lost_reports', dated: true },
  { id: 'stations', ar: 'المحطات', en: 'Stations', group: 'sys', table: 'stations' },
  { id: 'magazine', ar: 'منشورات Event', en: 'Event posts', group: 'sys', table: 'magazine_posts', dated: true },
  { id: 'audit', ar: 'سجل النشاط', en: 'Activity log', group: 'sys', table: 'audit_log', dated: true },
]

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
const pad = n => String(n).padStart(2, '0')
export const riyadhText = s => { const d = new Date(new Date(s).getTime() + 3 * 3600 * 1000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }

export async function loadHubSet(id, days) {
  const iso = x => x.toISOString().slice(0, 10)
  const now = Date.now()
  const { data, error } = await supabase.rpc('excel_feed_admin', { p_dataset: id, p_from: iso(new Date(now - days * 86400000)), p_to: iso(new Date(now + 31 * 86400000)) })
  if (error) throw new Error(/not allowed/i.test(error.message) ? 'ليس لديك صلاحية' : /does not exist|not find|schema cache/i.test(error.message) ? 'SETUP' : error.message)
  return Array.isArray(data) ? data : []
}

// أعمدة القسم من عيّنة الصفوف: النوع يحدد المحاذاة والتنسيق والفرز والتصفية
export function inferCols(rows) {
  const keys = [...new Set(rows.slice(0, 300).flatMap(r => Object.keys(r)))]
  const cols = keys.map(key => {
    const sample = rows.find(r => r[key] !== null && r[key] !== undefined)?.[key]
    let type = 'text'
    if (typeof sample === 'number') type = 'num'
    else if (typeof sample === 'boolean') type = 'bool'
    else if (typeof sample === 'string') type = TS.test(sample) ? 'stamp' : DATE.test(sample) ? 'date' : UUID.test(sample) ? 'id' : 'text'
    const label = colLabel(key)
    const lens = rows.slice(0, 80).map(r => String(r[key] ?? '').length)
    const textW = Math.min(Math.max(label.length * 9 + 34, Math.max(0, ...lens) * 8 + 24), 320)
    const width = { num: Math.max(96, label.length * 9 + 34), date: 112, stamp: 150, bool: 86, id: 120 }[type] ?? Math.max(110, textW)
    return { key, label, type, width, hidden: type === 'id' || key === 'id' }
  })
  // الأعمدة المهمة أولاً: التاريخ ثم المحطة ثم الباقي، والمعرّفات في النهاية
  const rank = c => (c.hidden ? 9 : /date$|^date$/.test(c.key) ? 0 : /station_name|^name_|full_name/.test(c.key) ? 1 : 2)
  return cols.map((c, i) => ({ ...c, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i)
}

export function display(col, v) {
  if (v === null || v === undefined || v === '') return ''
  if (col.type === 'num') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (col.type === 'bool') return v ? 'نعم' : 'لا'
  if (col.type === 'stamp') return riyadhText(v)
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
      if (c.type === 'bool') return v ? 'نعم' : 'لا'
      if (c.type === 'stamp') return riyadhText(v)
      if (c.type === 'date') return new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)))
      if (typeof v === 'object') return JSON.stringify(v)
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

// نموذج «ملخص المحطات» في مركز التقارير: أعمدة قابلة للاختيار، سطر لكل محطة، وإجمالي — يُستخدم في الصفحة والطباعة وExcel بنفس الأرقام.
// قواعد ثابتة: الوصول والمغادرة منفصلان دائماً (ركاب والتزام وإدخال)، ولا يوجد مفهوم «رحلة ملغاة»، والورديات المتوقفة تُستبعد قبل وصول البيانات هنا.
import { complianceStats } from './reportStats'

// المجموعات والمقاييس. kind: num | pct | money | text. needs: القسم (صلاحية) الذي يتبعه المقياس.
export const METRIC_GROUPS = [
  { id: 'trips', ar: 'الرحلات والركاب', en: 'Trips & passengers' },
  { id: 'entry', ar: 'الإدخال', en: 'Entry' },
  { id: 'punct', ar: 'الالتزام بالمواعيد', en: 'Punctuality' },
  { id: 'ops', ar: 'التشغيل', en: 'Operations' },
  { id: 'money', ar: 'الإيرادات', en: 'Revenue' },
]

export const METRICS = [
  { id: 'shifts', group: 'ops', kind: 'text', ar: 'الورديات الفعلية', en: 'Active shifts', needs: null, def: true },
  { id: 'arrTrips', group: 'trips', kind: 'num', ar: 'رحلات الوصول', en: 'Arrival trips', needs: 'trips', def: true },
  { id: 'arrPax', group: 'trips', kind: 'num', ar: 'ركاب الوصول', en: 'Arrival pax', needs: 'trips', def: true },
  { id: 'depTrips', group: 'trips', kind: 'num', ar: 'رحلات المغادرة', en: 'Departure trips', needs: 'trips', def: true },
  { id: 'depPax', group: 'trips', kind: 'num', ar: 'ركاب المغادرة', en: 'Departure pax', needs: 'trips', def: true },
  { id: 'entry', group: 'entry', kind: 'pct', ar: 'نسبة الإدخال (الكل)', en: 'Entry % (all)', needs: 'trips', def: true },
  { id: 'entryArr', group: 'entry', kind: 'pct', ar: 'إدخال الوصول', en: 'Arrival entry %', needs: 'trips', def: false },
  { id: 'entryDep', group: 'entry', kind: 'pct', ar: 'إدخال المغادرة', en: 'Departure entry %', needs: 'trips', def: false },
  { id: 'punctArr', group: 'punct', kind: 'pct', ar: 'التزام الوصول', en: 'Arrival on-time %', needs: 'trips', def: false },
  { id: 'punctDep', group: 'punct', kind: 'pct', ar: 'التزام المغادرة', en: 'Departure on-time %', needs: 'trips', def: false },
  { id: 'missed', group: 'ops', kind: 'num', ar: 'المتخلفون', en: 'Missed', needs: 'missed', def: true },
  { id: 'faulty', group: 'ops', kind: 'num', ar: 'تجهيزات معطّلة', en: 'Faulty facilities', needs: 'facilities', def: true },
  { id: 'revenue', group: 'money', kind: 'money', ar: 'الإيراد', en: 'Revenue', needs: 'sales', def: true },
  { id: 'diff', group: 'money', kind: 'money', ar: 'الفرق (زيادة/عجز)', en: 'Difference', needs: 'sales', def: true },
  { id: 'confirmed', group: 'money', kind: 'pct', ar: 'القيود المؤكدة', en: 'Confirmed entries %', needs: 'sales', def: false },
]

// مجموعات جاهزة للاختيار السريع
export const PRESETS = [
  { id: 'simple', ar: 'مبسّط', en: 'Simple', ids: METRICS.filter(m => m.def).map(m => m.id) },
  { id: 'entry', ar: 'الإدخال فقط', en: 'Entry only', ids: ['shifts', 'arrTrips', 'depTrips', 'entry', 'entryArr', 'entryDep'] },
  { id: 'full', ar: 'شامل', en: 'Full', ids: METRICS.map(m => m.id) },
]

export const DEFAULT_METRICS = PRESETS[0].ids

// المقاييس المتاحة حسب الأقسام المسموحة للمستخدم (allowed: دالة id → bool)
export function availableMetrics(allowed) {
  const ok = n => n === null || (n === 'trips' ? (allowed('movements') || allowed('compliance') || allowed('transport')) : allowed(n))
  return METRICS.filter(m => ok(m.needs))
}

const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null)

// data: ناتج runReport (movements, sales.byStation, facilities, shiftCount…). ids: المقاييس المختارة بالترتيب الثابت.
export function buildSummary(data, ids) {
  const rows = new Map()
  const row = (id, name) => { if (!rows.has(id)) rows.set(id, { id, name, arr: [], dep: [] }); return rows.get(id) }
  data.movements.forEach(m => { const o = row(m.station_id, m.station); (m.type === 'arrival' ? o.arr : o.dep).push(m) })
  const sBy = data.sales.byStation || {}
  Object.entries(sBy).forEach(([id, v]) => row(id, v.name))
  const facBy = {}; data.facilities.forEach(f => { facBy[f.station] = (facBy[f.station] || 0) + 1 })
  const ent = l => l.filter(m => !m.unentered)
  const pax = l => ent(l).reduce((a, m) => a + (m.pax || 0), 0)
  const miss = l => ent(l).reduce((a, m) => a + (m.missed || 0), 0)
  const calc = (o, fac, sales, sc) => {
    const a = ent(o.arr), d = ent(o.dep)
    return {
      shifts: sc ? { act: sc.act, n: sc.n } : null,
      arrTrips: a.length, arrPax: pax(o.arr), depTrips: d.length, depPax: pax(o.dep),
      entry: pctOf(a.length + d.length, o.arr.length + o.dep.length),
      entryArr: pctOf(a.length, o.arr.length), entryDep: pctOf(d.length, o.dep.length),
      punctArr: complianceStats(o.arr).rate, punctDep: complianceStats(o.dep).rate,
      missed: miss(o.arr) + miss(o.dep), faulty: fac || 0,
      revenue: sales ? sales.revenue : null, diff: sales ? sales.diff : null,
      confirmed: sales && sales.n ? pctOf(sales.conf || 0, sales.n) : null,
    }
  }
  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    .map(o => ({ id: o.id, name: o.name, v: calc(o, facBy[o.name], sBy[o.id], (data.shiftCount || {})[o.id]) }))
    .filter(r => r.v.arrTrips || r.v.depTrips || r.v.entry != null || r.v.revenue != null || r.v.faulty || r.v.missed)
  // الإجمالي: يُحسب من كل الحركات (لا من متوسط النسب)
  const all = { id: '_all', arr: data.movements.filter(m => m.type === 'arrival'), dep: data.movements.filter(m => m.type === 'departure') }
  const tSales = { revenue: data.sales.totalRevenue, diff: data.sales.totalSurplus, n: data.sales.total, conf: data.sales.confirmed }
  const totals = calc(all, data.facilities.length, tSales, null)
  totals.shifts = null
  const cols = METRICS.filter(m => ids.includes(m.id))
  return { cols, rows: list, totals, stationCount: list.length }
}

export const rateTone = r => (r == null ? '#9ca3af' : r >= 80 ? '#16a34a' : r >= 60 ? '#d97706' : '#dc2626')

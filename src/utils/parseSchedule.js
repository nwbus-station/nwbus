import * as XLSX from 'xlsx'
import { safeImport } from '../lib/chunkReload'

/**
 * قارئ ملف جدول الرحلات (TRIP SCHEDULES .xlsx).
 *
 * يتوقع ورقتين:
 *   1) "SCHEDULE"                  — الرحلات (صف لكل رحلة)، البيانات تبدأ من الصف 8
 *   2) "Intermediate stops schedule" — محطات العبور (صف لكل محطة)، عناوين بالصف 1
 *
 * يُرجع: { period, trips[], stops[], stations[], warnings[] }
 */

// تحويل قيمة الوقت إلى "HH:MM"
function fmtTime(v) {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'string') {
    // قد تأتي "23:30" أو "23:30:00"
    const m = v.match(/^(\d{1,2}):(\d{2})/)
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : v.trim()
  }
  if (v instanceof Date) {
    return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`
  }
  if (typeof v === 'number') {
    // كسر يوم Excel → دقائق
    const totalMin = Math.round(v * 24 * 60) % (24 * 60)
    const h = Math.floor(totalMin / 60), mm = totalMin % 60
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  return String(v)
}

const clean = v => (v === null || v === undefined) ? '' : String(v).trim()

// استخراج نوع الحافلة من عمود "--> WHEELCHAIR BUS" إلخ
function busTypeOf(v) {
  const s = clean(v).toUpperCase()
  if (s.includes('VIP')) return 'VIP'
  if (s.includes('WHEELCHAIR')) return 'WHEELCHAIR'
  if (s.includes('QAID')) return 'QAID'
  if (s.includes('STANDARD')) return 'STANDARD'
  return ''
}

// توحيد اسم المحطة: إزالة لاحقة الاتجاه " - A" (ذهاب) / " - B" (عودة) فهي نفس المحطة
const normStation = v => clean(v).replace(/\s*-\s*[ABab]\s*$/, '').trim()

export function parseSchedule(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { cellDates: true })
  const warnings = []

  const shSchedule = wb.Sheets['SCHEDULE']
  const shStops = wb.Sheets['Intermediate stops schedule']
  if (!shSchedule) throw new Error('ورقة "SCHEDULE" غير موجودة في الملف')

  const schedRows = XLSX.utils.sheet_to_json(shSchedule, { header: 1, raw: false, defval: '' })

  // فترة الصلاحية من الصف الأول إن وُجدت
  let period = ''
  for (let i = 0; i < 6 && i < schedRows.length; i++) {
    const joined = (schedRows[i] || []).join(' ')
    const m = joined.match(/valid for period[:\s]*([^\n]+)/i)
    if (m) { period = m[1].trim(); break }
  }

  // الرحلات — البيانات تبدأ من الفهرس 7 (الصف 8)
  const trips = []
  for (let i = 7; i < schedRows.length; i++) {
    const r = schedRows[i] || []
    const code = clean(r[2])
    if (!code) continue
    trips.push({
      order:        clean(r[0]),
      route:        clean(r[1]),
      code,                                   // مفتاح فريد (NW15-O-1)
      dispatchInfo: clean(r[5]),
      dispatchTime: fmtTime(r[6]),
      startStation: normStation(r[7]),
      startTime:    fmtTime(r[8]),
      endStation:   normStation(r[9]),
      endTime:      fmtTime(r[10]),
      busType:      busTypeOf(r[11]) || 'WHEELCHAIR',   // الافتراضي لأسطول الشركة
    })
  }

  // محطات العبور
  const stops = []
  if (shStops) {
    const stopRows = XLSX.utils.sheet_to_json(shStops, { header: 1, raw: false, defval: '' })
    const order = {}  // ترتيب المحطة داخل كل رحلة
    for (let i = 1; i < stopRows.length; i++) {
      const r = stopRows[i] || []
      const code = clean(r[5])
      const station = normStation(r[3])
      if (!code || !station) continue
      order[code] = (order[code] ?? 0) + 1
      stops.push({
        route:     clean(r[0]),
        code,
        arrival:   fmtTime(r[1]),
        departure: fmtTime(r[2]),
        station,
        status:    clean(r[4]).toUpperCase(),   // ACTIVE / REST
        stopOrder: order[code],
      })
    }
  } else {
    warnings.push('ورقة محطات العبور غير موجودة — سيُكتفى بمحطات الانطلاق/الوصول')
  }

  // المحطات الرئيسية = نقاط الانطلاق والوصول (تستبعد الاستراحات)
  const mainSet = new Set()
  trips.forEach(t => { if (t.startStation) mainSet.add(t.startStation); if (t.endStation) mainSet.add(t.endStation) })
  const stations = [...mainSet].sort()

  if (trips.length === 0) warnings.push('لم يتم العثور على أي رحلات في الملف')

  return { period, trips, stops, stations, warnings }
}

/**
 * أنواع الحافلات من ألوان ورقة SCHEDULE: الجدول يحمل دليل ألوان بأعلى الورقة
 * ("--> VIP BUS" / "WHEELCHAIR BUS" / "STANDARD BUS" / "QAID BUS" وبجانب كل واحد خلية بلونه)
 * وكل رحلة مظلّلة بلون نوعها. بدون تظليل = النوع الذي دليله بلا لون (STANDARD).
 * exceljs وحدها تقرأ الألوان (xlsx لا تقرأ التنسيق) — تُحمَّل عند الحاجة فقط.
 * يُرجع: { byCode: Map(code → نوع), counts: {نوع: عدد}, legend: {لون: نوع} } أو null لو ما لقينا دليلاً.
 */
export async function readBusTypesByColor(arrayBuffer) {
  const mod = await safeImport(() => import('exceljs'))
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(arrayBuffer)
  const ws = wb.getWorksheet('SCHEDULE')
  if (!ws) return null

  const keyOf = cell => {
    const f = cell?.fill
    if (!f || f.type !== 'pattern' || f.pattern === 'none') return 'none'
    const fg = f.fgColor || {}
    if (fg.argb) { const a = String(fg.argb).toUpperCase(); return a === 'FFFFFFFF' || a === '00FFFFFF' ? 'none' : a }
    if (fg.theme != null) return `t${fg.theme}/${(fg.tint || 0).toFixed(2)}`
    if (fg.indexed != null) return `i${fg.indexed}`
    return 'none'
  }

  // 1) دليل الألوان من الصفوف الأولى
  const legend = {}
  for (let r = 1; r <= 7; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      const txt = String(ws.getCell(r, c).value?.result ?? ws.getCell(r, c).value ?? '').toUpperCase()
      const m = txt.match(/(VIP|WHEELCHAIR|STANDARD|QAID)\s*BUS/)
      if (!m) continue
      // لون الخلية على يسار/قبل النص بنفس الصف (أقرب خلية ملوّنة، وإلا بلا لون)
      let key = 'none'
      for (let k = c - 1; k >= 1; k--) { const kk = keyOf(ws.getCell(r, k)); if (kk !== 'none') { key = kk; break } }
      if (!(key in legend)) legend[key] = m[1]
    }
  }
  if (!Object.keys(legend).length) return null

  // 2) لون كل رحلة (خلية رمز الرحلة، وإلا خلية محطة الانطلاق)
  const byCode = new Map(), counts = {}
  for (let r = 8; r <= ws.rowCount; r++) {
    const code = String(ws.getCell(r, 3).value?.result ?? ws.getCell(r, 3).value ?? '').trim()
    if (!code) continue
    let type = legend[keyOf(ws.getCell(r, 3))] ?? legend[keyOf(ws.getCell(r, 8))]
    if (!type) continue
    byCode.set(code, type)
    counts[type] = (counts[type] || 0) + 1
  }
  return { byCode, counts, legend }
}

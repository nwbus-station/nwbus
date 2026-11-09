// ملف Excel الشامل: كل أقسام النظام (مبيعات، ترحيل، إجازات، تقييمات…) تبويبات في ملف واحد، بزر واحد.
// يستعمل نفس دالة البيانات excel_feed بمفتاح مؤقت يُنشأ ويُلغى تلقائياً (لا يراه المستخدم ولا يُحفظ في أي ملف).
import { createBook, XL } from './excelExport'
import { supabase } from '../lib/supabase'
import { FEED_DATASETS } from './excelFeedCode'

export const COL_AR = {
  id: 'المعرّف', sale_date: 'التاريخ', record_date: 'التاريخ', shift: 'الوردية', station_name: 'المحطة', station_id: 'معرّف المحطة',
  cash_amount: 'نقداً', mada_amount: 'مدى', visa_amount: 'Visa', mastercard_amount: 'Mastercard', other_amount: 'أخرى', other_type: 'نوع «أخرى»',
  total_actual: 'إجمالي المحصَّل', total_expected: 'إجمالي المبيعات', surplus_deficit: 'الفرق', is_confirmed: 'مؤكَّد', confirmed_by_name: 'أكّده', confirmed_at: 'وقت التأكيد',
  accountant_notes: 'ملاحظات المحاسب', employee_name: 'الموظف', created_by_name: 'أنشأه', created_by_job: 'الرقم الوظيفي', created_by_name_x: 'أنشأه', balance_ref: 'رقم الموازنة', mada_network_ref: 'مرجع مدى',
  trip_number: 'رقم الرحلة', scheduled_departure: 'موعد المغادرة', from_station: 'من', to_station: 'إلى', bus_number: 'الحافلة', passenger_count: 'الركاب', missed_count: 'المتخلفون',
  actual_departure: 'المغادرة الفعلية', actual_arrival: 'الوصول الفعلي', departure_accuracy: 'الالتزام بالموعد', operational_status: 'الحالة التشغيلية', notes: 'ملاحظات', is_arrival: 'وصول؟', is_cancelled: 'ملغاة؟', is_extra_trip: 'إضافية؟',
  full_name_ar: 'الاسم', full_name_en: 'الاسم (EN)', job_number: 'الرقم الوظيفي', role: 'الدور', is_active: 'فعّال', created_at: 'تاريخ الإنشاء', updated_at: 'آخر تعديل',
  name_ar: 'الاسم', name_en: 'الاسم (EN)', employee_id_name: 'الموظف', user_id_name: 'الموظف', status: 'الحالة', start_date: 'من', end_date: 'إلى',
}
const AR = COL_AR
export const colLabel = k => AR[k] || k.replace(/_/g, ' ')
const label = colLabel
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const pad = n => String(n).padStart(2, '0')
const riyadh = s => { const d = new Date(new Date(s).getTime() + 3 * 3600 * 1000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
const cellOf = v => {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا'
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string') { if (TS.test(v)) return riyadh(v); if (DATE.test(v)) return new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10))) }
  return v
}

export const MASTER_DATASETS = FEED_DATASETS.filter(d => d.id !== 'audit')

export async function exportMasterWorkbook({ isAr = true, days = 90, ids, onProgress }) {
  const chosen = MASTER_DATASETS.filter(d => ids.includes(d.id))
  if (!chosen.length) throw new Error(isAr ? 'اختر قسماً واحداً على الأقل' : 'Pick at least one section')
  onProgress?.(isAr ? 'تجهيز الاتصال…' : 'Preparing…')
  const { data: k, error: ke } = await supabase.rpc('create_excel_key', { p_label: 'تصدير شامل (مؤقت)', p_days: 1 })
  if (ke || !k?.token) throw new Error(ke?.message?.includes('not allowed') ? (isAr ? 'هذه الميزة للأدمن العام فقط' : 'General admin only') : (isAr ? 'لم يُجهَّز الاتصال: شغّل ملف SQL الخاص بـ Excel في Supabase' : 'Not set up: run the Excel SQL in Supabase'))
  const token = k.token
  try {
    const iso = x => x.toISOString().slice(0, 10)
    const now = Date.now()
    const p_from = iso(new Date(now - days * 86400000)), p_to = iso(new Date(now + 31 * 86400000))
    const results = []
    for (let i = 0; i < chosen.length; i++) {
      const d = chosen[i]
      onProgress?.(`${isAr ? 'جلب' : 'Loading'} ${isAr ? d.ar : d.en} (${i + 1}/${chosen.length})`)
      const { data, error } = await supabase.rpc('excel_feed', { p_token: token, p_dataset: d.id, p_from, p_to })
      results.push({ d, rows: Array.isArray(data) ? data : [], error: error?.message || '' })
    }
    onProgress?.(isAr ? 'بناء الملف…' : 'Building the file…')
    const book = await createBook({ isAr })
    const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
    const sub = `${isAr ? 'الفترة' : 'Period'}: ${p_from} → ${iso(new Date(now))}   ·   ${isAr ? 'تاريخ الإصدار' : 'Generated'}: ${stamp}`

    // الفهرس أولاً
    const names = new Set()
    const nameOf = d => { let n = (isAr ? d.ar : d.en).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28), i = 2; const base = n; while (names.has(n)) n = `${base} ${i++}`; names.add(n); return n }
    const tabs = results.map(r => ({ ...r, tab: nameOf(r.d) }))
    const IX = book.sheet(isAr ? 'الفهرس' : 'Index', [34, 14, 50], { tab: XL.orange })
    IX.header({ title: isAr ? 'ملف النظام الشامل' : 'System master workbook', subtitle: sub })
    IX.note(isAr ? 'كل قسم في تبويب مستقل بفلاتر وأعمدة مرتّبة. الأوقات بتوقيت الرياض. اضغط اسم القسم للانتقال إليه.' : 'Each section is its own tab with filters. Times are Riyadh time. Click a name to jump to it.')
    const ixTable = IX.table({
      columns: [{ header: isAr ? 'القسم' : 'Section', bold: true }, { header: isAr ? 'عدد الصفوف' : 'Rows', fmt: '#,##0' }, { header: isAr ? 'ملاحظة' : 'Note' }],
      rows: tabs.map(t => [t.tab, t.rows.length, t.error ? (isAr ? `تعذّر: ${t.error}` : `Failed: ${t.error}`) : (t.rows.length ? '' : (isAr ? 'لا توجد بيانات في الفترة' : 'No data in the period'))]),
    })
    tabs.forEach((t, i) => { const c = IX.ws.getCell(ixTable.first + i, 1); c.value = { text: t.tab, hyperlink: `#'${t.tab}'!A1` }; c.font = { size: 11, bold: true, underline: true, color: { argb: 'FF1D4ED8' } } })
    IX.finish({ landscape: false })

    // تبويب لكل قسم (كتابة خفيفة وسريعة: بدون تنسيق لكل خلية)
    for (const t of tabs) {
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
      const isUuidCol = c => { const v = t.rows.find(r => r[c] !== null && r[c] !== undefined)?.[c]; return typeof v === 'string' && UUID.test(v) }
      const cols = [...new Set(t.rows.slice(0, 300).flatMap(r => Object.keys(r)))].filter(c => c !== 'id' && !c.endsWith('_id') && !isUuidCol(c))   // نخفي المعرّفات التقنية
      const widths = cols.length ? cols.map(c => { const sample = t.rows.slice(0, 60).map(r => String(r[c] ?? '').length); return Math.min(Math.max(10, label(c).length + 2, ...sample.map(n => n + 2)), 42) }) : [20]
      const S = book.sheet(t.tab, widths, { tab: XL.navy })
      S.header({ title: isAr ? t.d.ar : t.d.en, subtitle: `${sub}   ·   ${isAr ? 'الصفوف' : 'Rows'}: ${t.rows.length}` })
      const ws = S.ws
      if (!cols.length) { S.note(t.error ? (isAr ? `تعذّر جلب هذا القسم: ${t.error}` : `Could not load: ${t.error}`) : (isAr ? 'لا توجد بيانات في هذه الفترة.' : 'No data in this period.')); S.finish({ landscape: true }); continue }
      const hr = ws.addRow(cols.map(label))
      hr.height = 28
      hr.eachCell(c => {
        c.font = { bold: true, size: 10, color: { argb: XL.white } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.navy } }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        c.border = { bottom: { style: 'medium', color: { argb: XL.orange } } }
      })
      const hrow = hr.number
      for (const r of t.rows) ws.addRow(cols.map(c => cellOf(r[c])))
      cols.forEach((c, j) => {
        const sample = t.rows.find(r => r[c] !== null && r[c] !== undefined)?.[c]
        const col = ws.getColumn(j + 1)
        if (typeof sample === 'number') col.numFmt = Number.isInteger(sample) ? '#,##0' : '#,##0.00'
        else if (typeof sample === 'string' && DATE.test(sample)) col.numFmt = 'yyyy-mm-dd'
      })
      ws.autoFilter = { from: { row: hrow, column: 1 }, to: { row: hrow, column: cols.length } }
      ws.views = [{ rightToLeft: isAr, showGridLines: true, state: 'frozen', ySplit: hrow }]
      ws.pageSetup = { ...ws.pageSetup, paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${hrow}:${hrow}` }
    }
    await book.save(`NW-Station-${isAr ? 'كل-الأقسام' : 'all-sections'}_${iso(new Date(now))}`)
    return { sections: tabs.length, rows: tabs.reduce((a, t) => a + t.rows.length, 0), failed: tabs.filter(t => t.error).map(t => t.tab) }
  } finally {
    // إلغاء المفتاح المؤقت فوراً
    try {
      const { data: keys } = await supabase.rpc('list_excel_keys')
      const mine = (keys ?? []).find(x => x.token_hint === token.slice(-4) && !x.revoked_at)
      if (mine) await supabase.rpc('revoke_excel_key', { p_id: mine.id })
    } catch { /* ينتهي تلقائياً خلال يوم */ }
  }
}

// الجدول اليومي للإيرادات (Excel) — بأسلوب محاسبي: قيود مفصّلة + تسوية الورديات + توزيع طرق الدفع + توقيعات الاعتماد.
// كل الإجماليات صيغ حيّة مرتبطة بورقة «القيود»، فأي تعديل يدوي في القيود ينعكس تلقائياً على الملخص.
import { createBook, XL, colLetter } from './excelExport'

const n0 = n => Math.round(Number(n) || 0)
const ACC_FMT = '#,##0;[Red]-#,##0;"–"'          // محاسبي: السالب أحمر، الصفر شرطة
const DIFF_FMT = '+#,##0;[Red]-#,##0;"–"'
const SHIFT_LABEL = { A: ['أ', 'A'], B: ['ب', 'B'], C: ['ج', 'C'] }
const SHIFT_RANGE = { A: '00:00 – 08:00', B: '08:00 – 16:00', C: '16:00 – 24:00' }
const WD_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function parseRefs(raw) {
  if (!raw) return { cashier: '', budget: '' }
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return { cashier: String(arr[0] ?? ''), budget: arr.slice(1).filter(Boolean).join('، ') }
  } catch { /* نص عادي */ }
  return { cashier: String(raw), budget: '' }
}

const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000) + 1

/**
 * records: صفوف sales_records (مع station و created_by_user.job_number)
 * from/to: 'YYYY-MM-DD' (يوم واحد أو فترة) · scopeText: وصف النطاق · preparedBy: اسم من يُصدر الملف
 */
export async function exportDailySalesExcel({ isAr, records, from, to, scopeText, preparedBy }) {
  const T = (a, e) => (isAr ? a : e)
  const book = await createBook({ isAr })
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const span = daysBetween(from, to), single = from === to
  const wd = (isAr ? WD_AR : WD_EN)[new Date(from + 'T00:00:00Z').getUTCDay()]
  const subtitle = single
    ? `${T('التاريخ', 'Date')}: ${wd} ${from}   ·   ${T('النطاق', 'Scope')}: ${scopeText}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`
    : `${T('الفترة', 'Period')}: ${from} → ${to} (${span} ${T('يوماً', 'days')})   ·   ${T('النطاق', 'Scope')}: ${scopeText}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`

  const SUM = T('الملخص اليومي', 'Daily summary'), ENT = T('القيود', 'Entries')
  const Q = `'${ENT}'`

  // ── صفوف القيود ─────────────────────────────────────────
  const stName = r => (isAr ? (r.station?.name_ar || r.station?.name_en) : (r.station?.name_en || r.station?.name_ar)) || '—'
  const sh = r => (SHIFT_LABEL[r.shift]?.[isAr ? 0 : 1] ?? r.shift ?? '—')
  const sorted = [...records].sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date)) || String(a.shift).localeCompare(String(b.shift)) || stName(a).localeCompare(stName(b)) || String(a.employee_name || a.created_by_name || '').localeCompare(String(b.employee_name || b.created_by_name || '')))
  const rows = sorted.map(r => {
    const cash = n0(r.cash_amount), mada = n0(r.mada_amount), visa = n0(r.visa_amount), mc = n0(r.mastercard_amount), other = n0(r.other_amount)
    const collected = cash + mada + visa + mc + other, expected = n0(r.total_expected)
    const refs = parseRefs(r.balance_ref)
    return {
      date: String(r.sale_date || '').slice(0, 10), shift: sh(r), station: stName(r), emp: r.employee_name || r.created_by_name || '—', job: r.created_by_user?.job_number ?? '',
      cashier: refs.cashier, budget: refs.budget, cash, mada, visa, mc, other, otherType: r.other_type || '', collected, expected, diff: collected - expected,
      confirmed: !!r.is_confirmed, by: r.confirmed_by_name || '', notes: String(r.accountant_notes || '').replace(/\n?\[عجز[^\]]*\]/g, '').trim(),
      acked: String(r.accountant_notes || '').includes('تم إقرار العجز'), raw: r,
    }
  })
  const tot = rows.reduce((a, r) => ({ cash: a.cash + r.cash, mada: a.mada + r.mada, visa: a.visa + r.visa, mc: a.mc + r.mc, other: a.other + r.other, collected: a.collected + r.collected, expected: a.expected + r.expected }),
    { cash: 0, mada: 0, visa: 0, mc: 0, other: 0, collected: 0, expected: 0 })
  const netDiff = tot.collected - tot.expected

  // ═════════ ورقة القيود (أولاً في البناء لنعرف نطاقاتها، لكنها تُرتَّب ثانياً) ═════════
  const S = book.sheet(SUM, Array(12).fill(13), { tab: XL.orange })
  const E = book.sheet(ENT, [5, 12, 8, 24, 26, 12, 13, 16, 12, 12, 12, 12, 12, 13, 14, 14, 13, 14, 20, 34], { tab: XL.navy })
  // حروف أعمدة القيود (ثابتة المكان)
  const C = { n: 'A', date: 'B', shift: 'C', station: 'D', emp: 'E', job: 'F', cashier: 'G', budget: 'H', cash: 'I', mada: 'J', visa: 'K', mc: 'L', other: 'M', otherType: 'N', collected: 'O', expected: 'P', diff: 'Q', status: 'R', by: 'S', notes: 'T' }

  E.header({ title: single ? T('قيود الإيرادات اليومية', 'Daily revenue entries') : T('قيود الإيرادات — الفترة', 'Revenue entries — period'), subtitle })
  const cols = [
    { header: '#', fmt: '0' }, { header: T('التاريخ', 'Date'), bold: true }, { header: T('الوردية', 'Shift'), align: 'center' }, { header: T('المحطة', 'Station'), bold: true }, { header: T('الموظف', 'Employee') },
    { header: T('الرقم الوظيفي', 'Job no.') }, { header: T('رقم الصرافة', 'Cashier no.') }, { header: T('رقم الموازنة', 'Budget ref.'), wrap: true },
    { header: T('نقداً', 'Cash'), fmt: ACC_FMT }, { header: T('مدى', 'Mada'), fmt: ACC_FMT }, { header: 'Visa', fmt: ACC_FMT }, { header: 'Mastercard', fmt: ACC_FMT }, { header: T('أخرى', 'Other'), fmt: ACC_FMT },
    { header: T('نوع «أخرى»', 'Other type') },
    { header: T('إجمالي المحصَّل', 'Collected'), fmt: ACC_FMT, bold: true },
    { header: T('إجمالي المبيعات', 'Sales total'), fmt: ACC_FMT, bold: true },
    { header: T('الفرق', 'Difference'), fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : v > 0 ? 'FF1D4ED8' : XL.green) },
    { header: T('الحالة', 'Status'), color: v => (v === T('مؤكَّد', 'Confirmed') ? XL.green : XL.amber), align: 'center' },
    { header: T('أكّده', 'Confirmed by') }, { header: T('ملاحظات المحاسب', 'Accountant notes'), wrap: true },
  ]
  const hdrRow = E.r  // صف الترويسة القادم
  const first = hdrRow + 1, last = hdrRow + rows.length
  const L = i => colLetter(i + 1)
  const eRows = rows.map((r, i) => {
    const rr = first + i
    return [i + 1, r.date, r.shift, r.station, r.emp, r.job, r.cashier, r.budget, r.cash, r.mada, r.visa, r.mc, r.other, r.otherType,
      { formula: `SUM(${C.cash}${rr}:${C.other}${rr})`, result: r.collected }, r.expected, { formula: `${C.collected}${rr}-${C.expected}${rr}`, result: r.diff },
      r.confirmed ? T('مؤكَّد', 'Confirmed') : T('قيد المراجعة', 'Pending'), r.by, r.notes]
  })
  const tE = E.table({
    columns: cols, rows: eRows, filter: true, freeze: 5, printTitle: true,
    totals: rows.length ? [T('الإجمالي', 'Total'), '', '', '', '', '', '', '',
      ...[C.cash, C.mada, C.visa, C.mc, C.other].map((c, k) => ({ formula: `SUBTOTAL(109,${c}${first}:${c}${last})`, result: [tot.cash, tot.mada, tot.visa, tot.mc, tot.other][k] })), '',
      { formula: `SUBTOTAL(109,${C.collected}${first}:${C.collected}${last})`, result: tot.collected }, { formula: `SUBTOTAL(109,${C.expected}${first}:${C.expected}${last})`, result: tot.expected },
      { formula: `SUBTOTAL(109,${C.diff}${first}:${C.diff}${last})`, result: netDiff }, '', '', ''] : null,
  })
  if (rows.length) {
    E.scale(`${C.diff}${tE.first}:${C.diff}${tE.last}`, { min: -500, mid: 0, max: 500, colors: ['FFF8696B', 'FFFFFFFF', 'FF8DB4F2'] })
    E.bars(`${C.collected}${tE.first}:${C.collected}${tE.last}`, 'FFA9C4EB')
  }
  E.note(T('الإجمالي في الأسفل صيغة SUBTOTAL: يتغيّر مع الفلتر (اختر محطة/وردية من أسهم الترويسة فيُعاد حساب المجموع للمعروض فقط).', 'The total row uses SUBTOTAL: it recalculates for the filtered rows only.'), { color: XL.grey, size: 9 })
  E.finish({ landscape: true })

  const rng = c => `${Q}!$${c}$${first}:$${c}$${last}`   // c: حرف العمود من C

  // ═════════ الملخص ═════════
  S.header({ title: single ? T('التقرير اليومي للإيرادات', 'Daily revenue report') : T('تقرير الإيرادات — فترة', 'Revenue report — period'), subtitle })
  S.section(T('نظرة سريعة', 'At a glance'))
  S.spacer(0)
  const confirmedN = rows.filter(r => r.confirmed).length
  S.kpis([
    { label: T('إجمالي المبيعات (المتوقّع)', 'Total sales (expected)'), value: { formula: `SUM(${rng(C.expected)})`, result: tot.expected }, fmt: '#,##0', foot: T('ر.س', 'SAR') },
    { label: T('إجمالي المحصَّل', 'Total collected'), value: { formula: `SUM(${rng(C.collected)})`, result: tot.collected }, fmt: '#,##0', color: XL.green, foot: T('ر.س', 'SAR') },
    { label: T('الفرق الصافي', 'Net difference'), value: { formula: `SUM(${rng(C.diff)})`, result: netDiff }, fmt: '+#,##0;-#,##0;0', color: netDiff === 0 ? XL.green : netDiff < 0 ? XL.red : 'FF1D4ED8', foot: netDiff === 0 ? T('مطابق', 'Matched') : netDiff < 0 ? T('عجز', 'Deficit') : T('زيادة', 'Surplus') },
    { label: T('السجلات المؤكَّدة', 'Confirmed records'), value: `${confirmedN} / ${rows.length}`, color: confirmedN === rows.length && rows.length ? XL.green : XL.amber, foot: rows.length - confirmedN ? T(`${rows.length - confirmedN} قيد المراجعة`, `${rows.length - confirmedN} pending`) : T('كلها مؤكَّدة', 'all confirmed') },
  ], 3)

  // توزيع طرق الدفع
  S.section(T('توزيع المحصَّل حسب طريقة الدفع', 'Collected by payment method'))
  const methods = [[T('نقداً', 'Cash'), C.cash, tot.cash], [T('مدى', 'Mada'), C.mada, tot.mada], ['Visa', C.visa, tot.visa], ['Mastercard', C.mc, tot.mc], [T('أخرى', 'Other'), C.other, tot.other]]
  const m0 = S.r + 1
  const tM = S.table({
    columns: [{ header: T('طريقة الدفع', 'Method'), span: 4, bold: true }, { header: T('المبلغ (ر.س)', 'Amount (SAR)'), span: 3, fmt: ACC_FMT, bold: true }, { header: T('النسبة', 'Share'), span: 2, fmt: '0.0%' }, { header: T('عدد القيود', 'Entries'), span: 3, fmt: '0' }],
    rows: methods.map(([name, c, v], i) => [name, { formula: `SUM(${rng(c)})`, result: v }, { formula: `IFERROR(E${m0 + i}/SUM(E$${m0}:E$${m0 + methods.length - 1}),0)`, result: tot.collected ? v / tot.collected : 0 }, { formula: `COUNTIF(${rng(c)},">0")`, result: rows.filter(r => r[Object.keys(C).find(k => C[k] === c)] > 0).length }]),
    totals: [T('الإجمالي', 'Total'), { formula: `SUM(E${m0}:E${m0 + methods.length - 1})`, result: tot.collected }, { formula: `SUM(H${m0}:H${m0 + methods.length - 1})`, result: tot.collected ? 1 : 0 }, ''],
    zebra: false,
  })
  S.bars(`E${tM.first}:E${tM.last}`, 'FFA9C4EB')

  // حسب اليوم (للفترات فقط)
  if (!single) {
    const dayList = [...new Set(rows.map(r => r.date))].sort()
    S.section(T('حسب اليوم', 'By day'), T(`أيام فيها قيود: ${dayList.length} من ${span}`, `Days with entries: ${dayList.length} of ${span}`))
    const d0 = S.r + 1
    const dd = dayList.map(d => { const rs = rows.filter(r => r.date === d); return { d, n: rs.length, sales: rs.reduce((a, r) => a + r.expected, 0), coll: rs.reduce((a, r) => a + r.collected, 0), conf: rs.filter(r => r.confirmed).length } })
    const tD = S.table({
      columns: [{ header: T('التاريخ', 'Date'), span: 2, bold: true }, { header: T('القيود', 'Entries'), fmt: '0' }, { header: T('المبيعات', 'Sales'), span: 2, fmt: ACC_FMT }, { header: T('المحصَّل', 'Collected'), span: 2, fmt: ACC_FMT, bold: true },
        { header: T('الفرق', 'Difference'), fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : v > 0 ? 'FF1D4ED8' : XL.green) }, { header: T('المؤكَّد', 'Confirmed'), span: 2, fmt: '@', align: 'center' }],
      rows: dd.map((x, i) => { const r = d0 + i; return [x.d, { formula: `COUNTIF(${rng(C.date)},A${r})`, result: x.n }, { formula: `SUMIFS(${rng(C.expected)},${rng(C.date)},A${r})`, result: x.sales }, { formula: `SUMIFS(${rng(C.collected)},${rng(C.date)},A${r})`, result: x.coll }, { formula: `F${r}-D${r}`, result: x.coll - x.sales }, `${x.conf} / ${x.n}`] }),
      totals: [T('الإجمالي', 'Total'), { formula: `SUM(C${d0}:C${d0 + dd.length - 1})`, result: rows.length }, { formula: `SUM(D${d0}:D${d0 + dd.length - 1})`, result: tot.expected }, { formula: `SUM(F${d0}:F${d0 + dd.length - 1})`, result: tot.collected }, { formula: `SUM(H${d0}:H${d0 + dd.length - 1})`, result: netDiff }, `${confirmedN} / ${rows.length}`],
    })
    S.bars(`F${tD.first}:F${tD.last}`, 'FFA9C4EB')
  }

  // تسوية الورديات
  S.section(T('تسوية الورديات', 'Shift reconciliation'), T('لكل وردية: المبيعات المتوقعة مقابل المحصَّل الفعلي — الفرق يُلوَّن (أحمر عجز · أزرق زيادة)', 'Per shift: expected sales vs actual collection — difference is colored (red deficit · blue surplus)'))
  const shifts = ['A', 'B', 'C'].filter(k => rows.some(r => r.raw.shift === k)).concat([...new Set(rows.map(r => r.raw.shift))].filter(k => !['A', 'B', 'C'].includes(k)))
  const s0 = S.r + 1
  const shRow = k => {
    const rs = rows.filter(r => r.raw.shift === k), lab = SHIFT_LABEL[k]?.[isAr ? 0 : 1] ?? k
    const sales = rs.reduce((a, r) => a + r.expected, 0), coll = rs.reduce((a, r) => a + r.collected, 0)
    return { lab, rs, sales, coll }
  }
  const shiftData = shifts.map(shRow)
  const tS = S.table({
    columns: [{ header: T('الوردية', 'Shift'), span: 2, bold: true }, { header: T('الفترة', 'Hours'), span: 2 }, { header: T('القيود', 'Entries'), fmt: '0' },
      { header: T('المبيعات', 'Sales'), span: 2, fmt: ACC_FMT }, { header: T('المحصَّل', 'Collected'), span: 2, fmt: ACC_FMT, bold: true },
      { header: T('الفرق', 'Difference'), span: 1, fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : v > 0 ? 'FF1D4ED8' : XL.green) }, { header: T('الحالة', 'Status'), span: 2, color: v => (v === T('مطابق', 'Matched') ? XL.green : v === T('عجز', 'Deficit') ? XL.red : 'FF1D4ED8'), align: 'center' }],
    rows: shiftData.map((d, i) => {
      const r = s0 + i, key = shifts[i]
      return [T(`الوردية ${d.lab}`, `Shift ${d.lab}`), SHIFT_RANGE[key] ?? '', { formula: `COUNTIF(${rng(C.shift)},"${d.lab}")`, result: d.rs.length },
        { formula: `SUMIFS(${rng(C.expected)},${rng(C.shift)},"${d.lab}")`, result: d.sales }, { formula: `SUMIFS(${rng(C.collected)},${rng(C.shift)},"${d.lab}")`, result: d.coll },
        { formula: `H${r}-F${r}`, result: d.coll - d.sales }, { formula: `IF(J${r}=0,"${T('مطابق', 'Matched')}",IF(J${r}<0,"${T('عجز', 'Deficit')}","${T('زيادة', 'Surplus')}"))`, result: d.coll === d.sales ? T('مطابق', 'Matched') : d.coll < d.sales ? T('عجز', 'Deficit') : T('زيادة', 'Surplus') }]
    }),
    totals: [T('الإجمالي', 'Total'), '', { formula: `SUM(E${s0}:E${s0 + Math.max(shifts.length, 1) - 1})`, result: rows.length },
      { formula: `SUM(F${s0}:F${s0 + Math.max(shifts.length, 1) - 1})`, result: tot.expected }, { formula: `SUM(H${s0}:H${s0 + Math.max(shifts.length, 1) - 1})`, result: tot.collected },
      { formula: `SUM(J${s0}:J${s0 + Math.max(shifts.length, 1) - 1})`, result: netDiff }, ''],
    zebra: false,
  })
  if (!shifts.length) S.note(T('لا توجد قيود لهذا اليوم.', 'No entries for this day.'), { color: XL.grey })

  // حسب المحطة
  const stNames = [...new Set(rows.map(r => r.station))].sort((a, b) => a.localeCompare(b))
  if (stNames.length > 1) {
    S.section(T('حسب المحطة', 'By station'))
    const t0 = S.r + 1
    const sd = stNames.map(nm => { const rs = rows.filter(r => r.station === nm); return { nm, n: rs.length, sales: rs.reduce((a, r) => a + r.expected, 0), coll: rs.reduce((a, r) => a + r.collected, 0), conf: rs.filter(r => r.confirmed).length } })
      .sort((a, b) => b.coll - a.coll)
    const tT = S.table({
      columns: [{ header: T('المحطة', 'Station'), span: 3, bold: true }, { header: T('القيود', 'Entries'), fmt: '0' }, { header: T('المبيعات', 'Sales'), span: 2, fmt: ACC_FMT }, { header: T('المحصَّل', 'Collected'), span: 2, fmt: ACC_FMT, bold: true },
        { header: T('الفرق', 'Difference'), fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : v > 0 ? 'FF1D4ED8' : XL.green) }, { header: T('المؤكَّد', 'Confirmed'), span: 2, fmt: '@', align: 'center' }],
      rows: sd.map((d, i) => { const r = t0 + i; return [d.nm, { formula: `COUNTIF(${rng(C.station)},A${r})`, result: d.n }, { formula: `SUMIFS(${rng(C.expected)},${rng(C.station)},A${r})`, result: d.sales }, { formula: `SUMIFS(${rng(C.collected)},${rng(C.station)},A${r})`, result: d.coll }, { formula: `G${r}-E${r}`, result: d.coll - d.sales }, `${d.conf} / ${d.n}`] }),
      totals: [T('الإجمالي', 'Total'), { formula: `SUM(D${t0}:D${t0 + sd.length - 1})`, result: rows.length }, { formula: `SUM(E${t0}:E${t0 + sd.length - 1})`, result: tot.expected }, { formula: `SUM(G${t0}:G${t0 + sd.length - 1})`, result: tot.collected }, { formula: `SUM(I${t0}:I${t0 + sd.length - 1})`, result: netDiff }, `${confirmedN} / ${rows.length}`],
    })
    S.bars(`G${tT.first}:G${tT.last}`, 'FFA9C4EB')
  }

  // قيود تحتاج انتباه المحاسب
  const flagged = rows.filter(r => r.diff !== 0)
  S.section(T('قيود فيها فرق', 'Entries with a difference'), T('كل قيد محصَّله لا يساوي مبيعاته — لمراجعة المحاسب', 'Every entry whose collection differs from its sales — for the accountant’s review'))
  if (!flagged.length) S.note(T('✅ كل القيود مطابقة — لا فروق.', '✅ All entries match — no differences.'), { bold: true, color: XL.green })
  else {
    S.table({
      columns: [{ header: T('التاريخ', 'Date'), span: 2 }, { header: T('الوردية', 'Shift'), align: 'center' }, { header: T('المحطة', 'Station'), span: 3, bold: true }, { header: T('الموظف', 'Employee'), span: 3 },
        { header: T('الفرق', 'Difference'), fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : 'FF1D4ED8') }, { header: T('الإقرار', 'Acknowledgement'), span: 2, color: v => (v === T('أُقرّ على الموظف', 'Acknowledged') ? XL.green : XL.amber) }],
      rows: flagged.map(r => [r.date, r.shift, r.station, r.emp, r.diff, r.diff < 0 ? (r.acked ? T('أُقرّ على الموظف', 'Acknowledged') : (r.confirmed ? T('لم يُقرّ', 'Not acknowledged') : T('بانتظار المراجعة', 'Pending review'))) : T('زيادة — تُراجَع', 'Surplus — review')]),
    })
  }

  // الاعتماد والتوقيع
  S.section(T('الاعتماد والتوقيع', 'Review & sign-off'))
  const boxes = [T('أعدّه', 'Prepared by'), T('المحاسب', 'Accountant'), T('المراجع', 'Reviewer'), T('المدير المعتمِد', 'Approved by')]
  const ws = S.ws, r0 = S.r
  ws.getRow(r0).height = 20; ws.getRow(r0 + 1).height = 44; ws.getRow(r0 + 2).height = 18
  boxes.forEach((b, j) => {
    const c1 = 1 + j * 3, c2 = c1 + 2
    for (let k = 0; k < 3; k++) ws.mergeCells(r0 + k, c1, r0 + k, c2)
    const h = ws.getCell(r0, c1); h.value = b; h.font = { bold: true, size: 10, color: { argb: XL.white } }; h.alignment = { horizontal: 'center', vertical: 'middle' }
    const sgn = ws.getCell(r0 + 1, c1); sgn.value = j === 0 ? (preparedBy || '') : ''; sgn.font = { size: 10, italic: true, color: { argb: XL.grey } }; sgn.alignment = { horizontal: 'center', vertical: 'bottom' }
    const dt = ws.getCell(r0 + 2, c1); dt.value = T('التوقيع والتاريخ: ........................', 'Signature & date: ........................'); dt.font = { size: 8.5, color: { argb: XL.grey } }; dt.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r0, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.navy } }
      const side = { style: 'thin', color: { argb: XL.line } }
      ws.getCell(r0 + 1, c).border = { left: c === c1 ? side : undefined, right: c === c2 ? side : undefined }
      ws.getCell(r0 + 2, c).border = { bottom: side, left: c === c1 ? side : undefined, right: c === c2 ? side : undefined }
    }
  })
  S.r = r0 + 4

  S.bullets(isAr ? [
    'المحصَّل = نقداً + مدى + Visa + Mastercard + أخرى. الفرق = المحصَّل − المبيعات (سالب = عجز، موجب = زيادة).',
    'كل الأرقام في هذه الورقة صيغ مرتبطة بورقة «القيود»: عدّل أي مبلغ هناك فتتحدّث الأرقام هنا تلقائياً.',
    'القيد «قيد المراجعة» لم يؤكّده المحاسب بعد؛ المؤكَّد مقفول في النظام ولا يعدّله الموظف.',
  ] : [
    'Collected = cash + Mada + Visa + Mastercard + other. Difference = collected − sales (negative = deficit, positive = surplus).',
    'Every figure on this sheet is a live formula linked to the “Entries” sheet: edit an amount there and this sheet updates.',
    'A “Pending” entry has not been confirmed by the accountant yet; confirmed entries are locked in the system.',
  ])
  S.finish({ landscape: false })

  // ═════════ المحطات × الأيام (عند اختيار أكثر من محطة) — يبيّن أي محطة حقّقت كم في كل يوم ═════════
  const allDays = [...new Set(rows.map(r => r.date))].sort()
  const stList = [...new Set(rows.map(r => r.station))].sort((a, b) => a.localeCompare(b))
  if (stList.length > 1) {
    const matrixByDay = allDays.length > 1 && allDays.length <= 31
    const widths = matrixByDay ? [28, ...allDays.map(() => 12), 15] : [28, 10, 15, 15, 14]
    const M = book.sheet(T('حسب المحطة', 'By station'), widths, { tab: 'FF8B5CF6' })
    M.header({ title: T('المحصَّل حسب المحطة' + (matrixByDay ? ' واليوم' : ''), 'Collected by station' + (matrixByDay ? ' and day' : '')), subtitle })
    M.note(T('كل محطة بصف واحد، والأرقام صيغ حيّة من ورقة «القيود» (اضغط اسم المحطة في الفلتر هناك لرؤية قيودها).', 'One row per station; figures are live formulas from the “Entries” sheet.'), { color: XL.grey })
    const h0 = M.r + 1
    const statCol = {}
    const colsM = matrixByDay
      ? [{ header: T('المحطة', 'Station'), bold: true, color: () => XL.navy }, ...allDays.map(d => ({ header: d.slice(5), fmt: ACC_FMT })), { header: T('الإجمالي', 'Total'), fmt: ACC_FMT, bold: true }]
      : [{ header: T('المحطة', 'Station'), bold: true, color: () => XL.navy }, { header: T('القيود', 'Entries'), fmt: '0' }, { header: T('المبيعات', 'Sales'), fmt: ACC_FMT }, { header: T('المحصَّل', 'Collected'), fmt: ACC_FMT, bold: true }, { header: T('الفرق', 'Difference'), fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : v > 0 ? 'FF1D4ED8' : XL.green) }]
    const mRows = stList.map((nm, i) => {
      const r = h0 + i, rs = rows.filter(x => x.station === nm)
      if (matrixByDay) {
        const cells = allDays.map((d, j) => ({ formula: `SUMIFS(${rng(C.collected)},${rng(C.station)},$A${r},${rng(C.date)},"${d}")`, result: rs.filter(x => x.date === d).reduce((a, x) => a + x.collected, 0) }))
        return [nm, ...cells, { formula: `SUM(B${r}:${colLetter(allDays.length + 1)}${r})`, result: rs.reduce((a, x) => a + x.collected, 0) }]
      }
      const sales = rs.reduce((a, x) => a + x.expected, 0), coll = rs.reduce((a, x) => a + x.collected, 0)
      return [nm, { formula: `COUNTIF(${rng(C.station)},A${r})`, result: rs.length }, { formula: `SUMIFS(${rng(C.expected)},${rng(C.station)},A${r})`, result: sales }, { formula: `SUMIFS(${rng(C.collected)},${rng(C.station)},A${r})`, result: coll }, { formula: `D${r}-C${r}`, result: coll - sales }]
    })
    const lastR = h0 + stList.length - 1
    const totalsM = matrixByDay
      ? [T('الإجمالي', 'Total'), ...allDays.map((d, j) => ({ formula: `SUM(${colLetter(j + 2)}${h0}:${colLetter(j + 2)}${lastR})`, result: rows.filter(x => x.date === d).reduce((a, x) => a + x.collected, 0) })), { formula: `SUM(${colLetter(allDays.length + 2)}${h0}:${colLetter(allDays.length + 2)}${lastR})`, result: tot.collected }]
      : [T('الإجمالي', 'Total'), { formula: `SUM(B${h0}:B${lastR})`, result: rows.length }, { formula: `SUM(C${h0}:C${lastR})`, result: tot.expected }, { formula: `SUM(D${h0}:D${lastR})`, result: tot.collected }, { formula: `SUM(E${h0}:E${lastR})`, result: netDiff }]
    const tM2 = M.table({ columns: colsM, rows: mRows, totals: totalsM, freeze: 1, printTitle: true })
    if (matrixByDay) M.scale(`B${tM2.first}:${colLetter(allDays.length + 1)}${tM2.last}`, { min: 0, mid: tot.collected / Math.max(stList.length * allDays.length, 1), max: Math.max(...mRows.flatMap(r => r.slice(1, -1).map(c => c.result)), 1), colors: ['FFFFFFFF', 'FFCFE0F7', 'FF4F81D6'] })
    M.finish({ landscape: true })
  }

  await book.save(single ? (isAr ? `الإيرادات-اليومية_${from}` : `daily-revenue_${from}`) : (isAr ? `الإيرادات_${from}_${to}` : `revenue_${from}_${to}`))
  return { rows: rows.length, collected: tot.collected, expected: tot.expected }
}

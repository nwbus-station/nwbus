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

/**
 * records: صفوف sales_records (مع station و created_by_user.job_number)
 * date: 'YYYY-MM-DD' · scopeText: وصف النطاق (محطة/كل المحطات) · preparedBy: اسم من يُصدر الملف
 */
export async function exportDailySalesExcel({ isAr, records, date, scopeText, preparedBy }) {
  const T = (a, e) => (isAr ? a : e)
  const book = await createBook({ isAr })
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const wd = (isAr ? WD_AR : WD_EN)[new Date(date + 'T00:00:00Z').getUTCDay()]
  const subtitle = `${T('التاريخ', 'Date')}: ${wd} ${date}   ·   ${T('النطاق', 'Scope')}: ${scopeText}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`

  const SUM = T('الملخص اليومي', 'Daily summary'), ENT = T('القيود', 'Entries')
  const Q = `'${ENT}'`

  // ── صفوف القيود ─────────────────────────────────────────
  const stName = r => (isAr ? (r.station?.name_ar || r.station?.name_en) : (r.station?.name_en || r.station?.name_ar)) || '—'
  const sh = r => (SHIFT_LABEL[r.shift]?.[isAr ? 0 : 1] ?? r.shift ?? '—')
  const sorted = [...records].sort((a, b) => String(a.shift).localeCompare(String(b.shift)) || stName(a).localeCompare(stName(b)) || String(a.employee_name || a.created_by_name || '').localeCompare(String(b.employee_name || b.created_by_name || '')))
  const rows = sorted.map(r => {
    const cash = n0(r.cash_amount), mada = n0(r.mada_amount), visa = n0(r.visa_amount), mc = n0(r.mastercard_amount), other = n0(r.other_amount)
    const collected = cash + mada + visa + mc + other, expected = n0(r.total_expected)
    const refs = parseRefs(r.balance_ref)
    return {
      shift: sh(r), station: stName(r), emp: r.employee_name || r.created_by_name || '—', job: r.created_by_user?.job_number ?? '',
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
  const E = book.sheet(ENT, [5, 8, 24, 26, 12, 13, 16, 12, 12, 12, 12, 12, 13, 14, 14, 13, 14, 20, 34], { tab: XL.navy })

  E.header({ title: T('قيود الإيرادات اليومية', 'Daily revenue entries'), subtitle })
  const cols = [
    { header: '#', fmt: '0' }, { header: T('الوردية', 'Shift'), align: 'center' }, { header: T('المحطة', 'Station'), bold: true }, { header: T('الموظف', 'Employee') },
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
    return [i + 1, r.shift, r.station, r.emp, r.job, r.cashier, r.budget, r.cash, r.mada, r.visa, r.mc, r.other, r.otherType,
      { formula: `SUM(H${rr}:L${rr})`, result: r.collected }, r.expected, { formula: `N${rr}-O${rr}`, result: r.diff },
      r.confirmed ? T('مؤكَّد', 'Confirmed') : T('قيد المراجعة', 'Pending'), r.by, r.notes]
  })
  const tE = E.table({
    columns: cols, rows: eRows, filter: true, freeze: 4, printTitle: true,
    totals: rows.length ? [T('الإجمالي', 'Total'), '', '', '', '', '', '',
      ...['H', 'I', 'J', 'K', 'L'].map((c, k) => ({ formula: `SUBTOTAL(109,${c}${first}:${c}${last})`, result: [tot.cash, tot.mada, tot.visa, tot.mc, tot.other][k] })), '',
      { formula: `SUBTOTAL(109,N${first}:N${last})`, result: tot.collected }, { formula: `SUBTOTAL(109,O${first}:O${last})`, result: tot.expected },
      { formula: `SUBTOTAL(109,P${first}:P${last})`, result: netDiff }, '', '', ''] : null,
  })
  if (rows.length) {
    E.scale(`P${tE.first}:P${tE.last}`, { min: -500, mid: 0, max: 500, colors: ['FFF8696B', 'FFFFFFFF', 'FF8DB4F2'] })
    E.bars(`N${tE.first}:N${tE.last}`, 'FFA9C4EB')
  }
  E.note(T('الإجمالي في الأسفل صيغة SUBTOTAL: يتغيّر مع الفلتر (اختر محطة/وردية من أسهم الترويسة فيُعاد حساب المجموع للمعروض فقط).', 'The total row uses SUBTOTAL: it recalculates for the filtered rows only.'), { color: XL.grey, size: 9 })
  E.finish({ landscape: true })

  const rng = c => `${Q}!$${c}$${first}:$${c}$${last}`

  // ═════════ الملخص ═════════
  S.header({ title: T('التقرير اليومي للإيرادات', 'Daily revenue report'), subtitle })
  S.section(T('نظرة سريعة', 'At a glance'))
  S.spacer(0)
  const confirmedN = rows.filter(r => r.confirmed).length
  S.kpis([
    { label: T('إجمالي المبيعات (المتوقّع)', 'Total sales (expected)'), value: { formula: `SUM(${rng('O')})`, result: tot.expected }, fmt: '#,##0', foot: T('ر.س', 'SAR') },
    { label: T('إجمالي المحصَّل', 'Total collected'), value: { formula: `SUM(${rng('N')})`, result: tot.collected }, fmt: '#,##0', color: XL.green, foot: T('ر.س', 'SAR') },
    { label: T('الفرق الصافي', 'Net difference'), value: { formula: `SUM(${rng('P')})`, result: netDiff }, fmt: '+#,##0;-#,##0;0', color: netDiff === 0 ? XL.green : netDiff < 0 ? XL.red : 'FF1D4ED8', foot: netDiff === 0 ? T('مطابق', 'Matched') : netDiff < 0 ? T('عجز', 'Deficit') : T('زيادة', 'Surplus') },
    { label: T('السجلات المؤكَّدة', 'Confirmed records'), value: `${confirmedN} / ${rows.length}`, color: confirmedN === rows.length && rows.length ? XL.green : XL.amber, foot: rows.length - confirmedN ? T(`${rows.length - confirmedN} قيد المراجعة`, `${rows.length - confirmedN} pending`) : T('كلها مؤكَّدة', 'all confirmed') },
  ], 3)

  // توزيع طرق الدفع
  S.section(T('توزيع المحصَّل حسب طريقة الدفع', 'Collected by payment method'))
  const methods = [[T('نقداً', 'Cash'), 'H', tot.cash], [T('مدى', 'Mada'), 'I', tot.mada], ['Visa', 'J', tot.visa], ['Mastercard', 'K', tot.mc], [T('أخرى', 'Other'), 'L', tot.other]]
  const m0 = S.r + 1
  const tM = S.table({
    columns: [{ header: T('طريقة الدفع', 'Method'), span: 4, bold: true }, { header: T('المبلغ (ر.س)', 'Amount (SAR)'), span: 3, fmt: ACC_FMT, bold: true }, { header: T('النسبة', 'Share'), span: 2, fmt: '0.0%' }, { header: T('عدد القيود', 'Entries'), span: 3, fmt: '0' }],
    rows: methods.map(([name, c, v], i) => [name, { formula: `SUM(${rng(c)})`, result: v }, { formula: `IFERROR(E${m0 + i}/SUM(E$${m0}:E$${m0 + methods.length - 1}),0)`, result: tot.collected ? v / tot.collected : 0 }, { formula: `COUNTIF(${rng(c)},">0")`, result: rows.filter(r => r[{ H: 'cash', I: 'mada', J: 'visa', K: 'mc', L: 'other' }[c]] > 0).length }]),
    totals: [T('الإجمالي', 'Total'), { formula: `SUM(E${m0}:E${m0 + methods.length - 1})`, result: tot.collected }, { formula: `SUM(H${m0}:H${m0 + methods.length - 1})`, result: tot.collected ? 1 : 0 }, ''],
    zebra: false,
  })
  S.bars(`E${tM.first}:E${tM.last}`, 'FFA9C4EB')

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
      return [T(`الوردية ${d.lab}`, `Shift ${d.lab}`), SHIFT_RANGE[key] ?? '', { formula: `COUNTIF(${rng('B')},"${d.lab}")`, result: d.rs.length },
        { formula: `SUMIFS(${rng('O')},${rng('B')},"${d.lab}")`, result: d.sales }, { formula: `SUMIFS(${rng('N')},${rng('B')},"${d.lab}")`, result: d.coll },
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
      rows: sd.map((d, i) => { const r = t0 + i; return [d.nm, { formula: `COUNTIF(${rng('C')},A${r})`, result: d.n }, { formula: `SUMIFS(${rng('O')},${rng('C')},A${r})`, result: d.sales }, { formula: `SUMIFS(${rng('N')},${rng('C')},A${r})`, result: d.coll }, { formula: `G${r}-E${r}`, result: d.coll - d.sales }, `${d.conf} / ${d.n}`] }),
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
      columns: [{ header: T('الوردية', 'Shift'), align: 'center' }, { header: T('المحطة', 'Station'), span: 3, bold: true }, { header: T('الموظف', 'Employee'), span: 3 },
        { header: T('الفرق', 'Difference'), span: 2, fmt: DIFF_FMT, bold: true, color: v => (typeof v !== 'number' ? null : v < 0 ? XL.red : 'FF1D4ED8') }, { header: T('الإقرار', 'Acknowledgement'), span: 3, color: v => (v === T('أُقرّ على الموظف', 'Acknowledged') ? XL.green : XL.amber) }],
      rows: flagged.map(r => [r.shift, r.station, r.emp, r.diff, r.diff < 0 ? (r.acked ? T('أُقرّ على الموظف', 'Acknowledged') : (r.confirmed ? T('لم يُقرّ', 'Not acknowledged') : T('بانتظار المراجعة', 'Pending review'))) : T('زيادة — تُراجَع', 'Surplus — review')]),
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

  await book.save(isAr ? `الإيرادات-اليومية_${date}` : `daily-revenue_${date}`)
  return { rows: rows.length, collected: tot.collected, expected: tot.expected }
}

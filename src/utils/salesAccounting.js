// أوراق المحاسب المالي في ملف الإيرادات: قيد اليومية، تسوية الشبكات البنكية، ذمم الموظفين (العجز)،
// فحوصات التدقيق، الرسوم البيانية، والإعدادات (ضريبة القيمة المضافة، أيام التسوية، دليل الحسابات).
// كل الأرقام صيغ حيّة مرتبطة بورقة «القيود» وبورقة «الإعدادات»: غيّر الضريبة أو رمز حساب فيتحدّث كل شيء.
import { XL } from './excelExport'
import { lineChart, barChart, donutChart } from './chartImages'

export const ACC = '#,##0.00;[Red]-#,##0.00;"–"'
const PCT = '0.0%'
const INPUT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } }
const INPUT_FONT = { size: 11, bold: true, color: { argb: 'FF1D4ED8' } }
const thin = c => ({ style: 'thin', color: { argb: c || XL.line } })
const box = { top: thin(), left: thin(), bottom: thin(), right: thin() }
const r2 = n => Math.round((Number(n) || 0) * 100) / 100

// ترتيب الحسابات في دليل الإعدادات (يطابق أسطر قيد اليومية)
export const ACCOUNTS = [
  ['cash', 1010, 'الصندوق — النقدية', 'Cash on hand'],
  ['mada', 1120, 'شبكة مدى — مبالغ قيد التحصيل', 'Mada — receivable from bank'],
  ['visa', 1121, 'Visa — مبالغ قيد التحصيل', 'Visa — receivable from bank'],
  ['mc', 1122, 'Mastercard — مبالغ قيد التحصيل', 'Mastercard — receivable from bank'],
  ['other', 1130, 'متحصلات أخرى', 'Other receipts'],
  ['short', 1150, 'عجز الصندوق / ذمم الموظفين', 'Cash shortage / employee receivable'],
  ['rev', 4010, 'إيرادات مبيعات التذاكر', 'Ticket sales revenue'],
  ['vat', 2210, 'ضريبة القيمة المضافة المستحقة', 'VAT payable'],
  ['surplus', 4910, 'زيادة الصندوق — إيرادات أخرى', 'Cash surplus — other income'],
]
const METHODS = [['mada', 'مدى', 'Mada', 1], ['visa', 'Visa', 'Visa', 2], ['mc', 'Mastercard', 'Mastercard', 2]]

const serial = d => Math.round(d.getTime() / 86400000) + 25569
const addWork = (ds, n) => {            // أيام عمل (الجمعة والسبت إجازة) — يطابق WORKDAY.INTL(…,7)
  const d = new Date(ds + 'T00:00:00Z'); let k = 0
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 5 && w !== 6) k++ }
  return d
}

export function settingsRefs(name) {
  const q = `'${name}'`
  return {
    vat: `${q}!$B$7`,
    days: i => `${q}!$B$${11 + i}`, comm: i => `${q}!$C$${11 + i}`,
    code: i => `${q}!$B$${18 + i}`, acct: i => `${q}!$C$${18 + i}`,
  }
}

const styleHdr = (cell, fill = XL.navy) => {
  cell.font = { bold: true, size: 10, color: { argb: XL.white } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = { top: thin(XL.navy), bottom: { style: 'medium', color: { argb: XL.orange } }, left: thin(XL.navy), right: thin(XL.navy) }
}
const styleInput = (cell, fmt) => { cell.font = INPUT_FONT; cell.fill = INPUT_FILL; cell.border = box; cell.alignment = { horizontal: 'center', vertical: 'middle' }; if (fmt) cell.numFmt = fmt }
const styleCell = (cell, { bold = false, color = XL.ink, align, fmt } = {}) => {
  cell.font = { size: 10, bold, color: { argb: color } }; cell.border = box
  cell.alignment = { vertical: 'middle', horizontal: align || 'center', wrapText: false }
  if (fmt) cell.numFmt = fmt
}
// تلوين شرطي حيّ لعمود حالة يبدأ نصّه برمز ✓ / ⚠ / ⏳
function statusFormat(ws, ref, firstCell) {
  ws.addConditionalFormatting({ ref, rules: [
    { type: 'expression', priority: 1, formulae: [`LEFT(${firstCell},1)="✓"`], style: { font: { bold: true, color: { argb: XL.green } } } },
    { type: 'expression', priority: 2, formulae: [`LEFT(${firstCell},1)="⚠"`], style: { font: { bold: true, color: { argb: XL.red } } } },
    { type: 'expression', priority: 3, formulae: [`LEFT(${firstCell},1)="⏳"`], style: { font: { bold: true, color: { argb: XL.amber } } } },
  ] })
}

/* ═════════════ الإعدادات ═════════════ */
export function fillSettings(St, { T, isAr, subtitle }) {
  const ws = St.ws
  St.header({ title: T('الإعدادات والافتراضات المالية', 'Settings & financial assumptions'), subtitle })
  St.r = 6; St.section(T('ضريبة القيمة المضافة', 'Value added tax (VAT)'))
  ws.getRow(7).height = 26
  const a7 = ws.getCell('A7'); a7.value = T('نسبة الضريبة', 'VAT rate'); styleCell(a7, { bold: true, align: isAr ? 'right' : 'left' })
  const b7 = ws.getCell('B7'); b7.value = 0.15; styleInput(b7, '0.0%')
  ws.mergeCells('C7:D7'); const c7 = ws.getCell('C7'); c7.value = T('المبيعات تُعتبر شاملة الضريبة. ضع 0% إن كانت الخدمة معفاة أو بنسبة الصفر.', 'Sales are treated as VAT-inclusive. Enter 0% for exempt / zero-rated services.')
  c7.font = { size: 9.5, color: { argb: XL.grey } }; c7.alignment = { wrapText: true, vertical: 'middle', horizontal: isAr ? 'right' : 'left' }

  St.r = 9; St.section(T('تسوية الشبكات (مدى / Visa / Mastercard)', 'Card network settlement'))
  ws.getRow(10).height = 24
  ;[T('الطريقة', 'Method'), T('أيام التسوية', 'Settlement days'), T('العمولة %', 'Fee %'), T('ملاحظة', 'Note')].forEach((h, i) => { const c = ws.getCell(10, i + 1); c.value = h; styleHdr(c) })
  METHODS.forEach(([, ar, en, d], i) => {
    const r = 11 + i; ws.getRow(r).height = 22
    const a = ws.getCell(r, 1); a.value = isAr ? ar : en; styleCell(a, { bold: true, align: isAr ? 'right' : 'left' })
    const b = ws.getCell(r, 2); b.value = d; styleInput(b, '0')
    const c = ws.getCell(r, 3); c.value = 0; styleInput(c, '0.00%')
    const n = ws.getCell(r, 4); n.value = i === 0 ? T('أيام عمل بعد يوم المبيعات', 'Business days after the sales day') : ''; n.font = { size: 9.5, color: { argb: XL.grey } }
  })
  St.r = 14; St.note(T('أيام العمل تستثني الجمعة والسبت. اضبط الأيام والعمولة حسب عقدك مع البنك (العمولة صفر افتراضياً).', 'Business days exclude Friday and Saturday. Set days and fees from your bank contract (fee is 0 by default).'), { color: XL.grey })

  St.r = 16; St.section(T('دليل الحسابات لقيد اليومية', 'Chart of accounts for the journal'))
  ws.getRow(17).height = 24
  ;[T('الدور في القيد', 'Role in entry'), T('رمز الحساب', 'Account code'), T('اسم الحساب', 'Account name'), T('ملاحظة', 'Note')].forEach((h, i) => { const c = ws.getCell(17, i + 1); c.value = h; styleHdr(c) })
  const role = [T('مدين — نقدية', 'Dr — cash'), T('مدين — مدى', 'Dr — Mada'), T('مدين — Visa', 'Dr — Visa'), T('مدين — Mastercard', 'Dr — Mastercard'), T('مدين — أخرى', 'Dr — other'),
    T('مدين — العجز', 'Dr — shortage'), T('دائن — الإيراد', 'Cr — revenue'), T('دائن — الضريبة', 'Cr — VAT'), T('دائن — الزيادة', 'Cr — surplus')]
  ACCOUNTS.forEach(([, code, ar, en], i) => {
    const r = 18 + i; ws.getRow(r).height = 22
    const a = ws.getCell(r, 1); a.value = role[i]; styleCell(a, { bold: true, align: isAr ? 'right' : 'left' })
    const b = ws.getCell(r, 2); b.value = code; styleInput(b, '0')
    const c = ws.getCell(r, 3); c.value = isAr ? ar : en; styleInput(c); c.alignment = { horizontal: isAr ? 'right' : 'left', vertical: 'middle' }
    const n = ws.getCell(r, 4); n.value = i === 0 ? T('غيّر الرمز والاسم لمطابقة دليل حساباتك — يتحدّث قيد اليومية تلقائياً', 'Edit code and name to match your chart — the journal updates automatically') : ''; n.font = { size: 9.5, color: { argb: XL.grey } }
  })
  St.r = 28
  St.bullets(isAr ? [
    'الخلايا الصفراء بخط أزرق هي المدخلات الوحيدة في هذه الورقة؛ كل ما عداها يُحسب منها.',
    'تغيير نسبة الضريبة يعيد حساب صافي الإيراد والضريبة في الملخص وقيد اليومية دفعة واحدة.',
    'الأرقام الافتراضية (رموز الحسابات، أيام التسوية) اقتراحات عامة لا تمثّل عقدك أو دليلك المحاسبي.',
  ] : [
    'Yellow cells with blue text are the only inputs on this sheet; everything else is calculated from them.',
    'Changing the VAT rate recalculates net revenue and VAT in the summary and the journal at once.',
    'Default codes and settlement days are generic suggestions, not your contract or your chart of accounts.',
  ])
  St.finish({ landscape: false })
}

/* ═════════════ قيد اليومية ═════════════ */
export function fillJournal(J, ctx) {
  const { T, isAr, rows, C, rng, S, subtitle } = ctx
  const ws = J.ws
  J.header({ title: T('قيد اليومية المحاسبي', 'Accounting journal'), subtitle })
  J.note(T('قيد مركّب لكل محطة في كل يوم: مدين = النقدية وطرق الدفع (والعجز)، دائن = الإيراد الصافي والضريبة (والزيادة). جاهز للنسخ إلى نظامك المحاسبي.', 'One compound entry per station per day: debit = cash and payment methods (and shortage); credit = net revenue and VAT (and surplus). Ready to copy into your ERP.'), { color: XL.grey })

  // مجموعات (تاريخ × محطة)
  const groups = new Map()
  for (const r of rows) {
    const k = `${r.date}|${r.station}`
    const g = groups.get(k) ?? { date: r.date, station: r.station, cash: 0, mada: 0, visa: 0, mc: 0, other: 0, expected: 0, def: 0, sur: 0 }
    g.cash += r.cash; g.mada += r.mada; g.visa += r.visa; g.mc += r.mc; g.other += r.other; g.expected += r.expected; g.def += r.def; g.sur += r.sur
    groups.set(k, g)
  }
  const list = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.station.localeCompare(b.station))
  const rate = 0.15
  const lines = []   // { g, v, kind: 'dr'|'cr', acc, key, val, formula }
  const perDay = {}
  list.forEach(g => {
    perDay[g.date] = (perDay[g.date] || 0) + 1
    g.v = `JV-${g.date.replace(/-/g, '')}-${String(perDay[g.date]).padStart(2, '0')}`
    const net = r2(g.expected / (1 + rate)), vat = r2(g.expected - net)
    const add = (key, idx, side, val) => { if (Math.abs(val) > 0.004) lines.push({ g, key, idx, side, val }) }
    add('cash', 0, 'dr', g.cash); add('mada', 1, 'dr', g.mada); add('visa', 2, 'dr', g.visa); add('mc', 3, 'dr', g.mc); add('other', 4, 'dr', g.other)
    add('short', 5, 'dr', g.def)
    if (g.expected) { add('rev', 6, 'cr', net); add('vat', 7, 'cr', vat) }
    add('surplus', 8, 'cr', g.sur)
  })

  if (!lines.length) { J.note(T('لا توجد مبالغ في هذه الفترة لإنشاء قيد.', 'No amounts in this period to journalize.'), { bold: true }); J.finish({ landscape: true }); return }
  const KP = 4
  const hr = J.r + KP
  const first = hr + 1, last = hr + lines.length
  const sumE = (colKey, r) => `SUMIFS(${rng(C[colKey])},${rng(C.date)},$A${r},${rng(C.station)},$B${r})`
  const totDr = lines.filter(l => l.side === 'dr').reduce((a, l) => a + l.val, 0), totCr = lines.filter(l => l.side === 'cr').reduce((a, l) => a + l.val, 0)

  J.kpis([
    { label: T('إجمالي المدين', 'Total debit'), value: { formula: `SUBTOTAL(109,F${first}:F${last})`, result: r2(totDr) }, fmt: '#,##0.00', color: XL.navy, foot: T('ر.س', 'SAR') },
    { label: T('إجمالي الدائن', 'Total credit'), value: { formula: `SUBTOTAL(109,G${first}:G${last})`, result: r2(totCr) }, fmt: '#,##0.00', color: XL.navy, foot: T('ر.س', 'SAR') },
    { label: T('الفرق (يجب أن يكون صفراً)', 'Difference (must be zero)'), value: { formula: `ROUND(SUBTOTAL(109,F${first}:F${last})-SUBTOTAL(109,G${first}:G${last}),2)`, result: r2(totDr - totCr) }, fmt: '#,##0.00;-#,##0.00;0', color: XL.green, foot: T('ر.س', 'SAR') },
    { label: T('حالة التوازن', 'Balance check'), value: { formula: `IF(ROUND(SUBTOTAL(109,F${first}:F${last})-SUBTOTAL(109,G${first}:G${last}),2)=0,"${T('✓ متوازن', '✓ Balanced')}","${T('⚠ غير متوازن', '⚠ Unbalanced')}")`, result: T('✓ متوازن', '✓ Balanced') }, color: XL.green, foot: `${list.length} ${T('قيد', 'entries')}` },
  ], 2)
  if (J.r !== hr) throw new Error('journal layout mismatch')

  J.table({
    columns: [
      { header: T('التاريخ', 'Date'), bold: true }, { header: T('المحطة', 'Station') }, { header: T('رقم القيد', 'Voucher') }, { header: T('رمز الحساب', 'Account') },
      { header: T('اسم الحساب', 'Account name') }, { header: T('مدين', 'Debit'), fmt: ACC, bold: true }, { header: T('دائن', 'Credit'), fmt: ACC, bold: true }, { header: T('البيان', 'Narration') },
    ],
    rows: lines.map((l, i) => {
      const r = first + i
      const f = l.key === 'rev' ? `ROUND(${sumE('expected', r)}/(1+${S.vat}),2)`
        : l.key === 'vat' ? `${sumE('expected', r)}-ROUND(${sumE('expected', r)}/(1+${S.vat}),2)`
        : l.key === 'short' ? sumE('def', r) : l.key === 'surplus' ? sumE('sur', r) : sumE(l.key, r)
      const cell = { formula: f, result: r2(l.val) }
      return [l.g.date, l.g.station, l.g.v, { formula: S.code(l.idx), result: ACCOUNTS[l.idx][1] }, { formula: S.acct(l.idx), result: isAr ? ACCOUNTS[l.idx][2] : ACCOUNTS[l.idx][3] },
        l.side === 'dr' ? cell : null, l.side === 'cr' ? cell : null, `${T('إيرادات يومية', 'Daily revenue')} — ${l.g.station} — ${l.g.date}`]
    }),
    totals: [T('الإجمالي', 'Total'), '', '', '', '', { formula: `SUBTOTAL(109,F${first}:F${last})`, result: r2(totDr) }, { formula: `SUBTOTAL(109,G${first}:G${last})`, result: r2(totCr) }, ''],
    filter: true, freeze: 4, printTitle: true, zebra: false,
  })
  // تظليل بالتناوب لكل قيد (كل مجموعة سطور رقمها واحد)
  let band = 0, prev = null
  lines.forEach((l, i) => {
    if (l.g.v !== prev) { band++; prev = l.g.v }
    if (band % 2 === 0) for (let c = 1; c <= 8; c++) ws.getCell(first + i, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.zebra } }
  })
  J.note(T('الرمز والاسم من ورقة «الإعدادات». الإيراد الصافي = المبيعات ÷ (1 + نسبة الضريبة). الإجماليات SUBTOTAL: تتغيّر مع الفلتر.', 'Codes and names come from the Settings sheet. Net revenue = sales ÷ (1 + VAT rate). Totals use SUBTOTAL and follow the filter.'), { color: XL.grey, size: 9 })
  J.finish({ landscape: true })
}

/* ═════════════ تسوية الشبكات البنكية ═════════════ */
export function fillBank(B, ctx) {
  const { T, isAr, rows, C, rng, S, subtitle } = ctx
  const ws = B.ws
  B.header({ title: T('تسوية الشبكات البنكية', 'Card network reconciliation'), subtitle })
  B.note(T('كل يوم وكل شبكة بصف: المبلغ المحصَّل، العمولة، الصافي المتوقع وتاريخ الإيداع بأيام العمل. اكتب المبلغ المستلم من كشف البنك في الخانة الصفراء فتظهر الفروق تلقائياً.', 'One row per day and network: collected, fee, expected net and expected deposit date. Type the amount from your bank statement in the yellow cell and differences appear automatically.'), { color: XL.grey })

  const dates = [...new Set(rows.map(r => r.date))].sort()
  const list = []
  for (const d of dates) METHODS.forEach(([k], mi) => {
    const amt = rows.filter(r => r.date === d).reduce((a, r) => a + r[k], 0)
    if (Math.abs(amt) > 0.004) list.push({ d, k, mi, amt: r2(amt) })
  })
  if (!list.length) { B.note(T('لا توجد مبالغ شبكات (مدى / Visa / Mastercard) في هذه الفترة.', 'No card-network amounts in this period.'), { bold: true }); B.finish({ landscape: true }); return }
  const hr = B.r + 4
  const first = hr + 1, last = hr + list.length
  const net = x => x.amt

  B.kpis([
    { label: T('صافي متوقع من البنك', 'Expected net from bank'), value: { formula: `SUBTOTAL(109,F${first}:F${last})`, result: r2(list.reduce((a, x) => a + net(x), 0)) }, fmt: '#,##0.00', color: XL.navy, foot: T('ر.س', 'SAR') },
    { label: T('المستلم فعلياً', 'Actually received'), value: { formula: `SUBTOTAL(109,H${first}:H${last})`, result: 0 }, fmt: '#,##0.00', color: XL.green, foot: T('من كشف البنك', 'from bank statement') },
    { label: T('بانتظار الإيداع', 'Awaiting deposit'), value: { formula: `SUMIFS(F${first}:F${last},H${first}:H${last},"")`, result: r2(list.reduce((a, x) => a + net(x), 0)) }, fmt: '#,##0.00', color: XL.amber, foot: T('صفوف بلا مبلغ مستلم', 'rows without a received amount') },
    { label: T('فرق التسوية', 'Reconciliation gap'), value: { formula: `SUBTOTAL(109,I${first}:I${last})`, result: 0 }, fmt: '+#,##0.00;[Red]-#,##0.00;0', color: XL.green, foot: T('المستلم − المتوقع', 'received − expected') },
  ], 2)
  if (B.r !== hr) throw new Error('bank layout mismatch')

  B.table({
    columns: [
      { header: T('تاريخ المبيعات', 'Sales date'), bold: true }, { header: T('الشبكة', 'Network'), bold: true }, { header: T('المبلغ المحصَّل', 'Collected'), fmt: ACC }, { header: T('العمولة %', 'Fee %'), fmt: '0.00%' },
      { header: T('العمولة', 'Fee'), fmt: ACC }, { header: T('الصافي المتوقع', 'Expected net'), fmt: ACC, bold: true }, { header: T('تاريخ الإيداع المتوقع', 'Expected deposit'), fmt: 'yyyy-mm-dd' },
      { header: T('المستلم فعلياً', 'Received'), fmt: ACC, bold: true }, { header: T('الفرق', 'Gap'), fmt: '+#,##0.00;[Red]-#,##0.00;"–"', bold: true }, { header: T('الحالة', 'Status') },
    ],
    rows: list.map((x, i) => {
      const r = first + i, M = METHODS[x.mi], col = C[x.k]
      return [x.d, isAr ? M[1] : M[2], { formula: `SUMIFS(${rng(col)},${rng(C.date)},$A${r})`, result: x.amt }, { formula: S.comm(x.mi), result: 0 },
        { formula: `ROUND(C${r}*D${r},2)`, result: 0 }, { formula: `C${r}-E${r}`, result: x.amt },
        { formula: `WORKDAY.INTL(DATE(LEFT($A${r},4),MID($A${r},6,2),RIGHT($A${r},2)),${S.days(x.mi)},7)`, result: serial(addWork(x.d, M[3])) },
        null, { formula: `IF(H${r}="","",H${r}-F${r})`, result: '' },
        { formula: `IF(H${r}="","${T('⏳ بانتظار الإيداع', '⏳ Awaiting deposit')}",IF(ROUND(I${r},2)=0,"${T('✓ مطابق', '✓ Matched')}","${T('⚠ فرق', '⚠ Gap')}"))`, result: T('⏳ بانتظار الإيداع', '⏳ Awaiting deposit') }]
    }),
    totals: [T('الإجمالي', 'Total'), '', { formula: `SUBTOTAL(109,C${first}:C${last})`, result: r2(list.reduce((a, x) => a + x.amt, 0)) }, '', { formula: `SUBTOTAL(109,E${first}:E${last})`, result: 0 },
      { formula: `SUBTOTAL(109,F${first}:F${last})`, result: r2(list.reduce((a, x) => a + x.amt, 0)) }, '', { formula: `SUBTOTAL(109,H${first}:H${last})`, result: 0 }, { formula: `SUBTOTAL(109,I${first}:I${last})`, result: 0 }, ''],
    filter: true, freeze: 2, printTitle: true,
  })
  list.forEach((_, i) => { styleInput(ws.getCell(first + i, 8), ACC) })
  if (list.length) {
    ws.dataValidations.add(`H${first}:H${last}`, { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: T('قيمة غير صحيحة', 'Invalid value'), error: T('أدخل مبلغاً رقمياً موجباً', 'Enter a positive number') })
    statusFormat(ws, `J${first}:J${last}`, `J${first}`)
  }
  B.note(T('تاريخ الإيداع المتوقع = تاريخ المبيعات + أيام التسوية بأيام العمل (الجمعة والسبت إجازة) من ورقة «الإعدادات».', 'Expected deposit = sales date + settlement business days (Fri/Sat off) from the Settings sheet.'), { color: XL.grey, size: 9 })
  B.finish({ landscape: true })
}

/* ═════════════ ذمم الموظفين (العجز والزيادة) ═════════════ */
export function fillEmployees(Em, ctx) {
  const { T, rows, C, rng, subtitle } = ctx
  Em.header({ title: T('الموظفون: العجز والزيادة والالتزام', 'Employees: shortages, surpluses and accuracy'), subtitle })
  Em.note(T('كل موظف بصف: عدد يومياته ومبيعاته ومحصَّله، إجمالي العجز (والجزء غير المُقرّ عليه)، والزيادة، ونسبة اليوميات المطابقة. الترتيب بحسب العجز الأعلى.', 'One row per employee: entries, sales, collected, total shortage (and the part not yet acknowledged), surplus and the share of matched entries. Sorted by highest shortage.'), { color: XL.grey })

  const by = new Map()
  for (const r of rows) {
    const e = by.get(r.emp) ?? { name: r.emp, job: r.job, stations: {}, n: 0, exp: 0, coll: 0, def: 0, unack: 0, sur: 0, defN: 0, ok: 0 }
    e.n++; e.exp += r.expected; e.coll += r.collected; e.def += r.def; e.sur += r.sur
    if (r.def > 0) { e.defN++; if (r.ackTxt === T('لا', 'No')) e.unack += r.def }
    if (r.diff === 0) e.ok++
    e.stations[r.station] = (e.stations[r.station] || 0) + 1
    if (!e.job && r.job) e.job = r.job
    by.set(r.emp, e)
  }
  const list = [...by.values()].sort((a, b) => b.def - a.def || b.coll - a.coll)
  const hr = Em.r + 4
  const first = hr + 1, last = hr + list.length
  const totDef = list.reduce((a, e) => a + e.def, 0), totUnack = list.reduce((a, e) => a + e.unack, 0)
  const clean = list.filter(e => e.defN === 0).length

  Em.kpis([
    { label: T('عدد الموظفين', 'Employees'), value: { formula: `COUNTA(A${first}:A${last})`, result: list.length }, fmt: '0', color: XL.navy, foot: T('لديهم يوميات في الفترة', 'with entries in the period') },
    { label: T('إجمالي العجز', 'Total shortage'), value: { formula: `SUM(H${first}:H${last})`, result: r2(totDef) }, fmt: '#,##0.00', color: totDef ? XL.red : XL.green, foot: T('ر.س', 'SAR') },
    { label: T('عجز غير مُقرّ عليه', 'Unacknowledged shortage'), value: { formula: `SUM(I${first}:I${last})`, result: r2(totUnack) }, fmt: '#,##0.00', color: totUnack ? XL.red : XL.green, foot: T('يحتاج إقراراً أو تسوية', 'needs acknowledgement') },
    { label: T('موظفون بلا أي عجز', 'Employees with no shortage'), value: { formula: `COUNTIF(K${first}:K${last},0)`, result: clean }, fmt: '0', color: XL.green, foot: `${list.length ? Math.round(clean / list.length * 100) : 0}%` },
  ], 3)
  if (Em.r !== hr) throw new Error('employees layout mismatch')

  const grade = `IF(L{r}>=0.95,"${T('ممتاز', 'Excellent')}",IF(L{r}>=0.8,"${T('جيد', 'Good')}",IF(L{r}>=0.6,"${T('مقبول', 'Fair')}","${T('يحتاج متابعة', 'Needs follow-up')}")))`
  const gradeOf = p => (p >= 0.95 ? T('ممتاز', 'Excellent') : p >= 0.8 ? T('جيد', 'Good') : p >= 0.6 ? T('مقبول', 'Fair') : T('يحتاج متابعة', 'Needs follow-up'))
  const no = T('لا', 'No')
  Em.table({
    columns: [
      { header: T('الموظف', 'Employee'), bold: true }, { header: T('الرقم الوظيفي', 'Job no.') }, { header: T('المحطة الغالبة', 'Main station') }, { header: T('القيود', 'Entries'), fmt: '0' },
      { header: T('المبيعات', 'Sales'), fmt: ACC }, { header: T('المحصَّل', 'Collected'), fmt: ACC, bold: true }, { header: T('صافي الفرق', 'Net diff.'), fmt: '+#,##0.00;[Red]-#,##0.00;"–"', bold: true },
      { header: T('إجمالي العجز', 'Shortage'), fmt: ACC, bold: true }, { header: T('عجز غير مُقرّ', 'Unacknowledged'), fmt: ACC }, { header: T('إجمالي الزيادة', 'Surplus'), fmt: ACC },
      { header: T('أيام عجز', 'Shortage days'), fmt: '0' }, { header: T('نسبة المطابقة', 'Match rate'), fmt: '0%' }, { header: T('التقييم', 'Grade'), bold: true, color: v => (v === T('ممتاز', 'Excellent') ? XL.green : v === T('يحتاج متابعة', 'Needs follow-up') ? XL.red : null) },
    ],
    rows: list.map((e, i) => {
      const r = first + i, rate = e.n ? e.ok / e.n : 0
      const main = Object.entries(e.stations).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const S = (col, extra = '') => `SUMIFS(${rng(C[col])},${rng(C.emp)},$A${r}${extra})`
      return [e.name, e.job || '', main, { formula: `COUNTIF(${rng(C.emp)},$A${r})`, result: e.n }, { formula: S('expected'), result: r2(e.exp) }, { formula: S('collected'), result: r2(e.coll) },
        { formula: `F${r}-E${r}`, result: r2(e.coll - e.exp) }, { formula: S('def'), result: r2(e.def) }, { formula: S('def', `,${rng(C.ack)},"${no}"`), result: r2(e.unack) }, { formula: S('sur'), result: r2(e.sur) },
        { formula: `COUNTIFS(${rng(C.emp)},$A${r},${rng(C.def)},">0")`, result: e.defN }, { formula: `IFERROR(COUNTIFS(${rng(C.emp)},$A${r},${rng(C.diff)},0)/D${r},0)`, result: rate },
        { formula: grade.replace(/\{r\}/g, r), result: gradeOf(rate) }]
    }),
    totals: [T('الإجمالي', 'Total'), '', '', { formula: `SUM(D${first}:D${last})`, result: rows.length }, { formula: `SUM(E${first}:E${last})`, result: r2(rows.reduce((a, r) => a + r.expected, 0)) },
      { formula: `SUM(F${first}:F${last})`, result: r2(rows.reduce((a, r) => a + r.collected, 0)) }, { formula: `SUM(G${first}:G${last})`, result: r2(rows.reduce((a, r) => a + r.diff, 0)) }, { formula: `SUM(H${first}:H${last})`, result: r2(totDef) },
      { formula: `SUM(I${first}:I${last})`, result: r2(totUnack) }, { formula: `SUM(J${first}:J${last})`, result: r2(rows.reduce((a, r) => a + r.sur, 0)) }, { formula: `SUM(K${first}:K${last})`, result: list.reduce((a, e) => a + e.defN, 0) },
      { formula: `IFERROR(SUMPRODUCT(L${first}:L${last},D${first}:D${last})/D${last + 1},0)`, result: rows.length ? rows.filter(r => r.diff === 0).length / rows.length : 0 }, ''],
    filter: true, freeze: 2, printTitle: true,
  })
  if (list.length) {
    Em.bars(`H${first}:H${last}`, 'FFF4A6A6')
    Em.scale(`L${first}:L${last}`, { min: 0.5, mid: 0.85, max: 1, colors: ['FFF8696B', 'FFFFEB84', 'FF63BE7B'] })
  }
  Em.note(T('نسبة المطابقة = اليوميات التي محصَّلها يساوي مبيعاتها ÷ كل يومياته. «غير مُقرّ» = عجز لم يُقرّ المحاسب بتحميله على الموظف.', 'Match rate = entries where collected equals sales ÷ all entries. “Unacknowledged” = shortage the accountant has not charged to the employee.'), { color: XL.grey, size: 9 })
  Em.finish({ landscape: true })
}

/* ═════════════ تسوية الكاش (النقد المحصَّل مقابل المودَع بالبنك) ═════════════ */
export function fillCash(K, ctx) {
  const { T, rows, C, rng, subtitle } = ctx
  K.header({ title: T('تسوية الكاش', 'Cash reconciliation'), subtitle })
  K.note(T('كل صف = نقد محطة في يوم. اكتب في الخلايا الصفراء المبلغ المودَع فعلاً ورقم سند الإيداع وتاريخه، فيظهر الفرق والرصيد المتراكم غير المودَع لكل محطة. (النظام لا يسجّل الإيداع، فالإدخال هنا يدوي من سند البنك.)', 'One row = a station’s cash for a day. Type the actual deposit, slip number and date in the yellow cells; the gap and each station’s running undeposited balance update. (The system does not record deposits, so entry here is manual from the bank slip.)'), { color: XL.grey })

  const groups = new Map()
  for (const r of rows) {
    if (!(r.cash > 0.004)) continue
    const k = `${r.date}|${r.station}`
    const g = groups.get(k) ?? { date: r.date, station: r.station, cash: 0 }
    g.cash += r.cash
    groups.set(k, g)
  }
  const list = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.station.localeCompare(b.station))
  if (!list.length) { K.note(T('لا يوجد نقد في هذه الفترة.', 'No cash in this period.'), { bold: true }); K.finish({ landscape: true }); return }

  const stations = [...new Set(list.map(g => g.station))].sort((a, b) => a.localeCompare(b))
  const sHr = K.r + 4 + 1                          // بعد المؤشرات (4 صفوف) وعنوان القسم الأول (صف) = رأس جدول المحطات
  // صفوف جدول المحطات: رأس + n + إجمالي + سطر فاصل، ثم عنوان القسم الثاني
  const dHr = sHr + stations.length + 3 + 1
  const dFirst = dHr + 1, dLast = dHr + list.length
  const A = (c, f = dFirst, l = dLast) => `$${c}$${f}:$${c}$${l}`
  const totCash = r2(list.reduce((a, g) => a + g.cash, 0))

  K.kpis([
    { label: T('النقد المحصَّل', 'Cash collected'), value: { formula: `SUM(${A('C')})`, result: totCash }, fmt: '#,##0.00', color: XL.navy, foot: T('ر.س', 'SAR') },
    { label: T('المودَع فعلياً', 'Deposited'), value: { formula: `SUM(${A('E')})`, result: 0 }, fmt: '#,##0.00', color: XL.green, foot: T('من سندات الإيداع', 'from deposit slips') },
    { label: T('رصيد غير مودَع', 'Undeposited balance'), value: { formula: `SUM(${A('C')})-SUM(${A('E')})`, result: totCash }, fmt: '#,##0.00', color: XL.red, foot: T('نقد لم يصل البنك', 'cash not yet at the bank') },
    { label: T('أيام بلا إيداع', 'Days not deposited'), value: { formula: `COUNTIF(${A('H')},"⏳*")`, result: list.length }, fmt: '0', color: XL.amber, foot: T('صفوف بلا مبلغ مودَع', 'rows with no deposit entered') },
  ], 2)

  // 1) الرصيد غير المودَع لكل محطة
  K.section(T('الرصيد غير المودَع لكل محطة', 'Undeposited balance by station'))
  if (K.r !== sHr) throw new Error('cash layout mismatch (stations)')
  K.table({
    columns: [{ header: T('المحطة', 'Station'), bold: true }, { header: T('أيام فيها نقد', 'Cash days'), fmt: '0' }, { header: T('النقد المحصَّل', 'Cash collected'), fmt: ACC }, { header: T('المودَع', 'Deposited'), fmt: ACC },
      { header: T('الرصيد غير المودَع', 'Undeposited'), fmt: ACC, bold: true }, { header: T('أقدم يوم غير مودَع', 'Oldest undeposited'), align: 'center' }, { header: T('الحالة', 'Status') }],
    rows: stations.map((st, i) => {
      const r = sHr + 1 + i, cash = list.filter(g => g.station === st).reduce((a, g) => a + g.cash, 0), oldest = list.find(g => g.station === st)?.date ?? ''
      return [st, { formula: `COUNTIF(${A('B')},$A${r})`, result: list.filter(g => g.station === st).length }, { formula: `SUMIFS(${A('C')},${A('B')},$A${r})`, result: r2(cash) },
        { formula: `SUMIFS(${A('E')},${A('B')},$A${r})`, result: 0 }, { formula: `C${r}-D${r}`, result: r2(cash) },
        { formula: `IFERROR(INDEX(${A('A')},MATCH(1,INDEX((${A('B')}=$A${r})*(LEFT(${A('H')},1)<>"✓"),0),0)),"")`, result: oldest },
        { formula: `IF(ROUND(E${r},2)<=0,"${T('✓ لا رصيد', '✓ Nothing outstanding')}",IF(D${r}=0,"${T('⏳ لم يُودَع شيء', '⏳ Nothing deposited')}","${T('⚠ رصيد متبقٍّ', '⚠ Balance outstanding')}"))`, result: T('⏳ لم يُودَع شيء', '⏳ Nothing deposited') }]
    }),
    totals: [T('الإجمالي', 'Total'), { formula: `SUM(B${sHr + 1}:B${sHr + stations.length})`, result: list.length }, { formula: `SUM(C${sHr + 1}:C${sHr + stations.length})`, result: totCash },
      { formula: `SUM(D${sHr + 1}:D${sHr + stations.length})`, result: 0 }, { formula: `SUM(E${sHr + 1}:E${sHr + stations.length})`, result: totCash }, '', ''],
    zebra: true,
  })
  statusFormat(K.ws, `G${sHr + 1}:G${sHr + stations.length}`, `G${sHr + 1}`)
  K.bars(`E${sHr + 1}:E${sHr + stations.length}`, 'FFF4A6A6')

  // 2) تفصيل يومي (مدخلات الإيداع)
  K.section(T('التفصيل اليومي وإدخال الإيداع', 'Daily detail and deposit entry'))
  if (K.r !== dHr) throw new Error('cash layout mismatch (detail)')
  K.table({
    columns: [{ header: T('التاريخ', 'Date'), bold: true }, { header: T('المحطة', 'Station'), bold: true }, { header: T('النقد المحصَّل', 'Cash collected'), fmt: ACC, bold: true }, { header: T('رقم سند الإيداع', 'Deposit slip no.') },
      { header: T('المودَع فعلياً', 'Deposited'), fmt: ACC, bold: true }, { header: T('تاريخ الإيداع', 'Deposit date') }, { header: T('الفرق', 'Gap'), fmt: '+#,##0.00;[Red]-#,##0.00;"–"', bold: true },
      { header: T('الحالة', 'Status') }, { header: T('رصيد المحطة المتراكم', 'Station running balance'), fmt: ACC }],
    rows: list.map((g, i) => {
      const r = dFirst + i
      const run = list.slice(0, i + 1).filter(x => x.station === g.station).reduce((a, x) => a + x.cash, 0)
      return [g.date, g.station, { formula: `SUMIFS(${rng(C.cash)},${rng(C.date)},$A${r},${rng(C.station)},$B${r})`, result: r2(g.cash) }, null, null, null,
        { formula: `IF(E${r}="","",E${r}-C${r})`, result: '' },
        { formula: `IF(E${r}="","${T('⏳ لم يُودَع بعد', '⏳ Not deposited yet')}",IF(ROUND(G${r},2)=0,"${T('✓ مودَع بالكامل', '✓ Fully deposited')}",IF(G${r}<0,"${T('⚠ المودَع أقل من المحصَّل', '⚠ Deposit below collected')}","${T('⚠ المودَع أكثر من المحصَّل', '⚠ Deposit above collected')}")))`, result: T('⏳ لم يُودَع بعد', '⏳ Not deposited yet') },
        { formula: `SUMIFS($C$${dFirst}:C${r},$B$${dFirst}:B${r},$B${r})-SUMIFS($E$${dFirst}:E${r},$B$${dFirst}:B${r},$B${r})`, result: r2(run) }]
    }),
    totals: [T('الإجمالي', 'Total'), '', { formula: `SUBTOTAL(109,C${dFirst}:C${dLast})`, result: totCash }, '', { formula: `SUBTOTAL(109,E${dFirst}:E${dLast})`, result: 0 }, '', { formula: `SUBTOTAL(109,G${dFirst}:G${dLast})`, result: 0 }, '', ''],
    filter: true, printTitle: true,
  })
  list.forEach((_, i) => { const r = dFirst + i; styleInput(K.ws.getCell(r, 4)); styleInput(K.ws.getCell(r, 5), ACC); styleInput(K.ws.getCell(r, 6)) })
  K.ws.dataValidations.add(`E${dFirst}:E${dLast}`, { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: T('قيمة غير صحيحة', 'Invalid value'), error: T('أدخل مبلغاً رقمياً موجباً', 'Enter a positive number') })
  statusFormat(K.ws, `H${dFirst}:H${dLast}`, `H${dFirst}`)
  K.note(T('الفرق = المودَع − المحصَّل (سالب = أودعت أقل من النقد المحصَّل). الرصيد المتراكم لكل محطة = مجموع نقدها حتى هذا اليوم − ما أُودع منه.', 'Gap = deposited − collected (negative = deposited less than cash collected). Running balance = the station’s cash to date − deposits to date.'), { color: XL.grey, size: 9 })
  K.finish({ landscape: true })
}

/* ═════════════ عجز المحطات: ومن المتسبب ═════════════ */
export function fillStationShortage(SS, ctx) {
  const { T, rows, C, rng, subtitle } = ctx
  SS.header({ title: T('عجز المحطات: من المتسبب؟', 'Station shortages: who is responsible?'), subtitle })
  SS.note(T('الجدول الأول: عجز كل محطة ونسبته. الثاني: لكل محطة، كم ساهم كل موظف بعجزها وما حالة إقرار كل مبلغ. «غير مُقرّ» = أكّد المحاسب اليومية دون تحميل الموظف، و«بانتظار» = اليومية لم تُؤكَّد بعد.', 'Table 1: each station’s shortage and its rate. Table 2: for each station, how much each employee contributed and the acknowledgement state. “Unacknowledged” = confirmed without charging the employee; “Pending” = not confirmed yet.'), { color: XL.grey })
  const NO = T('لا', 'No'), YES = T('نعم', 'Yes'), PEND = T('بانتظار', 'Pending')

  const byStation = new Map()
  for (const r of rows) {
    const e = byStation.get(r.station) ?? { st: r.station, n: 0, exp: 0, def: 0, yes: 0, no: 0, pend: 0, emps: new Map() }
    e.n++; e.exp += r.expected
    if (r.def > 0) {
      e.def += r.def
      if (r.ackTxt === YES) e.yes += r.def; else if (r.ackTxt === PEND) e.pend += r.def; else e.no += r.def
      const m = e.emps.get(r.emp) ?? { emp: r.emp, job: r.job, n: 0, def: 0, yes: 0, no: 0, pend: 0 }
      m.n++; m.def += r.def; if (!m.job && r.job) m.job = r.job
      if (r.ackTxt === YES) m.yes += r.def; else if (r.ackTxt === PEND) m.pend += r.def; else m.no += r.def
      e.emps.set(r.emp, m)
    }
    byStation.set(r.station, e)
  }
  const stList = [...byStation.values()].filter(e => e.def > 0).sort((a, b) => b.def - a.def)
  if (!stList.length) { SS.note(T('✅ لا عجز في أي محطة خلال هذه الفترة.', '✅ No shortage at any station in this period.'), { bold: true, color: XL.green }); SS.finish({ landscape: true }); return }
  const detail = []
  stList.forEach(e => [...e.emps.values()].sort((a, b) => b.def - a.def).forEach(m => detail.push({ st: e.st, stDef: e.def, ...m })))

  const sHr = SS.r + 4 + 1
  const dHr = sHr + stList.length + 3 + 1
  const dFirst = dHr + 1, dLast = dHr + detail.length
  const totDef = r2(stList.reduce((a, e) => a + e.def, 0))
  const D = c => `$${c}$${dFirst}:$${c}$${dLast}`

  SS.kpis([
    { label: T('إجمالي عجز المحطات', 'Total station shortage'), value: { formula: `SUM(${rng(C.def)})`, result: totDef }, fmt: '#,##0.00', color: XL.red, foot: T('ر.س', 'SAR') },
    { label: T('محطات فيها عجز', 'Stations with a shortage'), value: stList.length, fmt: '0', color: XL.amber, foot: `${T('من', 'of')} ${byStation.size}` },
    { label: T('أعلى محطة عجزاً', 'Highest shortage'), value: stList[0].st, color: XL.red, foot: `${r2(stList[0].def)} ${T('ر.س', 'SAR')}` },
    { label: T('عجز غير مُقرّ + بانتظار', 'Unacknowledged + pending'), value: { formula: `SUMIFS(${rng(C.def)},${rng(C.ack)},"${NO}")+SUMIFS(${rng(C.def)},${rng(C.ack)},"${PEND}")`, result: r2(stList.reduce((a, e) => a + e.no + e.pend, 0)) }, fmt: '#,##0.00', color: XL.red, foot: T('لم يُحمَّل على موظف بعد', 'not yet charged to an employee') },
  ], 2)

  SS.section(T('1) عجز كل محطة', '1) Shortage by station'))
  if (SS.r !== sHr) throw new Error('shortage layout mismatch (stations)')
  SS.table({
    columns: [{ header: T('المحطة', 'Station'), bold: true }, { header: T('القيود', 'Entries'), fmt: '0' }, { header: T('المبيعات', 'Sales'), fmt: ACC }, { header: T('إجمالي العجز', 'Shortage'), fmt: ACC, bold: true },
      { header: T('نسبة العجز من المبيعات', 'Shortage % of sales'), fmt: '0.00%' }, { header: T('موظفون ساهموا', 'Employees involved'), fmt: '0' }, { header: T('أعلى متسبب', 'Top contributor') },
      { header: T('مُقرّ', 'Acknowledged'), fmt: ACC }, { header: T('غير مُقرّ', 'Unacknowledged'), fmt: ACC }, { header: T('بانتظار', 'Pending'), fmt: ACC }],
    rows: stList.map((e, i) => {
      const r = sHr + 1 + i, top = [...e.emps.values()].sort((a, b) => b.def - a.def)[0]
      const S = (extra = '') => `SUMIFS(${rng(C.def)},${rng(C.station)},$A${r}${extra})`
      return [e.st, { formula: `COUNTIF(${rng(C.station)},$A${r})`, result: e.n }, { formula: `SUMIFS(${rng(C.expected)},${rng(C.station)},$A${r})`, result: r2(e.exp) }, { formula: S(), result: r2(e.def) },
        { formula: `IFERROR(D${r}/C${r},0)`, result: e.exp ? e.def / e.exp : 0 }, { formula: `COUNTIFS(${D('A')},$A${r},${D('E')},">0")`, result: e.emps.size },
        `${top.emp} (${r2(top.def)})`, { formula: S(`,${rng(C.ack)},"${YES}"`), result: r2(e.yes) }, { formula: S(`,${rng(C.ack)},"${NO}"`), result: r2(e.no) }, { formula: S(`,${rng(C.ack)},"${PEND}"`), result: r2(e.pend) }]
    }),
    totals: [T('الإجمالي', 'Total'), { formula: `SUM(B${sHr + 1}:B${sHr + stList.length})`, result: stList.reduce((a, e) => a + e.n, 0) }, { formula: `SUM(C${sHr + 1}:C${sHr + stList.length})`, result: r2(stList.reduce((a, e) => a + e.exp, 0)) },
      { formula: `SUM(D${sHr + 1}:D${sHr + stList.length})`, result: totDef }, { formula: `IFERROR(D${sHr + stList.length + 1}/C${sHr + stList.length + 1},0)`, result: totDef / Math.max(stList.reduce((a, e) => a + e.exp, 0), 1) }, '', '',
      { formula: `SUM(H${sHr + 1}:H${sHr + stList.length})`, result: r2(stList.reduce((a, e) => a + e.yes, 0)) }, { formula: `SUM(I${sHr + 1}:I${sHr + stList.length})`, result: r2(stList.reduce((a, e) => a + e.no, 0)) }, { formula: `SUM(J${sHr + 1}:J${sHr + stList.length})`, result: r2(stList.reduce((a, e) => a + e.pend, 0)) }],
  })
  SS.bars(`D${sHr + 1}:D${sHr + stList.length}`, 'FFF4A6A6')

  SS.section(T('2) كل محطة: ومن المتسبب بعجزها؟', '2) Per station: who caused it?'))
  if (SS.r !== dHr) throw new Error('shortage layout mismatch (detail)')
  SS.table({
    columns: [{ header: T('المحطة', 'Station'), bold: true }, { header: T('الموظف', 'Employee'), bold: true }, { header: T('الرقم الوظيفي', 'Job no.') }, { header: T('أيام عجز', 'Shortage days'), fmt: '0' },
      { header: T('العجز', 'Shortage'), fmt: ACC, bold: true }, { header: T('حصته من عجز المحطة', 'Share of station shortage'), fmt: '0%' }, { header: T('مُقرّ', 'Acknowledged'), fmt: ACC }, { header: T('غير مُقرّ', 'Unacknowledged'), fmt: ACC }, { header: T('بانتظار', 'Pending'), fmt: ACC }],
    rows: detail.map((m, i) => {
      const r = dFirst + i
      const S = (extra = '') => `SUMIFS(${rng(C.def)},${rng(C.station)},$A${r},${rng(C.emp)},$B${r}${extra})`
      return [m.st, m.emp, m.job || '', { formula: `COUNTIFS(${rng(C.station)},$A${r},${rng(C.emp)},$B${r},${rng(C.def)},">0")`, result: m.n }, { formula: S(), result: r2(m.def) },
        { formula: `IFERROR(E${r}/SUMIFS(${rng(C.def)},${rng(C.station)},$A${r}),0)`, result: m.stDef ? m.def / m.stDef : 0 },
        { formula: S(`,${rng(C.ack)},"${YES}"`), result: r2(m.yes) }, { formula: S(`,${rng(C.ack)},"${NO}"`), result: r2(m.no) }, { formula: S(`,${rng(C.ack)},"${PEND}"`), result: r2(m.pend) }]
    }),
    totals: [T('الإجمالي', 'Total'), '', '', { formula: `SUM(D${dFirst}:D${dLast})`, result: detail.reduce((a, m) => a + m.n, 0) }, { formula: `SUM(E${dFirst}:E${dLast})`, result: totDef }, '',
      { formula: `SUM(G${dFirst}:G${dLast})`, result: r2(detail.reduce((a, m) => a + m.yes, 0)) }, { formula: `SUM(H${dFirst}:H${dLast})`, result: r2(detail.reduce((a, m) => a + m.no, 0)) }, { formula: `SUM(I${dFirst}:I${dLast})`, result: r2(detail.reduce((a, m) => a + m.pend, 0)) }],
    filter: true, printTitle: true,
  })
  SS.bars(`E${dFirst}:E${dLast}`, 'FFF4A6A6')
  SS.scale(`F${dFirst}:F${dLast}`, { min: 0, mid: 0.5, max: 1, colors: ['FFFFFFFF', 'FFFDE7C8', 'FFF4A6A6'] })
  SS.note(T('حصة الموظف = عجزه ÷ عجز المحطة نفسها (الأعلى حصة هو الأكثر تسبباً). الأرقام حيّة من ورقة «القيود».', 'Employee share = their shortage ÷ the same station’s shortage. All figures are live from the Entries sheet.'), { color: XL.grey, size: 9 })
  SS.finish({ landscape: true })
}

/* ═════════════ فحوصات التدقيق ═════════════ */
export function fillAudit(Au, ctx) {
  const { T, rows, C, rng, subtitle } = ctx
  Au.header({ title: T('فحوصات التدقيق والجودة', 'Audit & quality checks'), subtitle })
  Au.note(T('فحوصات آلية على قيود الفترة: كل فحص يعدّ القيود المخالفة. افلتر عمود «تنبيهات التدقيق» في ورقة القيود لتصل إلى القيد نفسه.', 'Automatic checks on the period’s entries. Filter the “Audit flags” column in the Entries sheet to jump to the offending entries.'), { color: XL.grey })
  const no = T('لا', 'No'), pending = T('قيد المراجعة', 'Pending'), conf = T('مؤكَّد', 'Confirmed'), missing = T('ناقصة', 'Missing'), dupWord = T('تكرار', 'Duplicate')
  const checks = [
    [T('قيود فيها فرق بين المحصَّل والمبيعات', 'Entries with a difference'), T('حرج', 'High'), `COUNTIF(${rng(C.diff)},"<>0")`, rows.filter(r => r.diff !== 0).length, T('رتّب أو افلتر عمود «الفرق»', 'Filter the Difference column')],
    [T('عجز أكّده المحاسب دون تحميله على الموظف', 'Shortage confirmed without charging the employee'), T('حرج', 'High'), `COUNTIFS(${rng(C.def)},">0",${rng(C.ack)},"${no}")`, rows.filter(r => r.def > 0 && r.ackTxt === no).length, T('عمود «إقرار العجز» = لا', 'Column “Acknowledged” = No')],
    [T('عجز بانتظار مراجعة المحاسب وإقراره', 'Shortage awaiting accountant review'), T('متوسط', 'Medium'), `COUNTIFS(${rng(C.def)},">0",${rng(C.ack)},"${T('بانتظار', 'Pending')}")`, rows.filter(r => r.def > 0 && r.ackTxt === T('بانتظار', 'Pending')).length, T('عمود «إقرار العجز» = بانتظار', 'Column “Acknowledged” = Pending')],
    [T('قيود مؤكَّدة وما زال فيها فرق', 'Confirmed entries still showing a difference'), T('حرج', 'High'), `COUNTIFS(${rng(C.status)},"${conf}",${rng(C.diff)},"<>0")`, rows.filter(r => r.confirmed && r.diff !== 0).length, T('راجع المحاسب الذي أكّدها', 'Ask the confirming accountant')],
    [T('تكرار محتمل (نفس اليوم والوردية والمحطة والموظف)', 'Possible duplicates (same day, shift, station, employee)'), T('حرج', 'High'), `COUNTIF(${rng(C.dup)},"${dupWord}")`, rows.filter(r => r.dup).length, T('عمود «تكرار»', 'Column “Duplicate”')],
    [T('قيود لم تُؤكَّد بعد', 'Entries not yet confirmed'), T('متوسط', 'Medium'), `COUNTIF(${rng(C.status)},"${pending}")`, rows.filter(r => !r.confirmed).length, T('عمود «الحالة» = قيد المراجعة', 'Status = Pending')],
    [T('قيود بلا ورقة موازنة مرفقة', 'Entries without an attached balance sheet'), T('متوسط', 'Medium'), `COUNTIF(${rng(C.doc)},"${missing}")`, rows.filter(r => !r.raw.balance_doc_path).length, T('عمود «ورقة الموازنة» = ناقصة', 'Column “Balance sheet” = Missing')],
    [T('قيود بلا رقم صرافة', 'Entries without a cashier number'), T('متوسط', 'Medium'), `SUMPRODUCT(--(LEN(${rng(C.cashier)})=0))`, rows.filter(r => !String(r.cashier || '').length).length, T('عمود «رقم الصرافة» فارغ', 'Cashier column is empty')],
    [T('مدى بلا رقم مرجعي للشبكة', 'Mada without a network reference'), T('متوسط', 'Medium'), `SUMPRODUCT((${rng(C.mada)}>0)*(LEN(${rng(C.net)})=0))`, rows.filter(r => r.mada > 0 && !String(r.net || '').length).length, T('عمود «مرجع شبكة مدى» فارغ', 'Mada reference column is empty')],
    [T('قيود محصَّلها صفر', 'Entries with zero collected'), T('معلومة', 'Info'), `COUNTIF(${rng(C.collected)},0)`, rows.filter(r => r.collected === 0).length, T('قد تكون يوماً بلا مبيعات أو إدخالاً ناقصاً', 'May be a no-sale day or an incomplete entry')],
  ]
  const hr = Au.r + 4
  const first = hr + 1, last = hr + checks.length
  const okN = checks.filter(c => c[3] === 0).length
  const cleanRows = rows.filter(r => !r.alerts).length
  Au.kpis([
    { label: T('فحوصات سليمة', 'Passed checks'), value: { formula: `COUNTIF(E${first}:E${last},"✓*")&" / ${checks.length}"`, result: `${okN} / ${checks.length}` }, color: okN === checks.length ? XL.green : XL.amber, foot: T('من إجمالي الفحوصات', 'of all checks') },
    { label: T('قيود نظيفة (بلا تنبيه)', 'Clean entries'), value: { formula: `COUNTIF(${rng(C.alert)},"")`, result: cleanRows }, fmt: '0', color: XL.green, foot: `${T('من', 'of')} ${rows.length}` },
    { label: T('نسبة الجودة', 'Quality score'), value: { formula: `IFERROR(COUNTIF(${rng(C.alert)},"")/ROWS(${rng(C.alert)}),0)`, result: rows.length ? cleanRows / rows.length : 1 }, fmt: '0%', color: XL.navy, foot: T('قيود نظيفة ÷ كل القيود', 'clean ÷ all entries') },
  ], 2)
  if (Au.r !== hr) throw new Error('audit layout mismatch')
  const sevColor = v => (v === T('حرج', 'High') ? XL.red : v === T('متوسط', 'Medium') ? XL.amber : XL.grey)
  Au.table({
    columns: [{ header: '#', fmt: '0' }, { header: T('الفحص', 'Check'), bold: true }, { header: T('الخطورة', 'Severity'), color: sevColor }, { header: T('العدد', 'Count'), fmt: '0', bold: true }, { header: T('الحالة', 'Status') }, { header: T('كيف تراجعه', 'How to review'), wrap: true }],
    rows: checks.map((c, i) => {
      const r = first + i
      return [i + 1, c[0], c[1], { formula: c[2], result: c[3] }, { formula: `IF(D${r}=0,"${T('✓ سليم', '✓ OK')}","${T('⚠ راجع', '⚠ Review')}")`, result: c[3] === 0 ? T('✓ سليم', '✓ OK') : T('⚠ راجع', '⚠ Review') }, c[4]]
    }),
    rowHeight: 24, zebra: true,
  })
  statusFormat(Au.ws, `E${first}:E${last}`, `E${first}`)
  Au.note(T('الفحوصات تُقرأ من ورقة «القيود» مباشرة، فإذا صحّحت قيداً هناك تتغيّر النتيجة هنا.', 'Checks read the Entries sheet directly, so fixing an entry there updates the result here.'), { color: XL.grey, size: 9 })
  Au.finish({ landscape: false })
}

/* ═════════════ الرسوم البيانية ═════════════ */
export function fillCharts(Ch, ctx) {
  const { T, isAr, rows, subtitle, book } = ctx
  const ws = Ch.ws
  Ch.header({ title: T('الرسوم البيانية', 'Charts'), subtitle })
  Ch.note(T('رسوم ثابتة تُرسم وقت الإصدار من بيانات الفترة (لا تتحدّث مع التعديل اليدوي). الأرقام الحيّة في الأوراق الأخرى.', 'Static charts drawn at export time from the period’s data (they do not follow manual edits). Live figures are in the other sheets.'), { color: XL.grey })
  const add = (png, col, row) => {
    const id = book.wb.addImage({ base64: png, extension: 'png' })
    ws.addImage(id, { tl: { col, row }, ext: { width: 540, height: 270 } })
  }
  const days = [...new Set(rows.map(r => r.date))].sort()
  const sumBy = (key, fn) => { const m = {}; for (const r of rows) m[key(r)] = (m[key(r)] || 0) + fn(r); return m }
  let row = Ch.r
  const slots = []
  if (days.length > 1) {
    const m = sumBy(r => r.date, r => r.collected)
    slots.push(lineChart({ title: T('المحصَّل اليومي', 'Daily collected'), labels: days.map(d => d.slice(5)), values: days.map(d => r2(m[d])), isAr }))
  }
  const pay = [[T('نقداً', 'Cash'), 'cash'], [T('مدى', 'Mada'), 'mada'], ['Visa', 'visa'], ['Mastercard', 'mc'], [T('أخرى', 'Other'), 'other']]
  slots.push(donutChart({ title: T('المحصَّل حسب طريقة الدفع', 'Collected by method'), labels: pay.map(p => p[0]), values: pay.map(([, k]) => Math.round(rows.reduce((a, r) => a + r[k], 0))), colors: ['#264673', '#2563eb', '#EE712D', '#7c3aed', '#6b7280'], isAr }))
  const st = sumBy(r => r.station, r => r.collected)
  const top = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (top.length > 1) slots.push(barChart({ title: T('أعلى المحطات تحصيلاً', 'Top stations by collection'), labels: top.map(t => t[0].slice(0, 14)), values: top.map(t => Math.round(t[1])), isAr }))
  const defSt = Object.entries(sumBy(r => r.station, r => r.def)).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (defSt.length) slots.push(barChart({ title: T('العجز حسب المحطة', 'Shortage by station'), labels: defSt.map(t => t[0].slice(0, 14)), values: defSt.map(t => Math.round(t[1])), color: '#b91c1c', isAr }))
  slots.forEach((png, i) => add(png, (i % 2) * 6, row - 1 + Math.floor(i / 2) * 13))
  Ch.r = row + Math.ceil(slots.length / 2) * 13 + 1
  Ch.finish({ landscape: true })
}

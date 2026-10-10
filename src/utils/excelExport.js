// تصدير Excel احترافي موحّد لكل ملفات التطبيق:
// ترويسة بشعار الشركة وعنوان وفترة وتاريخ الإصدار، جداول منسّقة بفلاتر وتجميد، تظليل شرطي، صيغ حيّة، وإعدادات طباعة A4.
// (exceljs تُحمَّل عند أول تصدير فقط حتى لا تثقل التطبيق)
import { NWB_LOGO_SVG } from './logo'
import { safeImport } from '../lib/chunkReload'

export const XL = {
  navy: 'FF264673', orange: 'FFEE712D', ink: 'FF1D1D1C', grey: 'FF6B7280', light: 'FFF1F5F9', zebra: 'FFF8FAFC',
  line: 'FFD9DEE7', white: 'FFFFFFFF', green: 'FF15803D', amber: 'FFB45309', red: 'FFB91C1C',
}

export const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

// الشعار كصورة PNG (للمتصفح فقط) — لو فشل نكمل بدونه
async function loadLogoBase64() {
  try {
    if (typeof document === 'undefined') return null
    const url = URL.createObjectURL(new Blob([NWB_LOGO_SVG], { type: 'image/svg+xml' }))
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const c = document.createElement('canvas'); c.width = 900; c.height = 450
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(url)
    return c.toDataURL('image/png')
  } catch { return null }
}

// توقيت الرياض ثابت (+3): exceljs يكتب التاريخ كما هو بدون منطقة زمنية، فنزيح الساعات ليظهر الوقت المحلي
export const riyadh = d => (d ? new Date(new Date(d).getTime() + 3 * 3600 * 1000) : null)

const thin = c => ({ style: 'thin', color: { argb: c || XL.line } })
const boxBorder = { top: thin(), left: thin(), bottom: thin(), right: thin() }

export class Sheet {
  constructor(book, ws, widths) {
    this.book = book; this.ws = ws; this.isAr = book.isAr
    this.widths = widths; this.n = widths.length; this.r = 1
    ws.columns = widths.map(w => ({ width: w }))
    ws.views = [{ rightToLeft: this.isAr, showGridLines: false }]
    ws.properties.defaultRowHeight = 18
  }
  get align() { return this.isAr ? 'right' : 'left' }
  fullMerge(r, c1 = 1, c2 = this.n) { if (c2 > c1) this.ws.mergeCells(r, c1, r, c2); return this.ws.getCell(r, c1) }
  rowsFor(text, chars) { return String(text ?? '').split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / Math.max(8, chars))), 0) }
  totalChars(c1 = 1, c2 = this.n) { return this.widths.slice(c1 - 1, c2).reduce((a, b) => a + b, 0) * 1.05 }

  // ترويسة الملف: الشعار + العنوان + السطر الفرعي + خط برتقالي
  header({ title, subtitle }) {
    const ws = this.ws
    ws.getRow(1).height = 26; ws.getRow(2).height = 24; ws.getRow(3).height = 20
    // نحجز أعمدة للشعار (≈ 20 حرفاً عرض)
    let logoCols = 0, acc = 0
    while (acc < 20 && logoCols < this.n - 1) { acc += this.widths[logoCols]; logoCols++ }
    const tc = logoCols + 1
    ws.mergeCells(1, tc, 2, this.n)
    const t = ws.getCell(1, tc)
    t.value = title; t.font = { name: 'Calibri', size: 20, bold: true, color: { argb: XL.navy } }
    t.alignment = { vertical: 'middle', horizontal: this.align, wrapText: true }
    if (subtitle) {
      ws.mergeCells(3, tc, 3, this.n)
      const s = ws.getCell(3, tc); s.value = subtitle
      s.font = { size: 10.5, color: { argb: XL.grey } }; s.alignment = { vertical: 'middle', horizontal: this.align }
    }
    for (let c = 1; c <= this.n; c++) ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: XL.orange } } }
    if (this.book.logoId != null) {
      ws.addImage(this.book.logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 132, height: 66 } })
    }
    this.r = 5
    return this
  }

  // معلومات تعريفية: [[تسمية, قيمة], ...] — كل زوج بصف
  meta(pairs) {
    const ws = this.ws, vEnd = Math.min(this.n, 4)
    for (const [k, v] of pairs.filter(p => p && p[1] !== undefined && p[1] !== '')) {
      const a = ws.getCell(this.r, 1); a.value = k
      a.font = { bold: true, size: 10, color: { argb: XL.navy } }; a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.light } }
      a.alignment = { vertical: 'middle', horizontal: this.align }; a.border = boxBorder
      if (vEnd > 2) ws.mergeCells(this.r, 2, this.r, vEnd)
      const b = ws.getCell(this.r, 2); b.value = v; b.font = { size: 10, color: { argb: XL.ink } }
      b.alignment = { vertical: 'middle', horizontal: this.align, wrapText: true }
      for (let c = 2; c <= vEnd; c++) ws.getCell(this.r, c).border = boxBorder
      this.r++
    }
    this.r++
    return this
  }

  section(title, hint, color = XL.navy) {
    const ws = this.ws
    ws.getRow(this.r).height = 24
    const c = this.fullMerge(this.r)
    c.value = title; c.font = { bold: true, size: 12, color: { argb: XL.white } }
    c.alignment = { vertical: 'middle', horizontal: this.align, indent: 1 }
    for (let i = 1; i <= this.n; i++) ws.getCell(this.r, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    this.r++
    if (hint) { this.note(hint) }
    return this
  }

  // لوحة مؤشرات: items = [{label, value, fmt, color, foot}] — كل مؤشر يشغل span أعمدة
  kpis(items, span = 2) {
    const ws = this.ws, perRow = Math.max(1, Math.floor(this.n / span))
    for (let i = 0; i < items.length; i += perRow) {
      const slice = items.slice(i, i + perRow), r0 = this.r
      ws.getRow(r0).height = 18; ws.getRow(r0 + 1).height = 36; ws.getRow(r0 + 2).height = 16
      slice.forEach((k, j) => {
        const c1 = 1 + j * span, c2 = c1 + span - 1
        for (let rr = 0; rr < 3; rr++) { if (span > 1) ws.mergeCells(r0 + rr, c1, r0 + rr, c2) }
        const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.light } }
        const l = ws.getCell(r0, c1); l.value = k.label; l.font = { size: 9.5, bold: true, color: { argb: XL.grey } }; l.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        const v = ws.getCell(r0 + 1, c1); v.value = k.value; v.numFmt = k.fmt || 'General'
        v.font = { size: 22, bold: true, color: { argb: k.color || XL.navy } }; v.alignment = { horizontal: 'center', vertical: 'middle' }
        const f = ws.getCell(r0 + 2, c1); f.value = k.foot ?? ''; f.font = { size: 9, color: { argb: XL.grey } }; f.alignment = { horizontal: 'center', vertical: 'middle' }
        for (let rr = 0; rr < 3; rr++) for (let c = c1; c <= c2; c++) {
          const cell = ws.getCell(r0 + rr, c); cell.fill = fill
          cell.border = {
            top: rr === 0 ? { style: 'medium', color: { argb: k.color || XL.navy } } : undefined,
            bottom: rr === 2 ? thin() : undefined,
            left: c === c1 ? thin() : undefined, right: c === c2 ? thin() : undefined,
          }
        }
      })
      this.r += 4
    }
    return this
  }

  note(text, { bold = false, color = XL.grey, size = 10 } = {}) {
    const ws = this.ws, c = this.fullMerge(this.r)
    c.value = text; c.font = { size, bold, color: { argb: color } }
    c.alignment = { vertical: 'top', horizontal: this.align, wrapText: true }
    ws.getRow(this.r).height = Math.max(18, this.rowsFor(text, this.totalChars()) * (size + 5))
    this.r++
    return this
  }

  bullets(list) {
    const ws = this.ws
    for (const t of list) {
      const c = this.fullMerge(this.r)
      c.value = `●  ${t}`; c.font = { size: 11, color: { argb: XL.ink } }
      c.alignment = { vertical: 'middle', horizontal: this.align, wrapText: true, indent: 1 }
      ws.getRow(this.r).height = Math.max(22, this.rowsFor(t, this.totalChars() - 6) * 17 + 6)
      this.r++
    }
    this.r++
    return this
  }

  spacer(n = 1) { this.r += n; return this }

  // جدول منسّق. columns: [{header, span?, fmt?, align?, wrap?, color?:(v,row)=>argb, bold?}]؛ rows: مصفوفات؛ القيمة قد تكون {formula, result}
  // span = عدد أعمدة الشبكة التي يشغلها العمود (دمج) — لو ما فيه span يأخذ عموداً واحداً
  table({ columns, rows, startCol = 1, zebra = true, filter = false, freeze = false, totals = null, headerHeight = 30, rowHeight = 19, printTitle = false }) {
    const ws = this.ws, hr = this.r
    const pos = []; { let c = startCol; for (const col of columns) { pos.push([c, c + (col.span || 1) - 1]); c += col.span || 1 } }
    const put = (r, j) => {
      const [c1, c2] = pos[j]
      if (c2 > c1) ws.mergeCells(r, c1, r, c2)
      return { cell: ws.getCell(r, c1), c1, c2 }
    }
    const frame = (r, c1, c2, mk) => { for (let c = c1; c <= c2; c++) { const x = ws.getCell(r, c); x.border = mk(c); if (c > c1) x.fill = ws.getCell(r, c1).fill } }
    ws.getRow(hr).height = headerHeight
    columns.forEach((c, j) => {
      const { cell, c1, c2 } = put(hr, j)
      cell.value = c.header; cell.font = { bold: true, size: 10, color: { argb: XL.white } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.navy } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      frame(hr, c1, c2, cc => ({ top: thin(XL.navy), bottom: { style: 'medium', color: { argb: XL.orange } }, left: cc === c1 ? thin(XL.navy) : undefined, right: cc === c2 ? thin(XL.navy) : undefined }))
    })
    rows.forEach((row, i) => {
      const r = hr + 1 + i
      ws.getRow(r).height = rowHeight
      columns.forEach((c, j) => {
        const { cell, c1, c2 } = put(r, j), v = row[j]
        cell.value = v === undefined ? null : v
        const raw = v && typeof v === 'object' && 'formula' in v ? v.result : v
        if (c.fmt) cell.numFmt = c.fmt
        const isNum = typeof raw === 'number' || raw instanceof Date
        const colr = c.color ? c.color(raw, row) : null
        cell.font = { size: 10, bold: !!c.bold || !!colr, color: { argb: colr || XL.ink } }
        cell.alignment = { vertical: c.wrap ? 'top' : 'middle', horizontal: c.align || (isNum ? 'center' : this.align), wrapText: !!c.wrap }
        if (zebra && i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.zebra } }
        frame(r, c1, c2, () => boxBorder)
      })
    })
    const last = hr + rows.length
    let r = last + 1
    if (totals) {
      ws.getRow(r).height = rowHeight + 3
      columns.forEach((c, j) => {
        const { cell, c1, c2 } = put(r, j), t = totals[j]
        cell.value = t === undefined ? null : t
        if (c.fmt) cell.numFmt = c.fmt
        cell.font = { bold: true, size: 10, color: { argb: XL.navy } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
        cell.alignment = { vertical: 'middle', horizontal: j === 0 ? this.align : 'center' }
        frame(r, c1, c2, () => ({ top: { style: 'medium', color: { argb: XL.navy } }, bottom: thin(), left: thin(), right: thin() }))
      })
      r++
    }
    const endCol = pos[pos.length - 1][1]
    if (filter && rows.length) ws.autoFilter = { from: { row: hr, column: startCol }, to: { row: last, column: endCol } }
    if (freeze) ws.views = [{ rightToLeft: this.isAr, showGridLines: false, state: 'frozen', ySplit: hr, xSplit: typeof freeze === 'number' ? freeze : 0 }]
    if (printTitle) ws.pageSetup.printTitlesRow = `${hr}:${hr}`
    const ref = j => colLetter(pos[j][0])
    this.r = r + 1
    return { header: hr, first: hr + 1, last, ref, range: j => `${ref(j)}${hr + 1}:${ref(j)}${last}`, abs: j => `$${ref(j)}$${hr + 1}:$${ref(j)}$${last}`, pos }
  }

  nextPri() { this._pri = (this._pri || 0) + 1; return this._pri }

  // تظليل شرطي: تدرّج ألوان (أحمر→أصفر→أخضر) أو أشرطة بيانات
  scale(ref, { min = 1, mid = 3, max = 5, reverse = false, colors = null } = {}) {
    const cols = colors ? colors : reverse ? ['FF63BE7B', 'FFFFEB84', 'FFF8696B'] : ['FFF8696B', 'FFFFEB84', 'FF63BE7B']
    this.ws.addConditionalFormatting({ ref, rules: [{ type: 'colorScale', priority: this.nextPri(), cfvo: [{ type: 'num', value: min }, { type: 'num', value: mid }, { type: 'num', value: max }], color: cols.map(argb => ({ argb })) }] })
    return this
  }
  bars(ref, argb = 'FF5B8DEF') {
    this.ws.addConditionalFormatting({ ref, rules: [{ type: 'dataBar', priority: this.nextPri(), minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb } }] })
    return this
  }

  // تذييل + إعدادات الطباعة
  finish({ landscape = false, footerText } = {}) {
    const ws = this.ws
    this.r++
    const c = this.fullMerge(this.r)
    c.value = footerText || (this.isAr ? 'NW Station — نظام تشغيل المحطات · وثيقة داخلية' : 'NW Station — Stations Operations System · Internal document')
    c.font = { size: 9, italic: true, color: { argb: XL.grey } }; c.alignment = { horizontal: 'center' }
    for (let i = 1; i <= this.n; i++) ws.getCell(this.r, i).border = { top: { style: 'thin', color: { argb: XL.orange } } }
    ws.pageSetup = {
      ...ws.pageSetup, paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 }, horizontalCentered: true,
    }
    ws.headerFooter = { oddFooter: '&L&8NW Station&C&8&P / &N&R&8&D' }
    return this
  }
}

export class Book {
  constructor(ExcelJS, { isAr, creator = 'NW Station' }) {
    this.isAr = isAr
    this.wb = new ExcelJS.Workbook()
    this.wb.creator = creator; this.wb.created = new Date()
    this.wb.calcProperties = { fullCalcOnLoad: true }
    this.logoId = null
  }
  async init() {
    const png = await loadLogoBase64()
    if (png) this.logoId = this.wb.addImage({ base64: png, extension: 'png' })
    return this
  }
  sheet(name, widths, { tab = XL.navy } = {}) {
    const safe = String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
    const ws = this.wb.addWorksheet(safe, { properties: { tabColor: { argb: tab } } })
    const s = new Sheet(this, ws, widths); s.name = safe
    return s
  }
  async save(filename) {
    const buf = await this.wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}

export async function createBook(opts) {
  const mod = await safeImport(() => import('exceljs'))
  const ExcelJS = mod.default ?? mod
  return new Book(ExcelJS, opts).init()
}

// تصدير جدول بسيط بنفس الهوية (قائمة موظفين، تقارير…)
// columns: [{header, w, fmt?, align?}] · rows: مصفوفات
export async function exportTableXlsx({ isAr, filename, sheetName, title, subtitle, meta = [], columns, rows, landscape, totals }) {
  const book = await createBook({ isAr })
  const widths = columns.map(c => c.w || 16)
  const sh = book.sheet(sheetName || title, widths)
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const line = [subtitle, ...meta.filter(p => p && p[1] !== undefined && p[1] !== '').map(([k, v]) => `${k}: ${v}`),
    `${isAr ? 'تاريخ الإصدار' : 'Generated'}: ${stamp}`, `${isAr ? 'السجلات' : 'Records'}: ${rows.length}`].filter(Boolean).join('   ·   ')
  sh.header({ title, subtitle: line })
  sh.table({ columns, rows, filter: true, freeze: true, printTitle: true, totals })
  sh.finish({ landscape: landscape ?? columns.length > 6 })
  await book.save(filename)
}

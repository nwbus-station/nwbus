// ملف Excel احترافي لتقرير استبيان العملاء: ملخص تنفيذي بصيغ حيّة + الاستجابات التفصيلية + صوت العميل
import { createBook, riyadh, colLetter, XL } from './excelExport'
import { TRIP_ASPECTS, STATION_ASPECTS } from './feedbackConfig'

const ASPECT_KEYS = [...TRIP_ASPECTS, ...STATION_ASPECTS].map(a => a.key)
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const level = (v, isAr) => (v == null ? '' : v >= 4.5 ? (isAr ? 'ممتاز' : 'Excellent') : v >= 4 ? (isAr ? 'جيد جداً' : 'Very good') : v >= 3 ? (isAr ? 'مقبول' : 'Acceptable') : (isAr ? 'ضعيف' : 'Weak'))
const npsLevel = (v, isAr) => (v == null ? '' : v >= 50 ? (isAr ? 'ممتاز' : 'Excellent') : v >= 30 ? (isAr ? 'جيد جداً' : 'Very good') : v >= 0 ? (isAr ? 'جيد' : 'Good') : (isAr ? 'يحتاج تحسين' : 'Needs improvement'))
const scoreColor = v => (v == null || v === '' ? null : v >= 4 ? XL.green : v >= 3 ? XL.amber : XL.red)
const npsColor = v => (v == null || v === '' ? null : v >= 50 ? XL.green : v >= 0 ? XL.amber : XL.red)
const Q = s => `'${s}'` // اسم الورقة داخل الصيغة

/**
 * rows: صفوف customer_surveys الخام · D/prev: ناتج survey_report · fns: { stName, focusId, lbl, lblO, lblA }
 */
export async function exportSurveyExcel({ isAr, rows, D, prev, summary, from, to, scopeText, fns, filename }) {
  const { stName, focusId, lbl, lblO, lblA } = fns
  const book = await createBook({ isAr })
  const T = (a, e) => (isAr ? a : e)
  const stamp = new Date().toLocaleString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const period = `${from} → ${to}`
  const subtitle = `${T('الفترة', 'Period')}: ${period}   ·   ${T('النطاق', 'Scope')}: ${scopeText}   ·   ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`

  const SUM = T('الملخص التنفيذي', 'Executive Summary'), RESP = T('الاستجابات', 'Responses'), VOICE = T('صوت العميل', 'Voice of Customer')
  const n = rows.length
  const A = ASPECT_KEYS.length

  // ───────── نموذج الصفوف (للقيم المحسوبة بجانب الصيغ) ─────────
  const M = rows.map(r => {
    const vals = ASPECT_KEYS.map(k => (r.ratings?.[k] != null ? Number(r.ratings[k]) : null))
    const nums = vals.filter(v => v != null)
    return {
      r, vals, avg: mean(nums), min: nums.length ? Math.min(...nums) : null,
      st: stName(focusId(r)), trip: r.kind === 'trip',
      nps: r.nps == null ? null : Number(r.nps),
    }
  })

  // ═════════ ورقة الاستجابات (البيانات الخام) ═════════
  const Rcols = [
    { header: '#', span: 1 }, { header: T('التاريخ والوقت', 'Date & time'), fmt: 'dd/mm/yyyy hh:mm' }, { header: T('النوع', 'Type') },
    { header: T('المحطة', 'Station') }, { header: T('من', 'From') }, { header: T('إلى', 'To') }, { header: T('رقم الرحلة', 'Trip no.') },
    { header: 'NPS', fmt: '0' }, { header: T('متوسط التقييم', 'Avg rating'), fmt: '0.00' }, { header: T('أدنى تقييم', 'Lowest'), fmt: '0' },
    ...ASPECT_KEYS.map(k => ({ header: lblA(k), fmt: '0' })),
    { header: T('أولويات التحسين', 'Improvement priorities'), wrap: true }, { header: T('أسباب عدم الرضا', 'Reasons for dissatisfaction'), wrap: true },
    { header: T('الملاحظات', 'Comments'), wrap: true }, { header: T('الفئة العمرية', 'Age group') }, { header: T('نوع المسافر', 'Traveler type') },
    { header: T('غرض الرحلة', 'Trip purpose') }, { header: T('تكرار السفر', 'Frequency') }, { header: T('رقم التواصل', 'Contact number') }, { header: T('اللغة', 'Lang') },
  ]
  const Rw = [6, 17, 9, 22, 18, 18, 11, 7, 10, 9, ...ASPECT_KEYS.map(() => 11), 28, 28, 42, 14, 14, 14, 14, 14, 7]
  const C0 = 10 // فهرس أول عمود تقييم (0-based)
  const L = i => colLetter(i + 1)
  const first = 6, last = 5 + n
  const rng = i => `${Q(RESP)}!$${L(i)}$${first}:$${L(i)}$${last}`
  const blockR = `${Q(RESP)}!$${L(C0)}$${first}:$${L(C0 + A - 1)}$${last}`
  const iType = 2, iSt = 3, iNps = 7, iAvg = 8, iMin = 9, iPhone = C0 + A + 7

  // ═════════ ورقة الملخص (أولاً في الترتيب) ═════════
  const S = book.sheet(SUM, [16, 16, 16, 16, 16, 16, 16, 16], { tab: XL.orange })
  const sheetR = book.sheet(RESP, Rw, { tab: XL.navy })
  const sheetV = book.sheet(VOICE, [14, 9, 24, 11, 70, 16], { tab: 'FF8B5CF6' })

  // ---- الاستجابات ----
  sheetR.header({ title: T('الاستجابات التفصيلية — استبيان العملاء', 'Detailed responses — Customer survey'), subtitle })
  const avgFml = (m, ri) => ({ formula: `IF(COUNT(${L(C0)}${ri}:${L(C0 + A - 1)}${ri})=0,"",AVERAGE(${L(C0)}${ri}:${L(C0 + A - 1)}${ri}))`, result: m.avg ?? '' })
  const minFml = (m, ri) => ({ formula: `IF(COUNT(${L(C0)}${ri}:${L(C0 + A - 1)}${ri})=0,"",MIN(${L(C0)}${ri}:${L(C0 + A - 1)}${ri}))`, result: m.min ?? '' })
  const rowsR = M.map((m, i) => {
    const r = m.r, ri = first + i
    return [
      i + 1, riyadh(r.created_at), m.trip ? T('رحلة', 'Trip') : T('محطة', 'Station'), m.st,
      m.trip ? stName(r.from_station_id) : '', m.trip ? stName(r.to_station_id) : '', r.trip_number ?? '',
      m.nps, avgFml(m, ri), minFml(m, ri), ...m.vals,
      (r.improve ?? []).map(lblO).join('، '), (r.low_reason ?? []).map(lblO).join('، '), r.comment ?? '',
      lbl(r.age_group ?? ''), lbl(r.traveler_type ?? ''), lbl(r.trip_purpose ?? ''), lbl(r.frequency ?? ''), r.contact_phone ?? '', r.lang ?? '',
    ]
  })
  const colorCell = v => scoreColor(typeof v === 'number' ? v : null)
  const tR = sheetR.table({
    columns: Rcols.map((c, j) => (j === iAvg || j === iMin || (j >= C0 && j < C0 + A) ? { ...c, color: colorCell } : j === iNps ? { ...c, color: v => npsColor(typeof v === 'number' ? (v >= 9 ? 100 : v >= 7 ? 0 : -100) : null) } : c)),
    rows: rowsR, filter: true, freeze: 4, printTitle: true, rowHeight: 20,
  })
  if (n) {
    sheetR.scale(`${L(C0)}${first}:${L(C0 + A - 1)}${last}`)
    sheetR.scale(`${L(iAvg)}${first}:${L(iAvg)}${last}`)
  }
  sheetR.finish({ landscape: true })
  void tR

  // ---- صوت العميل ----
  sheetV.header({ title: T('صوت العميل — الملاحظات وطلبات التواصل', 'Voice of customer — comments & contact requests'), subtitle })
  const voiceRows = M.filter(m => m.r.comment || m.r.contact_phone).map(m => [
    riyadh(m.r.created_at), m.trip ? T('رحلة', 'Trip') : T('محطة', 'Station'), m.st, m.avg, m.r.comment ?? '', m.r.contact_phone ?? '',
  ])
  sheetV.table({
    columns: [
      { header: T('التاريخ', 'Date'), fmt: 'dd/mm/yyyy' }, { header: T('النوع', 'Type') }, { header: T('المحطة', 'Station') },
      { header: T('التقييم', 'Rating'), fmt: '0.0', color: colorCell }, { header: T('الملاحظة', 'Comment'), wrap: true }, { header: T('رقم التواصل', 'Contact number') },
    ],
    rows: voiceRows, filter: true, freeze: true, printTitle: true, rowHeight: 34,
  })
  sheetV.finish({ landscape: true })

  // ---- الملخص ----
  S.header({ title: T('تقرير استبيان العملاء', 'Customer Survey Report'), subtitle })
  const total = M.length
  const npsV = D?.score ?? null
  const pro = M.filter(m => m.nps != null && m.nps >= 9).length, det = M.filter(m => m.nps != null && m.nps <= 6).length
  const pas = M.filter(m => m.nps != null && m.nps >= 7 && m.nps <= 8).length
  const npsN = pro + pas + det
  const allVals = M.flatMap(m => m.vals.filter(v => v != null))
  const avgAll = mean(allVals), satAll = allVals.length ? allVals.filter(v => v >= 4).length / allVals.length : null
  const npsCalc = npsN ? Math.round(100 * (pro - det) / npsN) : null
  const lowN = M.filter(m => m.min != null && m.min <= 2).length
  const contactN = M.filter(m => m.r.contact_phone).length
  const tripN = M.filter(m => m.trip).length
  const delta = (cur, old, d = 1, u = '') => {
    if (cur == null || old == null || Number.isNaN(Number(old))) return ''
    const x = Number(cur) - Number(old); if (Math.abs(x) < 0.05 && d > 0) return T('بلا تغيّر عن الفترة السابقة', 'No change vs previous period')
    return `${x > 0 ? '▲' : '▼'} ${Math.abs(x).toFixed(d)}${u} ${T('عن الفترة السابقة', 'vs previous period')}`
  }
  const fR = (f, result) => ({ formula: f, result })
  const nr = rng(iNps)
  S.section(T('المؤشرات الرئيسية', 'Key indicators'))
  S.spacer(0)
  S.kpis([
    { label: T('عدد الاستجابات', 'Responses'), value: total ? fR(`COUNTA(${rng(0)})`, total) : 0, fmt: '#,##0', foot: delta(total, prev?.total, 0) },
    { label: T('صافي نقاط التوصية NPS', 'Net Promoter Score'), value: total ? fR(`IFERROR(ROUND(100*(COUNTIF(${nr},">=9")-COUNTIF(${nr},"<=6"))/COUNT(${nr}),0),"")`, npsCalc ?? '') : '', fmt: '0', color: npsColor(npsCalc) || XL.navy, foot: npsLevel(npsCalc, isAr) },
    { label: T('الرضا العام (من 5)', 'Overall satisfaction (of 5)'), value: total ? fR(`IFERROR(AVERAGE(${blockR}),"")`, avgAll ?? '') : '', fmt: '0.00', color: scoreColor(avgAll) || XL.navy, foot: level(avgAll, isAr) },
    { label: T('نسبة الراضين (4 و5)', 'Satisfied (4 & 5)'), value: total ? fR(`IFERROR(COUNTIF(${blockR},">=4")/COUNT(${blockR}),"")`, satAll ?? '') : '', fmt: '0%', color: satAll == null ? XL.navy : satAll >= 0.8 ? XL.green : satAll >= 0.6 ? XL.amber : XL.red, foot: delta(D?.sat, prev?.sat, 0, '%') },
    { label: T('استجابات الرحلات', 'Trip responses'), value: total ? fR(`COUNTIF(${rng(iType)},"${T('رحلة', 'Trip')}")`, tripN) : 0, fmt: '#,##0' },
    { label: T('استجابات المحطات', 'Station responses'), value: total ? fR(`COUNTIF(${rng(iType)},"${T('محطة', 'Station')}")`, total - tripN) : 0, fmt: '#,##0' },
    { label: T('تقييمات منخفضة (1 أو 2)', 'Low ratings (1 or 2)'), value: total ? fR(`COUNTIF(${rng(iMin)},"<=2")/COUNTA(${rng(0)})`, lowN / total) : 0, fmt: '0%', color: total && lowN / total >= 0.3 ? XL.red : XL.navy, foot: `${lowN} ${T('استجابة', 'responses')}` },
    { label: T('طلبات تواصل', 'Contact requests'), value: total ? fR(`COUNTIF(${rng(iPhone)},"?*")`, contactN) : 0, fmt: '#,##0' },
  ])

  if (summary?.length) { S.section(T('الخلاصة التنفيذية', 'Executive summary')); S.spacer(0); S.bullets(summary) }

  // ولاء العملاء NPS
  S.section(T('توزيع ولاء العملاء (NPS)', 'Customer loyalty distribution (NPS)'), T('داعمون 9–10 · محايدون 7–8 · منتقدون 0–6 — NPS = نسبة الداعمين − نسبة المنتقدين', 'Promoters 9–10 · Passives 7–8 · Detractors 0–6 — NPS = % promoters − % detractors'))
  const npsRows = [
    [T('داعمون', 'Promoters'), fR(`COUNTIF(${nr},">=9")`, pro), fR(`IFERROR(COUNTIF(${nr},">=9")/COUNT(${nr}),0)`, npsN ? pro / npsN : 0)],
    [T('محايدون', 'Passives'), fR(`COUNTIFS(${nr},">=7",${nr},"<=8")`, pas), fR(`IFERROR(COUNTIFS(${nr},">=7",${nr},"<=8")/COUNT(${nr}),0)`, npsN ? pas / npsN : 0)],
    [T('منتقدون', 'Detractors'), fR(`COUNTIF(${nr},"<=6")`, det), fR(`IFERROR(COUNTIF(${nr},"<=6")/COUNT(${nr}),0)`, npsN ? det / npsN : 0)],
  ]
  const tN = S.table({
    columns: [{ header: T('الفئة', 'Category'), span: 2 }, { header: T('العدد', 'Count'), fmt: '#,##0' }, { header: T('النسبة', 'Share'), fmt: '0%' }],
    rows: npsRows, zebra: false,
    totals: [T('الإجمالي (من أجاب على NPS)', 'Total (answered NPS)'), fR(`SUM(C${S.r + 1}:C${S.r + 3})`, npsN), fR(`SUM(D${S.r + 1}:D${S.r + 3})`, npsN ? 1 : 0)],
  })
  S.bars(`D${tN.first}:D${tN.last}`, 'FF5B8DEF')

  // عناصر الخدمة
  S.section(T('أداء عناصر الخدمة', 'Service aspects performance'), T('المتوسط والنسبة محسوبان بصيغ مرتبطة بورقة «الاستجابات» — تتحدث تلقائياً إذا عدّلت البيانات أو صفّيتها', 'Averages and shares are live formulas linked to the “Responses” sheet'))
  const asp = ASPECT_KEYS.map((k, i) => {
    const v = M.map(m => m.vals[i]).filter(x => x != null)
    return { k, i, n: v.length, avg: mean(v), sat: v.length ? v.filter(x => x >= 4).length / v.length : null, trip: TRIP_ASPECTS.some(a => a.key === k) }
  }).filter(a => a.n > 0).sort((a, b) => a.avg - b.avg)
  const aRows = asp.map(a => {
    const rr = rng(C0 + a.i), rowN = S.r + 1 + asp.indexOf(a)
    return [
      lblA(a.k), a.trip ? T('الرحلة', 'Trip') : T('المحطة', 'Station'),
      fR(`COUNT(${rr})`, a.n), fR(`IFERROR(AVERAGE(${rr}),"")`, a.avg), fR(`IFERROR(COUNTIF(${rr},">=4")/COUNT(${rr}),"")`, a.sat),
      fR(`IF(E${rowN}="","",IF(E${rowN}>=4.5,"${T('ممتاز', 'Excellent')}",IF(E${rowN}>=4,"${T('جيد جداً', 'Very good')}",IF(E${rowN}>=3,"${T('مقبول', 'Acceptable')}","${T('ضعيف', 'Weak')}"))))`, level(a.avg, isAr)),
    ]
  })
  const tA = S.table({
    columns: [
      { header: T('العنصر', 'Aspect'), span: 2 }, { header: T('المجال', 'Domain') }, { header: T('عدد التقييمات', 'Ratings'), fmt: '#,##0' },
      { header: T('المتوسط (من 5)', 'Average (of 5)'), fmt: '0.00', color: scoreColor }, { header: T('نسبة الراضين', 'Satisfied %'), fmt: '0%' }, { header: T('المستوى', 'Level'), span: 2 },
    ],
    rows: aRows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5]]),
  })
  if (asp.length) { S.scale(`E${tA.first}:E${tA.last}`); S.bars(`F${tA.first}:F${tA.last}`, 'FF63BE7B') }

  // المحطات
  const byName = new Map()
  M.forEach(m => { if (!byName.has(m.st)) byName.set(m.st, []); byName.get(m.st).push(m) })
  const stats = [...byName.entries()].map(([name, ms]) => {
    const nn = ms.filter(m => m.nps != null), p = nn.filter(m => m.nps >= 9).length, d = nn.filter(m => m.nps <= 6).length
    return { name, n: ms.length, avg: mean(ms.map(m => m.avg).filter(v => v != null)), nps: nn.length ? Math.round(100 * (p - d) / nn.length) : null, low: ms.filter(m => m.min != null && m.min <= 2).length / ms.length }
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
  if (stats.length) {
    S.section(T('أداء المحطات', 'Station performance'), T('مرتبة من الأعلى رضا إلى الأقل — الرحلات تُنسب إلى محطة الركوب', 'Ranked from highest to lowest satisfaction — trips are attributed to the boarding station'))
    const sr = rng(iSt), ar = rng(iAvg), mr = rng(iMin)
    const sRows = stats.map((s, i) => {
      const rowN = S.r + 1 + i, cell = `$B${rowN}`
      return [
        i + 1, s.name, fR(`COUNTIF(${sr},${cell})`, s.n), fR(`IFERROR(AVERAGEIFS(${ar},${sr},${cell}),"")`, s.avg ?? ''),
        fR(`IFERROR(ROUND(100*(COUNTIFS(${sr},${cell},${nr},">=9")-COUNTIFS(${sr},${cell},${nr},"<=6"))/COUNTIFS(${sr},${cell},${nr},">=0"),0),"")`, s.nps ?? ''),
        fR(`IFERROR(COUNTIFS(${sr},${cell},${mr},"<=2")/COUNTIF(${sr},${cell}),0)`, s.low),
        fR(`IF(E${rowN}="","",IF(E${rowN}>=4.5,"${T('ممتاز', 'Excellent')}",IF(E${rowN}>=4,"${T('جيد جداً', 'Very good')}",IF(E${rowN}>=3,"${T('مقبول', 'Acceptable')}","${T('ضعيف', 'Weak')}"))))`, level(s.avg, isAr)),
      ]
    })
    const tS = S.table({
      columns: [
        { header: '#', fmt: '0' }, { header: T('المحطة', 'Station'), span: 2 }, { header: T('الاستجابات', 'Responses'), fmt: '#,##0' },
        { header: T('متوسط الرضا', 'Avg. satisfaction'), fmt: '0.00', color: scoreColor }, { header: 'NPS', fmt: '0', color: npsColor },
        { header: T('تقييمات منخفضة', 'Low ratings'), fmt: '0%' }, { header: T('المستوى', 'Level') },
      ],
      rows: sRows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6]]),
    })
    // الأعمدة بعد الدمج: A=#، B:C=المحطة، D=الاستجابات، E=المتوسط، F=NPS، G=منخفضة، H=المستوى
    S.scale(`E${tS.first}:E${tS.last}`); S.bars(`D${tS.first}:D${tS.last}`, 'FF5B8DEF')
    S.ws.addConditionalFormatting({ ref: `G${tS.first}:G${tS.last}`, rules: [{ type: 'cellIs', operator: 'greaterThanOrEqual', priority: S.nextPri(), formulae: [0.3], style: { font: { color: { argb: XL.red }, bold: true } } }] })
  }

  // الاتجاه عبر الزمن
  const trend = (D?.trend ?? []).filter(t => t.n)
  if (trend.length) {
    S.section(T('اتجاه الرضا عبر الزمن', 'Satisfaction trend over time'), D?.bucket === 'week' ? T('كل صف = أسبوع', 'Each row = one week') : T('كل صف = يوم', 'Each row = one day'))
    const tT = S.table({
      columns: [{ header: T('الفترة', 'Period'), span: 2 }, { header: T('الاستجابات', 'Responses'), fmt: '#,##0' }, { header: T('متوسط الرضا', 'Avg. satisfaction'), fmt: '0.00', color: scoreColor }, { header: 'NPS', fmt: '0', color: npsColor }],
      rows: trend.map(t => [t.d, t.n, t.avg == null ? '' : Number(t.avg), t.nps == null ? '' : Number(t.nps)]),
    })
    S.scale(`D${tT.first}:D${tT.last}`); S.bars(`C${tT.first}:C${tT.last}`, 'FFB6C4D8')
  }

  // أولويات التحسين وأسباب عدم الرضا
  const cnt = (items, title) => {
    if (!items?.length) return
    S.section(title)
    const tt = S.table({
      columns: [{ header: T('البند', 'Item'), span: 3 }, { header: T('العدد', 'Count'), fmt: '#,##0' }, { header: T('نسبة العملاء', 'Share of customers'), fmt: '0%' }],
      rows: items.slice(0, 12).map(x => [lblO(x.k), x.n, total ? x.n / total : 0]),
    })
    S.bars(`E${tt.first}:E${tt.last}`, 'FFEE712D')
  }
  cnt(D?.improve, T('أولويات التحسين', 'Improvement priorities'))
  cnt(D?.reasons, T('أسباب عدم الرضا', 'Reasons for dissatisfaction'))

  // الشرائح
  const segs = [[T('الفئة العمرية', 'Age group'), D?.age], [T('نوع المسافر', 'Traveler type'), D?.traveler], [T('غرض الرحلة', 'Trip purpose'), D?.purpose], [T('تكرار السفر', 'Travel frequency'), D?.freq]]
  const segRows = segs.flatMap(([dim, items]) => (items ?? []).map((g, i) => [i === 0 ? dim : '', lbl(g.k), g.n, g.avg == null ? '' : Number(g.avg), g.nps == null ? '' : Number(g.nps)]))
  if (segRows.length) {
    S.section(T('شرائح العملاء', 'Customer segments'))
    const tG = S.table({
      columns: [{ header: T('البُعد', 'Dimension'), span: 2, bold: true }, { header: T('الفئة', 'Category'), span: 2 }, { header: T('الاستجابات', 'Responses'), fmt: '#,##0' }, { header: T('متوسط الرضا', 'Avg. satisfaction'), fmt: '0.00', color: scoreColor }, { header: 'NPS', fmt: '0', color: npsColor }],
      rows: segRows, zebra: false,
    })
    S.scale(`F${tG.first}:F${tG.last}`); S.bars(`E${tG.first}:E${tG.last}`, 'FFB6C4D8')
  }

  // منهجية الحساب
  S.section(T('منهجية الحساب', 'Methodology'))
  S.bullets(isAr ? [
    'التقييم من 1 (الأسوأ) إلى 5 (الأفضل). الرضا العام = متوسط كل التقييمات المُدخلة. نسبة الراضين = تقييمات 4 و5 من إجمالي التقييمات.',
    'NPS = نسبة الداعمين (9–10) ناقص نسبة المنتقدين (0–6)، ويتراوح من −100 إلى +100. من 50 فأكثر ممتاز، 30 فأكثر جيد جداً، 0 فأكثر جيد.',
    'التقييم المنخفض: أي استجابة فيها تقييم 1 أو 2 لأي عنصر. الرحلات تُنسب إلى محطة الركوب.',
    'الأرقام في هذه الورقة صيغ حيّة مرتبطة بورقة «الاستجابات»؛ عند تصفية الورقة أو تعديلها تتحدّث مباشرة. قسم الاتجاه والشرائح من حساب النظام للفترة.',
    'الأوقات بتوقيت الرياض. يحتوي الملف على بيانات شخصية اختيارية (أرقام تواصل) — للاستخدام الداخلي ويُتعامل معه وفق سياسة الخصوصية.',
  ] : [
    'Ratings run from 1 (worst) to 5 (best). Overall satisfaction = mean of all ratings given. Satisfied % = ratings of 4 and 5 over all ratings.',
    'NPS = % promoters (9–10) minus % detractors (0–6), from −100 to +100. 50+ excellent, 30+ very good, 0+ good.',
    'Low rating: any response with a 1 or 2 on any aspect. Trips are attributed to the boarding station.',
    'Figures on this sheet are live formulas linked to the “Responses” sheet and update if you filter or edit it. Trend and segments come from the system calculation for the period.',
    'Times are Riyadh time. The file contains optional personal data (contact numbers) — internal use only, handled under the privacy policy.',
  ])
  S.finish({ landscape: false })

  await book.save(filename)
}

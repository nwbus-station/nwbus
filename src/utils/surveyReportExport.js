// تصدير تقرير التقييم اليومي للركاب (Excel بهوية الشركة): ملخص + المحطات + الموظفون + تفاصيل كل تقييم
import { createBook, XL } from './excelExport'

const LABEL = { 1: 'سيئ جداً', 2: 'سيئ', 3: 'محايد', 4: 'جيد', 5: 'ممتاز' }
const DEF = Object.freeze([5, 4, 3, 2, 1])
const timeOf = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
const avgOf = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)
const r2 = v => (v == null ? '' : Math.round(v * 100) / 100)

/**
 * groups: [{ name, list: [{ u, perDay, counts, present, doneDays, evaded, ratings, avg, total, st }], counts, present, evaded, total, compliance, avg, ratings }]
 * ctx: { from, to, N, single, need, total, compliance, allRatings, stationF, counts, present, accounts, dayText }
 */
export async function exportSurveyExcel({ groups, ctx }) {
  const { from, to, N, single, need, total, compliance, allRatings, stationF, counts = {}, present = 0, dayText } = ctx
  const ST = { done: 'أكمل التقييم', evaded: 'قيّم جزءاً وأغلق', skipped: 'فتح التقييم وأغلق', noshow: 'دخل دون تقييم', nocity: 'محطته بلا استبيان', restored: 'أكمل (قبل التصفير)', progress: 'يقيّم الآن', leave: 'في إجازة', off: 'لم يسجّل دخول' }
  const evadeN = (counts.evaded || 0) + (counts.skipped || 0)
  const book = await createBook({ isAr: true })
  const stamp = new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const subtitle = `${single ? 'اليوم' : 'الفترة'}: ${single ? from : `${from} → ${to} (${N} يوماً)`}   ·   ${stationF ? 'المحطة: ' + stationF : 'كل المحطات'}   ·   تاريخ الإصدار: ${stamp}`
  const stColor = v => (/أكمل/.test(v) ? XL.green : /أغلق|تهرّب|دون تقييم/.test(v) ? XL.red : XL.amber)
  const stOf = r => (single ? (dayText ? dayText(r.perDay[0], need) : ST[r.st]) : `أكمل ${r.doneDays} · تهرّب ${r.evaded} · حضور ${r.present} من ${N}`)

  // ═════════ الملخص ═════════
  const S = book.sheet('الملخص', [24, 14, 14, 14, 14, 12, 12, 12, 12, 12], { tab: XL.orange })
  S.header({ title: 'تقرير التقييم اليومي للركاب', subtitle })
  S.section('نظرة سريعة')
  S.spacer(0)
  S.kpis([
    { label: single ? 'حضروا' : 'أيام حضور', value: present, fmt: '0', color: XL.green, foot: `من ${ctx.accounts * N}` },
    { label: 'إجمالي التقييمات', value: total, fmt: '#,##0', foot: single ? 'تقييم اليوم' : `خلال ${N} يوم` },
    { label: 'نسبة الالتزام', value: compliance / 100, fmt: '0%', color: compliance >= 80 ? XL.green : compliance >= 50 ? XL.amber : XL.red, foot: `من الحاضرين · المطلوب ${need} يومياً` },
    { label: 'متوسط رضا الركاب', value: r2(avgOf(allRatings)) || '—', fmt: '0.00', foot: `من 5 · ${allRatings.length} نتيجة مسجّلة` },
    { label: 'حالات تهرّب', value: evadeN, fmt: '0', color: evadeN ? XL.red : XL.green, foot: `جزئي ${counts.evaded || 0} · كامل ${counts.skipped || 0}` },
  ], 2)

  S.section('توزيع نتائج الركاب')
  const dist = DEF.map(n => [LABEL[n], allRatings.filter(x => x === n).length])
  const tD = S.table({
    columns: [{ header: 'النتيجة', bold: true }, { header: 'العدد', fmt: '#,##0' }, { header: 'النسبة', fmt: '0.0%' }],
    rows: dist.map(([l, c]) => [l, c, allRatings.length ? c / allRatings.length : 0]),
  })
  S.bars(`B${tD.first}:B${tD.last}`, 'FFA9C4EB')

  S.section('المحطات')
  const tS = S.table({
    columns: [{ header: 'المحطة', bold: true }, { header: 'الحسابات', fmt: '0' }, { header: 'التقييمات', fmt: '#,##0', bold: true }, { header: 'الالتزام', fmt: '0%' }, { header: 'متوسط الرضا', fmt: '0.00', bold: true },
      { header: 'تهرّب', fmt: '0' }, { header: 'دخل دون تقييم', fmt: '0' }, { header: 'لم يسجّل دخول', fmt: '0' }],
    rows: groups.map(g => [g.name, g.list.length, g.total, (g.compliance ?? 0) / 100, r2(g.avg) || '', g.evaded, g.counts.noshow || 0, g.counts.off || 0]),
    totals: groups.length ? ['الإجمالي', groups.reduce((a, g) => a + g.list.length, 0), total, compliance / 100, r2(avgOf(allRatings)) || '', evadeN, counts.noshow || 0, counts.off || 0] : null,
  })
  if (groups.length) {
    S.bars(`C${tS.first}:C${tS.last}`, 'FFA9C4EB')
    S.scale(`E${tS.first}:E${tS.last}`, { min: 1, mid: 3, max: 5, colors: ['FFF8696B', 'FFFFEB84', 'FF63BE7B'] })
    S.scale(`D${tS.first}:D${tS.last}`, { min: 0, mid: 0.5, max: 1, colors: ['FFF8696B', 'FFFFEB84', 'FF63BE7B'] })
  }
  S.note('الالتزام = أيام الإكمال ÷ أيام الحضور (الحضور من القاعدة: دخول، ظهور صفحة التقييم، أو إدخال رحلات وإيرادات). التهرّب = بدأ التقييم وأغلق قبل إكمال العدد.', { size: 9 })
  S.finish({ landscape: true })

  // ═════════ الموظفون ═════════
  const E = book.sheet('الموظفون', [26, 28, 14, 11, 13, 12, 11, 9, 9, 9, 9, 9, 12, 12], { tab: XL.navy })
  E.header({ title: 'التقييم حسب الموظف', subtitle })
  const empRows = groups.flatMap(g => g.list.map(r => { const evs = r.perDay.flatMap(x => x.evs); return [g.name, r.u.full_name_ar, r.u.job_number ?? '', r.total, single ? `${Math.min(r.total, need)} / ${need}` : `${r.doneDays} من ${r.present} يوم حضور`, stOf(r), r2(r.avg) || '',
    ...DEF.map(n => r.ratings.filter(x => x === n).length), evs.length ? timeOf(evs[0].created_at) : '', evs.length ? timeOf(evs[evs.length - 1].created_at) : ''] }))
  E.table({
    columns: [{ header: 'المحطة', bold: true }, { header: 'الموظف' }, { header: 'الرقم الوظيفي' }, { header: 'التقييمات', fmt: '0', bold: true }, { header: single ? 'المطلوب' : 'الإكمال', align: 'center' },
      { header: 'الحالة', align: 'center', color: stColor }, { header: 'متوسط الرضا', fmt: '0.00' }, ...DEF.map(n => ({ header: LABEL[n], fmt: '0' })), { header: 'أول تقييم', align: 'center' }, { header: 'آخر تقييم', align: 'center' }],
    rows: empRows, filter: true, freeze: 5, printTitle: true,
  })
  E.finish({ landscape: true })

  // ═════════ تفاصيل كل تقييم ═════════
  const D = book.sheet('تفاصيل التقييمات', [13, 10, 26, 28, 14, 9, 14], { tab: XL.green })
  D.header({ title: 'تفاصيل كل تقييم (من قيّم، متى، وماذا كانت النتيجة)', subtitle })
  const det = groups.flatMap(g => g.list.flatMap(r => r.perDay.flatMap(x => x.evs).map(e => [e.day, timeOf(e.created_at), g.name, r.u.full_name_ar, r.u.job_number ?? '', e.rating ?? '', e.rating ? LABEL[e.rating] : 'غير مسجّلة'])))
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])))
  const tDet = D.table({
    columns: [{ header: 'التاريخ', bold: true }, { header: 'الوقت', align: 'center' }, { header: 'المحطة' }, { header: 'الموظف', bold: true }, { header: 'الرقم الوظيفي' }, { header: 'الدرجة', fmt: '0', align: 'center' }, { header: 'التقييم', align: 'center' }],
    rows: det, filter: true, freeze: 5, printTitle: true,
  })
  if (det.length) D.scale(`F${tDet.first}:F${tDet.last}`, { min: 1, mid: 3, max: 5, colors: ['FFF8696B', 'FFFFEB84', 'FF63BE7B'] })
  D.note('الأيام السابقة لتفعيل سجل التفاصيل تظهر في الملخص والموظفين بالعدد فقط، ولا تظهر هنا.', { size: 9 })
  D.finish({ landscape: false })

  await book.save(`تقييم_الركاب_${from}${single ? '' : '_' + to}`)
}

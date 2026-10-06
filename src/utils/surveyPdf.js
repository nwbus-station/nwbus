// تقرير استبيان العملاء للطباعة / الحفظ PDF — A4 عمودي بهوية الشركة
import { NWB_LOGO_SVG } from './logo'

const NAVY = '#264673', ORANGE = '#EE712D'
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const f1 = n => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(1))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const col = (v, good = 4, mid = 3) => (v == null ? '#94a3b8' : v >= good ? '#15803d' : v >= mid ? '#b45309' : '#b91c1c')
const colNps = v => (v == null ? '#94a3b8' : v >= 50 ? '#15803d' : v >= 0 ? '#b45309' : '#b91c1c')
const bg = c => ({ '#15803d': '#dcfce7', '#b45309': '#fef3c7', '#b91c1c': '#fee2e2', '#94a3b8': '#f1f5f9' }[c] || '#f1f5f9')

function delta(cur, old, { d = 1, unit = '', isAr }) {
  if (cur == null || old == null || Number.isNaN(Number(old))) return ''
  const x = Number(cur) - Number(old)
  if (Math.abs(x) < Math.pow(10, -d) / 2) return `<span class="dl neu">${isAr ? 'بلا تغيّر' : 'No change'}</span>`
  return `<span class="dl ${x > 0 ? 'up' : 'dn'}">${x > 0 ? '▲' : '▼'} ${Math.abs(x).toFixed(d)}${unit}</span>`
}

function bars(items, total, color = NAVY) {
  return items.map(({ label, n }) => `<div class="br"><span class="bl">${esc(label)}</span><span class="bt"><i style="width:${Math.min(100, pct(n, total))}%;background:${color}"></i></span><b class="bv">${pct(n, total)}%<small> (${n})</small></b></div>`).join('')
}

function scoreBars(items, lblA) {
  return items.map(a => {
    const c = col(a.avg)
    return `<div class="br"><span class="bl">${esc(lblA(a.k))}</span><span class="bt"><i style="width:${Math.max(2, (a.avg / 5) * 100)}%;background:${c}"></i></span><b class="bv" style="color:${c}">${f1(a.avg)}</b></div>`
  }).join('')
}

function trendSvg(data, isAr) {
  if (!data?.length) return ''
  const W = 700, H = 200, padL = 30, padR = 12, padT = 12, padB = 26
  const maxN = Math.max(...data.map(p => p.n), 1)
  const step = (W - padL - padR) / data.length
  const x = i => padL + step * i + step / 2
  const yA = v => padT + (H - padT - padB) * (1 - (v - 1) / 4)
  const yB = n => H - padB - (H - padT - padB) * 0.5 * (n / maxN)
  const dl = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const pts = data.filter(p => p.avg != null)
  const line = pts.map(p => `${x(data.indexOf(p)).toFixed(1)},${yA(p.avg).toFixed(1)}`).join(' ')
  const grid = [1, 2, 3, 4, 5].map(v => `<line x1="${padL}" x2="${W - padR}" y1="${yA(v)}" y2="${yA(v)}" stroke="#e8edf3"/><text x="${padL - 6}" y="${yA(v) + 3}" font-size="9" fill="#94a3b8" text-anchor="end">${v}</text>`).join('')
  const rects = data.map((p, i) => `<rect x="${(x(i) - Math.min(14, step / 2.6)).toFixed(1)}" y="${yB(p.n).toFixed(1)}" width="${Math.min(28, step / 1.3).toFixed(1)}" height="${(H - padB - yB(p.n)).toFixed(1)}" rx="2" fill="#dbe4f0"/>`).join('')
  const dots = pts.map(p => `<circle cx="${x(data.indexOf(p)).toFixed(1)}" cy="${yA(p.avg).toFixed(1)}" r="3.2" fill="${NAVY}"/>`).join('')
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map(i => `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="9" fill="#64748b" text-anchor="middle">${dl(data[i].d)}</text>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="trend">${grid}${rects}${pts.length > 1 ? `<polyline points="${line}" fill="none" stroke="${NAVY}" stroke-width="2.2" stroke-linejoin="round"/>` : ''}${dots}${labels}</svg>
  <div class="lg"><span><i class="ln"></i>${isAr ? 'متوسط الرضا (من 5)' : 'Avg. satisfaction (of 5)'}</span><span><i class="bx"></i>${isAr ? 'عدد الاستجابات' : 'Responses'}</span></div>`
}

/**
 * opts: { isAr, D, prev, summary, from, to, scopeText, stations (مرتبة), voice, fns: { lbl, lblO, lblA, repName, stName, focusId, avgOfRow }, npsLevel, scoreLevel }
 */
export function buildSurveyReportHtml(o) {
  const { isAr, D, prev, summary, from, to, scopeText, stations = [], voice = [], fns, npsLevel, scoreLevel } = o
  const { lbl, lblO, lblA, repName, stName, focusId, avgOfRow } = fns
  const T = (a, e) => (isAr ? a : e)
  const dir = isAr ? 'rtl' : 'ltr'
  const loc = isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB'
  const now = new Date().toLocaleString(loc, { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
  const fmtD = d => d.split('-').reverse().join('/')
  const period = `${fmtD(from)} – ${fmtD(to)}`
  const prevScore = prev?.nps?.n ? Math.round(((prev.nps.pro - prev.nps.det) / prev.nps.n) * 100) : null
  const prevAvg = prev?.avg == null ? null : Number(prev.avg), prevSat = prev?.sat == null ? null : Number(prev.sat)
  const title = T('تقرير استبيان العملاء', 'Customer Survey Report')
  const docTitle = `${isAr ? 'استبيان-العملاء' : 'customer-survey'}-${from}_${to}`

  const kpi = (label, value, c, foot, sub) => `<div class="kpi" style="border-top-color:${c}"><p class="kl">${label}</p><p class="kv" style="color:${c}">${value}</p><p class="ks">${sub || '&nbsp;'}</p><p class="kf">${foot || '&nbsp;'}</p></div>`
  const sorted = stations.slice().sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))

  const chip = v => `<span class="chip" style="color:${col(v)};background:${bg(col(v))}">${f1(v)}</span>`
  const stRows = sorted.map((s, i) => `<tr><td class="c">${i + 1}</td><td class="nm">${esc(repName(s))}</td><td class="c">${s.n}</td><td class="c">${chip(s.avg)}</td><td class="c lv" style="color:${col(s.avg)}">${esc(scoreLevel(s.avg, isAr))}</td><td class="c b" dir="ltr" style="color:${colNps(s.nps)}">${s.nps ?? '—'}</td><td class="c" style="color:${s.low >= 30 ? '#b91c1c' : '#475569'};font-weight:${s.low >= 30 ? 700 : 400}">${s.low ?? 0}%</td></tr>`).join('')

  const seg = (ttl, items) => !items?.length ? '' : `<div class="card sm"><h4>${ttl}</h4><table class="t mini"><thead><tr><th>${T('الفئة', 'Category')}</th><th>${T('العدد', 'No.')}</th><th>${T('الرضا', 'Sat.')}</th><th>NPS</th></tr></thead><tbody>${items.map(g => `<tr><td class="nm">${esc(lbl(g.k))}</td><td class="c">${g.n}</td><td class="c">${chip(g.avg == null ? null : Number(g.avg))}</td><td class="c b" dir="ltr" style="color:${colNps(g.nps == null ? null : Number(g.nps))}">${g.nps ?? '—'}</td></tr>`).join('')}</tbody></table></div>`

  const voiceHtml = voice.filter(r => r.comment).slice(0, 12).map(r => {
    const sc = avgOfRow(r)
    return `<div class="vq" style="border-inline-start-color:${col(sc)}"><div class="vm"><span class="tag">${r.kind === 'trip' ? T('رحلة', 'Trip') : T('محطة', 'Station')}</span><b dir="auto">${esc(stName(focusId(r)))}</b>${chip(sc)}<span class="dt">${new Date(r.created_at).toLocaleDateString(loc, { timeZone: 'Asia/Riyadh' })}</span></div><p dir="auto">${esc(r.comment)}</p></div>`
  }).join('')

  const nps = D.nps ?? {}
  const npsBlock = nps.n > 0 ? `
    <div class="card"><h3>${T('توزيع ولاء العملاء', 'Customer loyalty distribution')}<small>${T('منتقدون 0–6 · محايدون 7–8 · داعمون 9–10', 'Detractors 0–6 · Passives 7–8 · Promoters 9–10')}</small></h3>
      <div class="stack"><i style="width:${pct(nps.det, nps.n)}%;background:#ef4444"></i><i style="width:${pct(nps.pas, nps.n)}%;background:#fbbf24"></i><i style="width:${pct(nps.pro, nps.n)}%;background:#22c55e"></i></div>
      <div class="tri"><div><b style="color:#dc2626">${pct(nps.det, nps.n)}%</b><span>${T('منتقدون', 'Detractors')} (${nps.det})</span></div><div><b style="color:#d97706">${pct(nps.pas, nps.n)}%</b><span>${T('محايدون', 'Passives')} (${nps.pas})</span></div><div><b style="color:#15803d">${pct(nps.pro, nps.n)}%</b><span>${T('داعمون', 'Promoters')} (${nps.pro})</span></div></div>
    </div>` : ''

  const tripA = (D.tripAspects ?? []).filter(a => a.avg != null), stA = (D.stationAspects ?? []).filter(a => a.avg != null)

  return `<!doctype html><html lang="${isAr ? 'ar' : 'en'}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<style>
@page{size:A4 portrait;margin:14mm 12mm 16mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,'Geeza Pro',Arial,sans-serif;color:#1e293b;font-size:11.5px;line-height:1.55;background:#fff}
h1,h2,h3,h4,p{margin:0}
.hd{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:10px;border-bottom:3px solid ${ORANGE}}
.hd .logo{width:130px;flex:none}.hd .logo svg{width:130px;height:65px;display:block}
.hd .tt{flex:1;text-align:start}.hd h1{font-size:25px;font-weight:800;color:${NAVY};letter-spacing:-.2px}.hd p{color:#64748b;font-size:12px;margin-top:2px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:12px 0 14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.meta div{padding:7px 10px;border-inline-end:1px solid #e2e8f0;background:#f8fafc}.meta div:last-child{border-inline-end:0}
.meta span{display:block;font-size:9.5px;color:#64748b;font-weight:600}.meta b{font-size:12px;color:${NAVY}}.meta b[dir=ltr]{white-space:nowrap;unicode-bidi:isolate}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi{border:1px solid #e2e8f0;border-top:4px solid ${NAVY};border-radius:8px;padding:10px 10px 8px;background:#fff;text-align:center;break-inside:avoid}
.kl{font-size:10px;color:#64748b;font-weight:600;min-height:26px}.kv{font-size:30px;font-weight:800;line-height:1.15;margin-top:2px}.ks{font-size:11px;font-weight:700;color:#475569;min-height:16px}.kf{font-size:10px;min-height:15px;margin-top:3px}
.dl{font-weight:700;font-size:10px}.dl.up{color:#15803d}.dl.dn{color:#b91c1c}.dl.neu{color:#94a3b8}
.sec{margin-top:16px}
.sec>h2{font-size:14px;color:#fff;background:${NAVY};padding:6px 12px;border-radius:6px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;break-after:avoid}
.sec>h2 small{font-weight:400;font-size:10px;opacity:.85}
.card{border:1px solid #e2e8f0;border-radius:8px;padding:11px 13px;background:#fff;break-inside:avoid;margin-bottom:10px}
.card h3{font-size:12.5px;color:${NAVY};margin-bottom:8px;display:flex;flex-direction:column;gap:1px}.card h3 small{font-weight:400;color:#94a3b8;font-size:10px}
.card h4{font-size:11.5px;color:${NAVY};margin-bottom:6px}
.sum{margin:0;padding:0;list-style:none}.sum li{position:relative;padding-inline-start:16px;margin-bottom:6px}.sum li:before{content:'';position:absolute;inset-inline-start:2px;top:7px;width:6px;height:6px;border-radius:50%;background:${ORANGE}}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.two>.card{margin-bottom:0}
.br{display:grid;grid-template-columns:34% 1fr auto;gap:8px;align-items:center;margin-bottom:6px}.bl{font-size:11px;color:#334155}
.bt{height:7px;background:#eef2f7;border-radius:4px;overflow:hidden;display:block}.bt i{display:block;height:7px;border-radius:4px}.bv{font-size:11px;min-width:50px;text-align:end}.bv small{font-weight:400;color:#94a3b8}
.stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#eef2f7;margin:4px 0 12px}.stack i{display:block;height:14px}
.tri{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}.tri div{background:#f8fafc;border-radius:8px;padding:8px}.tri b{display:block;font-size:20px}.tri span{font-size:10px;color:#64748b}
.lg{display:flex;gap:16px;font-size:10px;color:#64748b;margin-top:2px}.lg i.ln{display:inline-block;width:14px;height:2px;background:${NAVY};vertical-align:middle;margin-inline-end:5px}.lg i.bx{display:inline-block;width:10px;height:10px;background:#dbe4f0;vertical-align:middle;margin-inline-end:5px;border-radius:2px}
table.t{width:100%;border-collapse:collapse;font-size:11px}.t th{background:#f1f5f9;color:#475569;font-weight:700;padding:6px 6px;font-size:10px;border-bottom:2px solid ${ORANGE};text-align:center}
.t th:nth-child(2){text-align:start}.t td{padding:5px 6px;border-bottom:1px solid #eef2f7}.t tr{break-inside:avoid}.t thead{display:table-header-group}.t tbody tr:nth-child(even) td{background:#fafbfd}
.c{text-align:center}.nm{text-align:start;font-weight:600;color:#0f172a}.b{font-weight:700}.lv{font-size:10px;font-weight:700}
.chip{display:inline-block;min-width:34px;padding:1px 7px;border-radius:10px;font-weight:700;font-size:11px;text-align:center}
.mini th:first-child{text-align:start}.mini th{padding:4px}.mini td{padding:4px;font-size:10.5px}.card.sm{margin-bottom:0}
.vq{border-inline-start:4px solid #94a3b8;background:#f8fafc;border-radius:0 6px 6px 0;padding:7px 11px;margin-bottom:7px;break-inside:avoid}
.vm{display:flex;align-items:center;gap:8px;font-size:10.5px;margin-bottom:3px}.vm .tag{background:#e0e7ff;color:#3730a3;padding:0 7px;border-radius:9px;font-size:9.5px;font-weight:700}.vm .dt{color:#94a3b8;margin-inline-start:auto}
.vq p{font-size:11.5px;white-space:pre-wrap}
.method{font-size:10px;color:#64748b;margin-top:6px;line-height:1.7}.method b{color:${NAVY}}
.ft{position:fixed;bottom:-11mm;left:0;right:0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px}
@media screen{body{max-width:210mm;margin:0 auto;padding:12mm}.ft{position:static;margin-top:18px}}
</style></head><body>
<div class="ft"><span>NW Station · ${esc(title)}</span><span>${T('سري — للاستخدام الداخلي', 'Confidential — internal use')}</span><span dir="ltr">${esc(period)}</span></div>

<div class="hd"><div class="tt"><h1>${title}</h1><p>${T('مؤشرات تجربة الراكب في الرحلات والمحطات', 'Passenger experience indicators for trips and stations')}</p></div><div class="logo">${NWB_LOGO_SVG}</div></div>
<div class="meta">
  <div><span>${T('الفترة', 'Period')}</span><b dir="ltr">${esc(period)}</b></div>
  <div><span>${T('النطاق', 'Scope')}</span><b>${esc(scopeText)}</b></div>
  <div><span>${T('عدد الاستجابات', 'Responses')}</span><b>${D.total}</b></div>
  <div><span>${T('تاريخ الإصدار', 'Generated')}</span><b>${esc(now)}</b></div>
</div>

<div class="kpis">
  ${kpi(T('عدد الاستجابات', 'Responses'), D.total, NAVY, delta(D.total, prev?.total, { d: 0, isAr }))}
  ${kpi(T('صافي نقاط التوصية NPS', 'Net Promoter Score'), D.score ?? '—', colNps(D.score), delta(D.score, prevScore, { d: 0, isAr }), npsLevel(D.score, isAr))}
  ${kpi(T('الرضا العام (من 5)', 'Overall satisfaction (of 5)'), f1(D.avg), col(D.avg), delta(D.avg, prevAvg, { isAr }), scoreLevel(D.avg, isAr))}
  ${kpi(T('نسبة العملاء الراضين', 'Satisfied customers'), D.sat == null ? '—' : `${D.sat}%`, col(D.sat, 80, 60), delta(D.sat, prevSat, { d: 0, unit: '%', isAr }))}
</div>

<div class="card"><h3>${T('الخلاصة التنفيذية', 'Executive summary')}</h3><ul class="sum">${summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
${npsBlock}

<div class="sec"><h2>${T('اتجاه الرضا عبر الزمن', 'Satisfaction trend over time')}<small>${D.bucket === 'week' ? T('كل نقطة = أسبوع', 'each point = week') : T('كل نقطة = يوم', 'each point = day')}</small></h2><div class="card">${trendSvg(D.trend, isAr)}</div></div>

<div class="sec"><h2>${T('أداء عناصر الخدمة', 'Service aspects performance')}<small>${T('متوسط التقييم من 5 · الأضعف أولاً', 'average out of 5 · weakest first')}</small></h2>
  <div class="two">
    ${tripA.length ? `<div class="card"><h3>${T('عناصر الرحلة', 'Trip aspects')}</h3>${scoreBars(tripA, lblA)}</div>` : ''}
    ${stA.length ? `<div class="card"><h3>${T('عناصر المحطة', 'Station aspects')}</h3>${scoreBars(stA, lblA)}</div>` : ''}
  </div>
</div>

<div class="sec"><h2>${T('أولويات العملاء', 'Customer priorities')}</h2>
  <div class="two">
    <div class="card"><h3>${T('أولويات التحسين', 'Improvement priorities')}<small>${T('نسبة العملاء الذين اختاروا كل بند', 'share of customers selecting each item')}</small></h3>${bars((D.improve ?? []).slice(0, 8).map(x => ({ label: lblO(x.k), n: x.n })), D.total, NAVY) || `<p>${T('لا توجد بيانات', 'No data')}</p>`}</div>
    ${(D.reasons ?? []).length ? `<div class="card"><h3>${T('أسباب عدم الرضا', 'Reasons for dissatisfaction')}<small>${T('من العملاء ذوي التقييم المنخفض', 'from customers with a low rating')}</small></h3>${bars(D.reasons.slice(0, 8).map(x => ({ label: lblO(x.k), n: x.n })), D.total, '#dc2626')}</div>` : ''}
  </div>
</div>

${stRows ? `<div class="sec"><h2>${T('أداء المحطات', 'Station performance')}<small>${T('مرتبة من الأعلى رضا · الرحلات تُنسب لمحطة الركوب', 'ranked by satisfaction · trips attributed to boarding station')}</small></h2>
  <table class="t"><thead><tr><th>#</th><th>${T('المحطة', 'Station')}</th><th>${T('الاستجابات', 'Responses')}</th><th>${T('متوسط الرضا', 'Avg.')}</th><th>${T('المستوى', 'Level')}</th><th>NPS</th><th>${T('منخفضة', 'Low')}</th></tr></thead><tbody>${stRows}</tbody></table></div>` : ''}

${(D.age?.length || D.traveler?.length || D.purpose?.length || D.freq?.length) ? `<div class="sec"><h2>${T('شرائح العملاء', 'Customer segments')}</h2>
  <div class="two">${seg(T('حسب الفئة العمرية', 'By age group'), D.age)}${seg(T('حسب نوع المسافر', 'By traveler type'), D.traveler)}</div>
  <div class="two" style="margin-top:10px">${seg(T('حسب غرض الرحلة', 'By trip purpose'), D.purpose)}${seg(T('حسب تكرار السفر', 'By travel frequency'), D.freq)}</div></div>` : ''}

${voiceHtml ? `<div class="sec"><h2>${T('صوت العميل', 'Voice of customer')}<small>${T('أحدث الملاحظات النصية', 'latest written comments')}</small></h2>${voiceHtml}</div>` : ''}

<div class="method"><b>${T('منهجية الحساب:', 'Methodology:')}</b> ${T(
    'التقييم من 1 (الأسوأ) إلى 5 (الأفضل). الرضا العام = متوسط التقييمات، ونسبة الراضين = تقييمات 4 و5. NPS = نسبة الداعمين (9–10) ناقص المنتقدين (0–6). التقييم المنخفض = أي استجابة فيها 1 أو 2. الأوقات بتوقيت الرياض. تُعرض أرقام التواصل في ملف Excel فقط.',
    'Ratings run 1 (worst) to 5 (best). Overall satisfaction = mean rating; satisfied % = ratings of 4 and 5. NPS = % promoters (9–10) minus % detractors (0–6). Low rating = any response with a 1 or 2. Times are Riyadh time. Contact numbers appear in the Excel file only.')}</div>
</body></html>`
}

// يفتح نافذة الطباعة — لازم يُستدعى مباشرة من ضغطة المستخدم (لتفادي حجب النوافذ)، ثم نكتب المحتوى بعد جلب البيانات
export function openPrintWindow() {
  const w = window.open('', '_blank')
  if (w) { w.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;color:#64748b;text-align:center;padding-top:40vh">…</body>'); w.document.close() }
  return w
}
export function printInto(w, html) {
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* المستخدم يطبع يدوياً */ } }, 600)
  return true
}

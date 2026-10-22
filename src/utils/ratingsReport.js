// تقرير تقييم العملاء (طباعة/PDF): ملخص تنفيذي، توزيع النجوم، ترتيب المحطات، لوحة الشرف والمتابعة، ثم قسم لكل محطة
import { escapeHtml } from './digits'
import { brandLogo, previewBar, PAPER_CSS } from './printDoc'

const avgOf = list => (list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null)
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const fmt1 = n => (n == null ? '—' : n.toFixed(1))
const stars = n => `<span class="stars"><b>${'★'.repeat(n)}</b>${'★'.repeat(5 - n).replace(/★/g, '<i>★</i>')}</span>`
const tone = a => (a == null ? '#9CA3AF' : a >= 4.5 ? '#059669' : a >= 4 ? '#16A34A' : a >= 3 ? '#D97706' : '#DC2626')

// summarize(list) → إحصاءات مجموعة تقييمات
function summarize(list) {
  const total = list.length
  const dist = [0, 0, 0, 0, 0, 0]
  list.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1 })
  const sat = list.filter(r => r.rating >= 4).length
  const low = list.filter(r => r.rating <= 2).length
  return { total, avg: avgOf(list), dist, sat, low, satPct: pct(sat, total) }
}

export function buildRatingsReportHtml({ rows, isAr, loc, stationLabel, ratedDate, ratedTime, scopeParts = [], printedBy = '', selectedEmployee = null, withDetails = true }) {
  const T = (ar, en) => (isAr ? ar : en)
  const dir = isAr ? 'rtl' : 'ltr'
  const all = summarize(rows)
  const empKey = r => `${r.employee?.full_name_ar || '—'}|${r.employee?.job_number || ''}`

  // مجموعات المحطات (أبجدياً)
  const stMap = new Map()
  rows.forEach(r => { const k = stationLabel(r.station) || T('بدون محطة', 'No station'); if (!stMap.has(k)) stMap.set(k, []); stMap.get(k).push(r) })
  const stations = [...stMap.entries()].map(([name, list]) => {
    const emps = new Map()
    list.forEach(r => { const k = empKey(r); if (!emps.has(k)) emps.set(k, { name: r.employee?.full_name_ar || '—', job: r.employee?.job_number || '', list: [] }); emps.get(k).list.push(r) })
    const empList = [...emps.values()].map(e => ({ ...e, s: summarize(e.list) })).sort((a, b) => (b.s.avg ?? 0) - (a.s.avg ?? 0) || b.s.total - a.s.total)
    return { name, list, s: summarize(list), emps: empList }
  }).sort((a, b) => a.name.localeCompare(b.name, isAr ? 'ar' : 'en'))
  const ranking = [...stations].sort((a, b) => (b.s.avg ?? 0) - (a.s.avg ?? 0))
  const medal = i => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1))

  // أفضل الموظفين ومن يحتاجون متابعة (3 تقييمات فأكثر)
  const allEmps = stations.flatMap(st => st.emps.map(e => ({ ...e, station: st.name }))).filter(e => e.s.total >= 3)
  const top = [...allEmps].sort((a, b) => b.s.avg - a.s.avg || b.s.total - a.s.total).filter(e => e.s.avg >= 4).slice(0, 6)
  const watch = [...allEmps].sort((a, b) => a.s.avg - b.s.avg).filter(e => e.s.avg < 3.5).slice(0, 6)

  const tile = (cls, val, lbl, sub = '') => `<div class="tile ${cls}"><div class="tv">${val}</div><div class="tl">${lbl}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`
  const distHtml = [5, 4, 3, 2, 1].map(n => `
    <div class="drow"><span class="dl">${n} ★</span>
      <div class="dbar"><div style="width:${pct(all.dist[n], all.total)}%;background:${n >= 4 ? '#16A34A' : n === 3 ? '#F59E0B' : '#DC2626'}"></div></div>
      <span class="dn">${all.dist[n]} <em>(${pct(all.dist[n], all.total)}%)</em></span></div>`).join('')

  const rankHtml = stations.length > 1 ? `
  <div class="sec"><div class="st">${T('ترتيب المحطات بمتوسط التقييم', 'Stations ranked by average rating')}</div>
    <table class="mini"><thead><tr><th style="width:44px">#</th><th>${T('المحطة', 'Station')}</th><th>${T('التقييمات', 'Ratings')}</th><th>${T('المتوسط', 'Average')}</th><th>${T('نسبة الرضا (4-5)', 'Satisfaction (4-5)')}</th><th>${T('منخفضة (1-2)', 'Low (1-2)')}</th></tr></thead><tbody>
    ${ranking.map((g, i) => `<tr><td>${medal(i)}</td><td><b>${escapeHtml(g.name)}</b></td><td>${g.s.total}</td><td><b style="color:${tone(g.s.avg)}">${fmt1(g.s.avg)}</b><span class="muted"> / 5</span></td><td><div class="inbar"><div style="width:${g.s.satPct}%"></div></div> ${g.s.satPct}%</td><td>${g.s.low ? `<b style="color:#DC2626">${g.s.low}</b>` : '<span class="muted">0</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : ''

  const empCard = (e, color) => `<div class="hcard" style="border-color:${color}"><div class="hn">${escapeHtml(e.name)}</div><div class="hs">${escapeHtml(e.station)}${e.job ? ` · ${escapeHtml(e.job)}` : ''}</div><div class="hv" style="color:${color}">${fmt1(e.s.avg)}<span>/5</span></div><div class="hs">${e.s.total} ${T('تقييم', 'ratings')} · ${e.s.satPct}%</div></div>`
  const honorHtml = (top.length || watch.length) && !selectedEmployee ? `
  <div class="sec"><div class="st">${T('لوحة الأداء', 'Performance board')} <span class="muted">${T('(موظفون بـ 3 تقييمات فأكثر)', '(staff with 3+ ratings)')}</span></div>
    ${top.length ? `<div class="hl" style="color:#059669">${T('الأعلى تقييماً', 'Top rated')}</div><div class="hgrid">${top.map(e => empCard(e, '#16A34A')).join('')}</div>` : ''}
    ${watch.length ? `<div class="hl" style="color:#DC2626;margin-top:12px">${T('يحتاجون متابعة (أقل من 3.5)', 'Needs attention (below 3.5)')}</div><div class="hgrid">${watch.map(e => empCard(e, '#DC2626')).join('')}</div>` : ''}
  </div>` : ''

  const stationHtml = stations.map(g => `
  <div class="ssec">
    <div class="shead"><div class="sname">${escapeHtml(g.name)}</div>
      <div class="smeta"><span>${g.s.total} ${T('تقييم', 'ratings')}</span><span>${T('المتوسط', 'Avg')} ${fmt1(g.s.avg)}/5</span><span>${T('الرضا', 'Satisfaction')} ${g.s.satPct}%</span>${g.s.low ? `<span style="color:#FCA5A5;font-weight:800">${g.s.low} ${T('منخفض', 'low')}</span>` : ''}</div></div>
    ${selectedEmployee ? '' : `<table><thead><tr><th style="width:34px">#</th><th>${T('الموظف', 'Employee')}</th><th>${T('الرقم الوظيفي', 'Job No.')}</th><th>${T('التقييمات', 'Ratings')}</th><th>${T('المتوسط', 'Average')}</th><th>${T('التوزيع (5←1)', 'Distribution (5→1)')}</th><th>${T('الرضا', 'Sat.')}</th></tr></thead><tbody>
      ${g.emps.map((e, i) => `<tr><td class="num">${i + 1}</td><td><b>${escapeHtml(e.name)}</b></td><td class="mono">${escapeHtml(e.job) || '—'}</td><td>${e.s.total}</td><td><b style="color:${tone(e.s.avg)}">${fmt1(e.s.avg)}</b><span class="muted">/5</span></td>
        <td><div class="mdist">${[5, 4, 3, 2, 1].map(n => `<i style="flex:${e.s.dist[n]};background:${n >= 4 ? '#16A34A' : n === 3 ? '#F59E0B' : '#DC2626'}" title="${n}: ${e.s.dist[n]}"></i>`).join('')}</div></td><td>${e.s.satPct}%</td></tr>`).join('')}
      </tbody></table>`}
    ${withDetails ? `<div class="dt-title">${T('تفاصيل التقييمات', 'Rating details')}</div>
    <table class="det"><thead><tr><th style="width:30px">#</th>${selectedEmployee ? '' : `<th>${T('الموظف', 'Employee')}</th>`}<th>${T('الشباك', 'Win.')}</th><th>${T('التقييم', 'Rating')}</th><th>${T('رقم التذكرة', 'Ticket')}</th><th>${T('المرجع', 'Ref.')}</th><th>${T('تاريخ التذكرة', 'Ticket date')}</th><th>${T('وقت التقييم', 'Rated at')}</th><th>${T('ملاحظة العميل', 'Customer comment')}</th></tr></thead><tbody>
      ${g.list.map((r, i) => `<tr class="${r.rating <= 2 ? 'low' : ''}"><td class="num">${i + 1}</td>${selectedEmployee ? '' : `<td>${escapeHtml(r.employee?.full_name_ar) || '—'}</td>`}<td class="mono c">${escapeHtml(r.window_number) || '—'}</td><td class="c">${stars(r.rating)}</td><td class="mono c">${escapeHtml(r.ticket_number) || '—'}</td><td class="mono c muted">${escapeHtml(r.reference_number) || '—'}</td><td class="c">${r.ticket_date ? new Date(r.ticket_date).toLocaleDateString(loc) : '—'}</td><td class="c nw">${ratedDate(r.created_at)} <b class="mono">${ratedTime(r.created_at)}</b></td><td class="cm">${escapeHtml(r.comment) || ''}</td></tr>`).join('')}
      </tbody></table>` : ''}
  </div>`).join('')

  const css = `
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{margin:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#1f2937}
  @page{size:A4 landscape;margin:10mm}
  @media print{.no-print{display:none!important}}
  ${PAPER_CSS}
  .cover{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #EE712D;padding:6px 2px 12px;margin-bottom:16px}
  .ct{font-size:23px;font-weight:900;color:#264673}.cs{font-size:13px;color:#64748b;margin-top:5px;line-height:1.7}
  .cm2{font-size:12px;color:#64748b;text-align:${isAr ? 'left' : 'right'};line-height:1.7}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
  .tile{background:#fff;border:1px solid #eceef2;border-inline-start:4px solid #264673;border-radius:10px;padding:14px 16px}
  .tile.gold{border-inline-start-color:#F59E0B}.tile.green{border-inline-start-color:#16A34A}.tile.red{border-inline-start-color:#DC2626}
  .tv{font-size:28px;font-weight:900;line-height:1;color:#1C2B4A}.tl{font-size:12px;color:#6b7280;font-weight:700;margin-top:6px}.ts{font-size:11px;color:#9ca3af;margin-top:3px}
  .sec{margin:0 0 18px}.st{font-size:14px;font-weight:800;color:#264673;margin-bottom:9px;padding-inline-start:9px;border-inline-start:4px solid #EE712D}
  .muted{color:#9ca3af;font-weight:500}
  .dist{background:#fff;border:1px solid #eceef2;border-radius:10px;padding:12px 16px}
  .drow{display:flex;align-items:center;gap:10px;margin:5px 0;font-size:12.5px}.dl{width:34px;font-weight:800;color:#F59E0B}
  .dbar{flex:1;height:9px;background:#f1f5f9;border-radius:5px;overflow:hidden}.dbar div{height:100%;border-radius:5px}.dn{width:92px;font-weight:700}.dn em{font-style:normal;color:#9ca3af;font-weight:500}
  table{width:100%;border-collapse:collapse;background:#fff}
  th{background:#F3F4F6;color:#4B5563;padding:8px 10px;font-size:11px;font-weight:700;text-align:${isAr ? 'right' : 'left'};border-bottom:1.5px solid #E5E7EB}
  td{padding:7px 10px;font-size:12px;border-bottom:1px solid #F1F3F6;vertical-align:middle}
  tbody tr:nth-child(even){background:#FAFBFC}
  table.mini{border:1px solid #eceef2;border-radius:10px;overflow:hidden}
  .inbar{display:inline-block;width:70px;height:7px;background:#eef0f3;border-radius:4px;overflow:hidden;vertical-align:middle;margin-inline-end:6px}.inbar div{height:100%;background:#16A34A}
  .hl{font-size:12.5px;font-weight:800;margin-bottom:7px}.hgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .hcard{background:#fff;border:1.5px solid;border-radius:10px;padding:9px 12px}.hn{font-weight:800;font-size:13px;color:#111827}.hs{font-size:11px;color:#9ca3af;margin-top:2px}.hv{font-size:20px;font-weight:900;margin:4px 0 2px}.hv span{font-size:11px;opacity:.55}
  .ssec{margin-bottom:22px;border:1px solid #eceef2;border-radius:12px;overflow:hidden;background:#fff}
  .shead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 16px;background:linear-gradient(90deg,#264673,#35609a);color:#fff;break-after:avoid}
  .sname{font-size:15.5px;font-weight:800}.smeta{display:flex;gap:14px;font-size:12px;color:rgba(255,255,255,.9);font-weight:600}
  .dt-title{font-size:12px;font-weight:800;color:#4B5563;padding:12px 16px 6px}
  .ssec table{margin:0}.ssec thead{display:table-header-group}tr{break-inside:avoid}
  .det td{font-size:11.5px}.det tr.low{background:#FEF2F2!important}
  .c{text-align:center}.mono{font-family:Consolas,monospace}.nw{white-space:nowrap}.num{color:#9CA3AF;text-align:center}.cm{color:#4B5563;max-width:300px}
  .stars b{color:#F59E0B;letter-spacing:1px}.stars i{color:#E5E7EB;font-style:normal;letter-spacing:1px}
  .mdist{display:flex;height:8px;width:120px;border-radius:4px;overflow:hidden;background:#eef0f3;gap:1px}.mdist i{display:block}
  .foot{display:flex;justify-content:space-between;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px;font-size:11px;color:#9ca3af}`

  const stamp = new Date().toLocaleDateString(loc)
  return `<!DOCTYPE html><html dir="${dir}" lang="${isAr ? 'ar' : 'en'}"><head><meta charset="UTF-8"><title>${T('تقرير تقييم العملاء', 'Customer Ratings Report')}</title><style>${css}</style></head><body>
  ${previewBar(`NORTH WEST BUS — ${T('معاينة قبل الطباعة', 'Print preview')}`)}
  <div class="paper" style="padding:22px 28px">
    <div class="cover">
      <div><div class="ct">${T('تقرير تقييم العملاء', 'Customer Ratings Report')}</div>
        <div class="cs">${selectedEmployee ? `<b>${escapeHtml(selectedEmployee.full_name_ar)}</b>${selectedEmployee.job_number ? ` · ${escapeHtml(selectedEmployee.job_number)}` : ''}<br>` : ''}${scopeParts.filter(Boolean).map(escapeHtml).join(' &nbsp;·&nbsp; ')}</div></div>
      <div style="display:flex;align-items:center;gap:18px"><div class="cm2">${stamp}<br>${all.total} ${T('تقييم', 'ratings')}</div>${brandLogo(120)}</div>
    </div>

    <div class="tiles">
      ${tile('', all.total, T('إجمالي التقييمات', 'Total ratings'), `${stations.length} ${T('محطة', 'stations')}`)}
      ${tile('gold', `${fmt1(all.avg)}<span style="font-size:14px;opacity:.5">/5</span>`, T('متوسط التقييم', 'Average rating'), '')}
      ${tile('green', `${all.satPct}%`, T('نسبة الرضا', 'Satisfaction rate'), T('تقييم 4 أو 5', 'Rated 4 or 5'))}
      ${tile('red', all.low, T('تقييمات منخفضة', 'Low ratings'), T('تقييم 1 أو 2', 'Rated 1 or 2'))}
    </div>

    <div class="sec"><div class="st">${T('توزيع التقييمات', 'Rating distribution')}</div><div class="dist">${distHtml}</div></div>
    ${rankHtml}
    ${honorHtml}
    <div class="sec"><div class="st">${T('التفاصيل حسب المحطة', 'Details by station')}</div></div>
    ${stationHtml}
    <div class="foot"><span>${T('طُبع بواسطة', 'Printed by')}: ${escapeHtml(printedBy) || '—'}</span><span>NORTH WEST BUS</span><span>${stamp}</span></div>
  </div></body></html>`
}

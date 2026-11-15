// ثوابت ودوال مشتركة لصفحة تقييمات العملاء (الكمبيوتر والجوال)

export const SHIFTS = [
  { value: 'A', ar: 'الوردية أ', en: 'Shift A' },
  { value: 'B', ar: 'الوردية ب', en: 'Shift B' },
  { value: 'C', ar: 'الوردية ج', en: 'Shift C' },
]

export const JOB_TITLE_AR = { customer_service: 'خدمة عملاء', dispatcher: 'مرحّل' }
export const JOB_TITLE_EN = { customer_service: 'Customer Service', dispatcher: 'Dispatcher' }

export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

export function stationLabel(st, isAr) {
  if (!st) return st
  return isAr ? st.name_ar : (st.name_en || st.name_ar)
}

export function shiftLabel(value, isAr) {
  const s = SHIFTS.find(x => x.value === value)
  return s ? (isAr ? s.ar : s.en) : (value || '')
}

// لون النغمة: 4+ ممتاز، 3 متوسط، أقل من ذلك ضعيف (يُرافقه دائماً رقم/نص، فلا يُعتمد على اللون وحده)
export const toneVar = v => (v >= 4 ? 'var(--success)' : v >= 3 ? 'var(--warning)' : 'var(--danger)')
export const toneBg = v => `color-mix(in srgb, ${toneVar(v)} 14%, transparent)`

export const f1 = n => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(1))

const MIN_EMP_RATINGS = 3
export { MIN_EMP_RATINGS }

// تجميع التقييمات المعروضة (حسب الفلاتر الحالية) لبناء الملخصات والرسوم
export function summarize(rows, dayOf) {
  const dist = [0, 0, 0, 0, 0, 0]
  let sum = 0
  let withComment = 0
  const byShift = {}, byStation = {}, byEmp = {}, byDay = {}
  const bump = (m, key, label, rating) => {
    const o = m[key] || (m[key] = { key, label, n: 0, sum: 0 })
    o.n += 1
    o.sum += rating
  }
  for (const r of rows) {
    sum += r.rating
    if (dist[r.rating] !== undefined) dist[r.rating] += 1
    if (r.comment) withComment += 1
    if (r.shift) bump(byShift, r.shift, r.shift, r.rating)
    if (r.station?.name_ar) bump(byStation, r.station.name_ar, r.station, r.rating)
    if (r.employee?.full_name_ar) bump(byEmp, `${r.employee.full_name_ar}|${r.employee.job_number || ''}`, r.employee, r.rating)
    bump(byDay, dayOf(r.created_at), '', r.rating)
  }
  const fin = m => Object.values(m).map(o => ({ ...o, avg: o.sum / o.n }))
  const n = rows.length
  const employees = fin(byEmp).filter(e => e.n >= MIN_EMP_RATINGS)
  return {
    n,
    avg: n ? sum / n : null,
    dist,
    withComment,
    high: dist[4] + dist[5],
    low: dist[1] + dist[2],
    shifts: fin(byShift),
    stations: fin(byStation).sort((a, b) => b.n - a.n),
    topEmployees: [...employees].sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 5),
    lowEmployees: [...employees].sort((a, b) => a.avg - b.avg || b.n - a.n).slice(0, 5),
    days: fin(byDay).sort((a, b) => (a.key < b.key ? -1 : 1)),
  }
}

export const FIELD_LABEL = { fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '.01em', marginBottom: 6, display: 'block' }

// تنسيقات خاصة بالصفحة (نطاق cr- فقط)
export const CR_CSS = `
.cr-card{background:var(--card);border:1px solid var(--border);border-radius:16px}
.cr-ctl{height:44px;width:100%;border:1px solid var(--border-2) !important;border-radius:10px !important;padding:0 14px !important;background:var(--card);color:var(--text-1);font-size:.9rem;font-family:inherit;text-align:start}
.cr-ctl:hover{border-color:var(--text-3) !important}
.cr-ctl:focus-visible,.cr-pick:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.cr-pick{display:block;width:100%;height:44px;border:1px solid var(--border-2);border-radius:10px;padding:0 14px;background:var(--card);color:var(--text-1);font-size:.9rem;font-family:inherit;text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.cr-pick:hover{border-color:var(--text-3)}
.cr-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 20px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:800;font-size:.9rem;font-family:inherit;cursor:pointer}
.cr-btn:hover{filter:brightness(1.08)}
.cr-btn:disabled{opacity:.55;cursor:not-allowed}
.cr-btn:focus-visible,.cr-ghost:focus-visible,.cr-tab:focus-visible,.cr-link:focus-visible,.cr-row:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cr-ghost{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--border-2);background:var(--card);color:var(--text-2);font-weight:700;font-size:.82rem;font-family:inherit;cursor:pointer}
.cr-ghost:hover{background:var(--surface)}
.cr-tabs{display:flex;gap:4px;border-top:1px solid var(--border);padding:0 16px;overflow-x:auto}
.cr-tab{position:relative;padding:14px 18px;border:none;background:transparent;color:var(--text-3);font-weight:800;font-size:.92rem;font-family:inherit;cursor:pointer;white-space:nowrap}
.cr-tab:hover{color:var(--text-1)}
.cr-tab[aria-selected="true"]{color:var(--text-1)}
.cr-tab[aria-selected="true"]::after{content:"";position:absolute;inset-inline:12px;bottom:0;height:3px;background:var(--accent)}
.cr-row{cursor:pointer;transition:background .12s}
.cr-row:hover{background:var(--surface)}
.cr-th{position:sticky;top:76px;z-index:2;background:var(--surface);color:var(--text-3);font-size:.76rem;font-weight:800;text-align:start;padding:12px 16px;border-bottom:1px solid var(--border-2);white-space:nowrap}
.cr-td{padding:14px 16px;vertical-align:middle;border-bottom:1px solid var(--border);font-size:.92rem;color:var(--text-2)}
.cr-link{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:none;border-radius:9px;background:transparent;color:inherit;font-family:inherit;text-align:start;cursor:pointer}
.cr-link:hover{background:var(--surface)}
.cr-link[aria-pressed="true"]{background:color-mix(in srgb, var(--accent) 12%, transparent)}
.cr-bar{height:100%}
.cr-day{flex:1 1 0;min-width:6px;max-width:34px;height:100%;display:flex;align-items:flex-end;padding:0;border:none;background:transparent;cursor:pointer}
.cr-day:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.cr-day:hover .cr-bar,.cr-day:focus-visible .cr-bar{filter:brightness(.88)}
.cr-ta{width:100%;border:1px solid var(--border-2);border-radius:10px;padding:10px 12px;background:var(--card);color:var(--text-1);font-size:.9rem;font-family:inherit;line-height:1.7;resize:vertical;min-height:84px}
.cr-ta:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
@media (prefers-reduced-motion: reduce){.cr-row,.cr-bar{transition:none !important}}
`

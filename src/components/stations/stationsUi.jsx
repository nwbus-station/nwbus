// عناصر مشتركة لصفحة المحطات: ألوان، حالة، شارات، شريط الورديات، وCSS مخصص للصفحة (بادئة stn-)
import { validEnds, fmtMin, DEFAULT_ENDS } from '../../utils/shifts'

export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"
export const TYPE_COLOR = { main: '#2563eb', transit: '#7c3aed' }
export const AGENT_COLOR = '#db2777'
export const SKY = '#0284c7'
export const SHIFT_LETTERS_AR = ['أ', 'ب', 'ج', 'د']
export const SHIFT_LETTERS_EN = ['A', 'B', 'C', 'D']

// خلفية شفافة من لون دلالي (تعمل في الوضعين الفاتح والداكن)
export const tint = (c, pct = 12) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

const KEYS4 = ['A', 'B', 'C', 'D']
const offOf = s => (Array.isArray(s?.inactive_shifts) ? s.inactive_shifts : [])
export function shiftInfo(s) {
  const custom = Array.isArray(s.shift_ends) && validEnds(s.shift_ends)
  return { custom, ends: custom ? s.shift_ends : DEFAULT_ENDS }
}

export function statusOf(s, isAr) {
  if (s.merged_into) return { t: isAr ? 'مدمجة' : 'Merged', c: 'var(--warning)' }
  if (s.is_active) return { t: isAr ? 'نشطة' : 'Active', c: 'var(--success)' }
  return { t: isAr ? 'معطلة' : 'Inactive', c: 'var(--text-3)' }
}

export const STN_CSS = `
.stn-wrap{--stn-r:16px}
.stn-input{width:100%;border:1px solid var(--border-2);border-radius:12px;padding:11px 14px;font-size:.95rem;background:var(--card);color:var(--text-1);outline:none;font-family:inherit;transition:border-color .14s, box-shadow .14s}
.stn-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)}
.stn-input::placeholder{color:var(--text-3)}
.stn-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:11px 20px;font-size:.92rem;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid transparent;transition:filter .14s, background .14s, border-color .14s;white-space:nowrap}
.stn-btn:disabled{opacity:.5;cursor:not-allowed}
.stn-btn-primary{background:var(--accent);color:#fff}
.stn-btn-primary:hover:not(:disabled){filter:brightness(1.08)}
.stn-btn-ghost{background:var(--card);color:var(--text-2);border-color:var(--border-2)}
.stn-btn-ghost:hover:not(:disabled){border-color:var(--text-3);color:var(--text-1)}
.stn-btn-warn{background:transparent;color:var(--warning);border-color:var(--warning)}
.stn-btn-warn:hover:not(:disabled){background:var(--warning-bg)}
.stn-btn-sm{padding:8px 16px;font-size:.84rem;border-radius:10px}
.stn-chip{flex-shrink:0;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border-2);background:var(--card);color:var(--text-2);border-radius:999px;padding:8px 16px;font-size:.86rem;font-weight:700;font-family:inherit;cursor:pointer;transition:border-color .14s, background .14s, color .14s}
.stn-chip:hover{border-color:var(--text-3)}
.stn-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.stn-chip .n{font-family:${MONO};font-size:.78rem;opacity:.75}
.stn-seg{display:inline-flex;border:1px solid var(--border-2);border-radius:12px;overflow:hidden;background:var(--card)}
.stn-seg button{border:0;background:transparent;color:var(--text-2);padding:11px 18px;font-size:.88rem;font-weight:800;font-family:inherit;cursor:pointer}
.stn-seg button.on{background:var(--accent);color:#fff}
.stn-table{width:100%;border-collapse:separate;border-spacing:0;font-size:.95rem}
.stn-table th{position:sticky;top:0;text-align:start;padding:14px 18px;background:var(--surface);color:var(--text-3);font-size:.76rem;font-weight:800;letter-spacing:.02em;border-bottom:1px solid var(--border-2);white-space:nowrap}
.stn-table td{padding:16px 18px;border-bottom:1px solid var(--border);vertical-align:middle}
.stn-table tbody tr{transition:background .12s}
.stn-table tbody tr:hover{background:var(--surface)}
.stn-table tbody tr:last-child td{border-bottom:0}
.stn-pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 12px;font-size:.8rem;font-weight:800;white-space:nowrap}
.stn-pill i{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
.stn-tag{display:inline-block;border-radius:8px;padding:3px 9px;font-size:.74rem;font-weight:800;white-space:nowrap}
.stn-tripchip{display:inline-block;font-family:${MONO};font-size:.76rem;font-weight:700;border:1px solid var(--border-2);background:var(--surface);color:var(--text-2);border-radius:8px;padding:2px 8px}
.stn-card{background:var(--card);border:1px solid var(--border-2);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;transition:border-color .14s, box-shadow .14s, transform .14s}
.stn-card:hover{border-color:var(--text-3);box-shadow:var(--shadow-md);transform:translateY(-2px)}
.stn-tile{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:10px 8px;text-align:center;min-width:0}
.stn-skel{height:68px;border-radius:14px;background:var(--surface);animation:stnPulse 1.3s ease-in-out infinite}
@keyframes stnPulse{0%,100%{opacity:1}50%{opacity:.45}}
.stn-sec{border:1px solid var(--border-2);border-radius:14px;padding:16px;background:var(--surface)}
.stn-sec-t{margin:0 0 4px;font-size:.95rem;font-weight:900;color:var(--text-1)}
.stn-sec-d{margin:0 0 12px;font-size:.78rem;line-height:1.7;color:var(--text-3)}
.stn-lbl{display:block;font-size:.78rem;font-weight:800;color:var(--text-2);margin-bottom:6px}
.stn-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.stn-opt{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--border-2);border-radius:12px;padding:12px 14px;background:var(--card);cursor:pointer;transition:border-color .14s, background .14s}
.stn-opt:hover{border-color:var(--text-3)}
.stn-opt input{margin-top:3px;accent-color:var(--accent);width:16px;height:16px;flex-shrink:0}
.stn-pop{border:1px solid var(--border-2);border-radius:12px;background:var(--card);max-height:240px;overflow-y:auto;margin-top:6px}
.stn-pop button{display:flex;align-items:center;gap:8px;width:100%;text-align:start;padding:9px 12px;border:0;border-bottom:1px solid var(--border);background:transparent;color:var(--text-2);font-family:inherit;font-size:.84rem;cursor:pointer}
.stn-pop button:hover{background:var(--surface)}
@media (prefers-reduced-motion: reduce){.stn-skel{animation:none}.stn-card{transition:none}.stn-card:hover{transform:none}}
`

/* شارات "وكيل" و"وصول + مغادرة" — نسخة الكمبيوتر */
export function StationBadges({ s, isAr }) {
  return (
    <>
      {s.is_agent && <span className="stn-tag" style={{ background: tint(AGENT_COLOR, 13), color: AGENT_COLOR }}>{isAr ? 'وكيل' : 'Agent'}</span>}
      {s.combined_arr_dep && <span className="stn-tag" style={{ background: tint(SKY, 13), color: SKY }}>{isAr ? 'وصول + مغادرة' : 'Arr + Dep'}</span>}
    </>
  )
}

export function TypeTag({ s, isAr }) {
  const c = TYPE_COLOR[s.type] || TYPE_COLOR.main
  return <span className="stn-tag" style={{ background: tint(c, 12), color: c, border: `1px solid ${tint(c, 30)}` }}>{s.type === 'main' ? (isAr ? 'رئيسية' : 'Main') : (isAr ? 'مرور' : 'Transit')}</span>
}

export function StatusPill({ s, isAr }) {
  const st = statusOf(s, isAr)
  return <span className="stn-pill" style={{ background: tint(st.c, 13), color: st.c }}><i />{st.t}</span>
}

/* شريط اليوم (24 ساعة) مقسوم حسب ورديات المحطة — نسخة الجوال (بدون تغيير عن الأصل) */
export function ShiftBar({ s, isAr }) {
  const { ends, custom } = shiftInfo(s)
  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-gray-700">{ends.length} {isAr ? 'ورديات' : 'shifts'}</span>
        {custom && <span className="text-[9px] font-bold text-nwbus-primary border border-nwbus-primary rounded px-1">{isAr ? 'مخصصة' : 'custom'}</span>}
        {offOf(s).length > 0 && <span className="text-[9px] font-bold text-red-600 border border-red-300 rounded px-1">{isAr ? `${offOf(s).length} متوقفة` : `${offOf(s).length} stopped`}</span>}
      </div>
      <div className="flex h-2 rounded-sm overflow-hidden gap-px" dir="ltr" title={ends.map((e, i) => `${['A', 'B', 'C', 'D'][i]} ${fmtMin(i ? ends[i - 1] : 0)}–${fmtMin(e)}`).join('  ')}>
        {ends.map((e, i) => (
          <i key={i} style={{ flex: e - (i ? ends[i - 1] : 0), background: offOf(s).includes(KEYS4[i]) ? 'var(--border-2, #d1d5db)' : 'var(--accent, #4f46e5)', opacity: offOf(s).includes(KEYS4[i]) ? 1 : [1, 0.7, 0.45, 0.25][i] }} />
        ))}
      </div>
    </div>
  )
}

const OPACITY = [1, 0.7, 0.45, 0.25]

/* خط زمني للورديات — نسخة الكمبيوتر: شريط + نطاقات الأوقات (detailed) */
export function ShiftTimeline({ s, isAr, detailed = false }) {
  const { ends, custom } = shiftInfo(s)
  const letters = isAr ? SHIFT_LETTERS_AR : SHIFT_LETTERS_EN
  const range = i => `${fmtMin(i ? ends[i - 1] : 0)}–${fmtMin(ends[i])}`
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: detailed ? '.86rem' : '.84rem', fontWeight: 900, color: 'var(--text-1)' }}>{ends.length} {isAr ? 'ورديات' : 'shifts'}</span>
        {custom && <span className="stn-tag" style={{ background: tint('var(--accent)', 14), color: 'var(--accent)', fontSize: '.68rem', padding: '1px 7px' }}>{isAr ? 'مخصصة' : 'Custom'}</span>}
        {offOf(s).length > 0 && <span className="stn-tag" style={{ background: tint('var(--danger)', 14), color: 'var(--danger)', fontSize: '.68rem', padding: '1px 7px' }}>{isAr ? `${offOf(s).length} متوقفة` : `${offOf(s).length} stopped`}</span>}
      </div>
      <div dir="ltr" title={ends.map((e, i) => `${letters[i]} ${range(i)}`).join('   ')} style={{ display: 'flex', height: detailed ? 12 : 10, gap: 2, borderRadius: 99, overflow: 'hidden' }}>
        {ends.map((e, i) => { const x = offOf(s).includes(KEYS4[i]); return <i key={i} style={{ flex: e - (i ? ends[i - 1] : 0), background: x ? 'var(--border-2)' : 'var(--accent)', opacity: x ? 1 : OPACITY[i] }} /> })}
      </div>
      {detailed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 9 }}>
          {ends.map((e, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.76rem', color: 'var(--text-2)', fontWeight: 700 }}>
              <i style={{ width: 8, height: 8, borderRadius: 3, background: offOf(s).includes(KEYS4[i]) ? 'var(--border-2)' : 'var(--accent)', opacity: offOf(s).includes(KEYS4[i]) ? 1 : OPACITY[i], display: 'inline-block' }} />
              <span style={offOf(s).includes(KEYS4[i]) ? { textDecoration: 'line-through', color: 'var(--text-3)' } : undefined}>{letters[i]}</span>
              <bdi dir="ltr" style={{ fontFamily: MONO, fontWeight: 600, ...(offOf(s).includes(KEYS4[i]) ? { textDecoration: 'line-through', color: 'var(--text-3)' } : null) }}>{range(i)}</bdi>
              {offOf(s).includes(KEYS4[i]) && <span style={{ color: 'var(--danger)', fontWeight: 800 }}>{isAr ? 'متوقفة' : 'stopped'}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

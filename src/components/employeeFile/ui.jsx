// عناصر واجهة مشتركة للسجل الوظيفي: تحجيم الخط (على الكمبيوتر فقط) + بطاقات + حلقات + جداول
// الجوال: --ef-z = 1 (بدون أي تغيير)، الكمبيوتر (>= 900px): --ef-z = 1.14 — يُعرَّف في EF_CSS على جذر الصفحة.
export const MONO = 'ui-monospace, Menlo, Consolas, monospace'

// تحجيم حجم الخط بمتغيّر CSS: f('0.78rem') => calc(0.78rem * var(--ef-z, 1))
export const f = rem => `calc(${rem} * var(--ef-z, 1))`
// تحجيم الأبعاد (padding/gap) بنفس المعامل
export const zp = px => `calc(${px}px * var(--ef-z, 1))`

export const EF_CSS = `
.ef-root{--ef-z:1}
@media (min-width:900px){.ef-root{--ef-z:1.14}}
.ef-sec{scroll-margin-top:96px;min-width:0}
@media (min-width:900px){.ef-sec{scroll-margin-top:150px}}
.ef-sech{padding:12px 18px}
.ef-secb{padding:14px 18px}
@media (min-width:900px){
  .ef-sech{padding:16px 26px}
  .ef-secb{padding:22px 26px}
}
.ef-full{grid-column:1 / -1}
.ef-main{display:flex;flex-direction:column;gap:16px;min-width:0}
@media (min-width:900px){
  .ef-main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:20px;align-items:start}
}
.ef-layout{display:flex;flex-direction:column;gap:16px}
@media (min-width:1360px){
  .ef-layout{display:grid;grid-template-columns:clamp(310px,22vw,380px) minmax(0,1fr);gap:24px;align-items:start}
  .ef-aside{position:sticky;top:76px;max-height:calc(100vh - 92px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border-2) transparent;display:flex;flex-direction:column;gap:16px}
}
.ef-pair{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
@media (min-width:900px){.ef-pair{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}}
.ef-tab{transition:background .15s,border-color .15s,color .15s}
.ef-tab:hover{border-color:var(--border-2)}
.ef-nav{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.ef-nav::-webkit-scrollbar{display:none}
.ef-row:hover{background:var(--surface)}
`

export const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }

// زر شريحة (pill) موحّد
export const pill = on => ({ padding: `${zp(7)} ${zp(16)}`, borderRadius: 99, fontSize: f('0.78rem'), fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${on ? '#1C2B4A' : 'var(--border)'}`, background: on ? '#1C2B4A' : 'var(--card)', color: on ? '#fff' : 'var(--text-2)' })

export function Ring({ pct, color, label, sub, size = 92, subColor = 'var(--text-3)' }) {
  const p = Math.max(0, Math.min(100, pct || 0))
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} ${p * 3.6}deg, #e5e7eb 0)`, display: 'grid', placeItems: 'center', margin: '0 auto' }}>
        <div style={{ width: size - 22, height: size - 22, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 800, fontSize: size > 80 ? f('1.15rem') : f('0.95rem'), color: 'var(--text-1)' }} dir="ltr">{label}</div>
      </div>
      {sub && <div style={{ fontSize: f('0.68rem'), color: subColor, fontWeight: 700, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export function Kpi({ title, value, sub, color = '#1C2B4A' }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${color}`, borderRadius: 12, padding: `${zp(11)} ${zp(14)}` }}>
      <div style={{ fontSize: f('0.66rem'), color: 'var(--text-3)', fontWeight: 700 }}>{title}</div>
      <div style={{ fontFamily: MONO, fontSize: f('1.45rem'), fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.25 }} dir="ltr">{value}</div>
      {sub != null && <div style={{ fontSize: f('0.64rem'), color: 'var(--text-3)', fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

// بطاقة قسم: id لروابط الانتقال السريع، full لتمتد على كل عرض الشبكة (الكمبيوتر)
export function SecCard({ id, title, hint, children, full }) {
  return (
    <section id={id ? `ef-sec-${id}` : undefined} className={`ef-sec${full ? ' ef-full' : ''}`} style={card}>
      <div className="ef-sech" style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 4, height: 18, background: '#EE712D', borderRadius: 2 }} />
        <span style={{ fontWeight: 800, fontSize: f('0.95rem'), color: 'var(--text-1)' }}>{title}</span>
        {hint && <span style={{ marginInlineStart: 'auto', fontSize: f('0.7rem'), color: 'var(--text-3)' }}>{hint}</span>}
      </div>
      <div className="ef-secb">{children}</div>
    </section>
  )
}

export const Th = ({ children }) => <th style={{ padding: `${zp(8)} ${zp(10)}`, background: '#1e3a5f', color: '#fff', fontSize: f('0.7rem'), fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</th>
export const Td = ({ children, l, b, c }) => <td style={{ padding: `${zp(8)} ${zp(10)}`, borderTop: '1px solid var(--border)', textAlign: l ? 'right' : 'center', fontSize: f('0.78rem'), fontWeight: b ? 800 : 500, color: c || 'var(--text-1)', fontFamily: l ? 'inherit' : MONO }}>{children}</td>
export const Chip = ({ children, c = '#334155', bg = '#e2e8f0' }) => <span style={{ background: bg, color: c, borderRadius: 99, padding: '2px 11px', fontSize: f('0.7rem'), fontWeight: 800 }}>{children}</span>
export const Bar = ({ pct, color = '#1C2B4A' }) => <div style={{ flex: 1, height: 9, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 99 }} /></div>

export function Stars({ value, size = 18, color = '#EE712D' }) {
  const path = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z'
  const row = c => <span style={{ display: 'inline-flex', gap: 2 }}>{[0, 1, 2, 3, 4].map(i => <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={c} aria-hidden="true"><path d={path} /></svg>)}</span>
  const pct = Math.max(0, Math.min(100, ((value || 0) / 5) * 100))
  return (
    <span dir="ltr" role="img" aria-label={`${(value || 0).toFixed(1)} / 5`} style={{ position: 'relative', display: 'inline-flex' }}>
      {row('#d5dbe5')}
      <span style={{ position: 'absolute', insetBlock: 0, left: 0, width: `${pct}%`, overflow: 'hidden', whiteSpace: 'nowrap' }}>{row(color)}</span>
    </span>
  )
}

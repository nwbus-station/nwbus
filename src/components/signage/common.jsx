// عناصر مشتركة لقسم الشاشات
import { fieldStyle } from '../lostFound/ui'

export const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }
export const input = fieldStyle
export const SG_ACCENT = '#0ea5e9'

export const Pill = ({ color = '#64748b', children, dot }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: `${color}1c`, color, whiteSpace: 'nowrap' }}>
    {dot && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />}{children}
  </span>
)

export const Empty = ({ title, hint, action }) => (
  <div style={{ textAlign: 'center', padding: '44px 18px', border: '1.5px dashed var(--border-2)', borderRadius: 16, color: 'var(--text-3)' }}>
    <div style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--text-2)' }}>{title}</div>
    {hint && <div style={{ fontSize: '0.78rem', marginTop: 6, lineHeight: 1.8 }}>{hint}</div>}
    {action && <div style={{ marginTop: 14 }}>{action}</div>}
  </div>
)

export const Err = ({ children }) => children ? (
  <div role="alert" style={{ padding: '10px 13px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 800, lineHeight: 1.7 }}>{children}</div>
) : null

// صورة مصغّرة لعنصر محتوى (صورة أو أول لقطة من الفيديو)
const MINI_LAYOUT = { full: [[0, 0, 1, 1, '#38bdf8']], side: [[0, 0, .667, 1, '#38bdf8'], [.667, 0, .333, 1, '#f59e0b']], bottom: [[0, 0, 1, .91, '#38bdf8'], [0, .91, 1, .09, '#ef4444']], side_bottom: [[0, 0, .667, .91, '#38bdf8'], [.667, 0, .333, .91, '#f59e0b'], [0, .91, 1, .09, '#ef4444']] }
export function Thumb({ m, url, style }) {
  if (m.kind === 'scene') {
    const rects = MINI_LAYOUT[m.config?.layout] || MINI_LAYOUT.full
    return (
      <div style={{ position: 'relative', overflow: 'hidden', background: '#0b1220', display: 'grid', placeItems: 'center', ...style }}>
        <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" style={{ width: '70%', height: '70%' }} aria-hidden="true">
          {rects.map(([x, y, w, h, c], i) => <rect key={i} x={x * 160 + 2} y={y * 90 + 2} width={w * 160 - 4} height={h * 90 - 4} rx="3" fill={c} opacity=".85" />)}
        </svg>
        <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: 8, bottom: 8, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: '0.64rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>مشهد</span>
      </div>
    )
  }
  if (m.kind === 'board') {
    return (
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#101C27,#091119)', display: 'grid', placeItems: 'center', color: '#E3A02E', ...style }}>
        <div style={{ textAlign: 'center', lineHeight: 1.5 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h18v12H3z" /><path d="M7 9h4M7 12h6M15 9h2" /><path d="M8 20h8M12 16v4" /></svg>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#F2EFE8' }}>شاشة العرض</div>
        </div>
      </div>
    )
  }
  const base = { width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#0b1220' }
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#0b1220', ...style }}>
      {m.kind === 'video'
        ? <video src={`${url}#t=0.5`} preload="metadata" muted playsInline style={base} />
        : <img src={url} alt="" loading="lazy" style={base} />}
      {m.kind === 'video' && (
        <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: 8, bottom: 8, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: '0.64rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>VIDEO</span>
      )}
    </div>
  )
}

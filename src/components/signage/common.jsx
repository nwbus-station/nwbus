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
export function Thumb({ m, url, style }) {
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

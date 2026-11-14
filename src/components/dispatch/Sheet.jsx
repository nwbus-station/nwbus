// نافذة موحّدة لقسم الإرساليات: لوحة جانبية (drawer) أو نافذة وسطية على الكمبيوتر، وورقة سفلية (bottom sheet) على الجوال.
// رأس ثابت + جسم يتمرّر + تذييل أزرار ثابت. Esc للإغلاق، وقفل تمرير الخلفية، وحركة دخول تحترم تقليل الحركة.
import { useEffect, useState } from 'react'

export function useMedia(q) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q), h = e => setM(e.matches)
    mq.addEventListener('change', h); setM(mq.matches)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

const CSS = `
@keyframes dspFade{from{opacity:0}to{opacity:1}}
@keyframes dspUp{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes dspSide{from{transform:translateX(calc(var(--sx) * 44px));opacity:.4}to{transform:none;opacity:1}}
@keyframes dspPop{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion: reduce){.dsp-sheet,.dsp-backdrop{animation:none !important}}
.dsp-sheet-body{scrollbar-width:thin;scrollbar-color:var(--border-2) transparent}
.dsp-sheet-body::-webkit-scrollbar{width:9px}.dsp-sheet-body::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px;border:2px solid transparent;background-clip:padding-box}
`

/**
 * variant: 'drawer' (لوحة جانبية عريضة للنماذج) | 'modal' (نافذة وسطية صغيرة للتأكيدات)
 * onClose: يُستدعى عند Esc / زر الإغلاق / الضغط على الخلفية (إن كان closeOnBackdrop)
 */
export default function Sheet({ title, sub, icon, accent = '#2563eb', onClose, children, footer, variant = 'modal', width, closeOnBackdrop = true, isAr = true }) {
  const mobile = useMedia('(max-width: 759px)')
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [onClose])

  const drawer = variant === 'drawer' && !mobile
  const panel = mobile
    ? { position: 'fixed', insetInline: 0, bottom: 0, maxHeight: '94dvh', borderRadius: '20px 20px 0 0', animation: 'dspUp .24s ease-out' }
    : drawer
      ? { position: 'fixed', top: 0, bottom: 0, insetInlineEnd: 0, width: `min(${width || 600}px, 100vw)`, borderInlineStart: '1px solid var(--border-2)', animation: 'dspSide .26s ease-out' }
      : { position: 'relative', width: `min(${width || 480}px, 100%)`, maxHeight: '90dvh', borderRadius: 18, animation: 'dspPop .18s ease-out' }

  return (
    <div className="dsp-backdrop" onMouseDown={e => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,12,20,0.52)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', padding: !mobile && !drawer ? 16 : 0, animation: 'dspFade .16s ease-out' }}>
      <style>{CSS}</style>
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="dsp-sheet" dir={isAr ? 'rtl' : 'ltr'}
        style={{ '--sx': rtl ? -1 : 1, display: 'flex', flexDirection: 'column', background: 'var(--card)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden', ...panel }}>
        {mobile && <div aria-hidden="true" style={{ width: 42, height: 4, borderRadius: 99, background: 'var(--border-2)', margin: '9px auto 0', flexShrink: 0 }} />}
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {icon && <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${accent}1f`, color: accent, flexShrink: 0 }}>{icon}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.02rem', color: 'var(--text-1)', lineHeight: 1.4 }}>{title}</div>
            {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.65 }}>{sub}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label={isAr ? 'إغلاق' : 'Close'}
            style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>
        <div className="dsp-sheet-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>{children}</div>
        {footer && (
          <footer style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>{footer}</footer>
        )}
      </div>
    </div>
  )
}

export const Ic = {
  box: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>,
  check: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>,
  x: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>,
  alert: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>,
  ticket: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9a2 2 0 002-2V5h12v2a2 2 0 002 2v6a2 2 0 00-2 2v2H6v-2a2 2 0 00-2-2z" /><path d="M9 10h6M9 14h4" /></svg>,
  send: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
}

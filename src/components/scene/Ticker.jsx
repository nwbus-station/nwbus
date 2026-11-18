// شريط الأخبار المتحرك: رسائل متتابعة تتحرك باستمرار. العاجلة بخلفية حمراء. (مصمَّم للوحة 1920×1080)
import { useEffect, useMemo, useRef, useState } from 'react'

const SPEED = { slow: 70, normal: 110, fast: 170 }   // بكسل بالثانية

const KF = '@keyframes nwTicker{from{transform:translateX(0)}to{transform:translateX(50%)}} @keyframes nwGreet{0%{opacity:0;transform:translateY(10px)}12%{opacity:1;transform:none}88%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-10px)}}'

// عبارات الترحيب: تتبدّل بين العربية والإنجليزية بالتناوب
export const GREETINGS = [
  { l: 'ar', t: 'نتمنى لكم رحلة آمنة وسعيدة' },
  { l: 'en', t: 'Wishing you a safe and pleasant journey' },
  { l: 'ar', t: 'شكراً لاختياركم نورث وست باص' },
  { l: 'en', t: 'Thank you for choosing North West Bus' },
]
export function Greeting({ th, size = 40, every = 6 }) {
  const [i, setI] = useState(0)
  useEffect(() => { const id = setInterval(() => setI(x => (x + 1) % GREETINGS.length), every * 1000); return () => clearInterval(id) }, [every])
  const g = GREETINGS[i]
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, overflow: 'hidden' }}>
      <style>{KF}</style>
      <i aria-hidden="true" style={{ width: 44, height: 3, background: th.accent, display: 'inline-block', opacity: 0.8 }} />
      <div key={i} dir={g.l === 'ar' ? 'rtl' : 'ltr'} style={{ animation: `nwGreet ${every}s ease-in-out both`, fontSize: g.l === 'ar' ? size : size * 0.9, fontWeight: g.l === 'ar' ? 700 : 500, letterSpacing: g.l === 'ar' ? 0.5 : 1.5, color: th.text, fontFamily: g.l === 'ar' ? "'IBM Plex Sans Arabic', sans-serif" : "'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif", whiteSpace: 'nowrap', lineHeight: 1.5, paddingBottom: '0.12em' }}>{g.t}</div>
      <i aria-hidden="true" style={{ width: 44, height: 3, background: th.accent, display: 'inline-block', opacity: 0.8 }} />
    </div>
  )
}

// يتحرك من اليسار لليمين (اتجاه حركة الشريط الإخباري العربي) مع تكرار المحتوى مرتين لحلقة بلا فجوة
export function TickerBar({ messages = [], speed = 'normal', th, height = 96, brand = true }) {
  const list = messages.length ? messages : []
  const text = useMemo(() => list.map(m => m.text).join('   '), [list])
  const per = Math.max(1, list.reduce((n, m) => n + m.text.length, 0))
  const px = per * 30 + list.length * 160 + 800                      // عرض تقريبي للمجموعة الواحدة
  const sec = Math.max(14, px / (SPEED[speed] || SPEED.normal))
  const urgent = list.some(m => m.level === 'urgent')
  const items = (key) => list.map((m, i) => (
    <span key={`${key}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 28, paddingInline: 40, color: m.level === 'urgent' ? '#fff' : th.text, background: m.level === 'urgent' ? '#b91c1c' : 'transparent', height: '100%', fontWeight: 800 }}>
      {m.level === 'urgent' && <b style={{ fontSize: 24, letterSpacing: 1, background: '#fff', color: '#b91c1c', padding: '2px 14px', borderRadius: 4 }}>عاجل</b>}
      <span>{m.text}</span>
      <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: m.level === 'urgent' ? '#fff' : th.accent, display: 'inline-block', marginInlineStart: 12 }} />
    </span>
  ))
  return (
    <div dir="rtl" style={{ position: 'relative', height, display: 'flex', alignItems: 'stretch', overflow: 'hidden', background: urgent ? '#7f1d1d' : 'rgba(5,9,14,0.92)', borderTop: `3px solid ${urgent ? '#ef4444' : th.accent}`, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <style>{KF}</style>
      {brand && (
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2, padding: '0 44px', background: th.accent, color: '#0b1220', zIndex: 2, borderInlineEnd: '6px solid rgba(0,0,0,0.22)' }}>
          <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.3, paddingBottom: '0.1em' }}>نورث وست باص</span>
          <span dir="ltr" style={{ fontSize: 13, fontWeight: 800, letterSpacing: 5, lineHeight: 1 }}>NORTH WEST BUS</span>
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', fontSize: 40, whiteSpace: 'nowrap' }} aria-label={text}>
        {list.length === 0 ? (
          <Greeting th={th} size={40} />
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', height: '100%', animation: `nwTicker ${sec}s linear infinite`, willChange: 'transform' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: '100%' }}>{items('a')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: '100%' }}>{items('b')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// شريط عاجل يظهر فوق أي محتوى (بدون مشهد) عند وجود رسالة عاجلة سارية؛ يتكيّف عرضه مع عرض الشاشة
export function UrgentOverlay({ messages = [] }) {
  const ref = useRef(null)
  const [sc, setSc] = useState(1)
  const urgent = messages.filter(m => m.level === 'urgent')
  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const fit = () => setSc(Math.max(0.3, el.clientWidth / 1920))
    fit(); const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [urgent.length])
  if (!urgent.length) return null
  const th = { text: '#fff', accent: '#ef4444', muted: '#fecaca' }
  return (
    <div ref={ref} dir="ltr" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 9, height: 96 * sc, overflow: 'hidden' }}>
      <div style={{ width: 1920, transform: `scale(${sc})`, transformOrigin: 'top left' }}>
        <TickerBar messages={urgent} speed="normal" th={th} height={96} brand={false} />
      </div>
    </div>
  )
}

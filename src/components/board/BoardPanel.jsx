// شاشة العرض كعنصر للمشغّل: تعرض بيانات الجهاز (من signage_board) بنفس تصميم /board.
// تُرسم على لوحة ثابتة 1920×1080 وتُصغَّر لتناسب أي شاشة (بدون قص).
import { useEffect, useRef, useState } from 'react'
import { BOARD_LOGO, THEMES, Clock, Row, nmOf, dedupeEvents, toMin } from './boardParts'

const W = 1920, H = 1080
const rtNow = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
  return p[0] * 60 + p[1]
}

export default function BoardPanel({ data, config, error }) {
  const th = THEMES[config?.theme] || THEMES.nwb
  const layout = config?.layout || 'columns'
  const mode = data?.mode || config?.mode || 'scheduled'
  const isAr = true
  const wrap = useRef(null)
  const [scale, setScale] = useState(1)
  const [tick, setTick] = useState(0)
  const [nowMin, setNowMin] = useState(rtNow)
  useEffect(() => {
    const fit = () => { const r = wrap.current?.getBoundingClientRect(); if (r?.width) setScale(Math.min(r.width / W, r.height / H)) }
    fit(); const ro = new ResizeObserver(fit); if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { const id = setInterval(() => setNowMin(rtNow()), 15000); return () => clearInterval(id) }, [])
  useEffect(() => {
    if (layout !== 'auto') return
    const id = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [layout])

  const events = dedupeEvents(data?.events || []).slice(0, 40)
  const isAuto = layout === 'auto'
  const view = layout === 'feed' ? 'feed' : 'columns'
  const COL_PER = 6
  const feedSorted = [...events].sort((a, b) => toMin(a.time) - toMin(b.time))
  const depCount = events.filter(e => e.type === 'departure').length
  const arrCount = events.filter(e => e.type === 'arrival').length
  const nextEv = mode === 'scheduled' ? [...events].filter(e => e.status === 'upcoming').sort((a, b) => toMin(a.time) - toMin(b.time))[0] : null
  const nextMins = nextEv ? toMin(nextEv.time) - nowMin : null
  const stationLabel = data?.station || 'كل المحطات'
  const HEADER_H = 150

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: th.bg }}>
      <div dir="rtl" style={{ position: 'absolute', top: '50%', left: '50%', width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, transform: `scale(${scale})`, transformOrigin: 'center center', color: th.text, fontFamily: "'IBM Plex Sans Arabic', sans-serif", overflow: 'hidden', background: th.fx || th.bg }}>
        <style>{`
          @keyframes slidein { from { opacity:0; transform: translateY(-10px) } to { opacity:1; transform:none } }
          @keyframes glow { 0%,100%{opacity:1} 50%{opacity:.55} }
          @keyframes livedot { 0%{box-shadow:0 0 0 0 rgba(75,201,143,.6)} 100%{box-shadow:0 0 0 9px rgba(75,201,143,0)} }
          @keyframes scrollup { from { transform: translateY(0) } to { transform: translateY(-50%) } }
          .lb-row { animation: slidein .45s ease both }
          .lb-ar { animation: glow 1.6s ease-in-out infinite }
          .lb-live { animation: livedot 1.6s ease-out infinite }
        `}</style>

        <header style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24, padding: '20px 44px 18px', background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: th.text }}>
            <span aria-label="North West Bus" role="img" style={{ display: 'inline-flex', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: BOARD_LOGO }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 0.5 }}>حركة الرحلات المباشرة</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: th.accent, background: `${th.accent}1c`, border: `1px solid ${th.accent}55`, borderRadius: 999, padding: '3px 18px' }}>{stationLabel}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: '#4BC98F', letterSpacing: 1 }}>
                <i className="lb-live" style={{ width: 9, height: 9, borderRadius: '50%', background: '#4BC98F', display: 'inline-block' }} />{mode === 'scheduled' ? 'جدول اليوم' : 'مباشر'}
              </span>
            </div>
          </div>
          <div style={{ justifySelf: 'start' }}><Clock accent={th.accent} muted={th.muted} isAr={isAr} /></div>
          <span style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 3, background: `linear-gradient(90deg, transparent, ${th.accent}, transparent)` }} />
        </header>

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '14px 44px 0' }}>
          {[{ l: 'مغادرة', v: depCount, c: th.dep }, { l: 'وصول', v: arrCount, c: th.arr }].map(k => (
            <div key={k.l} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderInlineStart: `4px solid ${k.c}` }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: k.c, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{k.v}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: th.muted }}>{k.l}</span>
            </div>
          ))}
          {nextEv && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '8px 20px', borderRadius: 12, background: `${th.accent}14`, border: `1px solid ${th.accent}44`, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: th.accent, letterSpacing: 1, whiteSpace: 'nowrap' }}>التالية</span>
              <span dir="ltr" style={{ fontSize: 24, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: th.text }}>{nextEv.time}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: th.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><bdi dir="ltr">{nmOf(nextEv.trip?.from_station, isAr)} → {nmOf(nextEv.trip?.to_station, isAr)}</bdi></span>
              <span style={{ marginInlineStart: 'auto', fontSize: 14, fontWeight: 800, color: th.accent, whiteSpace: 'nowrap' }}>{nextMins != null && nextMins > 0 ? `بعد ${nextMins} د` : 'الآن'}</span>
            </div>
          )}
        </div>

        {error && !data ? (
          <div style={{ textAlign: 'center', color: th.muted, fontSize: 26, padding: '150px 60px', fontWeight: 700, lineHeight: 1.9 }}>تعذّر تحميل بيانات الرحلات.<br />سيُعاد المحاولة تلقائياً.</div>
        ) : view === 'columns' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, padding: '16px 44px 56px', height: `calc(100% - ${HEADER_H + 56}px)`, boxSizing: 'border-box' }}>
            {[{ type: 'departure', label: 'المغادرة', accent: th.dep, icon: '↑' }, { type: 'arrival', label: 'الوصول', accent: th.arr, icon: '↓' }].map(col => {
              const items = events.filter(e => e.type === col.type)
              const pages = Math.max(1, Math.ceil(items.length / COL_PER))
              const p = ((tick % pages) + pages) % pages
              const shown = isAuto ? items.slice(p * COL_PER, p * COL_PER + COL_PER) : items
              const flow = !isAuto && items.length > 6
              return (
                <section key={col.type} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(8,14,20,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', background: `linear-gradient(90deg, ${col.accent}26, transparent)`, borderBottom: `2px solid ${col.accent}` }}>
                    <span style={{ width: 38, height: 38, borderRadius: 12, background: `${col.accent}22`, border: `1px solid ${col.accent}66`, color: col.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{col.icon}</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: col.accent }}>{col.label}</span>
                    <span style={{ marginInlineStart: 'auto', fontSize: 15, fontWeight: 800, color: th.text, background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '3px 14px', fontFamily: "'IBM Plex Mono', monospace" }}>{items.length}{isAuto && pages > 1 ? ` · ${p + 1}/${pages}` : ''}</span>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={flow ? { animation: `scrollup ${items.length * 3.5}s linear infinite` } : {}}>
                      {[...shown, ...(flow ? items : [])].map((e, i) => <Row key={e.id + '_' + i} e={e} accent={col.accent} th={th} isAr={isAr} nowMin={nowMin} />)}
                    </div>
                    {items.length === 0 && <div style={{ textAlign: 'center', color: th.muted, fontSize: 18, padding: '60px 0', fontWeight: 700 }}>لا توجد حركة</div>}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '16px 44px 56px', height: `calc(100% - ${HEADER_H + 56}px)`, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ background: 'rgba(8,14,20,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', height: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
              <div style={feedSorted.length > 8 ? { animation: `scrollup ${feedSorted.length * 3.5}s linear infinite` } : {}}>
                {[...feedSorted, ...(feedSorted.length > 8 ? feedSorted : [])].map((e, i) => <Row key={e.id + '_' + i} e={e} accent={e.type === 'arrival' ? th.arr : th.dep} th={th} isAr={isAr} nowMin={nowMin} />)}
                {feedSorted.length === 0 && <div style={{ textAlign: 'center', color: th.muted, fontSize: 20, padding: '90px 0', fontWeight: 700 }}>لا حركة حالياً</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

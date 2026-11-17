// عارض «المشهد»: يرسم شاشة مقسّمة لمناطق (وسائط / شاشة العرض / عناصر جاهزة / شريط أخبار) على لوحة 1920×1080 تُصغَّر لتناسب أي شاشة.
// يُستخدم في مشغّل الشاشة (بيانات حقيقية) وفي معاينة منشئ المشاهد (بيانات تجريبية).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import BoardPanel from '../board/BoardPanel'
import { THEMES } from '../board/boardParts'
import { Widget } from './widgets'
import { TickerBar } from './Ticker'
import { cityByKey } from './cities'
import { mediaUrl } from '../../utils/signage'

const W = 1920, H = 1080, TK = 96

// مستطيلات المناطق لكل تخطيط
export const LAYOUTS = {
  full:        { main: [0, 0, 1920, 1080] },
  side:        { main: [0, 0, 1280, 1080], side: [1280, 0, 640, 1080] },
  bottom:      { main: [0, 0, 1920, 1080 - TK], ticker: [0, 1080 - TK, 1920, TK] },
  side_bottom: { main: [0, 0, 1280, 1080 - TK], side: [1280, 0, 640, 1080 - TK], ticker: [0, 1080 - TK, 1920, TK] },
}

function useBoard(getBoard, mode, enabled) {
  const [data, setData] = useState(null); const [err, setErr] = useState(false)
  useEffect(() => {
    if (!enabled || !getBoard) return
    let stop = false
    const pull = async () => { try { const d = await getBoard(mode); if (!stop) { setData(d); setErr(false) } } catch { if (!stop) setErr(true) } }
    pull(); const t = setInterval(pull, 15000)
    return () => { stop = true; clearInterval(t) }
  }, [mode, enabled, getBoard])
  return [data, err]
}

// عمود عناصر يُصغَّر تلقائياً ليتسع في ارتفاع المنطقة بدل أن يُقص
function FitColumn({ children, gap = 16 }) {
  const box = useRef(null), inner = useRef(null)
  const [sc, setSc] = useState(1)
  useLayoutEffect(() => {
    const fit = () => { const b = box.current, i = inner.current; if (!b || !i) return; const need = i.scrollHeight; setSc(need > b.clientHeight ? Math.max(0.4, b.clientHeight / need) : 1) }
    fit(); const ro = new ResizeObserver(fit); if (inner.current) ro.observe(inner.current); if (box.current) ro.observe(box.current)
    const t = setInterval(fit, 3000)   // عناصر تتحمّل بياناتها لاحقاً (طقس/رحلات)
    return () => { ro.disconnect(); clearInterval(t) }
  }, [])
  return (
    <div ref={box} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div ref={inner} style={{ width: `${100 / sc}%`, transform: `scale(${sc})`, transformOrigin: 'top right', display: 'flex', flexDirection: 'column', gap, padding: 16, boxSizing: 'border-box' }}>{children}</div>
    </div>
  )
}

function MediaZone({ zone, refs }) {
  const r = refs?.[zone.media_id]
  if (!r) return <div style={{ position: 'absolute', inset: 0, background: '#0b1220' }} />
  const st = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: zone.fit === 'cover' ? 'cover' : 'contain', background: '#000' }
  return r.kind === 'video'
    ? <video key={r.path} src={mediaUrl(r.path)} crossOrigin="anonymous" autoPlay muted playsInline loop style={st} />
    : <img key={r.path} src={mediaUrl(r.path)} crossOrigin="anonymous" alt="" style={st} />
}

export default function SceneView({ config, refs, tickers, lat, lng, getBoard, demo }) {
  const th = THEMES[config?.theme] || THEMES.nwb
  const lay = LAYOUTS[config?.layout] || LAYOUTS.full
  const zones = config?.zones || {}
  const wrap = useRef(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => { const el = wrap.current; if (el?.clientWidth) setScale(Math.min(el.clientWidth / W, el.clientHeight / H)) }
    fit(); const ro = new ResizeObserver(fit); if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // الإحداثيات: محطة الشاشة، وإلا المدينة الاحتياطية المختارة في المشهد
  const city = cityByKey(config?.fallback_city)
  const ok = Number.isFinite(lat) && Number.isFinite(lng)
  const cLat = ok ? lat : city?.lat, cLng = ok ? lng : city?.lng

  // أي منطقة تحتاج بيانات الرحلات؟
  const needBoard = Object.values(zones).some(z => z?.type === 'board' || (z?.type === 'widgets' && (z.items || []).includes('next_trip')))
  const boardZone = Object.values(zones).find(z => z?.type === 'board')
  const [boardData, boardErr] = useBoard(getBoard, boardZone?.mode || 'scheduled', needBoard && !!boardZone)
  const [tripData] = useBoard(getBoard, 'scheduled', needBoard && !boardZone)
  const nextTripData = boardZone?.mode === 'scheduled' ? boardData : tripData

  const renderZone = (key, z) => {
    if (!z) return null
    if (z.type === 'media') return <MediaZone zone={z} refs={refs} />
    if (z.type === 'board') return <BoardPanel data={boardData} config={{ theme: config?.theme, layout: z.layout, mode: z.mode }} error={boardErr} />
    if (z.type === 'widgets') {
      const items = z.items || []
      const wide = lay[key][2] > 900
      const cards = items.map(k => <Widget key={k} k={k} th={th} lat={cLat} lng={cLng} board={nextTripData} />)
      if (wide && items.length > 1) {
        // منطقة عريضة: عمودان من العناصر
        const half = Math.ceil(items.length / 2)
        return (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', background: th.fx || th.bg }}>
            <div style={{ position: 'relative' }}><FitColumn>{cards.slice(0, half)}</FitColumn></div>
            <div style={{ position: 'relative' }}><FitColumn>{cards.slice(half)}</FitColumn></div>
          </div>
        )
      }
      return <div style={{ position: 'absolute', inset: 0, background: th.fx || th.bg }}><FitColumn>{cards}</FitColumn></div>
    }
    if (z.type === 'ticker') return <TickerBar messages={tickers || []} speed={z.speed} th={th} height={TK} />
    return null
  }

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
      <div dir="rtl" style={{ position: 'absolute', top: '50%', left: '50%', width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, transform: `scale(${scale})`, transformOrigin: 'center center', overflow: 'hidden', background: th.fx || th.bg, color: th.text, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
        {Object.entries(lay).map(([key, [x, y, w, h]]) => (
          <div key={key} style={{ position: 'absolute', left: x, top: y, width: w, height: h, overflow: 'hidden', borderInlineStart: key === 'side' ? `3px solid ${th.accent}` : undefined, boxSizing: 'border-box' }}>
            {renderZone(key, zones[key])}
          </div>
        ))}
      </div>
      {demo && <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6, fontSize: 11, fontWeight: 800, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '2px 8px', borderRadius: 99 }}>معاينة</div>}
    </div>
  )
}

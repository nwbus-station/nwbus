// ودجات الشاشة (ساعة، مواقيت الصلاة، طقس، عدّاد الرحلة القادمة) — تُرسم داخل منطقة من لوحة 1920×1080
import { useState, useEffect } from 'react'
import { Coordinates, CalculationMethod, PrayerTimes } from 'adhan'
import { toMin } from '../board/boardParts'

const TZ = 'Asia/Riyadh'
const MONO = "'IBM Plex Mono', monospace"
const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const fmtSec = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, second: '2-digit' })
const fmtDay = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: TZ, weekday: 'long' })
const fmtGreg = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
const fmtHijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
const fmtYMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hm = d => fmtHM.format(d)
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const rtMin = () => toMin(hm(new Date()))

function useTick(ms) {
  const [, setN] = useState(0)
  useEffect(() => { const id = setInterval(() => setN(n => n + 1), ms); return () => clearInterval(id) }, [ms])
}

const CSS = `@keyframes wgPulse{0%,100%{opacity:1}50%{opacity:.55}}.wg-pulse{animation:wgPulse 1.6s ease-in-out infinite}`

function Card({ th, title, accent, icon, children, muted }) {
  const ac = accent || th.accent
  return (
    <section dir="rtl" style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(8,14,20,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', color: th.text, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', background: `linear-gradient(90deg, ${ac}26, transparent)`, borderBottom: `2px solid ${ac}` }}>
        <span style={{ width: 6, height: 26, background: ac, borderRadius: 2 }} />
        <span style={{ fontSize: 26, fontWeight: 800, color: ac }}>{title}</span>
        {icon && <span style={{ marginInlineStart: 'auto', display: 'inline-flex', color: ac }}>{icon}</span>}
      </div>
      <div style={{ padding: 24, color: muted ? th.muted : th.text, fontWeight: muted ? 700 : 400, fontSize: muted ? 24 : undefined, textAlign: muted ? 'center' : undefined }}>{children}</div>
    </section>
  )
}

const Svg = ({ size = 28, children, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const IcClock = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
const IcMosque = () => <Svg><path d="M12 3c0 2-3 3-3 6h6c0-3-3-4-3-6z" /><path d="M5 21V11h14v10M3 21h18M10 21v-4a2 2 0 014 0v4" /></Svg>
const IcBus = () => <Svg><rect x="4" y="4" width="16" height="13" rx="2" /><path d="M4 11h16M7 20v-3M17 20v-3" /><circle cx="8" cy="14" r=".6" /><circle cx="16" cy="14" r=".6" /></Svg>

// ===== الساعة =====
export function ClockWidget({ th }) {
  useTick(1000)
  const d = new Date()
  return (
    <Card th={th} title="الساعة والتاريخ" icon={<IcClock />}>
      <div dir="ltr" style={{ fontFamily: MONO, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, lineHeight: 1 }}>
        <span style={{ fontSize: 100, fontWeight: 800, color: th.accent }}>{hm(d)}</span>
        <span style={{ fontSize: 40, fontWeight: 600, color: th.muted, opacity: 0.8 }}>:{fmtSec.format(d).padStart(2, '0')}</span>
      </div>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <div style={{ fontSize: 40, fontWeight: 800 }}>{fmtDay.format(d)}</div>
        <div style={{ fontSize: 30, fontWeight: 600, marginTop: 8 }}>{fmtGreg.format(d)} م</div>
        <div style={{ fontSize: 28, fontWeight: 600, color: th.muted, marginTop: 6 }}>{fmtHijri.format(d)} هـ</div>
      </div>
    </Card>
  )
}

// ===== الصلاة =====
const PRAYERS = [['fajr', 'الفجر'], ['sunrise', 'الشروق'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']]
const riyadhDay = (now, plus = 0) => { // تاريخ الرياض كـ Date محلي (تستخدم adhan مكوّنات اليوم/الشهر/السنة)
  const [y, m, d] = fmtYMD.format(now).split('-').map(Number)
  return new Date(y, m - 1, d + plus, 12)
}
// يرجع جدول اليوم + الصلاة القادمة (الشروق ليس صلاة؛ بعد العشاء → فجر الغد)
export function nextPrayerInfo(lat, lng, now = new Date()) {
  const coords = new Coordinates(lat, lng), params = CalculationMethod.UmmAlQura()
  const today = new PrayerTimes(coords, riyadhDay(now), params)
  const list = PRAYERS.map(([k, ar]) => ({ k, ar, at: today[k] }))
  const nxt = list.find(p => p.k !== 'sunrise' && p.at > now)
  if (nxt) return { list, next: nxt, tomorrow: false }
  const tm = new PrayerTimes(coords, riyadhDay(now, 1), params)
  return { list, next: { k: 'fajr', ar: 'الفجر', at: tm.fajr }, tomorrow: true }
}
const fmtCountdown = ms => {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  const p = n => String(n).padStart(2, '0')
  return h > 0 ? `بعد ${h}:${p(m)}:${p(s)}` : m > 0 ? `بعد ${m} د` : `بعد ${s} ث`
}

export function PrayerWidget({ th, lat, lng }) {
  useTick(1000)
  if (!isNum(lat) || !isNum(lng)) return <Card th={th} title="مواقيت الصلاة" icon={<IcMosque />} muted>الموقع غير محدد لحساب مواقيت الصلاة</Card>
  const now = new Date()
  let info = null
  try { info = nextPrayerInfo(lat, lng, now) } catch { /* موقع غير صالح */ }
  if (!info) return <Card th={th} title="مواقيت الصلاة" icon={<IcMosque />} muted>تعذّر حساب مواقيت الصلاة</Card>
  const { list, next } = info
  return (
    <Card th={th} title="مواقيت الصلاة" icon={<IcMosque />}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: th.muted }}>الصلاة القادمة: <b style={{ color: th.accent }}>{next.ar}</b></span>
        <span dir="ltr" className="wg-pulse" style={{ fontSize: 40, fontWeight: 800, color: th.accent, fontFamily: MONO }}>{fmtCountdown(next.at - now)}</span>
      </div>
      {list.map(p => {
        const isNext = p.k === next.k, rise = p.k === 'sunrise'
        return (
          <div key={p.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', marginTop: 6, borderRadius: 10, background: isNext ? `${th.accent}22` : 'rgba(255,255,255,0.04)', borderInlineStart: `5px solid ${isNext ? th.accent : 'transparent'}`, opacity: rise ? 0.7 : 1 }}>
            <span style={{ fontSize: 32, fontWeight: isNext ? 800 : 600, color: isNext ? th.accent : th.text }}>{p.ar}</span>
            <span dir="ltr" style={{ fontSize: 38, fontWeight: 800, fontFamily: MONO, color: isNext ? th.accent : th.text }}>{hm(p.at)}</span>
          </div>
        )
      })}
    </Card>
  )
}

// ===== الطقس =====
const WX_TTL = 20 * 60 * 1000
const wxGroup = c => c === 0 ? ['صافٍ', 'sun'] : c <= 2 ? ['غائم جزئياً', 'part'] : c === 3 ? ['غائم', 'cloud'] : (c === 45 || c === 48) ? ['ضباب', 'fog']
  : (c >= 51 && c <= 57) ? ['رذاذ', 'rain'] : (c >= 61 && c <= 67) ? ['أمطار', 'rain'] : (c >= 71 && c <= 77) ? ['ثلوج', 'snow']
  : (c >= 80 && c <= 82) ? ['زخات مطر', 'rain'] : c >= 95 ? ['عواصف رعدية', 'storm'] : ['غير معروف', 'cloud']
const CLOUD = 'M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 18H7z'
function WxIcon({ g, size = 120 }) {
  const sun = <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
  return (
    <Svg size={size} sw={1.5}>
      {g === 'sun' && sun}
      {g === 'part' && <><circle cx="8" cy="8" r="3" /><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1" /><path d="M9 20a3.5 3.5 0 010-7 5 5 0 019.6 1A3 3 0 0118 20H9z" /></>}
      {g === 'cloud' && <path d={CLOUD} />}
      {g === 'rain' && <><path d="M7 15a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 15H7z" /><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" /></>}
      {g === 'storm' && <><path d="M7 14a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 14H7z" /><path d="M12.5 14l-2.5 4h3l-2 4" /></>}
      {g === 'fog' && <><path d="M7 13a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 13H7z" /><path d="M4 17h16M6 21h12" /></>}
      {g === 'snow' && <><path d="M7 14a4 4 0 010-8 5.5 5.5 0 0110.6 1.2A3.4 3.4 0 0117 14H7z" /><path d="M8 18v.01M12 20v.01M16 18v.01M10 22v.01M14 22v.01" strokeWidth="3" /></>}
    </Svg>
  )
}
const IcWx = () => <Svg><path d={CLOUD} transform="translate(0 -1)" /></Svg>
const readWx = key => { try { const o = JSON.parse(localStorage.getItem(key)); return o && o.d ? o : null } catch { return null } }

export function WeatherWidget({ th, lat, lng }) {
  const ok = isNum(lat) && isNum(lng)
  const [wx, setWx] = useState(() => (ok ? readWx(`nw_wx_${lat.toFixed(2)}_${lng.toFixed(2)}`)?.d || null : null))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!ok) return
    const key = `nw_wx_${lat.toFixed(2)}_${lng.toFixed(2)}`
    let alive = true, ctl = null
    const load = async () => {
      const c = readWx(key)
      if (c && Date.now() - c.t < WX_TTL) { if (alive) { setWx(c.d); setFailed(false) } return }
      ctl = new AbortController()
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Asia%2FRiyadh`, { signal: ctl.signal })
        if (!r.ok) throw new Error('http ' + r.status)
        const j = await r.json()
        if (!j?.current) throw new Error('bad payload')
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: j })) } catch { /* التخزين غير متاح */ }
        if (alive) { setWx(j); setFailed(false) }
      } catch {
        const s = readWx(key) // نسخة قديمة إن وُجدت
        if (alive) { if (s) setWx(s.d); else setFailed(true) }
      }
    }
    setWx(readWx(key)?.d || null); setFailed(false)
    load()
    const id = setInterval(load, WX_TTL)
    return () => { alive = false; clearInterval(id); ctl?.abort() }
  }, [ok, lat, lng])

  if (!ok) return <Card th={th} title="الطقس" icon={<IcWx />} muted>الموقع غير محدد</Card>
  const cur = wx?.current
  if (!cur) return <Card th={th} title="الطقس" icon={<IcWx />} muted>{failed ? 'الطقس غير متاح حالياً' : 'جارٍ تحميل الطقس…'}</Card>
  const [txt, g] = wxGroup(cur.weather_code)
  const stats = [['الإحساس', `${Math.round(cur.apparent_temperature)}°`], ['الرطوبة', `${Math.round(cur.relative_humidity_2m)}%`], ['الرياح', `${Math.round(cur.wind_speed_10m)} كم/س`]]
  return (
    <Card th={th} title="الطقس" icon={<IcWx />}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ color: th.accent, display: 'flex' }}><WxIcon g={g} /></div>
        <div style={{ textAlign: 'end' }}>
          <div dir="ltr" style={{ fontFamily: MONO, fontSize: 100, fontWeight: 800, lineHeight: 1, color: th.text }}>{Math.round(cur.temperature_2m)}<span style={{ fontSize: 44, color: th.muted, marginInlineStart: 4 }}>°م</span></div>
          <div style={{ fontSize: 36, fontWeight: 800, color: th.accent, marginTop: 8 }}>{txt}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
        {stats.map(([l, v]) => (
          <div key={l} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: th.muted }}>{l}</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, fontFamily: MONO }} dir="ltr">{v}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ===== عدّاد الرحلة القادمة =====
const fmtMins = m => m <= 0 ? 'الآن' : m >= 60 ? `بعد ${Math.floor(m / 60)}س ${m % 60}د` : `بعد ${m} د`

function TripBlock({ th, label, color, ev, nowMin }) {
  const mins = ev ? toMin(ev.time) - nowMin : null
  const soon = mins != null && mins <= 20
  return (
    <div style={{ padding: '18px 20px', marginTop: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', borderInlineStart: `6px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color }}>{label}</span>
        {ev && <span dir="ltr" style={{ fontSize: 22, fontWeight: 700, fontFamily: MONO, background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 14px' }}>{ev.trip?.trip_number || '—'}</span>}
      </div>
      {!ev ? <div style={{ fontSize: 28, fontWeight: 700, color: th.muted, padding: '18px 0 6px' }}>لا توجد رحلات قادمة</div> : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div dir="ltr" style={{ fontFamily: MONO, fontSize: 72, fontWeight: 800, lineHeight: 1, textAlign: 'right' }}>{ev.time}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: th.text }}>
              <bdi>{ev.trip?.from_station?.name_ar || '—'}</bdi> <span style={{ color }}>←</span> <bdi>{ev.trip?.to_station?.name_ar || '—'}</bdi>
            </div>
          </div>
          <span className={soon ? 'wg-pulse' : undefined} style={{ fontSize: 28, fontWeight: 800, whiteSpace: 'nowrap', borderRadius: 8, padding: '8px 20px', color: soon ? '#101010' : th.muted, background: soon ? th.accent : 'transparent', border: soon ? `1px solid ${th.accent}` : `1px solid ${th.muted}66` }}>{fmtMins(mins)}</span>
        </div>
      )}
    </div>
  )
}

export function NextTripWidget({ th, data }) {
  useTick(15000)
  const nowMin = rtMin()
  const pick = type => (data?.events || []).filter(e => e.type === type && toMin(e.time) - nowMin >= -2).sort((a, b) => toMin(a.time) - toMin(b.time))[0] || null
  return (
    <Card th={th} title="الرحلة القادمة" icon={<IcBus />}>
      {!data ? <div className="wg-pulse" style={{ fontSize: 26, fontWeight: 700, color: th.muted, textAlign: 'center', padding: '30px 0' }}>جارٍ تحميل الرحلات…</div> : (
        <>
          <TripBlock th={th} label="المغادرة القادمة" color={th.dep} ev={pick('departure')} nowMin={nowMin} />
          <TripBlock th={th} label="الوصول القادم" color={th.arr} ev={pick('arrival')} nowMin={nowMin} />
        </>
      )}
    </Card>
  )
}

export const WIDGET_META = [
  { key: 'clock', ar: 'الساعة والتاريخ (ميلادي وهجري)', needsLocation: false },
  { key: 'prayer', ar: 'مواقيت الصلاة', needsLocation: true },
  { key: 'weather', ar: 'الطقس', needsLocation: true },
  { key: 'next_trip', ar: 'عدّاد الرحلة القادمة', needsLocation: false, needsBoard: true },
]

export function Widget({ k, th, lat, lng, board }) {
  switch (k) {
    case 'clock': return <ClockWidget th={th} />
    case 'prayer': return <PrayerWidget th={th} lat={lat} lng={lng} />
    case 'weather': return <WeatherWidget th={th} lat={lat} lng={lng} />
    case 'next_trip': return <NextTripWidget th={th} data={board} />
    default: return null
  }
}

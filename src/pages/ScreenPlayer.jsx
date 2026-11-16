// مشغّل شاشة المحطة (/screen): صفحة عامة بملء الشاشة تعمل على أي جهاز بمتصفح (Android box، تلفزيون، Raspberry).
// لا تسجيل دخول: الجهاز يولّد مفتاحاً عشوائياً محلياً، ويعرض رمز ربط لا يربطه إلا الأدمن من لوحة التحكم.
// بعد الربط يسحب قائمته كل دقيقة، ويحتفظ بآخر قائمة محلياً فيستمر بالعرض لو انقطع الإنترنت.
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NWB_LOGO_SVG } from '../utils/logo'
import { mediaUrl, randomSecret } from '../utils/signage'

// عميل مستقل بلا جلسة موظف: الشاشة لا تحمل أي هوية سوى مفتاح جهازها
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const KEY_SECRET = 'nw_screen_secret'
const KEY_CACHE = 'nw_screen_manifest'
const VER = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const LOGO = NWB_LOGO_SVG.replace(/#1D1D1C/gi, '#FFFFFF').replace(/#264673/gi, '#6E94D1').replace(/fill="white"/g, 'fill="none"').replace(/width="180" height="90"/, 'width="260" height="130"')
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

const ls = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* مساحة ممتلئة */ } },
  del: k => { try { localStorage.removeItem(k) } catch { /* */ } },
}
function getSecret(fresh = false) {
  let s = fresh ? null : ls.get(KEY_SECRET)
  if (!s || s.length < 40) { s = randomSecret(); ls.set(KEY_SECRET, s) }
  return s
}
function loadCache() {
  try {
    const c = JSON.parse(ls.get(KEY_CACHE) || 'null')
    if (c?.m && Date.now() - c.at < (c.m.ttl || 43200) * 1000) return c.m
  } catch { /* */ }
  return null
}

const clockStr = () => new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })

const Full = ({ children, style }) => (
  <div style={{ position: 'fixed', inset: 0, background: '#0b1220', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32, fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif", ...style }}>{children}</div>
)

export default function ScreenPlayer() {
  const secretRef = useRef(null)
  if (!secretRef.current) secretRef.current = getSecret()
  const [phase, setPhase] = useState('boot')           // boot | pair | run | revoked
  const [pair, setPair] = useState(null)               // { code, until }
  const [manifest, setManifest] = useState(loadCache)
  const [offline, setOffline] = useState(false)
  const [, setTick] = useState(0)
  const playingRef = useRef('')

  useEffect(() => { document.title = 'NWBUS Screen'; const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t) }, [])

  // ── الربط ── (boot: طلب رمز جديد، pair: انتظار إدخال الأدمن للرمز)
  useEffect(() => {
    if (phase !== 'boot' && phase !== 'pair') return
    let stop = false, timer
    const start = async () => {
      try {
        const { data, error } = await sb.rpc('signage_pair_start', { p_secret: secretRef.current })
        if (stop) return
        if (error) throw error
        if (data.state === 'paired') { setPhase('run'); return }
        if (data.state === 'revoked') { setPhase('revoked'); return }
        setPair({ code: data.code, until: Date.now() + data.expires_in * 1000 }); setPhase('pair')
      } catch { if (!stop) timer = setTimeout(start, 10000) }
    }
    const poll = async () => {
      try {
        const { data } = await sb.rpc('signage_pair_status', { p_secret: secretRef.current })
        if (stop) return
        if (data?.state === 'paired') { setPhase('run'); return }
        if (data?.state === 'revoked') { setPhase('revoked'); return }
        if (data?.state === 'expired' || data?.state === 'unknown') { setPair(null); setPhase('boot'); return }   // انتهى الرمز: نطلب جديداً
      } catch { /* نعيد المحاولة */ }
      if (!stop) timer = setTimeout(poll, 4000)
    }
    if (phase === 'boot') start(); else timer = setTimeout(poll, 4000)
    return () => { stop = true; clearTimeout(timer) }
  }, [phase])

  // ── سحب القائمة ──
  useEffect(() => {
    if (phase !== 'run') return
    let stop = false
    const pull = async () => {
      try {
        const { data, error } = await sb.rpc('signage_manifest', { p_secret: secretRef.current, p_version: VER, p_playing: playingRef.current || null })
        if (stop) return
        if (error) {
          if (/unauthorized/i.test(error.message || '')) {
            const { data: st } = await sb.rpc('signage_pair_status', { p_secret: secretRef.current })
            if (st?.state === 'revoked') { ls.del(KEY_CACHE); setManifest(null); setPhase('revoked') }
            else { ls.del(KEY_CACHE); setManifest(null); secretRef.current = getSecret(true); setPhase('boot') }   // حُذف الجهاز: ربط جديد
            return
          }
          throw error
        }
        setManifest(data); setOffline(false); ls.set(KEY_CACHE, JSON.stringify({ m: data, at: Date.now() }))
      } catch { if (!stop) setOffline(true) }
    }
    pull()
    const t = setInterval(pull, 60000)
    return () => { stop = true; clearInterval(t) }
  }, [phase])

  // ── بقاء الشاشة مضاءة + إعادة تحميل يومية (تنظيف الذاكرة) ──
  useEffect(() => {
    let lock
    const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* غير مدعوم */ } }
    acquire()
    const vis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', vis)
    const born = Date.now()
    const t = setInterval(() => {
      const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' }))
      if (h === 4 && Date.now() - born > 3 * 3600 * 1000) location.reload()
    }, 60000)
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(t); try { lock?.release() } catch { /* */ } }
  }, [])

  const fs = () => { try { document.documentElement.requestFullscreen?.() } catch { /* */ } }
  const portrait = manifest?.device?.orientation === 'portrait' && typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  const rot = portrait
    ? { position: 'fixed', top: 0, left: 0, width: '100vh', height: '100vw', transform: 'rotate(90deg) translateY(-100%)', transformOrigin: 'top left' }
    : { position: 'fixed', inset: 0 }

  if (phase === 'revoked') {
    return (
      <Full>
        <div dangerouslySetInnerHTML={{ __html: LOGO }} style={{ opacity: 0.5 }} />
        <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: '28px 0 8px' }}>هذه الشاشة موقوفة</h1>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem', maxWidth: 520, lineHeight: 1.9 }}>أوقفت الإدارة هذا الجهاز. تواصل مع قسم الشاشات لإعادة تفعيله.</p>
      </Full>
    )
  }

  if (phase !== 'run') {
    const left = pair ? Math.max(0, Math.round((pair.until - Date.now()) / 1000)) : 0
    return (
      <Full style={{ cursor: 'pointer' }} >
        <div onClick={fs} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
        <div dangerouslySetInnerHTML={{ __html: LOGO }} style={{ position: 'relative' }} />
        <h1 style={{ position: 'relative', fontSize: 'clamp(1.2rem, 3vw, 2rem)', fontWeight: 800, margin: '30px 0 14px', color: '#cbd5e1' }}>ربط الشاشة</h1>
        {pair ? (
          <>
            <div dir="ltr" style={{ position: 'relative', fontFamily: MONO, fontWeight: 900, fontSize: 'clamp(2.6rem, 9vw, 6.5rem)', letterSpacing: '.16em', padding: '14px 36px', borderRadius: 20, background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(255,255,255,0.18)' }}>{pair.code}</div>
            <p style={{ position: 'relative', color: '#94a3b8', fontSize: 'clamp(.95rem, 2vw, 1.3rem)', lineHeight: 2, maxWidth: 720, marginTop: 28 }}>
              من حساب الإدارة افتح <b style={{ color: '#fff' }}>NWBUS ← الشاشات ← ربط شاشة جديدة</b> وأدخل هذا الرمز.
            </p>
            <p dir="ltr" style={{ position: 'relative', color: '#64748b', fontFamily: MONO, fontSize: '1rem', marginTop: 8 }}>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</p>
          </>
        ) : (
          <p style={{ position: 'relative', color: '#94a3b8', fontSize: '1.2rem' }}>جارٍ تجهيز رمز الربط…</p>
        )}
      </Full>
    )
  }

  return (
    <div style={{ ...rot, background: '#000', overflow: 'hidden', cursor: 'none' }} onClick={fs}>
      <Stage manifest={manifest} secret={secretRef.current} playingRef={playingRef} />
      {offline && <div title="لا يوجد اتصال" style={{ position: 'absolute', bottom: 8, insetInlineEnd: 8, width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', opacity: 0.7 }} />}
      {manifest?.emergency && (
        <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#b91c1c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6%', animation: 'sgPulse 1.6s ease-in-out infinite', fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif" }}>
          <div style={{ fontSize: 'clamp(2rem, 6.5vw, 6rem)', fontWeight: 900, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{manifest.emergency.message}</div>
        </div>
      )}
      <style>{`@keyframes sgFade{from{opacity:0}to{opacity:1}}@keyframes sgPulse{0%,100%{background:#b91c1c}50%{background:#7f1d1d}}@media (prefers-reduced-motion: reduce){*{animation:none !important}}`}</style>
    </div>
  )
}

// ── المسرح: يعرض عناصر القائمة بالتتابع (صورة بمدتها / فيديو حتى نهايته) ويجمع إثبات التشغيل ──
function Stage({ manifest, secret, playingRef }) {
  const items = manifest?.items || []
  const [idx, setIdx] = useState(0)
  const sig = items.map(i => `${i.campaign_id}:${i.media_id}:${i.duration}`).join('|')
  const len = items.length
  const cur = len ? items[idx % len] : null
  const startedRef = useRef(Date.now())
  const plays = useRef([])

  const flush = useCallback(async () => {
    if (!plays.current.length) return
    const batch = plays.current.slice(0, 100)
    try {
      const { error } = await sb.rpc('signage_report', { p_secret: secret, p_plays: batch })
      if (!error) plays.current = plays.current.slice(batch.length)
    } catch { /* نحتفظ بها للمحاولة التالية */ }
    if (plays.current.length > 500) plays.current = plays.current.slice(-500)
  }, [secret])
  useEffect(() => { const t = setInterval(flush, 5 * 60 * 1000); return () => { clearInterval(t) } }, [flush])

  const curRef = useRef(cur)
  curRef.current = cur
  const next = useCallback(() => {
    const c = curRef.current
    if (c) {
      plays.current.push({ c: c.campaign_id, m: c.media_id, s: Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)), t: new Date(startedRef.current).toISOString() })
      if (plays.current.length >= 50) flush()
    }
    setIdx(i => (len ? (i + 1) % len : 0))
  }, [len, flush])

  // تغيّرت القائمة: نبقى على موضعنا إن أمكن
  useEffect(() => { setIdx(i => (len ? i % len : 0)) }, [sig, len])
  const curId = cur?.media_id, curKind = cur?.kind, curDur = cur?.duration, curTitle = cur?.title
  useEffect(() => { startedRef.current = Date.now(); playingRef.current = curTitle || '' }, [idx, curId, curTitle, playingRef])

  // مؤقّت الانتقال: للصورة مدتها، وللفيديو مهلة أمان بعد مدته المسجّلة (لا يُعاد ضبطه عند تحديث القائمة)
  useEffect(() => {
    if (!curId || len < 2) return
    const ms = (curKind === 'video' ? curDur + 12 : curDur) * 1000
    const t = setTimeout(next, ms)
    return () => clearTimeout(t)
  }, [idx, curId, curKind, curDur, len, next])

  if (!cur) return <Idle manifest={manifest} />
  const url = mediaUrl(cur.path)
  const nx = len > 1 ? items[(idx + 1) % len] : null
  return (
    <>
      {cur.kind === 'video'
        ? <video key={`${idx}-${cur.media_id}`} src={url} autoPlay muted playsInline loop={len < 2} onEnded={next} onError={() => setTimeout(next, 1500)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', animation: 'sgFade .6s ease-out' }} />
        : <img key={`${idx}-${cur.media_id}`} src={url} alt="" onError={() => setTimeout(next, 1500)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', animation: 'sgFade .6s ease-out' }} />}
      {/* تحميل مسبق للعنصر التالي */}
      {nx && (nx.kind === 'video'
        ? <video key={`p-${nx.media_id}`} src={mediaUrl(nx.path)} preload="auto" muted style={{ display: 'none' }} />
        : <img key={`p-${nx.media_id}`} src={mediaUrl(nx.path)} alt="" style={{ display: 'none' }} />)}
    </>
  )
}

function Idle({ manifest }) {
  return (
    <Full>
      <div dangerouslySetInnerHTML={{ __html: LOGO }} style={{ opacity: 0.9 }} />
      {manifest?.device?.station && <div style={{ marginTop: 26, fontSize: 'clamp(1.2rem, 3vw, 2.2rem)', fontWeight: 800, color: '#cbd5e1' }}>{manifest.device.station}</div>}
      <div dir="ltr" style={{ marginTop: 10, fontFamily: MONO, fontSize: 'clamp(2rem, 6vw, 4.5rem)', fontWeight: 900, color: '#6E94D1' }}>{clockStr()}</div>
    </Full>
  )
}

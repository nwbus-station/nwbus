import { useState, useEffect, useRef, useCallback } from 'react'
import { getEngine } from '../../utils/docScan'

const STABLE_MS = 1100       // مدة بقاء كل الشروط متحققة قبل الالتقاط التلقائي
const DET_W = 480            // عرض إطار الكشف (أعلى = قراءة حدّة أدق)
const LOST_HOLD_MS = 450     // نُبقي الإطار ظاهراً لحظة بعد فقدان الكشف لتجنّب الوميض

const lerp = (a, b, t) => a + (b - a) * t

// ماسح مستندات: كشف حيّ سلس (Worker) + التقاط تلقائي عند الثبات + تسوية وتحسين الورقة
export default function DocScannerModal({ isAr, onDone, onClose }) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const progressRef = useRef(null)
  const streamRef = useRef(null)
  const capturedRef = useRef(false)
  const aliveRef = useRef(true)
  const targetRef = useRef(null)     // آخر زوايا مكتشفة (إحداثيات الفيديو)
  const shownRef = useRef(null)      // الزوايا المعروضة (تنساب نحو الهدف)
  const lastSeenRef = useRef(0)
  const stableSinceRef = useRef(0)
  const blobRef = useRef(null)
  const [stage, setStage] = useState('loading') // loading | camera | processing | review | error
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState('color')
  const [crop, setCrop] = useState(true)
  const [hasQuad, setHasQuad] = useState(false)
  const [resultUrl, setResultUrl] = useState('')
  const [torch, setTorch] = useState({ supported: false, on: false })
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState({ found: false, full: false, sharp: false, light: false, steady: false })
  const sharpMaxRef = useRef(0)     // أعلى حدّة شوهدت (معيار نسبي مستقل عن الجهاز)
  const checksKeyRef = useRef('')

  const stopStream = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }, [])

  const showBlob = useCallback(blob => {
    blobRef.current = blob
    setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
  }, [])

  const startCamera = useCallback(async () => {
    setError(''); setResultUrl(''); capturedRef.current = false
    targetRef.current = null; shownRef.current = null; stableSinceRef.current = 0
    setStage('loading')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] }, audio: false })
      if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      setTorch({ supported: !!track?.getCapabilities?.().torch, on: false })
      const v = videoRef.current
      v.srcObject = stream
      await v.play()
      setHint(isAr ? 'وجّه الكاميرا نحو الورقة بالكامل' : 'Point the camera at the whole page')
      setStage('camera')
    } catch (e) {
      setError(e.message === 'nocam' || e.name === 'NotFoundError'
        ? (isAr ? 'لا توجد كاميرا متاحة على هذا الجهاز.' : 'No camera available on this device.')
        : (isAr ? 'تعذّر تشغيل الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح.' : 'Could not start the camera. Allow camera access in the browser settings.'))
      setStage('error')
    }
  }, [isAr])

  // تسخين المحرّك (تحميل OpenCV داخل الـWorker) بالتوازي مع تشغيل الكاميرا
  useEffect(() => {
    aliveRef.current = true
    getEngine().warmup()
    startCamera()
    return () => { aliveRef.current = false; stopStream() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.videoWidth || capturedRef.current) return
    capturedRef.current = true
    const hintQuad = targetRef.current
    setFlash(true); setTimeout(() => setFlash(false), 160)
    setStage('processing')
    try {
      // 3 لقطات متتالية؛ يختار المحرك أوضحها
      const bitmaps = []
      for (let i = 0; i < 3; i++) {
        const frame = document.createElement('canvas')
        frame.width = v.videoWidth; frame.height = v.videoHeight
        frame.getContext('2d').drawImage(v, 0, 0)
        bitmaps.push(await createImageBitmap(frame))
        if (i < 2) await new Promise(r => setTimeout(r, 90))
      }
      stopStream()
      const r = await getEngine().capture(bitmaps, hintQuad, mode)
      if (!aliveRef.current) return
      setHasQuad(r.hasQuad); setCrop(r.hasQuad)
      showBlob(r.blob)
      setStage('review')
    } catch {
      stopStream()
      setError(isAr ? 'تعذّرت معالجة الصورة. أعد المحاولة.' : 'Could not process the image. Try again.')
      setStage('error')
    }
  }, [mode, isAr, showBlob, stopStream])

  // حلقة الكشف: تتحقق من اكتمال الورقة ووضوحها وإضاءتها وثباتها، ولا تلتقط إلا حين تتحقق كلها لمدة كافية
  useEffect(() => {
    if (stage !== 'camera') return
    let alive = true
    const small = document.createElement('canvas')
    sharpMaxRef.current = 0
    ;(async () => {
      while (alive && !capturedRef.current) {
        const v = videoRef.current
        if (!v || !v.videoWidth) { await new Promise(r => setTimeout(r, 60)); continue }
        small.width = DET_W; small.height = Math.round(DET_W * v.videoHeight / v.videoWidth)
        small.getContext('2d').drawImage(v, 0, 0, small.width, small.height)
        let res = null
        try { res = await getEngine().detect(await createImageBitmap(small)) } catch { res = null }
        if (!alive || capturedRef.current) break
        const now = performance.now(), k = v.videoWidth / DET_W
        const q = res?.quad, m = res?.metrics
        let moving = true, f = { found: !!q, full: false, sharp: false, light: false, steady: false }, why = ''
        if (q && m) {
          const full = q.map(p => ({ x: p.x * k, y: p.y * k }))
          const prev = targetRef.current
          const move = prev ? full.reduce((s, p, i) => s + Math.hypot(p.x - prev[i].x, p.y - prev[i].y), 0) / 4 : 1e9
          targetRef.current = full; lastSeenRef.current = now
          moving = move >= v.videoWidth * 0.012
          sharpMaxRef.current = Math.max(sharpMaxRef.current * 0.995, m.sharp)   // سقف يتناقص ببطء
          f.full = m.full && m.areaFrac >= 0.3
          f.sharp = m.sharp >= 25 && m.sharp >= sharpMaxRef.current * 0.55
          f.light = m.bright >= 70 && m.glare <= 0.1
          f.steady = !moving
          why = !f.full ? (m.full ? (isAr ? 'قرّب الكاميرا من الورقة' : 'Move closer to the page') : (isAr ? 'اجعل الورقة كاملة داخل الإطار' : 'Keep the whole page inside the frame'))
            : m.bright < 70 ? (isAr ? 'الإضاءة ضعيفة، شغّل الإضاءة أو انتقل لمكان أفتح' : 'Too dark, turn on the light')
            : m.glare > 0.1 ? (isAr ? 'يوجد انعكاس ضوء، غيّر زاوية الكاميرا' : 'Glare detected, change the angle')
            : !f.sharp ? (isAr ? 'الصورة غير واضحة، ثبّت الجهاز وانتظر التركيز' : 'Image not sharp, hold steady for focus')
            : moving ? (isAr ? 'ثبّت الجهاز' : 'Hold steady') : ''
        } else if (now - lastSeenRef.current > LOST_HOLD_MS) {
          targetRef.current = null
          why = isAr ? 'لم أجد الورقة. ضعها على سطح بلون مغاير وأظهرها كاملة' : 'Page not found. Use a contrasting surface, fully in view'
        }
        const good = f.found && f.full && f.sharp && f.light && f.steady
        if (good) { if (!stableSinceRef.current) stableSinceRef.current = now } else stableSinceRef.current = 0
        const held = stableSinceRef.current ? now - stableSinceRef.current : 0
        if (progressRef.current) progressRef.current.style.width = `${Math.min(100, Math.round((held / STABLE_MS) * 100))}%`
        const key = `${+f.found}${+f.full}${+f.sharp}${+f.light}${+f.steady}`
        if (key !== checksKeyRef.current) { checksKeyRef.current = key; setChecks(f) }
        setHint(good ? (isAr ? 'البيانات واضحة... جارٍ التصوير' : 'Clear... capturing') : why)
        if (held >= STABLE_MS) { capture(); break }
      }
    })()
    return () => { alive = false }
  }, [stage, capture, isAr])

  // رسم الإطار: ينساب نحو الزوايا المكتشفة (60fps) مع تعتيم خارج الورقة
  useEffect(() => {
    if (stage !== 'camera') return
    let raf
    const draw = () => {
      const v = videoRef.current, ov = overlayRef.current
      if (v && ov && v.videoWidth) {
        if (ov.width !== v.videoWidth) { ov.width = v.videoWidth; ov.height = v.videoHeight }
        const ctx = ov.getContext('2d'); ctx.clearRect(0, 0, ov.width, ov.height)
        const t = targetRef.current
        if (t) {
          const s = shownRef.current
          shownRef.current = s ? s.map((p, i) => ({ x: lerp(p.x, t[i].x, 0.35), y: lerp(p.y, t[i].y, 0.35) })) : t
          const q = shownRef.current
          ctx.fillStyle = 'rgba(0,0,0,0.38)'
          ctx.beginPath(); ctx.rect(0, 0, ov.width, ov.height)
          q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath()
          ctx.fill('evenodd')
          ctx.lineWidth = Math.max(4, ov.width / 220); ctx.strokeStyle = '#34d399'; ctx.lineJoin = 'round'
          ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke()
          ctx.fillStyle = '#34d399'
          q.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(7, ov.width / 130), 0, Math.PI * 2); ctx.fill() })
        } else shownRef.current = null
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [stage])

  async function rerender(m, c) {
    setBusy(true)
    try { const r = await getEngine().render(m, c); if (r) showBlob(r.blob) } catch { /* تبقى الصورة الحالية */ }
    setBusy(false)
  }
  const changeMode = m => { setMode(m); rerender(m, crop) }
  const toggleCrop = () => { const c = !crop; setCrop(c); rerender(mode, c) }
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    try { await track.applyConstraints({ advanced: [{ torch: !torch.on }] }); setTorch(t => ({ ...t, on: !t.on })) } catch { /* غير مدعوم */ }
  }
  const close = () => { aliveRef.current = false; stopStream(); onClose() }
  const accept = () => { if (blobRef.current) { setBusy(true); onDone(blobRef.current) } }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col select-none" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-bold text-sm">{stage === 'review' ? (isAr ? 'مراجعة المسح' : 'Review scan') : 'Scan document'}</span>
        <div className="flex items-center gap-2">
          {stage === 'camera' && torch.supported && <button type="button" onClick={toggleTorch} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${torch.on ? 'bg-amber-400 text-black' : 'bg-white/15'}`}>{isAr ? 'الإضاءة' : 'Light'}</button>}
          <button type="button" onClick={close} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white/15">{isAr ? 'إغلاق' : 'Close'}</button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 w-full h-full object-contain ${stage === 'camera' ? '' : 'invisible'}`} />
        <canvas ref={overlayRef} className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${stage === 'camera' ? '' : 'invisible'}`} />
        {stage === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">{isAr ? 'جارٍ تشغيل الكاميرا...' : 'Starting camera...'}</div>}
        {stage === 'processing' && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">{isAr ? 'جارٍ معالجة المسح...' : 'Processing scan...'}</div>}
        {stage === 'error' && <div className="absolute inset-0 flex items-center justify-center px-6 text-white text-sm text-center leading-relaxed">{error}</div>}
        {stage === 'review' && resultUrl && <img src={resultUrl} alt="" className="absolute inset-0 w-full h-full object-contain bg-neutral-900" />}
        {flash && <div className="absolute inset-0 bg-white/80 pointer-events-none" />}
      </div>

      <div className="px-4 py-4 text-white">
        {stage === 'camera' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-white/90 text-center min-h-[1.2rem] leading-relaxed">{hint}</p>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {[
                { k: 'found', l: isAr ? 'الورقة' : 'Page' },
                { k: 'full', l: isAr ? 'كاملة' : 'Full' },
                { k: 'sharp', l: isAr ? 'واضحة' : 'Sharp' },
                { k: 'light', l: isAr ? 'الإضاءة' : 'Light' },
                { k: 'steady', l: isAr ? 'ثابتة' : 'Steady' },
              ].map(c => (
                <span key={c.k} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${checks[c.k] ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white/70'}`}>{c.l}</span>
              ))}
            </div>
            <div className="w-48 h-1.5 rounded bg-white/20 overflow-hidden"><div ref={progressRef} className="h-full bg-emerald-400 transition-[width] duration-100" style={{ width: '0%' }} /></div>
            <button type="button" onClick={capture} aria-label={isAr ? 'التقاط' : 'Capture'} className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/50" />
          </div>
        )}
        {stage === 'review' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
              {[{ v: 'color', l: isAr ? 'ألوان محسّنة' : 'Enhanced color' }, { v: 'bw', l: isAr ? 'أبيض وأسود' : 'Black & white' }].map(o => (
                <button key={o.v} type="button" disabled={busy} onClick={() => changeMode(o.v)} className={`px-3 py-1.5 rounded-lg font-semibold ${mode === o.v ? 'bg-white text-black' : 'bg-white/15 text-white'}`}>{o.l}</button>
              ))}
              {hasQuad && <button type="button" disabled={busy} onClick={toggleCrop} className="px-3 py-1.5 rounded-lg bg-white/15 font-semibold">{crop ? (isAr ? 'بدون قص' : 'No crop') : (isAr ? 'قص تلقائي' : 'Auto crop')}</button>}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={startCamera} disabled={busy} className="flex-1 py-3 rounded-lg bg-white/15 font-bold text-sm">{isAr ? 'إعادة التصوير' : 'Retake'}</button>
              <button type="button" onClick={accept} disabled={busy} className="flex-1 py-3 rounded-lg bg-emerald-500 text-white font-bold text-sm disabled:opacity-50">{isAr ? 'اعتماد' : 'Use scan'}</button>
            </div>
          </div>
        )}
        {stage === 'error' && <div className="flex justify-center"><button type="button" onClick={startCamera} className="px-5 py-2.5 rounded-lg bg-white/15 font-bold text-sm">{isAr ? 'إعادة المحاولة' : 'Try again'}</button></div>}
      </div>
    </div>
  )
}

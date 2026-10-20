import { useState, useEffect, useRef, useCallback } from 'react'
import { getEngine } from '../../utils/docScan'

const STABLE_MS = 900       // مدة بقاء كل الشروط متحققة قبل الالتقاط التلقائي
const DET_W = 480            // عرض إطار الكشف
const LOST_HOLD_MS = 450
const lerp = (a, b, t) => a + (b - a) * t
const avgDist = (a, b) => a.reduce((s, p, i) => s + Math.hypot(p.x - b[i].x, p.y - b[i].y), 0) / a.length

// ماسح مستندات على طراز تطبيقات المسح: كشف حيّ مستقر → التقاط → ضبط الحواف بالسحب → فلاتر وتدوير → اعتماد
export default function DocScannerModal({ isAr, onDone, onClose }) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const progressRef = useRef(null)
  const streamRef = useRef(null)
  const capturedRef = useRef(false)
  const aliveRef = useRef(true)
  const targetRef = useRef(null)     // الزوايا المستقرة (بعد التنعيم)
  const shownRef = useRef(null)      // الزوايا المعروضة (تنساب نحو الهدف)
  const lastSeenRef = useRef(0)
  const stableSinceRef = useRef(0)
  const jumpRef = useRef(0)
  const badSinceRef = useRef(0)
  const lastFlagsRef = useRef(null)
  const sharpMaxRef = useRef(0)
  const checksKeyRef = useRef('')
  const autoRef = useRef(true)
  const blobRef = useRef(null)
  const detectedRef = useRef(null)   // الزوايا المكتشفة تلقائياً على الإطار الكامل
  const boxRef = useRef(null)
  const [stage, setStage] = useState('loading') // loading | camera | processing | crop | rendering | review | error
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState('color')
  const [rot, setRot] = useState(0)
  const [auto, setAuto] = useState(true)
  const [torch, setTorch] = useState({ supported: false, on: false })
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState({ found: false, full: false, sharp: false, light: false, steady: false })
  const [cap, setCap] = useState(null)           // { url, w, h } الإطار الملتقط
  const [pts, setPts] = useState(null)           // زوايا الضبط (إحداثيات الإطار الكامل)
  const [drag, setDrag] = useState(null)         // { i } أثناء سحب زاوية
  const [resultUrl, setResultUrl] = useState('')

  const stopStream = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }, [])
  const setBlobUrl = useCallback(blob => { blobRef.current = blob; setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) }) }, [])

  const startCamera = useCallback(async () => {
    setError(''); capturedRef.current = false
    targetRef.current = null; shownRef.current = null; stableSinceRef.current = 0; jumpRef.current = 0
    setCap(c => { if (c) URL.revokeObjectURL(c.url); return null }); setPts(null); setRot(0)
    setStage('loading')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] }, audio: false })
      if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      setTorch({ supported: !!stream.getVideoTracks()[0]?.getCapabilities?.().torch, on: false })
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

  useEffect(() => {
    aliveRef.current = true
    getEngine().warmup()
    startCamera()
    return () => { aliveRef.current = false; stopStream() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── الالتقاط: 3 لقطات، المحرك يختار الأوضح ثم تُعرض شاشة ضبط الحواف ──
  const capture = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.videoWidth || capturedRef.current) return
    capturedRef.current = true
    const hintQuad = targetRef.current
    setFlash(true); setTimeout(() => setFlash(false), 160)
    setStage('processing')
    try {
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
      const W = r.width, H = r.height
      const inset = [{ x: W * 0.1, y: H * 0.1 }, { x: W * 0.9, y: H * 0.1 }, { x: W * 0.9, y: H * 0.9 }, { x: W * 0.1, y: H * 0.9 }]
      detectedRef.current = r.quad
      setCap({ url: URL.createObjectURL(r.preview), w: W, h: H })
      setPts(r.quad ?? inset)
      setStage('crop')
    } catch {
      stopStream()
      setError(isAr ? 'تعذّرت معالجة الصورة. أعد المحاولة.' : 'Could not process the image. Try again.')
      setStage('error')
    }
  }, [mode, isAr, stopStream])

  // ── حلقة الكشف: تنعيم الاهتزاز + شروط الجودة ──
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
        const f = { found: !!q || (targetRef.current && now - lastSeenRef.current < LOST_HOLD_MS), full: false, sharp: false, light: false, steady: false }
        let why = '', dev = 0
        if (q && m) {
          const raw = q.map(p => ({ x: p.x * k, y: p.y * k }))
          const sm = targetRef.current
          if (!sm) { targetRef.current = raw; jumpRef.current = 0 }
          else {
            dev = avgDist(raw, sm)
            if (dev < v.videoWidth * 0.006) { /* اهتزاز طفيف: نتجاهله */ }
            else if (dev > v.videoWidth * 0.12) { if (++jumpRef.current >= 3) { targetRef.current = raw; jumpRef.current = 0 } }   // قفزة: لا نقبلها إلا إذا تكررت
            else { jumpRef.current = 0; targetRef.current = sm.map((p, i) => ({ x: lerp(p.x, raw[i].x, 0.4), y: lerp(p.y, raw[i].y, 0.4) })) }
          }
          lastSeenRef.current = now
          sharpMaxRef.current = Math.max(sharpMaxRef.current * 0.995, m.sharp)
          f.full = m.full && m.areaFrac >= 0.12
          f.sharp = m.sharp >= 6 && m.sharp >= sharpMaxRef.current * 0.5
          f.light = m.bright >= 70 && m.glare <= 0.1
          f.steady = dev < v.videoWidth * 0.015
          lastFlagsRef.current = { full: f.full, sharp: f.sharp, light: f.light, steady: f.steady }
          why = !f.full ? (m.full ? (isAr ? 'قرّب الكاميرا من الورقة' : 'Move closer to the page') : (isAr ? 'اجعل الورقة كاملة داخل الإطار' : 'Keep the whole page inside the frame'))
            : m.bright < 70 ? (isAr ? 'الإضاءة ضعيفة، شغّل الإضاءة أو انتقل لمكان أفتح' : 'Too dark, turn on the light')
            : m.glare > 0.1 ? (isAr ? 'يوجد انعكاس ضوء، غيّر زاوية الكاميرا' : 'Glare detected, change the angle')
            : !f.sharp ? (isAr ? 'الصورة غير واضحة، ثبّت الجهاز وانتظر التركيز' : 'Image not sharp, hold steady for focus')
            : !f.steady ? (isAr ? 'ثبّت الجهاز' : 'Hold steady') : ''
        } else if (now - lastSeenRef.current <= LOST_HOLD_MS && lastFlagsRef.current) {
          Object.assign(f, lastFlagsRef.current, { found: true })   // غياب لحظي للكشف: نُبقي آخر حالة بدل التذبذب
        } else if (now - lastSeenRef.current > LOST_HOLD_MS) {
          targetRef.current = null; jumpRef.current = 0; lastFlagsRef.current = null
          why = isAr ? 'لم أجد الورقة. ضعها على سطح بلون مغاير وأظهرها كاملة' : 'Page not found. Use a contrasting surface, fully in view'
        }
        const good = f.found && f.full && f.sharp && f.light && f.steady
        // فترة سماح: انقطاع لحظي (<350ms) لا يصفّر العدّاد
        if (good) { badSinceRef.current = 0; if (!stableSinceRef.current) stableSinceRef.current = now }
        else { if (!badSinceRef.current) badSinceRef.current = now; if (now - badSinceRef.current > 350) stableSinceRef.current = 0 }
        const held = stableSinceRef.current ? now - stableSinceRef.current : 0
        if (progressRef.current) progressRef.current.style.width = autoRef.current ? `${Math.min(100, Math.round((held / STABLE_MS) * 100))}%` : '0%'
        const key = `${+f.found}${+f.full}${+f.sharp}${+f.light}${+f.steady}`
        if (key !== checksKeyRef.current) { checksKeyRef.current = key; setChecks(f) }
        setHint(good ? (autoRef.current ? (isAr ? 'البيانات واضحة... جارٍ التصوير' : 'Clear... capturing') : (isAr ? 'جاهز. اضغط زر التصوير' : 'Ready. Press the shutter')) : why)
        if (autoRef.current && held >= STABLE_MS) { capture(); break }
      }
    })()
    return () => { alive = false }
  }, [stage, capture, isAr])

  // ── رسم الإطار الحي ──
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
          shownRef.current = s ? s.map((p, i) => ({ x: lerp(p.x, t[i].x, 0.3), y: lerp(p.y, t[i].y, 0.3) })) : t
          const q = shownRef.current
          ctx.fillStyle = 'rgba(0,0,0,0.36)'
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

  // ── ضبط الحواف: سحب الزوايا ──
  function toImgCoords(e) {
    const r = boxRef.current.getBoundingClientRect()
    return { x: Math.max(0, Math.min(cap.w, ((e.clientX - r.left) / r.width) * cap.w)), y: Math.max(0, Math.min(cap.h, ((e.clientY - r.top) / r.height) * cap.h)) }
  }
  const onDown = (i, e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ i }) }
  const onMove = e => { if (!drag) return; const p = toImgCoords(e); setPts(prev => prev.map((q, j) => (j === drag.i ? p : q))) }
  const onUp = () => setDrag(null)

  async function renderResult(opts) {
    setBusy(true)
    try { const r = await getEngine().render(opts); if (r) { setBlobUrl(r.blob); return true } } catch { /* تبقى الحالية */ }
    finally { setBusy(false) }
    return false
  }
  async function confirmCrop() {
    setStage('rendering')
    const ok = await renderResult({ mode, crop: true, quad: pts, rot })
    setStage(ok ? 'review' : 'crop')
  }
  const changeMode = m => { setMode(m); renderResult({ mode: m, crop: true, quad: pts, rot }) }
  const rotate = () => { const r = (rot + 1) % 4; setRot(r); renderResult({ mode, crop: true, quad: pts, rot: r }) }
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    try { await track.applyConstraints({ advanced: [{ torch: !torch.on }] }); setTorch(t => ({ ...t, on: !t.on })) } catch { /* غير مدعوم */ }
  }
  const close = () => { aliveRef.current = false; stopStream(); onClose() }
  const accept = () => { if (blobRef.current) { setBusy(true); onDone(blobRef.current) } }
  const toggleAuto = () => { autoRef.current = !autoRef.current; setAuto(autoRef.current); stableSinceRef.current = 0 }

  const titles = { crop: isAr ? 'اضبط حواف الورقة' : 'Adjust the edges', review: isAr ? 'مراجعة المسح' : 'Review scan' }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col select-none touch-none" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-bold text-sm">{titles[stage] || 'Scan document'}</span>
        <div className="flex items-center gap-2">
          {stage === 'camera' && torch.supported && <button type="button" onClick={toggleTorch} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${torch.on ? 'bg-amber-400 text-black' : 'bg-white/15'}`}>{isAr ? 'الإضاءة' : 'Light'}</button>}
          {stage === 'camera' && <button type="button" onClick={toggleAuto} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${auto ? 'bg-emerald-500' : 'bg-white/15'}`}>{auto ? (isAr ? 'تلقائي' : 'Auto') : (isAr ? 'يدوي' : 'Manual')}</button>}
          <button type="button" onClick={close} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white/15">{isAr ? 'إغلاق' : 'Close'}</button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 w-full h-full object-contain ${stage === 'camera' ? '' : 'invisible'}`} />
        <canvas ref={overlayRef} className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${stage === 'camera' ? '' : 'invisible'}`} />
        {stage === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">{isAr ? 'جارٍ تشغيل الكاميرا...' : 'Starting camera...'}</div>}
        {(stage === 'processing' || stage === 'rendering') && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">{isAr ? 'جارٍ معالجة المسح...' : 'Processing scan...'}</div>}
        {stage === 'error' && <div className="absolute inset-0 flex items-center justify-center px-6 text-white text-sm text-center leading-relaxed">{error}</div>}
        {flash && <div className="absolute inset-0 bg-white/80 pointer-events-none" />}

        {/* شاشة ضبط الحواف */}
        {stage === 'crop' && cap && pts && (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div ref={boxRef} className="relative max-w-full max-h-full" style={{ aspectRatio: `${cap.w} / ${cap.h}`, width: `min(100%, calc((100vh - 190px) * ${cap.w / cap.h}))` }}
              onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <img src={cap.url} alt="" className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} />
              <svg viewBox={`0 0 ${cap.w} ${cap.h}`} className="absolute inset-0 w-full h-full pointer-events-none">
                <path fillRule="evenodd" fill="rgba(0,0,0,0.42)" d={`M0 0H${cap.w}V${cap.h}H0Z M${pts.map(p => `${p.x} ${p.y}`).join(' L')}Z`} />
                <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#34d399" strokeWidth={cap.w / 220} strokeLinejoin="round" />
              </svg>
              {pts.map((p, i) => (
                <div key={i} onPointerDown={e => onDown(i, e)} className="absolute w-11 h-11 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-grab"
                  style={{ left: `${(p.x / cap.w) * 100}%`, top: `${(p.y / cap.h) * 100}%`, touchAction: 'none' }}>
                  <span className={`block w-5 h-5 rounded-full border-2 border-white ${drag?.i === i ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
                </div>
              ))}
              {drag && (() => {
                const p = pts[drag.i], r = boxRef.current?.getBoundingClientRect(); if (!r) return null
                const px = (p.x / cap.w) * r.width, py = (p.y / cap.h) * r.height, Z = 3
                const left = p.x < cap.w / 2
                return <div className="absolute top-2 w-28 h-28 rounded-full border-2 border-white overflow-hidden shadow-lg pointer-events-none"
                  style={{ [left ? 'right' : 'left']: 8, backgroundImage: `url(${cap.url})`, backgroundRepeat: 'no-repeat', backgroundSize: `${r.width * Z}px ${r.height * Z}px`, backgroundPosition: `${56 - px * Z}px ${56 - py * Z}px` }}>
                  <span className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400" />
                </div>
              })()}
            </div>
          </div>
        )}

        {stage === 'review' && resultUrl && <img src={resultUrl} alt="" className="absolute inset-0 w-full h-full object-contain bg-neutral-900" />}
      </div>

      <div className="px-4 py-4 text-white">
        {stage === 'camera' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-white/90 text-center min-h-[1.2rem] leading-relaxed">{hint}</p>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {[{ k: 'found', l: isAr ? 'الورقة' : 'Page' }, { k: 'full', l: isAr ? 'كاملة' : 'Full' }, { k: 'sharp', l: isAr ? 'واضحة' : 'Sharp' }, { k: 'light', l: isAr ? 'الإضاءة' : 'Light' }, { k: 'steady', l: isAr ? 'ثابتة' : 'Steady' }].map(c => (
                <span key={c.k} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${checks[c.k] ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white/70'}`}>{c.l}</span>
              ))}
            </div>
            <div className="w-48 h-1.5 rounded bg-white/20 overflow-hidden"><div ref={progressRef} className="h-full bg-emerald-400" style={{ width: '0%' }} /></div>
            <button type="button" onClick={capture} aria-label={isAr ? 'التقاط' : 'Capture'} className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/50" />
          </div>
        )}
        {stage === 'crop' && (
          <div className="space-y-3">
            <p className="text-xs text-white/80 text-center">{isAr ? 'اسحب الدوائر الخضراء إلى زوايا الورقة بدقة' : 'Drag the green handles to the page corners'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={startCamera} className="flex-1 py-3 rounded-lg bg-white/15 font-bold text-sm">{isAr ? 'إعادة التصوير' : 'Retake'}</button>
              {detectedRef.current && <button type="button" onClick={() => setPts(detectedRef.current)} className="px-4 py-3 rounded-lg bg-white/15 font-semibold text-sm">{isAr ? 'قص تلقائي' : 'Auto'}</button>}
              <button type="button" onClick={confirmCrop} className="flex-1 py-3 rounded-lg bg-emerald-500 text-white font-bold text-sm">{isAr ? 'متابعة' : 'Continue'}</button>
            </div>
          </div>
        )}
        {stage === 'review' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
              {[{ v: 'color', l: isAr ? 'ألوان محسّنة' : 'Enhanced color' }, { v: 'bw', l: isAr ? 'أبيض وأسود' : 'Black & white' }].map(o => (
                <button key={o.v} type="button" disabled={busy} onClick={() => changeMode(o.v)} className={`px-3 py-1.5 rounded-lg font-semibold ${mode === o.v ? 'bg-white text-black' : 'bg-white/15 text-white'}`}>{o.l}</button>
              ))}
              <button type="button" disabled={busy} onClick={rotate} className="px-3 py-1.5 rounded-lg bg-white/15 font-semibold">{isAr ? 'تدوير' : 'Rotate'}</button>
              <button type="button" disabled={busy} onClick={() => setStage('crop')} className="px-3 py-1.5 rounded-lg bg-white/15 font-semibold">{isAr ? 'تعديل الحواف' : 'Edit edges'}</button>
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

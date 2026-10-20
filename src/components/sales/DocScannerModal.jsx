import { useState, useEffect, useRef, useCallback } from 'react'
import { loadCV, detectQuad, warpAndEnhance, canvasToBlob } from '../../utils/docScan'

// ماسح مستندات: كاميرا حيّة تحدّد حواف الورقة وتلتقطها تلقائياً عند الثبات، ثم تسوّيها وتحسّنها (مثل ماسح الملاحظات)
export default function DocScannerModal({ isAr, onDone, onClose }) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const cvRef = useRef(null)
  const lastQuad = useRef(null)
  const stableCount = useRef(0)
  const capturedRef = useRef(false)
  const frameRef = useRef(null)       // الإطار الملتقط كاملاً
  const quadRef = useRef(null)        // زوايا الورقة المكتشفة على الإطار الملتقط
  const [stage, setStage] = useState('loading') // loading | camera | review | error
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState('color')
  const [crop, setCrop] = useState(true)
  const [resultUrl, setResultUrl] = useState('')
  const resultRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
  }, [])

  const render = useCallback((m, doCrop) => {
    const cv = cvRef.current
    if (!cv || !frameRef.current) return
    const c = warpAndEnhance(cv, frameRef.current, doCrop ? quadRef.current : null, m)
    resultRef.current = c
    setResultUrl(c.toDataURL('image/jpeg', 0.8))
  }, [])

  const capture = useCallback(() => {
    const v = videoRef.current, cv = cvRef.current
    if (!v || !cv || capturedRef.current || !v.videoWidth) return
    capturedRef.current = true
    const frame = document.createElement('canvas')
    frame.width = v.videoWidth; frame.height = v.videoHeight
    frame.getContext('2d').drawImage(v, 0, 0)
    frameRef.current = frame
    quadRef.current = detectQuad(cv, frame) ?? lastQuad.current
    const hasQuad = !!quadRef.current
    setCrop(hasQuad)
    stopStream()
    setStage('review')
    render(mode, hasQuad)
  }, [mode, render, stopStream])

  const startCamera = useCallback(async () => {
    setError(''); setResultUrl(''); capturedRef.current = false; stableCount.current = 0; lastQuad.current = null
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      streamRef.current = stream
      const v = videoRef.current
      v.srcObject = stream
      await v.play()
      setStage('camera'); setHint(isAr ? 'وجّه الكاميرا نحو الورقة بالكامل' : 'Point the camera at the whole page')
    } catch (e) {
      setError(e.message === 'nocam' || e.name === 'NotFoundError'
        ? (isAr ? 'لا توجد كاميرا متاحة على هذا الجهاز.' : 'No camera available on this device.')
        : (isAr ? 'تعذّر تشغيل الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح.' : 'Could not start the camera. Allow camera access in the browser settings.'))
      setStage('error')
    }
  }, [isAr])

  // تحميل OpenCV ثم تشغيل الكاميرا
  useEffect(() => {
    let off = false
    loadCV().then(({ cv }) => { if (!off) { cvRef.current = cv; startCamera() } })
      .catch(() => { if (!off) { setError(isAr ? 'تعذّر تحميل أداة المسح. تحقق من الإنترنت وأعد المحاولة.' : 'Could not load the scanner. Check your connection.'); setStage('error') } })
    return () => { off = true; stopStream() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // حلقة الكشف الحي: رسم إطار الورقة والتقاط تلقائي عند الثبات
  useEffect(() => {
    if (stage !== 'camera') return
    const work = document.createElement('canvas')
    const id = setInterval(() => {
      const v = videoRef.current, ov = overlayRef.current, cv = cvRef.current
      if (!v || !ov || !cv || !v.videoWidth || capturedRef.current) return
      const k = 480 / v.videoWidth
      work.width = 480; work.height = Math.round(v.videoHeight * k)
      work.getContext('2d').drawImage(v, 0, 0, work.width, work.height)
      let q = null
      try { q = detectQuad(cv, work) } catch { q = null }
      ov.width = v.videoWidth; ov.height = v.videoHeight
      const ctx = ov.getContext('2d'); ctx.clearRect(0, 0, ov.width, ov.height)
      if (!q) { stableCount.current = 0; lastQuad.current = null; setHint(isAr ? 'لم أجد الورقة بعد. ضعها على سطح مسطح بخلفية مغايرة' : 'Page not found. Place it on a contrasting flat surface'); return }
      const full = q.map(p => ({ x: p.x / k, y: p.y / k }))
      ctx.beginPath(); full.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath()
      ctx.fillStyle = 'rgba(16,185,129,0.18)'; ctx.fill(); ctx.lineWidth = Math.max(4, ov.width / 200); ctx.strokeStyle = '#10b981'; ctx.stroke()
      const prev = lastQuad.current
      const move = prev ? full.reduce((s, p, i) => s + Math.hypot(p.x - prev[i].x, p.y - prev[i].y), 0) / 4 : 999
      lastQuad.current = full
      if (move < v.videoWidth * 0.012) stableCount.current += 1; else stableCount.current = 0
      setHint(isAr ? 'ثبّت الجهاز... سيلتقط تلقائياً' : 'Hold steady... capturing automatically')
      if (stableCount.current >= 5) capture()
    }, 280)
    return () => clearInterval(id)
  }, [stage, capture, isAr])

  function retake() { setStage('loading'); startCamera() }
  function changeMode(m) { setMode(m); render(m, crop) }
  function toggleCrop() { const c = !crop; setCrop(c); render(mode, c) }

  async function accept() {
    if (!resultRef.current) return
    setBusy(true)
    try { onDone(await canvasToBlob(resultRef.current)) } catch { setError(isAr ? 'تعذّر حفظ الصورة.' : 'Could not save the image.'); setBusy(false) }
  }
  function close() { stopStream(); onClose() }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-bold text-sm">{stage === 'review' ? (isAr ? 'مراجعة المسح' : 'Review scan') : 'Scan document'}</span>
        <button type="button" onClick={close} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-white/15">{isAr ? 'إغلاق' : 'Close'}</button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 w-full h-full object-contain ${stage === 'camera' ? '' : 'invisible'}`} />
        <canvas ref={overlayRef} className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${stage === 'camera' ? '' : 'invisible'}`} />
        {stage === 'loading' && <p className="text-white/80 text-sm">{isAr ? 'جارٍ تجهيز الماسح...' : 'Preparing scanner...'}</p>}
        {stage === 'error' && <p className="text-white text-sm text-center px-6 leading-relaxed max-w-sm">{error}</p>}
        {stage === 'review' && resultUrl && <img src={resultUrl} alt="" className="absolute inset-0 w-full h-full object-contain bg-neutral-900" />}
      </div>

      <div className="px-4 py-4 text-white">
        {stage === 'camera' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-white/80 text-center min-h-[1rem]">{hint}</p>
            <button type="button" onClick={capture} aria-label={isAr ? 'التقاط' : 'Capture'} className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/50" />
          </div>
        )}
        {stage === 'review' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs">
              {[{ v: 'color', l: isAr ? 'ألوان محسّنة' : 'Enhanced color' }, { v: 'bw', l: isAr ? 'أبيض وأسود' : 'Black & white' }].map(o => (
                <button key={o.v} type="button" onClick={() => changeMode(o.v)} className={`px-3 py-1.5 rounded-lg font-semibold ${mode === o.v ? 'bg-white text-black' : 'bg-white/15 text-white'}`}>{o.l}</button>
              ))}
              {quadRef.current && <button type="button" onClick={toggleCrop} className="px-3 py-1.5 rounded-lg bg-white/15 font-semibold">{crop ? (isAr ? 'بدون قص' : 'No crop') : (isAr ? 'قص تلقائي' : 'Auto crop')}</button>}
            </div>
            {error && <p className="text-xs text-red-300 text-center">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={retake} disabled={busy} className="flex-1 py-3 rounded-lg bg-white/15 font-bold text-sm">{isAr ? 'إعادة التصوير' : 'Retake'}</button>
              <button type="button" onClick={accept} disabled={busy} className="flex-1 py-3 rounded-lg bg-emerald-500 text-white font-bold text-sm disabled:opacity-50">{busy ? (isAr ? 'جارٍ...' : '...') : (isAr ? 'اعتماد' : 'Use scan')}</button>
            </div>
          </div>
        )}
        {stage === 'error' && (
          <div className="flex gap-3 justify-center">
            <button type="button" onClick={retake} className="px-5 py-2.5 rounded-lg bg-white/15 font-bold text-sm">{isAr ? 'إعادة المحاولة' : 'Try again'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

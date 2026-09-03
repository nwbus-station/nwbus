import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import {
  extractTicketNumber, pickTicketFromText,
  applyFocusConstraints, isColoredBackground, buildOCRCanvas, playBeep,
} from './QRScannerModal'

/**
 * ماسح رقم تذكرة واحد — نسخة مبسّطة وأسرع من ماسح التذاكر المتأخرة،
 * مخصصة لصفحة تقييم العميل العامة (بدون تسجيل دخول).
 * نفس محرك القراءة (jsQR + tesseract.js) لضمان نفس الموثوقية على كل المتصفحات.
 */
export default function TicketNumberScanner({ onScan, onClose }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  const workerRef = useRef(null)
  const busyRef   = useRef(false)
  const activeRef = useRef(true)
  const timerRef  = useRef(null)

  const [camErr, setCamErr]     = useState('')
  const [found, setFound]       = useState(null)
  const [reading, setReading]   = useState(true)
  const [stuckHint, setStuckHint] = useState(false)

  useEffect(() => {
    activeRef.current = true
    start()
    return () => { activeRef.current = false; stop() }
  }, [])

  useEffect(() => {
    if (!reading) return
    const id = setTimeout(() => setStuckHint(true), 9000)
    return () => clearTimeout(id)
  }, [reading])

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      await applyFocusConstraints(stream)
      loopQR()
    } catch {
      setCamErr('تعذّر فتح الكاميرا — تحقق من الصلاحيات أو أدخل الرقم يدوياً')
      return
    }
    try {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker('eng', 1, { logger: () => {} })
      await w.setParameters({ tessedit_char_whitelist: '0123456789:', tessedit_pageseg_mode: '6' })
      if (!activeRef.current) { await w.terminate(); return }
      workerRef.current = w
      scheduleOCR(250)
    } catch {
      scheduleOCR(2500)
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    workerRef.current?.terminate().catch(() => {}); workerRef.current = null
  }

  function loopQR() {
    if (!activeRef.current) return
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loopQR); return
    }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const id = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const t = extractTicketNumber(code.data)
      if (t) { present(t); return }
    }
    rafRef.current = requestAnimationFrame(loopQR)
  }

  function scheduleOCR(delay = 1200) {
    if (!activeRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(runOCR, delay)
  }

  async function runOCR() {
    if (!activeRef.current || busyRef.current || !workerRef.current) { scheduleOCR(1000); return }
    const video = videoRef.current
    if (!video || video.readyState < 2) { scheduleOCR(700); return }
    if (isColoredBackground(video)) { scheduleOCR(700); return }
    busyRef.current = true
    try {
      const proc = buildOCRCanvas(video)
      const { data: { text } } = await workerRef.current.recognize(proc.toDataURL('image/jpeg', 0.88))
      if (!activeRef.current) return
      const t = pickTicketFromText(text)
      if (t) present(t)
      else scheduleOCR(1200)
    } catch { scheduleOCR(2000) }
    finally { busyRef.current = false }
  }

  function present(ticket) {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(timerRef.current)
    playBeep('found')
    setFound(ticket)
    setReading(false)
    setTimeout(() => { onScan(ticket); stop(); onClose() }, 550)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#0F1A22', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: found ? 0.25 : 1, transition: 'opacity .3s' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'env(safe-area-inset-top,16px) 18px 20px', background: 'linear-gradient(180deg, rgba(15,26,34,0.9), transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#F5C542', fontWeight: 700, fontSize: '0.9rem' }}>مسح رقم التذكرة</span>
          <button onClick={() => { stop(); onClose() }} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>✕</button>
        </div>

        {!found && !camErr && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 72% 45% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 100%)' }} />
            <div style={{ width: '82%', maxWidth: 320, height: 110, border: '2px solid rgba(245,197,66,0.6)', borderRadius: 16, boxShadow: '0 0 16px rgba(245,197,66,0.3)' }} />
          </div>
        )}

        {found && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#22c55e' }}>✓</div>
            <p style={{ color: '#F5C542', fontFamily: 'monospace', fontSize: '1.8rem', fontWeight: 800, letterSpacing: 6, margin: 0 }}>{found}</p>
          </div>
        )}

        {camErr && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.7 }}>{camErr}</p>
          </div>
        )}
      </div>

      {reading && !camErr && (
        <div style={{ padding: '12px 20px env(safe-area-inset-bottom,14px)', background: 'rgba(15,26,34,0.98)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: stuckHint ? '#F5C542' : 'rgba(255,255,255,0.4)', fontSize: '0.72rem', margin: 0, textAlign: 'center' }}>
            {stuckHint ? 'ما ينقرأ؟ أغلق وأدخل الرقم يدوياً' : 'وجّه الكاميرا نحو رقم التذكرة'}
          </p>
        </div>
      )}
    </div>
  )
}

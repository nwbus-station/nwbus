import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import {
  extractTicketNumber, pickTicketFromText,
  applyFocusConstraints, isColoredBackground, buildOCRCanvas, playBeep,
} from './QRScannerModal'

// إطار أوسع يشمل الوصل كامل (رقم التذكرة والمرجع فوق الـQR، التاريخ تحته) —
// مختلف عن إطار ماسح التذاكر المتأخرة الضيق المخصص لسطر واحد فقط
const WIDE_CROP = { x: 0.06, y: 0.04, w: 0.88, h: 0.92 }

function extractReference(text) {
  const m = text.match(/W\s?(\d{5,10})/i)
  return m ? 'W' + m[1] : null
}

function extractTicketDate(text) {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  if (isNaN(d.getTime())) return null
  return d
}

function isTooOld(date) {
  if (!date) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}

/**
 * ماسح رقم تذكرة واحد — نسخة مبسّطة وأسرع من ماسح التذاكر المتأخرة،
 * مخصصة لصفحة تقييم العميل العامة (بدون تسجيل دخول).
 * نفس محرك القراءة (jsQR + tesseract.js) لضمان نفس الموثوقية على كل المتصفحات.
 * تحاول أيضاً تقرأ رقم المرجع (W...) وتاريخ التذكرة من نفس الوصل، وترفض أي تذكرة تاريخها قديم.
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
  const [tooOld, setTooOld]     = useState(false)
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
      await w.setParameters({ tessedit_char_whitelist: '0123456789:/W', tessedit_pageseg_mode: '6' })
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
      // الـQR غالباً يشفّر رقم التذكرة بس، بدون مرجع أو تاريخ — نقبله لحاله لو ما لقينا شي أفضل من الـOCR بعد
      if (t) { present({ ticketNumber: t, referenceNumber: null, ticketDate: null }); return }
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
      const proc = buildOCRCanvas(video, WIDE_CROP)
      const { data: { text } } = await workerRef.current.recognize(proc.toDataURL('image/jpeg', 0.88))
      if (!activeRef.current) return
      const t = pickTicketFromText(text)
      if (t) {
        present({
          ticketNumber: t,
          referenceNumber: extractReference(text),
          ticketDate: extractTicketDate(text),
        })
      } else scheduleOCR(1200)
    } catch { scheduleOCR(2000) }
    finally { busyRef.current = false }
  }

  function present(result) {
    if (isTooOld(result.ticketDate)) {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(timerRef.current)
      setTooOld(true)
      setReading(false)
      return
    }
    cancelAnimationFrame(rafRef.current)
    clearTimeout(timerRef.current)
    playBeep('found')
    setFound(result.ticketNumber)
    setReading(false)
    setTimeout(() => { onScan(result); stop(); onClose() }, 550)
  }

  function retry() {
    setTooOld(false)
    setReading(true)
    loopQR(); scheduleOCR(300)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#0F1A22', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: found || tooOld ? 0.25 : 1, transition: 'opacity .3s' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'env(safe-area-inset-top,16px) 18px 20px', background: 'linear-gradient(180deg, rgba(15,26,34,0.9), transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#F5C542', fontWeight: 700, fontSize: '0.9rem' }}>مسح التذكرة</span>
          <button onClick={() => { stop(); onClose() }} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>✕</button>
        </div>

        {!found && !tooOld && !camErr && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 65% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 100%)' }} />
            <div style={{ width: '78%', maxWidth: 300, height: '80%', maxHeight: 560, border: '2px solid rgba(245,197,66,0.6)', borderRadius: 16, boxShadow: '0 0 16px rgba(245,197,66,0.3)' }} />
          </div>
        )}

        {found && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#22c55e' }}>✓</div>
            <p style={{ color: '#F5C542', fontFamily: 'monospace', fontSize: '1.8rem', fontWeight: 800, letterSpacing: 6, margin: 0 }}>{found}</p>
          </div>
        )}

        {tooOld && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 30 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(220,38,38,0.15)', border: '2px solid #DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: '#DC2626' }}>✕</div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', margin: 0, textAlign: 'center' }}>هذي تذكرة قديمة، تاريخها منتهي</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>ما تقدر تقيّم بتذكرة تاريخها فات</p>
            <button onClick={retry} style={{ marginTop: 8, padding: '10px 28px', borderRadius: 50, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
            حاول تذكرة ثانية
            </button>
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
            {stuckHint ? 'ما ينقرأ؟ أغلق وأدخل الرقم يدوياً' : 'ضع التذكرة كاملة داخل الإطار'}
          </p>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  pickTicketFromText,
  applyFocusConstraints, isColoredBackground, buildOCRCanvas, playBeep,
} from './QRScannerModal'
import { getTicketOCRWorker } from '../../utils/ocrWorker'

// إطار يغطي الجزء العلوي من الوصل فقط: رقم التذكرة والمرجع (فوق الـQR الرئيسي) وحتى
// التاريخ واسم الراكب (تحته مباشرة) — بدون الجزء السفلي (QR الفاتورة وتاريخ البيع والشروط)
// لأنه غير مفيد هنا ويكبّر حجم الصورة فيبطّئ القراءة بلا داعي.
// مختلف عن إطار ماسح التذاكر المتأخرة الضيق المخصص لسطر واحد فقط
const WIDE_CROP = { x: 0.05, y: 0.03, w: 0.9, h: 0.6 }

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
 * تعتمد فقط على قراءة النص (tesseract.js) وليس QR — لأن الـQR الرئيسي بالتذكرة لا يحمل
 * تاريخها، فلو قبلناه بشكل مباشر بيتجاوز فحص "التذكرة القديمة" بالكامل (تم رصد هذا كخلل فعلي).
 */
export default function TicketNumberScanner({ onScan, onClose }) {
  const videoRef  = useRef(null)
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
    } catch {
      setCamErr('تعذّر فتح الكاميرا — تحقق من الصلاحيات أو أدخل الرقم يدوياً')
      return
    }
    try {
      // عامل مشترك جاهز غالباً مسبقاً (تم تسخينه من صفحة التقييم) — يشيل تأخير التهيئة عن كل فتح للكاميرا
      const w = await getTicketOCRWorker()
      if (!activeRef.current) return
      workerRef.current = w
      scheduleOCR(50)
    } catch {
      scheduleOCR(2000)
    }
  }

  function stop() {
    clearTimeout(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    // العامل مشترك بين كل فتحات الماسح — لا نوقفه هنا، فقط نفك الإشارة المحلية له
    workerRef.current = null
  }

  function scheduleOCR(delay = 1200) {
    if (!activeRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(runOCR, delay)
  }

  async function runOCR() {
    if (!activeRef.current || busyRef.current || !workerRef.current) { scheduleOCR(600); return }
    const video = videoRef.current
    if (!video || video.readyState < 2) { scheduleOCR(400); return }
    if (isColoredBackground(video)) { scheduleOCR(400); return }
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
      } else scheduleOCR(400)
    } catch { scheduleOCR(1200) }
    finally { busyRef.current = false }
  }

  function present(result) {
    if (isTooOld(result.ticketDate)) {
      clearTimeout(timerRef.current)
      setTooOld(true)
      setReading(false)
      return
    }
    clearTimeout(timerRef.current)
    playBeep('found')
    setFound(result.ticketNumber)
    setReading(false)
    setTimeout(() => { onScan(result); stop(); onClose() }, 550)
  }

  function retry() {
    setTooOld(false)
    setReading(true)
    scheduleOCR(300)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#0F1A22', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: found || tooOld ? 0.25 : 1, transition: 'opacity .3s' }} />

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

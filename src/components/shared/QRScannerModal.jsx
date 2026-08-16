import { useEffect, useRef, useState, useCallback } from 'react'
import jsQR from 'jsqr'

export function extractTicketNumber(raw) {
  if (!raw) return null
  const s = raw.trim()
  try {
    const obj = JSON.parse(s)
    const v = obj.ticket_number ?? obj.ticketNumber ?? obj.ticket ?? obj.id
    if (v) return String(v).trim()
  } catch (_) {}
  const m7 = s.match(/(?<!\d)(\d{7})(?!\d)/)
  return m7 ? m7[1] : null
}

/* -------- نمذج الصورة للـ OCR -------- */
function buildOCRCanvas(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  // قص المنطقة الوسطى (حيث رقم التذكرة غالباً)
  const x = 0, y = Math.floor(vh * 0.25), w = vw, h = Math.floor(vh * 0.55)
  const scale = 2
  const c = document.createElement('canvas')
  c.width = w * scale; c.height = h * scale
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(video, x, y, w, h, 0, 0, c.width, c.height)
  // تباين عالٍ: رمادي + threshold
  const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
    const v = g > 128 ? 255 : 0
    d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return c
}

/* -------- استخراج الرقم من نص OCR -------- */
function pickTicketFromText(text) {
  // البحث عن "رقم التذكرة: XXXXXXX" أو "Ticket...: XXXXXXX"
  // الأولوية: نمط النقطتين + 7 أرقام لا يسبقها أو يليها رقم
  const patterns = [
    /(?:رقم.*?التذكرة|ticket\s*(?:number|no|#)?)\s*[:\-]\s*(\d{7})(?!\d)/i,
    /:\s*(\d{7})(?!\d)/,
    /(?<!\d)(\d{7})(?!\d)/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1]
  }
  return null
}

/* ============================================================
   المودال الرئيسي
   Props: onScan, onClose, expectedCount, initialCount, isAr
   ============================================================ */
export default function QRScannerModal({
  onScan, onClose,
  expectedCount = null,
  initialCount  = 0,
  isAr = true,
}) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const qrRafRef    = useRef(null)
  const streamRef   = useRef(null)
  const busyRef     = useRef(false)   // OCR قيد التشغيل
  const activeRef   = useRef(true)    // المودال مفتوح
  const scanTimer   = useRef(null)
  const closeTimer  = useRef(null)

  const [camReady, setCamReady]     = useState(false)
  const [camErr, setCamErr]         = useState('')
  const [status, setStatus]         = useState('searching') // searching|found|confirmed|done
  const [found, setFound]           = useState(null)        // الرقم المكتشف
  const [scanCount, setScanCount]   = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const totalDone = initialCount + scanCount
  const remaining = expectedCount !== null ? Math.max(0, expectedCount - totalDone) : null

  /* -------- تشغيل الكاميرا -------- */
  useEffect(() => {
    activeRef.current = true
    startCamera()
    return () => {
      activeRef.current = false
      cleanup()
    }
  }, [])

  function cleanup() {
    cancelAnimationFrame(qrRafRef.current)
    clearTimeout(scanTimer.current)
    clearTimeout(closeTimer.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  function stopAndClose() {
    cleanup()
    onClose()
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCamReady(true)
      loopQR()
      scheduleOCR(500)
    } catch {
      setCamErr(isAr ? 'تعذّر فتح الكاميرا — تحقق من الصلاحيات' : 'Camera access denied')
    }
  }

  /* -------- QR في الخلفية -------- */
  function loopQR() {
    if (!activeRef.current) return
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      qrRafRef.current = requestAnimationFrame(loopQR); return
    }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const id   = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const t = extractTicketNumber(code.data)
      if (t) { showFound(t); return }
    }
    qrRafRef.current = requestAnimationFrame(loopQR)
  }

  /* -------- جدولة OCR -------- */
  function scheduleOCR(delay = 2500) {
    if (!activeRef.current) return
    clearTimeout(scanTimer.current)
    scanTimer.current = setTimeout(runOCR, delay)
  }

  /* -------- تشغيل OCR -------- */
  const runOCR = useCallback(async () => {
    if (!activeRef.current || busyRef.current) return
    const video = videoRef.current
    if (!video || video.readyState < 2) { scheduleOCR(1000); return }

    busyRef.current = true
    setIsProcessing(true)

    try {
      const proc = buildOCRCanvas(video)
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, { logger: () => {} })
      // النقطتين + الأرقام + أحرف شائعة في label التذكرة
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789:TicektNumbr rqmالتذكرةرقم',
        tessedit_pageseg_mode: '6',
      })
      const { data: { text } } = await worker.recognize(proc.toDataURL('image/png'))
      await worker.terminate()

      if (!activeRef.current) return
      const ticket = pickTicketFromText(text)
      if (ticket) {
        showFound(ticket)
      } else {
        scheduleOCR(2500)
      }
    } catch {
      scheduleOCR(3000)
    } finally {
      busyRef.current = false
      if (activeRef.current) setIsProcessing(false)
    }
  }, [])

  /* -------- عرض الرقم للتأكيد -------- */
  function showFound(ticket) {
    cancelAnimationFrame(qrRafRef.current)
    clearTimeout(scanTimer.current)
    setFound(ticket)
    setStatus('found')
  }

  function confirmFound() {
    if (!found) return
    onScan(found)
    const newCount = scanCount + 1
    setScanCount(newCount)
    const newTotal = initialCount + newCount
    const done = expectedCount !== null && newTotal >= expectedCount

    if (done) {
      setStatus('done')
      closeTimer.current = setTimeout(stopAndClose, 2000)
    } else {
      setFound(null)
      setStatus('searching')
      loopQR()
      scheduleOCR(500)
    }
  }

  function retry() {
    setFound(null)
    setStatus('searching')
    loopQR()
    scheduleOCR(500)
  }

  /* -------- UI -------- */
  const isSearching = status === 'searching'
  const isFound     = status === 'found'
  const isDone      = status === 'done'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* الكاميرا تأخذ كل الشاشة */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* شريط العنوان */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'linear-gradient(rgba(0,0,0,0.7), transparent)',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isProcessing && !isFound && (
              <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#facc15', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            )}
            <span style={{ color: '#facc15', fontWeight: 700, fontSize: '0.95rem' }}>
              {isAr
                ? (isProcessing && !isFound ? 'يبحث عن رقم التذكرة...' : 'وجّه الكاميرا على التذكرة')
                : (isProcessing && !isFound ? 'Scanning for ticket number...' : 'Point camera at ticket')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {expectedCount !== null && (
              <span style={{
                background: totalDone >= expectedCount ? '#22c55e' : 'rgba(255,255,255,0.15)',
                color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
              }}>
                {totalDone} / {expectedCount}
              </span>
            )}
            <button onClick={stopAndClose} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50,
              color: '#fff', padding: '6px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
            }}>
              {isAr ? '✕ إغلاق' : '✕ Close'}
            </button>
          </div>
        </div>

        {/* إطار البحث */}
        {isSearching && camReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{
              width: '90%', height: '30%',
              border: `2px ${isProcessing ? 'solid #facc15' : 'dashed rgba(250,204,21,0.5)'}`,
              borderRadius: 12,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.4)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'border 0.3s',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', margin: 0, textAlign: 'center', padding: '0 16px' }}>
                {isAr ? 'ضع سطر "رقم التذكرة" داخل الإطار' : 'Align "Ticket Number" line inside frame'}
              </p>
            </div>
          </div>
        )}

        {/* نتيجة مكتشفة — تأكيد */}
        {isFound && found && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.07)', border: '2px solid #facc15',
              borderRadius: 20, padding: '28px 36px', textAlign: 'center',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', margin: '0 0 8px' }}>
                {isAr ? 'رقم التذكرة المُكتشف' : 'Detected ticket number'}
              </p>
              <p style={{ color: '#facc15', fontSize: '2.6rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: 6, margin: 0 }}>
                {found}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={confirmFound} style={{
                padding: '13px 36px', borderRadius: 12, border: 'none',
                background: '#22c55e', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
              }}>
                {isAr ? '✓ تأكيد' : '✓ Confirm'}
              </button>
              <button onClick={retry} style={{
                padding: '13px 28px', borderRadius: 12, border: 'none',
                background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
              }}>
                {isAr ? 'إعادة' : 'Retry'}
              </button>
            </div>
            {remaining !== null && remaining > 0 && (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', margin: 0 }}>
                {isAr ? `متبقٍ ${remaining} تذكرة بعد هذه` : `${remaining} more after this`}
              </p>
            )}
          </div>
        )}

        {/* اكتمل العدد */}
        {isDone && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(34,197,94,0.15)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          }}>
            <div style={{
              background: '#22c55e', borderRadius: 20, padding: '24px 40px', textAlign: 'center',
            }}>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>
                {isAr ? `✓ اكتمل العدد (${expectedCount})` : `✓ All ${expectedCount} tickets added`}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', margin: '6px 0 0' }}>
                {isAr ? 'جاري الإغلاق...' : 'Closing...'}
              </p>
            </div>
          </div>
        )}

        {/* خطأ */}
        {camErr && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '3rem' }}>📷</span>
            <p style={{ color: '#fff', marginTop: 12, textAlign: 'center', padding: '0 32px' }}>{camErr}</p>
          </div>
        )}

        {/* تعليمات في الأسفل */}
        {isSearching && camReady && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            padding: '28px 16px 16px', textAlign: 'center',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', margin: 0 }}>
              {isAr
                ? 'يبحث تلقائياً عن نص "رقم التذكرة: XXXXXXX"'
                : 'Auto-scanning for "Ticket Number: XXXXXXX"'}
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

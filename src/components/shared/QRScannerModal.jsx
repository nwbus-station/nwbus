import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export function extractTicketNumber(raw) {
  if (!raw) return null
  const s = raw.trim()
  try {
    const obj = JSON.parse(s)
    const v = obj.ticket_number ?? obj.ticketNumber ?? obj.ticket ?? obj.id ?? obj.number
    if (v) return String(v).trim()
  } catch (_) {}
  const m7 = s.match(/\b\d{7}\b/)
  if (m7) return m7[0]
  if (/^[A-Za-z0-9\-_]+$/.test(s) && s.length <= 30) return s
  return null
}

/*
  Props:
    onScan(ticket)   — يُستدعى لكل تذكرة تُضاف
    onClose()        — يُستدعى عند الإغلاق
    expectedCount    — العدد المطلوب من المتخلفين (اختياري)
    initialCount     — عدد التذاكر المدخلة مسبقاً
    isAr
*/
export default function QRScannerModal({
  onScan, onClose,
  expectedCount = null,
  initialCount  = 0,
  isAr = true,
}) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  const inputRef  = useRef(null)
  const closeTimer = useRef(null)

  const [camReady, setCamReady]     = useState(false)
  const [camErr, setCamErr]         = useState('')
  const [number, setNumber]         = useState('')
  const [scanCount, setScanCount]   = useState(0)   // عدد ما تمت إضافته في هذه الجلسة
  const [lastAdded, setLastAdded]   = useState(null) // آخر رقم أُضيف
  const [autoClosing, setAutoClosing] = useState(false)

  const totalDone  = initialCount + scanCount
  const remaining  = expectedCount !== null ? Math.max(0, expectedCount - totalDone) : null

  useEffect(() => {
    startCamera()
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(closeTimer.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // فوكس على الإنبوت بعد تجهز الكاميرا
  useEffect(() => {
    if (camReady) setTimeout(() => inputRef.current?.focus(), 300)
  }, [camReady])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCamReady(true)
      scanQR()
    } catch {
      setCamErr(isAr ? 'تعذّر فتح الكاميرا' : 'Camera unavailable')
    }
  }

  function stopAndClose() {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(closeTimer.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    onClose()
  }

  // مسح QR في الخلفية
  function scanQR() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanQR); return
    }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const id   = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const t = extractTicketNumber(code.data)
      if (t) { handleAdd(t); return }
    }
    rafRef.current = requestAnimationFrame(scanQR)
  }

  function handleAdd(ticket) {
    onScan(ticket)
    const newCount = scanCount + 1
    setScanCount(newCount)
    setLastAdded(ticket)
    setNumber('')

    const newTotal = initialCount + newCount
    const isComplete = expectedCount !== null && newTotal >= expectedCount

    if (isComplete) {
      // اكتمل العدد — أغلق بعد ثانيتين
      setAutoClosing(true)
      closeTimer.current = setTimeout(stopAndClose, 2000)
    } else {
      // واصل — امسح الرسالة بعد ثانية وواصل
      clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(() => {
        setLastAdded(null)
        inputRef.current?.focus()
        scanQR()
      }, 1200)
    }
  }

  function confirm() {
    const t = number.trim()
    if (t.length !== 7 || !/^\d{7}$/.test(t)) return
    cancelAnimationFrame(rafRef.current) // أوقف QR مؤقتاً
    handleAdd(t)
  }

  /* -------- UI -------- */
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* الكاميرا */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* رأس: شريط الحالة + زر إغلاق */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'linear-gradient(rgba(0,0,0,0.65), transparent)',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* عداد */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#facc15', fontWeight: 700, fontSize: '1rem' }}>
              {isAr ? 'تذاكر المتخلفين' : 'Missed Tickets'}
            </span>
            {expectedCount !== null && (
              <span style={{
                background: totalDone >= expectedCount ? '#22c55e' : 'rgba(255,255,255,0.15)',
                color: '#fff', fontSize: '0.8rem', fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
              }}>
                {totalDone} / {expectedCount}
              </span>
            )}
          </div>

          {/* زر الإغلاق */}
          <button onClick={stopAndClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50,
            color: '#fff', padding: '6px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
          }}>
            {isAr ? '✕ إغلاق' : '✕ Close'}
          </button>
        </div>

        {/* إشعار النجاح / اكتمال العدد */}
        {(lastAdded || autoClosing) && (
          <div style={{
            position: 'absolute', inset: 0,
            background: autoClosing ? 'rgba(34,197,94,0.2)' : 'rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10,
          }}>
            <div style={{
              background: autoClosing ? '#22c55e' : 'rgba(34,197,94,0.9)',
              borderRadius: 16, padding: '18px 32px', textAlign: 'center',
            }}>
              <p style={{ color: '#fff', margin: 0, fontWeight: 700, fontSize: '1rem' }}>
                {isAr ? '✓ تمت الإضافة' : '✓ Added'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.85)', margin: '4px 0 0', fontFamily: 'monospace', fontSize: '1.5rem', letterSpacing: 4 }}>
                {lastAdded}
              </p>
              {autoClosing && (
                <p style={{ color: 'rgba(255,255,255,0.8)', margin: '10px 0 0', fontSize: '0.85rem' }}>
                  {isAr ? `✓ اكتمل العدد (${expectedCount}) — جاري الإغلاق...` : `✓ All ${expectedCount} added — closing...`}
                </p>
              )}
            </div>
            {!autoClosing && remaining !== null && remaining > 0 && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: 0 }}>
                {isAr ? `متبقٍ ${remaining} تذكرة` : `${remaining} more needed`}
              </p>
            )}
          </div>
        )}

        {/* خطأ كاميرا */}
        {camErr && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '3rem' }}>📷</span>
            <p style={{ color: '#fff', marginTop: 12, textAlign: 'center', padding: '0 32px' }}>{camErr}</p>
          </div>
        )}

        {/* تعليمات */}
        {camReady && !lastAdded && !autoClosing && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
            padding: '28px 16px 10px', textAlign: 'center',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: 0 }}>
              {isAr ? 'وجّه الكاميرا على رقم التذكرة أو اكتبه أدناه' : 'Point at ticket number or type below'}
            </p>
          </div>
        )}
      </div>

      {/* شريط الإدخال السفلي */}
      {!autoClosing && (
        <div style={{ background: '#111', padding: '14px 16px', display: 'flex', gap: 10, flexShrink: 0 }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={7}
            value={number}
            onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
            onKeyDown={e => e.key === 'Enter' && confirm()}
            placeholder={isAr ? '7 أرقام' : '7 digits'}
            style={{
              flex: 1, padding: '13px 16px', borderRadius: 12,
              border: `2px solid ${number.length === 7 ? '#22c55e' : 'rgba(255,255,255,0.15)'}`,
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              fontSize: '1.6rem', fontFamily: 'monospace', textAlign: 'center', letterSpacing: 5,
              outline: 'none', transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={confirm}
            disabled={number.length !== 7}
            style={{
              padding: '0 24px', borderRadius: 12, border: 'none',
              background: number.length === 7 ? '#22c55e' : '#2a2a2a',
              color: number.length === 7 ? '#fff' : '#555',
              fontWeight: 800, fontSize: '1.3rem',
              cursor: number.length === 7 ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s', flexShrink: 0,
            }}>
            ✓
          </button>
        </div>
      )}
    </div>
  )
}

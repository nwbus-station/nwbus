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

export default function QRScannerModal({ onScan, onClose, isAr = true }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  const inputRef  = useRef(null)

  const [camReady, setCamReady] = useState(false)
  const [camErr, setCamErr]     = useState('')
  const [number, setNumber]     = useState('')

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  // بعد ما تجهز الكاميرا، حرّك الـ focus للـ input
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

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  // مسح QR في الخلفية — إذا وُجد، يملأ الحقل تلقائياً
  function scanQR() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanQR)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const id   = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const t = extractTicketNumber(code.data)
      if (t) { setNumber(t); return }
    }
    rafRef.current = requestAnimationFrame(scanQR)
  }

  function confirm() {
    const t = number.trim()
    if (t.length !== 7 || !/^\d{7}$/.test(t)) return
    stopCamera()
    onScan(t)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* الكاميرا — تأخذ كل المساحة */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          playsInline muted
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* زر الإلغاء */}
        <button
          onClick={() => { stopCamera(); onClose() }}
          style={{
            position: 'absolute', top: 16, left: isAr ? 16 : 'auto', right: isAr ? 'auto' : 16,
            background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 50,
            color: '#fff', padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
          }}
        >
          {isAr ? '✕ إلغاء' : '✕ Cancel'}
        </button>

        {/* تعليمات */}
        {camReady && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            padding: '32px 16px 12px',
            textAlign: 'center',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', margin: 0 }}>
              {isAr ? 'وجّه الكاميرا على رقم التذكرة ثم اكتبه أدناه' : 'Point camera at ticket number, then type it below'}
            </p>
          </div>
        )}

        {/* خطأ كاميرا */}
        {camErr && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)',
          }}>
            <span style={{ fontSize: '3rem' }}>📷</span>
            <p style={{ color: '#fff', marginTop: 12, textAlign: 'center', padding: '0 24px' }}>{camErr}</p>
          </div>
        )}
      </div>

      {/* شريط الإدخال السفلي */}
      <div style={{
        background: '#111',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 10,
        flexShrink: 0,
      }}>
        <label style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', textAlign: 'center' }}>
          {isAr ? 'رقم التذكرة (7 أرقام)' : 'Ticket number (7 digits)'}
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={7}
            value={number}
            onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
            onKeyDown={e => e.key === 'Enter' && confirm()}
            placeholder="0000000"
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: 12,
              border: `2px solid ${number.length === 7 ? '#22c55e' : 'rgba(255,255,255,0.2)'}`,
              background: 'rgba(255,255,255,0.07)',
              color: '#fff',
              fontSize: '1.8rem',
              fontFamily: 'monospace',
              textAlign: 'center',
              letterSpacing: 6,
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={confirm}
            disabled={number.length !== 7}
            style={{
              padding: '0 22px',
              borderRadius: 12,
              border: 'none',
              background: number.length === 7 ? '#22c55e' : '#333',
              color: number.length === 7 ? '#fff' : '#666',
              fontWeight: 800,
              fontSize: '1.1rem',
              cursor: number.length === 7 ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            {isAr ? '✓' : '✓'}
          </button>
        </div>

        {/* عداد الأرقام */}
        <p style={{ color: number.length === 7 ? '#22c55e' : 'rgba(255,255,255,0.3)', fontSize: '0.72rem', textAlign: 'center', margin: 0, transition: 'color 0.15s' }}>
          {number.length} / 7
          {number.length === 7 && (isAr ? ' ✓ جاهز' : ' ✓ Ready')}
        </p>
      </div>
    </div>
  )
}

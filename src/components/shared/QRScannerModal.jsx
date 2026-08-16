import { useState, useEffect, useRef } from 'react'
import jsQR from 'jsqr'

/* استخراج حقول من بيانات QR الخام */
export function parseTicketQR(raw) {
  const s = (raw || '').trim()
  if (!s) return { ticket_number: '', raw }

  // 1. JSON
  try {
    const obj = JSON.parse(s)
    return {
      ticket_number:  obj.ticketNumber  || obj.ticket_no   || obj.ticketNo   || obj.ref || s,
      passenger_name: obj.passengerName || obj.name        || '',
      passenger_id:   obj.nationalId    || obj.passengerId || '',
      seat_number:    obj.seatNumber    || obj.seat        || '',
      fare_type:      obj.fareType      || obj.fare        || '',
      origin:         obj.origin        || obj.from        || '',
      destination:    obj.destination   || obj.to          || '',
      raw,
    }
  } catch {}

  // 2. URL params
  try {
    const url = new URL(s.includes('://') ? s : 'https://x.com?' + s)
    const p = url.searchParams
    const ticket = p.get('ticket') || p.get('ticketNo') || p.get('ref') || url.pathname.split('/').pop()
    if (ticket && ticket.length > 2) return {
      ticket_number:  ticket,
      passenger_name: p.get('name') || p.get('passengerName') || '',
      passenger_id:   p.get('nationalId') || '',
      seat_number:    p.get('seat') || '',
      fare_type:      p.get('fare') || p.get('fareType') || '',
      origin:         p.get('from') || '',
      destination:    p.get('to') || '',
      raw,
    }
  } catch {}

  // 3. pipe | أو فاصلة ,
  if (s.includes('|') || (s.includes(',') && !s.includes('\n'))) {
    const parts = s.split(/[|,]/).map(x => x.trim())
    if (parts.length >= 2) return {
      ticket_number:  parts[0] || s,
      passenger_name: parts[1] || '',
      passenger_id:   parts[2] || '',
      origin:         parts[3] || '',
      destination:    parts[4] || '',
      seat_number:    parts[5] || '',
      fare_type:      parts[6] || '',
      raw,
    }
  }

  // 4. سطور key:value
  if (s.includes('\n') || (s.includes(':') && s.includes('\n'))) {
    const map = {}
    s.split(/\n|;/).forEach(l => {
      const idx = l.indexOf(':')
      if (idx > 0) {
        const key = l.slice(0, idx).trim().toLowerCase().replace(/[\s_\-]/g, '')
        map[key] = l.slice(idx + 1).trim()
      }
    })
    const ticket = map['ticketno'] || map['ticket'] || map['ticketnumber'] || map['ref'] || map['reference']
    if (ticket) return {
      ticket_number:  ticket,
      passenger_name: map['name'] || map['passengername'] || '',
      passenger_id:   map['nationalid'] || map['id'] || '',
      seat_number:    map['seat'] || map['seatno'] || '',
      fare_type:      map['faretype'] || map['fare'] || '',
      raw,
    }
  }

  // 5. النص كرقم تذكرة مباشرة
  return { ticket_number: s, raw }
}

/* ─── QR Scanner Modal ───────────────────────────────────── */
export default function QRScannerModal({ onScan, onClose, title = 'مسح باركود التذكرة' }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const lastRef   = useRef('')
  const [err, setErr]     = useState('')
  const [ready, setReady] = useState(false)
  const [lastRaw, setLastRaw] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        video.setAttribute('playsinline', true)
        await video.play()
        setReady(true)

        const tick = () => {
          if (!active) return
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = canvasRef.current
            if (canvas) {
              canvas.width  = video.videoWidth
              canvas.height = video.videoHeight
              const ctx = canvas.getContext('2d')
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
              if (code?.data && code.data !== lastRef.current) {
                lastRef.current = code.data
                setLastRaw(code.data)
                const parsed = parseTicketQR(code.data)
                onScan(parsed)
                setTimeout(() => { lastRef.current = '' }, 3000)
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        setErr('تعذّر فتح الكاميرا. تأكد من منح إذن الكاميرا.')
      }
    })()
    return () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const W = Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 32, 380)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>

      <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>{title}</p>

      {/* الكاميرا */}
      <div style={{ position: 'relative', width: W, height: W * 0.75, borderRadius: 14, overflow: 'hidden', background: '#111' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {!ready && !err && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.82rem' }}>
            جارٍ فتح الكاميرا...
          </div>
        )}
        {err && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '0.82rem', padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.75)' }}>
            {err}
          </div>
        )}

        {/* إطار التصويب */}
        {ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 170, height: 170, position: 'relative' }}>
              {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
                <div key={i} style={{ position: 'absolute', width: 26, height: 26, ...pos,
                  borderTop:    pos.top    === 0 ? '3px solid #5B5BD6' : 'none',
                  borderBottom: pos.bottom === 0 ? '3px solid #5B5BD6' : 'none',
                  borderLeft:   pos.left   === 0 ? '3px solid #5B5BD6' : 'none',
                  borderRight:  pos.right  === 0 ? '3px solid #5B5BD6' : 'none',
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <p style={{ color: '#ccc', fontSize: '0.8rem', margin: 0 }}>وجّه الكاميرا نحو باركود التذكرة</p>

      {/* آخر نتيجة مقروءة */}
      {lastRaw && (
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px',
          maxWidth: W, fontSize: '0.72rem', color: '#ddd', direction: 'ltr', wordBreak: 'break-all', textAlign: 'left' }}>
          <span style={{ color: '#888' }}>QR: </span>{lastRaw}
        </div>
      )}

      <button onClick={onClose}
        style={{ padding: '10px 36px', borderRadius: 8, border: 'none', background: '#2a2a2a', color: '#fff', cursor: 'pointer', fontSize: '0.88rem' }}>
        إغلاق
      </button>
    </div>
  )
}

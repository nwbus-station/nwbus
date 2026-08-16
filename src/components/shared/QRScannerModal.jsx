import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/* ---------- مستخرج رقم التذكرة من QR ---------- */
export function extractTicketNumber(raw) {
  if (!raw) return null
  const s = raw.trim()

  // JSON
  try {
    const obj = JSON.parse(s)
    const v = obj.ticket_number ?? obj.ticketNumber ?? obj.ticket ?? obj.id ?? obj.number
    if (v) return String(v).trim()
  } catch (_) {}

  // URL params
  try {
    const url = new URL(s.includes('://') ? s : `https://x.com?${s}`)
    for (const k of ['ticket_number', 'ticketNumber', 'ticket', 'id', 'number']) {
      const v = url.searchParams.get(k)
      if (v) return v.trim()
    }
  } catch (_) {}

  // pipe-delimited  field:value
  if (s.includes('|')) {
    for (const part of s.split('|')) {
      const [k, v] = part.split(':').map(x => x.trim())
      if (/ticket|رقم/i.test(k) && v) return v
    }
  }

  // تسلسل أرقام/حروف بدون مسافات — اعتبره رقم التذكرة
  if (/^[A-Za-z0-9\-_]+$/.test(s) && s.length <= 30) return s

  // خذ أول token يشبه رقم التذكرة
  const m = s.match(/[A-Za-z0-9]{4,20}/)
  return m ? m[0] : s.slice(0, 30)
}

/* ---------- المودال ---------- */
export default function QRScannerModal({ onScan, onClose, isAr = true }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)

  const [status, setStatus]   = useState('init') // init | scanning | error
  const [errMsg, setErrMsg]   = useState('')
  const [lastRaw, setLastRaw] = useState('')

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setStatus('scanning')
        scan()
      }
    } catch (err) {
      setStatus('error')
      setErrMsg(isAr
        ? 'تعذّر الوصول إلى الكاميرا. تأكد من منح الصلاحية والاتصال عبر HTTPS.'
        : 'Camera access denied. Make sure permission is granted and HTTPS is used.')
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  function scan() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }
    const ctx = canvas.getContext('2d')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const raw = code.data
      setLastRaw(raw)
      const ticket = extractTicketNumber(raw)
      if (ticket) {
        stopCamera()
        onScan(ticket)
        return
      }
    }
    rafRef.current = requestAnimationFrame(scan)
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1100,
      background:'rgba(0,0,0,0.85)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    }}>
      {/* رأس */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px' }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>
          {isAr ? 'مسح رقم التذكرة' : 'Scan Ticket QR'}
        </span>
        <button onClick={() => { stopCamera(); onClose() }}
          style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', padding:'6px 14px', cursor:'pointer', fontSize:'0.875rem' }}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
      </div>

      {/* منطقة الكاميرا */}
      <div style={{ position:'relative', width:'100%', maxWidth:480, aspectRatio:'4/3', background:'#000', overflow:'hidden', borderRadius:12 }}>
        <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display:'none' }} />

        {/* إطار المسح */}
        {status === 'scanning' && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ width:200, height:200, position:'relative' }}>
              {[['top-right','top','right'],['top-left','top','left'],['bottom-right','bottom','right'],['bottom-left','bottom','left']].map(([key, v, h]) => (
                <div key={key} style={{
                  position:'absolute', [v]:0, [h]:0,
                  width:32, height:32,
                  borderTop: v === 'top' ? '3px solid #facc15' : 'none',
                  borderBottom: v === 'bottom' ? '3px solid #facc15' : 'none',
                  borderLeft: h === 'left' ? '3px solid #facc15' : 'none',
                  borderRight: h === 'right' ? '3px solid #facc15' : 'none',
                }} />
              ))}
            </div>
          </div>
        )}

        {/* خطأ */}
        {status === 'error' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
            <span style={{ fontSize:'2rem' }}>📷</span>
            <p style={{ color:'#fff', marginTop:8, fontSize:'0.875rem' }}>{errMsg}</p>
          </div>
        )}
      </div>

      <p style={{ color:'rgba(255,255,255,0.6)', fontSize:'0.75rem', marginTop:12, textAlign:'center' }}>
        {isAr ? 'وجّه الكاميرا نحو الباركود' : 'Point camera at the barcode'}
      </p>
      {lastRaw && (
        <p style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.65rem', marginTop:4, fontFamily:'monospace', maxWidth:300, wordBreak:'break-all', textAlign:'center' }}>
          {lastRaw.slice(0, 60)}
        </p>
      )}
    </div>
  )
}

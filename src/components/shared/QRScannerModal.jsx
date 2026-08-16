import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/* ---------- استخرج رقم التذكرة من QR ---------- */
export function extractTicketNumber(raw) {
  if (!raw) return null
  const s = raw.trim()
  try {
    const obj = JSON.parse(s)
    const v = obj.ticket_number ?? obj.ticketNumber ?? obj.ticket ?? obj.id ?? obj.number
    if (v) return String(v).trim()
  } catch (_) {}
  try {
    const url = new URL(s.includes('://') ? s : `https://x.com?${s}`)
    for (const k of ['ticket_number','ticketNumber','ticket','id','number']) {
      const v = url.searchParams.get(k); if (v) return v.trim()
    }
  } catch (_) {}
  if (s.includes('|')) {
    for (const part of s.split('|')) {
      const [k, v] = part.split(':').map(x => x.trim())
      if (/ticket|رقم/i.test(k) && v) return v
    }
  }
  // 7 digits exactly
  const m7 = s.match(/\b\d{7}\b/)
  if (m7) return m7[0]
  if (/^[A-Za-z0-9\-_]+$/.test(s) && s.length <= 30) return s
  return null
}

/* ---------- استخرج أول رقم 7 خانات من نص OCR ---------- */
function extractFromOCRText(text) {
  const matches = text.replace(/\s/g, '').match(/\d{7}/g)
  return matches ? matches[0] : null
}

/* ============================================================
   المودال الرئيسي
   mode: 'qr' | 'ocr'
   ============================================================ */
export default function QRScannerModal({ onScan, onClose, isAr = true }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const streamRef  = useRef(null)

  const [mode, setMode]         = useState('qr')       // 'qr' | 'ocr'
  const [status, setStatus]     = useState('init')      // init|scanning|processing|confirm|error
  const [errMsg, setErrMsg]     = useState('')
  const [ocrResult, setOcrResult] = useState(null)      // رقم التذكرة المستخرج
  const [ocrLoading, setOcrLoading] = useState(false)

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
        if (mode === 'qr') scanQR()
      }
    } catch {
      setStatus('error')
      setErrMsg(isAr
        ? 'تعذّر الوصول إلى الكاميرا. تأكد من منح الصلاحية.'
        : 'Camera access denied.')
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  /* -------- وضع QR (jsQR) -------- */
  function scanQR() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(scanQR); return }
    const ctx = canvas.getContext('2d')
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const img  = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const ticket = extractTicketNumber(code.data)
      if (ticket) { stopCamera(); onScan(ticket); return }
    }
    rafRef.current = requestAnimationFrame(scanQR)
  }

  /* -------- وضع OCR: التقط إطار وقرأ الأرقام -------- */
  async function captureAndReadText() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    setOcrLoading(true)
    setOcrResult(null)

    const ctx = canvas.getContext('2d')
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    // رفع الصورة وقراءتها
    const dataUrl = canvas.toDataURL('image/png')

    try {
      // استيراد tesseract.js ديناميكياً
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: () => {},
        errorHandler: () => {},
      })
      await worker.setParameters({ tessedit_char_whitelist: '0123456789 \n' })
      const { data: { text } } = await worker.recognize(dataUrl)
      await worker.terminate()

      const ticket = extractFromOCRText(text)
      if (ticket) {
        setOcrResult(ticket)
        setStatus('confirm')
      } else {
        setOcrResult(null)
        setStatus('scanning')
        setErrMsg(isAr ? 'لم يُعثر على رقم تذكرة. حرّك الكاميرا وأعد المحاولة.' : 'No ticket number found. Try again.')
      }
    } catch {
      setStatus('scanning')
      setErrMsg(isAr ? 'خطأ في القراءة، أعد المحاولة.' : 'Read error, try again.')
    } finally {
      setOcrLoading(false)
    }
  }

  function switchMode(m) {
    cancelAnimationFrame(rafRef.current)
    setMode(m)
    setOcrResult(null)
    setErrMsg('')
    setStatus('scanning')
    if (m === 'qr') scanQR()
  }

  function confirmOCR() {
    if (ocrResult) { stopCamera(); onScan(ocrResult) }
  }

  /* -------- الواجهة -------- */
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1100,
      background:'rgba(0,0,0,0.9)',
      display:'flex', flexDirection:'column', alignItems:'center',
    }}>
      {/* رأس */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>
          {isAr ? 'إضافة رقم تذكرة' : 'Add Ticket Number'}
        </span>
        <button onClick={() => { stopCamera(); onClose() }}
          style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', padding:'6px 14px', cursor:'pointer', fontSize:'0.875rem' }}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
      </div>

      {/* تبديل الوضع */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {[{ id:'qr', ar:'مسح QR', en:'QR Scan' }, { id:'ocr', ar:'قراءة رقم', en:'Read Number' }].map(m => (
          <button key={m.id} onClick={() => switchMode(m.id)}
            style={{
              padding:'7px 18px', borderRadius:20, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', border:'2px solid',
              borderColor: mode === m.id ? '#facc15' : 'rgba(255,255,255,0.25)',
              background:  mode === m.id ? '#facc15' : 'transparent',
              color:       mode === m.id ? '#000' : '#fff',
              transition:'all 0.15s',
            }}>
            {isAr ? m.ar : m.en}
          </button>
        ))}
      </div>

      {/* منطقة الكاميرا */}
      <div style={{ position:'relative', width:'100%', maxWidth:480, aspectRatio:'4/3', background:'#111', overflow:'hidden', borderRadius:12 }}>
        <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display:'none' }} />

        {/* إطار QR */}
        {mode === 'qr' && status === 'scanning' && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ width:190, height:190, position:'relative' }}>
              {[['top','right'],['top','left'],['bottom','right'],['bottom','left']].map(([v,h]) => (
                <div key={v+h} style={{
                  position:'absolute', [v]:0, [h]:0, width:30, height:30,
                  borderTop: v==='top'?'3px solid #facc15':'none', borderBottom: v==='bottom'?'3px solid #facc15':'none',
                  borderLeft: h==='left'?'3px solid #facc15':'none', borderRight: h==='right'?'3px solid #facc15':'none',
                }}/>
              ))}
            </div>
          </div>
        )}

        {/* إطار OCR: مستطيل عريض للأرقام */}
        {mode === 'ocr' && status === 'scanning' && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ width:'80%', height:70, border:'2px dashed #facc15', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ color:'rgba(250,204,21,0.7)', fontSize:'0.7rem', fontWeight:600 }}>
                {isAr ? 'وجّه الكاميرا على رقم التذكرة' : 'Aim at ticket number'}
              </span>
            </div>
          </div>
        )}

        {/* تحميل OCR */}
        {ocrLoading && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
            <div style={{ width:36, height:36, border:'4px solid rgba(255,255,255,0.2)', borderTopColor:'#facc15', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            <span style={{ color:'#fff', fontSize:'0.85rem' }}>{isAr ? 'جاري قراءة الأرقام...' : 'Reading numbers...'}</span>
          </div>
        )}

        {/* نتيجة OCR */}
        {status === 'confirm' && ocrResult && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
            <span style={{ color:'rgba(255,255,255,0.7)', fontSize:'0.8rem' }}>{isAr ? 'رقم التذكرة المُقروء' : 'Detected ticket number'}</span>
            <span style={{ color:'#facc15', fontSize:'2.2rem', fontWeight:700, fontFamily:'monospace', letterSpacing:4 }}>{ocrResult}</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={confirmOCR}
                style={{ padding:'10px 24px', borderRadius:8, background:'#22c55e', color:'#fff', border:'none', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' }}>
                {isAr ? 'تأكيد' : 'Confirm'}
              </button>
              <button onClick={() => { setStatus('scanning'); setOcrResult(null); setErrMsg('') }}
                style={{ padding:'10px 24px', borderRadius:8, background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', fontWeight:600, cursor:'pointer', fontSize:'0.9rem' }}>
                {isAr ? 'إعادة' : 'Retry'}
              </button>
            </div>
          </div>
        )}

        {/* خطأ كاميرا */}
        {status === 'error' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
            <span style={{ fontSize:'2rem' }}>📷</span>
            <p style={{ color:'#fff', marginTop:8, fontSize:'0.875rem' }}>{errMsg}</p>
          </div>
        )}
      </div>

      {/* تعليمات وزر التقاط */}
      <div style={{ marginTop:14, textAlign:'center' }}>
        {mode === 'qr' && (
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.75rem', margin:0 }}>
            {isAr ? 'وجّه الكاميرا على رمز QR' : 'Point camera at QR code'}
          </p>
        )}
        {mode === 'ocr' && status === 'scanning' && !ocrLoading && (
          <>
            <button onClick={captureAndReadText}
              style={{
                padding:'12px 36px', borderRadius:50, background:'#facc15', color:'#000',
                border:'none', fontWeight:700, fontSize:'0.95rem', cursor:'pointer',
                boxShadow:'0 4px 20px rgba(250,204,21,0.4)',
              }}>
              {isAr ? 'التقط وقرأ الرقم' : 'Capture & Read'}
            </button>
            {errMsg && <p style={{ color:'#f87171', fontSize:'0.75rem', marginTop:8 }}>{errMsg}</p>}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

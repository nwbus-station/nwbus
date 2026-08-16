import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/* ─── صوت التأكيد ─── */
function playBeep(type = 'found') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (type === 'found') {
      osc.frequency.value = 1046 // Do عالي
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
      osc.start(); osc.stop(ctx.currentTime + 0.18)
    } else {
      // نغمتان قصيرتان للاكتمال
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.16)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.36)
    }
  } catch {}
}

/* ─── مساعدات ─── */
export function extractTicketNumber(raw) {
  if (!raw) return null
  const s = raw.trim()
  try {
    const obj = JSON.parse(s)
    const v = obj.ticket_number ?? obj.ticketNumber ?? obj.ticket ?? obj.id
    if (v) return String(v).trim()
  } catch (_) {}
  const m = s.match(/(?<!\d)(\d{7})(?!\d)/)
  return m ? m[1] : null
}

function pickTicketFromText(text) {
  const patterns = [
    /(?:رقم.*?التذكرة|ticket\s*(?:number|no|#)?)\s*[:\-]\s*(\d{7})(?!\d)/i,
    /[:\-]\s*(\d{7})(?!\d)/,
    /(?<!\d)(\d{7})(?!\d)/,
  ]
  for (const p of patterns) { const m = text.match(p); if (m) return m[1] }
  return null
}

function buildOCRCanvas(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  const scale = 2
  const c = document.createElement('canvas')
  c.width = vw * scale; c.height = Math.floor(vh * 0.6) * scale
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(video, 0, Math.floor(vh * 0.2), vw, Math.floor(vh * 0.6), 0, 0, c.width, c.height)
  const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = g > 140 ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return c
}

/* ════════════════════════════════════════
   المودال الرئيسي
   ════════════════════════════════════════ */
export default function QRScannerModal({
  onScan, onClose,
  expectedCount = null,
  initialCount  = 0,
  isAr = true,
}) {
  const videoRef     = useRef(null)
  const canvasRef    = useRef(null)
  const qrRafRef     = useRef(null)
  const streamRef    = useRef(null)
  const workerRef    = useRef(null)
  const busyRef      = useRef(false)
  const activeRef    = useRef(true)
  const scanTimer    = useRef(null)
  const closeTimer   = useRef(null)
  const scanCountRef = useRef(0)
  const onCloseRef   = useRef(onClose)

  const [camReady, setCamReady]         = useState(false)
  const [camErr, setCamErr]             = useState('')
  const [status, setStatus]             = useState('init')   // init|searching|found|done
  const [found, setFound]               = useState(null)
  const [scanCount, setScanCount]       = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanLine, setScanLine]         = useState(0)       // 0-100 for animation

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // خط المسح المتحرك
  useEffect(() => {
    if (status !== 'searching') return
    let dir = 1, val = 0
    const id = setInterval(() => {
      val += dir * 2; if (val >= 100 || val <= 0) dir *= -1
      setScanLine(val)
    }, 16)
    return () => clearInterval(id)
  }, [status])

  const totalDone = initialCount + scanCount
  const remaining = expectedCount !== null ? Math.max(0, expectedCount - totalDone) : null

  useEffect(() => {
    activeRef.current = true
    initAndStart()
    return () => { activeRef.current = false; doCleanup() }
  }, [])

  async function initAndStart() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCamReady(true)
      setStatus('searching')
      loopQR()
    } catch {
      setCamErr(isAr ? 'تعذّر فتح الكاميرا — تحقق من الصلاحيات' : 'Camera access denied')
      return
    }
    try {
      setIsProcessing(true)
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker('eng', 1, { logger: () => {} })
      await w.setParameters({ tessedit_char_whitelist: '0123456789:', tessedit_pageseg_mode: '6' })
      if (!activeRef.current) { await w.terminate(); return }
      workerRef.current = w
      setIsProcessing(false)
      scheduleOCR(400)
    } catch {
      setIsProcessing(false)
      scheduleOCR(3000)
    }
  }

  function doCleanup() {
    cancelAnimationFrame(qrRafRef.current)
    clearTimeout(scanTimer.current)
    clearTimeout(closeTimer.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    workerRef.current?.terminate().catch(() => {}); workerRef.current = null
  }

  function hardClose() { doCleanup(); onCloseRef.current() }

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
      if (t) { presentFound(t); return }
    }
    qrRafRef.current = requestAnimationFrame(loopQR)
  }

  function scheduleOCR(delay = 2500) {
    if (!activeRef.current) return
    clearTimeout(scanTimer.current)
    scanTimer.current = setTimeout(runOCR, delay)
  }

  async function runOCR() {
    if (!activeRef.current || busyRef.current || !workerRef.current) {
      scheduleOCR(1500); return
    }
    const video = videoRef.current
    if (!video || video.readyState < 2) { scheduleOCR(1000); return }
    busyRef.current = true
    setIsProcessing(true)
    try {
      const proc = buildOCRCanvas(video)
      const { data: { text } } = await workerRef.current.recognize(proc.toDataURL('image/png'))
      if (!activeRef.current) return
      const ticket = pickTicketFromText(text)
      if (ticket) presentFound(ticket)
      else scheduleOCR(2500)
    } catch { scheduleOCR(3000) }
    finally {
      busyRef.current = false
      if (activeRef.current) setIsProcessing(false)
    }
  }

  function presentFound(ticket) {
    cancelAnimationFrame(qrRafRef.current)
    clearTimeout(scanTimer.current)
    playBeep('found')
    setFound(ticket)
    setStatus('found')
  }

  function confirmFound() {
    if (!found) return
    onScan(found)
    scanCountRef.current += 1
    setScanCount(scanCountRef.current)
    const newTotal = initialCount + scanCountRef.current
    const done = expectedCount !== null && newTotal >= expectedCount
    if (done) {
      playBeep('done')
      setStatus('done')
      closeTimer.current = setTimeout(hardClose, 2000)
    } else {
      setFound(null)
      setStatus('searching')
      loopQR()
      scheduleOCR(400)
    }
  }

  function retry() {
    setFound(null); setStatus('searching')
    loopQR(); scheduleOCR(400)
  }

  const isSearching = status === 'searching'
  const isFound     = status === 'found'
  const isDone      = status === 'done'

  /* ─── الألوان ─── */
  const GOLD  = '#F5C542'
  const GREEN = '#22c55e'
  const BG    = '#0F1A22'
  const CARD  = 'rgba(255,255,255,0.06)'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, background:BG, display:'flex', flexDirection:'column', fontFamily:'system-ui,sans-serif' }}>

      {/* ══════ الكاميرا ══════ */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover', opacity: isFound||isDone ? 0.35 : 1, transition:'opacity .3s' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display:'none' }} />

        {/* ── شريط العنوان ── */}
        <div style={{
          position:'absolute', top:0, left:0, right:0,
          background:'linear-gradient(rgba(15,26,34,0.85),transparent)',
          padding:'env(safe-area-inset-top,14px) 16px 20px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {isProcessing && !isFound && !isDone && (
              <div style={{ width:13, height:13, border:'2px solid rgba(245,197,66,0.3)', borderTopColor:GOLD, borderRadius:'50%', animation:'spin .6s linear infinite', flexShrink:0 }}/>
            )}
            <span style={{ color:GOLD, fontWeight:700, fontSize:'0.9rem', letterSpacing:0.3 }}>
              {!camReady
                ? (isAr ? 'تشغيل الكاميرا...' : 'Starting camera...')
                : isProcessing && !workerRef.current
                  ? (isAr ? 'تهيئة الماسح...' : 'Initializing...')
                  : isProcessing
                    ? (isAr ? 'يقرأ...' : 'Reading...')
                    : isAr ? 'يبحث عن رقم التذكرة' : 'Scanning for ticket number'}
            </span>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {expectedCount !== null && (
              <div style={{
                background: totalDone >= expectedCount ? GREEN : 'rgba(255,255,255,0.12)',
                color:'#fff', fontSize:'0.75rem', fontWeight:800,
                padding:'4px 12px', borderRadius:20, letterSpacing:0.5,
                transition:'background .3s',
              }}>
                {totalDone} / {expectedCount}
              </div>
            )}
            <button onClick={hardClose} style={{
              background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.15)',
              borderRadius:50, color:'rgba(255,255,255,0.85)',
              padding:'6px 16px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem',
            }}>
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>

        {/* ── إطار المسح مع خط متحرك ── */}
        {isSearching && camReady && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            {/* تعتيم الأطراف */}
            <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 75% 55% at 50% 50%, transparent, rgba(0,0,0,0.55))' }}/>

            {/* الإطار */}
            <div style={{ position:'relative', width:'88%', height:'26%', minHeight:90, maxHeight:140 }}>
              {/* الزوايا */}
              {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
                <div key={v+h} style={{
                  position:'absolute', [v]:-1, [h]:-1,
                  width:28, height:28,
                  borderTop:    v==='top'    ? `3px solid ${GOLD}` : 'none',
                  borderBottom: v==='bottom' ? `3px solid ${GOLD}` : 'none',
                  borderLeft:   h==='left'   ? `3px solid ${GOLD}` : 'none',
                  borderRight:  h==='right'  ? `3px solid ${GOLD}` : 'none',
                  borderRadius: `${v==='top'&&h==='left'?4:0}px ${v==='top'&&h==='right'?4:0}px ${v==='bottom'&&h==='right'?4:0}px ${v==='bottom'&&h==='left'?4:0}px`,
                }}/>
              ))}

              {/* خط المسح المتحرك */}
              <div style={{
                position:'absolute', left:4, right:4,
                top: `${scanLine}%`,
                height:2,
                background:`linear-gradient(90deg,transparent,${GOLD},transparent)`,
                boxShadow:`0 0 8px ${GOLD}`,
                borderRadius:2,
                transition:'top 0.016s linear',
              }}/>

              {/* نص داخل الإطار */}
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.68rem', textAlign:'center', padding:'0 16px', lineHeight:1.5 }}>
                  {isAr ? 'ضع سطر "رقم التذكرة" هنا' : 'Place "Ticket Number" line here'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── نتيجة مكتشفة ── */}
        {isFound && found && (
          <div style={{
            position:'absolute', inset:0,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:20, padding:24,
            background:'rgba(15,26,34,0.88)',
            animation:'fadeIn .2s ease',
          }}>
            {/* الكارد */}
            <div style={{
              background: CARD, border:`2px solid ${GOLD}`,
              borderRadius:20, padding:'28px 40px', textAlign:'center',
              boxShadow:`0 0 32px rgba(245,197,66,0.25)`,
              width:'100%', maxWidth:340,
            }}>
              <div style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.72rem', marginBottom:10, letterSpacing:1.5, textTransform:'uppercase' }}>
                {isAr ? 'رقم التذكرة' : 'Ticket Number'}
              </div>
              <div style={{ color:GOLD, fontSize:'2.8rem', fontWeight:800, fontFamily:'monospace', letterSpacing:7 }}>
                {found}
              </div>
            </div>

            {/* الأزرار */}
            <div style={{ display:'flex', gap:12, width:'100%', maxWidth:340 }}>
              <button onClick={confirmFound} style={{
                flex:1, padding:'15px 0', borderRadius:14, border:'none',
                background:GREEN, color:'#fff', fontWeight:800, fontSize:'1.05rem',
                cursor:'pointer', boxShadow:`0 4px 20px rgba(34,197,94,0.35)`,
                letterSpacing:0.5,
              }}>
                {isAr ? '✓ تأكيد' : 'Confirm'}
              </button>
              <button onClick={retry} style={{
                padding:'15px 22px', borderRadius:14, border:`1px solid rgba(255,255,255,0.15)`,
                background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.7)',
                fontWeight:600, fontSize:'0.95rem', cursor:'pointer',
              }}>
                {isAr ? 'إعادة' : 'Retry'}
              </button>
            </div>

            {remaining !== null && remaining > 1 && (
              <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.72rem' }}>
                {isAr ? `متبقٍ ${remaining - 1} تذكرة` : `${remaining - 1} more`}
              </span>
            )}
          </div>
        )}

        {/* ── اكتمال العدد ── */}
        {isDone && (
          <div style={{
            position:'absolute', inset:0, background:'rgba(15,26,34,0.9)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16,
          }}>
            <div style={{
              background:GREEN, borderRadius:24, padding:'28px 48px', textAlign:'center',
              boxShadow:`0 8px 32px rgba(34,197,94,0.4)`, maxWidth:300,
            }}>
              <div style={{ fontSize:'2.5rem', marginBottom:8 }}>✓</div>
              <p style={{ color:'#fff', fontWeight:800, fontSize:'1.15rem', margin:0 }}>
                {isAr ? 'اكتملت التذاكر' : 'All tickets added'}
              </p>
              {expectedCount && (
                <p style={{ color:'rgba(255,255,255,0.75)', fontSize:'0.85rem', margin:'6px 0 0' }}>
                  {expectedCount} {isAr ? 'تذكرة' : 'tickets'}
                </p>
              )}
              <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.78rem', margin:'10px 0 0' }}>
                {isAr ? 'جاري الإغلاق...' : 'Closing...'}
              </p>
            </div>
          </div>
        )}

        {/* ── خطأ كاميرا ── */}
        {camErr && (
          <div style={{ position:'absolute', inset:0, background:BG, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
            <div style={{ fontSize:'3rem' }}>📷</div>
            <p style={{ color:'rgba(255,255,255,0.7)', textAlign:'center', padding:'0 32px', lineHeight:1.6 }}>{camErr}</p>
          </div>
        )}
      </div>

      {/* ══════ شريط سفلي: تعليمات ══════ */}
      {isSearching && (
        <div style={{
          background: 'rgba(15,26,34,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding:'14px 20px env(safe-area-inset-bottom,14px)',
          textAlign:'center',
          flexShrink:0,
        }}>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.7rem', margin:0, lineHeight:1.6 }}>
            {isAr
              ? 'يبحث تلقائياً عن "رقم التذكرة: XXXXXXX"'
              : 'Auto-scanning for "Ticket Number: XXXXXXX"'}
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:scale(.97) } to { opacity:1; transform:scale(1) } }
      `}</style>
    </div>
  )
}

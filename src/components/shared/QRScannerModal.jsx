import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/* ─── صوت ─── */
function playBeep(type = 'found') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (type === 'found') {
      osc.frequency.value = 1046
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
      osc.start(); osc.stop(ctx.currentTime + 0.18)
    } else {
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

function isColoredBackground(video) {
  try {
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return false
    const c = document.createElement('canvas')
    c.width = 60; c.height = 36
    const ctx = c.getContext('2d')
    ctx.drawImage(video, vw * 0.2, vh * 0.25, vw * 0.6, vh * 0.5, 0, 0, 60, 36)
    const d = ctx.getImageData(0, 0, 60, 36).data
    let r = 0, g = 0, b = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
    r /= n; g /= n; b /= n
    return (g > r + 50) || (b > r + 80)
  } catch { return false }
}

function buildOCRCanvas(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  const scale = 1.5
  const c = document.createElement('canvas')
  c.width = Math.round(vw * scale)
  c.height = Math.round(vh * 0.6 * scale)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, 0, Math.floor(vh * 0.2), vw, Math.floor(vh * 0.6), 0, 0, c.width, c.height)
  const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = gray > 140 ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return c
}

/* ─── أيقونات SVG ─── */
const IconScan = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2"/>
  </svg>
)

const IconCheck = ({ size = 32, color = '#22c55e' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const IconWarn = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

/* ════════════════════════════════════════
   المودال الرئيسي
   ════════════════════════════════════════ */
export default function QRScannerModal({
  onScan, onClose,
  expectedCount   = null,
  initialCount    = 0,
  existingTickets = [],
  isAr = true,
}) {
  const videoRef         = useRef(null)
  const canvasRef        = useRef(null)
  const qrRafRef         = useRef(null)
  const streamRef        = useRef(null)
  const workerRef        = useRef(null)
  const busyRef          = useRef(false)
  const activeRef        = useRef(true)
  const scanTimer        = useRef(null)
  const scanCountRef     = useRef(0)
  const onCloseRef       = useRef(onClose)
  const initialCountRef  = useRef(initialCount)
  const expectedCountRef = useRef(expectedCount)
  const addedSet         = useRef(new Set(existingTickets))

  const [camReady, setCamReady]         = useState(false)
  const [camErr, setCamErr]             = useState('')
  const [status, setStatus]             = useState('init')
  const [found, setFound]               = useState(null)
  const [scanCount, setScanCount]       = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanLine, setScanLine]         = useState(0)
  const [dupWarn, setDupWarn]           = useState(null)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (status !== 'searching') return
    let dir = 1, val = 10
    const id = setInterval(() => {
      val += dir * 1.8
      if (val >= 90 || val <= 10) dir *= -1
      setScanLine(val)
    }, 16)
    return () => clearInterval(id)
  }, [status])

  const totalDone = initialCountRef.current + scanCount
  const remaining = expectedCountRef.current !== null
    ? Math.max(0, expectedCountRef.current - totalDone) : null

  useEffect(() => {
    activeRef.current = true
    initAndStart()
    return () => { activeRef.current = false; stopAll() }
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
      scheduleOCR(300)
    } catch {
      setIsProcessing(false)
      scheduleOCR(3000)
    }
  }

  function stopAll() {
    cancelAnimationFrame(qrRafRef.current)
    clearTimeout(scanTimer.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    workerRef.current?.terminate().catch(() => {}); workerRef.current = null
  }

  function hardClose() { stopAll(); onCloseRef.current() }

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

  function scheduleOCR(delay = 1500) {
    if (!activeRef.current) return
    clearTimeout(scanTimer.current)
    scanTimer.current = setTimeout(runOCR, delay)
  }

  async function runOCR() {
    if (!activeRef.current || busyRef.current || !workerRef.current) {
      scheduleOCR(1200); return
    }
    const video = videoRef.current
    if (!video || video.readyState < 2) { scheduleOCR(800); return }
    if (isColoredBackground(video)) { scheduleOCR(800); return }
    busyRef.current = true
    setIsProcessing(true)
    try {
      const proc = buildOCRCanvas(video)
      const { data: { text } } = await workerRef.current.recognize(proc.toDataURL('image/jpeg', 0.88))
      if (!activeRef.current) return
      const ticket = pickTicketFromText(text)
      if (ticket) presentFound(ticket)
      else scheduleOCR(1500)
    } catch { scheduleOCR(2500) }
    finally {
      busyRef.current = false
      if (activeRef.current) setIsProcessing(false)
    }
  }

  function presentFound(ticket) {
    if (addedSet.current.has(ticket)) {
      setDupWarn(ticket)
      setTimeout(() => setDupWarn(null), 2500)
      scheduleOCR(2000)
      return
    }
    cancelAnimationFrame(qrRafRef.current)
    clearTimeout(scanTimer.current)
    playBeep('found')
    setFound(ticket)
    setStatus('found')
  }

  function confirmFound() {
    if (!found) return
    onScan(found)
    addedSet.current.add(found)
    scanCountRef.current += 1
    setScanCount(scanCountRef.current)
    const newTotal = initialCountRef.current + scanCountRef.current
    const done = expectedCountRef.current !== null && newTotal >= expectedCountRef.current
    if (done) {
      playBeep('done')
      setStatus('done')
      stopAll()
      window.setTimeout(() => onCloseRef.current(), 1800)
    } else {
      setFound(null); setStatus('searching')
      loopQR(); scheduleOCR(300)
    }
  }

  function retry() {
    setFound(null); setStatus('searching')
    loopQR(); scheduleOCR(300)
  }

  const isSearching = status === 'searching'
  const isFound     = status === 'found'
  const isDone      = status === 'done'
  const displayTotal = initialCountRef.current + scanCount

  const GOLD  = '#F5C542'
  const GREEN = '#22c55e'
  const BG    = '#0F1A22'

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1100, background:BG,
      display:'flex', flexDirection:'column', fontFamily:'system-ui,sans-serif',
    }}>

      {/* ══ الكاميرا ══ */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        <video
          ref={videoRef}
          style={{
            width:'100%', height:'100%', objectFit:'cover',
            opacity: isFound || isDone ? 0.2 : 1,
            transition:'opacity .4s ease',
          }}
          playsInline muted
        />
        <canvas ref={canvasRef} style={{ display:'none' }} />

        {/* ── شريط العنوان ── */}
        <div style={{
          position:'absolute', top:0, left:0, right:0,
          background:'linear-gradient(180deg, rgba(15,26,34,0.92) 0%, transparent 100%)',
          padding:'env(safe-area-inset-top,16px) 18px 28px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          {/* اسم الماسح + حالة */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              color: GOLD, opacity: isProcessing && !isFound && !isDone ? 1 : 0.7,
              transition: 'opacity .3s',
            }}>
              <IconScan />
            </div>
            <div>
              <div style={{ color:GOLD, fontWeight:700, fontSize:'0.88rem', letterSpacing:0.4 }}>
                {isAr ? 'ماسح التذاكر' : 'Ticket Scanner'}
              </div>
              {isProcessing && !isFound && !isDone && (
                <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                  <div style={{
                    width:5, height:5, borderRadius:'50%', background:GOLD,
                    animation:'pulse 1.2s ease-in-out infinite',
                  }}/>
                  <span style={{ color:'rgba(245,197,66,0.7)', fontSize:'0.68rem' }}>
                    {!workerRef.current
                      ? (isAr ? 'جاري التهيئة...' : 'Initializing...')
                      : (isAr ? 'يقرأ...' : 'Reading...')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* العداد + إغلاق */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {expectedCountRef.current !== null && (
              <div style={{
                background: displayTotal >= expectedCountRef.current
                  ? 'rgba(34,197,94,0.2)' : 'rgba(245,197,66,0.12)',
                border: `1px solid ${displayTotal >= expectedCountRef.current ? GREEN : 'rgba(245,197,66,0.3)'}`,
                color: displayTotal >= expectedCountRef.current ? GREEN : GOLD,
                fontSize:'0.78rem', fontWeight:800,
                padding:'5px 14px', borderRadius:20, letterSpacing:0.8,
                fontFamily:'monospace',
                transition:'all .3s',
              }}>
                {displayTotal} / {expectedCountRef.current}
              </div>
            )}
            <button onClick={hardClose} style={{
              width:34, height:34,
              background:'rgba(255,255,255,0.08)',
              border:'1px solid rgba(255,255,255,0.12)',
              borderRadius:'50%', color:'rgba(255,255,255,0.7)',
              display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer',
            }}>
              <IconX />
            </button>
          </div>
        </div>

        {/* ── إطار المسح ── */}
        {isSearching && camReady && (
          <div style={{
            position:'absolute', inset:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            pointerEvents:'none',
          }}>
            {/* تعتيم الزوايا */}
            <div style={{
              position:'absolute', inset:0,
              background:'radial-gradient(ellipse 72% 52% at 50% 52%, transparent 0%, rgba(0,0,0,0.6) 100%)',
            }}/>

            {/* الإطار الرئيسي */}
            <div style={{
              position:'relative', width:'85%', maxWidth:340,
              height:'22%', minHeight:88, maxHeight:130,
            }}>
              {/* الحدود الكاملة خفيفة */}
              <div style={{
                position:'absolute', inset:0,
                border:`1px solid rgba(245,197,66,0.2)`,
                borderRadius:16,
              }}/>

              {/* الزوايا الذهبية المميزة */}
              {[
                { top:-2, left:-2, bTop:true, bLeft:true },
                { top:-2, right:-2, bTop:true, bRight:true },
                { bottom:-2, left:-2, bBottom:true, bLeft:true },
                { bottom:-2, right:-2, bBottom:true, bRight:true },
              ].map((s, i) => (
                <div key={i} style={{
                  position:'absolute',
                  top: s.top, right: s.right, bottom: s.bottom, left: s.left,
                  width:24, height:24,
                  borderTop:    s.bTop    ? `3px solid ${GOLD}` : 'none',
                  borderBottom: s.bBottom ? `3px solid ${GOLD}` : 'none',
                  borderLeft:   s.bLeft   ? `3px solid ${GOLD}` : 'none',
                  borderRight:  s.bRight  ? `3px solid ${GOLD}` : 'none',
                  borderRadius: i===0?'5px 0 0 0': i===1?'0 5px 0 0': i===2?'0 0 0 5px':'0 0 5px 0',
                  boxShadow: `0 0 10px rgba(245,197,66,0.4)`,
                }}/>
              ))}

              {/* خط المسح المتحرك */}
              <div style={{
                position:'absolute', left:8, right:8,
                top:`${scanLine}%`,
                height:2,
                background:`linear-gradient(90deg, transparent, rgba(245,197,66,0.6), ${GOLD}, rgba(245,197,66,0.6), transparent)`,
                boxShadow:`0 0 12px rgba(245,197,66,0.7), 0 0 4px ${GOLD}`,
                borderRadius:2,
              }}/>
            </div>
          </div>
        )}

        {/* ── بطاقة التذكرة المكتشفة ── */}
        {isFound && found && (
          <div style={{
            position:'absolute', inset:0,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:20, padding:28,
            animation:'fadeUp .25s ease',
          }}>
            {/* الكارد */}
            <div style={{
              width:'100%', maxWidth:320,
              background:'rgba(15,26,34,0.95)',
              border:`1.5px solid rgba(245,197,66,0.4)`,
              borderRadius:24,
              padding:'24px 28px',
              boxShadow:`0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,197,66,0.1)`,
              backdropFilter:'blur(20px)',
            }}>
              <div style={{
                color:'rgba(245,197,66,0.5)', fontSize:'0.65rem',
                letterSpacing:2.5, textTransform:'uppercase', marginBottom:12,
                textAlign:'center',
              }}>
                {isAr ? 'رقم التذكرة' : 'Ticket Number'}
              </div>
              <div style={{
                color:GOLD, fontSize:'2.6rem', fontWeight:800,
                fontFamily:'monospace', letterSpacing:8,
                textAlign:'center', lineHeight:1,
              }}>
                {found}
              </div>
            </div>

            {/* الأزرار */}
            <div style={{ display:'flex', gap:12, width:'100%', maxWidth:320 }}>
              <button onClick={confirmFound} style={{
                flex:1, padding:'16px 0', borderRadius:16, border:'none',
                background:`linear-gradient(135deg, #22c55e, #16a34a)`,
                color:'#fff', fontWeight:800, fontSize:'1rem',
                cursor:'pointer',
                boxShadow:`0 8px 24px rgba(34,197,94,0.35)`,
                letterSpacing:0.5,
              }}>
                {isAr ? '✓ تأكيد' : 'Confirm'}
              </button>
              <button onClick={retry} style={{
                padding:'16px 20px', borderRadius:16,
                border:'1px solid rgba(255,255,255,0.1)',
                background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.6)',
                fontWeight:600, fontSize:'0.9rem', cursor:'pointer',
              }}>
                {isAr ? 'إعادة' : 'Retry'}
              </button>
            </div>

            {remaining !== null && remaining > 1 && (
              <span style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.7rem' }}>
                {isAr ? `متبقٍ ${remaining - 1} تذكرة` : `${remaining - 1} more`}
              </span>
            )}
          </div>
        )}

        {/* ── شاشة اكتمال العدد ── */}
        {isDone && (
          <div style={{
            position:'absolute', inset:0,
            background:'rgba(15,26,34,0.97)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:28, padding:32,
            animation:'fadeIn .3s ease',
          }}>
            {/* الدائرة المتحركة */}
            <div style={{ position:'relative', width:110, height:110, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {/* حلقة متحركة خارجية */}
              <div style={{
                position:'absolute', inset:0, borderRadius:'50%',
                border:`2px solid rgba(34,197,94,0.3)`,
                animation:'ringExpand 1.5s ease-out infinite',
              }}/>
              {/* حلقة ثابتة */}
              <div style={{
                position:'absolute', inset:8, borderRadius:'50%',
                border:`2px solid rgba(34,197,94,0.5)`,
              }}/>
              {/* دائرة مركزية */}
              <div style={{
                width:76, height:76, borderRadius:'50%',
                background:'rgba(34,197,94,0.12)',
                border:`2px solid ${GREEN}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:`0 0 24px rgba(34,197,94,0.3)`,
              }}>
                <IconCheck size={34} color={GREEN} />
              </div>
            </div>

            {/* النص */}
            <div style={{ textAlign:'center' }}>
              <p style={{ color:'#fff', fontWeight:800, fontSize:'1.25rem', margin:0, letterSpacing:0.3 }}>
                {isAr ? 'اكتملت التذاكر' : 'All Tickets Added'}
              </p>
              {expectedCountRef.current !== null && (
                <p style={{
                  color:GOLD, fontSize:'0.9rem', fontWeight:700,
                  margin:'10px 0 0', fontFamily:'monospace', letterSpacing:3,
                }}>
                  {expectedCountRef.current} / {expectedCountRef.current}
                </p>
              )}
            </div>

            {/* زر إغلاق يدوي */}
            <button onClick={hardClose} style={{
              padding:'13px 44px', borderRadius:50,
              border:`1.5px solid rgba(255,255,255,0.15)`,
              background:'rgba(255,255,255,0.06)',
              color:'rgba(255,255,255,0.75)',
              fontWeight:600, fontSize:'0.88rem',
              cursor:'pointer', letterSpacing:0.5,
            }}>
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        )}

        {/* ── تحذير تذكرة مكررة — شريط ينزل من الأعلى ── */}
        {dupWarn && (
          <div style={{
            position:'absolute', top:0, left:0, right:0,
            zIndex:20, animation:'slideDown .2s ease',
          }}>
            <div style={{
              background:'rgba(185,28,28,0.97)',
              backdropFilter:'blur(16px)',
              padding:'14px 18px',
              display:'flex', alignItems:'center', gap:12,
              borderBottom:'1px solid rgba(255,255,255,0.08)',
            }}>
              {/* أيقونة */}
              <div style={{
                width:38, height:38, borderRadius:10,
                background:'rgba(255,255,255,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'rgba(255,200,200,0.9)', flexShrink:0,
              }}>
                <IconWarn />
              </div>
              {/* النص */}
              <div style={{ flex:1 }}>
                <p style={{ color:'rgba(255,200,200,0.85)', fontSize:'0.72rem', margin:0, letterSpacing:0.3 }}>
                  {isAr ? 'هذه التذكرة مضافة مسبقاً' : 'Already added'}
                </p>
                <p style={{
                  color:'#fff', fontFamily:'monospace',
                  fontSize:'1.3rem', fontWeight:800,
                  margin:'3px 0 0', letterSpacing:5,
                }}>
                  {dupWarn}
                </p>
              </div>
            </div>
            {/* شريط التقدم */}
            <div style={{ height:3, background:'rgba(255,255,255,0.12)', overflow:'hidden' }}>
              <div style={{
                height:'100%', background:'rgba(255,255,255,0.5)',
                animation:'shrinkBar 2.5s linear forwards',
              }}/>
            </div>
          </div>
        )}

        {/* ── خطأ كاميرا ── */}
        {camErr && (
          <div style={{
            position:'absolute', inset:0, background:BG,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12,
          }}>
            <IconScan />
            <p style={{ color:'rgba(255,255,255,0.6)', textAlign:'center', padding:'0 32px', lineHeight:1.7, fontSize:'0.9rem' }}>
              {camErr}
            </p>
          </div>
        )}
      </div>

      {/* ══ شريط سفلي ══ */}
      {isSearching && (
        <div style={{
          background:'rgba(15,26,34,0.98)',
          borderTop:'1px solid rgba(255,255,255,0.05)',
          padding:'12px 20px env(safe-area-inset-bottom,12px)',
          textAlign:'center', flexShrink:0,
        }}>
          <p style={{ color:'rgba(255,255,255,0.25)', fontSize:'0.68rem', margin:0, letterSpacing:0.3 }}>
            {isAr
              ? 'يبحث تلقائياً عن رقم التذكرة'
              : 'Auto-scanning for ticket number'}
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin     { to { transform:rotate(360deg) } }
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeUp   { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideDown{ from { transform:translateY(-100%) } to { transform:translateY(0) } }
        @keyframes shrinkBar{ from { width:100% } to { width:0% } }
        @keyframes pulse    { 0%,100% { opacity:0.4; transform:scale(0.85) } 50% { opacity:1; transform:scale(1) } }
        @keyframes ringExpand{
          0%   { transform:scale(1);   opacity:0.5 }
          100% { transform:scale(1.5); opacity:0   }
        }
      `}</style>
    </div>
  )
}

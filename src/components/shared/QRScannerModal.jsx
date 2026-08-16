import { useEffect, useRef, useState, useCallback } from 'react'
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
  const m7 = s.match(/\b\d{7}\b/)
  if (m7) return m7[0]
  if (/^[A-Za-z0-9\-_]+$/.test(s) && s.length <= 30) return s
  return null
}

/* ---------- قص منطقة الإطار من canvas ---------- */
function cropGuideBox(srcCanvas) {
  const w = srcCanvas.width, h = srcCanvas.height
  const out = document.createElement('canvas')
  const cropX = Math.floor(w * 0.04)
  const cropY = Math.floor(h * 0.36)
  const cropW = Math.floor(w * 0.92)
  const cropH = Math.floor(h * 0.28)
  const scale = 3
  out.width  = cropW * scale
  out.height = cropH * scale
  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height)
  return out
}

/* ---------- OCR عبر OCR.space (مجاني، دقيق) ---------- */
async function cloudOCR(canvas) {
  const base64 = canvas.toDataURL('image/png').split(',')[1]
  const form = new FormData()
  form.append('base64Image', `data:image/png;base64,${base64}`)
  form.append('language', 'eng')
  form.append('isNumeric', '1')          // أرقام فقط
  form.append('OCREngine', '2')          // المحرك الأدق
  form.append('scale', 'true')
  form.append('isTable', 'false')
  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: 'helloworld' },   // مفتاح تجريبي مجاني
    body: form,
  })
  if (!res.ok) throw new Error('OCR API error')
  const data = await res.json()
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || 'OCR error')
  return data.ParsedResults?.[0]?.ParsedText || ''
}

/* ---------- استخرج أول 7 أرقام ---------- */
function pick7(text) {
  const digits = text.replace(/\D/g, '')
  const m = digits.match(/\d{7}/)
  return m ? m[0] : null
}

/* ============================================================
   المودال
   ============================================================ */
export default function QRScannerModal({ onScan, onClose, isAr = true }) {
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const streamRef  = useRef(null)
  const thumbTimer = useRef(null)

  const [mode, setMode]             = useState('qr')
  const [camReady, setCamReady]     = useState(false)
  const [thumbUrl, setThumbUrl]     = useState(null)   // معاينة مباشرة للمنطقة المحددة
  const [frozen, setFrozen]         = useState(null)   // صورة مجمّدة للمعاينة قبل OCR
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult]   = useState(null)
  const [errMsg, setErrMsg]         = useState('')
  const [pasteVal, setPasteVal]     = useState('')
  const [tab, setTab]               = useState('cam')  // 'cam' | 'paste'

  useEffect(() => { startCamera(); return () => cleanup() }, [])

  function cleanup() {
    cancelAnimationFrame(rafRef.current)
    clearInterval(thumbTimer.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
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
      if (mode === 'qr') loopQR()
    } catch {
      setErrMsg(isAr ? 'تعذّر تشغيل الكاميرا — تحقق من الصلاحية.' : 'Camera error.')
    }
  }

  /* معاينة مباشرة كل 300ms للإطار المحدد */
  function startThumbUpdater() {
    clearInterval(thumbTimer.current)
    thumbTimer.current = setInterval(() => {
      const video = videoRef.current, canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      const crop = cropGuideBox(canvas)
      setThumbUrl(crop.toDataURL('image/jpeg', 0.75))
    }, 300)
  }

  function stopThumbUpdater() { clearInterval(thumbTimer.current) }

  /* -------- حلقة QR -------- */
  function loopQR() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(loopQR); return }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const id   = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      const t = extractTicketNumber(code.data)
      if (t) { cleanup(); onScan(t); return }
    }
    rafRef.current = requestAnimationFrame(loopQR)
  }

  function switchMode(m) {
    cancelAnimationFrame(rafRef.current)
    stopThumbUpdater()
    setMode(m); setOcrResult(null); setErrMsg(''); setThumbUrl(null); setFrozen(null)
    if (m === 'qr') loopQR()
    else startThumbUpdater()
  }

  /* -------- التقاط وإرسال للـ OCR -------- */
  async function captureAndOCR() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas) return
    stopThumbUpdater()

    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const crop = cropGuideBox(canvas)

    setFrozen(crop.toDataURL('image/jpeg', 0.9))
    setOcrLoading(true); setOcrResult(null); setErrMsg('')

    try {
      const text   = await cloudOCR(crop)
      const ticket = pick7(text)
      if (ticket) {
        setOcrResult(ticket)
      } else {
        setErrMsg(isAr
          ? `لم يُعثر على رقم. النص المقروء: "${text.trim().slice(0,40)}" — أعد المحاولة مع تثبيت الجوال.`
          : `Not found. OCR read: "${text.trim().slice(0,40)}" — retry with steady phone.`)
        startThumbUpdater()
      }
    } catch {
      setErrMsg(isAr ? 'خطأ في الاتصال بخدمة OCR، تحقق من الإنترنت.' : 'OCR service error.')
      startThumbUpdater()
    } finally {
      setOcrLoading(false)
    }
  }

  function retryOCR() { setFrozen(null); setOcrResult(null); setErrMsg(''); startThumbUpdater() }

  function confirmOCR() { cleanup(); onScan(ocrResult) }

  function confirmPaste() {
    const t = pasteVal.trim()
    const m = t.match(/\d{7}/)
    if (m) { cleanup(); onScan(m[0]) }
    else setErrMsg(isAr ? 'أدخل رقماً مكوّناً من 7 أرقام.' : 'Enter a 7-digit number.')
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      const m = text.replace(/\D/g,'').match(/\d{7}/)
      if (m) setPasteVal(m[0])
      else setPasteVal(text.trim().slice(0, 10))
    } catch { setErrMsg(isAr ? 'الصلاحية مرفوضة.' : 'Clipboard denied.') }
  }

  /* -------- UI -------- */
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1100, background:'rgba(0,0,0,0.95)',
      display:'flex', flexDirection:'column', alignItems:'center', overflowY:'auto',
    }}>
      {/* رأس */}
      <div style={{ width:'100%', maxWidth:480, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', flexShrink:0 }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>
          {isAr ? 'إضافة رقم تذكرة' : 'Add Ticket Number'}
        </span>
        <button onClick={() => { cleanup(); onClose() }}
          style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:8, color:'#fff', padding:'6px 14px', cursor:'pointer' }}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
      </div>

      {/* تبديل وضع المسح */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexShrink:0 }}>
        {[{id:'qr',ar:'مسح QR',en:'QR'},{id:'ocr',ar:'كاميرا + ذكاء',en:'Camera AI'}].map(m => (
          <button key={m.id} onClick={() => { setTab('cam'); switchMode(m.id) }}
            style={{
              padding:'7px 18px', borderRadius:20, fontSize:'0.8rem', fontWeight:600,
              cursor:'pointer', border:'2px solid',
              borderColor: tab==='cam' && mode===m.id ? '#facc15' : 'rgba(255,255,255,0.2)',
              background:  tab==='cam' && mode===m.id ? '#facc15' : 'transparent',
              color:       tab==='cam' && mode===m.id ? '#000' : '#fff', transition:'all 0.15s',
            }}>{isAr ? m.ar : m.en}</button>
        ))}
        <button onClick={() => { setTab('paste'); stopThumbUpdater(); cancelAnimationFrame(rafRef.current) }}
          style={{
            padding:'7px 18px', borderRadius:20, fontSize:'0.8rem', fontWeight:600,
            cursor:'pointer', border:'2px solid',
            borderColor: tab==='paste' ? '#a78bfa' : 'rgba(255,255,255,0.2)',
            background:  tab==='paste' ? '#a78bfa' : 'transparent',
            color:       tab==='paste' ? '#000' : '#fff', transition:'all 0.15s',
          }}>{isAr ? 'لصق رقم' : 'Paste #'}</button>
      </div>

      {/* =============== لصق =============== */}
      {tab === 'paste' && (
        <div style={{ width:'100%', maxWidth:480, padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ color:'rgba(255,255,255,0.6)', fontSize:'0.8rem', margin:0, textAlign:'center' }}>
            {isAr ? 'انسخ رقم التذكرة من تطبيق الحجز ثم الصقه هنا' : 'Copy ticket number from booking app then paste here'}
          </p>
          <input
            value={pasteVal}
            onChange={e => { setPasteVal(e.target.value.replace(/\D/g,'').slice(0,7)); setErrMsg('') }}
            placeholder={isAr ? '0000000' : '0000000'}
            inputMode="numeric"
            style={{ padding:'14px', borderRadius:10, fontSize:'1.5rem', fontFamily:'monospace', textAlign:'center', border:'2px solid rgba(167,139,250,0.5)', background:'rgba(255,255,255,0.05)', color:'#fff', letterSpacing:4 }}
          />
          <button onClick={pasteFromClipboard}
            style={{ padding:'10px', borderRadius:8, background:'rgba(167,139,250,0.2)', color:'#a78bfa', border:'1px solid rgba(167,139,250,0.3)', cursor:'pointer', fontWeight:600, fontSize:'0.85rem' }}>
            {isAr ? '📋 لصق من الحافظة' : '📋 Paste from clipboard'}
          </button>
          {errMsg && <p style={{ color:'#f87171', fontSize:'0.78rem', textAlign:'center', margin:0 }}>{errMsg}</p>}
          <button onClick={confirmPaste} disabled={pasteVal.length !== 7}
            style={{ padding:'13px', borderRadius:10, background: pasteVal.length===7 ? '#22c55e' : '#444', color:'#fff', border:'none', fontWeight:700, fontSize:'1rem', cursor: pasteVal.length===7?'pointer':'not-allowed' }}>
            {isAr ? `✓ إضافة رقم ${pasteVal || '-------'}` : `✓ Add ${pasteVal || '-------'}`}
          </button>
        </div>
      )}

      {/* =============== كاميرا =============== */}
      {tab === 'cam' && (
        <>
          <div style={{ position:'relative', width:'100%', maxWidth:480, aspectRatio:'4/3', background:'#000', borderRadius:12, overflow:'hidden', flexShrink:0 }}>
            <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'cover' }} playsInline muted />
            <canvas ref={canvasRef} style={{ display:'none' }} />

            {/* إطار QR */}
            {mode === 'qr' && camReady && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                <div style={{ width:185, height:185, position:'relative' }}>
                  {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
                    <div key={v+h} style={{ position:'absolute', [v]:0, [h]:0, width:30, height:30,
                      borderTop: v==='top'?'3px solid #facc15':'none', borderBottom: v==='bottom'?'3px solid #facc15':'none',
                      borderLeft: h==='left'?'3px solid #facc15':'none', borderRight: h==='right'?'3px solid #facc15':'none' }}/>
                  ))}
                </div>
              </div>
            )}

            {/* إطار OCR */}
            {mode === 'ocr' && camReady && !frozen && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                <div style={{
                  width:'92%', height:'28%', border:'2px solid #facc15', borderRadius:8,
                  boxShadow:'0 0 0 2000px rgba(0,0,0,0.5)',
                }}/>
              </div>
            )}

            {/* صورة مجمّدة */}
            {frozen && !ocrLoading && (
              <img src={frozen} alt="frozen"
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
            )}

            {/* تحميل OCR */}
            {ocrLoading && (
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
                <div style={{ width:42, height:42, border:'4px solid rgba(255,255,255,0.1)', borderTopColor:'#facc15', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                <span style={{ color:'#fff', fontSize:'0.9rem', fontWeight:600 }}>
                  {isAr ? 'جاري التعرف على الرقم...' : 'Recognizing number...'}
                </span>
              </div>
            )}

            {/* نتيجة OCR */}
            {ocrResult && !ocrLoading && (
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
                <span style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.8rem' }}>{isAr ? 'رقم التذكرة' : 'Ticket #'}</span>
                <span style={{ color:'#facc15', fontSize:'2.6rem', fontWeight:800, fontFamily:'monospace', letterSpacing:6 }}>{ocrResult}</span>
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={confirmOCR}
                    style={{ padding:'11px 30px', borderRadius:8, background:'#22c55e', color:'#fff', border:'none', fontWeight:700, cursor:'pointer', fontSize:'0.95rem' }}>
                    {isAr ? '✓ تأكيد' : 'Confirm'}
                  </button>
                  <button onClick={retryOCR}
                    style={{ padding:'11px 22px', borderRadius:8, background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', fontWeight:600, cursor:'pointer', fontSize:'0.95rem' }}>
                    {isAr ? 'إعادة' : 'Retry'}
                  </button>
                </div>
              </div>
            )}

            {/* خطأ كاميرا */}
            {!camReady && errMsg && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
                <span style={{ fontSize:'2rem' }}>📷</span>
                <p style={{ color:'#fff', marginTop:8, fontSize:'0.875rem', textAlign:'center' }}>{errMsg}</p>
              </div>
            )}
          </div>

          {/* معاينة مباشرة للمنطقة المحددة */}
          {mode === 'ocr' && thumbUrl && !frozen && (
            <div style={{ marginTop:8, width:'100%', maxWidth:480, padding:'0 16px' }}>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.65rem', margin:'0 0 4px', textAlign:'center' }}>
                {isAr ? 'معاينة الإطار (تحديث تلقائي)' : 'Frame preview (live)'}
              </p>
              <img src={thumbUrl} alt="preview"
                style={{ width:'100%', borderRadius:6, border:'1px solid rgba(250,204,21,0.3)', imageRendering:'auto' }}/>
            </div>
          )}

          {/* أزرار أسفل */}
          <div style={{ marginTop:12, width:'100%', maxWidth:480, padding:'0 16px', textAlign:'center', flexShrink:0 }}>
            {mode === 'qr' && (
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.75rem', margin:0 }}>
                {isAr ? 'وجّه الكاميرا على رمز QR' : 'Point at QR code'}
              </p>
            )}
            {mode === 'ocr' && !ocrLoading && !ocrResult && (
              <>
                <button onClick={captureAndOCR} disabled={!camReady}
                  style={{
                    padding:'13px', borderRadius:50, width:'100%',
                    background: camReady ? '#facc15' : '#555',
                    color:'#000', border:'none', fontWeight:700, fontSize:'0.95rem',
                    cursor: camReady ? 'pointer' : 'not-allowed',
                    boxShadow: camReady ? '0 4px 24px rgba(250,204,21,0.35)' : 'none',
                  }}>
                  {isAr ? 'التقط وقرأ الرقم' : 'Capture & Read Number'}
                </button>
                {errMsg && (
                  <p style={{ color:'#f87171', fontSize:'0.72rem', marginTop:8, lineHeight:1.5 }}>{errMsg}</p>
                )}
                <p style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.68rem', marginTop:8 }}>
                  {isAr ? 'ثبّت الهاتف — الرقم يجب أن يكون داخل الإطار الأصفر' : 'Keep steady — number must be inside the yellow frame'}
                </p>
              </>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
    </div>
  )
}

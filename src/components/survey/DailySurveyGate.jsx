import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAppSettings } from '../../context/AppSettingsContext'
import { supabase } from '../../lib/supabase'
import { fetchSurveyCities, detectSurveyCity, BASE } from '../../pages/SurveyPage'
import { riyadhDay } from '../../utils/dates'


// التقييم اليومي الإلزامي: عند أول فتح في اليوم يُعرض استبيان تجربة الراكب (الوجوه) على كل حساب عدا الأدمن العام،
// ويبقى حتى يُكمل العدد المطلوب (الافتراضي 5، يحدده الأدمن). كل تقييم يُتحقق من وصوله فعلاً قبل احتسابه، ثم لا يظهر حتى اليوم التالي.
export default function DailySurveyGate() {
  const { profile, isGeneralAdmin } = useAuth()
  const { settings } = useAppSettings()
  const enabled = String(settings?.daily_survey_enabled) === 'true'
  const need = Math.max(1, Number(settings?.daily_survey_count) || 5)
  const day = riyadhDay()

  const [done, setDone] = useState(null)        // null = جارٍ التحميل
  const [url, setUrl] = useState('')
  const [ready, setReady] = useState(false)     // جاهزية الرابط
  const [msg, setMsg] = useState({ kind: '', text: '' })
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const autoRef = useRef(false)             // انتقال تلقائي جارٍ (منع التكرار)
  const [autoOk, setAutoOk] = useState(null)   // null = لم يُختبر، true = الكشف التلقائي يعمل، false = الدالة غير متاحة
  const [fails, setFails] = useState(0)        // محاولات تحقق فاشلة متتالية (بعدها يظهر الاعتماد اليدوي)
  const sinceRef = useRef(new Date(Date.now() - 3000).toISOString())
  // الفئة المستهدفة: كل الحسابات (عدا الأدمن العام) أو حسابات محددة فقط
  const target = String(settings?.daily_survey_target) === 'selected' ? 'selected' : 'all'
  let selectedIds = []
  try { selectedIds = JSON.parse(settings?.daily_survey_users || '[]') } catch { selectedIds = [] }
  const [preview, setPreview] = useState(false)   // معاينة الأدمن: لا تُحتسب ولا تُحفظ
  useEffect(() => {
    const on = () => setPreview(true)
    window.addEventListener('daily-survey-preview', on)
    return () => window.removeEventListener('daily-survey-preview', on)
  }, [])
  const targeted = target === 'all' || selectedIds.includes(profile?.id)
  const active = (enabled && !!profile?.id && !isGeneralAdmin && targeted) || (preview && isGeneralAdmin)

  // التقدّم الحالي لليوم + رابط استبيان مدينة محطة الموظف
  useEffect(() => {
    if (!active) return
    let off = false
    ;(async () => {
      const [{ data: row, error: pe }, { data: st }, cities] = await Promise.all([
        supabase.from('user_daily_survey').select('done').eq('user_id', profile.id).eq('day', day).maybeSingle(),
        profile.station_id ? supabase.from('stations').select('name_ar, name_en, survey_city').eq('id', profile.station_id).maybeSingle() : Promise.resolve({ data: null }),
        fetchSurveyCities(),
      ])
      if (off) return
      if (pe) { setDone(need); return }   // الجدول غير مُنشأ بعد: لا نحجب أحداً
      const key = detectSurveyCity(st || profile.station)
      const city = cities.find(c => c.city === key && c.is_active !== false)
      if (!city) { setDone(need); return }   // محطة بلا استبيان معرّف: غير مشمولة
      setUrl(city.url || `${BASE}${city.city}`)
      setReady(true)
      setDone(preview ? 0 : (row?.done ?? 0))
      sinceRef.current = new Date(Date.now() - 3000).toISOString()
    })()
    return () => { off = true }
  }, [active, profile?.id, day, preview]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(async (manual = false) => {
    setBusy(true); setMsg({ kind: '', text: '' })
    try {
      // التحقق من وصول تقييم جديد فعلاً من الراكب (إن لم تُنشأ الدالة بعد نكتفي بتأكيد الموظف)
      const { data: cnt, error: re } = manual ? { data: 1, error: null } : await supabase.rpc('survey_count_since', { p_since: sinceRef.current })
      if (!re && (Number(cnt) || 0) < 1) {
        setFails(f => f + 1)
        setMsg({ kind: 'warn', text: 'لم يصل تقييم جديد بعد. اطلب من الراكب إكمال الاستبيان حتى النهاية (الضغط على «إرسال») ثم اضغط هنا.' })
        setBusy(false); return
      }
      const nd = (done ?? 0) + 1
      if (preview) { setDone(nd); setFails(0); if (nd >= need) { setFinished(true); setTimeout(() => { setFinished(false); setPreview(false) }, 1800) } else { sinceRef.current = new Date(Date.now() - 3000).toISOString(); setFrameKey(k => k + 1) }; setBusy(false); return }
      const { error: ue } = await supabase.from('user_daily_survey').upsert({ user_id: profile.id, day, done: nd, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
      if (ue) { setMsg({ kind: 'err', text: 'تعذّر حفظ التقدّم: ' + ue.message }); setBusy(false); return }
      setDone(nd); setFails(0)
      if (nd >= need) { setFinished(true); setTimeout(() => setFinished(false), 2500) }
      else { sinceRef.current = new Date(Date.now() - 3000).toISOString(); setFrameKey(k => k + 1); setMsg({ kind: 'ok', text: 'تم احتساب التقييم. سلّم الجهاز للراكب التالي.' }) }
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'حدث خطأ' }) }
    setBusy(false)
  }, [done, need, profile?.id, day, preview])

  // الاحتساب الفوري: صفحة الاستبيان ترسل إشارة عند ظهور «شكراً لكم» (window.parent.postMessage({ nwbusSurveyDone: true })) فنحتسب لحظتها
  useEffect(() => {
    if (!active || !ready || finished) return
    let origin = ''
    try { origin = new URL(url).origin } catch { /* لا شي */ }
    const onMsg = e => {
      if (origin && e.origin !== origin) return
      const d = e.data
      if (!(d && (d.nwbusSurveyDone || d.type === 'nwbus-survey-done'))) return
      if (autoRef.current) return
      autoRef.current = true
      setMsg({ kind: 'ok', text: 'وصل التقييم. جارٍ الانتقال للراكب التالي...' })
      setTimeout(async () => { await next(true); autoRef.current = false }, 1800)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [active, ready, finished, url, next])

  // الاحتساب التلقائي: نراقب وصول تقييم جديد (ضغط الراكب «إرسال» بالاستبيان) فنحتسبه وننتقل للراكب التالي دون أي ضغطة
  useEffect(() => {
    if (!active || !ready || preview || done === null || done >= need || finished) return
    let off = false
    const tick = async () => {
      if (off || autoRef.current || busy) return
      const { data: cnt, error } = await supabase.rpc('survey_count_since', { p_since: sinceRef.current })
      if (off) return
      if (error) { setAutoOk(false); return }
      setAutoOk(true)
      if ((Number(cnt) || 0) >= 1 && !autoRef.current) {
        autoRef.current = true
        setMsg({ kind: 'ok', text: 'وصل التقييم. جارٍ الانتقال للراكب التالي...' })
        setTimeout(async () => { await next(true); autoRef.current = false }, 2200)
      }
    }
    const id = setInterval(tick, 2500)
    return () => { off = true; clearInterval(id) }
  }, [active, ready, preview, done, need, finished, busy, next])

  if (!active || done === null) return null
  if (done >= need && !finished) return null

  const dots = Array.from({ length: need }, (_, i) => i < done)
  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 9998, background: '#0b0b0d', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, background: '#111', borderBottom: '1px solid rgba(255,255,255,.08)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, color: '#fff', fontSize: '.85rem', fontWeight: 800 }}>التقييم اليومي لتجربة الراكب{preview ? ' — معاينة (لا تُحتسب)' : ''}</p>
          <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,.55)', fontSize: '.7rem' }}>اعرض الشاشة على راكب ليختار الوجه المعبّر عن رضاه ثم يضغط «إرسال». يُحتسب التقييم تلقائياً بمجرد إرساله، وكرّر حتى يكتمل العدد.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label={`${done} من ${need}`}>
          {dots.map((on, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: on ? '#34d399' : 'rgba(255,255,255,.18)' }} />)}
          <b style={{ color: '#fff', fontSize: '.8rem', marginInlineStart: 8, fontFamily: 'monospace' }}>{done} / {need}</b>
        </div>
        {preview && <button type="button" onClick={() => { setPreview(false); setDone(null) }} style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 9, padding: '8px 14px', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>إغلاق المعاينة</button>}
        <button type="button" disabled={busy || finished} onClick={() => next(false)}
          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontWeight: 800, fontSize: '.82rem', cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1 }}>
          {busy ? 'جارٍ التحقق...' : (autoOk ? 'تحقق الآن' : 'تم تقييم الراكب، التالي')}
        </button>
      </div>
      {fails >= 2 && !busy && (
        <div style={{ flexShrink: 0, padding: '8px 16px', background: '#1f2937', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'rgba(255,255,255,.8)', fontSize: '.75rem', flex: 1 }}>إن أرسل الراكب تقييمه فعلاً ولم يُحتسب، يمكنك اعتماده يدوياً.</span>
          <button type="button" onClick={() => next(true)} style={{ background: 'transparent', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: 8, padding: '5px 12px', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>اعتماد يدوي</button>
        </div>
      )}
      {msg.text && (
        <div style={{ flexShrink: 0, padding: '8px 16px', fontSize: '.78rem', fontWeight: 600, color: '#fff', background: msg.kind === 'ok' ? '#047857' : msg.kind === 'warn' ? '#b45309' : '#b91c1c' }}>{msg.text}</div>
      )}
      {ready && <iframe key={frameKey} src={url} title="تقييم تجربة الراكب" style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />}
      {finished && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#fff' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#16a34a', display: 'grid', placeItems: 'center', fontSize: 32 }}>&#10003;</div>
          <b style={{ fontSize: '1.1rem' }}>اكتمل تقييم اليوم</b>
          <span style={{ fontSize: '.8rem', opacity: .7 }}>شكراً لك. لن يظهر التقييم مجدداً حتى الغد.</span>
        </div>
      )}
    </div>
  )
}

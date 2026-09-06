import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import QRCode from 'qrcode'
import { SHIFTS, currentShift, allowedShiftsNow, computeActiveUntil, formatTime } from '../utils/ratingShifts'

export default function EmployeeRatingPage() {
  const { profile } = useAuth()
  const [windowNumber, setWindowNumber] = useState(profile?.rating_window_number || '')
  const [shift, setShift] = useState(profile?.rating_shift || currentShift())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [now, setNow] = useState(new Date())

  // نحدّث الوقت كل دقيقة حتى تنعكس نهاية الوردية/فترة السماح بدون الحاجة لتحديث الصفحة
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const allowed = allowedShiftsNow(now)
  useEffect(() => {
    if (!allowed.includes(shift)) setShift(allowed[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed.join(',')])

  const activeUntil = profile?.rating_active_until ? new Date(profile.rating_active_until) : null
  const effectivelyActive = !!profile?.rating_active && (!activeUntil || activeUntil > now)
  const todayUTC = new Date().toISOString().slice(0, 10)
  const usedToday = profile?.rating_last_activated_date === todayUTC

  const ratingUrl = `${window.location.origin}/rate/${profile?.rating_token}`

  useEffect(() => {
    if (!profile?.rating_token) return
    QRCode.toDataURL(ratingUrl, { width: 320, margin: 1 }).then(setQrDataUrl)
  }, [profile?.rating_token])

  async function activate() {
    if (!windowNumber.trim()) return
    if (!allowed.includes(shift)) { setErrMsg('هذي الوردية غير متاحة بالوقت الحالي'); return }
    if (usedToday && !effectivelyActive) { setErrMsg('استخدمت تفعيلك لهذا اليوم — تواصل مع الإدمن لإعادة التفعيل'); return }
    setErrMsg('')
    setSaving(true)
    const until = computeActiveUntil(shift, new Date())
    const { error } = await supabase.from('users').update({
      rating_window_number: windowNumber.trim(),
      rating_shift: shift,
      rating_active: true,
      rating_active_until: until ? until.toISOString() : null,
    }).eq('id', profile.id)
    setSaving(false)
    if (error) {
      setErrMsg(error.message?.includes('RATING_ALREADY_ACTIVATED_TODAY')
        ? 'استخدمت تفعيلك لهذا اليوم — تواصل مع الإدمن لإعادة التفعيل'
        : 'تعذّر الحفظ، حاول مرة أخرى')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function printCard() {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
      <title>بطاقة تقييم العميل</title>
      <style>
        body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
        .card { border: 2px solid #1C2B4A; border-radius: 16px; padding: 32px; text-align:center; width: 340px; }
        h2 { color:#1C2B4A; margin: 0 0 4px; }
        p { color:#555; margin: 0 0 16px; font-size: 14px; }
        img { width: 240px; height: 240px; }
      </style></head><body>
      <div class="card">
        <h2>${profile.full_name_ar}</h2>
        <p>${profile.station?.name_ar || ''}</p>
        <img src="${qrDataUrl}" />
        <p style="margin-top:16px">امسح الرمز لتقييم الخدمة</p>
      </div>
      <script>window.print()</script>
    </body></html>`)
    w.document.close()
  }

  if (!profile?.can_rate_customers) {
    return <div className="p-8 text-center text-gray-400">هذي الصفحة غير متاحة لحسابك</div>
  }

  return (
    <div className="max-w-lg mx-auto p-6" dir="rtl">
      <h1 className="text-xl font-bold text-gray-800 mb-1">تقييم العميل</h1>
      <p className="text-sm text-gray-500 mb-6">حدّد رقم شباكك ووردية عملك الحالية، وقدّم رمز QR للعميل ليقيّم خدمتك</p>

      <div className={`rounded-xl border px-4 py-3 mb-4 text-sm font-semibold flex items-center gap-2 ${effectivelyActive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
        <span className={`w-2 h-2 rounded-full ${effectivelyActive ? 'bg-green-500' : 'bg-amber-500'}`} />
        {effectivelyActive
          ? `الرمز مفعّل حالياً${activeUntil ? ` — ينتهي تلقائياً الساعة ${formatTime(activeUntil)}` : ''}`
          : (profile?.rating_active ? 'انتهى التفعيل تلقائياً بانتهاء الوردية' : 'الرمز غير مفعّل — فعّله لتبدأ استقبال التقييمات')}
      </div>

      <div className="bg-white rounded-2xl shadow border border-gray-200 p-5 space-y-4 mb-6">
        <div>
          <label className="block text-xs text-gray-500 mb-1">رقم الشباك</label>
          <input value={windowNumber} onChange={e => setWindowNumber(e.target.value)} dir="ltr"
            placeholder="مثال: 3"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">الوردية</label>
          <div className="grid grid-cols-3 gap-2">
            {SHIFTS.map(s => {
              const isAllowed = allowed.includes(s.value)
              return (
                <button key={s.value} type="button" disabled={!isAllowed}
                  onClick={() => setShift(s.value)}
                  title={isAllowed ? '' : 'غير متاحة بالوقت الحالي'}
                  className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${shift === s.value ? 'bg-nwbus-primary text-white border-nwbus-primary' : isAllowed ? 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'}`}>
                  {s.ar}
                  <span className="block text-[10px] font-normal opacity-80 mt-0.5">{s.range}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">تقدر تختار وردية عملك الحالية فقط (مع سماح ساعتين قبل بدايتها وبعد نهايتها)</p>
        </div>
        {errMsg && <p className="text-xs text-red-600 font-semibold">{errMsg}</p>}
        <button onClick={activate} disabled={saving || !windowNumber.trim()}
          className="w-full bg-nwbus-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? 'جارٍ الحفظ…' : saved ? '✓ تم الحفظ' : 'تفعيل'}
        </button>
      </div>

      {qrDataUrl && (
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-5 text-center">
          <p className="text-sm font-semibold text-gray-700 mb-3">رمز التقييم الخاص بك</p>
          <img src={qrDataUrl} alt="QR" className="mx-auto w-56 h-56" />
          <p className="text-xs text-gray-400 mt-3">هذا الرمز ثابت لك دائماً — قدّمه للعميل ليقيّم خدمتك</p>
          <button onClick={printCard}
            className="mt-4 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-50">
            طباعة البطاقة
          </button>
        </div>
      )}
    </div>
  )
}

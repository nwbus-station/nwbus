import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import QRCode from 'qrcode'

const SHIFTS = [
  { value: 'A', ar: 'الوردية أ', range: '00:00 - 08:00' },
  { value: 'B', ar: 'الوردية ب', range: '08:00 - 16:00' },
  { value: 'C', ar: 'الوردية ج', range: '16:00 - 23:59' },
]

function currentShift() {
  const h = new Date().getHours()
  if (h < 8) return 'A'
  if (h < 16) return 'B'
  return 'C'
}

export default function EmployeeRatingPage() {
  const { profile } = useAuth()
  const [windowNumber, setWindowNumber] = useState(profile?.rating_window_number || '')
  const [shift, setShift] = useState(profile?.rating_shift || currentShift())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const ratingUrl = `${window.location.origin}/rate/${profile?.rating_token}`

  useEffect(() => {
    if (!profile?.rating_token) return
    QRCode.toDataURL(ratingUrl, { width: 320, margin: 1 }).then(setQrDataUrl)
  }, [profile?.rating_token])

  async function activate() {
    if (!windowNumber.trim()) return
    setSaving(true)
    await supabase.from('users').update({
      rating_window_number: windowNumber.trim(),
      rating_shift: shift,
    }).eq('id', profile.id)
    setSaving(false)
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
        <p>${profile.station?.name_ar || ''} ${windowNumber ? '· شباك ' + windowNumber : ''}</p>
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
            {SHIFTS.map(s => (
              <button key={s.value} type="button" onClick={() => setShift(s.value)}
                className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${shift === s.value ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {s.ar}
                <span className="block text-[10px] font-normal opacity-80 mt-0.5">{s.range}</span>
              </button>
            ))}
          </div>
        </div>
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

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { matchesSearch } from '../utils/digits'

// نغمة نداء المطار (دينغ-دونغ تنازلي) — مُولّدة بالكامل بالمتصفح (Web Audio)، بدون ملف صوتي خارجي
function playChime() {
  return new Promise(resolve => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      const now = ctx.currentTime
      const notes = [988, 784, 659, 523] // Si-Sol-Mi-Do — نفس نمط نغمة النداء بالمطارات
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const start = now + i * 0.46
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.4, start + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.46)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.48)
      })
      setTimeout(() => { ctx.close(); resolve() }, notes.length * 460 + 250)
    } catch {
      resolve()
    }
  })
}

function pickArabicVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || []
  return voices.find(v => v.lang?.toLowerCase().startsWith('ar-sa')) || voices.find(v => v.lang?.toLowerCase().startsWith('ar'))
}

function speak(text) {
  return new Promise(resolve => {
    if (!window.speechSynthesis || !text.trim()) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ar-SA'
    u.rate = 0.9
    u.pitch = 1
    const voice = pickArabicVoice()
    if (voice) u.voice = voice
    u.onend = resolve
    u.onerror = resolve
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  })
}

const SUPPORTED = typeof window !== 'undefined' && !!window.speechSynthesis && !!(window.AudioContext || window.webkitAudioContext)

const REPEAT_OPTIONS = [
  { value: 0, ar: 'بدون تكرار' },
  { value: 120, ar: 'كل دقيقتين' },
  { value: 180, ar: 'كل 3 دقائق' },
  { value: 300, ar: 'كل 5 دقائق' },
]

function buildAnnouncement(trip, stop) {
  const line = trip.route ? ` – خط ${trip.route}` : ''
  return `نداء لركاب الرحلة رقم ${trip.trip_number}${line}، المتجهة إلى ${stop.name}. يُرجى التوجه إلى صالة الانتظار استعداداً لصعود الحافلة.`
}

export default function CallPage() {
  const [mode, setMode] = useState('trip') // 'trip' | 'free'
  const [trips, setTrips] = useState([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [tripQuery, setTripQuery] = useState('')
  const [selectedTripId, setSelectedTripId] = useState('')
  const [stops, setStops] = useState([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [selectedStopId, setSelectedStopId] = useState('')
  const [text, setText] = useState('')
  const [playing, setPlaying] = useState(false)
  const [repeatEvery, setRepeatEvery] = useState(0)
  const [repeating, setRepeating] = useState(false)
  const intervalRef = useRef(null)

  const selectedTrip = trips.find(t => t.id === selectedTripId)

  useEffect(() => {
    (async () => {
      setLoadingTrips(true)
      const { data } = await supabase
        .from('trip_schedule')
        .select('id, trip_number, trip_name, route, scheduled_departure, scheduled_arrival, from_station:from_station_id(id,name_ar), to_station:to_station_id(id,name_ar)')
        .eq('is_active', true)
        .order('trip_number')
      setTrips(data || [])
      setLoadingTrips(false)
    })()
    return () => stopRepeat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedTrip) { setStops([]); setSelectedStopId(''); return }
    (async () => {
      setLoadingStops(true)
      setSelectedStopId('')
      const { data } = await supabase
        .from('trip_schedule_stops')
        .select('station_id, stop_order, arrival_time, departure_time, status, station:station_id(id,name_ar)')
        .eq('trip_schedule_id', selectedTrip.id)
        .order('stop_order')
      const mid = (data || []).filter(s => s.station).map(s => ({
        id: s.station_id, name: s.station.name_ar, time: s.arrival_time || s.departure_time, rest: s.status === 'REST',
      }))
      const list = []
      if (selectedTrip.from_station) list.push({ id: selectedTrip.from_station.id, name: selectedTrip.from_station.name_ar, time: selectedTrip.scheduled_departure, kind: 'from' })
      list.push(...mid)
      if (selectedTrip.to_station) list.push({ id: selectedTrip.to_station.id, name: selectedTrip.to_station.name_ar, time: selectedTrip.scheduled_arrival, kind: 'to' })
      // إزالة تكرار متتابع لنفس المحطة
      const dedup = list.filter((s, i) => i === 0 || s.id !== list[i - 1].id)
      setStops(dedup)
      setLoadingStops(false)
    })()
  }, [selectedTripId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTrip) return
    const stop = stops.find(s => s.id === selectedStopId)
    if (stop) setText(buildAnnouncement(selectedTrip, stop))
  }, [selectedStopId, selectedTrip, stops])

  const stopRepeat = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRepeating(false)
    window.speechSynthesis?.cancel()
    setPlaying(false)
  }, [])

  const doCall = useCallback(async (t) => {
    if (!t?.trim()) return
    setPlaying(true)
    await playChime()
    await speak(t)
    setPlaying(false)
  }, [])

  async function onCallClick() {
    if (playing) return
    if (repeatEvery > 0) {
      setRepeating(true)
      await doCall(text)
      intervalRef.current = setInterval(() => doCall(text), repeatEvery * 1000)
    } else {
      await doCall(text)
    }
  }

  const filteredTrips = !tripQuery.trim() ? trips : trips.filter(t =>
    matchesSearch(t.trip_number, tripQuery) || matchesSearch(t.route, tripQuery) ||
    matchesSearch(t.from_station?.name_ar, tripQuery) || matchesSearch(t.to_station?.name_ar, tripQuery)
  )

  return (
    <div className="max-w-3xl mx-auto p-6" dir="rtl">
      <h1 className="text-xl font-bold text-gray-800 mb-1">نداء الركاب</h1>
      <p className="text-sm text-gray-500 mb-5">نداء صوتي بنغمة مطار لركاب رحلة معينة أو نص حر — يظهر حالياً للأدمن فقط</p>

      {!SUPPORTED && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl p-4 mb-5">
          المتصفح الحالي ما يدعم تحويل النص لصوت. جرّب على كروم أو سفاري بأحدث إصدار.
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {[{ id: 'trip', label: 'نداء حسب الرحلة' }, { id: 'free', label: 'نص حر' }].map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); stopRepeat() }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${mode === m.id ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'trip' && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">الرحلة</label>
          <input value={tripQuery} onChange={e => setTripQuery(e.target.value)}
            placeholder="ابحث برقم الرحلة أو الخط أو المحطة..."
            className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
          {loadingTrips ? (
            <p className="text-sm text-gray-400 py-4 text-center">جاري التحميل...</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {filteredTrips.map(t => (
                <button key={t.id} type="button" onClick={() => setSelectedTripId(t.id)}
                  className={`block w-full text-right px-3 py-2 text-sm hover:bg-gray-50 ${selectedTripId === t.id ? 'bg-nwbus-primary/5 font-semibold text-nwbus-primary' : 'text-gray-700'}`}>
                  رحلة {t.trip_number}{t.route ? ` – خط ${t.route}` : ''}
                  <span className="text-gray-400 font-normal"> · {t.from_station?.name_ar || '—'} ← {t.to_station?.name_ar || '—'}</span>
                </button>
              ))}
              {filteredTrips.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا يوجد نتائج</p>}
            </div>
          )}

          {selectedTrip && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">نقطة التوقف المطلوب النداء لها</label>
              {loadingStops ? (
                <p className="text-sm text-gray-400 py-3 text-center">جاري التحميل...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stops.map(s => (
                    <button key={s.id} type="button" onClick={() => setSelectedStopId(s.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedStopId === s.id ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                      {s.name}{s.rest ? ' (استراحة)' : ''}
                    </button>
                  ))}
                  {stops.length === 0 && <p className="text-sm text-gray-400">لا توجد نقاط توقف مسجّلة لهذه الرحلة</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">نص النداء</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder={mode === 'free' ? 'اكتب نص النداء هنا...' : 'اختر رحلة ونقطة توقف ليتم تعبئة النص تلقائياً، وتقدر تعدّله'}
          className="w-full border rounded-lg px-3 py-2 text-sm" />

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <label className="text-xs text-gray-500">تكرار النداء:</label>
          <select value={repeatEvery} onChange={e => setRepeatEvery(Number(e.target.value))}
            disabled={repeating} className="border rounded-lg px-2 py-1.5 text-sm">
            {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.ar}</option>)}
          </select>
        </div>

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCallClick} disabled={!SUPPORTED || !text.trim() || playing || repeating}
            className="flex-1 bg-nwbus-primary text-white rounded-lg py-2.5 text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity">
            {repeating ? 'جارٍ النداء المتكرر...' : playing ? 'جارٍ النداء...' : 'نداء'}
          </button>
          {(playing || repeating) && (
            <button type="button" onClick={stopRepeat}
              className="px-5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100">
              إيقاف
            </button>
          )}
          <button type="button" onClick={() => playChime()} disabled={!SUPPORTED}
            className="px-4 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-40">
            تجربة النغمة
          </button>
        </div>
      </div>
    </div>
  )
}

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

function listArabicVoices() {
  return (window.speechSynthesis?.getVoices?.() || []).filter(v => v.lang?.toLowerCase().startsWith('ar'))
}

// ترتيب الأصوات المتاحة من الأقرب لصوت بشري طبيعي — المتصفح/الجهاز هو اللي يحدد جودتها فعلياً،
// هذا بس تفضيل أفضل المتاح (أصوات Google/Online عادة طبيعية أكثر من الأصوات المحلية الأساسية)
function rankVoice(v) {
  const n = v.name.toLowerCase()
  if (n.includes('google')) return 4
  if (n.includes('online') || n.includes('natural') || n.includes('neural')) return 3
  if (v.lang?.toLowerCase() === 'ar-sa') return 2
  return 1
}

function speak(text, voice) {
  return new Promise(resolve => {
    if (!window.speechSynthesis || !text.trim()) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang || 'ar-SA'
    u.rate = 0.88
    u.pitch = 1
    if (voice) u.voice = voice
    u.onend = resolve
    u.onerror = resolve
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  })
}

const ELEVENLABS_VOICE_ID = '__elevenlabs__'

// صوت بشري واقعي عبر Edge Function (ElevenLabs) — المفتاح بالخادم فقط، ما يوصل للمتصفح
async function speakElevenLabs(text) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('لا توجد جلسة دخول')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/swift-responder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'تعذّر توليد الصوت')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  try {
    const audio = new Audio(url)
    await new Promise((resolve, reject) => {
      audio.onended = resolve
      audio.onerror = () => reject(new Error('تعذّر تشغيل الصوت'))
      audio.play().catch(reject)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

const CHIME_SUPPORTED = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
const BROWSER_TTS_SUPPORTED = typeof window !== 'undefined' && !!window.speechSynthesis
const SUPPORTED = CHIME_SUPPORTED && BROWSER_TTS_SUPPORTED

const REPEAT_OPTIONS = [
  { value: 0, ar: 'بدون تكرار' },
  { value: 120, ar: 'كل دقيقتين' },
  { value: 180, ar: 'كل 3 دقائق' },
  { value: 300, ar: 'كل 5 دقائق' },
]

function buildAnnouncement(destName, viaNames) {
  const via = viaNames.length ? ` مروراً بـ ${viaNames.join('، ')}` : ''
  return `نداء على الركاب المسافرين إلى ${destName}${via}.`
}

export default function CallPage() {
  const [mode, setMode] = useState('trip') // 'trip' | 'free'
  const [trips, setTrips] = useState([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [tripQuery, setTripQuery] = useState('')
  const [selectedTripId, setSelectedTripId] = useState('')
  const [stops, setStops] = useState([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [stopOff, setStopOff] = useState({}) // {stopId: true} = مستبعدة من النداء — نفس أسلوب اختيار المحطات بنافذة الرحلة الإضافية (RF)
  const [text, setText] = useState('')
  const [playing, setPlaying] = useState(false)
  const [repeatEvery, setRepeatEvery] = useState(0)
  const [repeating, setRepeating] = useState(false)
  const [chimeOn, setChimeOn] = useState(true)
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState(ELEVENLABS_VOICE_ID)
  const [callError, setCallError] = useState('')
  const intervalRef = useRef(null)

  const selectedTrip = trips.find(t => t.id === selectedTripId)
  const checkedStops = stops.filter(s => !stopOff[s.id])
  const destStop = checkedStops.length ? checkedStops[checkedStops.length - 1] : null
  const destIndex = destStop ? stops.findIndex(s => s.id === destStop.id) : -1
  const viaChosen = destIndex > 0 ? stops.slice(1, destIndex).filter(s => !stopOff[s.id]) : []
  const selectedVoice = voices.find(v => v.voiceURI === voiceURI) || null

  useEffect(() => {
    function loadVoices() {
      const list = listArabicVoices()
      if (!list.length) return
      setVoices(list)
      setVoiceURI(prev => prev || [...list].sort((a, b) => rankVoice(b) - rankVoice(a))[0].voiceURI)
    }
    loadVoices()
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices)
  }, [])

  useEffect(() => {
    (async () => {
      setLoadingTrips(true)
      const { data } = await supabase
        .from('trip_schedule')
        .select('id, trip_number, trip_name, route, scheduled_departure, scheduled_arrival, from_station:from_station_id(id,name_ar), to_station:to_station_id(id,name_ar)')
        .eq('is_active', true)
        .or('is_rf.is.null,is_rf.eq.false')
        .order('scheduled_departure')
      setTrips(data || [])
      setLoadingTrips(false)
    })()
    return () => stopRepeat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedTrip) { setStops([]); setStopOff({}); return }
    (async () => {
      setLoadingStops(true)
      setStopOff({})
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
    if (mode !== 'trip' || !destStop) return
    setText(buildAnnouncement(destStop.name, viaChosen.map(s => s.name)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destStop, stopOff, stops, mode])

  const stopRepeat = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRepeating(false)
    window.speechSynthesis?.cancel()
    setPlaying(false)
  }, [])

  const doCall = useCallback(async (t) => {
    if (!t?.trim()) return
    setPlaying(true)
    setCallError('')
    try {
      if (chimeOn) await playChime()
      if (voiceURI === ELEVENLABS_VOICE_ID) await speakElevenLabs(t)
      else await speak(t, selectedVoice)
    } catch (err) {
      setCallError(err.message || 'تعذّر تشغيل النداء')
      stopRepeat()
    }
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chimeOn, selectedVoice, voiceURI])

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
      <p className="text-sm text-gray-500 mb-5">نداء صوتي لركاب رحلة معينة أو نص حر — يظهر حالياً للأدمن فقط</p>

      {voiceURI !== ELEVENLABS_VOICE_ID && !SUPPORTED && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl p-4 mb-5">
          المتصفح الحالي ما يدعم تحويل النص لصوت. جرّب على كروم أو سفاري بأحدث إصدار، أو استخدم صوت ElevenLabs من القائمة.
        </div>
      )}
      {callError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-4 mb-5">
          {callError}
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-500">المحطات والتوقفات (آخر محطة مفعّلة هي الوجهة المُعلن عنها)</label>
                <div className="flex gap-2 text-[11px]">
                  <button type="button" onClick={() => setStopOff({})} className="text-nwbus-primary hover:underline">الكل</button>
                  <button type="button" onClick={() => setStopOff(Object.fromEntries(stops.map(s => [s.id, true])))} className="text-gray-400 hover:underline">لا شيء</button>
                </div>
              </div>
              {loadingStops ? (
                <p className="text-sm text-gray-400 py-3 text-center">جاري التحميل...</p>
              ) : (
                <div className="border rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {stops.map((s, i) => (
                    <label key={s.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${!stopOff[s.id] ? 'bg-nwbus-primary/5' : ''}`}>
                      <input type="checkbox" className="accent-nwbus-primary" checked={!stopOff[s.id]}
                        onChange={() => setStopOff(p => ({ ...p, [s.id]: !p[s.id] }))} />
                      <span className="flex-1 text-sm text-gray-700">
                        {s.name}{s.rest ? ' (استراحة)' : ''}
                        {i === 0 && <span className="text-[10px] text-green-600 ms-2">المنشأ</span>}
                        {s.id === destStop?.id && <span className="text-[10px] text-blue-600 ms-2">الوجهة</span>}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{s.time ? s.time.slice(0, 5) : ''}</span>
                    </label>
                  ))}
                  {stops.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">لا توجد نقاط توقف مسجّلة لهذه الرحلة</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">نص النداء</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder={mode === 'free' ? 'اكتب نص النداء هنا...' : 'اختر رحلة ووجهة ليتم تعبئة النص تلقائياً، وتقدر تعدّله'}
          className="w-full border rounded-lg px-3 py-2 text-sm" />

        <div className="flex flex-wrap items-center gap-4 mt-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" className="accent-nwbus-primary" checked={chimeOn} onChange={e => setChimeOn(e.target.checked)} />
            نغمة قبل النداء
          </label>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">تكرار النداء:</label>
            <select value={repeatEvery} onChange={e => setRepeatEvery(Number(e.target.value))}
              disabled={repeating} className="border rounded-lg px-2 py-1.5 text-sm">
              {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.ar}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3">
          <label className="text-xs text-gray-500 shrink-0">صوت النداء:</label>
          <select value={voiceURI} onChange={e => { setVoiceURI(e.target.value); setCallError('') }}
            className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0">
            <option value={ELEVENLABS_VOICE_ID}>صوت بشري واقعي (ElevenLabs)</option>
            {[...voices].sort((a, b) => rankVoice(b) - rankVoice(a)).map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} (صوت الجهاز)</option>
            ))}
          </select>
          <button type="button"
            onClick={async () => {
              setCallError('')
              try {
                if (voiceURI === ELEVENLABS_VOICE_ID) await speakElevenLabs('هذا تجربة لصوت النداء')
                else await speak('هذا تجربة لصوت النداء', selectedVoice)
              } catch (err) { setCallError(err.message || 'تعذّر تشغيل الصوت') }
            }}
            disabled={voiceURI !== ELEVENLABS_VOICE_ID && !BROWSER_TTS_SUPPORTED}
            className="px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs hover:bg-gray-100 shrink-0 disabled:opacity-40">
            تجربة
          </button>
        </div>
        {voices.length === 0 && BROWSER_TTS_SUPPORTED && (
          <p className="text-[11px] text-gray-400 mt-2">
            ما وجدنا صوت عربي إضافي مثبّت بهذا الجهاز — استخدم صوت ElevenLabs، أو ثبّت صوت عربي من إعدادات الجهاز.
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCallClick}
            disabled={!text.trim() || playing || repeating || (chimeOn && !CHIME_SUPPORTED) || (voiceURI !== ELEVENLABS_VOICE_ID && !BROWSER_TTS_SUPPORTED)}
            className="flex-1 bg-nwbus-primary text-white rounded-lg py-2.5 text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity">
            {repeating ? 'جارٍ النداء المتكرر...' : playing ? 'جارٍ النداء...' : 'نداء'}
          </button>
          {(playing || repeating) && (
            <button type="button" onClick={stopRepeat}
              className="px-5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100">
              إيقاف
            </button>
          )}
          {chimeOn && (
            <button type="button" onClick={() => playChime()} disabled={!CHIME_SUPPORTED}
              className="px-4 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-40">
              تجربة النغمة
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

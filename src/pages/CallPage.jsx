import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { matchesSearch } from '../utils/digits'

// نغمة نداء المطار (دينغ-دونغ تنازلي) — مُولّدة بالكامل بالمتصفح (Web Audio)، بدون ملف صوتي خارجي
// controller اختياري: يخزّن AudioContext الحالي عشان زر "إيقاف" يقدر يسكّته فوراً
function playChime(controller) {
  return new Promise(resolve => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      if (controller) controller.ctx = ctx
      if (controller?.stopped) { ctx.close().catch(() => {}); return resolve() }
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
      setTimeout(() => { try { ctx.close() } catch { /* already closed by stop */ } resolve() }, notes.length * 460 + 250)
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

// controller اختياري: {stopped, audio} — إيقاف فوري بالضغط على "إيقاف"
function speak(text, voice, controller) {
  return new Promise(resolve => {
    if (!window.speechSynthesis || !text.trim() || controller?.stopped) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang || 'ar-SA'
    u.rate = 0.88
    u.pitch = 1
    if (voice) u.voice = voice
    u.onend = resolve
    u.onerror = resolve
    if (controller) controller.cancelSpeech = () => window.speechSynthesis.cancel()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  })
}

const ELEVENLABS_VOICE_ID = '__elevenlabs__'
const CLIPS_VOICE_ID = '__clips__'
const AUDIO_BUCKET = 'audio-clips'

function clipUrl(path) {
  return supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl
}

// توليد مقطع صوت وحفظه مباشرة بمكتبة النداء (بدل تنزيله ورفعه يدوياً) — نفس الـEdge Function بوضع الحفظ
async function generateClip(text, savePath, isAr) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(isAr ? 'لا توجد جلسة دخول' : 'No active session')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/swift-responder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text, savePath }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || (isAr ? 'تعذّر توليد المقطع' : 'Failed to generate the clip'))
  return body.url
}

// صوت بشري واقعي عبر Edge Function (ElevenLabs) — المفتاح بالخادم فقط، ما يوصل للمتصفح
async function speakElevenLabs(text, controller, isAr) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(isAr ? 'لا توجد جلسة دخول' : 'No active session')
  if (controller?.stopped) return
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
    throw new Error(body.error || (isAr ? 'تعذّر توليد الصوت' : 'Failed to generate the audio'))
  }
  if (controller?.stopped) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  try {
    await playAudioUrl(url, controller, isAr)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// تشغيل رابط صوت وحيد مع دعم الإيقاف الفوري عبر controller.audio + controller.stopped
function playAudioUrl(url, controller, isAr) {
  return new Promise((resolve, reject) => {
    if (controller?.stopped) return resolve()
    const audio = new Audio(url)
    if (controller) controller.audio = audio
    audio.onended = resolve
    audio.onpause = resolve // زر "إيقاف" يستدعي audio.pause() فيتحرر الانتظار فوراً
    audio.onerror = () => reject(new Error(isAr ? 'تعذّر تشغيل الصوت' : 'Failed to play the audio'))
    audio.play().catch(reject)
  })
}

// تشغيل سلسلة مقاطع صوتية جاهزة (مسجّلة/مولّدة مسبقاً) وحدة ورا وحدة — نفس أسلوب المطارات
async function playClipSequence(urls, controller, isAr) {
  for (const url of urls) {
    if (controller?.stopped) return
    await playAudioUrl(url, controller, isAr)
  }
}

const CHIME_SUPPORTED = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
const BROWSER_TTS_SUPPORTED = typeof window !== 'undefined' && !!window.speechSynthesis

const REPEAT_OPTIONS = [
  { value: 0, ar: 'بدون تكرار', en: 'No repeat' },
  { value: 120, ar: 'كل دقيقتين', en: 'Every 2 minutes' },
  { value: 180, ar: 'كل 3 دقائق', en: 'Every 3 minutes' },
  { value: 300, ar: 'كل 5 دقائق', en: 'Every 5 minutes' },
]

function buildAnnouncement(destName, viaNames) {
  const via = viaNames.length ? ` مروراً بـ ${viaNames.join('، ')}` : ''
  return `نداء على الركاب المسافرين إلى ${destName}${via}.`
}

export default function CallPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
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
  const [voiceURI, setVoiceURI] = useState(CLIPS_VOICE_ID)
  const [callError, setCallError] = useState('')
  const intervalRef = useRef(null)
  const controllerRef = useRef(null)

  // مكتبة المقاطع الصوتية الجاهزة
  const [showClipsLibrary, setShowClipsLibrary] = useState(false)
  const [clipsIndex, setClipsIndex] = useState(new Set())
  const [phraseClips, setPhraseClips] = useState({ intro: false, via: false })
  const [allStations, setAllStations] = useState([])
  const [stationSearch, setStationSearch] = useState('')
  const [uploadingId, setUploadingId] = useState('')
  const [bulkProgress, setBulkProgress] = useState(null) // { done, total } | null

  const selectedTrip = trips.find(t => t.id === selectedTripId)
  const checkedStops = stops.filter(s => !stopOff[s.id])
  const destStop = checkedStops.length ? checkedStops[checkedStops.length - 1] : null
  const destIndex = destStop ? stops.findIndex(s => s.id === destStop.id) : -1
  const viaChosen = destIndex > 0 ? stops.slice(1, destIndex).filter(s => !stopOff[s.id]) : []
  const selectedVoice = voices.find(v => v.voiceURI === voiceURI) || null

  const refreshClipsIndex = useCallback(async () => {
    const [{ data: stationFiles }, { data: phraseFiles }] = await Promise.all([
      supabase.storage.from(AUDIO_BUCKET).list('stations', { limit: 1000 }),
      supabase.storage.from(AUDIO_BUCKET).list('phrases', { limit: 10 }),
    ])
    setClipsIndex(new Set((stationFiles || []).map(f => f.name.replace(/\.mp3$/, ''))))
    const names = new Set((phraseFiles || []).map(f => f.name))
    setPhraseClips({ intro: names.has('intro.mp3'), via: names.has('via.mp3') })
  }, [])

  useEffect(() => { refreshClipsIndex() }, [refreshClipsIndex])

  useEffect(() => {
    if (!showClipsLibrary || allStations.length) return
    (async () => {
      const { data } = await supabase.from('stations').select('id,name_ar').order('name_ar')
      setAllStations(data || [])
    })()
  }, [showClipsLibrary]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadPhraseClip(kind, file) {
    setUploadingId(kind); setCallError('')
    try {
      const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(`phrases/${kind}.mp3`, file, { upsert: true, contentType: file.type || 'audio/mpeg' })
      if (error) throw error
      await refreshClipsIndex()
    } catch (err) { setCallError(err.message || (isAr ? 'تعذّر رفع المقطع' : 'Failed to upload the clip')) }
    setUploadingId('')
  }

  async function uploadStationClip(stationId, file) {
    setUploadingId(stationId); setCallError('')
    try {
      const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(`stations/${stationId}.mp3`, file, { upsert: true, contentType: file.type || 'audio/mpeg' })
      if (error) throw error
      await refreshClipsIndex()
    } catch (err) { setCallError(err.message || (isAr ? 'تعذّر رفع المقطع' : 'Failed to upload the clip')) }
    setUploadingId('')
  }

  async function generatePhraseClip(kind, text) {
    setUploadingId(kind); setCallError('')
    try {
      await generateClip(text, `phrases/${kind}.mp3`, isAr)
      await refreshClipsIndex()
    } catch (err) { setCallError(err.message || (isAr ? 'تعذّر توليد المقطع' : 'Failed to generate the clip')) }
    setUploadingId('')
  }

  async function generateStationClip(station) {
    setUploadingId(station.id); setCallError('')
    try {
      await generateClip(station.name_ar, `stations/${station.id}.mp3`, isAr)
      await refreshClipsIndex()
    } catch (err) { setCallError(err.message || (isAr ? 'تعذّر توليد المقطع' : 'Failed to generate the clip')) }
    setUploadingId('')
  }

  async function generateAllMissing() {
    const missing = allStations.filter(s => !clipsIndex.has(s.id))
    if (!missing.length) return
    setCallError('')
    setBulkProgress({ done: 0, total: missing.length })
    for (let i = 0; i < missing.length; i++) {
      try {
        await generateClip(missing[i].name_ar, `stations/${missing[i].id}.mp3`, isAr)
        setClipsIndex(prev => new Set(prev).add(missing[i].id))
      } catch (err) {
        setCallError(isAr ? `توقف التوليد عند "${missing[i].name_ar}": ${err.message}` : `Generation stopped at "${missing[i].name_ar}": ${err.message}`)
        break
      }
      setBulkProgress({ done: i + 1, total: missing.length })
      await new Promise(r => setTimeout(r, 350)) // تجنّب تجاوز حد الطلبات بـElevenLabs
    }
    setBulkProgress(null)
  }

  useEffect(() => {
    function loadVoices() {
      const list = listArabicVoices()
      if (!list.length) return
      setVoices(list)
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
    if (controllerRef.current) {
      controllerRef.current.stopped = true
      controllerRef.current.audio?.pause()
      controllerRef.current.ctx?.close?.().catch(() => {})
      controllerRef.current.cancelSpeech?.()
    }
    window.speechSynthesis?.cancel()
    setPlaying(false)
  }, [])

  const doCall = useCallback(async (t) => {
    if (voiceURI !== CLIPS_VOICE_ID && !t?.trim()) return
    const controller = { stopped: false, audio: null, ctx: null }
    controllerRef.current = controller
    setPlaying(true)
    setCallError('')
    try {
      if (chimeOn) await playChime(controller)
      if (controller.stopped) { setPlaying(false); return }
      if (voiceURI === CLIPS_VOICE_ID) {
        if (mode !== 'trip' || !destStop) throw new Error(isAr ? 'وضع المقاطع الجاهزة يحتاج اختيار رحلة ووجهة أول' : 'Ready-made clips mode requires selecting a trip and destination first')
        const missing = []
        if (!phraseClips.intro) missing.push(isAr ? 'عبارة المقدمة' : 'the intro phrase')
        if (!clipsIndex.has(destStop.id)) missing.push(destStop.name)
        if (viaChosen.length && !phraseClips.via) missing.push(isAr ? 'عبارة "مروراً بـ"' : 'the "via" phrase')
        viaChosen.forEach(s => { if (!clipsIndex.has(s.id)) missing.push(s.name) })
        if (missing.length) throw new Error(isAr ? `ناقص مقاطع صوت: ${missing.join('، ')} — ارفعها من مكتبة المقاطع بالأسفل` : `Missing audio clips: ${missing.join(', ')} — upload them from the clips library below`)
        const urls = [clipUrl('phrases/intro.mp3'), clipUrl(`stations/${destStop.id}.mp3`)]
        if (viaChosen.length) {
          urls.push(clipUrl('phrases/via.mp3'))
          viaChosen.forEach(s => urls.push(clipUrl(`stations/${s.id}.mp3`)))
        }
        await playClipSequence(urls, controller, isAr)
      } else if (voiceURI === ELEVENLABS_VOICE_ID) {
        await speakElevenLabs(t, controller, isAr)
      } else {
        await speak(t, selectedVoice, controller)
      }
    } catch (err) {
      setCallError(err.message || (isAr ? 'تعذّر تشغيل النداء' : 'Failed to play the announcement'))
      stopRepeat()
    }
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chimeOn, selectedVoice, voiceURI, mode, destStop, viaChosen, clipsIndex, phraseClips, isAr])

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

  const needsBrowserTts = voiceURI !== ELEVENLABS_VOICE_ID && voiceURI !== CLIPS_VOICE_ID

  return (
    <div className="max-w-3xl mx-auto p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-gray-800 mb-1">{isAr ? 'نداء الركاب' : 'Passenger Announcements'}</h1>
      <p className="text-sm text-gray-500 mb-5">{isAr ? 'نداء صوتي لركاب رحلة معينة أو نص حر — يظهر حالياً للأدمن فقط' : 'Voice announcement for the passengers of a specific trip, or free text — currently visible to admins only'}</p>

      {needsBrowserTts && !BROWSER_TTS_SUPPORTED && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl p-4 mb-5">
          {isAr
            ? 'المتصفح الحالي ما يدعم تحويل النص لصوت. جرّب على كروم أو سفاري بأحدث إصدار، أو استخدم مقاطع جاهزة/ElevenLabs من القائمة.'
            : 'The current browser does not support text-to-speech. Try the latest Chrome or Safari, or use ready-made clips / ElevenLabs from the menu.'}
        </div>
      )}
      {callError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-4 mb-5">
          {callError}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {[{ id: 'trip', label: isAr ? 'نداء حسب الرحلة' : 'Announce by trip' }, { id: 'free', label: isAr ? 'نص حر' : 'Free text' }].map(m => (
          <button key={m.id} onClick={() => {
            setMode(m.id); stopRepeat()
            if (m.id === 'free' && voiceURI === CLIPS_VOICE_ID) setVoiceURI(ELEVENLABS_VOICE_ID)
          }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${mode === m.id ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'trip' && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">{isAr ? 'الرحلة' : 'Trip'}</label>
          <input value={tripQuery} onChange={e => setTripQuery(e.target.value)}
            placeholder={isAr ? 'ابحث برقم الرحلة أو الخط أو المحطة...' : 'Search by trip number, route or station...'}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
          {loadingTrips ? (
            <p className="text-sm text-gray-400 py-4 text-center">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {filteredTrips.map(t => (
                <button key={t.id} type="button" onClick={() => setSelectedTripId(t.id)}
                  className={`block w-full text-start px-3 py-2 text-sm hover:bg-gray-50 ${selectedTripId === t.id ? 'bg-nwbus-primary/5 font-semibold text-nwbus-primary' : 'text-gray-700'}`}>
                  {isAr ? 'رحلة' : 'Trip'} {t.trip_number}{t.route ? (isAr ? ` – خط ${t.route}` : ` – Route ${t.route}`) : ''}
                  <span className="text-gray-400 font-normal"> · {t.from_station?.name_ar || '—'} {isAr ? '←' : '→'} {t.to_station?.name_ar || '—'}</span>
                </button>
              ))}
              {filteredTrips.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">{isAr ? 'لا يوجد نتائج' : 'No results'}</p>}
            </div>
          )}

          {selectedTrip && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-500">{isAr ? 'المحطات والتوقفات (آخر محطة مفعّلة هي الوجهة المُعلن عنها)' : 'Stations and stops (the last enabled station is the announced destination)'}</label>
                <div className="flex gap-2 text-[11px]">
                  <button type="button" onClick={() => setStopOff({})} className="text-nwbus-primary hover:underline">{isAr ? 'الكل' : 'All'}</button>
                  <button type="button" onClick={() => setStopOff(Object.fromEntries(stops.map(s => [s.id, true])))} className="text-gray-400 hover:underline">{isAr ? 'لا شيء' : 'None'}</button>
                </div>
              </div>
              {loadingStops ? (
                <p className="text-sm text-gray-400 py-3 text-center">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
              ) : (
                <div className="border rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {stops.map((s, i) => (
                    <label key={s.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${!stopOff[s.id] ? 'bg-nwbus-primary/5' : ''}`}>
                      <input type="checkbox" className="accent-nwbus-primary" checked={!stopOff[s.id]}
                        onChange={() => setStopOff(p => ({ ...p, [s.id]: !p[s.id] }))} />
                      <span className="flex-1 text-sm text-gray-700">
                        {s.name}{s.rest ? (isAr ? ' (استراحة)' : ' (Rest stop)') : ''}
                        {i === 0 && <span className="text-[10px] text-green-600 ms-2">{isAr ? 'المنشأ' : 'Origin'}</span>}
                        {s.id === destStop?.id && <span className="text-[10px] text-blue-600 ms-2">{isAr ? 'الوجهة' : 'Destination'}</span>}
                        {voiceURI === CLIPS_VOICE_ID && (
                          <span className={`text-[10px] ms-2 ${clipsIndex.has(s.id) ? 'text-green-600' : 'text-amber-600'}`}>
                            {clipsIndex.has(s.id) ? (isAr ? '✓ صوت جاهز' : '✓ Audio ready') : (isAr ? '— بدون صوت' : '— No audio')}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{s.time ? s.time.slice(0, 5) : ''}</span>
                    </label>
                  ))}
                  {stops.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">{isAr ? 'لا توجد نقاط توقف مسجّلة لهذه الرحلة' : 'No stops are recorded for this trip'}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">{isAr ? 'نص النداء' : 'Announcement text'}</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder={mode === 'free'
            ? (isAr ? 'اكتب نص النداء هنا...' : 'Type the announcement text here...')
            : (isAr ? 'اختر رحلة ووجهة ليتم تعبئة النص تلقائياً، وتقدر تعدّله' : 'Select a trip and destination to auto-fill the text; you can edit it')}
          disabled={voiceURI === CLIPS_VOICE_ID}
          className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
        {voiceURI === CLIPS_VOICE_ID && (
          <p className="text-[11px] text-gray-400 mt-1">{isAr ? 'وضع المقاطع الجاهزة ما يستخدم هذا النص — يشغّل مقاطع المحطات المختارة فوق مباشرة.' : 'Ready-made clips mode does not use this text — it plays the clips of the stations selected above.'}</p>
        )}

        <div className="flex flex-wrap items-center gap-4 mt-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" className="accent-nwbus-primary" checked={chimeOn} onChange={e => setChimeOn(e.target.checked)} />
            {isAr ? 'نغمة قبل النداء' : 'Chime before announcement'}
          </label>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">{isAr ? 'تكرار النداء:' : 'Repeat announcement:'}</label>
            <select value={repeatEvery} onChange={e => setRepeatEvery(Number(e.target.value))}
              disabled={repeating} className="border rounded-lg px-2 py-1.5 text-sm">
              {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3">
          <label className="text-xs text-gray-500 shrink-0">{isAr ? 'صوت النداء:' : 'Announcement voice:'}</label>
          <select value={voiceURI} onChange={e => { setVoiceURI(e.target.value); setCallError('') }}
            className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0">
            {mode === 'trip' && <option value={CLIPS_VOICE_ID}>{isAr ? 'مقاطع مسجّلة جاهزة (الأفضل والأثبت)' : 'Ready-made recorded clips (best and most reliable)'}</option>}
            <option value={ELEVENLABS_VOICE_ID}>{isAr ? 'صوت بشري واقعي حي (ElevenLabs)' : 'Live realistic human voice (ElevenLabs)'}</option>
            {[...voices].sort((a, b) => rankVoice(b) - rankVoice(a)).map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} {isAr ? '(صوت الجهاز)' : '(device voice)'}</option>
            ))}
          </select>
          {voiceURI !== CLIPS_VOICE_ID && (
            <button type="button"
              onClick={async () => {
                setCallError('')
                try {
                  if (voiceURI === ELEVENLABS_VOICE_ID) await speakElevenLabs('هذا تجربة لصوت النداء', undefined, isAr)
                  else await speak('هذا تجربة لصوت النداء', selectedVoice)
                } catch (err) { setCallError(err.message || (isAr ? 'تعذّر تشغيل الصوت' : 'Failed to play the audio')) }
              }}
              disabled={needsBrowserTts && !BROWSER_TTS_SUPPORTED}
              className="px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs hover:bg-gray-100 shrink-0 disabled:opacity-40">
              {isAr ? 'تجربة' : 'Test'}
            </button>
          )}
        </div>
        {voices.length === 0 && BROWSER_TTS_SUPPORTED && (
          <p className="text-[11px] text-gray-400 mt-2">
            {isAr
              ? 'ما وجدنا صوت عربي إضافي مثبّت بهذا الجهاز — استخدم مقاطع جاهزة أو ElevenLabs، أو ثبّت صوت عربي من إعدادات الجهاز.'
              : 'No additional Arabic voice is installed on this device — use ready-made clips or ElevenLabs, or install an Arabic voice from the device settings.'}
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCallClick}
            disabled={(voiceURI !== CLIPS_VOICE_ID && !text.trim()) || playing || repeating || (chimeOn && !CHIME_SUPPORTED) || (needsBrowserTts && !BROWSER_TTS_SUPPORTED)}
            className="flex-1 bg-nwbus-primary text-white rounded-lg py-2.5 text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity">
            {repeating ? (isAr ? 'جارٍ النداء المتكرر...' : 'Repeating announcement...') : playing ? (isAr ? 'جارٍ النداء...' : 'Announcing...') : (isAr ? 'نداء' : 'Announce')}
          </button>
          {(playing || repeating) && (
            <button type="button" onClick={stopRepeat}
              className="px-5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100">
              {isAr ? 'إيقاف' : 'Stop'}
            </button>
          )}
          {chimeOn && (
            <button type="button" onClick={() => playChime()} disabled={!CHIME_SUPPORTED}
              className="px-4 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-40">
              {isAr ? 'تجربة النغمة' : 'Test chime'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <button type="button" onClick={() => setShowClipsLibrary(o => !o)} className="flex items-center justify-between w-full text-start">
          <span className="text-sm font-semibold text-gray-700">{isAr ? 'مكتبة المقاطع الصوتية الجاهزة' : 'Ready-made audio clips library'}</span>
          <span className="text-xs text-gray-400">{showClipsLibrary ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}</span>
        </button>
        {showClipsLibrary && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-gray-500">
              {isAr
                ? 'اضغط "توليد" يسوّي الصوت تلقائياً عبر ElevenLabs ويحفظه مباشرة (نفس صوت صفحة النداء) — أو ارفع ملف mp3 جاهز بنفسك لو تبي تستبدله بتسجيل يدوي. عبارتين ثابتتين + اسم كل محطة، مرة وحدة بس، وتُستخدم دايماً بنفس الجودة.'
                : 'Click "Generate" to create the audio automatically via ElevenLabs and save it directly (same voice as the announcement page) — or upload a ready-made mp3 file yourself to replace it with a manual recording. Two fixed phrases + each station name, once only, always used at the same quality.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'intro', label: isAr ? 'عبارة المقدمة' : 'Intro phrase', text: 'نداء على الركاب المسافرين إلى' },
                { key: 'via', label: isAr ? 'عبارة "مروراً بـ"' : '"Via" phrase', text: 'مروراً بـ' },
              ].map(p => (
                <div key={p.key} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-xs text-gray-600">{p.label} ("{p.text}")</span>
                    <span className={`text-[10px] shrink-0 ${phraseClips[p.key] ? 'text-green-600' : 'text-amber-600'}`}>
                      {phraseClips[p.key] ? (isAr ? '✓ مرفوع' : '✓ Uploaded') : (isAr ? 'غير مرفوع' : 'Not uploaded')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => generatePhraseClip(p.key, p.text)} disabled={uploadingId === p.key}
                      className="text-xs px-2.5 py-1 bg-nwbus-primary text-white rounded-lg disabled:opacity-40">
                      {uploadingId === p.key ? (isAr ? 'جارٍ...' : 'Working...') : (isAr ? 'توليد' : 'Generate')}
                    </button>
                    <input type="file" accept="audio/*" disabled={uploadingId === p.key}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhraseClip(p.key, f); e.target.value = '' }}
                      className="text-xs flex-1 min-w-0" />
                    {phraseClips[p.key] && (
                      <button type="button" onClick={() => new Audio(clipUrl(`phrases/${p.key}.mp3`)).play()}
                        className="text-xs text-nwbus-primary shrink-0">▶</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <input value={stationSearch} onChange={e => setStationSearch(e.target.value)} placeholder={isAr ? 'ابحث عن محطة...' : 'Search for a station...'}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={generateAllMissing} disabled={!!bulkProgress || allStations.length === 0}
                  className="text-xs px-3 py-2 bg-nwbus-primary text-white rounded-lg disabled:opacity-40 shrink-0 whitespace-nowrap">
                  {bulkProgress ? (isAr ? `جارٍ التوليد ${bulkProgress.done}/${bulkProgress.total}...` : `Generating ${bulkProgress.done}/${bulkProgress.total}...`) : (isAr ? 'توليد كل الناقص' : 'Generate all missing')}
                </button>
              </div>
              <div className="border rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {allStations.filter(s => matchesSearch(s.name_ar, stationSearch)).map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm text-gray-700 truncate">{s.name_ar}</span>
                    <span className={`text-[10px] shrink-0 ${clipsIndex.has(s.id) ? 'text-green-600' : 'text-gray-400'}`}>
                      {clipsIndex.has(s.id) ? '✓' : '—'}
                    </span>
                    {clipsIndex.has(s.id) && (
                      <button type="button" onClick={() => new Audio(clipUrl(`stations/${s.id}.mp3`)).play()}
                        className="text-xs text-nwbus-primary shrink-0">▶</button>
                    )}
                    <button type="button" onClick={() => generateStationClip(s)} disabled={uploadingId === s.id || !!bulkProgress}
                      className="text-xs px-2 py-1 bg-nwbus-primary text-white rounded-lg disabled:opacity-40 shrink-0">
                      {uploadingId === s.id ? '...' : (isAr ? 'توليد' : 'Generate')}
                    </button>
                    <input type="file" accept="audio/*" disabled={uploadingId === s.id}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadStationClip(s.id, f); e.target.value = '' }}
                      className="text-xs w-20 sm:w-28 shrink-0" />
                  </div>
                ))}
                {allStations.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

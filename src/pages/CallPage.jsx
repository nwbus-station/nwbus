import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { matchesSearch } from '../utils/digits'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import PageHeader from '../components/shared/PageHeader'
import Sheet, { useMedia } from '../components/dispatch/Sheet'
import { CALL_CSS } from '../components/calls/callStyles'
import TripPanel from '../components/calls/TripPanel'
import StopsPanel from '../components/calls/StopsPanel'
import AnnounceConsole from '../components/calls/AnnounceConsole'
import CallHistory from '../components/calls/CallHistory'
import ClipsLibrary from '../components/calls/ClipsLibrary'
import { VoiceSettingsCard, PronunciationEditor } from '../components/calls/VoiceTools'
import ScreenCallPicker, { loadScreenSel } from '../components/calls/ScreenCallPicker'

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
async function generateClip(text, savePath, isAr, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(isAr ? 'لا توجد جلسة دخول' : 'No active session')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/swift-responder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text, savePath, ...extra }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || (isAr ? 'تعذّر توليد المقطع' : 'Failed to generate the clip'))
  return body.url
}

// صوت بشري واقعي عبر Edge Function (ElevenLabs) — المفتاح بالخادم فقط، ما يوصل للمتصفح
async function speakElevenLabs(text, controller, isAr, extra = {}) {
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
    body: JSON.stringify({ text, ...extra }),
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
  const desk = useMedia('(min-width: 900px)')
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
  const [namesVersion, setNamesVersion] = useState(0)     // يتغيّر بعد تعديل أسماء المحطات لإعادة تحميل الرحلات والتوقفات
  const [nameDrafts, setNameDrafts] = useState({})        // { stationId: اسم عربي مقترح/معدّل }
  const [confirmRename, setConfirmRename] = useState(null) // { list: [{id,name}] }
  const [renaming, setRenaming] = useState('')
  const [history, setHistory] = useState([]) // سجل نداءات الجلسة (عرض فقط)
  const [pron, setPron] = useState({})                    // { stationId: نطق مشكَّل }
  const [screenSel, setScreenSel] = useState(loadScreenSel) // عرض النداء على شاشات المحطات
  const spoken = st => (pron[st.id] || st.name_ar)

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

  // قاموس النطق (قبل تشغيل SQL 035 يفشل الاستعلام بصمت ويبقى فارغاً)
  const loadPron = useCallback(async () => {
    const { data, error } = await supabase.from('call_pronunciations').select('station_id,spoken')
    if (!error) setPron(Object.fromEntries((data || []).map(r => [r.station_id, r.spoken])))
  }, [])
  useEffect(() => { loadPron() }, [loadPron])

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
      await generateClip(spoken(station), `stations/${station.id}.mp3`, isAr)
      await refreshClipsIndex()
    } catch (err) { setCallError(err.message || (isAr ? 'تعذّر توليد المقطع' : 'Failed to generate the clip')) }
    setUploadingId('')
  }

  // حفظ اسم عربي للمحطة (name_ar) ثم إعادة توليد مقطعها الصوتي إن كان موجوداً
  async function renameStations(list) {
    setCallError(''); setRenaming('bulk')
    const done = []
    for (const { id, name } of list) {
      const { error } = await supabase.from('stations').update({ name_ar: name }).eq('id', id)
      if (error) { setCallError((isAr ? 'تعذّر حفظ الاسم: ' : 'Could not save the name: ') + error.message); break }
      done.push({ id, name })
      if (clipsIndex.has(id)) { try { await generateClip(name, `stations/${id}.mp3`, isAr) } catch { /* يُعاد التوليد يدوياً */ } }
    }
    setAllStations(prev => prev.map(s => { const d = done.find(x => x.id === s.id); return d ? { ...s, name_ar: d.name } : s }))
    setNameDrafts(prev => { const n = { ...prev }; done.forEach(d => delete n[d.id]); return n })
    if (done.length) setNamesVersion(v => v + 1)
    setRenaming('')
  }

  // إعادة توليد كل المقاطع بالصوت المحفوظ (العبارتان + كل المحطات) بعد تغيير الصوت
  async function regenerateAll() {
    setCallError('')
    const list = allStations.length ? allStations : ((await supabase.from('stations').select('id,name_ar').order('name_ar')).data || [])
    if (!allStations.length) setAllStations(list)
    const jobs = [
      { path: 'phrases/intro.mp3', text: 'نداء على الركاب المسافرين إلى', label: 'المقدمة' },
      { path: 'phrases/via.mp3', text: 'مروراً بـ', label: 'مروراً بـ' },
      ...list.map(st => ({ path: `stations/${st.id}.mp3`, text: spoken(st), label: st.name_ar })),
    ]
    setBulkProgress({ done: 0, total: jobs.length })
    for (let i = 0; i < jobs.length; i++) {
      try { await generateClip(jobs[i].text, jobs[i].path, isAr) } catch (err) { setCallError(`توقف التوليد عند "${jobs[i].label}": ${err.message}`); break }
      setBulkProgress({ done: i + 1, total: jobs.length })
      await new Promise(r => setTimeout(r, 350))
    }
    setBulkProgress(null); await refreshClipsIndex()
  }

  // حفظ نطق محطة ثم توليد مقطعها بالنطق الجديد
  const [pronBusy, setPronBusy] = useState('')
  async function savePron(st, spokenText) {
    setPronBusy(st.id); setCallError('')
    const { error } = await supabase.rpc('call_pron_set', { p_station: st.id, p_spoken: spokenText })
    if (error) { setCallError('تعذّر حفظ النطق'); setPronBusy(''); return }
    setPron(p => { const n = { ...p }; if (spokenText) n[st.id] = spokenText; else delete n[st.id]; return n })
    try { await generateClip(spokenText || st.name_ar, `stations/${st.id}.mp3`, isAr); await refreshClipsIndex() } catch (err) { setCallError(err.message || 'تعذّر توليد المقطع') }
    setPronBusy('')
  }

  async function generateAllMissing() {
    const missing = allStations.filter(s => !clipsIndex.has(s.id))
    if (!missing.length) return
    setCallError('')
    setBulkProgress({ done: 0, total: missing.length })
    for (let i = 0; i < missing.length; i++) {
      try {
        await generateClip(spoken(missing[i]), `stations/${missing[i].id}.mp3`, isAr)
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
    if (!namesVersion) return
    ;(async () => {
      const { data } = await supabase
        .from('trip_schedule')
        .select('id, trip_number, trip_name, route, scheduled_departure, scheduled_arrival, from_station:from_station_id(id,name_ar), to_station:to_station_id(id,name_ar)')
        .eq('is_active', true)
        .or('is_rf.is.null,is_rf.eq.false')
        .order('scheduled_departure')
      setTrips(data || [])
    })()
  }, [namesVersion])

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
  }, [selectedTripId, namesVersion]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // عرض النداء على شاشات المحطات المختارة (لا يعطّل الصوت المحلي عند الفشل)
      if (screenSel.on && screenSel.ids.length) {
        const isClips = voiceURI === CLIPS_VOICE_ID && mode === 'trip' && destStop
        const screenText = isClips
          ? `نداء على الركاب المسافرين إلى ${destStop.name}` + (viaChosen.length ? ` مروراً بـ ${viaChosen.map(x => x.name).join('، ')}` : '')
          : (t || '').trim()
        const audio = isClips && screenSel.audio && phraseClips.intro && clipsIndex.has(destStop.id) && (!viaChosen.length || (phraseClips.via && viaChosen.every(x => clipsIndex.has(x.id))))
          ? [clipUrl('phrases/intro.mp3'), clipUrl(`stations/${destStop.id}.mp3`), ...(viaChosen.length ? [clipUrl('phrases/via.mp3'), ...viaChosen.map(x => clipUrl(`stations/${x.id}.mp3`))] : [])]
          : []
        if (screenText) {
          const { error: pe } = await supabase.rpc('signage_call_publish', { p_stations: screenSel.ids, p_text: screenText, p_audio: audio, p_ttl: 45 })
          if (pe) setCallError(/rate/.test(pe.message || '') ? 'تجاوزت حد الإرسال للشاشات، انتظر قليلاً' : 'تعذّر إرسال النداء إلى الشاشات (الصوت المحلي يعمل)')
        }
      }
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
      if (!controller.stopped) {
        const kind = voiceURI === CLIPS_VOICE_ID ? 'clips' : voiceURI === ELEVENLABS_VOICE_ID ? 'eleven' : 'device'
        const entry = {
          id: `${Date.now()}-${Math.random()}`, at: new Date(), kind,
          dest: mode === 'trip' && destStop ? destStop.name : '', trip: mode === 'trip' ? selectedTrip?.trip_number : '',
          text: kind === 'clips' ? '' : (t || ''),
        }
        setHistory(h => [entry, ...h].slice(0, 30))
      }
    } catch (err) {
      setCallError(err.message || (isAr ? 'تعذّر تشغيل النداء' : 'Failed to play the announcement'))
      stopRepeat()
    }
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chimeOn, selectedVoice, voiceURI, mode, destStop, viaChosen, clipsIndex, phraseClips, isAr, selectedTrip, screenSel])

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

  const clipsMode = voiceURI === CLIPS_VOICE_ID
  const needsBrowserTts = !clipsMode && voiceURI !== ELEVENLABS_VOICE_ID
  const announceDisabled = (!clipsMode && !text.trim()) || playing || repeating || (chimeOn && !CHIME_SUPPORTED) || (needsBrowserTts && !BROWSER_TTS_SUPPORTED)
  const status = repeating ? 'repeat' : playing ? 'playing' : 'idle'
  const repeatOpt = REPEAT_OPTIONS.find(o => o.value === repeatEvery)

  // جاهزية المقاطع للنداء الحالي (عرض فقط — نفس شروط التحقق داخل doCall)
  let clipsCheck = null
  if (clipsMode && mode === 'trip' && destStop) {
    clipsCheck = []
    if (!phraseClips.intro) clipsCheck.push(isAr ? 'عبارة المقدمة' : 'the intro phrase')
    if (!clipsIndex.has(destStop.id)) clipsCheck.push(destStop.name)
    if (viaChosen.length && !phraseClips.via) clipsCheck.push(isAr ? 'عبارة "مروراً بـ"' : 'the "via" phrase')
    viaChosen.forEach(s => { if (!clipsIndex.has(s.id)) clipsCheck.push(s.name) })
  }

  const voiceOptions = [
    ...(mode === 'trip' ? [{ value: CLIPS_VOICE_ID, label: isAr ? 'مقاطع مسجّلة جاهزة (الأفضل والأثبت)' : 'Ready-made recorded clips (best and most reliable)' }] : []),
    { value: ELEVENLABS_VOICE_ID, label: isAr ? 'صوت بشري واقعي حي (ElevenLabs)' : 'Live realistic human voice (ElevenLabs)' },
    ...[...voices].sort((a, b) => rankVoice(b) - rankVoice(a)).map(v => ({ value: v.voiceURI, label: `${v.name} ${isAr ? '(صوت الجهاز)' : '(device voice)'}` })),
  ]

  async function onTestVoice() {
    setCallError('')
    try {
      if (voiceURI === ELEVENLABS_VOICE_ID) await speakElevenLabs('هذا تجربة لصوت النداء', undefined, isAr)
      else await speak('هذا تجربة لصوت النداء', selectedVoice)
    } catch (err) { setCallError(err.message || (isAr ? 'تعذّر تشغيل الصوت' : 'Failed to play the audio')) }
  }

  function onModeChange(id) {
    setMode(id); stopRepeat()
    if (id === 'free' && voiceURI === CLIPS_VOICE_ID) setVoiceURI(ELEVENLABS_VOICE_ID)
  }

  const clipsLibraryCore = (
    <ClipsLibrary isAr={isAr} phraseClips={phraseClips} clipsIndex={clipsIndex} allStations={allStations}
      stationSearch={stationSearch} onStationSearch={setStationSearch} uploadingId={uploadingId} bulkProgress={bulkProgress} renaming={renaming}
      nameDrafts={nameDrafts} onNameDraft={(id, v) => setNameDrafts(p => ({ ...p, [id]: v }))}
      onUploadPhrase={uploadPhraseClip} onGeneratePhrase={generatePhraseClip} onUploadStation={uploadStationClip} onGenerateStation={generateStationClip}
      onGenerateAll={generateAllMissing} onAskRename={list => setConfirmRename({ list })} onPlay={path => new Audio(clipUrl(path)).play()} />
  )

  const clipsLibrary = (
    <>
      <VoiceSettingsCard isAr={isAr} busy={!!bulkProgress} onRegenerateAll={regenerateAll}
        onTest={(txt, extra) => speakElevenLabs(txt, undefined, isAr, extra)} />
      <PronunciationEditor isAr={isAr} stations={allStations} pron={pron} clipsIndex={clipsIndex} busyId={pronBusy}
        onSave={savePron} onTest={txt => speakElevenLabs(txt, undefined, isAr)} />
      {clipsLibraryCore}
    </>
  )

  const historyCard = <CallHistory isAr={isAr} items={history} onReuse={setText} onClear={() => setHistory([])} />

  const stats = desk
    ? [
        { label: isAr ? 'رحلات فعّالة' : 'Active trips', value: trips.length },
        { label: isAr ? 'محطات مفعّلة' : 'Enabled stations', value: selectedTrip ? `${checkedStops.length}/${stops.length}` : '—', hint: selectedTrip ? `${isAr ? 'رحلة' : 'Trip'} ${selectedTrip.trip_number}` : (isAr ? 'لم تُختر رحلة' : 'No trip selected') },
        { label: isAr ? 'مقاطع محطات جاهزة' : 'Station clips ready', value: clipsIndex.size, hint: `${isAr ? 'المقدمة' : 'Intro'}: ${phraseClips.intro ? (isAr ? 'جاهزة' : 'ready') : (isAr ? 'ناقصة' : 'missing')} · ${isAr ? 'مروراً بـ' : 'Via'}: ${phraseClips.via ? (isAr ? 'جاهزة' : 'ready') : (isAr ? 'ناقصة' : 'missing')}` },
        { label: isAr ? 'نداءات الجلسة' : 'Session announcements', value: history.length, color: history.length ? 'var(--accent)' : undefined },
      ]
    : [
        { label: isAr ? 'رحلات' : 'Trips', value: trips.length },
        { label: isAr ? 'محطات مفعّلة' : 'Stations', value: selectedTrip ? `${checkedStops.length}/${stops.length}` : '—' },
        { label: isAr ? 'نداءات' : 'Announced', value: history.length },
      ]

  return (
    <div className="cl-page" dir={isAr ? 'rtl' : 'ltr'}>
      <style>{CALL_CSS}</style>
      <PageHeader
        title={isAr ? 'نداء الركاب' : 'Passenger Announcements'}
        subtitle={isAr ? 'نداء صوتي لركاب رحلة معينة أو نص حر — يظهر حالياً للأدمن فقط' : 'Voice announcement for the passengers of a specific trip, or free text — currently visible to admins only'}
        stats={stats}
        actions={desk && (
          <button type="button" className="cl-btn" onClick={() => setShowClipsLibrary(true)}>{isAr ? 'مكتبة المقاطع الصوتية' : 'Audio clips library'}</button>
        )} />

      {needsBrowserTts && !BROWSER_TTS_SUPPORTED && (
        <div className="cl-note warn">
          {isAr
            ? 'المتصفح الحالي ما يدعم تحويل النص لصوت. جرّب على كروم أو سفاري بأحدث إصدار، أو استخدم مقاطع جاهزة/ElevenLabs من القائمة.'
            : 'The current browser does not support text-to-speech. Try the latest Chrome or Safari, or use ready-made clips / ElevenLabs from the menu.'}
        </div>
      )}
      {callError && <div className="cl-note err" role="alert">{callError}</div>}

      <div className="cl-grid">
        <div className="cl-main">
          <div className="cl-seg" role="tablist">
            {[{ id: 'trip', label: isAr ? 'نداء حسب الرحلة' : 'Announce by trip' }, { id: 'free', label: isAr ? 'نص حر' : 'Free text' }].map(m => (
              <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => onModeChange(m.id)}>{m.label}</button>
            ))}
          </div>

          {mode === 'trip' && (
            <div className="cl-pickers">
              <TripPanel isAr={isAr} query={tripQuery} onQuery={setTripQuery} loading={loadingTrips} trips={filteredTrips} total={trips.length}
                selectedId={selectedTripId} onSelect={setSelectedTripId} />
              {(desk || selectedTrip) && (
                <StopsPanel isAr={isAr} hasTrip={!!selectedTrip} loading={loadingStops} stops={stops} stopOff={stopOff}
                  onToggle={id => setStopOff(p => ({ ...p, [id]: !p[id] }))} onAll={() => setStopOff({})}
                  onNone={() => setStopOff(Object.fromEntries(stops.map(s => [s.id, true])))}
                  destId={destStop?.id} showAudio={clipsMode} clipsIndex={clipsIndex} />
              )}
            </div>
          )}

          {desk && mode === 'free' && historyCard}

          {!desk && (
            <section className="cl-card">
              <button type="button" onClick={() => setShowClipsLibrary(o => !o)} className="cl-lib-toggle">
                <span className="cl-card-t">{isAr ? 'مكتبة المقاطع الصوتية الجاهزة' : 'Ready-made audio clips library'}</span>
                <span className="cl-link">{showClipsLibrary ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}</span>
              </button>
              {showClipsLibrary && <div style={{ marginTop: 14 }}>{clipsLibrary}</div>}
            </section>
          )}
        </div>

        <div className="cl-side">
          <AnnounceConsole isAr={isAr} mode={mode} text={text} onText={setText} clipsMode={clipsMode}
            destName={destStop?.name} viaNames={viaChosen.map(s => s.name)} status={status}
            repeatLabel={isAr ? `يتكرر ${repeatOpt?.ar || ''}` : `Repeats: ${repeatOpt?.en || ''}`}
            chimeOn={chimeOn} onChime={setChimeOn} chimeSupported={CHIME_SUPPORTED} onTestChime={() => playChime()}
            repeatEvery={repeatEvery} onRepeat={e => setRepeatEvery(Number(e.target.value))} repeatOptions={REPEAT_OPTIONS} repeating={repeating} playing={playing}
            voiceURI={voiceURI} voiceOptions={voiceOptions} onVoice={e => { setVoiceURI(e.target.value); setCallError('') }}
            showTestVoice={!clipsMode} onTestVoice={onTestVoice} needsBrowserTts={needsBrowserTts} ttsSupported={BROWSER_TTS_SUPPORTED} hasDeviceVoices={voices.length > 0}
            clipsCheck={clipsCheck} onOpenLibrary={() => setShowClipsLibrary(true)}
            announceDisabled={announceDisabled} onAnnounce={onCallClick} onStop={stopRepeat} />
          <ScreenCallPicker isAr={isAr} value={screenSel} onChange={setScreenSel} />
          {!(desk && mode === 'free') && (desk || history.length > 0) && historyCard}
        </div>
      </div>

      {desk && showClipsLibrary && (
        <Sheet variant="drawer" width={860} isAr={isAr} accent="#5B5BD6" onClose={() => setShowClipsLibrary(false)}
          title={isAr ? 'مكتبة المقاطع الصوتية الجاهزة' : 'Ready-made audio clips library'}
          sub={isAr ? 'عبارتان ثابتتان + مقطع لكل محطة' : 'Two fixed phrases + one clip per station'}>
          {clipsLibrary}
        </Sheet>
      )}

      {confirmRename && (
        <ConfirmDialog danger={false}
          message={isAr
            ? `تغيير الاسم العربي لـ ${confirmRename.list.length} محطة؟ يظهر الاسم الجديد في النداء وكل الشاشات التي تعرض الاسم العربي، ويُعاد توليد المقطع الصوتي إن كان موجوداً.`
            : `Change the Arabic name of ${confirmRename.list.length} station(s)? It appears in announcements and wherever the Arabic name is shown; existing audio clips are regenerated.`}
          confirmLabel={isAr ? 'حفظ' : 'Save'} cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
          onConfirm={() => { const l = confirmRename.list; setConfirmRename(null); renameStations(l) }} onCancel={() => setConfirmRename(null)} />
      )}
    </div>
  )
}

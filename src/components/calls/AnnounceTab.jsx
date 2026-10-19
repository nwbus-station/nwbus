import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { matchesSearch } from '../../utils/digits'
import {
  buildAnnouncement, clipUrl, phraseText, stationSpoken, friendlyError, playChime, playClipSequence, speakLive, speakWithDevice, listArabicVoices,
} from '../../utils/callAudio'
import SelectField from '../shared/SelectField'

const REPEAT_OPTIONS = [
  { value: 0, label: 'بدون تكرار' },
  { value: 120, label: 'كل دقيقتين' },
  { value: 180, label: 'كل 3 دقائق' },
  { value: 300, label: 'كل 5 دقائق' },
]
const CHIME_OK = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)

export default function AnnounceTab({ lib, onGoSetup }) {
  const { clipsIndex, phraseClips } = lib
  const [mode, setMode] = useState('trip')           // 'trip' | 'free'
  const [trips, setTrips] = useState([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [query, setQuery] = useState('')
  const [tripId, setTripId] = useState('')
  const [stops, setStops] = useState([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [stopOff, setStopOff] = useState({})
  const [freeText, setFreeText] = useState('')
  const [chimeOn, setChimeOn] = useState(true)
  const [repeatEvery, setRepeatEvery] = useState(0)
  const [useDevice, setUseDevice] = useState(false)  // خيار متقدم: صوت الجهاز بدل ElevenLabs
  const [playing, setPlaying] = useState(false)
  const [repeating, setRepeating] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const controllerRef = useRef(null)
  const intervalRef = useRef(null)

  const trip = trips.find(t => t.id === tripId)
  const active = stops.filter(s => !stopOff[s.id])
  const dest = active.length ? active[active.length - 1] : null
  const destIdx = dest ? stops.findIndex(s => s.id === dest.id) : -1
  const via = destIdx > 0 ? stops.slice(1, destIdx).filter(s => !stopOff[s.id]) : []

  const sentence = mode === 'free' ? freeText.trim() : (dest ? buildAnnouncement(stationSpoken(dest), via.map(stationSpoken)) : '')
  // الأصوات الجاهزة إن اكتملت لهذه الرحلة، وإلا صوت ElevenLabs المباشر
  const missing = useMemo(() => {
    if (mode !== 'trip' || !dest) return []
    const m = []
    if (phraseText('intro') && !phraseClips.intro) m.push('عبارة المقدمة')
    if (!clipsIndex.has(dest.id)) m.push(dest.name)
    if (via.length && phraseText('via') && !phraseClips.via) m.push('عبارة «مروراً بـ»')
    via.forEach(s => { if (!clipsIndex.has(s.id)) m.push(s.name) })
    return m
  }, [mode, dest, via, clipsIndex, phraseClips, lib.config])
  const source = useDevice ? 'device' : (mode === 'trip' && dest && !missing.length ? 'clips' : 'live')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('trip_schedule')
        .select('id, trip_number, route, scheduled_departure, scheduled_arrival, from_station:from_station_id(id,name_ar), to_station:to_station_id(id,name_ar)')
        .eq('is_active', true).or('is_rf.is.null,is_rf.eq.false').order('scheduled_departure')
      setTrips(data ?? []); setLoadingTrips(false)
    })()
    return () => stopAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!trip) { setStops([]); setStopOff({}); return }
    (async () => {
      setLoadingStops(true); setStopOff({})
      const { data } = await supabase.from('trip_schedule_stops')
        .select('station_id, stop_order, arrival_time, departure_time, status, station:station_id(id,name_ar)')
        .eq('trip_schedule_id', trip.id).order('stop_order')
      const mid = (data ?? []).filter(s => s.station).map(s => ({ id: s.station_id, name: s.station.name_ar, time: s.arrival_time || s.departure_time, rest: s.status === 'REST' }))
      const list = []
      if (trip.from_station) list.push({ id: trip.from_station.id, name: trip.from_station.name_ar, time: trip.scheduled_departure })
      list.push(...mid)
      if (trip.to_station) list.push({ id: trip.to_station.id, name: trip.to_station.name_ar, time: trip.scheduled_arrival })
      setStops(list.filter((s, i) => i === 0 || s.id !== list[i - 1].id))
      setLoadingStops(false)
    })()
  }, [tripId]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopAll = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRepeating(false)
    const c = controllerRef.current
    if (c) { c.stopped = true; c.audio?.pause(); c.ctx?.close?.().catch(() => {}); c.cancelSpeech?.() }
    window.speechSynthesis?.cancel()
    setPlaying(false)
  }, [])

  const doCall = useCallback(async () => {
    if (!sentence) return
    const c = { stopped: false, audio: null, ctx: null }
    controllerRef.current = c
    setPlaying(true); setError('')
    try {
      if (chimeOn) await playChime(c)
      if (c.stopped) return
      if (source === 'clips') {
        const urls = []
        if (phraseText('intro')) urls.push(clipUrl('phrases/intro.mp3'))
        urls.push(clipUrl(`stations/${dest.id}.mp3`))
        if (via.length) { if (phraseText('via')) urls.push(clipUrl('phrases/via.mp3')); via.forEach(s => urls.push(clipUrl(`stations/${s.id}.mp3`))) }
        await playClipSequence(urls, c)
      } else if (source === 'device') await speakWithDevice(sentence, c)
      else await speakLive(sentence, c)
    } catch (e) { setError(friendlyError(e)); stopAll() }
    setPlaying(false)
  }, [sentence, chimeOn, source, dest, via, stopAll])

  async function onCall() {
    if (playing || !sentence) return
    if (repeatEvery > 0) { setRepeating(true); await doCall(); intervalRef.current = setInterval(doCall, repeatEvery * 1000) }
    else await doCall()
  }

  const shownTrips = !query.trim() ? trips : trips.filter(t =>
    matchesSearch(t.trip_number, query) || matchesSearch(t.route, query) || matchesSearch(t.from_station?.name_ar, query) || matchesSearch(t.to_station?.name_ar, query))
  const canCall = !!sentence && !playing && !repeating && (!chimeOn || CHIME_OK) && (source !== 'device' || !!window.speechSynthesis)
  const deviceVoices = listArabicVoices()

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 leading-relaxed">{error}</div>}

      <div className="flex gap-2">
        {[{ id: 'trip', label: 'حسب الرحلة' }, { id: 'free', label: 'نص حر' }].map(m => (
          <button key={m.id} type="button" onClick={() => { setMode(m.id); stopAll() }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border ${mode === m.id ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{m.label}</button>
        ))}
      </div>

      {mode === 'trip' ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-bold text-gray-800 mb-2">1. اختر الرحلة</p>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث برقم الرحلة أو الخط أو المحطة..." className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2" />
          {loadingTrips ? <p className="text-sm text-gray-400 py-4 text-center">جاري التحميل...</p> : (
            <div className="max-h-52 overflow-y-auto border border-gray-200 rounded divide-y divide-gray-100">
              {shownTrips.map(t => (
                <button key={t.id} type="button" onClick={() => { setTripId(t.id); stopAll() }}
                  className={`block w-full text-start px-3 py-2 text-sm hover:bg-gray-50 ${tripId === t.id ? 'bg-nwbus-primary/5 font-semibold text-nwbus-primary' : 'text-gray-700'}`}>
                  <span className="font-mono">{t.trip_number}</span>
                  <span className="text-gray-500 font-normal"> · {t.from_station?.name_ar ?? '—'} ← {t.to_station?.name_ar ?? '—'}</span>
                  {t.scheduled_departure && <span className="text-gray-400 font-mono text-xs"> · {t.scheduled_departure.slice(0, 5)}</span>}
                </button>
              ))}
              {shownTrips.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا توجد نتائج</p>}
            </div>
          )}

          {trip && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-bold text-gray-800">2. المحطات المذكورة في النداء</p>
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setStopOff({})} className="text-nwbus-primary">الكل</button>
                  <button type="button" onClick={() => setStopOff(Object.fromEntries(stops.slice(1).map(s => [s.id, true])))} className="text-gray-500">الوجهة فقط</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">آخر محطة محددة هي الوجهة، والمحطات قبلها تُذكر بعد «مروراً بـ». المحطة الأولى نقطة الانطلاق ولا تُذكر.</p>
              {loadingStops ? <p className="text-sm text-gray-400 py-3 text-center">جاري التحميل...</p> : (
                <div className="border border-gray-200 rounded divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {stops.map((s, i) => {
                    const first = i === 0
                    return (
                      <label key={s.id} className={`flex items-center gap-3 px-3 py-2 ${first ? 'bg-gray-50' : 'cursor-pointer'} ${!first && !stopOff[s.id] ? 'bg-nwbus-primary/5' : ''}`}>
                        <input type="checkbox" className="accent-nwbus-primary" disabled={first} checked={!first && !stopOff[s.id]} onChange={() => setStopOff(p => ({ ...p, [s.id]: !p[s.id] }))} />
                        <span className="flex-1 text-sm text-gray-700">
                          {s.name}{s.rest ? ' (استراحة)' : ''}
                          {first && <span className="text-[11px] text-gray-400 ms-2">نقطة الانطلاق</span>}
                          {s.id === dest?.id && <span className="text-[11px] text-blue-600 font-semibold ms-2">الوجهة</span>}
                        </span>
                        {!first && <span className={`text-[11px] shrink-0 ${clipsIndex.has(s.id) ? 'text-green-600' : 'text-amber-600'}`}>{clipsIndex.has(s.id) ? 'صوت جاهز' : 'بلا صوت جاهز'}</span>}
                        <span className="text-xs text-gray-400 font-mono">{s.time ? s.time.slice(0, 5) : ''}</span>
                      </label>
                    )
                  })}
                  {stops.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">لا توجد نقاط توقف لهذه الرحلة</p>}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-bold text-gray-800 mb-2">نص النداء</p>
          <textarea value={freeText} onChange={e => setFreeText(e.target.value)} rows={3} placeholder="اكتب نص النداء هنا..." className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500 mt-1">يُنطق بصوت ElevenLabs المباشر (يستهلك من الرصيد).</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-bold text-gray-800 mb-2">{mode === 'trip' ? '3. النداء' : 'النداء'}</p>
        <div className={`rounded border px-3 py-3 text-sm leading-relaxed min-h-[3rem] ${sentence ? 'bg-slate-50 border-gray-200 text-gray-800' : 'bg-gray-50 border-dashed border-gray-300 text-gray-400'}`}>
          {sentence || (mode === 'trip' ? 'اختر رحلة ومحطة وجهة لتظهر جملة النداء هنا' : 'اكتب النص أعلاه')}
        </div>

        {mode === 'trip' && dest && (
          source === 'clips'
            ? <p className="text-xs text-green-700 mt-2">سيُشغَّل بالأصوات الجاهزة المحفوظة (سريع وبلا استهلاك رصيد).</p>
            : source === 'live'
              ? <p className="text-xs text-amber-700 mt-2 leading-relaxed">أصوات غير جاهزة ({missing.join('، ')}) فسيُنطق النداء مباشرة عبر ElevenLabs (يستهلك رصيداً وقد يتأخر ثوانٍ). <button type="button" onClick={onGoSetup} className="underline font-semibold">جهّز الأصوات</button></p>
              : null
        )}

        <div className="flex flex-wrap items-center gap-4 mt-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" className="accent-nwbus-primary" checked={chimeOn} onChange={e => setChimeOn(e.target.checked)} />نغمة قبل النداء</label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">التكرار:</span>
            <SelectField value={repeatEvery} onChange={e => setRepeatEvery(Number(e.target.value))} disabled={repeating} className="border border-gray-200 rounded px-2 py-1.5 text-sm">
              {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectField>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCall} disabled={!canCall} className="flex-1 bg-nwbus-primary text-white rounded-lg py-3 text-sm font-bold disabled:opacity-40">
            {repeating ? 'جارٍ النداء المتكرر...' : playing ? 'جارٍ النداء...' : 'نداء'}
          </button>
          {(playing || repeating) && <button type="button" onClick={stopAll} className="px-6 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-bold hover:bg-red-100">إيقاف</button>}
        </div>

        <button type="button" onClick={() => setShowAdvanced(o => !o)} className="mt-3 text-xs text-gray-500 underline">{showAdvanced ? 'إخفاء الخيارات المتقدمة' : 'خيارات متقدمة'}</button>
        {showAdvanced && (
          <div className="mt-2 space-y-2 border-t border-gray-100 pt-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" className="accent-nwbus-primary" checked={useDevice} onChange={e => { setUseDevice(e.target.checked); stopAll() }} />
              استخدام صوت الجهاز بدل ElevenLabs (جودته أقل ويختلف بين الأجهزة)
            </label>
            {useDevice && !deviceVoices.length && <p className="text-xs text-amber-700">لا يوجد صوت عربي مثبّت على هذا الجهاز.</p>}
            <button type="button" onClick={() => playChime()} disabled={!CHIME_OK} className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 disabled:opacity-40">تجربة النغمة</button>
          </div>
        )}
      </div>
    </div>
  )
}

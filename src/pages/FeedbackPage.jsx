import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  LANGS, T, FACES, TRIP_ASPECTS, STATION_ASPECTS, IMPROVE_TRIP, IMPROVE_STATION, LOW_REASONS,
  AGE_GROUPS, TRAVELER_TYPES, TRIP_PURPOSES, FREQUENCIES,
} from '../utils/feedbackConfig'

const LS_LANG = 'nw_fb_lang'
const LS_DEV = 'nw_fb_dev'

function detectLang() {
  try { const s = localStorage.getItem(LS_LANG); if (s && T[s]) return s } catch { /* ignore */ }
  const n = (navigator.language || 'ar').slice(0, 2).toLowerCase()
  return T[n] ? n : 'ar'
}

function deviceId() {
  try {
    let d = localStorage.getItem(LS_DEV)
    if (!d) { d = (crypto.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now()); localStorage.setItem(LS_DEV, d) }
    return d
  } catch { return '' }
}

function StationPicker({ label, value, onChange, stations, t, lang }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const nm = s => (lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || ''
  const selected = stations.find(s => s.id === value)
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return stations.filter(s => !k || (s.name_ar || '').toLowerCase().includes(k) || (s.name_en || '').toLowerCase().includes(k))
  }, [q, stations])

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <button type="button" onClick={() => { setOpen(true); setQ('') }}
        className={`w-full flex items-center justify-between gap-2 border rounded-xl px-4 py-3.5 text-sm bg-white text-start ${selected ? 'border-slate-300 text-slate-800 font-semibold' : 'border-slate-200 text-slate-400'}`}>
        <span className="truncate" dir="auto">{selected ? nm(selected) : t.pickStation}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t.searchStation}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 px-2 py-2">{t.close}</button>
            </div>
            <div className="overflow-y-auto p-2">
              {list.map(s => (
                <button key={s.id} type="button" onClick={() => { onChange(s.id); setOpen(false) }}
                  className={`w-full text-start px-4 py-3.5 rounded-xl text-sm ${s.id === value ? 'bg-slate-900 text-white font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span dir="auto">{nm(s)}</span>
                </button>
              ))}
              {list.length === 0 && <p className="text-center text-sm text-slate-400 py-8">{t.noResults}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FaceRow({ label, value, onChange, t }) {
  return (
    <div className="py-3.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        {value ? <span className="text-xs text-slate-500 shrink-0">{t.faces[value - 1]}</span> : null}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {FACES.map((f, i) => {
          const v = i + 1
          const on = value === v
          return (
            <button key={v} type="button" onClick={() => onChange(on ? null : v)} aria-label={t.faces[i]}
              className={`h-12 rounded-xl text-2xl transition-all ${on ? 'bg-slate-900 scale-105 shadow' : 'bg-slate-50 hover:bg-slate-100'} ${value && !on ? 'opacity-40' : ''}`}>
              {f}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Chips({ title, options, selected, onToggle, t, single = false }) {
  return (
    <div>
      {title && <p className="text-xs font-semibold text-slate-500 mb-2">{title}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map(k => {
          const on = selected.includes(k)
          return (
            <button key={k} type="button" onClick={() => onToggle(k)}
              className={`px-3.5 py-2 rounded-full text-sm border transition-colors ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {t.o[k]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5">
      {title && <h2 className="text-sm font-bold text-slate-900 mb-3">{title}</h2>}
      {children}
    </section>
  )
}

export default function FeedbackPage() {
  const [lang, setLang] = useState(detectLang)
  const t = T[lang]
  const dir = LANGS.find(l => l.code === lang)?.dir ?? 'rtl'

  const [view, setView] = useState('start') // start | trip | station | done
  const [doneKinds, setDoneKinds] = useState([])
  const [stations, setStations] = useState([])

  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [stationId, setStationId] = useState('')
  const [tripNumber, setTripNumber] = useState('')
  const [ratings, setRatings] = useState({})
  const [nps, setNps] = useState(null)
  const [improve, setImprove] = useState([])
  const [reasons, setReasons] = useState([])
  const [comment, setComment] = useState('')
  const [phone, setPhone] = useState('')
  const [demo, setDemo] = useState({ age: '', traveler: '', purpose: '', freq: '' })
  const [showAbout, setShowAbout] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const prevDir = document.documentElement.dir
    const prevLang = document.documentElement.lang
    document.documentElement.dir = dir
    document.documentElement.lang = lang
    try { localStorage.setItem(LS_LANG, lang) } catch { /* ignore */ }
    return () => { document.documentElement.dir = prevDir; document.documentElement.lang = prevLang }
  }, [lang, dir])

  useEffect(() => {
    supabase.rpc('survey_stations').then(({ data }) => setStations(data ?? []))
  }, [])

  function resetForm() {
    setFromId(''); setToId(''); setStationId(''); setTripNumber(''); setRatings({}); setNps(null)
    setImprove([]); setReasons([]); setComment(''); setPhone(''); setError('')
  }
  function start(kind) { resetForm(); setView(kind); window.scrollTo?.({ top: 0 }) }

  const kind = view === 'trip' || view === 'station' ? view : null
  const aspects = view === 'trip' ? TRIP_ASPECTS : STATION_ASPECTS
  const improveOpts = view === 'trip' ? IMPROVE_TRIP : IMPROVE_STATION
  const ratedCount = Object.keys(ratings).length
  const hasLow = Object.values(ratings).some(v => v <= 2) || (view === 'trip' && nps != null && nps <= 6)

  const progress = (() => {
    const total = aspects.length + (view === 'trip' ? 3 : 1)
    const done = ratedCount + (view === 'trip' ? (fromId ? 1 : 0) + (toId ? 1 : 0) + (nps != null ? 1 : 0) : (stationId ? 1 : 0))
    return Math.min(100, Math.round((done / total) * 100))
  })()

  const toggleIn = (arr, setArr, k, max) =>
    setArr(arr.includes(k) ? arr.filter(x => x !== k) : (max && arr.length >= max ? [...arr.slice(1), k] : [...arr, k]))

  async function submit() {
    setError('')
    if (view === 'trip' && (!fromId || !toId)) { setError(t.needStations); return }
    if (view === 'station' && !stationId) { setError(t.needStation); return }
    if (!ratedCount && nps == null) { setError(t.needRating); return }
    setSending(true)
    const payload = {
      kind: view, lang, device: deviceId(),
      station_id: view === 'station' ? stationId : null,
      from_station_id: view === 'trip' ? fromId : null,
      to_station_id: view === 'trip' ? toId : null,
      trip_number: view === 'trip' ? tripNumber : null,
      nps: view === 'trip' ? nps : null,
      ratings, improve, low_reason: hasLow ? reasons : [], comment,
      age_group: demo.age || null, traveler_type: demo.traveler || null, trip_purpose: demo.purpose || null, frequency: demo.freq || null,
      contact_phone: hasLow ? phone : null,
    }
    const { error: err } = await supabase.rpc('submit_customer_survey', { p: payload })
    setSending(false)
    if (err && !/duplicate/i.test(err.message || '')) { setError(t.error); return }
    setDoneKinds(d => (d.includes(view) ? d : [...d, view]))
    setView('done')
    window.scrollTo?.({ top: 0 })
  }

  const otherKind = doneKinds.includes('trip') ? (doneKinds.includes('station') ? null : 'station') : 'trip'

  return (
    <div dir={dir} className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "system-ui, 'Segoe UI', Tahoma, Arial, sans-serif" }}>
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-extrabold tracking-tight text-slate-900">NW Bus</span>
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
            {LANGS.map(l => (
              <button key={l.code} type="button" onClick={() => setLang(l.code)}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${lang === l.code ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        {kind && (
          <div className="h-1 bg-slate-100"><div className="h-1 bg-slate-900 transition-all" style={{ width: `${progress}%` }} /></div>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-3 pb-28">
        {view === 'start' && (
          <>
            <div className="text-center py-6">
              <h1 className="text-2xl font-extrabold">{t.title}</h1>
              <p className="text-sm text-slate-500 mt-2">{t.sub}</p>
            </div>
            {[['trip', t.startTrip, t.startTripHint, '🚌'], ['station', t.startStation, t.startStationHint, '🏢']].map(([k, title, hint, icon]) => (
              <button key={k} type="button" onClick={() => start(k)}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4 text-start active:scale-[0.99] transition-transform">
                <span className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl shrink-0">{icon}</span>
                <span className="flex-1">
                  <span className="block text-base font-bold">{title}</span>
                  <span className="block text-xs text-slate-500 mt-1">{hint}</span>
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300" style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }}><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </>
        )}

        {kind && (
          <>
            <button type="button" onClick={() => setView('start')} className="text-xs font-semibold text-slate-500 py-1">← {t.back}</button>

            {view === 'trip' ? (
              <Card title={t.tripSection}>
                <div className="space-y-3">
                  <StationPicker label={t.fromStation} value={fromId} onChange={setFromId} stations={stations} t={t} lang={lang} />
                  <StationPicker label={t.toStation} value={toId} onChange={setToId} stations={stations} t={t} lang={lang} />
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t.tripNumber}</label>
                    <input value={tripNumber} onChange={e => setTripNumber(e.target.value)} dir="ltr" maxLength={20} placeholder="NW18-O-1"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300" />
                  </div>
                </div>
              </Card>
            ) : (
              <Card title={t.stationSection}>
                <StationPicker label={t.pickStation} value={stationId} onChange={setStationId} stations={stations} t={t} lang={lang} />
              </Card>
            )}

            <Card title={view === 'trip' ? t.rateTrip : t.rateStation}>
              <p className="text-xs text-slate-400 -mt-1 mb-1">{t.skipHint}</p>
              {aspects.map(a => (
                <FaceRow key={a.key} label={t.a[a.key]} value={ratings[a.key] ?? null} t={t}
                  onChange={v => setRatings(r => { const n = { ...r }; if (v == null) delete n[a.key]; else n[a.key] = v; return n })} />
              ))}
            </Card>

            {view === 'trip' && (
              <Card title={t.nps}>
                <div className="grid grid-cols-11 gap-1" dir="ltr">
                  {Array.from({ length: 11 }, (_, i) => {
                    const on = nps === i
                    const tone = i <= 6 ? 'bg-red-500' : i <= 8 ? 'bg-amber-500' : 'bg-green-600'
                    return (
                      <button key={i} type="button" onClick={() => setNps(on ? null : i)}
                        className={`h-11 rounded-lg text-sm font-bold transition-all ${on ? `${tone} text-white scale-110 shadow` : 'bg-slate-50 text-slate-600 hover:bg-slate-100'} ${nps != null && !on ? 'opacity-50' : ''}`}>
                        {i}
                      </button>
                    )
                  })}
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-2">
                  <span>{t.npsLow}</span><span>{t.npsHigh}</span>
                </div>
              </Card>
            )}

            <Card>
              <div className="space-y-5">
                <Chips title={t.improveTitle} options={improveOpts} selected={improve} t={t} onToggle={k => toggleIn(improve, setImprove, k, 2)} />
                {hasLow && (
                  <>
                    <Chips title={t.lowTitle} options={LOW_REASONS} selected={reasons} t={t} onToggle={k => toggleIn(reasons, setReasons, k)} />
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t.contactTitle}</label>
                      <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))} dir="ltr" inputMode="tel" maxLength={16} placeholder={t.contactPh}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t.commentLabel}</label>
                  <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} maxLength={1000} placeholder={t.commentPh}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
            </Card>

            <Card>
              <button type="button" onClick={() => setShowAbout(o => !o)} className="w-full flex items-center justify-between text-start">
                <span>
                  <span className="block text-sm font-bold">{t.aboutYou}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">{t.aboutHint}</span>
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0" style={{ transform: showAbout ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {showAbout && (
                <div className="space-y-5 mt-4">
                  <Chips title={t.age} options={AGE_GROUPS} selected={[demo.age]} t={t} onToggle={k => setDemo(d => ({ ...d, age: d.age === k ? '' : k }))} />
                  <Chips title={t.traveler} options={TRAVELER_TYPES} selected={[demo.traveler]} t={t} onToggle={k => setDemo(d => ({ ...d, traveler: d.traveler === k ? '' : k }))} />
                  <Chips title={t.purpose} options={TRIP_PURPOSES} selected={[demo.purpose]} t={t} onToggle={k => setDemo(d => ({ ...d, purpose: d.purpose === k ? '' : k }))} />
                  <Chips title={t.frequency} options={FREQUENCIES} selected={[demo.freq]} t={t} onToggle={k => setDemo(d => ({ ...d, freq: d.freq === k ? '' : k }))} />
                </div>
              )}
            </Card>

            {error && <p className="text-sm text-red-600 font-semibold text-center">{error}</p>}
          </>
        )}

        {view === 'done' && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🙏</div>
            <h1 className="text-2xl font-extrabold">{t.thanks}</h1>
            <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">{t.thanksSub}</p>
            {otherKind && (
              <button type="button" onClick={() => start(otherKind)}
                className="mt-8 px-6 py-3.5 rounded-xl bg-white border border-slate-200 text-sm font-bold shadow-sm">
                {otherKind === 'trip' ? t.rateOtherTrip : t.rateOtherStation}
              </button>
            )}
          </div>
        )}
      </main>

      {kind && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-slate-100 p-3">
          <div className="max-w-xl mx-auto">
            <button type="button" onClick={submit} disabled={sending}
              className="w-full bg-slate-900 text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-50 active:scale-[0.99] transition-transform">
              {sending ? t.sending : t.submit}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

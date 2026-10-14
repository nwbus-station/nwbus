import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached } from '../lib/pageCache'
import { toLatinDigits } from '../utils/digits'
import { syncStationTripsByNumbers } from '../utils/importSchedule'
import { mergeStations, checkMergeReady } from '../utils/mergeStations'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import SearchSelect from '../components/shared/SearchSelect'
import StatStrip from '../components/shared/StatStrip'
import SelectField from '../components/shared/SelectField'
import TimeInput24 from '../components/shared/TimeInput24'
import { validEnds, fmtMin, toMin } from '../utils/shifts'

/* ─── دمج محطة مكررة في الأساسية — أدمن فقط ─────────────── */
function MergeModal({ stations, onClose, onSaved }) {
  useEscapeKey(onClose)
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const t = (en, ar) => isAr ? ar : en

  const [ready, setReady]     = useState(null)   // null = يفحص، false = يحتاج SQL
  const [srcId, setSrcId]     = useState('')
  const [dstId, setDstId]     = useState('')
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [log, setLog]         = useState(null)

  useEffect(() => { checkMergeReady().then(setReady) }, [])

  const opts = exclude => stations
    .filter(s => s.id !== exclude && !s.merged_into)
    .map(s => ({ value: s.id, label: `${s.name_en}${s.name_ar && s.name_ar !== s.name_en ? ` · ${s.name_ar}` : ''}${s.is_active ? '' : t(' (inactive)', ' (معطلة)')}` }))
  const nameOf = id => stations.find(s => s.id === id)?.name_en || '—'

  async function run() {
    setRunning(true)
    try { setLog(await mergeStations(srcId, dstId)) }
    catch (err) { setLog([{ label: t('Merge', 'الدمج'), ok: false, error: err.message }]) }
    setRunning(false)
    onSaved()
  }

  const MERGE_SQL = 'ALTER TABLE stations ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES stations(id);'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between bg-amber-600 text-white px-5 py-3 rounded-t-2xl">
          <h3 className="font-bold">{t('Merge duplicate station', 'دمج محطة مكررة')}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {ready === null ? (
            <p className="text-center text-gray-400 py-6 text-sm">…</p>
          ) : ready === false ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                {t('One-time setup: run this in Supabase (SQL Editor) then reopen:',
                   'إعداد لمرة واحدة: شغّل هذا السطر في Supabase (SQL Editor) ثم أعد فتح النافذة:')}
              </p>
              <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-3 overflow-x-auto select-all" dir="ltr">{MERGE_SQL}</pre>
              <button onClick={() => { navigator.clipboard?.writeText(MERGE_SQL) }}
                className="text-xs bg-gray-100 border rounded-lg px-3 py-1.5 hover:bg-gray-200">
                {t('Copy', 'نسخ')}
              </button>
            </div>
          ) : log ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">
                {log.every(l => l.ok) ? '' + t('Merge completed', 'تم الدمج') : '⚠' + t('Merge finished with issues', 'انتهى الدمج مع ملاحظات')}
              </p>
              <div className="border rounded-xl divide-y divide-gray-100 text-xs">
                {log.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className={l.ok ? 'text-gray-700' : 'text-red-600 font-semibold'}>{l.ok ? '✓' : '✗'} {l.label}</span>
                    <span className="text-gray-400 font-mono" dir="ltr">
                      {l.ok
                        ? [l.moved ? `${l.moved} ${t('moved', 'نُقل')}` : '', l.removed ? `${l.removed} ${t('removed', 'حُذف')}` : '', l.left ? `⚠ ${l.left} ${t('left', 'بقي')}` : ''].filter(Boolean).join(' · ') || '—'
                        : l.error}
                    </span>
                  </div>
                ))}
              </div>
              {log.some(l => l.left) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  {t('Some records stayed on the old station because an identical record already exists on the target (same trip & date). Review them manually.',
                     'بعض السجلات بقيت على المحطة القديمة لوجود سجل مطابق على الأساسية (نفس الرحلة والتاريخ). راجعها يدوياً.')}
                </p>
              )}
              <button onClick={onClose} className="w-full bg-nwbus-primary text-white py-2 rounded-lg text-sm font-semibold hover:opacity-90">
                {t('Close', 'إغلاق')}
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                {t('Moves everything (trips, stops, activations, records, sales, lost & found, users) from the duplicate to the main station, then disables the duplicate. Future Excel uploads will map the old name to the main station automatically.',
                   'ينقل كل شيء (الرحلات، التوقفات، الترحيل، السجلات، المبيعات، المفقودات، المستخدمين) من المحطة المكررة إلى الأساسية ثم يعطّل المكررة. أي رفع Excel قادم سيوجّه الاسم القديم للمحطة الأساسية تلقائياً.')}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('Duplicate station (will be disabled)', 'المحطة المكررة (ستُعطَّل)')}</label>
                <SearchSelect isAr={isAr} value={srcId} onChange={setSrcId}
                  placeholder={t('— Select —', '— اختر —')}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  options={opts(dstId)} />
              </div>
              <div className="text-center text-gray-400 text-lg leading-none">↓</div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('Main station (keeps everything)', 'المحطة الأساسية (يبقى كل شيء عليها)')}</label>
                <SearchSelect isAr={isAr} value={dstId} onChange={setDstId}
                  placeholder={t('— Select —', '— اختر —')}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  options={opts(srcId)} />
              </div>
              {srcId && dstId && (
                <label className="flex items-start gap-2 text-sm cursor-pointer bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <input type="checkbox" className="rounded accent-amber-600 mt-0.5"
                    checked={confirm} onChange={e => setConfirm(e.target.checked)} />
                  <span className="text-amber-800 text-xs">
                    {t('I confirm merging', 'أؤكد دمج')} <b dir="ltr">{nameOf(srcId)}</b> {t('into', 'في')} <b dir="ltr">{nameOf(dstId)}</b>.
                    {' '}{t('This cannot be undone automatically.', 'لا يمكن التراجع تلقائياً.')}
                  </span>
                </label>
              )}
              <button onClick={run} disabled={!srcId || !dstId || !confirm || running}
                className="w-full bg-amber-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40">
                {running ? t('Merging…', 'جارٍ الدمج…') : `${t('Merge now', 'دمج الآن')}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StationModal({ station, onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyScrollLock()
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [form, setForm] = useState({
    name_ar:    station?.name_ar    ?? '',
    name_en:    station?.name_en    ?? '',
    type:       station?.type       ?? 'main',
    region:     station?.region     ?? '',
    city_group: station?.city_group ?? '',
    is_active:  station?.is_active  ?? true,
    combined_arr_dep: station?.combined_arr_dep ?? false,
    is_agent:   station?.is_agent   ?? false,
  })
  // ورديات المحطة (للإيرادات): فارغ = الافتراضي العام من الإعدادات، وإلا 3 أو 4 ورديات بأوقات نهاية مخصصة
  const initEnds = Array.isArray(station?.shift_ends) && validEnds(station.shift_ends) ? station.shift_ends : null
  const [shiftMode, setShiftMode] = useState(initEnds ? 'custom' : 'default')
  const [shiftCount, setShiftCount] = useState(initEnds ? initEnds.length : 3)
  const [shiftEnds, setShiftEnds] = useState(initEnds ? initEnds.slice(0, -1).map(fmtMin) : ['08:00', '16:00'])
  const setCountSafe = n => { setShiftCount(n); setShiftEnds(prev => n === 4 ? (prev.length === 3 ? prev : [prev[0] ?? '08:00', prev[1] ?? '16:00', '20:00']) : prev.slice(0, 2)) }
  const draftEnds = [...shiftEnds.map(toMin), 1440]
  const shiftsValid = shiftMode !== 'custom' || (draftEnds.length === shiftCount && validEnds(draftEnds))
  const [tripNums, setTripNums] = useState(Array.isArray(station?.trip_numbers) ? station.trip_numbers : [])
  const [numInput, setNumInput] = useState('')
  const [allTrips, setAllTrips] = useState([])   // قائمة الرحلات من الجدول
  const [tripSearch, setTripSearch] = useState('')
  const [tripOpen, setTripOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('trip_schedule')
      .select('trip_number, route, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en)')
      .eq('is_active', true).order('trip_number')
      .then(({ data }) => setAllTrips(data ?? []))
  }, [])

  const addNum = v => {
    const code = (v ?? toLatinDigits(numInput)).trim().toUpperCase()
    if (code && !tripNums.includes(code)) setTripNums(n => [...n, code])
    setNumInput('')
    setTripSearch('')   // تصفير البحث ليبدأ الاختيار التالي من جديد
  }
  const removeNum = i => setTripNums(n => n.filter((_, idx) => idx !== i))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    // الاسم العربي إن أُدخل — وإلا الإنجليزي (يُستخدم في العرض والمناداة الصوتية)
    if (!shiftsValid) { setError(isAr ? 'رتّب أوقات نهاية الورديات تصاعدياً (كل وقت بعد الذي قبله وقبل 24:00)' : 'Shift end times must be ascending and before 24:00'); setSaving(false); return }
    const payload = { ...form, name_ar: (form.name_ar || '').trim() || form.name_en, trip_numbers: tripNums, created_by: profile.id }
    // العمود يُرسل فقط عند الحاجة (تخصيص، أو إلغاء تخصيص سابق) حتى تعمل الصفحة قبل تشغيل SQL
    if (shiftMode === 'custom') payload.shift_ends = draftEnds
    else if (station?.shift_ends != null) payload.shift_ends = null
    const res = station
      ? await supabase.from('stations').update(payload).eq('id', station.id).select('id').single()
      : await supabase.from('stations').insert(payload).select('id').single()
    if (res.error) { setError(res.error.message); setSaving(false); return }
    // ربط أرقام الرحلات بالترحيل تلقائياً
    try { await syncStationTripsByNumbers(res.data.id, tripNums, profile) }
    catch (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
    setSaving(false)
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto overscroll-contain" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-bold text-nwbus-primary text-lg">
            {station ? (isAr ? 'تعديل محطة' : 'Edit Station') : (isAr ? 'إضافة محطة' : 'Add Station')}
          </h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSave} className="px-5 sm:px-6 pt-4 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'اسم المحطة (إنجليزي) *' : 'Station Name (English) *'}</label>
            <input required dir="ltr" className={inputCls} value={form.name_en} onChange={e => set('name_en', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'الاسم العربي (اختياري)' : 'Arabic name (optional)'}
            </label>
            <input dir="rtl" className={inputCls} value={form.name_ar === form.name_en ? '' : form.name_ar}
              onChange={e => set('name_ar', e.target.value)}
              placeholder={isAr ? 'اختياري — مثال: تَيْمَاء' : 'Optional — e.g. تيماء'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'النوع' : 'Type'}</label>
              <SelectField className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="main">{isAr ? 'رئيسية' : 'Main'}</option>
                <option value="transit">{isAr ? 'مرور' : 'Transit'}</option>
              </SelectField>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'المنطقة' : 'Region'}</label>
              <input className={inputCls} value={form.region} onChange={e => set('region', e.target.value)} />
            </div>
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5 cursor-pointer">
            <input type="checkbox" className="mt-0.5 rounded accent-violet-600" checked={!!form.is_agent} onChange={e => set('is_agent', e.target.checked)} />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{isAr ? 'محطة وكيل' : 'Agent station'}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">{isAr ? 'تُشغَّل عبر وكيل وليست من محطات نورث وست — تظهر بعلامة "وكيل" وتُحسب منفصلة في التقارير.' : 'Operated by an agent, not a North West station — shown with an "Agent" badge and counted separately in reports.'}</span>
            </span>
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'مجموعة المدينة (لمنع رحلات داخل المدينة)' : 'City Group (prevent intra-city trips)'}
            </label>
            <input className={inputCls} dir="ltr" placeholder="e.g. jeddah"
              value={form.city_group} onChange={e => set('city_group', e.target.value.toLowerCase().trim())} />
          </div>
          {/* أرقام رحلات المحطة (ثابتة) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'أرقام رحلات المحطة (وصول/مغادرة)' : 'Station trip numbers'}
            </label>
            <div className="flex gap-2">
              <input value={tripSearch} onFocus={() => setTripOpen(true)} onChange={e => { setTripSearch(e.target.value); setTripOpen(true) }}
                placeholder={isAr ? 'ابحث أو افتح القائمة...' : 'Search or open list...'}
                className={inputCls + ' flex-1'} />
              <button type="button" onClick={() => setTripOpen(o => !o)}
                className="shrink-0 border rounded-lg px-3 text-sm text-gray-500 hover:bg-gray-50">{tripOpen ? '▲' : '▼'}</button>
            </div>
            {tripOpen && (() => {
              const q = tripSearch.trim().toLowerCase()
              const matches = allTrips.filter(t => !tripNums.includes(t.trip_number) && (!q || (
                (t.trip_number || '').toLowerCase().includes(q) ||
                (t.route || '').toLowerCase().includes(q) ||
                (t.from_station?.name_ar || '').includes(q) || (t.from_station?.name_en || '').toLowerCase().includes(q) ||
                (t.to_station?.name_ar || '').includes(q) || (t.to_station?.name_en || '').toLowerCase().includes(q)
              )))
              return (
                <div className="mt-1 border rounded-lg max-h-52 overflow-y-auto divide-y divide-gray-100 bg-white">
                  {matches.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-3">{isAr ? 'لا رحلات' : 'No trips'}</p>
                    : matches.map(t => (
                      <button type="button" key={t.trip_number}
                        onClick={() => addNum(t.trip_number)}
                        className="w-full text-right px-2 py-1.5 hover:bg-blue-50 text-xs flex items-center gap-2">
                        <span className="font-mono font-bold text-nwbus-primary">{t.trip_number}</span>
                        {t.route && <span className="text-gray-400">· {t.route}</span>}
                        <span className="text-gray-400 truncate">{t.from_station ? `${isAr ? t.from_station.name_ar : t.from_station.name_en} → ${isAr ? t.to_station?.name_ar : t.to_station?.name_en}` : ''}</span>
                      </button>
                    ))}
                </div>
              )
            })()}
            <div className="flex flex-wrap gap-1.5 mt-2 min-h-[28px] border rounded-lg p-2 bg-gray-50">
              {tripNums.length === 0
                ? <span className="text-xs text-gray-400">{isAr ? 'لا توجد رحلات بعد' : 'No trips yet'}</span>
                : tripNums.map((n, i) => {
                  const route = allTrips.find(t => t.trip_number === n)?.route
                  return (
                    <span key={i} className="inline-flex items-center gap-1 bg-white border rounded-full px-2 py-0.5 text-xs">
                      <span className="font-mono font-bold text-nwbus-primary">{n}</span>
                      {route && <span className="text-gray-400">· {route}</span>}
                      <button type="button" onClick={() => removeNum(i)} className="text-gray-400 hover:text-red-500">×</button>
                    </span>
                  )
                })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {isAr ? 'تُضاف رحلاتها للترحيل تلقائياً عند الحفظ وعند رفع أي جدول جديد.' : 'Auto-added to transportation on save and on each schedule upload.'}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded"
              checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            {isAr ? 'نشطة' : 'Active'}
          </label>
          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="rounded"
                checked={!!form.combined_arr_dep} onChange={e => set('combined_arr_dep', e.target.checked)} />
              {isAr ? 'وصول ومغادرة ببطاقة إدخال واحدة' : 'Arrival + departure on one entry card'}
            </label>
            <p className="text-[11px] text-gray-400 mt-1 ms-6">
              {isAr ? 'للمحطات اللي الباص يوصلها ويغادرها بنفس الوقت (مثل الطائف): يُدخل الموظف بطاقة واحدة، وتُسجَّل في التقارير كوصول ومغادرة.'
                    : 'For stops where the bus arrives and departs together: one entry card, still recorded as both arrival and departure in reports.'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-bold text-gray-800">{isAr ? 'ورديات هذي المحطة' : 'Station shifts'}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{isAr ? 'تُستخدم في الإيرادات والترحيل والتقييم والسجل الوظيفي لهذي المحطة. الافتراضي 3 ورديات (08:00 / 16:00 / 24:00).' : 'Used for sales, transportation, ratings and employee file of this station. Default: 3 shifts (08:00 / 16:00 / 24:00).'}</p>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold mt-2">
              {[['default', isAr ? 'قياسية (3)' : 'Standard (3)'], ['custom', isAr ? 'مخصصة' : 'Custom']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setShiftMode(k)} className={`px-4 py-1.5 ${shiftMode === k ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
            {shiftMode === 'custom' && (
              <div className="mt-3 space-y-3">
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                  {[3, 4].map(n => (
                    <button key={n} type="button" onClick={() => setCountSafe(n)} className={`px-4 py-1.5 ${shiftCount === n ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{isAr ? `${n} ورديات` : `${n} shifts`}</button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {shiftEnds.map((v, i) => (
                    <div key={i}>
                      <label className="block text-[11px] text-gray-500 mb-1">{isAr ? `نهاية ${['أ', 'ب', 'ج'][i]}` : `End of ${['A', 'B', 'C'][i]}`}</label>
                      <TimeInput24 value={v} onChange={x => setShiftEnds(prev => prev.map((p, j) => (j === i ? x : p)))} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">{isAr ? `نهاية ${['أ', 'ب', 'ج', 'د'][shiftCount - 1]}` : `End of ${['A', 'B', 'C', 'D'][shiftCount - 1]}`}</label>
                    <div className="px-3 py-2 rounded-lg bg-gray-100 text-gray-500 text-sm font-mono">24:00</div>
                  </div>
                </div>
                {shiftsValid
                  ? <div className="flex flex-wrap gap-1.5" dir="ltr">{draftEnds.map((e, i) => <span key={i} className="text-[11px] font-mono bg-gray-50 border border-gray-200 rounded px-2 py-0.5">{['A', 'B', 'C', 'D'][i]} {fmtMin(i ? draftEnds[i - 1] : 0)} – {fmtMin(e)}</span>)}</div>
                  : <p className="text-[11px] text-red-600">{isAr ? 'الأوقات لازم تتصاعد وتكون قبل 24:00' : 'Times must ascend and be before 24:00'}</p>}
              </div>
            )}
          </div>
          {error && <p className="text-red-600 text-xs bg-red-50 rounded p-2">{error}</p>}
          <div className="flex gap-3 sticky bottom-0 bg-white border-t -mx-5 sm:-mx-6 px-5 sm:px-6 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button type="submit" disabled={saving}
              className="flex-1 bg-nwbus-primary text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-nwbus-dark transition-colors">
              {saving ? '...' : (isAr ? 'حفظ' : 'Save')}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function StationsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { isGeneralAdmin, allowCap, isRestricted, grantCap, supervisedStationIds } = useAuth()
  // مشرف المرحلين (حساب مقيّد) بصلاحية "تعديل محطاته المخصصة": يشوف ويعدّل محطاته فقط بدون إضافة أو دمج
  const restrictedManager = isRestricted && grantCap('stations_manage_assigned')
  const canEditStation = s => isGeneralAdmin || (restrictedManager && (supervisedStationIds ?? []).includes(s.id))
  const [stations, setStations] = useState(() => getCached('stations_all') ?? [])
  const [loading, setLoading]   = useState(() => !getCached('stations_all'))
  const [modal, setModal]       = useState(null)
  const [showMerge, setShowMerge] = useState(false)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [sort, setSort]         = useState('name')
  const [view, setView]         = useState(() => { try { return localStorage.getItem('stations_view') || 'table' } catch { return 'table' } })
  const [staff, setStaff]       = useState({})   // عدد الموظفين النشطين لكل محطة

  const fetch = useCallback(async () => {
    const cached = getCached('stations_all')
    if (cached) { setStations(cached); setLoading(false) } else { setLoading(true) }
    const { data } = await supabase.from('stations').select('*').order('name_ar')
    if (data) { setCached('stations_all', data); setStations(data) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => {
    supabase.from('users').select('station_id').eq('is_active', true).not('station_id', 'is', null).limit(5000)
      .then(({ data }) => { const m = {}; for (const u of data ?? []) m[u.station_id] = (m[u.station_id] || 0) + 1; setStaff(m) })
  }, [])

  const staffOf = id => staff[id] ?? 0
  const tripsOf = s => (Array.isArray(s.trip_numbers) ? s.trip_numbers.length : 0)
  const fourShifts = s => Array.isArray(s.shift_ends) && s.shift_ends.length === 4
  const visible = stations.filter(s => !isRestricted || (supervisedStationIds ?? []).includes(s.id))
  const q = search.trim().toLowerCase()
  const FILTERS = [
    ['all', isAr ? 'الكل' : 'All', () => true],
    ['main', isAr ? 'رئيسية' : 'Main', s => s.type === 'main'],
    ['transit', isAr ? 'مرور' : 'Transit', s => s.type === 'transit'],
    ['active', isAr ? 'نشطة' : 'Active', s => s.is_active && !s.merged_into],
    ['inactive', isAr ? 'معطلة' : 'Inactive', s => !s.is_active || !!s.merged_into],
    ['agent', isAr ? 'وكيل' : 'Agent', s => !!s.is_agent],
    ['four', isAr ? '4 ورديات' : '4 shifts', fourShifts],
  ]
  const filterFn = FILTERS.find(f => f[0] === filter)?.[2] ?? (() => true)
  const filtered = visible
    .filter(filterFn)
    .filter(s => !q || (s.name_ar || '').toLowerCase().includes(q) || (s.name_en || '').toLowerCase().includes(q) || (s.region || '').toLowerCase().includes(q) || (s.city_group || '').toLowerCase().includes(q))
    .sort((a, b) => sort === 'trips' ? tripsOf(b) - tripsOf(a) : sort === 'staff' ? staffOf(b.id) - staffOf(a.id) : (a.name_ar || a.name_en || '').localeCompare(b.name_ar || b.name_en || '', isAr ? 'ar' : 'en'))

  const mainCount    = visible.filter(s => s.type === 'main').length
  const transitCount = visible.filter(s => s.type === 'transit').length
  const activeCount  = visible.filter(s => s.is_active && !s.merged_into).length
  const inactiveCount = visible.length - activeCount
  const agentCount   = visible.filter(s => s.is_agent).length
  const fourCount    = visible.filter(fourShifts).length

  if (!allowCap('stations_page') || (isRestricted && !restrictedManager)) {
    return <div className="flex items-center justify-center text-sm text-gray-400" style={{ minHeight: 'calc(100vh - 58px)' }}>{isAr ? 'غير مصرح' : 'Access denied'}</div>
  }

  const statusOf = s => s.merged_into ? { t: isAr ? 'مدمجة' : 'Merged', dot: 'bg-amber-500', txt: 'text-amber-700' }
    : s.is_active ? { t: isAr ? 'نشطة' : 'Active', dot: 'bg-green-500', txt: 'text-green-700' }
    : { t: isAr ? 'معطلة' : 'Inactive', dot: 'bg-gray-400', txt: 'text-gray-500' }
  const typeChip = s => (
    <span className={`inline-block text-[11px] font-bold rounded px-2 py-0.5 border ${s.type === 'main' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-purple-200 bg-purple-50 text-purple-700'}`}>
      {s.type === 'main' ? (isAr ? 'رئيسية' : 'Main') : (isAr ? 'مرور' : 'Transit')}
    </span>
  )
  const badges = s => (
    <>
      {s.is_agent && <span className="text-[10px] bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 font-bold">{isAr ? 'وكيل' : 'Agent'}</span>}
      {s.combined_arr_dep && <span className="text-[10px] bg-sky-100 text-sky-700 rounded px-1.5 py-0.5 font-bold">{isAr ? 'وصول + مغادرة' : 'Arr + Dep'}</span>}
    </>
  )
  // شريط اليوم (24 ساعة) مقسوم حسب ورديات المحطة: 3 أو 4
  const ShiftBar = ({ s }) => {
    const ends = Array.isArray(s.shift_ends) && validEnds(s.shift_ends) ? s.shift_ends : [480, 960, 1440]
    const custom = Array.isArray(s.shift_ends) && validEnds(s.shift_ends)
    return (
      <div className="min-w-[120px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-gray-700">{ends.length} {isAr ? 'ورديات' : 'shifts'}</span>
          {custom && <span className="text-[9px] font-bold text-nwbus-primary border border-nwbus-primary rounded px-1">{isAr ? 'مخصصة' : 'custom'}</span>}
        </div>
        <div className="flex h-2 rounded-sm overflow-hidden gap-px" dir="ltr" title={ends.map((e, i) => `${['A', 'B', 'C', 'D'][i]} ${fmtMin(i ? ends[i - 1] : 0)}–${fmtMin(e)}`).join('  ')}>
          {ends.map((e, i) => (
            <i key={i} style={{ flex: e - (i ? ends[i - 1] : 0), background: 'var(--accent, #4f46e5)', opacity: [1, 0.7, 0.45, 0.25][i] }} />
          ))}
        </div>
      </div>
    )
  }
  const editBtn = s => canEditStation(s) && (
    <button onClick={() => setModal(s)}
      className="text-xs font-semibold border border-gray-300 text-gray-700 rounded-md px-3 py-1.5 hover:border-nwbus-primary hover:text-nwbus-primary transition-colors">
      {isAr ? 'تعديل' : 'Edit'}
    </button>
  )

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">{isAr ? 'المحطات' : 'Stations'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAr ? `${visible.length} محطة — المعروض ${filtered.length}` : `${visible.length} stations — showing ${filtered.length}`}
          </p>
        </div>
        <div className="flex gap-2">
          {isGeneralAdmin && (
            <button onClick={() => setShowMerge(true)}
              className="border border-amber-600 text-amber-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors">
              {isAr ? 'دمج محطات' : 'Merge'}
            </button>
          )}
          {isGeneralAdmin && (
            <button onClick={() => setModal('new')}
              className="bg-nwbus-primary text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-nwbus-dark transition-colors">
              + {isAr ? 'محطة جديدة' : 'New Station'}
            </button>
          )}
        </div>
      </div>

      <StatStrip className="mb-4" items={[
        { label: isAr ? 'الإجمالي' : 'Total', val: visible.length },
        { label: isAr ? 'رئيسية' : 'Main', val: mainCount },
        { label: isAr ? 'مرور' : 'Transit', val: transitCount },
        { label: isAr ? 'نشطة' : 'Active', val: activeCount, tone: 'text-green-700' },
        { label: isAr ? 'معطلة / مدمجة' : 'Inactive', val: inactiveCount, tone: inactiveCount ? 'text-amber-700' : undefined },
        { label: isAr ? 'وكلاء' : 'Agents', val: agentCount },
        { label: isAr ? '4 ورديات' : '4 shifts', val: fourCount },
      ]} />

      {/* أدوات: بحث + تصفية + ترتيب + عرض */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" /></svg>
          <input placeholder={isAr ? 'ابحث بالاسم أو المنطقة…' : 'Search name or region…'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg ps-9 pe-3 py-2 text-sm bg-white focus:ring-2 focus:ring-nwbus-primary/40 focus:border-nwbus-primary focus:outline-none" />
        </div>
        <SelectField value={sort} onChange={e => setSort(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700">
          <option value="name">{isAr ? 'ترتيب: الاسم' : 'Sort: name'}</option>
          <option value="trips">{isAr ? 'ترتيب: الرحلات' : 'Sort: trips'}</option>
          <option value="staff">{isAr ? 'ترتيب: الموظفون' : 'Sort: staff'}</option>
        </SelectField>
        <div className="hidden md:inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {[['table', isAr ? 'جدول' : 'Table'], ['cards', isAr ? 'بطاقات' : 'Cards']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setView(k); try { localStorage.setItem('stations_view', k) } catch { /* بدون تخزين */ } }}
              className={`px-3.5 py-2 ${view === k ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {FILTERS.map(([k, l, fn]) => {
          const n = visible.filter(fn).length
          const on = filter === k
          return (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 border transition-colors ${on ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {l} <span className={`font-mono ms-1 ${on ? 'opacity-80' : 'text-gray-400'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 text-sm">{isAr ? 'لا توجد محطات مطابقة' : 'No matching stations'}</p>
          {(search || filter !== 'all') && <button type="button" onClick={() => { setSearch(''); setFilter('all') }} className="mt-2 text-xs font-semibold text-nwbus-primary underline">{isAr ? 'مسح التصفية' : 'Clear filters'}</button>}
        </div>
      ) : (
        <>
          {/* جدول (كمبيوتر) */}
          <div className={`${view === 'table' ? 'hidden md:block' : 'hidden'} bg-white border border-gray-200 rounded-xl overflow-hidden`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                  {[isAr ? 'المحطة' : 'Station', isAr ? 'النوع' : 'Type', isAr ? 'المنطقة' : 'Region', isAr ? 'الرحلات' : 'Trips', isAr ? 'الموظفون' : 'Staff', isAr ? 'الورديات' : 'Shifts', isAr ? 'الحالة' : 'Status', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-start font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => {
                  const st = statusOf(s)
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">{s.name_ar}{badges(s)}</p>
                        <p className="text-xs text-gray-400 mt-0.5" dir="ltr" style={{ textAlign: isAr ? 'right' : 'left' }}>{s.name_en}</p>
                      </td>
                      <td className="px-4 py-3">{typeChip(s)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{s.region || '—'}{s.city_group && <span className="block text-[10px] text-gray-400">{s.city_group}</span>}</td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-800">{tripsOf(s) || <span className="text-gray-300">0</span>}</td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-800">{staffOf(s.id) || <span className="text-gray-300">0</span>}</td>
                      <td className="px-4 py-3"><ShiftBar s={s} /></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-bold ${st.txt}`}><i className={`w-2 h-2 rounded-full ${st.dot}`} />{st.t}</span></td>
                      <td className="px-4 py-3 text-end">{editBtn(s)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* بطاقات (جوال، أو اختيار العرض) */}
          <div className={`${view === 'table' ? 'md:hidden' : ''} grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`}>
            {filtered.map(s => {
              const st = statusOf(s)
              return (
                <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:border-gray-400 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 leading-snug flex items-center gap-1.5 flex-wrap">{s.name_ar}{badges(s)}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate" dir="ltr" style={{ textAlign: isAr ? 'right' : 'left' }}>{s.name_en}</p>
                    </div>
                    {typeChip(s)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[[isAr ? 'الرحلات' : 'Trips', tripsOf(s)], [isAr ? 'الموظفون' : 'Staff', staffOf(s.id)], [isAr ? 'المنطقة' : 'Region', s.region || '—']].map(([l, v]) => (
                      <div key={l} className="rounded-lg bg-gray-50 border border-gray-100 py-1.5">
                        <div className="text-sm font-bold font-mono text-gray-800 truncate px-1">{v}</div>
                        <div className="text-[10px] text-gray-400">{l}</div>
                      </div>
                    ))}
                  </div>
                  <ShiftBar s={s} />
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${st.txt}`}><i className={`w-2 h-2 rounded-full ${st.dot}`} />{st.t}</span>
                    {editBtn(s)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {modal && (
        <StationModal
          station={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetch}
        />
      )}

      {showMerge && (
        <MergeModal
          stations={stations}
          onClose={() => setShowMerge(false)}
          onSaved={fetch}
        />
      )}
    </div>
  )
}

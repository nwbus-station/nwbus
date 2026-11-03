import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { toLocalDateStr } from '../../utils/dates'
import { isRestStation } from '../../utils/stations'

// تنزيل جدول الإيرادات (Excel): فترة بخيارات سريعة + اختيار المحطات مع فلاتر «فيها يوزر» و«الوكلاء».
// الجلب والتصدير تتولاهما الصفحة عبر onDownload({ from, to, selIds }) وتُرجع نص الخطأ أو null.
const STORE = 'sales_xl_stations'
const MAX_DAYS = 93

const norm = s => String(s ?? '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()

const Ico = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{[].concat(d).map((p, i) => <path key={i} d={p} />)}</svg>
const I = {
  sheet: ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M8 13h8M8 17h8M8 9h2'],
  cal: ['M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M16 3v4M8 3v4M3 11h18'],
  pin: ['M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z', 'M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  x: 'M6 6l12 12M18 6L6 18',
  dl: ['M12 3v12', 'M7 11l5 5 5-5', 'M5 21h14'],
  check: 'M5 12l5 5L20 7',
}

const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1

export default function DailyExcelModal({ isAr, isGeneralAdmin, defaultDate, onDownload, onClose }) {
  useBodyScrollLock()
  const T = (a, e) => (isAr ? a : e)
  const [from, setFrom] = useState(defaultDate)
  const [to, setTo] = useState(defaultDate)
  const [sel, setSel] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]')) } catch { return new Set() } })
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')            // all | staffed | agents
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stations, setStations] = useState([])        // كل المحطات بما فيها الوكلاء (للاختيار فقط)
  const [staff, setStaff] = useState({})              // عدد الموظفين النشطين لكل محطة

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify([...sel])) } catch { /* بدون تخزين */ } }, [sel])
  useEffect(() => {
    const k = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, busy])
  useEffect(() => {
    if (!isGeneralAdmin) return
    supabase.from('stations').select('id,name_ar,name_en,is_agent').eq('is_active', true).order('name_ar')
      .then(({ data }) => setStations((data ?? []).filter(s => !isRestStation(s))))
    supabase.from('users').select('station_id').eq('is_active', true).not('station_id', 'is', null).limit(5000)
      .then(({ data }) => { const m = {}; for (const u of data ?? []) m[u.station_id] = (m[u.station_id] || 0) + 1; setStaff(m) })
  }, [isGeneralAdmin])

  const nameOf = s => (isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'
  const today = toLocalDateStr(new Date())
  const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return toLocalDateStr(d) }
  const yy = new Date().getFullYear(), mm = new Date().getMonth()
  const presets = [
    [T('اليوم', 'Today'), shift(0), shift(0)],
    [T('أمس', 'Yesterday'), shift(-1), shift(-1)],
    [T('آخر 7 أيام', 'Last 7 days'), shift(-6), shift(0)],
    [T('آخر 30 يوماً', 'Last 30 days'), shift(-29), shift(0)],
    [T('هذا الشهر', 'This month'), toLocalDateStr(new Date(yy, mm, 1)), shift(0)],
    [T('الشهر الماضي', 'Last month'), toLocalDateStr(new Date(yy, mm - 1, 1)), toLocalDateStr(new Date(yy, mm, 0))],
  ]

  const days = from && to && from <= to ? dayDiff(from, to) : 0
  const periodErr = !from || !to || from > to ? T('حدّد فترة صحيحة', 'Pick a valid period') : days > MAX_DAYS ? T(`الحد الأقصى للفترة ${MAX_DAYS} يوماً`, `Maximum period is ${MAX_DAYS} days`) : ''

  const staffed = stations.filter(s => !s.is_agent && (staff[s.id] || 0) > 0)
  const agents = stations.filter(s => s.is_agent)
  const term = norm(q)
  const shown = useMemo(() => stations
    .filter(s => kind === 'all' || (kind === 'agents' ? !!s.is_agent : (!s.is_agent && (staff[s.id] || 0) > 0)))
    .filter(s => !term || norm(s.name_ar).includes(term) || norm(s.name_en).includes(term))
    .sort((a, b) => ((staff[b.id] || 0) > 0) - ((staff[a.id] || 0) > 0) || nameOf(a).localeCompare(nameOf(b), isAr ? 'ar' : 'en')),
  [stations, staff, kind, term, isAr]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = id => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectShown = () => setSel(prev => new Set([...prev, ...shown.map(s => s.id)]))
  const unselectShown = () => setSel(prev => { const n = new Set(prev); shown.forEach(s => n.delete(s.id)); return n })
  const allShownOn = shown.length > 0 && shown.every(s => sel.has(s.id))
  const selList = stations.filter(s => sel.has(s.id))

  async function go() {
    if (periodErr) { setErr(periodErr); return }
    setBusy(true); setErr('')
    const e = await onDownload({ from, to, sel })
    setBusy(false)
    if (e) setErr(e); else onClose()
  }

  const chip = (on, extra = '') => `min-h-[44px] px-3.5 rounded-full text-[12.5px] font-bold border transition inline-flex items-center gap-1.5 ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'} ${extra}`
  const sectionHead = (icon, title, right) => (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h4 className="flex items-center gap-2 text-[13px] font-extrabold text-gray-800"><span className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 grid place-items-center"><Ico d={icon} size={15} /></span>{title}</h4>
      {right}
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" dir={isAr ? 'rtl' : 'ltr'} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={T('تنزيل جدول الإيرادات', 'Download revenue sheet')}
        className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[90vh] overflow-hidden">
        {/* الترويسة */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><Ico d={I.sheet} size={22} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-extrabold text-gray-900 leading-tight">{T('تنزيل جدول الإيرادات', 'Download revenue sheet')}</h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5 leading-snug">{T('Excel بأسلوب محاسبي: قيود مفصّلة، ملخص، تسوية ورديات، توقيعات الاعتماد', 'Accounting-style Excel: entries, summary, shift reconciliation, sign-off')}</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} aria-label={T('إغلاق', 'Close')} disabled={busy}
            className="w-11 h-11 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 grid place-items-center shrink-0 disabled:opacity-40"><Ico d={I.x} size={18} /></button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto overscroll-contain">
          {/* الفترة */}
          <section>
            {sectionHead(I.cal, T('الفترة', 'Period'),
              days > 0 && <span className={`text-[11.5px] font-bold rounded-full px-2.5 py-1 ${days > MAX_DAYS ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{days} {T(days === 1 ? 'يوم' : 'يوماً', days === 1 ? 'day' : 'days')}</span>)}
            <div className="flex flex-wrap gap-2">
              {presets.map(([l, a, b]) => <button key={l} type="button" aria-pressed={from === a && to === b} onClick={() => { setFrom(a); setTo(b); setErr('') }} className={chip(from === a && to === b)}>{l}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11.5px] font-bold text-gray-500 mb-1">{T('من', 'From')}</label>
                <DatePicker value={from} onChange={v => { setFrom(v); setErr(''); if (v && to && v > to) setTo(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white w-full min-h-[44px]" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-gray-500 mb-1">{T('إلى', 'To')}</label>
                <DatePicker value={to} onChange={v => { setTo(v); setErr(''); if (v && from && v < from) setFrom(v) }} isAr={isAr} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white w-full min-h-[44px]" />
              </div>
            </div>
            {periodErr && from && to && <p className="text-[12px] font-semibold text-red-600 mt-2">{periodErr}</p>}
          </section>

          {/* المحطات */}
          {isGeneralAdmin && (
            <section>
              {sectionHead(I.pin, T('المحطات', 'Stations'),
                <span className={`text-[11.5px] font-bold rounded-full px-2.5 py-1 ${sel.size ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {sel.size ? T(`${sel.size} مختارة`, `${sel.size} selected`) : T('كل المحطات', 'All stations')}
                </span>)}
              <div className="flex flex-wrap gap-2" role="group" aria-label={T('تصفية المحطات', 'Filter stations')}>
                <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')} className={chip(kind === 'all')}>{T('الكل', 'All')} <span className="opacity-70">{stations.length}</span></button>
                <button type="button" aria-pressed={kind === 'staffed'} onClick={() => setKind('staffed')} className={chip(kind === 'staffed')}>{T('فيها يوزر', 'With users')} <span className="opacity-70">{staffed.length}</span></button>
                <button type="button" aria-pressed={kind === 'agents'} onClick={() => setKind('agents')} className={chip(kind === 'agents')}>{T('الوكلاء', 'Agents')} <span className="opacity-70">{agents.length}</span></button>
              </div>
              {kind === 'agents' && <p className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2.5 leading-relaxed">{T('محطات الوكلاء لا تُسجَّل لها يوميات إيرادات، فلن تظهر لها بيانات في الجدول.', 'Agent stations have no revenue entries, so they add no data to the sheet.')}</p>}

              <input value={q} onChange={e => setQ(e.target.value)} placeholder={T('ابحث عن محطة…', 'Search a station…')} aria-label={T('بحث عن محطة', 'Search a station')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-3 min-h-[44px] focus:ring-2 focus:ring-emerald-500/30 focus:outline-none" />

              <div className="flex items-center justify-between mt-2.5 mb-1.5">
                <span className="text-[11.5px] text-gray-500">{T(`${shown.length} محطة ظاهرة`, `${shown.length} shown`)}</span>
                <span className="flex items-center gap-4">
                  <button type="button" onClick={allShownOn ? unselectShown : selectShown} disabled={!shown.length} className="min-h-[36px] text-[12px] font-bold text-emerald-700 hover:underline disabled:opacity-40">{allShownOn ? T('إلغاء تحديد الظاهر', 'Unselect shown') : T('تحديد الظاهر', 'Select shown')}</button>
                  {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="min-h-[36px] text-[12px] font-bold text-red-500 hover:underline">{T('مسح التحديد', 'Clear')}</button>}
                </span>
              </div>

              <div className="border border-gray-200 rounded-xl max-h-60 overflow-y-auto overscroll-contain divide-y divide-gray-100">
                {!stations.length && <p className="px-3 py-6 text-center text-[12.5px] text-gray-400">{T('جارٍ تحميل المحطات…', 'Loading stations…')}</p>}
                {stations.length > 0 && !shown.length && <p className="px-3 py-6 text-center text-[12.5px] text-gray-400">{T('لا توجد محطات مطابقة', 'No matching stations')}</p>}
                {shown.map(s => {
                  const on = sel.has(s.id), n = staff[s.id] || 0
                  return (
                    <label key={s.id} className={`flex items-center gap-3 px-3 min-h-[46px] cursor-pointer transition ${on ? 'bg-emerald-50/60' : 'hover:bg-gray-50'}`}>
                      <input type="checkbox" className="accent-emerald-600 w-[18px] h-[18px] shrink-0" checked={on} onChange={() => toggle(s.id)} />
                      <span dir="auto" className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-gray-800">{nameOf(s)}</span>
                      {s.is_agent
                        ? <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 shrink-0">{T('وكيل', 'Agent')}</span>
                        : n > 0
                          ? <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-sky-50 text-sky-700 shrink-0">{n} {T(n === 1 ? 'يوزر' : 'يوزر', n === 1 ? 'user' : 'users')}</span>
                          : <span className="text-[10.5px] font-semibold text-gray-400 shrink-0">{T('بلا يوزر', 'No users')}</span>}
                    </label>
                  )
                })}
              </div>
              {selList.length > 0 && selList.length <= 4 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {selList.map(s => (
                    <button key={s.id} type="button" onClick={() => toggle(s.id)} className="inline-flex items-center gap-1.5 min-h-[32px] rounded-full bg-emerald-50 text-emerald-800 text-[12px] font-bold ps-3 pe-2 border border-emerald-100">
                      <span dir="auto" className="max-w-[160px] truncate">{nameOf(s)}</span><Ico d={I.x} size={12} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {err && <p role="alert" className="text-[12.5px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{err}</p>}
        </div>

        {/* التذييل */}
        <div className="px-5 py-3.5 border-t border-gray-100 bg-white">
          <p className="text-[11.5px] text-gray-500 mb-2.5 truncate">
            {from && to && from <= to ? (from === to ? from : `${from} ← ${to}`) : '—'}
            {days > 0 && ` · ${days} ${T(days === 1 ? 'يوم' : 'يوماً', days === 1 ? 'day' : 'days')}`}
            {isGeneralAdmin && ` · ${sel.size ? T(`${sel.size} محطة`, `${sel.size} stations`) : T('كل المحطات', 'all stations')}`}
          </p>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={go} disabled={busy || !!periodErr}
              className="flex-1 min-h-[50px] bg-emerald-600 text-white rounded-xl text-[15px] font-extrabold hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy
                ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />{T('جارٍ تجهيز الملف…', 'Preparing the file…')}</>
                : <><Ico d={I.dl} size={18} />{T('تنزيل ملف Excel', 'Download Excel')}</>}
            </button>
            <button type="button" onClick={onClose} disabled={busy} className="min-h-[50px] px-5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40">{T('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

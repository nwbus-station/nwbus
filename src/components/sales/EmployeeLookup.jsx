import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { toLocalDateStr } from '../../utils/dates'

// بحث الرقم الوظيفي: تكتب الرقم (أو جزءاً منه، أو اسم الموظف) فتظهر بطاقة الموظف وإحصاءات يومياته
// لفترة تختارها، وقائمة كل قيوده مرتبة بالتاريخ (فتح القيد بضغطة). آخر البحوث تُحفظ بالجهاز.
// applyScope(q) تطبّق نفس حدود صلاحية الصفحة على استعلام sales_records.
const RECENT = 'sales_lookup_recent'
const RANGES = [[30, '30 يوماً', '30 days'], [90, '90 يوماً', '90 days'], [365, 'سنة', '1 year']]
const PAGE = 40
const fmt = n => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const actualOf = r => Number(r.cash_amount ?? 0) + Number(r.mada_amount ?? 0) + Number(r.visa_amount ?? 0) + Number(r.mastercard_amount ?? 0) + Number(r.other_amount ?? 0)
const SHIFT_AR = { A: 'أ', B: 'ب', C: 'ج', D: 'د' }

const Ico = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{[].concat(d).map((p, i) => <path key={i} d={p} />)}</svg>
const SEARCH = ['M11 19a8 8 0 100-16 8 8 0 000 16z', 'M21 21l-4.3-4.3']
const CLOSE = 'M6 6l12 12M18 6L6 18'
const CLOCK = ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2']

const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]') } catch { return [] } }

export default function EmployeeLookup({ isAr, applyScope, onOpenRecord, onActive, refresh }) {
  const T = (a, e) => (isAr ? a : e)
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cands, setCands] = useState(null)            // مرشّحون مطابقون للنص
  const [emp, setEmp] = useState(null)                // الموظف المختار
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [err, setErr] = useState('')
  const [recent, setRecent] = useState(loadRecent)
  const inp = useRef(null)
  const seqQ = useRef(0)   // بحث الموظف
  const seqR = useRef(0)   // جلب اليوميات

  const active = q.trim().length > 0
  useEffect(() => { onActive?.(active) }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // اختصار «/» للتركيز على الحقل
  useEffect(() => {
    const k = e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); inp.current?.focus() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  // البحث عن الموظف (بعد توقف الكتابة)
  useEffect(() => {
    const t = q.trim()
    setErr('')
    if (!t) { setCands(null); setEmp(null); setRows([]); return }
    const my = ++seqQ.current
    const digits = /^\d+$/.test(t)
    if (digits && t.length < 3) { setCands(null); setEmp(null); return }
    if (!digits && t.length < 2) { setCands(null); setEmp(null); return }
    setBusy(true)
    const id = setTimeout(async () => {
      let qq = supabase.from('users').select('id, full_name_ar, job_number, station_id, station:station_id(name_ar, name_en)').limit(12)
      qq = digits ? qq.ilike('job_number', `%${t}%`) : qq.ilike('full_name_ar', `%${t}%`)
      let { data, error } = await qq
      if (error && digits) ({ data, error } = await supabase.from('users').select('id, full_name_ar, job_number, station_id, station:station_id(name_ar, name_en)').eq('job_number', t).limit(12))
      if (my !== seqQ.current) return
      setBusy(false)
      if (error) { setErr(T('تعذّر البحث. أعد المحاولة.', 'Search failed. Try again.')); setCands([]); return }
      const list = (data ?? []).sort((a, b) => (a.job_number === t ? -1 : 0) - (b.job_number === t ? -1 : 0))
      setCands(list)
      setEmp(list.length === 1 || list[0]?.job_number === t ? list[0] : null)
    }, 320)
    return () => clearTimeout(id)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // يوميات الموظف المختار
  useEffect(() => {
    if (!emp) { setRows([]); return }
    const my = ++seqR.current
    setLoadingRows(true); setLimit(PAGE)
    const from = (() => { const d = new Date(); d.setDate(d.getDate() - days); return toLocalDateStr(d) })()
    ;(async () => {
      const base = () => applyScope(supabase.from('sales_records').select('*, station:station_id(name_ar, name_en)').gte('sale_date', from)
        .order('sale_date', { ascending: false }).order('shift').limit(1000))
      const [a, b] = await Promise.all([
        base().eq('created_by', emp.id),
        emp.full_name_ar ? base().eq('employee_name', emp.full_name_ar) : Promise.resolve({ data: [] }),
      ])
      if (my !== seqR.current) return
      if (a.error) { setErr(T('تعذّر جلب اليوميات.', 'Could not load records.')); setLoadingRows(false); return }
      // سجل أنشأه الموظف نفسه (بدون اسم آخر)، أو سجل أُدخل باسمه من مشرف
      const own = (a.data ?? []).filter(r => !r.employee_name || r.employee_name === r.created_by_name || r.employee_name === emp.full_name_ar)
      const map = new Map()
      for (const r of [...own, ...(b.data ?? [])]) map.set(r.id, { ...r, created_by_user: { job_number: emp.job_number } })
      setRows([...map.values()].sort((x, y) => y.sale_date.localeCompare(x.sale_date) || String(x.shift).localeCompare(String(y.shift))))
      setLoadingRows(false)
    })()
  }, [emp, days, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    let collected = 0, expected = 0, deficit = 0, deficitN = 0, confirmed = 0
    for (const r of rows) {
      const a = actualOf(r), e = Number(r.total_expected ?? 0)
      collected += a; expected += e
      if (a - e < 0) { deficit += e - a; deficitN++ }
      if (r.is_confirmed) confirmed++
    }
    return { collected, expected, diff: collected - expected, deficit, deficitN, confirmed }
  }, [rows])

  const stName = s => (isAr ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar)) || '—'
  function pick(u) {
    setEmp(u)
    const next = [{ job: u.job_number, name: u.full_name_ar }, ...recent.filter(x => x.job !== u.job_number)].slice(0, 5)
    setRecent(next)
    try { localStorage.setItem(RECENT, JSON.stringify(next)) } catch { /* بدون تخزين */ }
  }
  useEffect(() => { if (emp) pick(emp) }, [emp?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => { setQ(''); setCands(null); setEmp(null); setRows([]); setErr(''); inp.current?.focus() }
  const showRecent = focus && !q && recent.length > 0

  const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#'

  return (
    <div className="mb-4">
      {/* الحقل */}
      <div className={`relative flex items-center gap-2 bg-white border rounded-xl px-3 min-h-[52px] transition ${focus ? 'border-gray-900 ring-4 ring-gray-900/10' : 'border-gray-200 hover:border-gray-300'}`}>
        <span className="text-gray-400 shrink-0"><Ico d={SEARCH} size={19} /></span>
        <input ref={inp} value={q} onChange={e => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={e => { if (e.key === 'Escape') { if (q) clear(); else inp.current?.blur() } }}
          inputMode="search" enterKeyHint="search" autoComplete="off" dir="auto"
          aria-label={T('بحث بالرقم الوظيفي', 'Search by job number')}
          placeholder={T('ابحث بالرقم الوظيفي (مثال 1030253) أو باسم الموظف', 'Search by job number (e.g. 1030253) or employee name')}
          className="flex-1 min-w-0 bg-transparent text-[14.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none py-3" />
        {busy && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin shrink-0" aria-hidden="true" />}
        {q
          ? <button type="button" onClick={clear} aria-label={T('مسح البحث', 'Clear search')} className="w-9 h-9 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 grid place-items-center shrink-0"><Ico d={CLOSE} size={16} /></button>
          : <kbd className="hidden sm:inline-block text-[11px] font-bold text-gray-400 border border-gray-200 rounded-md px-1.5 py-0.5 shrink-0" aria-hidden="true">/</kbd>}
      </div>

      {showRecent && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <span className="inline-flex items-center gap-1 text-[11.5px] text-gray-400"><Ico d={CLOCK} size={13} />{T('آخر البحوث', 'Recent')}</span>
          {recent.map(r => (
            <button key={r.job} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setQ(String(r.job))}
              className="min-h-[34px] px-3 rounded-full border border-gray-200 bg-white text-[12px] font-bold text-gray-700 hover:bg-gray-50">
              <span className="font-mono">{r.job}</span>{r.name ? <span className="text-gray-400 font-semibold"> · {r.name.split(' ')[0]}</span> : null}
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="mt-3 space-y-3">
          {err && <p role="alert" className="text-[12.5px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{err}</p>}

          {!busy && cands && cands.length === 0 && !err && (
            <div className="text-center py-10 bg-white border border-gray-200 rounded-xl text-gray-400 text-sm">{T('ما لقيت موظف بهذا الرقم أو الاسم', 'No employee matches')}</div>
          )}

          {/* مرشّحون متعددون */}
          {cands && cands.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <p className="px-4 py-2.5 text-[12px] font-bold text-gray-500 bg-gray-50 border-b border-gray-100">{T(`${cands.length} موظفين مطابقين، اختر واحداً`, `${cands.length} matches — pick one`)}</p>
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto overscroll-contain">
                {cands.map(u => (
                  <li key={u.id}>
                    <button type="button" onClick={() => pick(u)} className={`w-full flex items-center gap-3 px-4 min-h-[56px] text-start hover:bg-gray-50 ${emp?.id === u.id ? 'bg-emerald-50/60' : ''}`}>
                      <span className="w-9 h-9 rounded-full bg-gray-900 text-white grid place-items-center text-[12px] font-extrabold shrink-0">{initials(u.full_name_ar)}</span>
                      <span className="flex-1 min-w-0">
                        <b dir="auto" className="block text-[13.5px] text-gray-900 truncate">{u.full_name_ar || '—'}</b>
                        <span className="block text-[11.5px] text-gray-500 truncate">{stName(u.station)}</span>
                      </span>
                      <span className="font-mono text-[13px] font-bold text-gray-700 shrink-0">#{u.job_number ?? '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* بطاقة الموظف + الإحصاءات */}
          {emp && (
            <>
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-12 h-12 rounded-full bg-gray-900 text-white grid place-items-center text-[16px] font-extrabold shrink-0">{initials(emp.full_name_ar)}</span>
                  <div className="flex-1 min-w-[160px]">
                    <b dir="auto" className="block text-[16px] text-gray-900 leading-tight">{emp.full_name_ar || '—'}</b>
                    <span className="text-[12px] text-gray-500"><span className="font-mono font-bold text-gray-700">#{emp.job_number}</span> · {stName(emp.station)}</span>
                  </div>
                  <div className="flex gap-1.5" role="group" aria-label={T('الفترة', 'Period')}>
                    {RANGES.map(([d, ar, en]) => (
                      <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
                        className={`min-h-[40px] px-3 rounded-full text-[12px] font-bold border transition ${days === d ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{isAr ? ar : en}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                  {[
                    [T('عدد اليوميات', 'Entries'), loadingRows ? '…' : rows.length, `${stats.confirmed} ${T('مؤكدة', 'confirmed')}`, 'text-gray-900'],
                    [T('إجمالي المحصَّل', 'Collected'), loadingRows ? '…' : fmt(stats.collected), T('ر.س', 'SAR'), 'text-green-700'],
                    [T('صافي الفرق', 'Net difference'), loadingRows ? '…' : `${stats.diff > 0 ? '+' : ''}${fmt(stats.diff)}`, T('ر.س', 'SAR'), stats.diff < 0 ? 'text-red-600' : stats.diff > 0 ? 'text-blue-600' : 'text-gray-500'],
                    [T('أيام عجز', 'Deficit entries'), loadingRows ? '…' : stats.deficitN, stats.deficitN ? `${fmt(stats.deficit)} ${T('ر.س', 'SAR')}` : T('لا يوجد', 'none'), stats.deficitN ? 'text-red-600' : 'text-gray-900'],
                  ].map(([l, v, s, c]) => (
                    <div key={l} className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                      <small className="block text-[11px] font-bold text-gray-500">{l}</small>
                      <b className={`block text-[20px] leading-tight font-extrabold tabular-nums ${c}`}>{v}</b>
                      <span className="text-[11px] text-gray-400">{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* القيود */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                {loadingRows && <p className="px-4 py-10 text-center text-[13px] text-gray-400">{T('جارٍ تحميل اليوميات…', 'Loading entries…')}</p>}
                {!loadingRows && rows.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-gray-400">{T(`لا توجد يوميات لهذا الموظف خلال آخر ${days} يوم`, `No entries in the last ${days} days`)}</p>}
                <ul className="divide-y divide-gray-100">
                  {rows.slice(0, limit).map(r => {
                    const a = actualOf(r), e = Number(r.total_expected ?? 0), d = a - e
                    return (
                      <li key={r.id}>
                        <button type="button" onClick={() => onOpenRecord(r)} className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 min-h-[60px] text-start hover:bg-gray-50 transition">
                          <span className="row-span-2 w-9 h-9 rounded-lg bg-gray-100 text-gray-700 grid place-items-center text-[13px] font-extrabold">{SHIFT_AR[r.shift] ?? r.shift}</span>
                          <b className="text-[13.5px] text-gray-900 tabular-nums">{r.sale_date}</b>
                          <span className="text-[13.5px] font-bold text-gray-900 tabular-nums text-end">{fmt(a)} <small className="text-gray-400 font-semibold">{T('ر.س', 'SAR')}</small></span>
                          <span dir="auto" className="text-[11.5px] text-gray-500 truncate">{stName(r.station)} · {r.is_confirmed ? T('مؤكد', 'Confirmed') : T('قيد المراجعة', 'Pending')}</span>
                          <span className={`text-[11.5px] font-bold tabular-nums text-end ${d < 0 ? 'text-red-600' : d > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{d === 0 ? T('مطابق', 'Matched') : `${d > 0 ? '+' : ''}${fmt(d)}`}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {rows.length > limit && (
                  <button type="button" onClick={() => setLimit(l => l + PAGE)} className="w-full min-h-[48px] text-[13px] font-bold text-gray-700 border-t border-gray-100 hover:bg-gray-50">{T(`عرض المزيد (${rows.length - limit})`, `Show more (${rows.length - limit})`)}</button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

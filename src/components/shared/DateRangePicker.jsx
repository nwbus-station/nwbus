import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { toLocalDateStr } from '../../utils/dates'

/**
 * منتقي فترة حديث (من → إلى) بضغطتين على تقويم واحد بدل حقلين منفصلين.
 * اختصارات جاهزة (اليوم، أمس، آخر 7 أيام…)، شهران متجاوران على الكمبيوتر وشهر واحد على الجوال،
 * معاينة الفترة عند التمرير، وعدّاد الأيام. الأسبوع يبدأ السبت.
 *
 * Props: from, to ('YYYY-MM-DD'), onChange(from, to), isAr, max (افتراضي اليوم), inline (بدون زر/نافذة)
 */

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW_AR = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة']
const DOW_EN = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr']

const pad = n => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalDateStr(d) }
export const spanDays = (a, b) => (a && b ? Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1 : 0)

// الاختصارات — تُحسب لحظة العرض (اليوم يتغير)
export function rangePresets(isAr) {
  const t = toLocalDateStr(), now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const sat = shift(t, -((now.getDay() + 1) % 7))          // بداية الأسبوع (السبت)
  const T = (a, e) => (isAr ? a : e)
  return [
    { id: 'today', label: T('اليوم', 'Today'), from: t, to: t },
    { id: 'yday', label: T('أمس', 'Yesterday'), from: shift(t, -1), to: shift(t, -1) },
    { id: 'd7', label: T('آخر 7 أيام', 'Last 7 days'), from: shift(t, -6), to: t },
    { id: 'd14', label: T('آخر 14 يوماً', 'Last 14 days'), from: shift(t, -13), to: t },
    { id: 'd30', label: T('آخر 30 يوماً', 'Last 30 days'), from: shift(t, -29), to: t },
    { id: 'week', label: T('هذا الأسبوع', 'This week'), from: sat, to: t },
    { id: 'lweek', label: T('الأسبوع الماضي', 'Last week'), from: shift(sat, -7), to: shift(sat, -1) },
    { id: 'month', label: T('هذا الشهر', 'This month'), from: ymd(y, m, 1), to: t },
    { id: 'lmonth', label: T('الشهر الماضي', 'Last month'), from: toLocalDateStr(new Date(y, m - 1, 1)), to: toLocalDateStr(new Date(y, m, 0)) },
    { id: 'q', label: T('آخر 3 أشهر', 'Last 3 months'), from: toLocalDateStr(new Date(y, m - 2, 1)), to: t },
    { id: 'year', label: T('هذا العام', 'This year'), from: ymd(y, 0, 1), to: t },
  ]
}

export function rangeLabel(from, to, isAr) {
  if (!from) return ''
  const M = isAr ? MONTHS_AR : MONTHS_EN
  const p = s => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d } }
  const a = p(from), b = p(to || from)
  if (from === (to || from)) return `${a.d} ${M[a.m]} ${a.y}`
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${M[a.m]} ${a.y}`
  if (a.y === b.y) return `${a.d} ${M[a.m]} – ${b.d} ${M[b.m]} ${a.y}`
  return `${a.d} ${M[a.m]} ${a.y} – ${b.d} ${M[b.m]} ${b.y}`
}

const ICal = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
const IChev = ({ dir }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir === 'l' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>

function Month({ y, m, isAr, a, b, hover, max, onPick, onHover }) {
  const first = (new Date(y, m, 1).getDay() + 1) % 7
  const dim = new Date(y, m + 1, 0).getDate()
  const today = toLocalDateStr()
  const end = b || (a && hover && hover >= a ? hover : null)
  const cells = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push(ymd(y, m, d))
  return (
    <div className="drp-month">
      <div className="drp-dow">{(isAr ? DOW_AR : DOW_EN).map(d => <span key={d}>{d}</span>)}</div>
      <div className="drp-grid" onMouseLeave={() => onHover(null)}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />
          const off = max && iso > max
          const isA = iso === a, isB = iso === end
          const inR = a && end && iso > a && iso < end
          const cls = ['drp-day', isA && 'a', isB && 'b', inR && 'in', iso === today && 'today', off && 'off', isA && end && end !== a && 'ra', isB && end !== a && 'rb'].filter(Boolean).join(' ')
          return (
            <button key={iso} type="button" className={cls} disabled={off} onClick={() => onPick(iso)} onMouseEnter={() => onHover(iso)} aria-pressed={isA || isB || !!inR} aria-label={iso}>
              <span>{Number(iso.slice(8))}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DateRangePicker({ from, to, onChange, isAr = true, max, inline = false, className = '', months: monthsN }) {
  const lim = max === undefined ? toLocalDateStr() : max
  const [open, setOpen] = useState(false)
  const [a, setA] = useState(from), [b, setB] = useState(to)
  const [hover, setHover] = useState(null)
  const base = to || from || toLocalDateStr()
  const [view, setView] = useState(() => { const [y, m] = base.split('-').map(Number); return { y, m: m - 1 } })
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 720)
  const two = monthsN ? monthsN === 2 : wide
  const btnRef = useRef(null), panelRef = useRef(null)
  const [pos, setPos] = useState(null)
  const M = isAr ? MONTHS_AR : MONTHS_EN
  const T = (x, e) => (isAr ? x : e)
  const presets = rangePresets(isAr)
  const active = presets.find(p => p.from === (inline ? from : a) && p.to === (inline ? to : b))

  // مزامنة الحالة الداخلية عند الفتح أو تغيّر القيم من الخارج
  useEffect(() => {
    setA(from); setB(to)
    const [y, m] = (to || from || toLocalDateStr()).split('-').map(Number)
    // على الشاشة العريضة يظهر الشهر الأخير يساراً والذي قبله يميناً
    setView(two ? (m === 1 ? { y: y - 1, m: 11 } : { y, m: m - 2 }) : { y, m: m - 1 })
  }, [from, to, open, two])
  useEffect(() => {
    const r = () => setWide(window.innerWidth >= 720)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return; setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  useLayoutEffect(() => {
    if (!open || inline || !wide) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect(); if (!r) return
      const W = panelRef.current?.offsetWidth || 700, H = panelRef.current?.offsetHeight || 420, P = 8
      let left = isAr ? r.right - W : r.left
      left = Math.max(P, Math.min(left, window.innerWidth - W - P))
      let top = r.bottom + 6
      if (top + H > window.innerHeight - P) top = Math.max(P, r.top - H - 6)
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, inline, wide, isAr])

  // inline: كل اختيار يُطبَّق فوراً (بعد اكتمال الطرفين)
  const commit = (x, y) => { onChange(x, y); if (!inline) setOpen(false) }
  const pick = iso => {
    if (!a || b) { setA(iso); setB(null); return }
    const [x, y] = iso < a ? [iso, a] : [a, iso]
    setA(x); setB(y)
    if (inline) commit(x, y)
  }
  const usePreset = p => {
    setA(p.from); setB(p.to)
    const [y, m] = p.to.split('-').map(Number)
    setView(two ? (m === 1 ? { y: y - 1, m: 11 } : { y, m: m - 2 }) : { y, m: m - 1 })
    commit(p.from, p.to)
  }
  const step = n => setView(v => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const months = two ? [view, (() => { const d = new Date(view.y, view.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })()] : [view]
  const days = spanDays(a, b || a)

  const panel = (
    <div ref={panelRef} dir={isAr ? 'rtl' : 'ltr'} className={`drp-panel${inline ? ' inline' : ''}${!inline && !wide ? ' sheet' : ''}`}
      style={!inline && wide ? { position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' } : undefined}
      role={inline ? undefined : 'dialog'} aria-label={T('اختيار الفترة', 'Choose period')}>
      <div className="drp-presets" role="listbox" aria-label={T('اختصارات', 'Shortcuts')}>
        {presets.map(p => (
          <button key={p.id} type="button" role="option" aria-selected={active?.id === p.id} className={active?.id === p.id ? 'on' : ''} onClick={() => usePreset(p)}>{p.label}</button>
        ))}
      </div>
      <div className="drp-cal">
        <div className="drp-nav">
          <button type="button" onClick={() => step(-1)} aria-label={T('الشهر السابق', 'Previous month')}><IChev dir={isAr ? 'r' : 'l'} /></button>
          <div className="drp-titles">{months.map(v => <b key={`${v.y}-${v.m}`}>{M[v.m]} {v.y}</b>)}</div>
          <button type="button" onClick={() => step(1)} aria-label={T('الشهر التالي', 'Next month')}><IChev dir={isAr ? 'l' : 'r'} /></button>
        </div>
        <div className="drp-months">
          {months.map(v => <Month key={`${v.y}-${v.m}`} y={v.y} m={v.m} isAr={isAr} a={a} b={b} hover={hover} max={lim} onPick={pick} onHover={setHover} />)}
        </div>
        <div className="drp-foot">
          <div className="drp-sum">
            {a ? <><b>{rangeLabel(a, b || a, isAr)}</b><span>{b ? T(`${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : days <= 10 ? 'أيام' : 'يوماً'}`, `${days} day${days === 1 ? '' : 's'}`) : T('اختر يوم النهاية', 'Pick the end day')}</span></> : <span>{T('اختر يوم البداية', 'Pick the start day')}</span>}
          </div>
          {!inline && <>
            <button type="button" className="drp-btn ghost" onClick={() => setOpen(false)}>{T('إلغاء', 'Cancel')}</button>
            <button type="button" className="drp-btn" disabled={!a} onClick={() => commit(a, b || a)}>{T('تطبيق', 'Apply')}</button>
          </>}
        </div>
      </div>
    </div>
  )

  if (inline) return panel
  const d = spanDays(from, to)
  return (
    <>
      <button ref={btnRef} type="button" className={`drp-trigger ${className}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog">
        <ICal />
        <span className="drp-t-main">{rangeLabel(from, to, isAr) || T('اختر الفترة', 'Choose period')}</span>
        {(active || d > 1) && <span className="drp-t-tag">{active ? active.label : T(`${d} يوم`, `${d} days`)}</span>}
      </button>
      {open && createPortal(<>{!wide && <div className="drp-scrim" onClick={() => setOpen(false)} />}{panel}</>, document.body)}
    </>
  )
}

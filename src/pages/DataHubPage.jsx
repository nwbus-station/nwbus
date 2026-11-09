import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import DataGrid from '../components/datahub/DataGrid'
import { HUB_GROUPS, HUB_SETS, PERIODS, resolvePeriod, riyadhToday, loadHubSet, inferCols, exportViewXlsx } from '../utils/dataHub'

// مركز البيانات المباشر: كل أقسام النظام في شبكة بنمط Excel، تتحدث لحظياً عند أي تغيير (أدمن عام فقط).
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

export default function DataHubPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const T = (a, e) => (isAr ? a : e)

  const [setId, setSetId] = useState(() => { const s = localStorage.getItem('hub_set'); return HUB_SETS.some(x => x.id === s) ? s : 'sales' })
  // الفترة: اليوم افتراضياً (المباشر = حق اليوم). لا تُحفظ بين الزيارات حتى لا يفتح المستخدم على فترة قديمة بالخطأ
  const [period, setPeriod] = useState({ mode: 'today' })
  const pKey = `${period.mode}|${period.from || ''}|${period.to || ''}`
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [lastAt, setLastAt] = useState(null)
  const [live, setLive] = useState(true)
  const [q, setQ] = useState('')
  const [counts, setCounts] = useState({})
  const [density, setDensity] = useState(() => Number(localStorage.getItem('hub_density')) || 34)
  const [exporting, setExporting] = useState(false)
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem('hub_nav') !== '0')
  const toggleNav = () => setNavOpen(o => { localStorage.setItem('hub_nav', o ? '0' : '1'); return !o })
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  const [vh, setVh] = useState(() => window.innerHeight)
  const viewRef = useRef({ rows: [], cols: [] })
  const seq = useRef(0)
  const slotRef = useRef(null)
  const [slotTop, setSlotTop] = useState(0)
  // الجدول يملأ الشاشة من مكانه الفعلي حتى أسفلها (بدون تمرير للصفحة)
  useLayoutEffect(() => {
    const m = () => { const el = slotRef.current; if (el) setSlotTop(Math.round(el.getBoundingClientRect().top + window.scrollY)) }
    m(); window.addEventListener('resize', m)
    return () => window.removeEventListener('resize', m)
  })
  const def = HUB_SETS.find(s => s.id === setId) || HUB_SETS[0]

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const f = () => setIsDesktop(mq.matches), g = () => setVh(window.innerHeight)
    mq.addEventListener('change', f); window.addEventListener('resize', g)
    return () => { mq.removeEventListener('change', f); window.removeEventListener('resize', g) }
  }, [])

  const load = useCallback(async (silent = false) => {
    const my = ++seq.current
    if (!silent) { setLoading(true); setErr('') }
    try {
      const [pf, pt] = resolvePeriod(period)
      const data = await loadHubSet(setId, pf, pt)
      if (my !== seq.current) return
      setRows(data); setLastAt(new Date()); setErr('')
      setCounts(c => ({ ...c, [setId]: data.length }))
    } catch (e) {
      if (my !== seq.current) return
      if (!silent) { setRows([]); setErr(e.message) }
    }
    if (my === seq.current) setLoading(false)
  }, [setId, pKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // تحميل عند تغيير القسم أو الفترة
  useEffect(() => { setRows([]); setQ(''); load(false) }, [load])

  // تحديث لحظي: أي تغيير بالجدول الأصلي يعيد الجلب بصمت (مع تجميع التغييرات المتقاربة) + دورياً كاحتياط
  useEffect(() => {
    if (!live) return
    let t = null
    const ch = supabase.channel(`datahub_${def.table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: def.table }, () => { clearTimeout(t); t = setTimeout(() => load(true), 900) })
      .subscribe()
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, 60000)
    return () => { clearTimeout(t); clearInterval(poll); supabase.removeChannel(ch) }
  }, [live, def.table, load])

  const cols = useMemo(() => inferCols(rows, setId), [rows, setId])
  const pick = id => { setSetId(id); localStorage.setItem('hub_set', id) }
  const [pf, pt] = resolvePeriod(period)
  const periodText = period.mode === 'all' ? T('كل الفترات', 'All time') : pf === pt ? pf : `${pf} ← ${pt}`
  const changeDensity = v => { setDensity(v); localStorage.setItem('hub_density', String(v)) }

  async function exportView() {
    const v = viewRef.current
    if (!v.rows.length) return
    setExporting(true)
    try {
      const stamp = new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
      await exportViewXlsx({ isAr, title: isAr ? def.ar : def.en, subtitle: `${T('الصفوف', 'Rows')}: ${v.rows.length} · ${T('تاريخ الإصدار', 'Generated')}: ${stamp}`, cols: v.cols, rows: v.rows, filename: `${def.id}_${new Date().toISOString().slice(0, 10)}` })
    } catch (e) { setErr(e?.message || String(e)) }
    setExporting(false)
  }

  const dateInput = { minHeight: 38, border: '1px solid var(--border-2)', borderRadius: 9, padding: '0 10px', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.84rem' }
  const groupColor = HUB_GROUPS.find(g => g.id === def.group)?.color || 'var(--accent)'
  // 92 = شريط أدوات الشبكة + شريط الحالة، والباقي هامش سفلي (وشريط التنقل السفلي بالجوال)
  const gridH = Math.max(300, vh - slotTop - 92 - (isDesktop ? 22 : 80))
  const chip = (on) => ({ minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, background: on ? 'var(--gold-dim)' : 'var(--card)', color: 'var(--text-1)', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 })

  return (
    <div style={{ padding: isDesktop ? '14px 20px' : '12px 10px', maxWidth: 2200, margin: '0 auto' }} dir={isAr ? 'rtl' : 'ltr'}>
      {/* الرأس: سطر واحد مضغوط (القسم + الحالة + الأدوات) لتبقى أغلب الشاشة للبيانات */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {isDesktop && (
          <button type="button" onClick={toggleNav} style={chip(false)} aria-pressed={navOpen} title={T('إظهار/إخفاء قائمة الأقسام', 'Show/hide sections list')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            {T('الأقسام', 'Sections')}
          </button>
        )}
        {isDesktop && !navOpen && (
          <select value={setId} onChange={e => pick(e.target.value)} aria-label={T('القسم', 'Section')} style={{ ...chip(false), paddingInlineEnd: 8 }}>
            {HUB_GROUPS.map(g => <optgroup key={g.id} label={isAr ? g.ar : g.en}>{HUB_SETS.filter(x => x.group === g.id).map(x => <option key={x.id} value={x.id}>{isAr ? x.ar : x.en}</option>)}</optgroup>)}
          </select>
        )}
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 auto' }}>
          <i style={{ width: 5, height: 28, borderRadius: 2, background: groupColor, flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-3)' }}>{T('مركز البيانات', 'Data Center')}</div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
              {isAr ? def.ar : def.en}{' '}
              <span style={{ fontFamily: MONO, fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-3)' }}>{loading && !rows.length ? '…' : rows.length.toLocaleString('en-US')}</span>
            </h1>
          </div>
        </div>
        <button type="button" onClick={() => setLive(l => !l)} aria-pressed={live} title={T('تشغيل/إيقاف التحديث اللحظي', 'Toggle live updates')}
          style={{ ...chip(false), borderRadius: 99, fontSize: '0.72rem' }}>
          <i className={live ? 'tp-pulse' : undefined} style={{ width: 9, height: 9, borderRadius: '50%', background: live ? '#10b981' : '#94a3b8' }} />
          {live ? T('مباشر', 'LIVE') : T('متوقف', 'Paused')}
          {lastAt && <span dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-3)' }}>{lastAt.toLocaleTimeString('en-GB', { hour12: false })}</span>}
        </button>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={T('بحث في القسم…', 'Search this section…')} aria-label={T('بحث', 'Search')}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 40, border: '1px solid var(--border-2)', borderRadius: 10, padding: '0 12px', paddingInlineStart: 36, fontSize: '0.84rem', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--text-1)' }} />
        </div>
        <div role="group" aria-label={T('الكثافة', 'Density')} style={{ display: 'inline-flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
          {[[28, T('مضغوط', 'Compact')], [34, T('عادي', 'Normal')], [44, T('مريح', 'Comfortable')]].map(([h, l]) => (
            <button key={h} type="button" aria-pressed={density === h} onClick={() => changeDensity(h)} style={{ border: 'none', borderRadius: 8, minHeight: 34, padding: '0 11px', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', background: density === h ? 'var(--card)' : 'transparent', color: density === h ? 'var(--text-1)' : 'var(--text-3)', boxShadow: density === h ? '0 1px 4px rgba(0,0,0,.16)' : 'none' }}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={() => load(false)} style={chip(false)} title={T('تحديث الآن', 'Refresh now')}>{T('تحديث', 'Refresh')}</button>
        <button type="button" onClick={exportView} disabled={exporting || !rows.length} style={{ ...chip(true), opacity: exporting || !rows.length ? 0.55 : 1 }}>{exporting ? T('جارٍ التجهيز…', 'Preparing…') : T('تنزيل Excel', 'Download Excel')}</button>
      </div>

      {def.dated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <div role="group" aria-label={T('الفترة', 'Period')} style={{ display: 'inline-flex', flexWrap: 'wrap', background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
            {PERIODS.map(([m, ar, en]) => {
              const on = period.mode === m
              return <button key={m} type="button" aria-pressed={on} onClick={() => setPeriod({ mode: m })}
                style={{ border: 'none', borderRadius: 8, minHeight: 36, padding: '0 14px', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', background: on ? 'var(--solid-btn)' : 'transparent', color: on ? '#fff' : 'var(--text-2)' }}>{isAr ? ar : en}</button>
            })}
            <button type="button" aria-pressed={period.mode === 'custom'} onClick={() => setPeriod(p => (p.mode === 'custom' ? p : { mode: 'custom', from: pf, to: pt }))}
              style={{ border: 'none', borderRadius: 8, minHeight: 36, padding: '0 14px', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', background: period.mode === 'custom' ? 'var(--solid-btn)' : 'transparent', color: period.mode === 'custom' ? '#fff' : 'var(--text-2)' }}>{T('تاريخ محدد', 'Custom')}</button>
          </div>
          {period.mode === 'custom' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>{T('من', 'From')}
                <input type="date" value={period.from || ''} max={riyadhToday()} onChange={e => setPeriod(p => ({ ...p, from: e.target.value, to: p.to && p.to < e.target.value ? e.target.value : p.to }))} style={dateInput} />
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>{T('إلى', 'To')}
                <input type="date" value={period.to || ''} min={period.from || ''} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} style={dateInput} />
              </label>
            </div>
          )}
          <span dir="ltr" style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>{periodText}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isDesktop && navOpen ? '230px minmax(0, 1fr)' : '1fr', gap: 14, alignItems: 'start' }}>
        {/* قائمة الأقسام */}
        {isDesktop && navOpen ? (
          <nav aria-label={T('أقسام البيانات', 'Data sections')} style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 8, maxHeight: gridH + 92, overflowY: 'auto', position: 'sticky', top: 8 }}>
            {HUB_GROUPS.map(g => (
              <div key={g.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 4px', fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-3)' }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{isAr ? g.ar : g.en}
                </div>
                {HUB_SETS.filter(s => s.group === g.id).map(s => {
                  const on = s.id === setId
                  return (
                    <button key={s.id} type="button" onClick={() => pick(s.id)} aria-current={on ? 'page' : undefined}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '6px 10px', border: 'none', borderRadius: 10, background: on ? 'var(--gold-dim)' : 'transparent', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: on ? 900 : 600, cursor: 'pointer', textAlign: 'start', borderInlineStart: `3px solid ${on ? g.color : 'transparent'}` }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isAr ? s.ar : s.en}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        ) : !isDesktop ? (
          <select value={setId} onChange={e => pick(e.target.value)} aria-label={T('القسم', 'Section')}
            style={{ minHeight: 48, borderRadius: 12, border: '1px solid var(--border-2)', padding: '0 12px', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 800, fontSize: '0.9rem', fontFamily: 'inherit' }}>
            {HUB_GROUPS.map(g => <optgroup key={g.id} label={isAr ? g.ar : g.en}>{HUB_SETS.filter(s => s.group === g.id).map(s => <option key={s.id} value={s.id}>{isAr ? s.ar : s.en}</option>)}</optgroup>)}
          </select>
        ) : null}

        {/* المحتوى */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {err === 'SETUP' && (
            <div role="alert" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--warning-bg, #fffbeb)', border: '1px solid var(--border-2)', color: 'var(--text-1)', lineHeight: 1.9, fontSize: '0.86rem' }}>
              <b>{T('الاتصال لم يُجهَّز بعد.', 'Not set up yet.')}</b> {T('شغّل ملف SQL «022_excel_feed_admin» في Supabase (دالة + صلاحيات) ثم حدّث الصفحة.', 'Run the “022_excel_feed_admin” SQL in Supabase (function + grants) and refresh.')}
            </div>
          )}
          {err && err !== 'SETUP' && <div role="alert" style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--danger-bg, #fef2f2)', color: 'var(--danger, #dc2626)', fontWeight: 700, fontSize: '0.84rem' }}>{err}</div>}

          <div ref={slotRef}>
          {loading && !rows.length && !err
            ? <div style={{ display: 'grid', placeItems: 'center', height: gridH, border: '1px solid var(--border-2)', borderRadius: 14, background: 'var(--card)', color: 'var(--text-3)', fontWeight: 800 }}>{T('جارٍ تحميل البيانات…', 'Loading data…')}</div>
            : !err && (rows.length === 0
              ? <div style={{ display: 'grid', placeItems: 'center', height: 240, border: '1px solid var(--border-2)', borderRadius: 14, background: 'var(--card)', color: 'var(--text-3)', fontWeight: 800 }}>{period.mode === 'today' ? T('لا توجد بيانات اليوم حتى الآن — تظهر هنا لحظياً فور تسجيلها', 'Nothing today yet — new records appear here live') : T('لا توجد بيانات في هذا القسم للفترة المختارة', 'No data in this section for the selected period')}</div>
              : <DataGrid key={setId} cols={cols} rows={rows} isAr={isAr} rowH={density} search={q} height={gridH} onView={v => { viewRef.current = v }} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

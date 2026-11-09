import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import DataGrid from '../components/datahub/DataGrid'
import { HUB_GROUPS, HUB_SETS, loadHubSet, inferCols, exportViewXlsx } from '../utils/dataHub'

// مركز البيانات المباشر: كل أقسام النظام في شبكة بنمط Excel، تتحدث لحظياً عند أي تغيير (أدمن عام فقط).
const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const DAY_OPTS = [[30, '30 يوماً', '30 days'], [90, '90 يوماً', '90 days'], [180, '180 يوماً', '180 days'], [365, 'سنة', '1 year'], [1500, 'كل المتاح', 'All']]

export default function DataHubPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const T = (a, e) => (isAr ? a : e)

  const [setId, setSetId] = useState(() => { const s = localStorage.getItem('hub_set'); return HUB_SETS.some(x => x.id === s) ? s : 'sales' })
  const [days, setDays] = useState(() => Number(localStorage.getItem('hub_days')) || 90)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [lastAt, setLastAt] = useState(null)
  const [live, setLive] = useState(true)
  const [q, setQ] = useState('')
  const [counts, setCounts] = useState({})
  const [density, setDensity] = useState(() => Number(localStorage.getItem('hub_density')) || 34)
  const [exporting, setExporting] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  const [vh, setVh] = useState(() => window.innerHeight)
  const viewRef = useRef({ rows: [], cols: [] })
  const seq = useRef(0)
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
      const data = await loadHubSet(setId, days)
      if (my !== seq.current) return
      setRows(data); setLastAt(new Date()); setErr('')
      setCounts(c => ({ ...c, [setId]: data.length }))
    } catch (e) {
      if (my !== seq.current) return
      if (!silent) { setRows([]); setErr(e.message) }
    }
    if (my === seq.current) setLoading(false)
  }, [setId, days])

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

  const cols = useMemo(() => inferCols(rows), [rows])
  const pick = id => { setSetId(id); localStorage.setItem('hub_set', id) }
  const changeDays = v => { setDays(v); localStorage.setItem('hub_days', String(v)) }
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

  const groupColor = HUB_GROUPS.find(g => g.id === def.group)?.color || 'var(--accent)'
  const gridH = Math.max(380, vh - (isDesktop ? 330 : 400))
  const chip = (on) => ({ minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, background: on ? 'var(--gold-dim)' : 'var(--card)', color: 'var(--text-1)', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 })

  return (
    <div style={{ padding: isDesktop ? '20px 24px' : '14px 12px', maxWidth: 1800, margin: '0 auto' }} dir={isAr ? 'rtl' : 'ltr'}>
      {/* الرأس */}
      <div style={{ background: 'linear-gradient(135deg, var(--solid-1, #1C2B4A), var(--solid-2, #264673))', color: '#fff', borderRadius: 18, padding: '18px 22px', marginBottom: 14, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900 }}>{T('مركز البيانات المباشر', 'Live Data Center')}</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', opacity: 0.8 }}>{T('كل أقسام النظام في مكان واحد بشكل Excel، وتتحدث لحظياً عند أي تغيير', 'Every part of the system in one Excel-style grid, updating live on every change')}</p>
          </div>
          <button type="button" onClick={() => setLive(l => !l)} aria-pressed={live} title={T('تشغيل/إيقاف التحديث اللحظي', 'Toggle live updates')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className={live ? 'tp-pulse' : undefined} style={{ width: 9, height: 9, borderRadius: '50%', background: live ? '#34D399' : '#94a3b8' }} />
            {live ? T('مباشر', 'LIVE') : T('متوقف', 'Paused')}
            {lastAt && <span dir="ltr" style={{ fontFamily: MONO, opacity: 0.8 }}>{lastAt.toLocaleTimeString('en-GB', { hour12: false })}</span>}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
          {[[T('القسم', 'Section'), isAr ? def.ar : def.en, groupColor], [T('الصفوف', 'Rows'), loading && !rows.length ? '…' : rows.length.toLocaleString('en-US'), '#fff'], [T('الأعمدة', 'Columns'), cols.length || '—', '#fff'], [T('الفترة', 'Period'), def.dated ? (isAr ? DAY_OPTS.find(o => o[0] === days)?.[1] : DAY_OPTS.find(o => o[0] === days)?.[2]) : T('كل السجلات', 'All records'), '#fff']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: '8px 12px' }}>
              <div style={{ fontSize: '0.62rem', opacity: 0.7, fontWeight: 800 }}>{l}</div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: c === groupColor ? '#fff' : c, borderInlineStart: c === groupColor ? `4px solid ${groupColor}` : 'none', paddingInlineStart: c === groupColor ? 8 : 0, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '250px minmax(0, 1fr)' : '1fr', gap: 14, alignItems: 'start' }}>
        {/* قائمة الأقسام */}
        {isDesktop ? (
          <nav aria-label={T('أقسام البيانات', 'Data sections')} style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 8, maxHeight: gridH + 120, overflowY: 'auto' }}>
            {HUB_GROUPS.map(g => (
              <div key={g.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 4px', fontSize: '0.66rem', fontWeight: 900, letterSpacing: '.06em', color: 'var(--text-3)' }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{isAr ? g.ar : g.en}
                </div>
                {HUB_SETS.filter(s => s.group === g.id).map(s => {
                  const on = s.id === setId
                  return (
                    <button key={s.id} type="button" onClick={() => pick(s.id)} aria-current={on ? 'page' : undefined}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '6px 10px', border: 'none', borderRadius: 10, background: on ? 'var(--gold-dim)' : 'transparent', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: on ? 900 : 600, cursor: 'pointer', textAlign: 'start', borderInlineStart: `3px solid ${on ? g.color : 'transparent'}` }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isAr ? s.ar : s.en}</span>
                      {counts[s.id] !== undefined && <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: 'var(--text-3)' }}>{counts[s.id].toLocaleString('en-US')}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        ) : (
          <select value={setId} onChange={e => pick(e.target.value)} aria-label={T('القسم', 'Section')}
            style={{ minHeight: 48, borderRadius: 12, border: '1px solid var(--border-2)', padding: '0 12px', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 800, fontSize: '0.9rem', fontFamily: 'inherit' }}>
            {HUB_GROUPS.map(g => <optgroup key={g.id} label={isAr ? g.ar : g.en}>{HUB_SETS.filter(s => s.group === g.id).map(s => <option key={s.id} value={s.id}>{isAr ? s.ar : s.en}</option>)}</optgroup>)}
          </select>
        )}

        {/* المحتوى */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={T('بحث في كل أعمدة القسم…', 'Search all columns…')} aria-label={T('بحث', 'Search')}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 40, border: '1px solid var(--border-2)', borderRadius: 10, padding: '0 12px', paddingInlineStart: 36, fontSize: '0.84rem', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--text-1)' }} />
            </div>
            {def.dated && (
              <select value={days} onChange={e => changeDays(Number(e.target.value))} aria-label={T('الفترة', 'Period')} style={{ ...chip(false), paddingInlineEnd: 8 }}>
                {DAY_OPTS.map(([d, ar, en]) => <option key={d} value={d}>{isAr ? ar : en}</option>)}
              </select>
            )}
            <div role="group" aria-label={T('الكثافة', 'Density')} style={{ display: 'inline-flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
              {[[28, T('مضغوط', 'Compact')], [34, T('عادي', 'Normal')], [44, T('مريح', 'Comfortable')]].map(([h, l]) => (
                <button key={h} type="button" aria-pressed={density === h} onClick={() => changeDensity(h)} style={{ border: 'none', borderRadius: 8, minHeight: 34, padding: '0 11px', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', background: density === h ? 'var(--card)' : 'transparent', color: density === h ? 'var(--text-1)' : 'var(--text-3)', boxShadow: density === h ? '0 1px 4px rgba(0,0,0,.16)' : 'none' }}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={() => load(false)} style={chip(false)} title={T('تحديث الآن', 'Refresh now')}>{T('تحديث', 'Refresh')}</button>
            <button type="button" onClick={exportView} disabled={exporting || !rows.length} style={{ ...chip(true), opacity: exporting || !rows.length ? 0.55 : 1 }}>{exporting ? T('جارٍ التجهيز…', 'Preparing…') : T('تنزيل Excel', 'Download Excel')}</button>
          </div>

          {err === 'SETUP' && (
            <div role="alert" style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--warning-bg, #fffbeb)', border: '1px solid var(--border-2)', color: 'var(--text-1)', lineHeight: 1.9, fontSize: '0.86rem' }}>
              <b>{T('الاتصال لم يُجهَّز بعد.', 'Not set up yet.')}</b> {T('شغّل ملف SQL «022_excel_feed_admin» في Supabase (دالة + صلاحيات) ثم حدّث الصفحة.', 'Run the “022_excel_feed_admin” SQL in Supabase (function + grants) and refresh.')}
            </div>
          )}
          {err && err !== 'SETUP' && <div role="alert" style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--danger-bg, #fef2f2)', color: 'var(--danger, #dc2626)', fontWeight: 700, fontSize: '0.84rem' }}>{err}</div>}

          {loading && !rows.length && !err
            ? <div style={{ display: 'grid', placeItems: 'center', height: gridH, border: '1px solid var(--border-2)', borderRadius: 14, background: 'var(--card)', color: 'var(--text-3)', fontWeight: 800 }}>{T('جارٍ تحميل البيانات…', 'Loading data…')}</div>
            : !err && (rows.length === 0
              ? <div style={{ display: 'grid', placeItems: 'center', height: 240, border: '1px solid var(--border-2)', borderRadius: 14, background: 'var(--card)', color: 'var(--text-3)', fontWeight: 800 }}>{T('لا توجد بيانات في هذا القسم للفترة المختارة', 'No data in this section for the selected period')}</div>
              : <DataGrid key={setId} cols={cols} rows={rows} isAr={isAr} rowH={density} search={q} height={gridH} onView={v => { viewRef.current = v }} />)}
        </div>
      </div>
    </div>
  )
}

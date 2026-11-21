import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { canPickFolder, savePdfFolder } from '../../utils/pdfFolder'
import DateRangePicker, { spanDays } from '../shared/DateRangePicker'
import { EXEC_SECTIONS, EXEC_CSS, REPORT_NAME, REPORT_SUB, buildExecModel, buildExecDocument, openExecPreview } from '../../utils/execReport'

// منشئ «بوصلة الأداء»: الفترة + المحطات (فيها يوزر / الوكلاء / بدون يوزر) + الأقسام وخياراتها،
// ثم معاينة وطباعة مستند واحد، أو حفظ مجلد PDF (ملف للتقرير + ملف لكل محطة).
const norm = s => String(s ?? '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? d } catch { return d } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* تخزين غير متاح */ } }
const Ico = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{[].concat(d).map((p, i) => <path key={i} d={p} />)}</svg>
const I = {
  compass: ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  print: ['M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2', 'M6 14h12v8H6z'],
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
}

export default function ExecReportModal({ isAr, supabase, stations, staff, from: from0, to: to0, onDates, allowed, canSales, activeOnly, preparedBy, onClose }) {
  useBodyScrollLock()
  const T = (a, e) => (isAr ? a : e)
  const [from, setFrom] = useState(from0), [to, setTo] = useState(to0)
  const [pane, setPane] = useState('pick')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(''), [done, setDone] = useState(null)

  // تصنيف المحطات: الوكلاء أولاً كفئة مستقلة، ثم التي فيها يوزر، ثم البقية
  const kindOf = s => (s.is_agent ? 'agent' : (staff[s.id] || 0) > 0 ? 'staffed' : 'empty')
  const groups = useMemo(() => ({
    staffed: stations.filter(s => kindOf(s) === 'staffed'),
    agent: stations.filter(s => kindOf(s) === 'agent'),
    empty: stations.filter(s => kindOf(s) === 'empty'),
  }), [stations, staff])   // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, _setSel] = useState(() => {
    const saved = load('xr_sel', null)
    const valid = Array.isArray(saved) ? saved.filter(id => stations.some(s => s.id === id)) : []
    return new Set(valid.length ? valid : [...groups.staffed, ...groups.agent].map(s => s.id))
  })
  const setSel = next => { _setSel(next); save('xr_sel', [...next]) }
  // لو وصلت قائمة المحطات بعد الفتح وما فيه اختيار محفوظ: الافتراضي فيها يوزر + الوكلاء
  useEffect(() => { if (!sel.size && stations.length) setSel(new Set([...groups.staffed, ...groups.agent].map(s => s.id))) }, [stations.length])   // eslint-disable-line react-hooks/exhaustive-deps

  const avail = EXEC_SECTIONS.filter(s => (s.id === 'sales' ? canSales && allowed(s.cap) : !s.cap || allowed(s.cap)))
  const [secs, _setSecs] = useState(() => { const v = load('xr_secs', null); return Array.isArray(v) ? v : EXEC_SECTIONS.map(s => s.id) })
  const setSecs = v => { _setSecs(v); save('xr_secs', v) }
  const chosen = avail.map(s => s.id).filter(id => secs.includes(id))
  const [opt, _setOpt] = useState(() => ({ details: true, withUnentered: false, tickets: false, growth: false, ...load('xr_opt', {}) }))
  const setOpt = (k, v) => { const n = { ...opt, [k]: v }; _setOpt(n); save('xr_opt', n) }

  useEffect(() => {
    const k = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, busy])

  const nameOf = s => (isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'
  const term = norm(q)
  const shown = stations.filter(s => !term || norm(s.name_ar).includes(term) || norm(s.name_en).includes(term))
    .sort((a, b) => ['agent', 'staffed', 'empty'].indexOf(kindOf(a)) - ['agent', 'staffed', 'empty'].indexOf(kindOf(b)) || nameOf(a).localeCompare(nameOf(b), isAr ? 'ar' : 'en'))
  const toggle = id => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  const groupOn = g => groups[g].length > 0 && groups[g].every(s => sel.has(s.id))
  const toggleGroup = g => { const n = new Set(sel); const on = groupOn(g); groups[g].forEach(s => (on ? n.delete(s.id) : n.add(s.id))); setSel(n) }
  const picked = stations.filter(s => sel.has(s.id))
  const nAgents = picked.filter(s => s.is_agent).length
  // «بلا وكلاء»: يشيل كل الوكلاء من الاختيار بضغطة (وضغطة ثانية ترجعهم)
  const noAgents = picked.length > 0 && nAgents === 0
  const toggleNoAgents = () => { const n = new Set(sel); groups.agent.forEach(s => (noAgents ? n.add(s.id) : n.delete(s.id))); setSel(n) }
  const days = spanDays(from, to)

  const scopeLabel = picked.length === 1 ? nameOf(picked[0])
    : picked.length === stations.length ? T('جميع المحطات', 'All stations')
      : [picked.length - nAgents && T(`${picked.length - nAgents} محطة`, `${picked.length - nAgents} stations`), nAgents && T(`${nAgents} وكيل`, `${nAgents} agents`)].filter(Boolean).join(T(' + ', ' + '))
  const kindName = days === 1 ? T('يومي', 'Daily') : days === 7 ? T('أسبوعي', 'Weekly') : T(`${days} يوماً`, `${days} days`)
  const docTitle = `${T(REPORT_NAME.ar, REPORT_NAME.en)} — ${kindName} — ${from === to ? from : `${from} ${T('إلى', 'to')} ${to}`}`

  const ready = picked.length > 0 && chosen.length > 0 && from && to
  const build = async () => {
    const model = await buildExecModel({ supabase, isAr, from, to, stations: picked, sections: new Set(chosen), activeOnly, growth: !!opt.growth, onProgress: m => setBusy(b => ({ ...(b || {}), msg: m })) })
    return { model, doc: buildExecDocument(model, { sections: chosen, opts: opt, preparedBy, scopeLabel }) }
  }

  const preview = async () => {
    setErr(''); setDone(null)
    // النافذة تُفتح فوراً مع الضغطة (وإلا يمنعها المتصفح بعد انتظار البيانات)
    const w = window.open('', '_blank')
    if (w) w.document.write(`<p style="font-family:system-ui;padding:40px;text-align:center;color:#475569" dir="rtl">${T('جارٍ تجهيز التقرير…', 'Preparing the report…')}</p>`)
    setBusy({ msg: T('بدء…', 'Starting…') })
    try {
      onDates?.(from, to)
      const { doc } = await build()
      if (!openExecPreview(doc.pages.join(''), docTitle, isAr, w)) setErr(T('اسمح بالنوافذ المنبثقة لعرض التقرير', 'Allow pop-ups to view the report'))
    } catch (e) { w?.close(); setErr(T('تعذّر إنشاء التقرير: ', 'Could not build the report: ') + (e?.message || '')) }
    finally { setBusy(null) }
  }

  const savePdf = async via => {
    setErr(''); setDone(null)
    let dirHandle
    if (via === 'folder') {
      try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }) }
      catch (e) { if (e?.name !== 'AbortError') setErr(T('تعذّر فتح المجلد، جرّب ZIP', 'Could not open the folder, try ZIP')); return }
    }
    setBusy({ msg: T('بدء…', 'Starting…') })
    try {
      onDates?.(from, to)
      const { doc } = await build()
      const main = doc.pages.filter(p => !p.includes('class="stn"'))
      const files = []
      if (main.length) files.push({ name: `00 - ${T(REPORT_NAME.ar, REPORT_NAME.en)} - ${T('التقرير', 'Report')}`, html: `<div class="doc">${main.join('')}</div>` })
      if (chosen.includes('sheets')) doc.sheetPages.filter(s => !s.idle).forEach((s, i) => files.push({ name: `${String(i + 1).padStart(2, '0')} - ${s.P.name}`, html: `<div class="doc">${doc.page(T('كشف المحطة', 'Station sheet'), s.html)}</div>` }))
      const css = `${EXEC_CSS} .doc{margin:0!important;max-width:none!important}.pg{box-shadow:none!important;border-radius:0!important;margin:0!important;padding:6px 8px!important}`
      const r = await savePdfFolder(files, { via, dirHandle, css, folderName: `${T(REPORT_NAME.ar, REPORT_NAME.en)} ${from === to ? from : `${from} - ${to}`}`, onProgress: (i, total, name) => setBusy({ msg: T('إنشاء ملفات PDF…', 'Creating PDFs…'), i, total, name }) })
      setDone(r)
    } catch (e) { setErr(T('تعذّر إنشاء الملفات: ', 'Could not create files: ') + (e?.message || '')) }
    finally { setBusy(null) }
  }

  const GROUPS = [
    { id: 'staffed', label: T('فيها يوزر', 'With users') },
    { id: 'agent', label: T('الوكلاء', 'Agents') },
    { id: 'empty', label: T('بدون يوزر', 'No users') },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={T(REPORT_NAME.ar, REPORT_NAME.en)} className="fd-sheet xr-sheet" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="fd-head xr-head">
          <span className="fd-head-ico xr-ico"><Ico d={I.compass} size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="fd-title">{T(REPORT_NAME.ar, REPORT_NAME.en)} <span className="xr-sub">{T(REPORT_SUB.ar, REPORT_SUB.en)}</span></h2>
            <p className="fd-sub">{T('اختر الفترة والمحطات والأقسام — الوصول والمغادرة منفصلان دائماً', 'Choose period, stations and sections — arrivals and departures always separate')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="fd-x" aria-label={T('إغلاق', 'Close')}><Ico d={I.x} size={18} /></button>
        </header>

        <div className="fd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={pane === 'pick'} className={pane === 'pick' ? 'on' : ''} onClick={() => setPane('pick')}>{T('المحطات', 'Stations')} <b>{picked.length}</b></button>
          <button type="button" role="tab" aria-selected={pane === 'set'} className={pane === 'set' ? 'on' : ''} onClick={() => setPane('set')}>{T('الفترة والأقسام', 'Period & sections')} <b>{chosen.length}</b></button>
        </div>

        <div className="fd-body">
          {/* ── المحطات ── */}
          <section className={`fd-pane${pane === 'pick' ? ' show' : ''}`} aria-label={T('المحطات', 'Stations')}>
            <div className="xr-groups">
              {GROUPS.map(g => groups[g.id].length > 0 && (
                <button key={g.id} type="button" aria-pressed={groupOn(g.id)} className={`xr-group${groupOn(g.id) ? ' on' : ''} k-${g.id}`} onClick={() => toggleGroup(g.id)}>
                  <b>{groups[g.id].filter(s => sel.has(s.id)).length}<small>/{groups[g.id].length}</small></b><span>{g.label}</span>
                </button>
              ))}
              {groups.agent.length > 0 && (
                <button type="button" aria-pressed={noAgents} className={`xr-group k-noagent${noAgents ? ' on' : ''}`} onClick={toggleNoAgents}>
                  <b>{picked.length - nAgents}</b><span>{T('بلا وكلاء', 'No agents')}</span>
                </button>
              )}
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={T('ابحث عن محطة…', 'Search stations…')} className="fd-search" />
            <div className="fd-chips">
              <button type="button" className="fd-link" onClick={() => setSel(new Set(stations.map(s => s.id)))}>{T('تحديد الكل', 'Select all')}</button>
              <button type="button" className="fd-link fd-link-d" onClick={() => setSel(new Set())} disabled={!sel.size}>{T('مسح', 'Clear')}</button>
              <span className="fd-chips-sp" />
              <span className="fd-bulk-l">{T(`${picked.length} محددة`, `${picked.length} selected`)}</span>
            </div>
            <div className="fd-list">
              {shown.length === 0 && <p className="fd-empty-s">{T('لا توجد محطات مطابقة', 'No matching stations')}</p>}
              {shown.map(s => {
                const n = staff[s.id] || 0, on = sel.has(s.id), k = kindOf(s)
                return (
                  <label key={s.id} className={`fd-row${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                    <span className="fd-row-n">{nameOf(s)}{k === 'agent' && <i>{T('وكيل', 'Agent')}</i>}</span>
                    <span className={`fd-row-u${n > 0 ? ' has' : ''}`}>{n > 0 ? T(`${n} يوزر`, `${n} users`) : T('بلا يوزر', 'No users')}</span>
                  </label>
                )
              })}
            </div>
          </section>

          {/* ── الفترة والأقسام ── */}
          <section className={`fd-pane${pane === 'set' ? ' show' : ''}`} aria-label={T('الفترة والأقسام', 'Period & sections')}>
            <h3 className="xr-h">{T('الفترة', 'Period')}</h3>
            <DateRangePicker inline months={1} isAr={isAr} from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b) }} />

            <div className="xr-h-row">
              <h3 className="xr-h">{T('أقسام التقرير', 'Report sections')}</h3>
              <span className="fd-chips-sp" />
              <button type="button" className="fd-link" onClick={() => setSecs(EXEC_SECTIONS.map(s => s.id))}>{T('الكل', 'All')}</button>
              <button type="button" className="fd-link fd-link-d" onClick={() => setSecs([])}>{T('لا شيء', 'None')}</button>
            </div>
            <label className="xr-opt">
              <input type="checkbox" checked={!!opt.growth} onChange={e => setOpt('growth', e.target.checked)} />
              <span><b>{T('إظهار النمو والمقارنة', 'Show growth & comparison')}</b><small>{T('نسبة الارتفاع عن الفترة السابقة والعام الماضي (الركاب، المبيعات، المتغيبون)', 'Change vs previous period and last year (passengers, sales, missed)')}</small></span>
            </label>
            <div className="xr-secs">
              {avail.map((s, i) => {
                const on = secs.includes(s.id)
                return (
                  <div key={s.id} className={`xr-sec${on ? ' on' : ''}`}>
                    <label className="xr-sec-top">
                      <input type="checkbox" checked={on} onChange={() => setSecs(on ? secs.filter(x => x !== s.id) : [...secs, s.id])} />
                      <span className="xr-sec-no">{String(i + 1).padStart(2, '0')}</span>
                      <span className="xr-sec-t"><b>{isAr ? s.ar : s.en}</b><small>{isAr ? s.hint_ar : s.hint_en}</small></span>
                    </label>
                    {on && s.id === 'sheets' && (
                      <div className="xr-sub-opts">
                        <label><input type="checkbox" checked={opt.details} onChange={e => setOpt('details', e.target.checked)} /><span>{T('تفاصيل الرحلات (جدول المغادرة والوصول متقابلين)', 'Trip detail (departures & arrivals side by side)')}</span></label>
                        {opt.details && <label><input type="checkbox" checked={!!opt.pagePer} onChange={e => setOpt('pagePer', e.target.checked)} /><span>{T('صفحة مستقلة لكل محطة (افتراضياً المحطات القصيرة تشترك في الصفحة لتقليل الأوراق)', 'Each station on its own page (by default short stations share a page)')}</span></label>}
                        {opt.details && <label><input type="checkbox" checked={opt.withUnentered} onChange={e => setOpt('withUnentered', e.target.checked)} /><span>{T('إظهار غير المدخلة داخل الجدول (وإلا تُذكر أرقامها تحته فقط)', 'Show not-entered trips in the table (otherwise listed below it)')}</span></label>}
                        {!opt.details && <p>{T('بدون التفاصيل: بطاقة مختصرة لكل محطة، 8 محطات في الصفحة', 'Without detail: a compact card per station, 8 per page')}</p>}
                      </div>
                    )}
                    {on && s.id === 'missed' && (
                      <div className="xr-sub-opts">
                        <label><input type="checkbox" checked={opt.tickets} onChange={e => setOpt('tickets', e.target.checked)} /><span>{T('إرفاق سجل أرقام التذاكر', 'Attach the ticket number log')}</span></label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <footer className="fd-foot">
          {busy && (
            <div className="fd-prog" role="status" aria-live="polite">
              <div className="fd-prog-t"><span>{busy.msg} {busy.name && <i>{busy.name}</i>}</span>{busy.total ? <b>{Math.min(busy.i + 1, busy.total)} / {busy.total}</b> : null}</div>
              <div className="fd-prog-bar"><i className={busy.total ? '' : 'xr-indet'} style={{ width: busy.total ? `${Math.round((busy.i / Math.max(1, busy.total)) * 100)}%` : '35%' }} /></div>
            </div>
          )}
          {!busy && done && <p className="fd-ok" role="status">{done.via === 'folder' ? T(`تم حفظ ${done.count} ملف PDF في مجلد «${done.folderName}»`, `Saved ${done.count} PDFs in “${done.folderName}”`) : T(`تم تنزيل ملف مضغوط فيه ${done.count} ملف PDF`, `Downloaded a ZIP with ${done.count} PDFs`)}</p>}
          {!busy && err && <p className="fd-err" role="alert">{err}</p>}
          <span className="fd-foot-sum">{T(`${picked.length} محطة${nAgents ? ` (منها ${nAgents} وكيل)` : ''} · ${days} ${days === 1 ? 'يوم' : 'أيام'} · ${chosen.length} أقسام`, `${picked.length} stations${nAgents ? ` (${nAgents} agents)` : ''} · ${days} days · ${chosen.length} sections`)}</span>
          <div className="fd-acts">
            <button type="button" className="fd-print fd-print-2" disabled={!ready || !!busy} onClick={() => savePdf(canPickFolder() ? 'folder' : 'zip')} title={T('ملف للتقرير + ملف لكل محطة', 'One report file + one file per station')}>
              <Ico d={I.folder} size={16} />{canPickFolder() ? T('حفظ PDF في مجلد', 'Save PDFs to folder') : T('تنزيل PDF (ZIP)', 'Download PDFs (ZIP)')}
            </button>
            <button type="button" className="fd-print" disabled={!ready || !!busy} onClick={preview}>
              <Ico d={I.print} size={16} />{T('معاينة وطباعة', 'Preview & print')}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

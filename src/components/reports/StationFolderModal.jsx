import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { canPickFolder } from '../../utils/pdfFolder'

// مجلد طباعة المحطات: تختار محطات (مع فلتر «فيها حسابات»)، فتظهر في مجلد كل محطة فيه كملف مستقل،
// وتحدد لكل ملف ما تريده: وصول ومغادرة (جداول تفصيلية) أو ملخص وصول ومغادرة (أرقام ونسب فقط).
export const FOLDER_MODES = [
  { id: 'detail', ar: 'وصول ومغادرة', en: 'Arrivals & departures', hint_ar: 'الأرقام + جداول الرحلات التفصيلية', hint_en: 'Figures + full trip tables' },
  { id: 'summary', ar: 'ملخص وصول ومغادرة', en: 'Arr / Dep summary', hint_ar: 'الأرقام ونسب الالتزام بدون جداول', hint_en: 'Figures and punctuality, no tables' },
]

const norm = s => String(s ?? '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()

const Ico = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{[].concat(d).map((p, i) => <path key={i} d={p} />)}</svg>
const FOLDER = 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z'
const FILE = ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6']

export default function StationFolderModal({ isAr, stations, staff, folder, setFolder, overview, setOverview, onPrint, onSavePdf, onClose }) {
  useBodyScrollLock()
  const [q, setQ] = useState('')
  const [onlyStaffed, setOnlyStaffed] = useState(true)
  const [kind, setKind] = useState('all')            // all | stations | agents
  const [defMode, setDefMode] = useState('detail')    // النوع الافتراضي للمحطات المضافة
  const [pane, setPane] = useState('pick')            // الجوال: pick | folder
  const [busy, setBusy] = useState(null)              // { i, total, name } أثناء تحويل PDF
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const k = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, busy])

  const T = (a, e) => (isAr ? a : e)
  const nameOf = s => (isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'
  const modeOf = new Map(folder.map(f => [f.id, f.mode]))
  const byId = Object.fromEntries(stations.map(s => [s.id, s]))
  const staffed = stations.filter(s => (staff[s.id] || 0) > 0)
  const agentsN = stations.filter(s => s.is_agent).length

  const term = norm(q)
  const shown = stations
    .filter(s => !onlyStaffed || (staff[s.id] || 0) > 0)
    .filter(s => kind === 'all' || (kind === 'agents' ? !!s.is_agent : !s.is_agent))
    .filter(s => !term || norm(s.name_ar).includes(term) || norm(s.name_en).includes(term))
    .sort((a, b) => ((staff[b.id] || 0) > 0) - ((staff[a.id] || 0) > 0) || nameOf(a).localeCompare(nameOf(b), isAr ? 'ar' : 'en'))

  const toggle = id => setFolder(modeOf.has(id) ? folder.filter(f => f.id !== id) : [...folder, { id, mode: defMode }])
  const addShown = () => setFolder([...folder, ...shown.filter(s => !modeOf.has(s.id)).map(s => ({ id: s.id, mode: defMode }))])
  const setMode = (id, mode) => setFolder(folder.map(f => (f.id === id ? { ...f, mode } : f)))
  const setAllModes = mode => { setDefMode(mode); setFolder(folder.map(f => ({ ...f, mode }))) }
  const files = folder.filter(f => byId[f.id])
  const nDetail = files.filter(f => f.mode === 'detail').length
  const ov = overview && files.length > 1
  const pickerOk = canPickFolder()

  // via: 'folder' = حفظ داخل مجلد تختاره (كروم/إيدج على الكمبيوتر) · 'zip' = ملف مضغوط (كل الأجهزة)
  const savePdf = async via => {
    setErr(''); setDone(null)
    let dirHandle
    if (via === 'folder') {
      try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }) }
      catch (e) { if (e?.name !== 'AbortError') setErr(T('تعذّر فتح المجلد، جرّب خيار ZIP', 'Could not open the folder, try ZIP')); return }
    }
    setBusy({ i: 0, total: files.length + (ov ? 1 : 0), name: '' })
    try {
      const r = await onSavePdf(files, ov, { via, dirHandle, onProgress: (i, total, name) => setBusy({ i, total, name }) })
      setDone(r)
    } catch (e) {
      setErr(T('تعذّر إنشاء ملفات PDF: ', 'Could not create PDFs: ') + (e?.message || ''))
    } finally { setBusy(null) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={T('مجلد طباعة المحطات', 'Station print folder')} className="fd-sheet" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="fd-head">
          <span className="fd-head-ico"><Ico d={FOLDER} size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="fd-title">{T('مجلد طباعة المحطات', 'Station print folder')}</h2>
            <p className="fd-sub">{T('اختر المحطات، ثم حدّد لكل محطة ما تريد طباعته', 'Pick stations, then choose what to print for each')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="fd-x" aria-label={T('إغلاق', 'Close')}><Ico d={['M18 6L6 18', 'M6 6l12 12']} size={18} /></button>
        </header>

        <div className="fd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={pane === 'pick'} className={pane === 'pick' ? 'on' : ''} onClick={() => setPane('pick')}>{T('المحطات', 'Stations')}</button>
          <button type="button" role="tab" aria-selected={pane === 'folder'} className={pane === 'folder' ? 'on' : ''} onClick={() => setPane('folder')}>{T('المجلد', 'Folder')} <b>{files.length}</b></button>
        </div>

        <div className="fd-body">
          {/* ── اختيار المحطات ── */}
          <section className={`fd-pane${pane === 'pick' ? ' show' : ''}`} aria-label={T('اختيار المحطات', 'Select stations')}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={T('ابحث عن محطة…', 'Search stations…')} className="fd-search" />
            <div className="fd-chips">
              <button type="button" aria-pressed={onlyStaffed} className={`fd-chip${onlyStaffed ? ' on' : ''}`} onClick={() => setOnlyStaffed(v => !v)}>
                {T(`فيها يوزر (${staffed.length})`, `With users (${staffed.length})`)}
              </button>
              <button type="button" aria-pressed={kind === 'stations'} className={`fd-chip${kind === 'stations' ? ' on' : ''}`} onClick={() => setKind(k => (k === 'stations' ? 'all' : 'stations'))}>{T('المحطات', 'Stations')}</button>
              {agentsN > 0 && <button type="button" aria-pressed={kind === 'agents'} className={`fd-chip${kind === 'agents' ? ' on' : ''}`} onClick={() => setKind(k => (k === 'agents' ? 'all' : 'agents'))}>{T(`الوكلاء (${agentsN})`, `Agents (${agentsN})`)}</button>}
              <span className="fd-chips-sp" />
              <button type="button" className="fd-link" onClick={addShown} disabled={!shown.some(s => !modeOf.has(s.id))}>{T(`إضافة الظاهر (${shown.filter(s => !modeOf.has(s.id)).length})`, `Add shown (${shown.filter(s => !modeOf.has(s.id)).length})`)}</button>
            </div>
            <div className="fd-list">
              {shown.length === 0 && <p className="fd-empty-s">{T('لا توجد محطات مطابقة', 'No matching stations')}</p>}
              {shown.map(s => {
                const n = staff[s.id] || 0, on = modeOf.has(s.id)
                return (
                  <label key={s.id} className={`fd-row${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                    <span className="fd-row-n">{nameOf(s)}{s.is_agent && <i>{T('وكيل', 'Agent')}</i>}</span>
                    <span className={`fd-row-u${n > 0 ? ' has' : ''}`}>{n > 0 ? T(`${n} يوزر`, `${n} users`) : T('بلا يوزر', 'No users')}</span>
                  </label>
                )
              })}
            </div>
          </section>

          {/* ── المجلد ── */}
          <section className={`fd-pane${pane === 'folder' ? ' show' : ''}`} aria-label={T('المجلد', 'Folder')}>
            <div className="fd-bulk">
              <span className="fd-bulk-l">{T('تطبيق على الكل', 'Apply to all')}</span>
              {FOLDER_MODES.map(m => <button key={m.id} type="button" className="fd-chip" onClick={() => setAllModes(m.id)} disabled={!files.length}>{isAr ? m.ar : m.en}</button>)}
              <span className="fd-chips-sp" />
              <button type="button" className="fd-link fd-link-d" onClick={() => setFolder([])} disabled={!files.length}>{T('تفريغ المجلد', 'Empty folder')}</button>
            </div>
            <div className="fd-folder">
              <span className="fd-folder-tab"><Ico d={FOLDER} size={14} />{T('المجلد', 'Folder')} · {files.length}</span>
              {files.length === 0 ? (
                <div className="fd-empty"><Ico d={FOLDER} size={34} /><p>{T('المجلد فاضي', 'The folder is empty')}</p><span>{T('اختر محطات من قائمة المحطات وستظهر هنا كملفات', 'Pick stations from the list — they appear here as files')}</span></div>
              ) : (
                <ul className="fd-files">
                  {files.map(f => {
                    const s = byId[f.id]
                    return (
                      <li key={f.id} className="fd-file">
                        <div className="fd-file-top">
                          <span className="fd-file-ico"><Ico d={FILE} size={18} /></span>
                          <span className="fd-file-n">{nameOf(s)}</span>
                          <span className="fd-file-u">{(staff[s.id] || 0) > 0 ? T(`${staff[s.id]} يوزر`, `${staff[s.id]} users`) : T('بلا يوزر', 'No users')}</span>
                          <button type="button" className="fd-file-x" onClick={() => toggle(f.id)} aria-label={T(`إزالة ${nameOf(s)}`, `Remove ${nameOf(s)}`)}><Ico d={['M18 6L6 18', 'M6 6l12 12']} size={15} /></button>
                        </div>
                        <div className="fd-seg" role="radiogroup" aria-label={T('محتوى الملف', 'File content')}>
                          {FOLDER_MODES.map(m => (
                            <button key={m.id} type="button" role="radio" aria-checked={f.mode === m.id} className={f.mode === m.id ? 'on' : ''} onClick={() => setMode(f.id, m.id)}>
                              <b>{isAr ? m.ar : m.en}</b><small>{isAr ? m.hint_ar : m.hint_en}</small>
                            </button>
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <footer className="fd-foot">
          {busy && (
            <div className="fd-prog" role="status" aria-live="polite">
              <div className="fd-prog-t"><span>{T('جارٍ إنشاء ملفات PDF…', 'Creating PDFs…')} {busy.name && <i>{busy.name}</i>}</span><b>{Math.min(busy.i + 1, busy.total)} / {busy.total}</b></div>
              <div className="fd-prog-bar"><i style={{ width: `${Math.round((busy.i / Math.max(1, busy.total)) * 100)}%` }} /></div>
            </div>
          )}
          {!busy && done && <p className="fd-ok" role="status">{done.via === 'folder' ? T(`تم حفظ ${done.count} ملف PDF في مجلد «${done.folderName}»`, `Saved ${done.count} PDFs in folder “${done.folderName}”`) : T(`تم تنزيل ملف مضغوط فيه ${done.count} ملف PDF — فكّه لتجد المجلد`, `Downloaded a ZIP with ${done.count} PDFs`)}</p>}
          {!busy && err && <p className="fd-err" role="alert">{err}</p>}
          <label className={`fd-opt${files.length < 2 ? ' off' : ''}`}>
            <input type="checkbox" checked={ov} disabled={files.length < 2 || !!busy} onChange={e => setOverview(e.target.checked)} />
            <span>{T('ملف ملخص المحطات', 'Stations summary file')}</span>
          </label>
          <span className="fd-foot-sum">{T(`${files.length} ملف · ${nDetail} تفصيلي · ${files.length - nDetail} ملخص`, `${files.length} files · ${nDetail} detailed · ${files.length - nDetail} summary`)}</span>
          <div className="fd-acts">
            <button type="button" className="fd-print fd-print-2" disabled={!files.length || !!busy} onClick={() => onPrint(files, ov)}>
              <Ico d={['M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2', 'M6 14h12v8H6z']} size={16} />
              {T('طباعة', 'Print')}
            </button>
            {pickerOk && (
              <button type="button" className="fd-print fd-print-2" disabled={!files.length || !!busy} onClick={() => savePdf('zip')}>
                <Ico d={['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3']} size={16} />ZIP
              </button>
            )}
            <button type="button" className="fd-print" disabled={!files.length || !!busy} onClick={() => savePdf(pickerOk ? 'folder' : 'zip')}>
              <Ico d={FOLDER} size={16} />
              {pickerOk ? T(`حفظ PDF في مجلد (${files.length + (ov ? 1 : 0)})`, `Save PDFs to folder (${files.length + (ov ? 1 : 0)})`) : T(`تنزيل PDF مضغوط (${files.length + (ov ? 1 : 0)})`, `Download PDFs as ZIP (${files.length + (ov ? 1 : 0)})`)}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

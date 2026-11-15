import { useState } from 'react'
import { SettingsCard, Segmented, Icon } from './ui'
import { MASTER_DATASETS, exportMasterWorkbook } from '../../utils/masterWorkbook'

// زر واحد: ملف Excel واحد فيه كل أقسام النظام تبويبات (أدمن عام). يجلب أحدث البيانات لحظة الضغط.
export default function MasterWorkbookExport({ isAr = true }) {
  const T = (a, e) => (isAr ? a : e)
  const [days, setDays] = useState(90)
  const [ids, setIds] = useState(() => MASTER_DATASETS.map(d => d.id))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const toggle = id => setIds(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  async function go() {
    setBusy(true); setErr(''); setRes(null)
    try { setRes(await exportMasterWorkbook({ isAr, days, ids, onProgress: setMsg })) } catch (e) { setErr(e?.message || String(e)) }
    setBusy(false); setMsg('')
  }

  const allOn = ids.length === MASTER_DATASETS.length
  return (
    <SettingsCard icon="file"
      title={T('ملف Excel الشامل (كل الأقسام في ملف واحد)', 'Master Excel (all sections in one file)')}
      desc={T('اضغط الزر فيُنزَّل ملف واحد فيه: المبيعات، الترحيل، الإجازات، التقييمات، المفقودات، الموظفون وغيرها، كل قسم تبويب مستقل بفلاتر، وأول تبويب فهرس بروابط. يجلب أحدث بيانات لحظة الضغط، بدون أي إعداد.', 'Press the button to download one file with sales, trips, leaves, evaluations, lost & found, employees and more — each section its own filtered tab, plus an index tab with links. It pulls the latest data at the moment you press, with no setup.')}
      aside={<span className="st-pill acc">{T('الأقسام المحددة', 'Selected')} <b dir="ltr">{ids.length} / {MASTER_DATASETS.length}</b></span>}>
      <div className="st-lbl">{T('الفترة', 'Period')}</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <Segmented variant="track" label={T('الفترة', 'Period')} value={days} onChange={setDays} disabled={busy}
          options={[[30, T('30 يوماً', '30 days')], [90, T('90 يوماً', '90 days')], [180, T('180 يوماً', '180 days')], [365, T('سنة', 'Year')]]} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="st-lbl" style={{ margin: 0 }}>{T('الأقسام المضمّنة', 'Included sections')}</span>
        <button type="button" className="st-btn sm" onClick={() => setIds(allOn ? [] : MASTER_DATASETS.map(d => d.id))} disabled={busy}>{allOn ? T('إلغاء تحديد الكل', 'Unselect all') : T('تحديد الكل', 'Select all')}</button>
      </div>
      <div className="st-checks" style={{ marginBottom: 20 }}>
        {MASTER_DATASETS.map(d => {
          const on = ids.includes(d.id)
          return (
            <label key={d.id} className={`st-check${on ? ' on' : ''}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={on} onChange={() => toggle(d.id)} disabled={busy} />
              {isAr ? d.ar : d.en}
            </label>
          )
        })}
      </div>
      <div className="st-actions">
        <button type="button" className="st-btn pri" onClick={go} disabled={busy || !ids.length}>
          <Icon name="download" size={18} />
          {busy ? (msg || T('جارٍ التجهيز…', 'Preparing…')) : T('تنزيل الملف الشامل', 'Download master file')}
        </button>
      </div>
      {err && <p role="alert" className="st-note err" style={{ margin: '14px 0 0' }}>{err}</p>}
      {res && (
        <p className="st-note ok" style={{ margin: '14px 0 0' }}>
          <Icon name="check" size={16} />
          <span>
            {T(`تم تنزيل الملف: ${res.sections} قسم و${res.rows.toLocaleString('en-US')} صف.`, `Downloaded: ${res.sections} sections, ${res.rows.toLocaleString('en-US')} rows.`)}
            {res.failed.length > 0 && ` ${T('تعذّر:', 'Failed:')} ${res.failed.join('، ')}`}
          </span>
        </p>
      )}
    </SettingsCard>
  )
}

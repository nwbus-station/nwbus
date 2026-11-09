import { useState } from 'react'
import { MASTER_DATASETS, exportMasterWorkbook } from '../../utils/masterWorkbook'

// زر واحد: ملف Excel واحد فيه كل أقسام النظام تبويبات (أدمن عام). يجلب أحدث البيانات لحظة الضغط.
const btn = (primary, disabled) => ({ minHeight: 48, padding: '0 22px', borderRadius: 12, border: primary ? 'none' : '1px solid var(--border-2)', background: primary ? 'var(--solid-btn, #1C2B4A)' : 'var(--card)', color: primary ? '#fff' : 'var(--text-1)', fontWeight: 800, fontSize: '0.88rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'inherit' })

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

  return (
    <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{T('ملف Excel الشامل (كل الأقسام في ملف واحد)', 'Master Excel (all sections in one file)')}</h3>
      <p style={{ margin: '0 0 14px', fontSize: '0.78rem', lineHeight: 1.8, color: 'var(--text-3)' }}>
        {T('اضغط الزر فيُنزَّل ملف واحد فيه: المبيعات، الترحيل، الإجازات، التقييمات، المفقودات، الموظفون وغيرها، كل قسم تبويب مستقل بفلاتر، وأول تبويب فهرس بروابط. يجلب أحدث بيانات لحظة الضغط، بدون أي إعداد.', 'Press the button to download one file with sales, trips, leaves, evaluations, lost & found, employees and more — each section its own filtered tab, plus an index tab with links. It pulls the latest data at the moment you press, with no setup.')}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>{T('الفترة:', 'Period:')}{' '}
          <select value={days} onChange={e => setDays(Number(e.target.value))} disabled={busy} style={{ border: '1px solid var(--border-2)', borderRadius: 9, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', minHeight: 40 }}>
            <option value={30}>{T('آخر 30 يوماً', 'Last 30 days')}</option><option value={90}>{T('آخر 90 يوماً', 'Last 90 days')}</option><option value={180}>{T('آخر 180 يوماً', 'Last 180 days')}</option><option value={365}>{T('آخر سنة', 'Last year')}</option>
          </select>
        </label>
        <button type="button" onClick={() => setIds(ids.length === MASTER_DATASETS.length ? [] : MASTER_DATASETS.map(d => d.id))} disabled={busy} style={{ ...btn(false, busy), minHeight: 40, padding: '0 14px', fontSize: '0.78rem' }}>{ids.length === MASTER_DATASETS.length ? T('إلغاء تحديد الكل', 'Unselect all') : T('تحديد الكل', 'Select all')}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
        {MASTER_DATASETS.map(d => {
          const on = ids.includes(d.id)
          return (
            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 44, padding: '8px 11px', borderRadius: 10, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, background: on ? 'var(--gold-dim)' : 'var(--card)', cursor: busy ? 'default' : 'pointer', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>
              <input type="checkbox" checked={on} onChange={() => toggle(d.id)} disabled={busy} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
              {isAr ? d.ar : d.en}
            </label>
          )
        })}
      </div>
      <button type="button" onClick={go} disabled={busy || !ids.length} style={btn(true, busy || !ids.length)}>{busy ? (msg || T('جارٍ التجهيز…', 'Preparing…')) : T('تنزيل الملف الشامل', 'Download master file')}</button>
      {err && <p role="alert" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 9, background: 'var(--danger-bg, #fef2f2)', color: 'var(--danger, #dc2626)', fontSize: '0.8rem', fontWeight: 700 }}>{err}</p>}
      {res && (
        <p style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: 9, background: 'var(--success-bg)', color: 'var(--success)', fontSize: '0.8rem', fontWeight: 700 }}>
          {T(`تم تنزيل الملف: ${res.sections} قسم و${res.rows.toLocaleString('en-US')} صف.`, `Downloaded: ${res.sections} sections, ${res.rows.toLocaleString('en-US')} rows.`)}
          {res.failed.length > 0 && ` ${T('تعذّر:', 'Failed:')} ${res.failed.join('، ')}`}
        </p>
      )}
    </div>
  )
}

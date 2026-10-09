import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { todayStr, toLocalDateStr } from '../../utils/dates'
import { safeImport } from '../../lib/chunkReload'

const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toLocalDateStr(d) }

// تنزيل التقرير التشغيلي التحليلي (Excel) لفترة يحددها الأدمن — بدون إيميل
export default function OperationsReportDownload({ isAr }) {
  const [from, setFrom] = useState(() => shift(todayStr(), -29))
  const [to, setTo] = useState(() => shift(todayStr(), -1))
  const [kind, setKind] = useState('all') // all | nwb | agent
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const T = (a, e) => (isAr ? a : e)

  const now = new Date()
  const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
  const prevMonthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const prevMonthEnd = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 0))
  const PRESETS = [
    [T('آخر 7 أيام', 'Last 7 days'), shift(todayStr(), -7), shift(todayStr(), -1)],
    [T('آخر 30 يوماً', 'Last 30 days'), shift(todayStr(), -30), shift(todayStr(), -1)],
    [T('هذا الشهر', 'This month'), monthStart, todayStr()],
    [T('الشهر الماضي', 'Last month'), prevMonthStart, prevMonthEnd],
    [T('آخر 90 يوماً', 'Last 90 days'), shift(todayStr(), -90), shift(todayStr(), -1)],
  ]

  async function run() {
    if (!from || !to || from > to) { setMsg({ ok: false, text: T('حدّد فترة صحيحة', 'Pick a valid period') }); return }
    setBusy(true); setMsg(null)
    try {
      const { buildOperationsReport } = await safeImport(() => import('../../utils/operationsReport'))
      const r = await buildOperationsReport({ supabase, isAr, from, to, kind, onProgress: t => setMsg({ ok: true, text: t }) })
      setMsg({ ok: true, text: T(`تم التنزيل — ${r.trips.toLocaleString('en-US')} رحلة · ${r.stations} محطة`, `Downloaded — ${r.trips.toLocaleString('en-US')} trips · ${r.stations} stations`) })
    } catch (e) {
      setMsg({ ok: false, text: T('تعذّر إنشاء التقرير: ', 'Could not create the report: ') + (e?.message || e) })
    }
    setBusy(false)
  }

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-1)' }}>{T('تنزيل التقرير التشغيلي التحليلي', 'Download the operations analytics report')}</h3>
      <p style={{ margin: '4px 0 14px', fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
        {T('حدّد الفترة وانزّل ملف Excel مباشرة: لوحة تحليل (مؤشرات ومقارنة بالفترة السابقة وملاحظات تلقائية ورسوم)، ترتيب المحطات، اتجاه يومي، كل السجلات، وورقة لكل محطة. بدون إرسال إيميل.',
          'Pick a period and download an Excel file directly: analysis dashboard (indicators, comparison, automatic insights, charts), station ranking, daily trend, all records and a sheet per station. No email needed.')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {PRESETS.map(([l, a, b]) => {
          const on = from === a && to === b
          return (
            <button key={l} type="button" onClick={() => { setFrom(a); setTo(b) }}
              style={{ padding: '6px 12px', borderRadius: 99, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? '#1C2B4A' : 'var(--border)'}`, background: on ? '#1C2B4A' : '#fff', color: on ? '#fff' : 'var(--text-2)' }}>{l}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginInlineEnd: 4 }}>{T('المحطات:', 'Stations:')}</span>
        {[['all', T('الكل (نورث وست + الوكلاء)', 'All (North West + agents)')], ['nwb', T('نورث وست فقط', 'North West only')], ['agent', T('الوكلاء فقط', 'Agents only')]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            style={{ padding: '6px 12px', borderRadius: 99, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${kind === k ? '#7C3AED' : 'var(--border)'}`, background: kind === k ? '#7C3AED' : '#fff', color: kind === k ? '#fff' : 'var(--text-2)' }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <DatePicker value={from} onChange={v => { setFrom(v); if (v && to && v > to) setTo(v) }} isAr={isAr} className={inp} />
        <span style={{ color: 'var(--text-3)' }}>—</span>
        <DatePicker value={to} onChange={v => { setTo(v); if (v && from && v < from) setFrom(v) }} isAr={isAr} className={inp} />
        <button type="button" onClick={run} disabled={busy}
          style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? T('جاري الإنشاء…', 'Building…') : T('تنزيل التقرير', 'Download report')}
        </button>
      </div>
      {msg && <p style={{ margin: '10px 0 0', fontSize: '0.76rem', fontWeight: 600, color: msg.ok ? 'var(--text-3)' : '#B91C1C' }}>{msg.text}</p>}
    </div>
  )
}

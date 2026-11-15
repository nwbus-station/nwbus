import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SettingsCard, Segmented, Icon } from './ui'
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
    [T('أمس', 'Yesterday'), shift(todayStr(), -1), shift(todayStr(), -1)],
    [T('اليوم', 'Today'), todayStr(), todayStr()],
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

  const presetKey = (PRESETS.find(([, a, b]) => from === a && to === b) || [])[0] ?? null
  return (
    <SettingsCard icon="download"
      title={T('تنزيل التقرير التشغيلي التحليلي', 'Download the operations analytics report')}
      desc={T('حدّد الفترة وانزّل ملف Excel مباشرة: ملخص بالمغادرة والوصول وعدد الزوار (أرقام وتحليل ورسوم)، جدول المحطات، الاتجاه اليومي، الوكلاء في ورقة مستقلة، رضا العملاء والاستبيانات، الحركات غير المُدخلة، كل السجلات، وورقة لكل محطة. بدون إرسال إيميل.',
        'Pick a period and download an Excel file directly: a summary with departures, arrivals and visitors (figures, analysis, charts), stations table, daily trend, agents on their own sheet, customer ratings & surveys, movements not entered, all records and a sheet per station. No email needed.')}>
      <div className="st-lbl">{T('فترة جاهزة', 'Quick period')}</div>
      <div style={{ marginBottom: 18 }}>
        <Segmented variant="chips" label={T('فترة جاهزة', 'Quick period')} value={presetKey} onChange={k => { const p = PRESETS.find(x => x[0] === k); setFrom(p[1]); setTo(p[2]) }}
          options={PRESETS.map(([l]) => [l, l])} />
      </div>
      <div className="st-lbl">{T('المحطات', 'Stations')}</div>
      <div style={{ marginBottom: 18 }}>
        <Segmented variant="track" label={T('المحطات', 'Stations')} value={kind} onChange={setKind}
          options={[['all', T('الكل (نورث وست + الوكلاء)', 'All (North West + agents)')], ['nwb', T('نورث وست فقط', 'North West only')], ['agent', T('الوكلاء فقط', 'Agents only')]]} />
      </div>
      <div className="st-lbl">{T('أو حدّد فترة مخصصة', 'Or a custom range')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div className="st-date"><DatePicker value={from} onChange={v => { setFrom(v); if (v && to && v > to) setTo(v) }} isAr={isAr} className="st-input st-input-btn" /></div>
        <span style={{ color: 'var(--text-3)' }}>—</span>
        <div className="st-date"><DatePicker value={to} onChange={v => { setTo(v); if (v && from && v < from) setFrom(v) }} isAr={isAr} className="st-input st-input-btn" /></div>
      </div>
      <div className="st-actions">
        <button type="button" className="st-btn pri" onClick={run} disabled={busy}>
          <Icon name="download" size={18} />
          {busy ? T('جاري الإنشاء…', 'Building…') : T('تنزيل التقرير', 'Download report')}
        </button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`st-note ${msg.ok ? 'info' : 'err'}`} style={{ margin: '14px 0 0' }}>{msg.text}</p>}
    </SettingsCard>
  )
}

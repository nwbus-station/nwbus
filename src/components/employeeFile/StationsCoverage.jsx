// الالتزام بالإيراد اليومي (للأدمن): أي المحطات فيها موظفون ولا تُدخل يومية؟ كم موظفاً فتح حسابه؟
// وكم نتوقع أنهم بإجازة (نسبة تقديرية افتراضها 40% قابلة للتعديل، أو الإجازات المعتمدة الفعلية)؟
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { todayStr } from '../../utils/dates'
import { isRestStation } from '../../utils/stations'
import { esc, docHeader, docShell, openDocWindow } from '../../utils/printDoc'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const NON_STAFF = ['general_admin', 'stations_executive_director', 'assistant_stations_executive_director']
const MANAGER_ROLES = ['station_admin', 'area_supervisor']
const EXCLUDED_JOB = /cleaner|dispatcher_supervisor|نظاف|مشرف\s*مرحّ|مشرف\s*مرح/i
const PCT_KEY = 'nwbus_cov_leave_pct', MODE_KEY = 'nwbus_cov_leave_mode'
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const riyadhDay = iso => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10)
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

const C = { entered: '#16a34a', opened: '#f59e0b', leave: '#38bdf8', idle: '#94a3b8', bad: '#dc2626' }
const SEG_LABEL = { entered: 'أضافوا يومية', opened: 'دخلوا ولم يضيفوا', leave: 'إجازة', idle: 'لم يدخلوا' }

async function pageAll(make) {
  const out = []
  for (let f = 0; f < 60000; f += 1000) {
    const { data, error } = await make().range(f, f + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div style={{ padding: '13px 15px', background: 'var(--card)', minWidth: 0, boxShadow: '0 0 0 .5px var(--border-2, #e0e0e0)' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: MONO, lineHeight: 1.05, color: tone || 'var(--text-1)' }}>{value}</div>
      <div style={{ fontSize: '.72rem', color: 'var(--text-2)', marginTop: 4, fontWeight: 700 }}>{label}</div>
      {sub != null && <div style={{ fontSize: '.66rem', color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

// شريط توزيع موظفي المحطة: أضافوا / دخلوا ولم يضيفوا / إجازة / لم يدخلوا
function SegBar({ seg, total, height = 10 }) {
  return (
    <div style={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2, #ebebed)' }} role="img"
      aria-label={Object.keys(SEG_LABEL).map(k => `${SEG_LABEL[k]} ${seg[k]}`).join('، ')}>
      {total > 0 && ['entered', 'opened', 'leave', 'idle'].map(k => seg[k] > 0 && (
        <i key={k} title={`${SEG_LABEL[k]}: ${seg[k]}`} style={{ display: 'block', width: `${(seg[k] / total) * 100}%`, background: C[k], backgroundImage: k === 'leave' ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 3px, transparent 3px 6px)' : undefined }} />
      ))}
    </div>
  )
}

export default function StationsCoverage({ isAr = true }) {
  const today = todayStr()
  const [day, setDay] = useState(today)
  const [pct, setPct] = useState(() => { const v = Number(localStorage.getItem(PCT_KEY)); return Number.isFinite(v) && localStorage.getItem(PCT_KEY) !== null ? v : 40 })
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || 'est')   // est = تقديري | act = الإجازات المعتمدة الفعلية
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('risk')
  const [open, setOpen] = useState(() => new Set())
  const setPctSave = v => { setPct(v); try { localStorage.setItem(PCT_KEY, String(v)) } catch { /* بدون تخزين */ } }
  const setModeSave = v => { setMode(v); try { localStorage.setItem(MODE_KEY, v) } catch { /* بدون تخزين */ } }

  useEffect(() => {
    let off = false
    setData(null); setErr('')
    ;(async () => {
      try {
        const [stations, users, sales, leaves] = await Promise.all([
          pageAll(() => supabase.from('stations').select('id, name_ar, name_en, is_agent').eq('is_active', true).order('id')),
          pageAll(() => supabase.from('users').select('id, full_name_ar, job_number, role, station_id, job_title, is_active, last_login').eq('is_active', true).order('id')),
          pageAll(() => supabase.from('sales_records').select('id, station_id, created_by').eq('sale_date', day).order('id')),
          pageAll(() => supabase.from('leaves').select('id, employee_id').eq('status', 'approved').lte('start_date', day).gte('end_date', day).order('id')),
        ])
        // من فتح حسابه في اليوم المختار: اليوم من آخر دخول، والأيام السابقة من سجل النشاط
        let loginSet = new Set(), loginsExact = true
        if (day === today) {
          users.forEach(u => { if (u.last_login && riyadhDay(u.last_login) === day) loginSet.add(u.id) })
        } else {
          try {
            const rows = await pageAll(() => supabase.from('audit_log').select('id, record_id, before_data, after_data')
              .eq('table_name', 'users').gte('created_at', `${day}T00:00:00+03:00`).lte('created_at', `${day}T23:59:59.999+03:00`).order('id'))
            rows.forEach(r => { if (r.after_data && r.after_data.last_login && (!r.before_data || r.before_data.last_login !== r.after_data.last_login)) loginSet.add(String(r.record_id)) })
          } catch {
            loginsExact = false
            users.forEach(u => { if (u.last_login && riyadhDay(u.last_login) >= day) loginSet.add(u.id) })
          }
        }
        if (!off) setData({ stations, users, sales, leaves, loginSet, loginsExact })
      } catch (e) { if (!off) setErr(e?.message || 'تعذّر تحميل البيانات') }
    })()
    return () => { off = true }
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => {
    if (!data) return null
    const { stations, users, sales, leaves, loginSet } = data
    const leaveSet = new Set(leaves.map(l => String(l.employee_id)))
    const staffBy = {}
    users.filter(u => !EXCLUDED_JOB.test(u.job_title || '')).forEach(u => {
      if (!u.station_id || NON_STAFF.includes(u.role) || MANAGER_ROLES.includes(u.role)) return
      ;(staffBy[u.station_id] ??= []).push(u)
    })
    const salesBy = {}
    sales.forEach(s => { (salesBy[s.station_id] ??= []).push(s) })
    const rows = [], noStaff = []
    stations.filter(s => !isRestStation(s) && !s.is_agent).forEach(stn => {
      const staff = staffBy[stn.id] ?? []
      const name = isAr ? stn.name_ar : (stn.name_en || stn.name_ar)
      const recs = salesBy[stn.id] ?? []
      if (!staff.length) { noStaff.push({ id: stn.id, name, records: recs.length }); return }
      const enteredIds = new Set(recs.map(r => String(r.created_by)))
      const emp = staff.map(u => {
        const entered = enteredIds.has(String(u.id)), opened = loginSet.has(String(u.id)), onLeaveAct = leaveSet.has(String(u.id))
        return { u, entered, opened, leaveAct: onLeaveAct, st: entered ? 'entered' : opened ? 'opened' : onLeaveAct ? 'leave' : 'idle' }
      })
      const N = emp.length
      const entered = emp.filter(e => e.entered).length
      const openedNoEntry = emp.filter(e => e.opened && !e.entered).length
      const opened = emp.filter(e => e.opened).length
      const leaveAct = emp.filter(e => e.leaveAct).length
      const leaveEst = Math.round(N * pct / 100)
      const onLeave = mode === 'est' ? leaveEst : leaveAct
      const expected = Math.max(0, N - onLeave)
      const notOpened = N - opened
      const leaveSeg = mode === 'est' ? Math.min(leaveEst, Math.max(0, notOpened)) : emp.filter(e => e.leaveAct && !e.opened && !e.entered).length
      const idleSeg = Math.max(0, N - entered - openedNoEntry - leaveSeg)
      const compliance = expected > 0 ? Math.min(100, pctOf(entered, expected)) : (entered > 0 ? 100 : 0)
      const state = entered === 0 ? 'none' : compliance < 50 ? 'low' : compliance < 100 ? 'mid' : 'full'
      rows.push({ id: stn.id, name, N, opened, notOpened, entered, openedNoEntry, leaveAct, leaveEst, onLeave, expected, compliance, state, records: recs.length, seg: { entered, opened: openedNoEntry, leave: leaveSeg, idle: idleSeg }, emp })
    })
    const sum = k => rows.reduce((a, r) => a + r[k], 0)
    const T = { stations: rows.length, none: rows.filter(r => r.state === 'none').length, N: sum('N'), opened: sum('opened'), entered: sum('entered'), expected: sum('expected'), onLeave: sum('onLeave'), leaveAct: sum('leaveAct'), records: sum('records') }
    T.compliance = T.expected > 0 ? Math.min(100, pctOf(T.entered, T.expected)) : 0
    return { rows, noStaff, T }
  }, [data, pct, mode, isAr])

  const STATE = { none: { t: 'لا يُدخلون يومية', c: '#b91c1c', bg: 'rgba(220,38,38,.12)' }, low: { t: 'تغطية ضعيفة', c: '#b45309', bg: 'rgba(217,119,6,.14)' }, mid: { t: 'تغطية جزئية', c: '#1d4ed8', bg: 'rgba(37,99,235,.12)' }, full: { t: 'مكتملة', c: '#15803d', bg: 'rgba(22,163,74,.13)' } }
  const rank = { none: 0, low: 1, mid: 2, full: 3 }

  const list = useMemo(() => {
    if (!model) return []
    const term = q.trim().toLowerCase()
    const arr = model.rows.filter(r => (filter === 'all' || r.state === filter) && (!term || r.name.toLowerCase().includes(term)))
    const cmp = { risk: (a, b) => rank[a.state] - rank[b.state] || a.compliance - b.compliance || b.N - a.N, name: (a, b) => a.name.localeCompare(b.name, 'ar'), staff: (a, b) => b.N - a.N, compliance: (a, b) => b.compliance - a.compliance }[sortBy]
    return arr.sort(cmp)
  }, [model, filter, q, sortBy])

  const toggle = id => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const dayLabel = d => new Date(d + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const leaveLabel = mode === 'est' ? `إجازة تقديرية ${pct}%` : 'إجازات معتمدة فعلية'

  function print() {
    if (!model) return
    const { T } = model
    const rowsHtml = list.map(r => `<tr><td class="l"><b>${esc(r.name)}</b></td><td>${r.N}</td><td>${r.opened}</td><td>${r.onLeave}</td><td>${r.expected}</td><td><b>${r.entered}</b></td><td><b>${r.compliance}%</b></td><td><span class="chip" style="background:${r.state === 'none' ? '#fee2e2' : r.state === 'low' ? '#fef3c7' : r.state === 'mid' ? '#dbeafe' : '#dcfce7'};color:${STATE[r.state].c}">${STATE[r.state].t}</span></td></tr>`).join('')
    const alerts = model.rows.filter(r => r.state === 'none').sort((a, b) => b.N - a.N)
    const body = `<div class="body">
      <div class="sec"><div class="grid g4">
        <div class="kpi" style="--c:#dc2626"><small>محطات فيها موظفون ولا تُدخل يومية</small><b>${T.none}</b><em>من ${T.stations} محطة</em></div>
        <div class="kpi" style="--c:#0369a1"><small>فتحوا حساباتهم</small><b>${T.opened}</b><em>من ${T.N} موظف (${pctOf(T.opened, T.N)}%)</em></div>
        <div class="kpi" style="--c:#38bdf8"><small>${esc(leaveLabel)}</small><b>${T.onLeave}</b><em>متوقع عملهم ${T.expected}</em></div>
        <div class="kpi" style="--c:#16a34a"><small>أضافوا يومية</small><b>${T.entered}</b><em>تغطية ${T.compliance}%</em></div>
      </div></div>
      ${alerts.length ? `<div class="sec"><h3>محطات فيها موظفون ولا تُدخل أي يومية (${alerts.length})</h3><table class="t"><thead><tr><th>المحطة</th><th>الموظفون</th><th>فتحوا حساباتهم</th><th>المتوقع عملهم</th></tr></thead><tbody>${alerts.map(r => `<tr><td class="l"><b>${esc(r.name)}</b></td><td>${r.N}</td><td>${r.opened}</td><td>${r.expected}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="sec"><h3>كل المحطات</h3><table class="t"><thead><tr><th>المحطة</th><th>الموظفون</th><th>فتحوا حساباتهم</th><th>${esc(leaveLabel)}</th><th>المتوقع عملهم</th><th>أضافوا</th><th>التغطية</th><th>الحالة</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <p class="muted">التغطية = (من أضاف يومية ÷ المتوقع عملهم). المتوقع عملهم = الموظفون − الإجازات (${mode === 'est' ? `تقدير ${pct}% افتراضياً` : 'المعتمدة فعلياً'}).</p></div>`
    openDocWindow(docShell({
      title: `الالتزام بالإيراد اليومي — ${day}`,
      body: docHeader({ title: 'الالتزام بالإيراد اليومي للمحطات', infoLines: [`اليوم: <b>${esc(dayLabel(day))}</b>`, `المحطات: <b>${T.stations}</b>`, `الإجازات: <b>${esc(leaveLabel)}</b>`] }) + body,
      footerLeft: `طُبع: ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }))}`, footerRight: 'وثيقة داخلية',
      shareText: `الالتزام بالإيراد اليومي — ${dayLabel(day)}\nمحطات بلا يومية: ${T.none} من ${T.stations} · أضافوا ${T.entered} من ${T.expected} متوقع (${T.compliance}%)`,
    }))
  }

  const [xl, setXl] = useState(false)
  async function exportExcel() {
    if (!model) return
    setXl(true)
    try {
      const { exportTableXlsx } = await import('../../utils/excelExport')
      await exportTableXlsx({
        isAr: true, filename: `الالتزام_بالإيراد_${day}`, sheetName: 'الالتزام بالإيراد', title: 'الالتزام بالإيراد اليومي للمحطات',
        subtitle: `اليوم: ${day}`, meta: [['الإجازات', leaveLabel]],
        columns: [{ header: 'المحطة', w: 26 }, { header: 'الموظفون', w: 11, fmt: '0' }, { header: 'فتحوا حساباتهم', w: 15, fmt: '0' }, { header: 'دخلوا ولم يضيفوا', w: 16, fmt: '0' }, { header: leaveLabel, w: 18, fmt: '0' }, { header: 'المتوقع عملهم', w: 14, fmt: '0' }, { header: 'أضافوا يومية', w: 13, fmt: '0' }, { header: 'التغطية', w: 11, fmt: '0"%"' }, { header: 'الحالة', w: 18 }],
        rows: list.map(r => [r.name, r.N, r.opened, r.openedNoEntry, r.onLeave, r.expected, r.entered, r.compliance, STATE[r.state].t]),
      })
    } catch (e) { setErr('تعذّر إنشاء ملف Excel: ' + (e?.message || '')) }
    setXl(false)
  }

  const ctl = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-2, #e0e0e0)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.78rem' }
  const card = { background: 'var(--card)', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 14 }
  const T = model?.T

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* التحكم: اليوم + الإجازات */}
      <div style={{ ...card, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-1)' }}>الالتزام بالإيراد اليومي</p>
            <p style={{ margin: '3px 0 0', fontSize: '.74rem', color: 'var(--text-3)', lineHeight: 1.7 }}>أي المحطات فيها موظفون ولا تُدخل يومية؟ وكم فتح حسابه؟ وكم نتوقع أنهم بإجازة؟</p>
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 8, overflow: 'hidden' }}>
            {[['اليوم', today], ['أمس', addDays(today, -1)]].map(([l, d]) => (
              <button key={l} type="button" onClick={() => setDay(d)} style={{ padding: '7px 14px', border: 'none', background: day === d ? '#1C2B4A' : 'var(--card)', color: day === d ? '#fff' : 'var(--text-2)', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
            ))}
          </div>
          <div style={{ width: 170 }}><DatePicker value={day} onChange={v => v && setDay(v)} max={today} isAr className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white" /></div>
          <button type="button" onClick={print} disabled={!model} style={{ ...ctl, background: '#1C2B4A', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', opacity: model ? 1 : .5 }}>طباعة</button>
          <button type="button" onClick={exportExcel} disabled={!model || xl} style={{ ...ctl, fontWeight: 800, cursor: 'pointer', opacity: model ? 1 : .5 }}>{xl ? 'جارٍ التجهيز...' : 'Excel'}</button>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 8, overflow: 'hidden' }} role="tablist" aria-label="طريقة حساب الإجازات">
            {[['est', 'تقدير نسبة الإجازات'], ['act', 'الإجازات المعتمدة الفعلية']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setModeSave(k)} style={{ padding: '7px 14px', border: 'none', background: mode === k ? '#0369a1' : 'var(--card)', color: mode === k ? '#fff' : 'var(--text-2)', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
            ))}
          </div>
          {mode === 'est' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 240 }}>
              <span style={{ fontSize: '.76rem', color: 'var(--text-2)', fontWeight: 700, whiteSpace: 'nowrap' }}>نسبة الموظفين المتوقع أنهم بإجازة</span>
              <input type="range" min={0} max={80} step={5} value={pct} onChange={e => setPctSave(Number(e.target.value))} aria-label="نسبة الإجازات التقديرية" style={{ flex: 1, accentColor: '#0369a1', minWidth: 120 }} />
              <b style={{ fontFamily: MONO, fontSize: '1.05rem', color: '#0369a1', minWidth: 46, textAlign: 'center' }} dir="ltr">{pct}%</b>
              {pct !== 40 && <button type="button" onClick={() => setPctSave(40)} style={{ ...ctl, fontSize: '.7rem', cursor: 'pointer' }}>الافتراضي 40%</button>}
            </div>
          ) : (
            <span style={{ fontSize: '.76rem', color: 'var(--text-3)' }}>تُحسب من طلبات الإجازة المقبولة التي تشمل هذا اليوم{T ? ` (${T.leaveAct} موظف)` : ''}.</span>
          )}
        </div>
      </div>

      {err && <p style={{ margin: 0, fontSize: '.78rem', color: '#b91c1c' }}>{err}</p>}
      {!model && !err && <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--text-3)' }}>جارٍ التحميل...</p>}

      {model && (
        <>
          {/* المؤشرات */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 0, border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 14, overflow: 'hidden', background: 'var(--card)' }}>
            <Kpi label="محطات بلا يومية" value={T.none} sub={`فيها موظفون، من ${T.stations} محطة`} tone={T.none ? C.bad : '#15803d'} />
            <Kpi label="فتحوا حساباتهم" value={T.opened} sub={`من ${T.N} موظف · ${pctOf(T.opened, T.N)}%`} tone="#0369a1" />
            <Kpi label={leaveLabel} value={T.onLeave} sub={`متوقع عملهم ${T.expected}`} tone="#0284c7" />
            <Kpi label="أضافوا يومية" value={T.entered} sub={`${T.records} سجل إيراد`} tone="#15803d" />
            <Kpi label="نسبة التغطية" value={`${T.compliance}%`} sub="أضافوا ÷ المتوقع عملهم" tone={T.compliance >= 80 ? '#15803d' : T.compliance >= 50 ? '#b45309' : C.bad} />
          </div>
          {!data.loginsExact && <p style={{ margin: 0, fontSize: '.72rem', color: '#b45309' }}>سجل الدخول التفصيلي غير متاح لهذا اليوم؛ يُحتسب «فتح حسابه» تقريباً من آخر دخول.</p>}

          {/* تنبيه: محطات فيها موظفون ولا تُدخل يومية */}
          {model.rows.some(r => r.state === 'none') && (
            <div style={{ ...card, borderColor: 'rgba(220,38,38,.4)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: 'rgba(220,38,38,.08)', borderBottom: '1px solid rgba(220,38,38,.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: '.86rem', fontWeight: 800, color: '#b91c1c' }}>محطات فيها موظفون ولا تُدخل أي يومية ({T.none})</p>
                <span style={{ fontSize: '.7rem', color: 'var(--text-3)' }}>{dayLabel(day)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, padding: 14 }}>
                {model.rows.filter(r => r.state === 'none').sort((a, b) => b.N - a.N).map(r => (
                  <button key={r.id} type="button" onClick={() => { setFilter('none'); setOpen(s => new Set(s).add(r.id)) }}
                    style={{ textAlign: 'start', padding: '11px 13px', borderRadius: 10, border: '1px solid rgba(220,38,38,.3)', background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-1)' }}>
                    <div style={{ fontWeight: 800, fontSize: '.84rem' }} dir="auto">{r.name}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.7 }}>
                      {r.N} موظف · {r.opened === 0 ? <b style={{ color: C.bad }}>لم يفتح أحد حسابه</b> : <><b style={{ color: '#b45309' }}>{r.opened}</b> فتحوا حساباتهم</>}<br />المتوقع عملهم {r.expected}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* الفلاتر */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 8, overflow: 'hidden', background: 'var(--card)', flexWrap: 'wrap' }}>
              {[['all', 'الكل', model.rows.length], ['none', 'بلا يومية', model.rows.filter(r => r.state === 'none').length], ['low', 'ضعيفة', model.rows.filter(r => r.state === 'low').length], ['mid', 'جزئية', model.rows.filter(r => r.state === 'mid').length], ['full', 'مكتملة', model.rows.filter(r => r.state === 'full').length]].map(([k, l, n]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '7px 12px', border: 'none', borderInlineStart: '1px solid var(--border)', background: filter === k ? '#1C2B4A' : 'transparent', color: filter === k ? '#fff' : 'var(--text-2)', fontWeight: 700, fontSize: '.74rem', cursor: 'pointer', fontFamily: 'inherit' }}>{l} <span style={{ fontFamily: MONO, opacity: .75 }}>{n}</span></button>
              ))}
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث باسم المحطة" style={{ ...ctl, minWidth: 170 }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...ctl, marginInlineStart: 'auto' }} aria-label="ترتيب المحطات">
              <option value="risk">ترتيب: الأكثر حاجة للمتابعة</option><option value="compliance">ترتيب: الأعلى تغطية</option><option value="staff">ترتيب: الأكثر موظفين</option><option value="name">ترتيب: الاسم</option>
            </select>
          </div>

          {/* دليل الألوان */}
          <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap' }}>
            {Object.keys(SEG_LABEL).map(k => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--text-2)' }}>
                <i style={{ width: 11, height: 11, borderRadius: 3, background: C[k], display: 'inline-block' }} />{k === 'leave' ? leaveLabel : SEG_LABEL[k]}
              </span>
            ))}
          </div>

          {/* المحطات */}
          <div style={{ ...card, overflow: 'hidden' }}>
            {list.map((r, i) => {
              const isOpen = open.has(r.id)
              const S = STATE[r.state]
              return (
                <div key={r.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <button type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen} className="cov-row"
                    style={{ background: isOpen ? 'var(--surface)' : 'transparent' }}>
                    <span dir="auto" className="cov-name" style={{ fontWeight: 800, fontSize: '.84rem' }}>{r.name}</span>
                    {[[r.N, 'موظف'], [r.opened, 'فتحوا'], [r.entered, 'أضافوا']].map(([v, l]) => (
                      <span key={l} className="cov-num" style={{ fontFamily: MONO, fontWeight: 800, fontSize: '.95rem', lineHeight: 1.1 }}>{v}<span style={{ display: 'block', fontFamily: 'inherit', fontWeight: 600, fontSize: '.6rem', color: 'var(--text-3)' }}>{l}</span></span>
                    ))}
                    <span className="cov-bar">
                      <SegBar seg={r.seg} total={r.N} />
                      <span style={{ fontSize: '.64rem', color: 'var(--text-3)' }}>{leaveLabel.split(' ')[0]} {r.onLeave} · المتوقع {r.expected} · تغطية <b style={{ color: S.c }}>{r.compliance}%</b></span>
                    </span>
                    <span className="cov-state" style={{ padding: '3px 8px', borderRadius: 99, background: S.bg, color: S.c, fontWeight: 800, fontSize: '.66rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{S.t}</span>
                    <span className="cov-chev" style={{ color: 'var(--text-3)', transform: isOpen ? 'rotate(90deg)' : 'rotate(180deg)', transition: 'transform .15s', display: 'inline-block' }}>&#8250;</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '4px 16px 14px', background: 'var(--surface)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                        {[...r.emp].sort((a, b) => ['entered', 'opened', 'leave', 'idle'].indexOf(a.st) - ['entered', 'opened', 'leave', 'idle'].indexOf(b.st)).map(e => (
                          <div key={e.u.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 9, background: 'var(--card)', border: '1px solid var(--border)' }}>
                            <i style={{ width: 9, height: 9, borderRadius: '50%', background: C[e.st], flexShrink: 0 }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div dir="auto" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.u.full_name_ar}</div>
                              <div style={{ fontSize: '.66rem', color: 'var(--text-3)' }}>{e.u.job_number || '—'} · {e.st === 'entered' ? 'أضاف يومية' : e.st === 'opened' ? 'دخل ولم يضف' : e.st === 'leave' ? 'إجازة معتمدة' : 'لم يدخل'}{e.leaveAct && e.st !== 'leave' ? ' · لديه إجازة معتمدة' : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {list.length === 0 && <p style={{ margin: 0, padding: 22, textAlign: 'center', fontSize: '.8rem', color: 'var(--text-3)' }}>لا محطات تطابق الفلتر.</p>}
          </div>

          {model.noStaff.length > 0 && (
            <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--text-3)', lineHeight: 1.8 }}>
              <b style={{ color: 'var(--text-2)' }}>محطات بلا موظفين مسجّلين ({model.noStaff.length}):</b> {model.noStaff.map(s => s.name).join(' · ')}. لا تدخل في الحساب. المحطات المصنّفة وكلاء أو استراحة مستثناة أيضاً.
            </p>
          )}
          <p style={{ margin: 0, fontSize: '.7rem', color: 'var(--text-3)', lineHeight: 1.8 }}>
            طريقة الحساب: «أضافوا» = موظفون سجّلوا إيراداً في اليوم. «فتحوا» = دخلوا إلى حسابهم في اليوم. المتوقع عملهم = الموظفون − الإجازات ({mode === 'est' ? `تقدير ${pct}% بشكل افتراضي، وهي نسبة تقريبية لا تعتمد على طلبات فعلية` : 'المعتمدة فعلياً'}). عمال النظافة ومشرفو الترحيل والمدراء غير محتسبين.
          </p>
        </>
      )}
    </div>
  )
}

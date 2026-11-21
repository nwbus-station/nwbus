import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { SURVEY_EXEMPT_ROLES } from '../../utils/constants'
import { riyadhDay } from '../../utils/dates'
import { usePresence } from '../../lib/presence'
import { fetchSurveyCities, detectSurveyCity } from '../../pages/SurveyPage'
import { docShell, docHeader, openDocWindow, esc } from '../../utils/printDoc'

const RATING_LABEL = { 1: 'سيئ جداً', 2: 'سيئ', 3: 'محايد', 4: 'جيد', 5: 'ممتاز' }
const RATING_COLOR = { 1: '#dc2626', 2: '#f97316', 3: '#eab308', 4: '#65a30d', 5: '#16a34a' }
const MAX_DAYS = 62

// حالات اليوم لكل حساب — كلها مبنية على بيانات القاعدة (لا «لم يبدأ» مبهمة):
// أكمل · قيّم جزءاً وأغلق (تهرّب) · فتح التقييم وأغلق دون تقييم (تهرّب) · دخل دون تقييم · يقيّم الآن · إجازة · لم يسجّل دخول
export const STATES = {
  evaded:   { t: 'قيّم جزءاً وأغلق',        short: 'تهرّب جزئي',   c: '#ea580c', bg: '#ffedd5', order: 0 },
  skipped:  { t: 'فتح التقييم وأغلق',        short: 'تهرّب كامل',   c: '#dc2626', bg: '#fee2e2', order: 1 },
  noshow:   { t: 'دخل دون تقييم',            short: 'دخل دون تقييم', c: '#9333ea', bg: '#f3e8ff', order: 2 },
  progress: { t: 'يقيّم الآن',               short: 'جارٍ',         c: '#0284c7', bg: '#e0f2fe', order: 3 },
  done:     { t: 'أكمل التقييم',             short: 'أكمل',         c: '#059669', bg: '#d1fae5', order: 4 },
  nocity:   { t: 'محطته بلا استبيان',        short: 'محطة بلا استبيان', c: '#0d9488', bg: '#ccfbf1', order: 5 },
  leave:    { t: 'في إجازة',                 short: 'إجازة',        c: '#64748b', bg: '#e2e8f0', order: 6 },
  off:      { t: 'لم يسجّل دخول',            short: 'لم يسجّل دخول', c: '#9ca3af', bg: '#f3f4f6', order: 7 },
}
const STATE_KEYS = Object.keys(STATES).sort((a, b) => STATES[a].order - STATES[b].order)
const EVADE = new Set(['evaded', 'skipped'])
const PRESENT = new Set(['evaded', 'skipped', 'noshow', 'progress', 'done'])

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const eachDay = (from, to) => { const out = []; for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d); return out }
const fmtDay = d => new Date(d + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeOf = iso => new Date(iso).toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
const avgOf = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const fmtAvg = a => (a == null ? '—' : a.toFixed(2))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const distOf = list => [5, 4, 3, 2, 1].map(n => [n, list.filter(x => x === n).length])
const toneOf = v => (v >= 80 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626')

// قراءة كل الصفوف على دفعات (حد الخادم 1000 صف بالطلب الواحد)
async function fetchAll(build) {
  const out = []
  for (let i = 0; i < 60; i++) {
    const { data, error } = await build().range(i * 1000, i * 1000 + 999)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}

// وصف حالة يوم واحد بنص واضح (مثل «قيّم 1 من 3 وأغلق»)
function dayText(d, need) {
  if (!d) return ''
  if (d.st === 'evaded') return `قيّم ${d.done} من ${need} وأغلق`
  if (d.st === 'progress') return d.done ? `يقيّم الآن (${d.done} من ${need})` : 'ظهر له التقييم الآن'
  if (d.st === 'done') return `أكمل ${d.done} من ${need}`
  return STATES[d.st].t
}

function DistBar({ list, height = 10, legend = false }) {
  const d = distOf(list).reverse()
  const total = list.length
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2, #ebebed)' }}>
        {total ? d.map(([n, c]) => c ? <span key={n} title={`${RATING_LABEL[n]}: ${c}`} style={{ width: `${(c / total) * 100}%`, background: RATING_COLOR[n] }} /> : null) : null}
      </div>
      {legend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8 }}>
          {d.map(([n, c]) => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: 'var(--text-2)' }}>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: RATING_COLOR[n] }} />{RATING_LABEL[n]} <b style={{ color: 'var(--text-1)' }}>{c}</b>
              <span style={{ color: 'var(--text-3)' }}>({pct(c, total)}%)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// شريط الحالات المكدّس: كل حساب (أو يوم) قطعة بلون حالته
function StateBar({ counts, total, height = 14, onPick, active }) {
  return (
    <div style={{ display: 'flex', height, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2, #ebebed)', gap: total ? 2 : 0 }}>
      {STATE_KEYS.map(k => counts[k] ? (
        <span key={k} role={onPick ? 'button' : undefined} onClick={onPick ? () => onPick(k) : undefined} title={`${STATES[k].t}: ${counts[k]}`}
          style={{ flex: counts[k], background: STATES[k].c, opacity: active && active !== k ? .35 : 1, cursor: onPick ? 'pointer' : 'default', minWidth: 4 }} />
      ) : null)}
    </div>
  )
}

function Chip({ st, text, big }) {
  const s = STATES[st]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: big ? '4px 11px' : '2px 9px', borderRadius: 99, background: s.bg, color: s.c, fontWeight: 800, fontSize: big ? '.8rem' : '.72rem', whiteSpace: 'nowrap' }}>
    <i style={{ width: 7, height: 7, borderRadius: 99, background: s.c }} />{text || s.t}
  </span>
}

function Dots({ done, need }) {
  return <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} aria-label={`${done} من ${need}`}>
    {Array.from({ length: need }, (_, i) => <i key={i} style={{ width: 11, height: 11, borderRadius: 99, background: i < done ? '#059669' : 'transparent', border: `2px solid ${i < done ? '#059669' : 'var(--border-2, #d4d4d8)'}` }} />)}
    <b style={{ marginInlineStart: 6, fontFamily: 'monospace', fontSize: '.85rem' }}>{done}/{need}</b>
  </span>
}

// تقرير التقييم اليومي للركاب: من حضر ومن قيّم ومن تهرّب، لأي يوم أو فترة، مع طباعة وتصدير
export default function DailySurveyReport({ need, target, selectedIds }) {
  const today = riyadhDay()
  const presence = usePresence()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [stationF, setStationF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('issues')
  const [open, setOpen] = useState(() => new Set())
  const [tick, setTick] = useState(0)

  const days = useMemo(() => eachDay(from, to), [from, to])
  const last = days[days.length - 1] ?? to
  const single = days.length === 1
  const N = days.length
  const presets = [
    ['اليوم', today, today],
    ['أمس', addDays(today, -1), addDays(today, -1)],
    ['آخر 7 أيام', addDays(today, -6), today],
    ['هذا الشهر', today.slice(0, 8) + '01', today],
  ]
  const setRange = (a, b) => { setTick(0); setFrom(a); setTo(b) }
  const onFrom = v => { if (!v) return; setTick(0); setFrom(v); if (v > to) setTo(v) }
  const onTo = v => { if (!v) return; setTick(0); setTo(v); if (v < from) setFrom(v) }

  // تحديث كامل كل 5 دقائق لليوم الحالي (الدخول والإدخالات)
  useEffect(() => {
    if (last !== today) return
    const id = setInterval(() => setTick(t => t + 1), 5 * 60000)
    return () => clearInterval(id)
  }, [last, today])

  // مباشر: أي تقييم يُسجَّل أو تقدّم يتغيّر يظهر فوراً دون تحديث الصفحة (Realtime + فحص احتياطي كل 10 ثوانٍ لتقدّم التقييم فقط)
  const loaded = !!data?.users?.length
  useEffect(() => {
    if (last !== today || !loaded) return
    let off = false, timer = null, busy = false
    const refreshLive = async () => {
      if (busy || off) return
      busy = true
      try {
        const [p, e] = await Promise.all([
          fetchAll(() => supabase.from('user_daily_survey').select('user_id, day, done, updated_at').gte('day', from).lte('day', last).order('user_id').order('day')),
          fetchAll(() => supabase.from('user_survey_events').select('id, user_id, day, rating, created_at').gte('day', from).lte('day', last).order('created_at').order('id')),
        ])
        if (!off && !p.error) setData(d => (d ? { ...d, progress: p.data, events: e.error ? d.events : e.data, at: Date.now() } : d))
      } finally { busy = false }
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(refreshLive, 700) }
    const ch = supabase.channel('survey-report-live-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_daily_survey' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_survey_events' }, soon)
      .subscribe()
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') refreshLive() }, 10000)
    const onVis = () => { if (document.visibilityState === 'visible') refreshLive() }
    document.addEventListener('visibilitychange', onVis)
    return () => { off = true; clearTimeout(timer); clearInterval(id); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [from, last, today, loaded])

  useEffect(() => {
    let off = false
    if (!tick) { setData(null) }
    setErr('')
    ;(async () => {
      const fT = `${from}T00:00:00+03:00`, tT = `${last}T23:59:59.999+03:00`
      const [u, p, e, tr, sl, lv, au, cities] = await Promise.all([
        fetchAll(() => supabase.from('users').select('id, full_name_ar, job_number, role, last_login, station:station_id(id, name_ar, name_en, survey_city)').eq('is_active', true).not('role', 'in', `(${SURVEY_EXEMPT_ROLES.join(',')})`).order('id')),
        fetchAll(() => supabase.from('user_daily_survey').select('user_id, day, done, updated_at').gte('day', from).lte('day', last).order('user_id').order('day')),
        fetchAll(() => supabase.from('user_survey_events').select('id, user_id, day, rating, created_at').gte('day', from).lte('day', last).order('created_at').order('id')),
        fetchAll(() => supabase.from('trip_records').select('id, created_by, record_date, created_at').gte('record_date', from).lte('record_date', last).order('id')),
        // إدخال الإيراد نيابةً عن موظف (entered_by) يُنسب لمن أدخله فعلاً لا للموظف الغائب
        fetchAll(() => supabase.from('sales_records').select('id, created_by, entered_by, sale_date, created_at').gte('sale_date', from).lte('sale_date', last).order('id'))
          .then(r => (r.error ? fetchAll(() => supabase.from('sales_records').select('id, created_by, sale_date, created_at').gte('sale_date', from).lte('sale_date', last).order('id')) : r)),
        fetchAll(() => supabase.from('leaves').select('id, employee_id, start_date, end_date').eq('status', 'approved').lte('start_date', last).gte('end_date', from).order('id')),
        // تسجيلات الدخول السابقة من سجل التدقيق (تغيّر last_login)
        fetchAll(() => supabase.from('audit_log').select('id, record_id, created_at, a:after_data->>last_login, b:before_data->>last_login').eq('table_name', 'users').gte('created_at', fT).lte('created_at', tT).order('id')),
        fetchSurveyCities().catch(() => null),
      ])
      if (off) return
      if (p.error) { setErr('جدول المتابعة غير مُنشأ بعد. شغّل استعلام SQL الخاص بالتقييم اليومي.'); setData({ users: [] }); return }
      if (u.error) { setErr('تعذّر تحميل الحسابات: ' + u.error.message); return }
      const users = target === 'selected' ? u.data.filter(x => selectedIds.includes(x.id)) : u.data
      setData({ users, progress: p.data, events: e.error ? [] : e.data, noEvents: !!e.error, trips: tr.data, sales: sl.data, cities, leaves: lv.data, audit: au.error ? [] : au.data, auditOk: !au.error, at: Date.now() })
    })()
    return () => { off = true }
  }, [from, last, target, selectedIds.join(','), tick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── بناء حالة كل حساب لكل يوم ──
  const base = useMemo(() => {
    if (!data?.users?.length) return []
    const k = (uid, d) => uid + '|' + d
    const prog = {}, evs = {}, login = {}, act = {}
    for (const r of data.progress) prog[k(r.user_id, r.day)] = r
    for (const r of data.events) (evs[k(r.user_id, r.day)] ||= []).push(r)
    const addLogin = (uid, iso) => { if (!uid || !iso) return; const d = riyadhDay(iso); const key = k(uid, d); if (!login[key] || iso < login[key]) login[key] = iso }
    for (const r of data.audit) if (r.a && r.a !== r.b) addLogin(String(r.record_id), r.a)
    for (const u of data.users) addLogin(u.id, u.last_login)
    for (const r of data.trips) { const a = (act[k(r.created_by, r.record_date)] ||= { trips: 0, sales: 0, first: r.created_at }); a.trips++; if (r.created_at < a.first) a.first = r.created_at }
    for (const r of data.sales) { const a = (act[k(r.entered_by || r.created_by, r.sale_date)] ||= { trips: 0, sales: 0, first: r.created_at }); a.sales++; if (r.created_at < a.first) a.first = r.created_at }
    const leaveOf = {}
    for (const l of data.leaves) (leaveOf[l.employee_id] ||= []).push(l)
    const nowMs = Date.now()
    // المحطات غير المربوطة بمدينة استبيان نشطة: لا تظهر لموظفيها صفحة التقييم أصلاً (ليس تهرّباً منهم)
    const activeCities = data.cities ? new Set(data.cities.filter(c => c.is_active !== false).map(c => c.city)) : null
    const covered = u => !activeCities || (!!u.station && activeCities.has(detectSurveyCity(u.station)))

    return data.users.map(u => {
      const hasCity = covered(u)
      const perDay = days.map(d => {
        const p = prog[k(u.id, d)], ev = evs[k(u.id, d)] ?? [], lg = login[k(u.id, d)], a = act[k(u.id, d)]
        const online = d === today && !!presence[u.id]
        const onLeave = (leaveOf[u.id] ?? []).some(l => l.start_date <= d && l.end_date >= d)
        const done = Math.max(p?.done ?? 0, ev.length)
        const recent = p?.updated_at && nowMs - new Date(p.updated_at).getTime() < 15 * 60 * 1000
        let st
        if (p || done > 0) {
          if (done >= need) st = 'done'
          else if (d === today && (online || recent)) st = 'progress'
          else st = done > 0 ? 'evaded' : 'skipped'
        } else if (!hasCity && (lg || a || online)) st = 'nocity'
        else if (lg || a || online) st = 'noshow'
        else if (onLeave) st = 'leave'
        else st = 'off'
        return { day: d, st, done, evs: ev, login: lg || null, act: a || null, online }
      })
      const counts = {}
      for (const x of perDay) counts[x.st] = (counts[x.st] || 0) + 1
      const present = perDay.filter(x => PRESENT.has(x.st)).length   // «محطته بلا استبيان» لا تدخل في الالتزام
      const doneDays = counts.done || 0
      const evaded = (counts.evaded || 0) + (counts.skipped || 0)
      const allEvs = perDay.flatMap(x => x.evs)
      const ratings = allEvs.map(e => e.rating).filter(r => r >= 1 && r <= 5)
      const total = perDay.reduce((s, x) => s + x.done, 0)
      // الحالة الممثّلة: ليوم واحد = حالة اليوم، ولفترة = أسوأ حالة ظهرت (التهرّب أولاً)
      const st = single ? perDay[0].st : STATE_KEYS.find(s => counts[s]) || 'off'
      return { u, hasCity, perDay, counts, present, doneDays, evaded, ratings, avg: avgOf(ratings), total, st, compliance: present ? pct(doneDays, present) : null,
        station: u.station?.name_ar || u.station?.name_en || 'بدون محطة' }
    })
  }, [data, days, need, presence, single, today])

  const stations = useMemo(() => [...new Set(base.map(r => r.station))].sort((a, b) => a.localeCompare(b, 'ar')), [base])
  const matchSt = (r, s) => (single ? r.st === s : !!r.counts[s])
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return base.filter(r => (!stationF || r.station === stationF) && (!statusF || (statusF === 'evade' ? r.evaded > 0 : matchSt(r, statusF)))
      && (!term || (r.u.full_name_ar ?? '').toLowerCase().includes(term) || String(r.u.job_number ?? '').includes(term)))
  }, [base, stationF, statusF, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const sumCounts = list => { const c = {}; for (const r of list) for (const [s, n] of Object.entries(r.counts)) c[s] = (c[s] || 0) + n; return c }
  const groups = useMemo(() => {
    const m = new Map()
    for (const r of rows) { if (!m.has(r.station)) m.set(r.station, []); m.get(r.station).push(r) }
    const arr = [...m.entries()].map(([name, list]) => {
      const counts = sumCounts(list)
      const present = list.reduce((a, r) => a + r.present, 0), doneDays = list.reduce((a, r) => a + r.doneDays, 0)
      const ratings = list.flatMap(r => r.ratings)
      const evaded = list.reduce((a, r) => a + r.evaded, 0)
      const sorted = [...list].sort((a, b) => STATES[a.st].order - STATES[b.st].order || b.evaded - a.evaded || (a.u.full_name_ar ?? '').localeCompare(b.u.full_name_ar ?? '', 'ar'))
      return { name, noCity: list.every(r => !r.hasCity), list: sorted, counts, present, evaded, total: list.reduce((a, r) => a + r.total, 0), ratings, avg: avgOf(ratings), compliance: present ? pct(doneDays, present) : null }
    })
    const cmp = {
      issues: (a, b) => b.evaded - a.evaded || (a.compliance ?? 101) - (b.compliance ?? 101),
      name: (a, b) => a.name.localeCompare(b.name, 'ar'),
      compliance: (a, b) => (b.compliance ?? -1) - (a.compliance ?? -1),
      avg: (a, b) => (b.avg ?? -1) - (a.avg ?? -1),
    }[sortBy]
    return arr.sort(cmp)
  }, [rows, sortBy])

  const counts = useMemo(() => sumCounts(rows), [rows])
  const unitTotal = rows.length * N
  const present = rows.reduce((a, r) => a + r.present, 0)
  const doneDays = rows.reduce((a, r) => a + r.doneDays, 0)
  const compliance = present ? pct(doneDays, present) : 0
  const totalRatings = rows.reduce((a, r) => a + r.total, 0)
  const allRatings = rows.flatMap(r => r.ratings)
  const evaders = rows.filter(r => r.evaded > 0).sort((a, b) => b.evaded - a.evaded)
  const rangeLabel = single ? fmtDay(from) : `${from} إلى ${last}`
  const unit = single ? 'حساب' : 'يوم عمل'

  const [xlBusy, setXlBusy] = useState(false)
  async function exportExcel() {
    setXlBusy(true)
    try {
      const { exportSurveyExcel } = await import('../../utils/surveyReportExport')
      await exportSurveyExcel({ groups, ctx: { from, to: last, N, single, need, total: totalRatings, compliance, allRatings, stationF, counts, present, accounts: rows.length, dayText } })
    } catch (e) { setErr('تعذّر إنشاء ملف Excel: ' + (e?.message || '')) }
    setXlBusy(false)
  }

  function print() {
    const chip = (st, text) => `<span class="chip" style="background:${STATES[st].bg};color:${STATES[st].c}">${esc(text || STATES[st].t)}</span>`
    const rate = e => `<span style="display:inline-block;margin:1px 2px;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700;color:#fff;background:${RATING_COLOR[e.rating] || '#94a3b8'}">${single ? timeOf(e.created_at) : e.day.slice(5)} ${e.rating ? RATING_LABEL[e.rating] : '—'}</span>`
    const sbar = c => { const t = Object.values(c).reduce((a, b) => a + b, 0); return `<div style="display:flex;height:12px;border-radius:4px;overflow:hidden;background:#e8edf3;gap:2px">${STATE_KEYS.map(k => c[k] ? `<i style="display:block;flex:${c[k]};background:${STATES[k].c}"></i>` : '').join('')}</div><div style="margin-top:5px;font-size:10.5px;color:#475569">${STATE_KEYS.filter(k => c[k]).map(k => `<span style="margin-inline-end:12px"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${STATES[k].c};margin-inline-end:4px"></i>${STATES[k].t} <b>${c[k]}</b> (${pct(c[k], t)}%)</span>`).join('')}</div>` }
    const strip = r => r.perDay.map(x => `<i title="${x.day}" style="display:inline-block;width:9px;height:14px;margin:0 1px;border-radius:2px;background:${STATES[x.st].c}"></i>`).join('')
    const actTxt = d => [d.login ? `دخول ${timeOf(d.login)}` : '', d.act ? `${d.act.trips ? d.act.trips + ' رحلة' : ''}${d.act.trips && d.act.sales ? ' · ' : ''}${d.act.sales ? d.act.sales + ' إيراد' : ''}` : ''].filter(Boolean).join(' · ') || '—'
    const body = `<div class="body">
      <div class="sec"><div class="grid g5">
        <div class="kpi" style="--c:${toneOf(compliance)}"><small>نسبة الالتزام (من الحاضرين)</small><b>${compliance}%</b><em>${doneDays} من ${present} ${unit}</em></div>
        <div class="kpi" style="--c:#0369a1"><small>${single ? 'حضروا اليوم' : 'أيام حضور'}</small><b>${present}</b><em>من ${unitTotal} ${unit}</em></div>
        <div class="kpi" style="--c:#dc2626"><small>حالات تهرّب</small><b>${(counts.evaded || 0) + (counts.skipped || 0)}</b><em>جزئي ${counts.evaded || 0} · كامل ${counts.skipped || 0}</em></div>
        <div class="kpi" style="--c:#059669"><small>إجمالي التقييمات</small><b>${totalRatings}</b><em>${single ? 'اليوم' : `خلال ${N} يوم`}</em></div>
        <div class="kpi" style="--c:#7c3aed"><small>متوسط رضا الركاب</small><b>${fmtAvg(avgOf(allRatings))}</b><em>من 5 (${allRatings.length} نتيجة)</em></div>
      </div></div>
      <div class="sec"><h3>توزيع الحالات</h3>${sbar(counts)}</div>
      ${evaders.length ? `<div class="sec"><h3 style="color:#b91c1c">حالات التهرّب من التقييم (${evaders.length})</h3><table class="t"><thead><tr><th>الموظف</th><th>المحطة</th><th>${single ? 'ما حدث' : 'أيام التهرّب'}</th><th>الدخول والنشاط</th></tr></thead><tbody>
        ${evaders.map(r => `<tr><td class="l"><b>${esc(r.u.full_name_ar ?? '—')}</b> <span class="muted">${esc(r.u.job_number ?? '')}</span></td><td>${esc(r.station)}</td>
          <td>${single ? chip(r.st, dayText(r.perDay[0], need)) : r.perDay.filter(x => EVADE.has(x.st)).map(x => `${x.day.slice(5)}: ${esc(dayText(x, need))}`).join('<br>')}</td>
          <td>${single ? actTxt(r.perDay[0]) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="sec"><h3>ملخص المحطات</h3>
        <table class="t"><thead><tr><th>المحطة</th><th>الحسابات</th><th>الحاضرون</th><th>أكمل</th><th>تهرّب</th><th>دخل دون تقييم</th><th>بلا استبيان</th><th>لم يسجّل دخول</th><th>الالتزام</th><th>الرضا</th></tr></thead><tbody>
        ${groups.map(g => `<tr><td class="l"><b>${esc(g.name)}</b>${g.noCity ? ' <span class="chip" style="background:#ccfbf1;color:#0d9488">غير مربوطة بالاستبيان</span>' : ''}</td><td>${g.list.length}</td><td>${g.present}</td><td>${g.counts.done || 0}</td><td style="color:#b91c1c"><b>${g.evaded || ''}</b></td><td>${g.counts.noshow || ''}</td><td>${g.counts.nocity || ''}</td><td class="muted">${g.counts.off || ''}</td><td><b style="color:${toneOf(g.compliance ?? 0)}">${g.compliance == null ? '—' : g.compliance + '%'}</b></td><td>${fmtAvg(g.avg)}</td></tr>`).join('')}
        <tr class="tot"><td class="l">الإجمالي</td><td>${rows.length}</td><td>${present}</td><td>${counts.done || 0}</td><td>${(counts.evaded || 0) + (counts.skipped || 0)}</td><td>${counts.noshow || 0}</td><td>${counts.nocity || 0}</td><td>${counts.off || 0}</td><td>${compliance}%</td><td>${fmtAvg(avgOf(allRatings))}</td></tr></tbody></table></div>
      ${groups.map(g => `<div class="sec"><h3>${esc(g.name)} <span class="muted">(${g.list.length} حساب · التزام ${g.compliance == null ? '—' : g.compliance + '%'} · رضا ${fmtAvg(g.avg)})</span></h3>
        <table class="t"><thead><tr><th>الموظف</th><th>الرقم</th><th>${single ? 'الحالة' : 'الأيام'}</th><th>${single ? 'الدخول والنشاط' : 'الملخص'}</th><th>نتائج الركاب</th></tr></thead><tbody>
        ${g.list.map(r => `<tr><td class="l"><b>${esc(r.u.full_name_ar ?? '—')}</b></td><td>${esc(r.u.job_number ?? '—')}</td>
          <td>${single ? chip(r.st, dayText(r.perDay[0], need)) : strip(r)}</td>
          <td class="l">${single ? actTxt(r.perDay[0]) : `أكمل ${r.doneDays} · تهرّب ${r.evaded} · حضور ${r.present} من ${N}`}</td>
          <td class="l">${r.perDay.flatMap(x => x.evs).map(rate).join('') || '—'}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      <p class="muted">الحضور يُستخرج من قاعدة البيانات: تسجيل الدخول، أو ظهور صفحة التقييم، أو إدخال رحلات وإيرادات${data?.auditOk ? '' : ' (سجل الدخول للأيام السابقة غير متاح)'}. الالتزام = أيام الإكمال ÷ أيام الحضور.</p>
    </div>`
    openDocWindow(docShell({
      title: `تقرير تقييم الركاب — ${from}${single ? '' : '_' + last}`,
      body: docHeader({ title: 'تقرير التقييم اليومي للركاب', infoLines: [`${single ? 'اليوم' : 'الفترة'}: <b>${esc(rangeLabel)}</b>`, `الحسابات: <b>${rows.length}</b>`, stationF ? `المحطة: <b>${esc(stationF)}</b>` : 'كل المحطات'] }) + body,
      footerLeft: `طُبع: ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }))}`, footerRight: 'وثيقة داخلية',
      shareText: `تقرير التقييم اليومي للركاب — ${rangeLabel}\nالالتزام: ${compliance}% · التهرّب: ${(counts.evaded || 0) + (counts.skipped || 0)} · الرضا: ${fmtAvg(avgOf(allRatings))}/5`,
    }))
  }

  const ctl = { padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border-2, #e0e0e0)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.86rem' }
  const dpCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'
  const toggle = id => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const btn = primary => ({ padding: '10px 16px', borderRadius: 9, border: primary ? 'none' : '1px solid var(--border-2, #e0e0e0)', background: primary ? '#1C2B4A' : 'var(--card)', color: primary ? '#fff' : 'var(--text-1)', fontWeight: 800, fontSize: '.84rem', cursor: 'pointer', fontFamily: 'inherit', opacity: rows.length ? 1 : .5 })
  const card = { border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 14, background: 'var(--card)' }
  const pickState = s => setStatusF(f => (f === s ? '' : s))

  return (
    <div className="dsr" style={{ fontSize: '.92rem' }}>
      <style>{`
        .dsr-emp{display:grid;grid-template-columns:minmax(180px,1.3fr) minmax(170px,1fr) minmax(160px,1fr) minmax(150px,1.2fr);gap:14px;align-items:center}
        .dsr-head{display:grid;grid-template-columns:minmax(170px,1.4fr) minmax(200px,2fr) 90px 90px 90px 20px;gap:16px;align-items:center}
        @media (max-width: 820px){.dsr-hero{grid-template-columns:1fr!important}.dsr-emp{grid-template-columns:1fr 1fr}.dsr-head{grid-template-columns:1fr 70px 20px}.dsr-head .dsr-hide{display:none}}
      `}</style>

      {/* الفترة والإجراءات */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
          {presets.map(([label, a, b]) => {
            const on = from === a && to === b
            return <button key={label} type="button" onClick={() => setRange(a, b)}
              style={{ padding: '9px 15px', border: 'none', borderInlineStart: '1px solid var(--border)', background: on ? '#1C2B4A' : 'transparent', color: on ? '#fff' : 'var(--text-2)', fontWeight: 800, fontSize: '.84rem', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
          })}
        </div>
        <span style={{ fontSize: '.84rem', color: 'var(--text-3)' }}>من</span>
        <div style={{ width: 170 }}><DatePicker value={from} onChange={onFrom} max={today} isAr className={dpCls} /></div>
        <span style={{ fontSize: '.84rem', color: 'var(--text-3)' }}>إلى</span>
        <div style={{ width: 170 }}><DatePicker value={to} onChange={onTo} max={today} isAr className={dpCls} /></div>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8 }}>
          <button type="button" onClick={exportExcel} disabled={!rows.length || xlBusy} style={btn(false)}>{xlBusy ? 'جارٍ التجهيز...' : 'تصدير Excel'}</button>
          <button type="button" onClick={print} disabled={!rows.length} style={btn(true)}>طباعة التقرير</button>
        </span>
      </div>
      <p style={{ margin: '10px 0 16px', fontSize: '.86rem', color: 'var(--text-2)', fontWeight: 700 }}>
        {rangeLabel}{!single ? ` · ${N} يوم` : ''}
        {last === today && data?.at ? <span style={{ color: '#059669', fontWeight: 700 }}> · <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: '#059669', marginInlineEnd: 4 }} />مباشر · آخر تحديث {timeOf(data.at)}</span> : null}
      </p>

      {err && <p style={{ margin: '0 0 10px', fontSize: '.84rem', color: '#b91c1c' }}>{err}</p>}
      {!data ? <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--text-3)' }}>جارٍ تحميل البيانات والتحقق من الدخول والنشاط...</p> : (
        <>
          {/* البطاقة الرئيسية: الالتزام + توزيع الحالات */}
          <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) 1fr', gap: 22, alignItems: 'center' }} className="dsr-hero">
            <div style={{ textAlign: 'center' }}>
              <div style={{ position: 'relative', width: 170, height: 170, margin: '0 auto' }}>
                <svg viewBox="0 0 120 120" width="170" height="170" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(128,128,128,.22)" strokeWidth="12" />
                  <circle cx="60" cy="60" r="52" fill="none" stroke={toneOf(compliance)} strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(compliance / 100) * 326.7} 326.7`} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center' }}>
                  <b style={{ fontSize: '2.5rem', lineHeight: 1, color: toneOf(compliance), fontFamily: 'monospace' }}>{compliance}%</b>
                  <span style={{ fontSize: '.78rem', color: 'var(--text-3)', marginTop: 4 }}>التزام الحاضرين</span>
                </div>
              </div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-2)', marginTop: 8 }}>أكمل <b>{doneDays}</b> من <b>{present}</b> {unit} حاضر</div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: '1rem', color: 'var(--text-1)' }}>توزيع الحالات</b>
                <span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>{rows.length} حساب{single ? '' : ` × ${N} يوم`} · اضغط أي حالة للفلترة</span>
              </div>
              <StateBar counts={counts} total={unitTotal} height={22} onPick={pickState} active={statusF} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 14 }}>
                {STATE_KEYS.filter(k => counts[k] || ['done', 'evaded', 'skipped', 'off'].includes(k)).map(k => {
                  const on = statusF === k
                  return (
                    <button key={k} type="button" onClick={() => pickState(k)}
                      style={{ textAlign: 'start', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${on ? STATES[k].c : 'var(--border-2, #e0e0e0)'}`, background: on ? STATES[k].bg : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.78rem', fontWeight: 700, color: on ? STATES[k].c : 'var(--text-2)' }}><i style={{ width: 9, height: 9, borderRadius: 3, background: STATES[k].c }} />{STATES[k].t}</span>
                      <b style={{ display: 'block', fontSize: '1.55rem', lineHeight: 1.15, marginTop: 4, color: counts[k] ? STATES[k].c : 'var(--text-3)', fontFamily: 'monospace' }}>{counts[k] || 0}</b>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* مؤشرات الرضا */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={{ ...card, padding: '14px 16px', display: 'flex', gap: 18, alignItems: 'center' }}>
              <div><span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>إجمالي التقييمات</span><b style={{ display: 'block', fontSize: '1.9rem', fontFamily: 'monospace', color: 'var(--text-1)' }}>{totalRatings}</b></div>
              <div><span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>متوسط رضا الركاب</span><b style={{ display: 'block', fontSize: '1.9rem', fontFamily: 'monospace', color: '#7c3aed' }}>{fmtAvg(avgOf(allRatings))}<span style={{ fontSize: '.9rem', color: 'var(--text-3)' }}> / 5</span></b></div>
            </div>
            <div style={{ ...card, padding: '14px 16px' }}>
              <span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>توزيع نتائج الركاب ({allRatings.length})</span>
              <div style={{ marginTop: 8 }}><DistBar list={allRatings} height={12} legend /></div>
            </div>
          </div>

          {/* حالات التهرّب */}
          {evaders.length > 0 && (
            <div style={{ ...card, marginTop: 12, borderColor: '#fecaca', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: 'rgba(220,38,38,.07)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: '1rem', color: '#b91c1c' }}>حالات التهرّب من التقييم</b>
                <span style={{ fontSize: '.8rem', color: 'var(--text-2)' }}>{evaders.length} موظف · بدأ التقييم ثم أغلق قبل إكمال العدد ({need})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1, background: 'var(--border)' }}>
                {evaders.slice(0, 24).map(r => {
                  const d = single ? r.perDay[0] : r.perDay.filter(x => EVADE.has(x.st)).slice(-1)[0]
                  return (
                    <div key={r.u.id} style={{ background: 'var(--card)', padding: '11px 14px' }}>
                      <div style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--text-1)' }} dir="auto">{r.u.full_name_ar}</div>
                      <div style={{ fontSize: '.74rem', color: 'var(--text-3)', margin: '2px 0 7px' }} dir="auto">{r.station}{r.u.job_number ? ` · ${r.u.job_number}` : ''}</div>
                      {single ? <><Chip st={d.st} text={dayText(d, need)} />{d.evs.length ? <span style={{ fontSize: '.74rem', color: 'var(--text-3)', marginInlineStart: 8 }}>آخر تقييم {timeOf(d.evs[d.evs.length - 1].created_at)}</span> : null}</>
                        : <span style={{ fontSize: '.8rem', color: '#b91c1c', fontWeight: 700 }}>تهرّب {r.evaded} من {r.present} يوم حضور</span>}
                    </div>
                  )
                })}
              </div>
              {evaders.length > 24 && <p style={{ margin: 0, padding: '8px 16px', fontSize: '.78rem', color: 'var(--text-3)' }}>و{evaders.length - 24} آخرين — اختر «تهرّب» من الفلتر لعرضهم كلهم.</p>}
            </div>
          )}

          {groups.some(g => g.noCity) && (
            <div style={{ ...card, marginTop: 12, padding: '12px 16px', borderColor: STATES.nocity.c + '55', background: STATES.nocity.bg }}>
              <b style={{ color: STATES.nocity.c, fontSize: '.95rem' }}>محطات غير مربوطة بالاستبيان ({groups.filter(g => g.noCity).length})</b>
              <p style={{ margin: '4px 0 8px', fontSize: '.8rem', color: '#115e59' }}>لا تظهر صفحة التقييم لموظفي هذه المحطات. اربطها من «تعديل روابط المدن» أعلى الصفحة.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groups.filter(g => g.noCity).map(g => <span key={g.name} dir="auto" style={{ padding: '3px 10px', borderRadius: 99, background: '#fff', color: STATES.nocity.c, border: `1px solid ${STATES.nocity.c}55`, fontSize: '.78rem', fontWeight: 700 }}>{g.name} · {g.list.length}</span>)}
              </div>
            </div>
          )}

          {/* فلاتر */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '18px 0 10px' }}>
            <select value={stationF} onChange={e => setStationF(e.target.value)} style={ctl}>
              <option value="">كل المحطات</option>{stations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} style={ctl}>
              <option value="">كل الحالات</option>
              <option value="evade">تهرّب (جزئي أو كامل)</option>
              {STATE_KEYS.map(k => <option key={k} value={k}>{STATES[k].t}</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم الوظيفي" style={{ ...ctl, minWidth: 220 }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...ctl, marginInlineStart: 'auto' }} aria-label="ترتيب المحطات">
              <option value="issues">ترتيب: الأكثر تهرّباً</option><option value="compliance">ترتيب: الأعلى التزاماً</option><option value="avg">ترتيب: الأعلى رضا</option><option value="name">ترتيب: الاسم</option>
            </select>
          </div>

          {/* المحطات */}
          <div style={{ ...card, overflow: 'hidden' }}>
            {groups.map((g, gi) => {
              const isOpen = open.has(g.name) || !!q.trim() || groups.length === 1 || !!stationF
              return (
                <div key={g.name} style={{ borderTop: gi ? '1px solid var(--border-2, #e0e0e0)' : 'none' }}>
                  <button type="button" onClick={() => toggle(g.name)} aria-expanded={isOpen} className="dsr-head"
                    style={{ width: '100%', padding: '14px 16px', border: 'none', background: isOpen ? 'var(--surface)' : 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
                    <span>
                      <b style={{ fontSize: '1rem' }} dir="auto">{g.name}</b>
                      {g.noCity && <span style={{ marginInlineStart: 8, padding: '2px 9px', borderRadius: 99, background: STATES.nocity.bg, color: STATES.nocity.c, fontSize: '.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>غير مربوطة بالاستبيان</span>}
                      <span style={{ display: 'block', fontSize: '.76rem', color: 'var(--text-3)', marginTop: 2 }}>{g.list.length} حساب · حضر {g.present} {unit}</span>
                    </span>
                    <span className="dsr-hide"><StateBar counts={g.counts} total={g.list.length * N} height={12} />
                      <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 5, fontSize: '.72rem', color: 'var(--text-3)' }}>
                        {STATE_KEYS.filter(k => g.counts[k]).map(k => <span key={k}><b style={{ color: STATES[k].c }}>{g.counts[k]}</b> {STATES[k].short}</span>)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'center' }}><b style={{ fontSize: '1.25rem', fontFamily: 'monospace', color: g.compliance == null ? 'var(--text-3)' : toneOf(g.compliance) }}>{g.compliance == null ? '—' : `${g.compliance}%`}</b><span style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-3)' }}>التزام</span></span>
                    <span className="dsr-hide" style={{ textAlign: 'center' }}><b style={{ fontSize: '1.25rem', fontFamily: 'monospace', color: g.evaded ? '#dc2626' : 'var(--text-3)' }}>{g.evaded}</b><span style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-3)' }}>تهرّب</span></span>
                    <span className="dsr-hide" style={{ textAlign: 'center' }}><b style={{ fontSize: '1.25rem', fontFamily: 'monospace' }}>{fmtAvg(g.avg)}</b><span style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-3)' }}>رضا / 5</span></span>
                    <span style={{ color: 'var(--text-3)', fontSize: '1.2rem', transform: isOpen ? 'rotate(90deg)' : 'rotate(180deg)', transition: 'transform .15s', display: 'inline-block' }}>&#8250;</span>
                  </button>
                  {isOpen && g.noCity && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: STATES.nocity.bg, color: STATES.nocity.c, fontSize: '.84rem', fontWeight: 700 }}>
                      هذه المحطة غير مربوطة بمدينة استبيان، لذلك لا تظهر صفحة التقييم لموظفيها. اربطها من «تعديل روابط المدن» أعلى الصفحة ليصبح التقييم إلزامياً عليهم.
                    </div>
                  )}
                  {isOpen && g.list.map(r => {
                    const d = r.perDay[0]
                    return (
                      <div key={r.u.id} className="dsr-emp" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', borderInlineStart: `4px solid ${STATES[r.st].c}`, color: 'var(--text-1)' }}>
                        <span>
                          <b style={{ fontSize: '.92rem' }} dir="auto">{r.u.full_name_ar}</b>
                          <span style={{ display: 'block', fontSize: '.76rem', color: 'var(--text-3)' }}>{r.u.job_number || '—'}{single && d.online ? <span style={{ color: '#059669', fontWeight: 700 }}> · متصل الآن</span> : null}</span>
                        </span>
                        {single ? (
                          <span style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                            <Chip st={r.st} text={dayText(d, need)} big />
                            {PRESENT.has(r.st) && <Dots done={Math.min(d.done, need)} need={need} />}
                          </span>
                        ) : (
                          <span>
                            <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                              {r.perDay.map(x => <i key={x.day} title={`${x.day}: ${dayText(x, need)}`} style={{ width: N > 31 ? 6 : 10, height: 18, borderRadius: 2, background: STATES[x.st].c, opacity: x.st === 'off' ? .45 : 1 }} />)}
                            </span>
                            <span style={{ fontSize: '.76rem', color: 'var(--text-2)', marginTop: 4, display: 'block' }}>
                              أكمل <b>{r.doneDays}</b> · {r.evaded ? <b style={{ color: '#dc2626' }}>تهرّب {r.evaded}</b> : 'تهرّب 0'} · حضر {r.present} من {N}
                            </span>
                          </span>
                        )}
                        <span style={{ fontSize: '.8rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
                          {single ? (
                            <>
                              <span style={{ display: 'block' }}>{d.login ? <>دخول <b>{timeOf(d.login)}</b></> : d.act ? <>أول إدخال <b>{timeOf(d.act.first)}</b></> : d.online ? 'متصل الآن' : <span style={{ color: 'var(--text-3)' }}>لا يوجد دخول مسجّل</span>}</span>
                              {d.act && <span style={{ display: 'block' }}>{d.act.trips ? <><b>{d.act.trips}</b> رحلة</> : null}{d.act.trips && d.act.sales ? ' · ' : ''}{d.act.sales ? <><b>{d.act.sales}</b> إيراد</> : null}</span>}
                            </>
                          ) : (
                            <>الالتزام <b style={{ color: r.compliance == null ? 'var(--text-3)' : toneOf(r.compliance), fontSize: '1rem' }}>{r.compliance == null ? '—' : `${r.compliance}%`}</b> · رضا <b>{fmtAvg(r.avg)}</b></>
                          )}
                        </span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r.perDay.flatMap(x => x.evs).slice(-12).map(e => (
                            <span key={e.id} title={e.rating ? RATING_LABEL[e.rating] : 'نتيجة غير مسجّلة'}
                              style={{ display: 'inline-flex', gap: 5, padding: '3px 9px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700, color: '#fff', background: RATING_COLOR[e.rating] || '#94a3b8' }}>
                              <span style={{ fontFamily: 'monospace', opacity: .9 }}>{single ? timeOf(e.created_at) : e.day.slice(5)}</span>{e.rating ? RATING_LABEL[e.rating] : '—'}
                            </span>
                          ))}
                          {!r.perDay.some(x => x.evs.length) && <span style={{ fontSize: '.76rem', color: 'var(--text-3)' }}>لا توجد تقييمات</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {groups.length === 0 && <p style={{ margin: 0, padding: 24, fontSize: '.9rem', color: 'var(--text-3)', textAlign: 'center' }}>لا توجد نتائج لهذه الفترة أو للفلتر المختار.</p>}
          </div>

          <div style={{ marginTop: 10, fontSize: '.78rem', color: 'var(--text-3)', lineHeight: 1.9 }}>
            <b style={{ color: 'var(--text-2)' }}>كيف تُحسب الحالات:</b> «لم يسجّل دخول» تعني لا يوجد له في القاعدة دخول ولا ظهور لصفحة التقييم ولا أي إدخال في ذلك اليوم.
            «فتح التقييم وأغلق» ظهرت له صفحة التقييم وخرج دون أي تقييم. «قيّم جزءاً وأغلق» بدأ وخرج قبل إكمال {need}. «دخل دون تقييم» دخل أو أدخل بيانات ولم تُسجَّل له صفحة تقييم: جهازه على نسخة قديمة لم تتحدّث، أو دخل قبل إصلاح ظهور التقييم اليوم، أو أكمل قبل التصفير القديم. «محطته بلا استبيان» محطة غير مربوطة بمدينة استبيان، فلا تظهر لموظفيها صفحة التقييم — اربطها من «تعديل روابط المدن».
            الالتزام يُحسب من الحاضرين فقط.{data.auditOk ? '' : ' (سجل الدخول للأيام السابقة غير متاح لهذا الحساب، فيُعتمد على آخر دخول والإدخالات.)'}
          </div>
        </>
      )}
    </div>
  )
}

// ملف الموظف (للأدمن فقط): معلومات الموظف كاملة + إجازاته + إيراداته + تقييمه الوظيفي + تقييمات العملاء + دخوله للبرنامج،
// بفلتر موظف/محطة/فترة وأقسام قابلة للاختيار، وطباعة رسمية بالشعار.
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DatePicker from '../components/shared/DatePicker'
import SearchSelect from '../components/shared/SearchSelect'
import { computeFinalScore } from './EvaluationPage'
import { yearsOfService } from '../utils/leaveBalance'
import { todayStr, toLocalDateStr } from '../utils/dates'
import { USER_ROLES, MODULES } from '../utils/constants'
import { esc, docHeader, docShell, openDocWindow } from '../utils/printDoc'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const LEAVE_AR = { annual: 'سنوية', casual: 'استئذان خروج', compensatory: 'تعويضية', unpaid: 'بدون راتب', emergency: 'اضطرارية', sick: 'مرضية', marriage: 'زواج', paternity: 'مولود', bereavement: 'وفاة' }
const STATUS_AR = { approved: 'مقبولة', rejected: 'مرفوضة', pending: 'قيد المراجعة' }
const STATUS_COL = { approved: ['#15803d', '#dcfce7'], rejected: ['#b91c1c', '#fee2e2'], pending: ['#b45309', '#fef3c7'] }
const SRC_AR = { shift_supervisor: 'مشرف الوردية', station_admin: 'مشرف المحطة', stations_executive_director: 'المدير التنفيذي', dispatcher_supervisor: 'مشرف المرحّلين' }
const SECTIONS = [['leaves', 'الإجازات والاستئذان'], ['sales', 'الإيرادات'], ['eval', 'التقييم الوظيفي'], ['ratings', 'تقييمات العملاء'], ['activity', 'الدخول والنشاط']]
const n0 = n => Math.round(Number(n) || 0).toLocaleString('en-US')
const hhmm = h => { const m = Math.max(0, Math.round((Number(h) || 0) * 60)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
const fmtDT = d => (d ? new Date(d).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }) : '—')
const riyadhDay = d => new Date(new Date(d).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10)
const riyadhHour = d => new Date(new Date(d).getTime() + 3 * 3600 * 1000).getUTCHours()
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.max(1, Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000) + 1)

// ── تحليل البيانات ────────────────────────────────────────────
function analyze(raw, user, from, to) {
  const { leaves = [], sales = [], evals = [], ratings = [], logins = [] } = raw
  // الإجازات
  const L = { total: leaves.length, approved: 0, rejected: 0, pending: 0, permReq: 0, permOk: 0, permHours: 0, leaveReq: 0, leaveOk: 0, leaveDays: 0, byType: {} }
  leaves.forEach(r => {
    L[r.status] = (L[r.status] || 0) + 1
    const cas = r.leave_type === 'casual'
    if (cas) { L.permReq++; if (r.status === 'approved') { L.permOk++; L.permHours += (Number(r.days_count) || 0) * 24 } }
    else { L.leaveReq++; if (r.status === 'approved') { L.leaveOk++; L.leaveDays += Number(r.days_count) || 0; L.byType[r.leave_type] = (L.byType[r.leave_type] || 0) + 1 } }
  })
  // الإيرادات
  const S = { n: sales.length, collected: 0, expected: 0, diff: 0, deficits: 0, surpluses: 0, confirmed: 0, byMonth: {} }
  sales.forEach(r => {
    const a = Number(r.total_actual) || 0, e = Number(r.total_expected) || 0, d = a - e
    S.collected += a; S.expected += e; S.diff += d
    if (d < 0) S.deficits++; else if (d > 0) S.surpluses++
    if (r.is_confirmed) S.confirmed++
    const m = String(r.sale_date).slice(0, 7); const b = (S.byMonth[m] ??= { n: 0, collected: 0, diff: 0 }); b.n++; b.collected += a; b.diff += d
  })
  // التقييم الوظيفي: نفس معادلة صفحة التقييم لكل شهر
  const fm = from.slice(0, 7), tm = to.slice(0, 7)
  const byMonth = {}
  evals.forEach(r => { const k = `${r.eval_year}-${String(r.eval_month).padStart(2, '0')}`; if (k >= fm && k <= tm) (byMonth[k] ??= []).push(r) })
  const E = Object.keys(byMonth).sort().reverse().map(k => ({ key: k, ...computeFinalScore(byMonth[k]), rows: byMonth[k] }))
  const rated = E.filter(x => x.final != null)
  const evalAvg = rated.length ? rated.reduce((a, x) => a + x.final, 0) / rated.length : null
  // تقييمات العملاء
  const R = { n: ratings.length, avg: ratings.length ? ratings.reduce((a, r) => a + r.rating, 0) / ratings.length : null, dist: [0, 0, 0, 0, 0], comments: ratings.filter(r => r.comment) }
  ratings.forEach(r => { if (r.rating >= 1 && r.rating <= 5) R.dist[r.rating - 1]++ })
  // الدخول: كل تحديث لـ last_login في سجل التدقيق = دخول
  const loginTimes = logins.map(r => r.created_at).sort().reverse()
  const loginDays = new Set(loginTimes.map(riyadhDay))
  const effFrom = user?.hire_date && user.hire_date > from ? user.hire_date : from
  const effTo = to > todayStr() ? todayStr() : to
  const periodDays = daysBetween(effFrom <= effTo ? effFrom : effTo, effTo)
  const hours = Array(24).fill(0); loginTimes.forEach(t => { hours[riyadhHour(t)]++ })
  const peak = hours.indexOf(Math.max(...hours))
  const A = { count: loginTimes.length, days: loginDays.size, periodDays, rate: periodDays ? Math.min(1, loginDays.size / periodDays) : 0, times: loginTimes, loginDays, hours, peak: loginTimes.length ? peak : null, effFrom, effTo }
  return { L, S, E, evalAvg, R, A }
}

// ── عناصر الواجهة ────────────────────────────────────────────
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }
function Ring({ pct, color, label, sub, size = 92 }) {
  const p = Math.max(0, Math.min(100, pct || 0))
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${color} ${p * 3.6}deg, #e5e7eb 0)`, display: 'grid', placeItems: 'center', margin: '0 auto' }}>
        <div style={{ width: size - 22, height: size - 22, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 800, fontSize: size > 80 ? '1.15rem' : '0.95rem', color: 'var(--text-1)' }} dir="ltr">{label}</div>
      </div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 700, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}
function Kpi({ title, value, sub, color = '#1C2B4A' }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${color}`, borderRadius: 12, padding: '11px 14px' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 700 }}>{title}</div>
      <div style={{ fontFamily: MONO, fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.25 }} dir="ltr">{value}</div>
      {sub != null && <div style={{ fontSize: '0.64rem', color: 'var(--text-3)', fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}
function SecCard({ title, hint, children }) {
  return (
    <section style={card}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 4, height: 18, background: '#EE712D', borderRadius: 2 }} />
        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{title}</span>
        {hint && <span style={{ marginInlineStart: 'auto', fontSize: '0.7rem', color: 'var(--text-3)' }}>{hint}</span>}
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </section>
  )
}
const Th = ({ children }) => <th style={{ padding: '8px 10px', background: '#1e3a5f', color: '#fff', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</th>
const Td = ({ children, l, b, c }) => <td style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', textAlign: l ? 'right' : 'center', fontSize: '0.78rem', fontWeight: b ? 800 : 500, color: c || 'var(--text-1)', fontFamily: l ? 'inherit' : MONO }}>{children}</td>
const Chip = ({ children, c = '#334155', bg = '#e2e8f0' }) => <span style={{ background: bg, color: c, borderRadius: 99, padding: '2px 11px', fontSize: '0.7rem', fontWeight: 800 }}>{children}</span>
const Bar = ({ pct, color = '#1C2B4A' }) => <div style={{ flex: 1, height: 9, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 99 }} /></div>

export default function EmployeeFilePage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { isGeneralAdmin, isAdmin, profile } = useAuth()
  const [users, setUsers] = useState([])
  const [stations, setStations] = useState([])
  const [stationF, setStationF] = useState('')
  const [empId, setEmpId] = useState('')
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(todayStr())
  const [sel, setSel] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('empfile_sections') ?? '[]')) } catch { return new Set() } })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { try { localStorage.setItem('empfile_sections', JSON.stringify([...sel])) } catch { /* بدون تخزين */ } }, [sel])
  useEffect(() => {
    supabase.from('users').select('id, full_name_ar, job_number, job_title, station_id, is_active').order('full_name_ar').then(({ data: d }) => setUsers(d ?? []))
    supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar').then(({ data: d }) => setStations(d ?? []))
  }, [])

  const showAll = sel.size === 0
  const show = id => showAll || sel.has(id)
  const toggleSec = id => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n.size === SECTIONS.length ? new Set() : n })

  const empOptions = useMemo(() => users.filter(u => !stationF || u.station_id === stationF)
    .map(u => ({ value: u.id, label: `${u.full_name_ar}${u.job_number ? ' — ' + u.job_number : ''}${u.is_active === false ? ' (معطّل)' : ''}` })), [users, stationF])

  async function load() {
    if (!empId) return
    setLoading(true); setErr(''); setData(null)
    try {
      const fT = `${from}T00:00:00+03:00`, tT = `${to}T23:59:59.999+03:00`
      const [u, sens, leaves, sales, evals, ratings, logins] = await Promise.all([
        supabase.from('users').select('*, station:station_id(name_ar, name_en), supervisor:supervisor_id(full_name_ar)').eq('id', empId).maybeSingle(),
        supabase.rpc('get_user_sensitive', { p_id: empId }),
        supabase.from('leaves').select('id, leave_type, status, start_date, end_date, days_count, notes, created_at').eq('employee_id', empId).gte('start_date', from).lte('start_date', to).order('start_date', { ascending: false }),
        supabase.from('sales_records').select('id, sale_date, shift, total_actual, total_expected, is_confirmed, station:station_id(name_ar, name_en)').eq('created_by', empId).gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }).limit(3000),
        supabase.from('employee_evaluations').select('eval_month, eval_year, eval_source, total_score, notes, evaluator:evaluator_id(full_name_ar)').eq('employee_id', empId),
        supabase.from('customer_ratings').select('rating, comment, created_at, shift, window_number, station:station_id(name_ar, name_en)').eq('employee_id', empId).gte('created_at', fT).lte('created_at', tT).order('created_at', { ascending: false }).limit(3000),
        supabase.from('audit_log').select('created_at, before_data, after_data').eq('table_name', 'users').eq('record_id', empId).eq('action', 'UPDATE').gte('created_at', fT).lte('created_at', tT).order('created_at', { ascending: false }).limit(5000),
      ])
      if (u.error || !u.data) throw new Error(u.error?.message || 'تعذّر تحميل بيانات الموظف')
      let title = null
      if (u.data.custom_title_id) { const { data: t } = await supabase.from('custom_titles').select('name_ar').eq('id', u.data.custom_title_id).maybeSingle(); title = t?.name_ar ?? null }
      // الدخول = تحديث last_login (يُسجَّل بسجل التدقيق عند كل دخول)
      const loginRows = (logins.data ?? []).filter(r => !r.before_data || !r.after_data || r.after_data.last_login !== r.before_data.last_login)
      setData({ user: u.data, sens: Array.isArray(sens.data) ? sens.data[0] : null, title, loginsOk: !logins.error, raw: { leaves: leaves.data ?? [], sales: sales.data ?? [], evals: evals.data ?? [], ratings: ratings.data ?? [], logins: loginRows } })
    } catch (e) { setErr(e.message || String(e)) }
    setLoading(false)
  }
  useEffect(() => { load() }, [empId, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const an = useMemo(() => (data ? analyze(data.raw, data.user, from, to) : null), [data, from, to])

  if (!(isGeneralAdmin || isAdmin)) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'هذا القسم للأدمن فقط' : 'Admin only'}</div>

  const u = data?.user
  const stName = u ? (isAr ? (u.station?.name_ar || u.station?.name_en) : (u.station?.name_en || u.station?.name_ar)) : ''
  const roleName = u ? (USER_ROLES.find(r => r.value === u.role)?.ar ?? u.role) : ''
  const modNames = u ? (u.allowed_modules ?? []).map(m => MODULES.find(x => x.value === m)?.ar ?? m) : []
  const PRESETS = [
    [isAr ? 'هذا العام' : 'This year', `${new Date().getFullYear()}-01-01`, todayStr()],
    [isAr ? 'آخر 30 يوماً' : 'Last 30 days', toLocalDateStr(new Date(Date.now() - 29 * 86400000)), todayStr()],
    [isAr ? 'آخر 90 يوماً' : 'Last 90 days', toLocalDateStr(new Date(Date.now() - 89 * 86400000)), todayStr()],
    [isAr ? 'العام الماضي' : 'Last year', `${new Date().getFullYear() - 1}-01-01`, `${new Date().getFullYear() - 1}-12-31`],
    [isAr ? 'كل الفترات' : 'All time', '2020-01-01', todayStr()],
  ]
  const infoFields = u ? [
    ['الاسم بالعربي', u.full_name_ar], ['الاسم بالإنجليزي', u.full_name_en], ['الرقم الوظيفي', u.job_number], ['اسم المستخدم', u.username],
    ['المسمى الوظيفي', u.job_title], ['المسمى المخصص', data.title], ['نوع الحساب', roleName], ['المحطة', stName],
    ['المشرف المباشر', u.supervisor?.full_name_ar], ['تاريخ المباشرة', u.hire_date], ['سنوات الخدمة', u.hire_date ? `${yearsOfService(u.hire_date)} سنة` : null], ['الجوال', data.sens?.phone],
    ['رقم الهوية', data.sens?.national_id], ['البريد الإلكتروني', data.sens?.email], ['حالة الحساب', u.is_active === false ? 'معطّل' : 'نشط'], ['تاريخ إنشاء الحساب', fmtDT(u.created_at)],
    ['آخر دخول للبرنامج', fmtDT(u.last_login)], ['تغيير كلمة المرور', u.password_changed ? 'تم' : 'لم يغيّرها بعد'], ['تقييم العملاء', u.can_rate_customers ? 'مفعّل' : 'غير مفعّل'], ['صفة خاصة', [u.is_accountant && 'محاسب', u.is_agent && 'وكيل'].filter(Boolean).join(' · ') || null],
  ] : []

  function printFile() {
    if (!u || !an) return
    const grade = s10 => (s10 >= 9 ? 'ممتاز' : s10 >= 8 ? 'جيد جداً' : s10 >= 7 ? 'جيد' : s10 >= 6 ? 'مقبول' : 'يحتاج تحسين')
    const ev10 = an.evalAvg != null ? an.evalAvg / 10 : null
    const ratedMonths = an.E.filter(x => x.final != null).length
    const ref = `NWB-EF-${u.job_number || String(u.id).slice(0, 6)}-${todayStr().replace(/-/g, '')}`
    const issuer = profile?.full_name_ar || ''
    const sgn = v => `${v > 0 ? '+' : ''}${n0(v)}`
    // رسم أعمدة SVG بسيط (قيم + تسميات) — يطبع بوضوح ويعمل على الجوال
    const barsSvg = (items, color, fmt = n0) => {
      if (!items.length) return ''
      const W = 640, rowH = 20, H = items.length * rowH + 4, mx = Math.max(...items.map(i => i.v), 1), lw = 62, vw = 74
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;direction:ltr">${items.map((it, i) => {
        const y = i * rowH + 2, bw = Math.max(2, (W - lw - vw) * (it.v / mx))
        return `<text x="${lw - 6}" y="${y + 13}" text-anchor="end" font-size="10" fill="#475569" font-family="monospace">${esc(it.k)}</text><rect x="${lw}" y="${y + 3}" width="${W - lw - vw}" height="11" rx="5.5" fill="#e8edf3"/><rect x="${lw}" y="${y + 3}" width="${bw}" height="11" rx="5.5" fill="${it.c || color}"/><text x="${lw + (W - lw - vw) + 6}" y="${y + 13}" font-size="10.5" font-weight="700" fill="#0f172a" font-family="monospace">${esc(fmt(it.v))}</text>`
      }).join('')}</svg>`
    }
    // ملخص تنفيذي: ملاحظات تُستنتج من الأرقام (إيجابية / تستحق الانتباه)
    const good = [], watch = []
    if (show('eval') && ev10 != null) (ev10 >= 8 ? good : ev10 < 7 ? watch : []).push(`التقييم الوظيفي ${ev10.toFixed(1)} من 10 (${grade(ev10)}) خلال ${ratedMonths} شهر مقيَّم`)
    if (show('ratings') && an.R.avg != null) (an.R.avg >= 4.3 ? good : an.R.avg < 3.5 ? watch : []).push(`متوسط تقييم العملاء ${an.R.avg.toFixed(2)} من 5 من ${an.R.n} تقييماً`)
    if (show('sales') && an.S.n) {
      if (an.S.deficits === 0) good.push(`لا توجد حالات عجز في ${an.S.n} قيداً إيرادياً`)
      else watch.push(`${an.S.deficits} حالة عجز من أصل ${an.S.n} قيداً، بصافي فرق ${sgn(an.S.diff)} ر.س`)
    }
    if (show('leaves')) {
      if (an.L.rejected) watch.push(`${an.L.rejected} طلب مرفوض من أصل ${an.L.total} طلباً`)
      if (an.L.total && !an.L.rejected) good.push(`جميع الطلبات (${an.L.total}) ضمن الضوابط دون رفض`)
    }
    if (show('activity')) (an.A.rate >= 0.5 ? good : an.A.rate < 0.2 ? watch : []).push(`نسبة الدخول للبرنامج ${Math.round(an.A.rate * 100)}% (${an.A.days} يوم دخول من ${an.A.periodDays})`)
    const list = (arr, c) => arr.map(t => `<li style="--c:${c}">${esc(t)}</li>`).join('')
    const P = []
    // 1) بطاقة الموظف
    P.push(`<div class="sec"><div class="person"><div class="av">${esc(String(u.full_name_ar || '?').trim().charAt(0))}</div><div style="flex:1"><b>${esc(u.full_name_ar)}</b><span>${esc([u.job_title, data.title, stName].filter(Boolean).join(' · '))}</span><span>الرقم الوظيفي: ${esc(u.job_number || '—')} · ${esc(roleName)} · ${u.is_active === false ? 'معطّل' : 'نشط'}${u.hire_date ? ` · مباشرة منذ ${esc(u.hire_date)}` : ''}</span></div>${ev10 != null && show('eval') ? `<div class="score"><b>${ev10.toFixed(1)}</b><small>${esc(grade(ev10))}</small></div>` : ''}</div></div>`)
    // 2) الملخص التنفيذي
    if (good.length || watch.length) P.push(`<div class="sec"><h3>الملخص التنفيذي</h3><div class="grid g2" style="align-items:start"><div class="ins ok"><h4>نقاط القوة</h4><ul>${list(good, '#16a34a') || '<li class="none">—</li>'}</ul></div><div class="ins no"><h4>نقاط تستحق المتابعة</h4><ul>${list(watch, '#d97706') || '<li class="none">لا توجد</li>'}</ul></div></div></div>`)
    // 3) المؤشرات
    const kpis = []
    if (show('leaves')) kpis.push(['إجازات مقبولة', `${an.L.leaveOk}`, `${Number(an.L.leaveDays.toFixed(2))} يوم`, '#0f766e'], ['استئذان مقبول', hhmm(an.L.permHours), `${an.L.permOk} مرة`, '#7c3aed'])
    if (show('sales')) kpis.push(['قيود الإيرادات', n0(an.S.n), `${n0(an.S.collected)} ر.س`, '#15803d'], ['صافي الفرق', sgn(an.S.diff), `${an.S.deficits} عجز · ${an.S.surpluses} زيادة`, an.S.diff < 0 ? '#dc2626' : '#1d4ed8'])
    if (show('eval')) kpis.push(['التقييم الوظيفي', ev10 != null ? `${ev10.toFixed(1)} / 10` : '—', `${ratedMonths} شهر مقيَّم`, '#1C2B4A'])
    if (show('ratings')) kpis.push(['تقييم العملاء', an.R.avg != null ? `${an.R.avg.toFixed(2)} / 5` : '—', `${an.R.n} تقييم`, '#EE712D'])
    if (show('activity')) kpis.push(['نسبة الدخول', `${Math.round(an.A.rate * 100)}%`, `${an.A.days} من ${an.A.periodDays} يوماً`, '#0369a1'])
    if (kpis.length) P.push(`<div class="sec"><h3>مؤشرات الأداء للفترة</h3><div class="grid g${Math.min(5, Math.max(2, kpis.length))}">${kpis.map(([t, v, s, c]) => `<div class="kpi" style="--c:${c}"><small>${esc(t)}</small><b>${esc(v)}</b><em>${esc(s)}</em></div>`).join('')}</div></div>`)
    // 4) البيانات الكاملة
    P.push(`<div class="sec"><h3>بيانات الموظف</h3><div class="grid g4">${infoFields.filter(([, v]) => v).map(([k, v]) => `<div class="cell"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>${modNames.length ? `<div class="muted" style="margin-top:6px">الأقسام المسموحة: ${esc(modNames.join('، '))}</div>` : ''}</div>`)
    // 5) الإجازات
    if (show('leaves')) {
      P.push(`<div class="sec"><h3>الإجازات والاستئذان</h3><table class="t"><thead><tr><th rowspan="2">الفترة</th><th colspan="3" style="background:#5b21b6">الاستئذان</th><th colspan="3" style="background:#0f766e">الإجازات</th><th rowspan="2">مرفوضة</th><th rowspan="2">الإجمالي</th></tr><tr><th style="background:#7c3aed">مقدَّمة</th><th style="background:#7c3aed">مقبولة</th><th style="background:#7c3aed">المدة</th><th style="background:#14958a">مقدَّمة</th><th style="background:#14958a">مقبولة</th><th style="background:#14958a">الأيام</th></tr></thead><tbody><tr><td class="l"><b>${esc(from)} ← ${esc(to)}</b></td><td>${an.L.permReq}</td><td>${an.L.permOk}</td><td>${an.L.permHours ? hhmm(an.L.permHours) : '—'}</td><td>${an.L.leaveReq}</td><td>${an.L.leaveOk}</td><td>${an.L.leaveDays ? Number(an.L.leaveDays.toFixed(2)) : '—'}</td><td>${an.L.rejected}</td><td><b>${an.L.total}</b></td></tr></tbody></table>
      ${data.raw.leaves.length ? `<table class="t" style="margin-top:8px"><thead><tr><th>#</th><th>النوع</th><th>من</th><th>إلى</th><th>المدة</th><th>الحالة</th></tr></thead><tbody>${data.raw.leaves.slice(0, 40).map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(LEAVE_AR[r.leave_type] ?? r.leave_type)}</td><td>${esc(r.start_date)}</td><td>${r.leave_type === 'casual' ? '—' : esc(r.end_date)}</td><td>${r.leave_type === 'casual' ? hhmm((Number(r.days_count) || 0) * 24) : (Number(r.days_count) || 0) + ' يوم'}</td><td><span class="chip" style="background:${STATUS_COL[r.status]?.[1]};color:${STATUS_COL[r.status]?.[0]}">${STATUS_AR[r.status] ?? r.status}</span></td></tr>`).join('')}</tbody></table>${data.raw.leaves.length > 40 ? `<p class="muted">يعرض آخر 40 طلباً من ${data.raw.leaves.length}.</p>` : ''}` : '<p class="muted">لا توجد طلبات ضمن الفترة.</p>'}</div>`)
    }
    // 6) الإيرادات
    if (show('sales')) {
      const months = Object.keys(an.S.byMonth).sort()
      P.push(`<div class="sec"><h3>الإيرادات</h3>${an.S.n ? `<div class="grid g4"><div class="cell"><small>القيود المُدخلة</small><b>${n0(an.S.n)}</b></div><div class="cell"><small>إجمالي المحصَّل</small><b>${n0(an.S.collected)} ر.س</b></div><div class="cell"><small>إجمالي المبيعات</small><b>${n0(an.S.expected)} ر.س</b></div><div class="cell"><small>صافي الفرق</small><b style="color:${an.S.diff < 0 ? '#b91c1c' : '#0f172a'}">${sgn(an.S.diff)} ر.س</b></div></div>
      <div style="margin-top:8px">${barsSvg(months.map(m => ({ k: m, v: an.S.byMonth[m].collected })), '#15803d')}</div>
      <table class="t" style="margin-top:6px"><thead><tr><th>الشهر</th><th>القيود</th><th>المحصَّل</th><th>الفرق</th></tr></thead><tbody>${months.slice().reverse().map(m => `<tr><td class="l">${m}</td><td>${an.S.byMonth[m].n}</td><td>${n0(an.S.byMonth[m].collected)}</td><td style="color:${an.S.byMonth[m].diff < 0 ? '#b91c1c' : '#0f172a'}">${sgn(an.S.byMonth[m].diff)}</td></tr>`).join('')}<tr class="tot"><td class="l">الإجمالي</td><td>${an.S.n}</td><td>${n0(an.S.collected)}</td><td>${sgn(an.S.diff)}</td></tr></tbody></table>` : '<p class="muted">لا توجد إيرادات ضمن الفترة.</p>'}</div>`)
    }
    // 7) التقييم الوظيفي
    if (show('eval')) {
      P.push(`<div class="sec"><h3>التقييم الوظيفي</h3>${an.E.length ? `${barsSvg(an.E.slice().reverse().filter(x => x.final != null).map(x => ({ k: x.key, v: x.final / 10, c: x.final >= 85 ? '#15803d' : x.final >= 60 ? '#1C2B4A' : '#d97706' })), '#1C2B4A', v => v.toFixed(1))}<table class="t" style="margin-top:6px"><thead><tr><th>الشهر</th><th>النتيجة /10</th><th>التقدير</th><th>المصادر</th></tr></thead><tbody>${an.E.map(x => `<tr><td class="l">${x.key}</td><td><b>${x.final != null ? (x.final / 10).toFixed(1) : '—'}</b></td><td>${x.final != null ? grade(x.final / 10) : '—'}</td><td class="l">${x.rows.map(r => `${esc(SRC_AR[r.eval_source] ?? r.eval_source)}: ${(r.total_score / 10).toFixed(1)}`).join(' · ')}</td></tr>`).join('')}</tbody></table>${ev10 != null ? `<p class="muted">متوسط الفترة: <b>${ev10.toFixed(1)} / 10</b> — ${esc(grade(ev10))}</p>` : ''}` : '<p class="muted">لا توجد تقييمات ضمن الفترة.</p>'}</div>`)
    }
    // 8) تقييمات العملاء
    if (show('ratings')) {
      P.push(`<div class="sec"><h3>تقييمات العملاء</h3>${an.R.n ? `<div class="grid g3" style="align-items:center"><div class="cell"><small>متوسط التقييم</small><b>${an.R.avg.toFixed(2)} / 5</b></div><div class="cell"><small>عدد التقييمات</small><b>${an.R.n}</b></div><div class="cell"><small>تقييمات 4 نجوم فأكثر</small><b>${Math.round(((an.R.dist[3] + an.R.dist[4]) / an.R.n) * 100)}%</b></div></div><div style="margin-top:8px">${barsSvg([5, 4, 3, 2, 1].map(s => ({ k: `${s} نجوم`, v: an.R.dist[s - 1], c: s >= 4 ? '#16a34a' : s === 3 ? '#d97706' : '#dc2626' })), '#16a34a', v => String(v))}</div>
      ${an.R.comments.length ? `<table class="t" style="margin-top:6px"><thead><tr><th>التاريخ</th><th>التقييم</th><th>التعليق</th></tr></thead><tbody>${an.R.comments.slice(0, 15).map(r => `<tr><td>${esc(riyadhDay(r.created_at))}</td><td>${r.rating}/5</td><td class="l">${esc(r.comment)}</td></tr>`).join('')}</tbody></table>` : ''}` : '<p class="muted">لا توجد تقييمات عملاء ضمن الفترة.</p>'}</div>`)
    }
    // 9) الدخول والنشاط
    if (show('activity')) {
      const days = an.A.periodDays <= 140 ? Array.from({ length: an.A.periodDays }, (_, i) => addDays(an.A.effFrom, i)) : []
      const hrMax = Math.max(...an.A.hours, 1)
      P.push(`<div class="sec"><h3>الدخول والنشاط</h3><div class="grid g4"><div class="cell"><small>آخر دخول</small><b>${esc(fmtDT(u.last_login))}</b></div><div class="cell"><small>مرات الدخول في الفترة</small><b>${an.A.count}</b></div><div class="cell"><small>أيام الدخول</small><b>${an.A.days} من ${an.A.periodDays}</b></div><div class="cell"><small>نسبة الدخول</small><b>${Math.round(an.A.rate * 100)}%</b></div></div>
      ${days.length ? `<div class="muted" style="margin:8px 0 3px">أيام الدخول (الملوَّن = دخل في ذلك اليوم)</div><div class="strip">${days.map(d => `<i class="${an.A.loginDays.has(d) ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      ${an.A.count ? `<div class="muted" style="margin:8px 0 3px">توزيع الدخول على ساعات اليوم (بتوقيت الرياض) — الأكثر: ${an.A.peak != null ? String(an.A.peak).padStart(2, '0') + ':00' : '—'}</div><div class="hist">${an.A.hours.map((h, i) => `<span><i style="height:${Math.max(2, (h / hrMax) * 34)}px"></i><em>${i % 3 === 0 ? i : ''}</em></span>`).join('')}</div>
      <table class="t" style="margin-top:8px"><thead><tr><th>#</th><th>وقت الدخول</th><th>اليوم</th></tr></thead><tbody>${an.A.times.slice(0, 12).map((t, i) => `<tr><td>${i + 1}</td><td>${esc(fmtDT(t))}</td><td>${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(riyadhDay(t) + 'T00:00:00Z').getUTCDay()]}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${data.loginsOk ? 'لا توجد عمليات دخول مسجَّلة ضمن الفترة.' : 'سجل الدخول التفصيلي غير متاح؛ المتوفر آخر دخول فقط.'}</p>`}</div>`)
    }
    // 10) الاعتماد
    P.push(`<div class="sec"><div class="sig"><div><span>أعدّه</span><b>${esc(issuer) || '&nbsp;'}</b><i></i></div><div><span>المراجعة</span><b>&nbsp;</b><i></i></div><div><span>الاعتماد</span><b>&nbsp;</b><i></i></div></div><p class="muted" style="text-align:center;margin-top:8px">أُعدّ هذا التقرير آلياً من بيانات نظام NW Station وقت الإصدار، وهو وثيقة داخلية سرّية للاستخدام الإداري فقط.</p></div>`)
    const html = docShell({
      title: `ملف الموظف — ${u.full_name_ar}`,
      body: docHeader({ title: 'تقرير ملف الموظف', infoLines: [`الموظف: <b>${esc(u.full_name_ar)}</b>`, `الفترة: من <b>${esc(from)}</b> إلى <b>${esc(to)}</b>`, `الرقم المرجعي: <b>${esc(ref)}</b>`] }) + `<div class="body">${P.join('')}</div>`,
      footerLeft: `أُصدر: ${esc(fmtDT(new Date()))}${issuer ? ` · بواسطة ${esc(issuer)}` : ''}`, footerRight: 'سرّي — للأدمن فقط',
    })
    openDocWindow(html)
  }

  const inpCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'
  const pill = on => ({ padding: '7px 16px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${on ? '#1C2B4A' : 'var(--border)'}`, background: on ? '#1C2B4A' : 'var(--card)', color: on ? '#fff' : 'var(--text-2)' })

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ minHeight: 'calc(100vh - 58px)', background: 'var(--surface)', paddingBottom: 40 }}>
      {/* الترويسة */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-1)' }}>{isAr ? 'ملف الموظف' : 'Employee file'}</h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--text-3)' }}>{isAr ? 'معلومات كاملة وإجازات وإيرادات وتقييم ودخول — للأدمن فقط' : 'Full profile, leaves, revenue, evaluation, ratings and logins — admin only'}</p>
          </div>
          <button type="button" onClick={printFile} disabled={!an} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', fontFamily: 'inherit', opacity: an ? 1 : 0.4 }}>
            {isAr ? 'طباعة الملف / PDF' : 'Print / PDF'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* الفلاتر */}
        <div style={{ ...card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 190 }}>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'المحطة' : 'Station'}</label>
              <SearchSelect isAr={isAr} value={stationF} onChange={v => { setStationF(v); setEmpId('') }} className={inpCls + ' w-full'}
                options={[{ value: '', label: isAr ? 'كل المحطات' : 'All stations' }, ...stations.map(s => ({ value: s.id, label: isAr ? s.name_ar : (s.name_en || s.name_ar) }))]} />
            </div>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'الموظف' : 'Employee'}</label>
              <SearchSelect isAr={isAr} value={empId} onChange={setEmpId} className={inpCls + ' w-full'} placeholder={isAr ? 'اختر الموظف…' : 'Pick an employee…'} options={empOptions} />
            </div>
            <div><label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'من' : 'From'}</label>
              <DatePicker value={from} onChange={v => { setFrom(v); if (v > to) setTo(v) }} isAr={isAr} className={inpCls + ' w-40'} /></div>
            <div><label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>{isAr ? 'إلى' : 'To'}</label>
              <DatePicker value={to} onChange={v => { setTo(v); if (v < from) setFrom(v) }} isAr={isAr} className={inpCls + ' w-40'} /></div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(([l, a, b]) => <button key={l} type="button" onClick={() => { setFrom(a); setTo(b) }} style={pill(from === a && to === b)}>{l}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginInlineEnd: 4 }}>{isAr ? 'الأقسام المعروضة والمطبوعة:' : 'Sections:'}</span>
            <button type="button" onClick={() => setSel(new Set())} style={pill(showAll)}>{isAr ? 'الكل' : 'All'}</button>
            {SECTIONS.map(([id, l]) => <button key={id} type="button" onClick={() => toggleSec(id)} style={pill(!showAll && sel.has(id))}>{l}</button>)}
          </div>
        </div>

        {!empId && <div style={{ ...card, padding: '50px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.9rem' }}>{isAr ? 'اختر موظفاً لعرض ملفه الكامل' : 'Pick an employee to view the file'}</div>}
        {empId && loading && <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>}
        {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>{err}</div>}

        {u && an && !loading && (
          <>
            {/* بطاقة الموظف */}
            <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg,#1C2B4A,#264673 70%,#34588f)', color: '#fff', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <span style={{ width: 66, height: 66, borderRadius: '50%', background: '#EE712D', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '1.7rem', flexShrink: 0 }}>{String(u.full_name_ar || '?').trim().charAt(0)}</span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 900, fontSize: '1.3rem' }}>{u.full_name_ar}</div>
                <div style={{ opacity: 0.85, fontSize: '0.82rem', marginTop: 3 }}>{[u.job_title, data.title].filter(Boolean).join(' · ') || roleName}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {[stName, u.job_number && `#${u.job_number}`, roleName, u.hire_date && `${yearsOfService(u.hire_date)} سنة خدمة`].filter(Boolean).map(t => <span key={t} style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 99, padding: '3px 12px', fontSize: '0.74rem', fontWeight: 700 }}>{t}</span>)}
                  <span style={{ background: u.is_active === false ? '#dc2626' : '#16a34a', borderRadius: 99, padding: '3px 12px', fontSize: '0.74rem', fontWeight: 800 }}>{u.is_active === false ? 'معطّل' : 'نشط'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 22 }}>
                {show('eval') && <Ring pct={(an.evalAvg ?? 0)} color="#EE712D" label={an.evalAvg != null ? (an.evalAvg / 10).toFixed(1) : '—'} sub={isAr ? 'التقييم /10' : 'Eval /10'} size={84} />}
                {show('activity') && <Ring pct={an.A.rate * 100} color="#38bdf8" label={`${Math.round(an.A.rate * 100)}%`} sub={isAr ? 'نسبة الدخول' : 'Login rate'} size={84} />}
              </div>
            </div>

            {/* مؤشرات */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {show('leaves') && <><Kpi title={isAr ? 'إجازات مقبولة' : 'Leaves'} value={`${an.L.leaveOk}`} sub={`${Number(an.L.leaveDays.toFixed(2))} ${isAr ? 'يوم' : 'days'}`} color="#0f766e" />
                <Kpi title={isAr ? 'استئذان مقبول' : 'Permissions'} value={hhmm(an.L.permHours)} sub={`${an.L.permOk} ${isAr ? 'مرة' : 'times'}`} color="#7c3aed" /></>}
              {show('sales') && <><Kpi title={isAr ? 'إيرادات مُدخلة' : 'Entries'} value={n0(an.S.n)} sub={`${n0(an.S.collected)} ${isAr ? 'ر.س' : 'SAR'}`} color="#15803d" />
                <Kpi title={isAr ? 'صافي الفرق' : 'Net diff'} value={`${an.S.diff > 0 ? '+' : ''}${n0(an.S.diff)}`} sub={`${an.S.deficits} ${isAr ? 'عجز' : 'deficits'}`} color={an.S.diff < 0 ? '#dc2626' : '#1d4ed8'} /></>}
              {show('eval') && <Kpi title={isAr ? 'التقييم الوظيفي' : 'Evaluation'} value={an.evalAvg != null ? (an.evalAvg / 10).toFixed(1) : '—'} sub={`${an.E.filter(x => x.final != null).length} ${isAr ? 'شهر مقيَّم' : 'months'}`} color="#1C2B4A" />}
              {show('ratings') && <Kpi title={isAr ? 'تقييم العملاء' : 'Customer rating'} value={an.R.avg != null ? an.R.avg.toFixed(2) : '—'} sub={`${an.R.n} ${isAr ? 'تقييم' : 'ratings'}`} color="#EE712D" />}
              {show('activity') && <Kpi title={isAr ? 'أيام الدخول' : 'Login days'} value={`${an.A.days}/${an.A.periodDays}`} sub={`${an.A.count} ${isAr ? 'دخول' : 'logins'}`} color="#0369a1" />}
            </div>

            {/* معلومات كاملة */}
            <SecCard title={isAr ? 'المعلومات الكاملة' : 'Full information'}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                {infoFields.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', background: 'var(--surface)' }}>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-3)', fontWeight: 700 }}>{k}</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)', wordBreak: 'break-word' }}>{v}</div>
                  </div>
                ))}
              </div>
              {modNames.length > 0 && <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'الأقسام المسموحة:' : 'Modules:'}</span>{modNames.map(m => <Chip key={m}>{m}</Chip>)}</div>}
            </SecCard>

            {/* الإجازات */}
            {show('leaves') && (
              <SecCard title={isAr ? 'الإجازات والاستئذان' : 'Leaves & permissions'} hint={`${from} ← ${to}`}>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead><tr><Th>{isAr ? 'استئذان مقدَّم' : 'Perm. req'}</Th><Th>{isAr ? 'استئذان مقبول' : 'Perm. OK'}</Th><Th>{isAr ? 'مدة الاستئذان' : 'Perm. time'}</Th><Th>{isAr ? 'إجازات مقدَّمة' : 'Leave req'}</Th><Th>{isAr ? 'إجازات مقبولة' : 'Leave OK'}</Th><Th>{isAr ? 'الأيام' : 'Days'}</Th><Th>{isAr ? 'مرفوضة' : 'Rejected'}</Th><Th>{isAr ? 'الإجمالي' : 'Total'}</Th></tr></thead>
                    <tbody><tr><Td>{an.L.permReq}</Td><Td b>{an.L.permOk}</Td><Td>{an.L.permHours ? hhmm(an.L.permHours) : '—'}</Td><Td>{an.L.leaveReq}</Td><Td b>{an.L.leaveOk}</Td><Td>{an.L.leaveDays ? Number(an.L.leaveDays.toFixed(2)) : '—'}</Td><Td c={an.L.rejected ? '#dc2626' : undefined}>{an.L.rejected}</Td><Td b>{an.L.total}</Td></tr></tbody>
                  </table>
                </div>
                {data.raw.leaves.length > 0 ? (
                  <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {data.raw.leaves.slice(0, 40).map((r, i) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                        <Chip>{LEAVE_AR[r.leave_type] ?? r.leave_type}</Chip>
                        <span style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 700 }}>{r.start_date}{r.leave_type !== 'casual' && r.end_date !== r.start_date ? ` ← ${r.end_date}` : ''}</span>
                        <span style={{ fontFamily: MONO, fontSize: '0.8rem', color: 'var(--text-2)' }}>{r.leave_type === 'casual' ? hhmm((Number(r.days_count) || 0) * 24) : `${Number(r.days_count) || 0} ${isAr ? 'يوم' : 'd'}`}</span>
                        <span style={{ flex: 1 }} />
                        <Chip c={STATUS_COL[r.status]?.[0]} bg={STATUS_COL[r.status]?.[1]}>{STATUS_AR[r.status] ?? r.status}</Chip>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: '12px 0 0' }}>{isAr ? 'لا توجد طلبات ضمن الفترة' : 'No requests in the period'}</p>}
              </SecCard>
            )}

            {/* الإيرادات */}
            {show('sales') && (
              <SecCard title={isAr ? 'الإيرادات' : 'Revenue'} hint={`${from} ← ${to}`}>
                {an.S.n === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: 0 }}>{isAr ? 'لا توجد إيرادات مُدخلة ضمن الفترة' : 'No entries in the period'}</p> : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                      <Kpi title={isAr ? 'إجمالي المحصَّل' : 'Collected'} value={n0(an.S.collected)} sub={isAr ? 'ر.س' : 'SAR'} color="#15803d" />
                      <Kpi title={isAr ? 'إجمالي المبيعات' : 'Sales'} value={n0(an.S.expected)} sub={isAr ? 'ر.س' : 'SAR'} />
                      <Kpi title={isAr ? 'صافي الفرق' : 'Net diff'} value={`${an.S.diff > 0 ? '+' : ''}${n0(an.S.diff)}`} sub={`${an.S.deficits} ${isAr ? 'عجز' : 'def.'} · ${an.S.surpluses} ${isAr ? 'زيادة' : 'surp.'}`} color={an.S.diff < 0 ? '#dc2626' : '#1d4ed8'} />
                      <Kpi title={isAr ? 'المؤكَّد' : 'Confirmed'} value={`${an.S.confirmed}/${an.S.n}`} color="#7c3aed" />
                    </div>
                    {(() => {
                      const months = Object.keys(an.S.byMonth).sort().reverse(), mx = Math.max(...months.map(m => an.S.byMonth[m].collected), 1)
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {months.map(m => (
                            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ width: 66, fontFamily: MONO, fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-2)' }}>{m}</span>
                              <Bar pct={(an.S.byMonth[m].collected / mx) * 100} color="#15803d" />
                              <span style={{ width: 84, textAlign: 'left', fontFamily: MONO, fontSize: '0.76rem', fontWeight: 800 }} dir="ltr">{n0(an.S.byMonth[m].collected)}</span>
                              <span style={{ width: 62, textAlign: 'left', fontFamily: MONO, fontSize: '0.72rem', fontWeight: 700, color: an.S.byMonth[m].diff < 0 ? '#dc2626' : '#1d4ed8' }} dir="ltr">{an.S.byMonth[m].diff > 0 ? '+' : ''}{n0(an.S.byMonth[m].diff)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </>
                )}
              </SecCard>
            )}

            {/* التقييم الوظيفي */}
            {show('eval') && (
              <SecCard title={isAr ? 'التقييم الوظيفي' : 'Job evaluation'} hint={an.evalAvg != null ? `${isAr ? 'المتوسط' : 'Avg'} ${(an.evalAvg / 10).toFixed(1)} / 10` : ''}>
                {an.E.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: 0 }}>{isAr ? 'لا توجد تقييمات ضمن الفترة' : 'No evaluations in the period'}</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {an.E.map(x => (
                      <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', background: 'var(--surface)' }}>
                        <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.84rem', width: 66 }}>{x.key}</span>
                        <Bar pct={x.final ?? 0} color={x.final >= 85 ? '#15803d' : x.final >= 60 ? '#1C2B4A' : '#d97706'} />
                        <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1rem', width: 56, textAlign: 'left' }} dir="ltr">{x.final != null ? (x.final / 10).toFixed(1) : '—'}</span>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{x.rows.map(r => <Chip key={r.eval_source}>{SRC_AR[r.eval_source] ?? r.eval_source} {(r.total_score / 10).toFixed(1)}</Chip>)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SecCard>
            )}

            {/* تقييمات العملاء */}
            {show('ratings') && (
              <SecCard title={isAr ? 'تقييمات العملاء' : 'Customer ratings'} hint={`${an.R.n} ${isAr ? 'تقييم' : 'ratings'}`}>
                {an.R.n === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', margin: 0 }}>{isAr ? 'لا توجد تقييمات عملاء ضمن الفترة' : 'No ratings in the period'}</p> : (
                  <>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Ring pct={(an.R.avg / 5) * 100} color="#EE712D" label={an.R.avg.toFixed(2)} sub={isAr ? 'من 5' : 'of 5'} />
                      <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[5, 4, 3, 2, 1].map(s => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 52, fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-2)' }}>{s} {isAr ? 'نجوم' : '★'}</span>
                            <Bar pct={(an.R.dist[s - 1] / Math.max(...an.R.dist, 1)) * 100} color={s >= 4 ? '#16a34a' : s === 3 ? '#d97706' : '#dc2626'} />
                            <span style={{ width: 38, textAlign: 'left', fontFamily: MONO, fontWeight: 800, fontSize: '0.78rem' }}>{an.R.dist[s - 1]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {an.R.comments.length > 0 && (
                      <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        {an.R.comments.slice(0, 12).map((r, i) => (
                          <div key={i} style={{ padding: '9px 14px', borderTop: i ? '1px solid var(--border)' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <Chip c={r.rating >= 4 ? '#15803d' : r.rating === 3 ? '#b45309' : '#b91c1c'} bg={r.rating >= 4 ? '#dcfce7' : r.rating === 3 ? '#fef3c7' : '#fee2e2'}>{r.rating}/5</Chip>
                            <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-1)', lineHeight: 1.6 }}>{r.comment}</div>
                            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)' }}>{riyadhDay(r.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </SecCard>
            )}

            {/* الدخول والنشاط */}
            {show('activity') && (
              <SecCard title={isAr ? 'الدخول والنشاط' : 'Logins & activity'} hint={`${an.A.effFrom} ← ${an.A.effTo}`}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                  <Ring pct={an.A.rate * 100} color="#0369a1" label={`${Math.round(an.A.rate * 100)}%`} sub={isAr ? 'نسبة أيام الدخول' : 'Login-day rate'} />
                  <div style={{ flex: 1, minWidth: 240, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <Kpi title={isAr ? 'آخر دخول' : 'Last login'} value={u.last_login ? riyadhDay(u.last_login) : '—'} sub={u.last_login ? new Date(new Date(u.last_login).getTime() + 3 * 3600000).toISOString().slice(11, 16) : null} color="#0369a1" />
                    <Kpi title={isAr ? 'مرات الدخول' : 'Logins'} value={n0(an.A.count)} sub={isAr ? 'في الفترة' : 'in period'} />
                    <Kpi title={isAr ? 'أيام الدخول' : 'Days'} value={`${an.A.days}/${an.A.periodDays}`} />
                    <Kpi title={isAr ? 'ساعة الدخول الأكثر' : 'Peak hour'} value={an.A.peak != null ? `${String(an.A.peak).padStart(2, '0')}:00` : '—'} color="#7c3aed" />
                  </div>
                </div>
                {!data.loginsOk && <p style={{ fontSize: '0.74rem', color: '#b45309', margin: '0 0 10px' }}>{isAr ? 'سجل الدخول التفصيلي غير متاح؛ يظهر آخر دخول فقط.' : 'Detailed login history unavailable; only the last login is shown.'}</p>}
                {an.A.periodDays <= 120 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 12 }}>
                    {Array.from({ length: an.A.periodDays }, (_, i) => addDays(an.A.effFrom, i)).map(d => (
                      <span key={d} title={d} style={{ width: 13, height: 13, borderRadius: 3, background: an.A.loginDays.has(d) ? '#0369a1' : 'var(--border)' }} />
                    ))}
                  </div>
                )}
                {an.A.times.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                    {an.A.times.slice(0, 40).map((t, i) => (
                      <div key={t + i} style={{ padding: '7px 14px', borderTop: i ? '1px solid var(--border)' : 'none', fontFamily: MONO, fontSize: '0.78rem', color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{fmtDT(t)}</span><span style={{ color: 'var(--text-3)' }}>{(isAr ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[new Date(riyadhDay(t) + 'T00:00:00Z').getUTCDay()]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SecCard>
            )}
          </>
        )}
      </div>
    </div>
  )
}

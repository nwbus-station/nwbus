import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { ADMIN_ROLE_VALUES } from '../../utils/constants'
import { riyadhDay } from '../../utils/dates'
import { docShell, docHeader, openDocWindow, esc } from '../../utils/printDoc'

const RATING_LABEL = { 1: 'سيئ جداً', 2: 'سيئ', 3: 'محايد', 4: 'جيد', 5: 'ممتاز' }
const RATING_COLOR = { 1: '#dc2626', 2: '#f97316', 3: '#eab308', 4: '#65a30d', 5: '#16a34a' }
const MAX_DAYS = 62

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const eachDay = (from, to) => { const out = []; for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d); return out }
const fmtDay = d => new Date(d + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeOf = iso => new Date(iso).toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
const avgOf = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const fmtAvg = a => (a == null ? '—' : a.toFixed(2))
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const distOf = list => [5, 4, 3, 2, 1].map(n => [n, list.filter(x => x === n).length])

// قراءة كل الصفوف على دفعات (حد الخادم 1000 صف بالطلب الواحد)
async function fetchAll(build) {
  const out = []
  for (let i = 0; i < 30; i++) {
    const { data, error } = await build().range(i * 1000, i * 1000 + 999)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}

// شريط توزيع نتائج الركاب (من 1 إلى 5)
function DistBar({ list, height = 10, legend = false }) {
  const d = distOf(list).reverse()   // 1..5
  const total = list.length
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2, #ebebed)' }} title={total ? '' : 'لا توجد نتائج مسجّلة'}>
        {total > 0 && d.map(([n, c]) => c > 0 && <i key={n} style={{ display: 'block', width: `${(c / total) * 100}%`, background: RATING_COLOR[n] }} title={`${RATING_LABEL[n]}: ${c}`} />)}
      </div>
      {legend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8 }}>
          {d.map(([n, c]) => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', color: 'var(--text-2)' }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: RATING_COLOR[n], display: 'inline-block' }} />
              {RATING_LABEL[n]} <b style={{ fontFamily: 'monospace', color: 'var(--text-1)' }}>{c}</b><span style={{ color: 'var(--text-3)' }}>({pct(c, total)}%)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 120, padding: '12px 14px', borderInlineStart: '1px solid var(--border-2, #e0e0e0)' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'ui-monospace, monospace', lineHeight: 1.1, color: tone || 'var(--text-1)' }}>{value}</div>
      <div style={{ fontSize: '.7rem', color: 'var(--text-3)', marginTop: 3 }}>{label}</div>
      {sub != null && <div style={{ fontSize: '.66rem', color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

// تقرير التقييم اليومي للركاب: من قيّم ومن أي محطة وبأي نتيجة، لأي يوم أو فترة، مع طباعة وتصدير
export default function DailySurveyReport({ need, target, selectedIds }) {
  const today = riyadhDay()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [data, setData] = useState(null)         // { users, progress: [], events: [], noEvents }
  const [err, setErr] = useState('')
  const [stationF, setStationF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [open, setOpen] = useState(() => new Set())

  const days = useMemo(() => eachDay(from, to), [from, to])
  const single = days.length === 1
  const presets = [
    ['اليوم', today, today],
    ['أمس', addDays(today, -1), addDays(today, -1)],
    ['آخر 7 أيام', addDays(today, -6), today],
    ['هذا الشهر', today.slice(0, 8) + '01', today],
    ['الشهر الماضي', (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1, 1); return d.toISOString().slice(0, 10) })(), (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10) })()],
  ]
  const setRange = (a, b) => { setFrom(a); setTo(b) }
  const onFrom = v => { if (!v) return; setFrom(v); if (v > to) setTo(v) }
  const onTo = v => { if (!v) return; setTo(v); if (v < from) setFrom(v) }

  useEffect(() => {
    let off = false
    setData(null); setErr('')
    ;(async () => {
      const [u, p, e] = await Promise.all([
        fetchAll(() => supabase.from('users').select('id, full_name_ar, job_number, station:station_id(id, name_ar, name_en)').eq('is_active', true).not('role', 'in', `(${ADMIN_ROLE_VALUES.join(',')})`).order('full_name_ar')),
        fetchAll(() => supabase.from('user_daily_survey').select('user_id, day, done').gte('day', from).lte('day', days[days.length - 1] ?? to).order('day')),
        fetchAll(() => supabase.from('user_survey_events').select('user_id, day, rating, created_at').gte('day', from).lte('day', days[days.length - 1] ?? to).order('created_at')),
      ])
      if (off) return
      if (p.error) { setErr('جدول المتابعة غير مُنشأ بعد. شغّل استعلام SQL الخاص بالتقييم اليومي.'); setData({ users: [], progress: [], events: [], noEvents: true }); return }
      const users = target === 'selected' ? u.data.filter(x => selectedIds.includes(x.id)) : u.data
      setData({ users, progress: p.data, events: e.error ? [] : e.data, noEvents: !!e.error })
    })()
    return () => { off = true }
  }, [from, to, target, selectedIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const N = days.length
  // صف لكل موظف: عدد التقييمات، الأيام المكتملة، نتائج الركاب، أوقات اليوم (لو يوم واحد)
  const base = useMemo(() => {
    if (!data) return []
    const byUserP = {}, byUserE = {}
    for (const p of data.progress) (byUserP[p.user_id] ||= []).push(p)
    for (const e of data.events) (byUserE[e.user_id] ||= []).push(e)
    return data.users.map(u => {
      const ps = byUserP[u.id] ?? [], evs = byUserE[u.id] ?? []
      const done = ps.reduce((a, p) => a + (p.done || 0), 0)
      const fullDays = ps.filter(p => p.done >= need).length
      const ratings = evs.map(e => e.rating).filter(r => r >= 1 && r <= 5)
      const st = fullDays >= N ? 'done' : done > 0 ? 'part' : 'none'
      return { u, done, fullDays, ratings, avg: avgOf(ratings), st, evs, station: u.station?.name_ar || u.station?.name_en || 'بدون محطة' }
    })
  }, [data, need, N])

  const stations = useMemo(() => [...new Set(base.map(r => r.station))].sort((a, b) => a.localeCompare(b, 'ar')), [base])
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return base.filter(r => (!stationF || r.station === stationF) && (!statusF || r.st === statusF)
      && (!term || (r.u.full_name_ar ?? '').toLowerCase().includes(term) || String(r.u.job_number ?? '').includes(term)))
  }, [base, stationF, statusF, q])

  const groups = useMemo(() => {
    const m = new Map()
    for (const r of rows) { if (!m.has(r.station)) m.set(r.station, []); m.get(r.station).push(r) }
    const arr = [...m.entries()].map(([name, list]) => {
      const ratings = list.flatMap(r => r.ratings)
      const done = list.reduce((a, r) => a + r.done, 0)
      const full = list.reduce((a, r) => a + r.fullDays, 0)
      return { name, list: list.sort((a, b) => b.done - a.done || (a.u.full_name_ar ?? '').localeCompare(b.u.full_name_ar ?? '', 'ar')), ratings, done, compliance: pct(full, list.length * N), avg: avgOf(ratings) }
    })
    const cmp = { name: (a, b) => a.name.localeCompare(b.name, 'ar'), count: (a, b) => b.done - a.done, avg: (a, b) => (b.avg ?? -1) - (a.avg ?? -1), compliance: (a, b) => b.compliance - a.compliance }[sortBy]
    return arr.sort(cmp)
  }, [rows, sortBy, N])

  const total = rows.reduce((a, r) => a + r.done, 0)
  const allRatings = rows.flatMap(r => r.ratings)
  const compliance = pct(rows.reduce((a, r) => a + r.fullDays, 0), rows.length * N)
  const cnt = st => rows.filter(r => r.st === st).length
  const stTxt = { done: single ? 'أكمل' : 'التزم', part: 'لم يكمل', none: 'لم يبدأ' }
  const stColor = { done: '#059669', part: '#b45309', none: '#b91c1c' }
  const rangeLabel = single ? fmtDay(from) : `${from} إلى ${days[days.length - 1]}`

  const [xlBusy, setXlBusy] = useState(false)
  async function exportExcel() {
    setXlBusy(true)
    try {
      const { exportSurveyExcel } = await import('../../utils/surveyReportExport')
      await exportSurveyExcel({ groups, ctx: { from, to: days[days.length - 1], N, single, need, total, compliance, allRatings, stationF, notStarted: cnt('none'), rated, accounts: rows.length } })
    } catch (e) { setErr('تعذّر إنشاء ملف Excel: ' + (e?.message || '')) }
    setXlBusy(false)
  }

  function print() {
    const chipRate = (r, t) => `<span style="display:inline-block;margin:1px 2px;padding:1px 7px;border-radius:99px;font-size:10.5px;font-weight:700;color:#fff;background:${RATING_COLOR[r] || '#94a3b8'}">${t ? `${t} ` : ''}${r ? RATING_LABEL[r] : 'غير مسجّلة'}</span>`
    const distBar = list => {
      const d = distOf(list).reverse()
      return list.length ? `<div style="display:flex;height:11px;border-radius:99px;overflow:hidden;background:#e8edf3">${d.map(([n, c]) => c ? `<i style="display:block;width:${(c / list.length) * 100}%;background:${RATING_COLOR[n]}"></i>` : '').join('')}</div>
        <div style="margin-top:5px;font-size:10.5px;color:#475569">${d.map(([n, c]) => `<span style="margin-inline-end:12px"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${RATING_COLOR[n]};margin-inline-end:4px"></i>${RATING_LABEL[n]} <b>${c}</b> (${pct(c, list.length)}%)</span>`).join('')}</div>` : '<span class="muted">لا توجد نتائج مسجّلة</span>'
    }
    const complBar = v => `<div style="display:inline-block;width:70px;height:7px;border-radius:99px;background:#e8edf3;overflow:hidden;vertical-align:middle"><i style="display:block;height:100%;width:${v}%;background:${v >= 80 ? '#15803d' : v >= 50 ? '#d97706' : '#dc2626'}"></i></div> <b>${v}%</b>`
    const detail = r => r.evs.length
      ? r.evs.map(e => chipRate(e.rating, single ? timeOf(e.created_at) : `${e.day.slice(5)} ${timeOf(e.created_at)}`)).join('')
      : (r.done ? '<span class="muted">عدد فقط (قبل تفعيل سجل التفاصيل)</span>' : '—')
    const body = `<div class="body">
      <div class="sec"><div class="grid g5">
        <div class="kpi" style="--c:#0369a1"><small>حسابات قيّمت</small><b>${rated}</b><em>من ${rows.length} حساب (${pct(rated, rows.length)}%)</em></div>
        <div class="kpi" style="--c:#059669"><small>إجمالي التقييمات</small><b>${total}</b><em>${single ? 'تقييم اليوم' : `خلال ${N} يوم`}</em></div>
        <div class="kpi" style="--c:${compliance >= 80 ? '#15803d' : compliance >= 50 ? '#d97706' : '#dc2626'}"><small>نسبة الالتزام</small><b>${compliance}%</b><em>${single ? `أكملوا ${cnt('done')} من ${rows.length}` : `${rows.length} حساب`}</em></div>
        <div class="kpi" style="--c:#7c3aed"><small>متوسط رضا الركاب</small><b>${fmtAvg(avgOf(allRatings))}</b><em>من 5 (${allRatings.length} نتيجة)</em></div>
        <div class="kpi" style="--c:#dc2626"><small>لم يبدأوا</small><b>${cnt('none')}</b><em>حساب</em></div>
      </div></div>
      <div class="sec"><h3>توزيع نتائج الركاب</h3>${distBar(allRatings)}</div>
      <div class="sec"><h3>ملخص المحطات</h3>
        <table class="t"><thead><tr><th>المحطة</th><th>الحسابات</th><th>التقييمات</th><th>الالتزام</th><th>متوسط الرضا</th></tr></thead><tbody>
        ${groups.map(g => `<tr><td class="l"><b>${esc(g.name)}</b></td><td>${g.list.length}</td><td><b>${g.done}</b></td><td>${complBar(g.compliance)}</td><td><b>${fmtAvg(g.avg)}</b></td></tr>`).join('')}
        <tr class="tot"><td class="l">الإجمالي</td><td>${rows.length}</td><td>${total}</td><td>${compliance}%</td><td>${fmtAvg(avgOf(allRatings))}</td></tr></tbody></table></div>
      ${groups.map(g => {
        const active = g.list.filter(r => r.done > 0), idle = g.list.filter(r => r.done === 0)
        return `<div class="sec"><h3>${esc(g.name)} <span class="muted">(${g.list.length} حساب · ${g.done} تقييم · رضا ${fmtAvg(g.avg)})</span></h3>
        ${active.length ? `<table class="t"><thead><tr><th>الموظف</th><th>الرقم</th><th>التقييمات</th><th>${single ? 'الحالة' : 'الأيام المكتملة'}</th><th>المتوسط</th><th>نتائج الركاب (${single ? 'الوقت' : 'التاريخ والوقت'})</th></tr></thead><tbody>${active.map(r => `<tr>
          <td class="l"><b>${esc(r.u.full_name_ar ?? '—')}</b></td><td>${esc(r.u.job_number ?? '—')}</td><td><b>${r.done}</b>${single ? ` / ${need}` : ''}</td>
          <td>${single ? `<span class="chip" style="background:${r.st === 'done' ? '#dcfce7' : '#fef3c7'};color:${stColor[r.st]}">${stTxt[r.st]}</span>` : `${r.fullDays} من ${N}`}</td>
          <td>${fmtAvg(r.avg)}</td><td class="l">${detail(r)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لا توجد تقييمات في هذه المحطة.</p>'}
        ${idle.length ? `<p class="muted" style="margin-top:6px"><b style="color:#b91c1c">لم يبدأوا (${idle.length}):</b> ${idle.map(r => esc(r.u.full_name_ar ?? '—')).join(' · ')}</p>` : ''}</div>`
      }).join('')}
      ${data?.noEvents ? '<p class="muted">ملاحظة: نتيجة كل تقييم ووقته غير متوفرة (جدول التفاصيل غير مفعّل).</p>' : ''}
    </div>`
    openDocWindow(docShell({
      title: `تقرير تقييم الركاب — ${from}${single ? '' : '_' + days[days.length - 1]}`,
      body: docHeader({ title: 'تقرير التقييم اليومي للركاب', infoLines: [`${single ? 'اليوم' : 'الفترة'}: <b>${esc(rangeLabel)}</b>`, `الحسابات: <b>${rows.length}</b>`, stationF ? `المحطة: <b>${esc(stationF)}</b>` : 'كل المحطات'] }) + body,
      footerLeft: `طُبع: ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }))}`, footerRight: 'وثيقة داخلية',
      shareText: `تقرير التقييم اليومي للركاب — ${rangeLabel}\nالتقييمات: ${total} · الالتزام: ${compliance}% · متوسط الرضا: ${fmtAvg(avgOf(allRatings))}/5`,
    }))
  }

  const ctl = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-2, #e0e0e0)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.78rem' }
  const dpCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white'
  const toggle = id => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const btn = (primary) => ({ padding: '8px 14px', borderRadius: 8, border: primary ? 'none' : '1px solid var(--border-2, #e0e0e0)', background: primary ? '#1C2B4A' : 'var(--card)', color: primary ? '#fff' : 'var(--text-2)', fontWeight: 800, fontSize: '.76rem', cursor: 'pointer', fontFamily: 'inherit', opacity: rows.length ? 1 : .5 })

  return (
    <div>
      {/* الفترة */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 8, overflow: 'hidden', background: 'var(--card)' }}>
          {presets.map(([label, a, b]) => {
            const on = from === a && to === b
            return <button key={label} type="button" onClick={() => setRange(a, b)}
              style={{ padding: '7px 12px', border: 'none', borderInlineStart: '1px solid var(--border)', background: on ? '#1C2B4A' : 'transparent', color: on ? '#fff' : 'var(--text-2)', fontWeight: 700, fontSize: '.74rem', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
          })}
        </div>
        <span style={{ fontSize: '.74rem', color: 'var(--text-3)' }}>من</span>
        <div style={{ width: 168 }}><DatePicker value={from} onChange={onFrom} max={today} isAr className={dpCls} /></div>
        <span style={{ fontSize: '.74rem', color: 'var(--text-3)' }}>إلى</span>
        <div style={{ width: 168 }}><DatePicker value={to} onChange={onTo} max={today} isAr className={dpCls} /></div>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
          <button type="button" onClick={exportExcel} disabled={!rows.length || xlBusy} style={btn(false)}>{xlBusy ? 'جارٍ التجهيز...' : 'تصدير Excel'}</button>
          <button type="button" onClick={print} disabled={!rows.length} style={btn(true)}>طباعة التقرير</button>
        </span>
      </div>
      {days.length >= MAX_DAYS && <p style={{ margin: '6px 0 0', fontSize: '.7rem', color: '#b45309' }}>الحد الأقصى للفترة {MAX_DAYS} يوماً.</p>}
      <p style={{ margin: '8px 0 12px', fontSize: '.74rem', color: 'var(--text-3)' }}>{single ? fmtDay(from) : `${N} يوم · من ${from} إلى ${days[N - 1]}`}</p>

      {err && <p style={{ margin: '0 0 8px', fontSize: '.75rem', color: '#b91c1c' }}>{err}</p>}
      {!data ? <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--text-3)' }}>جارٍ التحميل...</p> : (
        <>
          {/* المؤشرات */}
          <div style={{ display: 'flex', flexWrap: 'wrap', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
            <Kpi label="حسابات قيّمت" value={rated} sub={`من ${rows.length} حساب · ${pct(rated, rows.length)}%`} tone={rated ? '#059669' : undefined} />
            <Kpi label="إجمالي التقييمات" value={total} sub={single ? 'تقييم اليوم' : `${N} يوم`} />
            <Kpi label="نسبة الالتزام" value={`${compliance}%`} sub={single ? `أكملوا ${cnt('done')} من ${rows.length}` : `${rows.length} حساب`} tone={compliance >= 80 ? '#059669' : compliance >= 50 ? '#b45309' : '#b91c1c'} />
            <Kpi label="متوسط رضا الركاب" value={fmtAvg(avgOf(allRatings))} sub={`من 5 · ${allRatings.length} نتيجة`} />
            <Kpi label={single ? 'لم يكملوا' : 'بلا التزام كامل'} value={cnt('part')} tone={cnt('part') ? '#b45309' : undefined} />
            <Kpi label="لم يبدأوا" value={cnt('none')} tone={cnt('none') ? '#b91c1c' : undefined} />
          </div>
          {allRatings.length > 0 && (
            <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 10, background: 'var(--card)' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>توزيع نتائج الركاب</div>
              <DistBar list={allRatings} height={12} legend />
            </div>
          )}
          {data.noEvents && !err && <p style={{ margin: '10px 0 0', fontSize: '.72rem', color: '#b45309' }}>نتيجة كل تقييم ووقته تُسجَّل بعد تفعيل جدول التفاصيل (استعلام SQL الجديد). حتى ذلك الحين يظهر العدد فقط.</p>}

          {/* فلاتر */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 10px' }}>
            <select value={stationF} onChange={e => setStationF(e.target.value)} style={ctl}>
              <option value="">كل المحطات</option>{stations.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} style={ctl}>
              <option value="">كل الحالات</option><option value="done">{single ? 'أكملوا' : 'التزموا كل الأيام'}</option><option value="part">لم يكملوا</option><option value="none">لم يبدأوا</option>
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم الوظيفي" style={{ ...ctl, minWidth: 190 }} />
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...ctl, marginInlineStart: 'auto' }} aria-label="ترتيب المحطات">
              <option value="name">ترتيب: الاسم</option><option value="count">ترتيب: الأكثر تقييماً</option><option value="avg">ترتيب: الأعلى رضا</option><option value="compliance">ترتيب: الأعلى التزاماً</option>
            </select>
          </div>

          {/* المحطات */}
          <div style={{ border: '1px solid var(--border-2, #e0e0e0)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
            {groups.map((g, gi) => {
              const isOpen = open.has(g.name) || !!q.trim() || groups.length === 1
              return (
                <div key={g.name} style={{ borderTop: gi ? '1px solid var(--border-2, #e0e0e0)' : 'none' }}>
                  <button type="button" onClick={() => toggle(g.name)} aria-expanded={isOpen}
                    style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(150px,1.4fr) 70px minmax(120px,1fr) 70px minmax(110px,1fr) 18px', gap: 12, alignItems: 'center', padding: '11px 14px', border: 'none', background: isOpen ? 'var(--surface)' : 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
                    <span style={{ fontWeight: 800, fontSize: '.82rem' }} dir="auto">{g.name}<span style={{ fontWeight: 500, color: 'var(--text-3)', fontSize: '.7rem' }}> · {g.list.length} حساب</span></span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '.86rem' }}>{g.done}<span style={{ display: 'block', fontSize: '.6rem', fontWeight: 500, color: 'var(--text-3)', fontFamily: 'inherit' }}>تقييم</span></span>
                    <span>
                      <span style={{ display: 'block', height: 7, borderRadius: 99, background: 'var(--surface-2, #ebebed)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${g.compliance}%`, background: g.compliance >= 80 ? '#059669' : g.compliance >= 50 ? '#d97706' : '#dc2626' }} /></span>
                      <span style={{ fontSize: '.64rem', color: 'var(--text-3)' }}>التزام {g.compliance}%</span>
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '.86rem' }}>{fmtAvg(g.avg)}<span style={{ display: 'block', fontSize: '.6rem', fontWeight: 500, color: 'var(--text-3)', fontFamily: 'inherit' }}>رضا / 5</span></span>
                    <DistBar list={g.ratings} height={8} />
                    <span style={{ color: 'var(--text-3)', transform: isOpen ? 'rotate(90deg)' : 'rotate(180deg)', transition: 'transform .15s', display: 'inline-block' }}>&#8250;</span>
                  </button>
                  {isOpen && g.list.map(r => (
                    <div key={r.u.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.4fr) 70px minmax(120px,1fr) 70px minmax(110px,1fr) 18px', gap: 12, alignItems: 'center', padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: '.78rem', color: 'var(--text-1)' }}>
                      <span dir="auto">{r.u.full_name_ar}{r.u.job_number ? <span style={{ color: 'var(--text-3)' }}> · {r.u.job_number}</span> : null}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.done}{single ? <span style={{ color: 'var(--text-3)' }}> / {need}</span> : null}</span>
                      <span style={{ fontSize: '.72rem' }}>
                        <b style={{ color: stColor[r.st] }}>{stTxt[r.st]}</b>
                        <span style={{ color: 'var(--text-3)' }}>{single ? (r.evs.length ? ` · ${timeOf(r.evs[0].created_at)} – ${timeOf(r.evs[r.evs.length - 1].created_at)}` : '') : ` · ${r.fullDays} من ${N} يوم`}</span>
                      </span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtAvg(r.avg)}</span>
                      <DistBar list={r.ratings} height={6} />
                      <span />
                      {r.done > 0 && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                          {r.evs.length
                            ? r.evs.map((e, i) => (
                              <span key={i} title={e.rating ? RATING_LABEL[e.rating] : 'نتيجة غير مسجّلة'}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 99, fontSize: '.68rem', fontWeight: 700, color: '#fff', background: RATING_COLOR[e.rating] || '#94a3b8' }}>
                                <span style={{ fontFamily: 'monospace', opacity: .9 }}>{single ? timeOf(e.created_at) : `${e.day.slice(5)} ${timeOf(e.created_at)}`}</span>
                                {e.rating ? `${RATING_LABEL[e.rating]}` : 'غير مسجّلة'}
                              </span>
                            ))
                            : <span style={{ fontSize: '.68rem', color: 'var(--text-3)' }}>عدد التقييمات مسجّل، ونتائجها غير متوفرة (قبل تفعيل سجل التفاصيل).</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            {groups.length === 0 && <p style={{ margin: 0, padding: 20, fontSize: '.8rem', color: 'var(--text-3)', textAlign: 'center' }}>لا توجد نتائج لهذه الفترة أو للفلتر المختار.</p>}
          </div>
          {groups.length > 1 && <p style={{ margin: '8px 0 0', fontSize: '.68rem', color: 'var(--text-3)' }}>اضغط على أي محطة لعرض موظفيها ونتائج كل واحد.</p>}
        </>
      )}
    </div>
  )
}

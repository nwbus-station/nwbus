import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ADMIN_ROLE_VALUES } from '../../utils/constants'
import { riyadhDay } from '../../utils/dates'
import { docShell, docHeader, openDocWindow, esc } from '../../utils/printDoc'

const RATING_LABEL = { 1: 'سيئ جداً', 2: 'سيئ', 3: 'محايد', 4: 'جيد', 5: 'ممتاز' }
const timeOf = iso => new Date(iso).toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' })
const avgOf = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const fmtAvg = a => (a == null ? '—' : a.toFixed(2))
const statusOf = (done, need) => (done >= need ? 'done' : done > 0 ? 'part' : 'none')
const STATUS_AR = { done: 'أكمل', part: 'لم يكمل', none: 'لم يبدأ' }
const STATUS_COLOR = { done: '#059669', part: '#b45309', none: '#b91c1c' }

// تقرير التقييم اليومي للركاب: من قيّم ومن أي محطة وبأي نتيجة، لأي يوم، مع طباعة
export default function DailySurveyReport({ need, target, selectedIds }) {
  const [day, setDay] = useState(riyadhDay())
  const [data, setData] = useState(null)         // { users, progress, events, noEvents }
  const [err, setErr] = useState('')
  const [stationF, setStationF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let off = false
    setData(null); setErr('')
    ;(async () => {
      const [{ data: users }, { data: prog, error: pe }, { data: ev, error: ee }] = await Promise.all([
        supabase.from('users').select('id, full_name_ar, job_number, station:station_id(id, name_ar, name_en)').eq('is_active', true).not('role', 'in', `(${ADMIN_ROLE_VALUES.join(',')})`).order('full_name_ar').limit(2000),
        supabase.from('user_daily_survey').select('user_id, done').eq('day', day).limit(5000),
        supabase.from('user_survey_events').select('user_id, rating, created_at').eq('day', day).order('created_at').limit(20000),
      ])
      if (off) return
      if (pe) { setErr('جدول المتابعة غير مُنشأ بعد. شغّل استعلام SQL الخاص بالتقييم اليومي.'); setData({ users: [], progress: {}, events: {}, noEvents: true }); return }
      const scoped = target === 'selected' ? (users ?? []).filter(u => selectedIds.includes(u.id)) : (users ?? [])
      const events = {}
      for (const e of ee ? [] : (ev ?? [])) (events[e.user_id] ||= []).push(e)
      setData({ users: scoped, progress: Object.fromEntries((prog ?? []).map(p => [p.user_id, p.done])), events, noEvents: !!ee })
    })()
    return () => { off = true }
  }, [day, target, selectedIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    return data.users.map(u => {
      const evs = data.events[u.id] ?? []
      const done = data.progress[u.id] ?? 0
      const ratings = evs.map(e => e.rating).filter(r => r >= 1 && r <= 5)
      return { u, done, st: statusOf(done, need), evs, ratings, avg: avgOf(ratings), station: u.station?.name_ar || u.station?.name_en || 'بدون محطة' }
    })
      .filter(r => (!stationF || r.station === stationF) && (!statusF || r.st === statusF) && (!term || (r.u.full_name_ar ?? '').toLowerCase().includes(term) || String(r.u.job_number ?? '').includes(term)))
  }, [data, need, stationF, statusF, q])

  const stations = useMemo(() => [...new Set((data?.users ?? []).map(u => u.station?.name_ar || u.station?.name_en || 'بدون محطة'))].sort((a, b) => a.localeCompare(b, 'ar')), [data])
  const groups = useMemo(() => {
    const m = new Map()
    for (const r of rows) { if (!m.has(r.station)) m.set(r.station, []); m.get(r.station).push(r) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar')).map(([name, list]) => ({ name, list: list.sort((a, b) => b.done - a.done || (a.u.full_name_ar ?? '').localeCompare(b.u.full_name_ar ?? '', 'ar')) }))
  }, [rows])

  const total = rows.reduce((a, r) => a + r.done, 0)
  const allRatings = rows.flatMap(r => r.ratings)
  const cnt = st => rows.filter(r => r.st === st).length
  const dist = list => [5, 4, 3, 2, 1].map(n => [n, list.filter(x => x === n).length])

  function print() {
    const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const distCell = list => list.length ? dist(list).filter(([, n]) => n).map(([r, n]) => `${RATING_LABEL[r]} ${n}`).join(' · ') : '—'
    const body = `<div class="body">
      <div class="sec"><div class="grid g4">
        <div class="kpi" style="--c:#059669"><small>إجمالي تقييمات اليوم</small><b>${total}</b><em>تقييم</em></div>
        <div class="kpi" style="--c:#264673"><small>أكملوا العدد (${need})</small><b>${cnt('done')}</b><em>من ${rows.length}</em></div>
        <div class="kpi" style="--c:#b45309"><small>لم يكملوا</small><b>${cnt('part')}</b><em>بدأوا ولم يكملوا</em></div>
        <div class="kpi" style="--c:#dc2626"><small>لم يبدأوا</small><b>${cnt('none')}</b><em>حساب</em></div>
      </div></div>
      <div class="sec"><p class="muted">متوسط رضا الركاب (من 5): <b>${fmtAvg(avgOf(allRatings))}</b> · ${allRatings.length} تقييم بنتيجة مسجّلة · ${esc(distCell(allRatings))}</p></div>
      ${groups.map(g => `<div class="sec"><h3>${esc(g.name)} <span class="muted">(${g.list.length} حساب · ${g.list.reduce((a, r) => a + r.done, 0)} تقييم)</span></h3>
        <table class="t"><thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>التقييمات</th><th>الحالة</th><th>المتوسط</th><th>توزيع النتائج</th><th>الوقت</th></tr></thead><tbody>${g.list.map(r => `<tr>
          <td class="l">${esc(r.u.full_name_ar ?? '—')}</td><td>${esc(r.u.job_number ?? '—')}</td><td><b>${r.done}</b> / ${need}</td>
          <td><span class="chip" style="background:${r.st === 'done' ? '#dcfce7' : r.st === 'part' ? '#fef3c7' : '#fee2e2'};color:${STATUS_COLOR[r.st]}">${STATUS_AR[r.st]}</span></td>
          <td>${fmtAvg(r.avg)}</td><td class="l">${esc(distCell(r.ratings))}</td>
          <td>${r.evs.length ? `${timeOf(r.evs[0].created_at)} – ${timeOf(r.evs[r.evs.length - 1].created_at)}` : '—'}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      ${data?.noEvents ? '<p class="muted">ملاحظة: نتائج التقييمات وأوقاتها تُسجَّل من تفعيل جدول التفاصيل؛ هذا اليوم بلا تفاصيل.</p>' : ''}
    </div>`
    const html = docShell({
      title: `تقرير تقييم الركاب — ${day}`,
      body: docHeader({ title: 'تقرير التقييم اليومي للركاب', infoLines: [`اليوم: <b>${esc(dayLabel)}</b>`, `الحسابات: <b>${rows.length}</b>`, stationF ? `المحطة: <b>${esc(stationF)}</b>` : 'كل المحطات'] }) + body,
      footerLeft: `طُبع: ${esc(new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }))}`, footerRight: 'وثيقة داخلية',
      shareText: `تقرير التقييم اليومي للركاب — ${dayLabel}\nالتقييمات: ${total} · أكملوا: ${cnt('done')} · لم يكملوا: ${cnt('part')} · لم يبدأوا: ${cnt('none')}`,
    })
    openDocWindow(html)
  }

  const inp = { padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: '.78rem' }
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <b style={{ fontSize: '.84rem', color: 'var(--text-1)' }}>تقرير التقييم اليومي</b>
        <input type="date" value={day} max={riyadhDay()} onChange={e => e.target.value && setDay(e.target.value)} style={inp} />
        <select value={stationF} onChange={e => setStationF(e.target.value)} style={inp}>
          <option value="">كل المحطات</option>
          {stations.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={inp}>
          <option value="">كل الحالات</option><option value="done">أكملوا</option><option value="part">لم يكملوا</option><option value="none">لم يبدأوا</option>
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم الوظيفي" style={{ ...inp, minWidth: 170 }} />
        <button type="button" onClick={print} disabled={!rows.length}
          style={{ marginInlineStart: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1C2B4A', color: '#fff', fontWeight: 800, fontSize: '.78rem', cursor: 'pointer', fontFamily: 'inherit', opacity: rows.length ? 1 : .5 }}>طباعة التقرير</button>
      </div>
      {err && <p style={{ margin: '0 0 8px', fontSize: '.75rem', color: '#b91c1c' }}>{err}</p>}
      {!data ? <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-3)' }}>جارٍ التحميل...</p> : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: '.8rem', color: 'var(--text-2)' }}>
            <b>{total}</b> تقييم · <b style={{ color: '#059669' }}>{cnt('done')}</b> أكملوا · <b style={{ color: '#b45309' }}>{cnt('part')}</b> لم يكملوا · <b style={{ color: '#b91c1c' }}>{cnt('none')}</b> لم يبدأوا
            {allRatings.length > 0 && <> · متوسط الرضا <b>{fmtAvg(avgOf(allRatings))}</b> / 5</>}
          </p>
          {data.noEvents && !err && <p style={{ margin: '0 0 8px', fontSize: '.72rem', color: '#b45309' }}>لتسجيل نتيجة كل تقييم ووقته شغّل استعلام SQL الجديد للتقييم اليومي (جدول التفاصيل). حتى ذلك الحين يظهر العدد فقط.</p>}
          <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {groups.map(g => (
              <div key={g.name}>
                <div style={{ position: 'sticky', top: 0, display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: '.78rem', fontWeight: 800, color: 'var(--text-1)' }}>
                  <span>{g.name}</span><span style={{ color: 'var(--text-3)', fontFamily: 'monospace' }}>{g.list.reduce((a, r) => a + r.done, 0)} تقييم · {g.list.length} حساب</span>
                </div>
                {g.list.map(r => (
                  <div key={r.u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: '.78rem', color: 'var(--text-1)', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 150 }}>{r.u.full_name_ar}{r.u.job_number ? <span style={{ color: 'var(--text-3)' }}> · {r.u.job_number}</span> : null}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.done} / {need}</span>
                    <span style={{ minWidth: 60, fontWeight: 700, color: STATUS_COLOR[r.st] }}>{STATUS_AR[r.st]}</span>
                    <span style={{ minWidth: 150, color: 'var(--text-3)', fontSize: '.72rem' }}>{r.ratings.length ? `متوسط ${fmtAvg(r.avg)} · ` + dist(r.ratings).filter(([, n]) => n).map(([x, n]) => `${x}:${n}`).join(' ') : ''}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: '.72rem', fontFamily: 'monospace' }}>{r.evs.length ? `${timeOf(r.evs[0].created_at)} – ${timeOf(r.evs[r.evs.length - 1].created_at)}` : ''}</span>
                  </div>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p style={{ margin: 0, padding: 14, fontSize: '.78rem', color: 'var(--text-3)', textAlign: 'center' }}>لا توجد نتائج لهذا اليوم أو للفلتر المختار.</p>}
          </div>
        </>
      )}
    </div>
  )
}

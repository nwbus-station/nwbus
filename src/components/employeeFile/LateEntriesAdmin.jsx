// الإدخالات المتأخرة (للأدمن): كل محطة عليها إيراد وردية أو رحلات لم تُدخل (أمس واليوم)، ومن أقرّ من المشرفين بعلمه ومن لم يقرّ،
// مع المشرفين المسؤولين عن كل محطة. يُحمَّل فقط عند فتح هذا التبويب (لا يؤثر على بقية صفحة السجل الوظيفي).
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useShortfalls } from '../home/ShortfallCard'
import { f } from './ui'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }
const SUP_ROLES = ['shift_supervisor', 'station_admin', 'area_supervisor']
const stamp = iso => { const r = new Date(new Date(iso).getTime() + 3 * 3600 * 1000); return `${r.toISOString().slice(5, 10).replace('-', '/')} ${r.toISOString().slice(11, 16)}` }

export default function LateEntriesAdmin({ isAr = true }) {
  const t = (a, e) => (isAr ? a : e)
  const { items, acks, ackList, loading, stations, today } = useShortfalls('all', true, 7)
  const [sups, setSups] = useState({})      // station_id → [أسماء المشرفين]
  const [flt, setFlt] = useState('pending') // pending | acked | all
  const [kind, setKind] = useState('all')   // all | sales | trips
  const [q, setQ] = useState('')
  const [log, setLog] = useState(false)

  useEffect(() => {
    let off = false
    ;(async () => {
      const [{ data: us }, { data: ust }] = await Promise.all([
        supabase.from('users').select('id, full_name_ar, role, station_id').in('role', SUP_ROLES).eq('is_active', true),
        supabase.from('user_stations').select('user_id, station_id'),
      ])
      if (off) return
      const byId = Object.fromEntries((us ?? []).map(u => [u.id, u]))
      const m = {}
      const add = (sid, name) => { if (!sid || !name) return; const a = (m[sid] ??= []); if (!a.includes(name)) a.push(name) }
      ;(us ?? []).forEach(u => add(u.station_id, u.full_name_ar))
      ;(ust ?? []).forEach(r => { const u = byId[r.user_id]; if (u) add(r.station_id, u.full_name_ar) })
      setSups(m)
    })()
    return () => { off = true }
  }, [])

  const nm = useMemo(() => Object.fromEntries(stations.map(s => [s.id, isAr ? s.name_ar : (s.name_en || s.name_ar)])), [stations, isAr])
  const dayLbl = d => `${d === today ? t('اليوم', 'Today') : t('أمس', 'Yesterday')} ${d.slice(5).replace('-', '/')}`
  const rows = useMemo(() => (items || []).map(it => ({ ...it, a: acks[it.key] || null })), [items, acks])
  const counts = useMemo(() => ({
    all: rows.length, pending: rows.filter(r => !r.a).length, acked: rows.filter(r => r.a).length,
    stations: new Set(rows.map(r => r.station.id)).size, pendingStations: new Set(rows.filter(r => !r.a).map(r => r.station.id)).size,
  }), [rows])
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return rows.filter(r => (flt === 'all' || (flt === 'pending' ? !r.a : !!r.a)) && (kind === 'all' || r.kind === kind)
      && (!qq || (r.station.name_ar || '').toLowerCase().includes(qq) || (r.station.name_en || '').toLowerCase().includes(qq)))
      .sort((a, b) => (Number(!!a.a) - Number(!!b.a)) || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) || (nm[a.station.id] || '').localeCompare(nm[b.station.id] || '', isAr ? 'ar' : 'en'))
  }, [rows, flt, kind, q, nm, isAr])

  const pill = on => ({ border: `1px solid ${on ? '#1C2B4A' : 'var(--border-2)'}`, background: on ? '#1C2B4A' : 'var(--card)', color: on ? '#fff' : 'var(--text-2)', borderRadius: 99, padding: '6px 14px', fontSize: f('0.76rem'), fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' })
  const kpi = (v, l, c) => (
    <div style={{ ...card, padding: '12px 16px', flex: '1 1 150px' }}>
      <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: f('1.5rem'), color: c, lineHeight: 1.1 }}>{v}</div>
      <div style={{ fontSize: f('0.72rem'), fontWeight: 700, color: 'var(--text-3)', marginTop: 4 }}>{l}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, padding: '12px 16px', fontSize: f('0.78rem'), color: 'var(--text-2)', lineHeight: 1.8, fontWeight: 600 }}>
        {t('إيراد ورديات ورحلات لم تُدخل في أمس واليوم (الورديات المتوقفة لا تُحسب). «لم يقرّ» تعني أن المشرف لم يضغط «علمت» على بطاقته في الرئيسية بعد.', 'Revenue shifts and trips not entered yesterday/today. "Not acknowledged" means the supervisor has not pressed acknowledge yet.')}
      </div>

      {loading && !items ? (
        <div style={{ ...card, padding: 36, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>{t('جارٍ التحميل…', 'Loading…')}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {kpi(counts.pending, t('لم يقرّ المشرف', 'Not acknowledged'), counts.pending ? '#b91c1c' : 'var(--text-1)')}
            {kpi(counts.acked, t('أقرّ المشرف', 'Acknowledged'), '#15803d')}
            {kpi(counts.pendingStations, t('محطات لم يقرّ مشرفها', 'Stations pending'), counts.pendingStations ? '#b45309' : 'var(--text-1)')}
            {kpi(counts.all, t('إجمالي المتأخر', 'Total late'), 'var(--text-1)')}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['pending', t('لم يقرّ', 'Not acknowledged'), counts.pending], ['acked', t('أقرّ', 'Acknowledged'), counts.acked], ['all', t('الكل', 'All'), counts.all]].map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => setFlt(k)} style={pill(flt === k)}>{l} <span style={{ fontFamily: MONO, opacity: 0.8 }}>{n}</span></button>
            ))}
            <span style={{ width: 1, height: 20, background: 'var(--border-2)', margin: '0 4px' }} />
            {[['all', t('كل الأنواع', 'All types')], ['sales', t('إيراد', 'Revenue')], ['trips', t('رحلات', 'Trips')]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} style={pill(kind === k)}>{l}</button>
            ))}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('بحث بالمحطة…', 'Search station…')}
              style={{ marginInlineStart: 'auto', minWidth: 180, border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--text-1)', borderRadius: 10, padding: '7px 12px', fontSize: f('0.78rem'), fontFamily: 'inherit', outline: 'none' }} />
          </div>

          {visible.length === 0 ? (
            <div style={{ ...card, padding: 36, textAlign: 'center', color: 'var(--text-3)', fontWeight: 700, fontSize: f('0.86rem') }}>
              {rows.length === 0 ? t('لا إدخالات متأخرة الآن — كل المحطات مُدخِلة.', 'No late entries right now.') : t('لا نتائج بهذا الفلتر', 'No matching results')}
            </div>
          ) : (
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: f('0.78rem'), minWidth: 720 }}>
                  <thead><tr style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>
                    {[t('المحطة', 'Station'), t('النوع', 'Type'), t('اليوم', 'Day'), t('التفصيل', 'Detail'), t('المشرفون المسؤولون', 'Supervisors'), t('الحالة', 'Status')].map(h => <th key={h} style={{ padding: '9px 14px', fontWeight: 800, textAlign: 'start', whiteSpace: 'nowrap' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{visible.map(r => (
                    <tr key={r.key} style={{ borderTop: '1px solid var(--border)', background: r.a ? 'transparent' : 'rgba(185,28,28,0.04)' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 800, color: 'var(--text-1)' }}>{nm[r.station.id] || '—'}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ fontSize: f('0.68rem'), fontWeight: 900, padding: '2px 9px', borderRadius: 4, background: r.kind === 'sales' ? 'rgba(180,83,9,0.12)' : 'rgba(37,99,235,0.12)', color: r.kind === 'sales' ? '#b45309' : '#2563eb' }}>{r.kind === 'sales' ? t('إيراد', 'Revenue') : t('رحلات', 'Trips')}</span>
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{dayLbl(r.day)}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-2)' }}>
                        {r.kind === 'sales'
                          ? <>{r.shiftAr} <bdi dir="ltr" style={{ fontFamily: MONO, color: 'var(--text-3)' }}>{r.range}</bdi></>
                          : <>{r.list.length} {t(r.list.length === 1 ? 'رحلة' : 'رحلات', 'trips')}
                              <div dir="ltr" style={{ fontFamily: MONO, fontSize: f('0.68rem'), color: 'var(--text-3)', marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>{r.list.slice(0, 4).map(e => `${e.time} ${e.tripNo}`).join(' · ')}{r.list.length > 4 ? ` +${r.list.length - 4}` : ''}</div></>}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-2)', maxWidth: 220 }}>{(sups[r.station.id] || []).slice(0, 3).join('، ') || t('لا مشرف مربوط', 'No supervisor linked')}{(sups[r.station.id] || []).length > 3 ? ` +${sups[r.station.id].length - 3}` : ''}</td>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                        {r.a
                          ? <span style={{ fontWeight: 800, color: '#15803d' }}>{t('أقرّ', 'Acknowledged')}: {r.a.ack_by_name} · <bdi dir="ltr" style={{ fontFamily: MONO }}>{stamp(r.a.ack_at)}</bdi></span>
                          : <span style={{ fontWeight: 900, color: '#b91c1c' }}>{t('لم يقرّ', 'Not acknowledged')}</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* سجل الإقرارات (آخر 7 أيام) — يشمل ما صُحّح بعد الإقرار */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <button type="button" onClick={() => setLog(v => !v)} aria-expanded={log} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
              <span style={{ fontSize: f('0.88rem'), fontWeight: 900, color: 'var(--text-1)' }}>{t('سجل الإقرارات — آخر 7 أيام', 'Acknowledgement log — last 7 days')}</span>
              <span style={{ fontFamily: MONO, fontSize: f('0.72rem'), fontWeight: 800, background: 'var(--surface-2)', borderRadius: 99, padding: '1px 10px', color: 'var(--text-2)' }}>{ackList.length}</span>
              <span style={{ marginInlineStart: 'auto', fontSize: f('0.72rem'), fontWeight: 800, color: 'var(--accent)' }}>{log ? t('إخفاء', 'Hide') : t('عرض', 'Show')}</span>
            </button>
            {log && (ackList.length === 0
              ? <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', color: 'var(--text-3)', fontWeight: 700, fontSize: f('0.8rem') }}>{t('لا إقرارات بعد', 'No acknowledgements yet')}</div>
              : <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: f('0.78rem') }}>
                    <thead><tr style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>
                      {[t('المحطة', 'Station'), t('النوع', 'Type'), t('عن يوم', 'For day'), t('اطّلع عليه', 'By'), t('الوقت', 'At')].map(h => <th key={h} style={{ padding: '8px 14px', fontWeight: 800, textAlign: 'start', whiteSpace: 'nowrap' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>{ackList.slice(0, 300).map((a, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 14px', fontWeight: 800, color: 'var(--text-1)' }}>{nm[a.station_id] || '—'}</td>
                        <td style={{ padding: '8px 14px', color: 'var(--text-2)' }}>{a.kind === 'sales' ? `${t('إيراد', 'Revenue')}${a.shift ? ` ${a.shift}` : ''}` : t('رحلات', 'Trips')}</td>
                        <td style={{ padding: '8px 14px', fontFamily: MONO, color: 'var(--text-2)' }} dir="ltr">{a.day}</td>
                        <td style={{ padding: '8px 14px', fontWeight: 800, color: 'var(--text-1)' }}>{a.ack_by_name || '—'}</td>
                        <td style={{ padding: '8px 14px', fontFamily: MONO, color: 'var(--text-2)' }} dir="ltr">{stamp(a.ack_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>)}
          </div>
        </>
      )}
    </div>
  )
}

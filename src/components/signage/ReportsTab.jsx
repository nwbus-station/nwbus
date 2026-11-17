// تبويب التقارير: لكل محطة (أو محطات محددة / كل المحطات) عدد الشاشات والمحتوى الذي يُعرض عليها ومرات العرض، مع تصدير CSV
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { btn } from '../dispatch/DispatchCards'
import StationPicker, { stationInfo } from './StationPicker'
import { Pill, Empty, Thumb, SG_ACCENT } from './common'
import {
  isOnline, ago, riyadhNow, addDaysStr, campaignActiveNow, campaignTargets, scheduleLabel, scopeLabel, mediaUrl, sgError, downloadCSV, fmtDur,
} from '../../utils/signage'

const PERIODS = [['today', 'اليوم', 'Today', 0], ['7', 'آخر 7 أيام', 'Last 7 days', 6], ['30', 'آخر 30 يوماً', 'Last 30 days', 29]]
const fmtHours = s => (s >= 3600 ? `${(s / 3600).toFixed(1)}h` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`)

export default function ReportsTab({ isAr, devices, stations, campaigns, media }) {
  const t = (a, e) => (isAr ? a : e)
  const [period, setPeriod] = useState('7')
  const [sel, setSel] = useState([])                 // فارغ = كل المحطات
  const [filterOpen, setFilterOpen] = useState(false)
  const [plays, setPlays] = useState([])
  const [loading, setLoading] = useState(true); const [err, setErr] = useState('')
  const [open, setOpen] = useState({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr('')
      const n = PERIODS.find(p => p[0] === period)[3]
      const from = `${addDaysStr(riyadhNow().date, -n)}T00:00:00+03:00`
      const to = new Date(Date.now() + 60000).toISOString()
      const { data, error } = await supabase.rpc('signage_report_plays', { p_from: from, p_to: to })
      if (!alive) return
      if (error) { setErr(/does not exist|schema cache/i.test(error.message || '') ? t('شغّل ملف SQL «029» في Supabase لتفعيل التقارير', 'Run the 029 SQL file in Supabase') : sgError(error, isAr)); setPlays([]) } else setPlays(data || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const mediaById = useMemo(() => Object.fromEntries(media.map(m => [m.id, m])), [media])
  const active = useMemo(() => devices.filter(d => d.status === 'active'), [devices])
  const live = useMemo(() => campaigns.filter(c => c.status === 'approved'), [campaigns])
  const info = useMemo(() => stationInfo(stations, devices), [stations, devices])
  const stationsById = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const devicesById = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])), [devices])

  // المحطات الظاهرة: المحددة، أو كل المحطات التي فيها شاشات
  const shownIds = sel.length ? sel : info.filter(s => s.screens > 0).map(s => s.id)

  const rows = useMemo(() => {
    const byDev = {}; plays.forEach(p => { const o = byDev[p.device_id] = byDev[p.device_id] || { plays: 0, seconds: 0, byCamp: {} }; o.plays += p.plays; o.seconds += p.seconds; o.byCamp[p.campaign_id] = { plays: p.plays, seconds: p.seconds } })
    const build = (id, name, ds) => {
      const screens = ds.map(d => {
        const camps = live.filter(c => campaignTargets(c, d)).sort((a, b) => (a.sort - b.sort))
        const st = byDev[d.id] || { plays: 0, seconds: 0, byCamp: {} }
        return { d, camps, plays: st.plays, seconds: st.seconds, byCamp: st.byCamp }
      })
      const campIds = new Set(screens.flatMap(s => s.camps.map(c => c.id)))
      return { id, name, screens, online: ds.filter(isOnline).length, campCount: campIds.size, plays: screens.reduce((a, s) => a + s.plays, 0), seconds: screens.reduce((a, s) => a + s.seconds, 0) }
    }
    const out = shownIds.map(id => build(id, stationsById[id] || '—', active.filter(d => d.station_id === id)))
    if (!sel.length) { const none = active.filter(d => !d.station_id); if (none.length) out.push(build('_', t('بدون محطة', 'No station'), none)) }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  }, [plays, live, active, shownIds.join('|'), stationsById, sel.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const tot = rows.reduce((a, r) => ({ screens: a.screens + r.screens.length, online: a.online + r.online, plays: a.plays + r.plays, seconds: a.seconds + r.seconds }), { screens: 0, online: 0, plays: 0, seconds: 0 })
  const campSet = new Set(rows.flatMap(r => r.screens.flatMap(s => s.camps.map(c => c.id))))

  function exportCsv() {
    const out = [[t('المحطة', 'Station'), t('الشاشة', 'Screen'), t('الحالة', 'Status'), t('الحملة', 'Campaign'), t('المحتوى', 'Media'), t('النوع', 'Type'), t('الوجهة', 'Target'), t('الجدولة', 'Schedule'), t('يُعرض الآن', 'Now'), t('مرات العرض', 'Plays'), t('ثواني العرض', 'Seconds')]]
    rows.forEach(r => r.screens.forEach(s => {
      const st = isOnline(s.d) ? t('متصلة', 'Online') : t('منقطعة', 'Offline')
      if (!s.camps.length) out.push([r.name, s.d.name, st, '', '', '', '', '', '', 0, 0])
      s.camps.forEach(c => { const m = mediaById[c.media_id]; const p = s.byCamp[c.id] || { plays: 0, seconds: 0 }
        out.push([r.name, s.d.name, st, c.title, m?.title || '', m ? (m.kind === 'video' ? t('فيديو', 'Video') : m.kind === 'board' ? t('شاشة العرض', 'Board') : m.kind === 'scene' ? t('مشهد', 'Scene') : t('صورة', 'Image')) : '', scopeLabel(c, stationsById, devicesById, isAr), scheduleLabel(c, isAr).replace(/[⁦⁩]/g, ''), campaignActiveNow(c) ? t('نعم', 'Yes') : t('لا', 'No'), p.plays, p.seconds]) })
    }))
    downloadCSV(`signage-report-${riyadhNow().date}.csv`, out)
  }

  const Kpi = ({ v, l, c }) => (
    <div style={{ flex: '1 1 120px', padding: '12px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '1.5rem', color: c || 'var(--text-1)', lineHeight: 1.1 }}>{v}</div>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)', marginTop: 4 }}>{l}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {PERIODS.map(([k, ar, en]) => (
            <button key={k} type="button" role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}
              style={{ padding: '8px 16px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', border: `1.5px solid ${period === k ? SG_ACCENT : 'var(--border)'}`, background: period === k ? `${SG_ACCENT}18` : 'var(--card)', color: period === k ? SG_ACCENT : 'var(--text-2)' }}>{isAr ? ar : en}</button>
          ))}
        </div>
        <button type="button" onClick={() => setFilterOpen(v => !v)} style={btn('ghost', { padding: '9px 16px' })}>
          {sel.length ? t(`${sel.length} محطة محددة`, `${sel.length} stations`) : t('كل المحطات', 'All stations')} {filterOpen ? '▴' : '▾'}
        </button>
        <button type="button" disabled={!rows.length} onClick={exportCsv} style={{ ...btn('primary'), background: SG_ACCENT, padding: '9px 18px' }}>{t('تصدير CSV', 'Export CSV')}</button>
      </div>

      {filterOpen && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 14, background: 'var(--card)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 8 }}>{t('اترك الاختيار فارغاً لعرض كل المحطات التي فيها شاشات.', 'Leave empty to show all stations with screens.')}</div>
          <StationPicker stations={stations} devices={devices} selected={sel} onChange={setSel} isAr={isAr} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <Kpi v={tot.screens} l={t('شاشات', 'Screens')} />
        <Kpi v={`${tot.online}/${tot.screens}`} l={t('متصلة الآن', 'Online now')} c={tot.screens && tot.online === tot.screens ? '#16a34a' : '#d97706'} />
        <Kpi v={rows.filter(r => r.screens.length).length} l={t('محطات', 'Stations')} />
        <Kpi v={campSet.size} l={t('حملات منشورة تصلها', 'Live campaigns')} c={SG_ACCENT} />
        <Kpi v={loading ? '…' : tot.plays} l={t('مرات العرض', 'Plays')} />
        <Kpi v={loading ? '…' : fmtHours(tot.seconds)} l={t('مدة العرض', 'Airtime')} />
      </div>
      {err && <div role="alert" style={{ padding: '10px 13px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 800, marginBottom: 12 }}>{err}</div>}
      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.8 }}>{t('مرات العرض تُحسب من تسجيل الشاشة نفسها. الحملة الوحيدة الثابتة تُسجَّل بمعدل دقيقة لكل مرة.', 'Plays are recorded by the screens. A single static item is logged once per minute.')}</div>

      {rows.length === 0 ? <Empty title={t('لا توجد شاشات ضمن هذا الاختيار', 'No screens for this selection')} hint={t('اربط شاشات بالمحطات من تبويب «الشاشات».', 'Pair screens in the Screens tab.')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => {
            const isOpen = !!open[r.id]
            return (
              <section key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} aria-expanded={isOpen}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
                  <span style={{ flex: '1 1 160px', fontWeight: 900, fontSize: '0.96rem', color: 'var(--text-1)' }}>{r.name}</span>
                  <Stat v={r.screens.length} l={t('شاشات', 'screens')} />
                  <Stat v={`${r.online}/${r.screens.length}`} l={t('متصلة', 'online')} c={r.screens.length && r.online === r.screens.length ? '#16a34a' : '#d97706'} />
                  <Stat v={r.campCount} l={t('حملات', 'campaigns')} c={SG_ACCENT} />
                  <Stat v={loading ? '…' : r.plays} l={t('مرات عرض', 'plays')} />
                  <Stat v={loading ? '…' : fmtHours(r.seconds)} l={t('مدة', 'airtime')} />
                  <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                    {r.screens.map(s => (
                      <div key={s.d.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                          <b style={{ fontSize: '0.86rem', color: 'var(--text-1)' }}>{s.d.name}</b>
                          <Pill color={isOnline(s.d) ? '#16a34a' : '#d97706'} dot>{isOnline(s.d) ? t('متصلة', 'Online') : t('منقطعة', 'Offline')}</Pill>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginInlineStart: 'auto' }}>{ago(s.d.last_seen_at, isAr)}</span>
                        </div>
                        {s.camps.length === 0 ? <div style={{ fontSize: '0.76rem', color: '#d97706', fontWeight: 700 }}>{t('لا توجد حملات منشورة تصل لهذه الشاشة', 'No live campaigns reach this screen')}</div> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {s.camps.map(c => { const m = mediaById[c.media_id]; const p = s.byCamp[c.id]
                              return (
                                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                  {m && <Thumb m={m} url={mediaUrl(m.path)} style={{ width: 62, aspectRatio: '16 / 9', borderRadius: 6, flexShrink: 0 }} />}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-1)' }}>{c.title}</span>
                                      {campaignActiveNow(c) && <Pill color="#16a34a">{t('الآن', 'Now')}</Pill>}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', lineHeight: 1.7 }}>{scopeLabel(c, stationsById, devicesById, isAr)} · {scheduleLabel(c, isAr)}{m && m.kind === 'video' ? ` · ${fmtDur(m.duration_sec)}` : ''}</div>
                                  </div>
                                  <div dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-2)', textAlign: 'end', whiteSpace: 'nowrap' }}>{loading ? '…' : `${p?.plays || 0}×`}</div>
                                </div>
                              ) })}
                          </div>
                        )}
                      </div>
                    ))}
                    {r.screens.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{t('لا توجد شاشات في هذه المحطة.', 'No screens at this station.')}</div>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Stat = ({ v, l, c }) => (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: 62 }}>
    <span dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '1.05rem', color: c || 'var(--text-1)', lineHeight: 1.1 }}>{v}</span>
    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)' }}>{l}</span>
  </span>
)

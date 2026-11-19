// الإدخالات المتأخرة للمشرف (الرئيسية): إيراد وردية لم يُدخل، ورحلات لم تُدخل — لأمس واليوم.
// الورديات المتوقفة في المحطة لا تُحسب. كل إدخال متأخر عليه زر «علمت» يُسجَّل باسم المشرف ووقته (shortfall_acks) ويبقى ظاهراً حتى يُصلَح.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { shiftsOfStation } from '../../utils/stationShifts'
import { buildExpected, enteredKeys, TRIP_SELECT } from '../../utils/expectedTrips'
import { isRestStation } from '../../utils/stations'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const SALES_LAG = 60    // مهلة (دقائق) بعد نهاية الوردية قبل أن يُعدّ إيرادها ناقصاً
const TRIP_LAG = 60     // مهلة بعد موعد رحلة اليوم قبل أن تُعدّ غير مُدخلة
const SALES_ACTIVITY_DAYS = 30

async function pageAll(make) {
  const out = []
  for (let f = 0; f < 20000; f += 1000) {
    const { data, error } = await make().range(f, f + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}
const riyadh = () => { const r = new Date(Date.now() + 3 * 3600 * 1000); return { today: r.toISOString().slice(0, 10), nowMin: r.getUTCHours() * 60 + r.getUTCMinutes() } }
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const stamp = iso => { const r = new Date(new Date(iso).getTime() + 3 * 3600 * 1000); return `${r.toISOString().slice(5, 10).replace('-', '/')} ${r.toISOString().slice(11, 16)}` }

// stationIds: مصفوفة، أو 'all' للأدمن (كل المحطات النشطة بلا فلترة). ackDays: كم يوماً للخلف تُجلب الإقرارات
export function useShortfalls(stationIds, enabled, ackDays = 1) {
  const ALL = stationIds === 'all'
  const idsKey = ALL ? 'all' : (stationIds || []).filter(Boolean).slice().sort().join(',')
  const [raw, setRaw] = useState(null)
  const [acks, setAcks] = useState({})
  const [ackList, setAckList] = useState([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled || !idsKey) { setRaw(null); return }
    let off = false
    const ids = ALL ? null : idsKey.split(',')
    const flt = (q, col) => (ids ? q.in(col, ids) : q)
    const { today } = riyadh(), y = addDays(today, -1), act = addDays(today, -SALES_ACTIVITY_DAYS), ackFrom = addDays(today, -Math.max(1, ackDays))
    setLoading(true)
    ;(async () => {
      try {
        const [stations, stationTrips, stops, records, sales, ackRes] = await Promise.all([
          flt(supabase.from('stations').select('id, name_ar, name_en, is_agent, shift_ends, inactive_shifts, city_group, type'), 'id').eq('is_active', true).then(r => { if (r.error) throw r.error; return r.data ?? [] }),
          pageAll(() => flt(supabase.from('station_trips').select(TRIP_SELECT), 'station_id').order('trip_schedule_id').order('station_id')),
          pageAll(() => flt(supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time'), 'station_id').order('trip_schedule_id').order('station_id')),
          pageAll(() => flt(supabase.from('trip_records').select('id, trip_schedule_id, record_date, station_id, is_arrival, actual_arrival, actual_departure'), 'station_id').gte('record_date', y).lte('record_date', today).order('id')),
          pageAll(() => flt(supabase.from('sales_records').select('id, sale_date, shift, station_id'), 'station_id').gte('sale_date', act).lte('sale_date', today).order('id')),
          supabase.rpc('shortfall_acks_list', { p_stations: ids, p_from: ackFrom }),
        ])
        if (off) return
        setRaw({ stations, stationTrips, stops, records, sales, today, y })
        const m = {}
        ;(ackRes.data ?? []).forEach(a => { m[`${a.station_id}|${a.kind}|${a.day}|${a.shift || ''}`] = a })
        setAcks(m); setAckList(ackRes.data ?? [])
      } catch { if (!off) setRaw(null) }
      if (!off) setLoading(false)
    })()
    return () => { off = true }
  }, [idsKey, enabled, tick, ackDays]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!enabled) return; const t = setInterval(() => setTick(x => x + 1), 5 * 60 * 1000); return () => clearInterval(t) }, [enabled])

  const items = useMemo(() => {
    if (!raw) return null
    const { stations: all, stationTrips, stops, records, sales, today, y } = raw
    const { nowMin } = riyadh()
    const stations = all.filter(s => !isRestStation(s) && !s.is_agent)
    const stById = Object.fromEntries(stations.map(s => [s.id, s]))
    const days = [y, today]
    const out = []
    // الإيرادات: ورديات عاملة انتهت (مع مهلة) ولا سجل لها — فقط للمحطة التي تُدخل إيراداً فعلاً (لها سجلات خلال 30 يوماً)
    const salesSet = {}
    sales.forEach(s => { (salesSet[s.station_id] ??= new Set()).add(`${s.sale_date}|${s.shift}`) })
    stations.forEach(stn => {
      const sset = salesSet[stn.id]
      if (!sset || !sset.size) return
      shiftsOfStation(stn).filter(sh => !sh.off).forEach(sh => {
        days.forEach(d => {
          const due = d !== today || sh.to + SALES_LAG <= nowMin
          if (due && !sset.has(`${d}|${sh.k}`)) out.push({ kind: 'sales', station: stn, day: d, shift: sh.k, shiftAr: sh.ar, range: sh.range, key: `${stn.id}|sales|${d}|${sh.k}` })
        })
      })
    })
    // الرحلات
    const { exp, tripInfo } = buildExpected({ stationTrips, stops, stById, days, today, nowMin, lagMin: TRIP_LAG })
    const entered = enteredKeys(records, tripInfo)
    stations.forEach(stn => {
      const miss = (exp[stn.id] ?? []).filter(e => !entered.has(e.key))
      days.forEach(d => {
        const list = miss.filter(e => e.date === d).sort((a, b) => a.time.localeCompare(b.time))
        if (list.length) out.push({ kind: 'trips', station: stn, day: d, shift: '', list, key: `${stn.id}|trips|${d}|` })
      })
    })
    out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === 'sales' ? -1 : 1))
    return out
  }, [raw])

  const ack = useCallback(async it => {
    const { data, error } = await supabase.rpc('shortfall_ack', { p_station: it.station.id, p_kind: it.kind, p_day: it.day, p_shift: it.shift || '' })
    if (!error && data) { setAcks(m => ({ ...m, [it.key]: data })); setAckList(l => [data, ...l]) }
    return !error
  }, [])

  return { items, acks, ackList, loading, stations: raw?.stations ?? [], ack, today: raw?.today, y: raw?.y, multi: new Set((items || []).map(i => i.station.id)).size > 1 || (stationIds || []).length > 1 }
}

export default function ShortfallCard({ stationIds, isAr, navigate, compact = false, sx }) {
  const { items, acks, ack, today, multi } = useShortfalls(stationIds, true)
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState('')
  if (!items || items.length === 0) return null
  const t = (a, e) => (isAr ? a : e)
  const pendingAck = items.filter(i => !acks[i.key]).length
  const dayLbl = d => `${d === today ? t('اليوم', 'Today') : t('أمس', 'Yesterday')} ${d.slice(5).replace('-', '/')}`
  const stName = s => (isAr ? s.name_ar : (s.name_en || s.name_ar))
  const doAck = async it => { setBusy(it.key); await ack(it); setBusy('') }
  const tone = pendingAck > 0 ? 'var(--danger)' : 'var(--warning)'

  return (
    <section aria-label={t('الإدخالات المتأخرة', 'Late entries')} style={{ background: 'var(--card)', border: `1px solid ${tone}`, borderInlineStart: `5px solid ${tone}`, borderRadius: compact ? 14 : 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', ...sx }}>
      <div style={{ padding: compact ? '12px 14px' : '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: compact ? '1.5rem' : '1.7rem', color: tone, lineHeight: 1 }}>{items.length}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: compact ? '0.86rem' : '0.95rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('إدخالات متأخرة', 'Late entries')}</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 2 }}>
            {pendingAck > 0 ? t(`${pendingAck} منها لم تُقرّ بالعلم بها بعد`, `${pendingAck} not yet acknowledged`) : t('تم الاطلاع على الجميع — وتبقى ظاهرة حتى تُدخل', 'All acknowledged — they stay until entered')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => {
          const a = acks[it.key]
          const isSales = it.kind === 'sales'
          const expanded = !!open[it.key]
          return (
            <div key={it.key} style={{ padding: compact ? '11px 14px' : '12px 18px', borderTop: i ? '1px solid var(--border)' : 'none', background: a ? 'var(--surface)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ flexShrink: 0, fontSize: '0.66rem', fontWeight: 900, letterSpacing: '0.04em', padding: '2px 9px', borderRadius: 4, background: isSales ? 'rgba(180,83,9,0.12)' : 'rgba(37,99,235,0.12)', color: isSales ? '#b45309' : '#2563eb' }}>
                  {isSales ? t('إيراد', 'Revenue') : t('رحلات', 'Trips')}
                </span>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.5 }}>
                    {isSales
                      ? t(`لم يُدخل إيراد ${it.shiftAr}`, `Revenue not entered — ${it.shiftAr}`)
                      : t(`${it.list.length} ${it.list.length === 1 ? 'رحلة لم تُدخل' : 'رحلات لم تُدخل'}`, `${it.list.length} trip${it.list.length === 1 ? '' : 's'} not entered`)}
                    {multi && <span style={{ color: 'var(--text-3)', fontWeight: 700 }}> · {stName(it.station)}</span>}
                  </div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 1 }}>
                    {dayLbl(it.day)}{isSales && <> · <bdi dir="ltr" style={{ fontFamily: MONO }}>{it.range}</bdi></>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {!isSales && <button type="button" onClick={() => setOpen(o => ({ ...o, [it.key]: !o[it.key] }))} aria-expanded={expanded} style={btn(false)}>{expanded ? t('إخفاء', 'Hide') : t('التفاصيل', 'Details')}</button>}
                  <button type="button" onClick={() => navigate(isSales ? '/sales' : '/transportation')} style={btn(false)}>{isSales ? t('إدخال الإيراد', 'Enter revenue') : t('فتح الترحيل', 'Open transport')}</button>
                  {a
                    ? <span title={stamp(a.ack_at)} style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--success)', background: 'var(--success-bg)', borderRadius: 4, padding: '4px 10px' }}>{t('علم', 'Acknowledged')}: {a.ack_by_name} · <bdi dir="ltr" style={{ fontFamily: MONO }}>{stamp(a.ack_at)}</bdi></span>
                    : <button type="button" disabled={busy === it.key} onClick={() => doAck(it)} style={btn(true)}>{busy === it.key ? '...' : t('علمت', 'Acknowledge')}</button>}
                </div>
              </div>
              {!isSales && expanded && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {it.list.map(e => (
                    <span key={e.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 700, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 9px', color: 'var(--text-2)' }}>
                      <bdi dir="ltr" style={{ fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)' }}>{e.time}</bdi>
                      <bdi dir="ltr" style={{ fontFamily: MONO }}>{e.tripNo}</bdi>
                      <span>{e.isArr ? t('وصول', 'Arr') : t('مغادرة', 'Dep')}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const btn = primary => ({
  border: primary ? 'none' : '1px solid var(--border-2)', background: primary ? 'var(--accent)' : 'var(--card)', color: primary ? '#fff' : 'var(--text-2)',
  borderRadius: 6, padding: '6px 13px', fontSize: '0.72rem', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', minHeight: 32,
})

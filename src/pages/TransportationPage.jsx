import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached } from '../lib/pageCache'
import { TRIP_STATUSES } from '../utils/constants'
import { toLatinDigits, cleanNumber } from '../utils/digits'
import DatePicker from '../components/shared/DatePicker'
import TimeInput24 from '../components/shared/TimeInput24'
import SearchSelect from '../components/shared/SearchSelect'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import ScheduleUploadModal from '../components/transportation/ScheduleUploadModal'
import { useEscapeKey } from '../hooks/useEscapeKey'
import StationTripsModal from '../components/transportation/StationTripsModal'
import ExtraTripModal from '../components/transportation/ExtraTripModal'
import QRScannerModal from '../components/shared/QRScannerModal'
import NewTripModal from '../components/transportation/NewTripModal'
import { applyDueSchedules } from '../utils/importSchedule'

/* ─── helpers ────────────────────────────────────────────── */
import { todayStr } from '../utils/dates'
import { isRestStation } from '../utils/stations'

const accuracyColor = v => ({
  'On Time':    'text-green-600 font-semibold',
  'Early':      'text-blue-600 font-semibold',
  'Not On Time':'text-yellow-600',
  'Delayed':    'text-red-600 font-semibold',
}[v] ?? 'text-gray-400')

const accuracyAr = v => ({
  'On Time':    'في الوقت ✓',
  'Early':      'مبكر',
  'Not On Time':'غير منتظم',
  'Delayed':    'متأخر ⚠',
}[v] ?? '—')

// اتجاه الرحلة من رقمها: ذهاب (مغادرة) / عودة (وصول)
// NW05-O-… أو ينتهي بفردي = ذهاب · NW05-I-… أو ينتهي بزوجي = عودة
function tripDir(code) {
  const c = String(code || '').toUpperCase()
  if (/-I-|-I\d/.test(c)) return 'arrival'
  if (/-O-|-O\d/.test(c)) return 'departure'
  const m = c.match(/(\d+)\s*$/)
  if (m) return parseInt(m[1], 10) % 2 === 0 ? 'arrival' : 'departure'
  return 'departure'
}

const BUS_TYPE = {
  VIP:        { ar: 'VIP',        en: 'VIP',        style: { background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 600, borderRadius: 4 } },
  WHEELCHAIR: { ar: 'WHEELCHAIR', en: 'WHEELCHAIR', style: { background: 'var(--info-bg)',    color: 'var(--info)',    fontWeight: 600, borderRadius: 4 } },
  STANDARD:   { ar: 'STANDARD',  en: 'STANDARD',   style: { background: 'var(--surface-2)',  color: 'var(--text-2)',  fontWeight: 600, borderRadius: 4 } },
  QAID:       { ar: 'QAID',      en: 'QAID',       style: { background: 'var(--success-bg)', color: 'var(--success)', fontWeight: 600, borderRadius: 4 } },
}
const busTypeLookup = t => BUS_TYPE[String(t || '').toUpperCase()] ?? null

/* ─── Trip Entry Modal ──────────────────────────────────── */
const DRAFT_KEY = 'tm_draft'

function TripModal({ trip, record, stationId, stationName, stations = [], isArrival, schedTime, recordDate, onClose, onSaved }) {
  const { profile, isGeneralAdmin, isStationAdmin } = useAuth()
  const canPickStation = isGeneralAdmin || isStationAdmin
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  // استعادة مسودة محفوظة لو كانت تطابق هذه الرحلة
  const draft = (() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return null
      const d = JSON.parse(raw)
      if (d.tripKey !== trip._key) return null
      if (d.recordDate !== (recordDate || todayStr())) return null
      if (d.stationId !== stationId) return null
      return d
    } catch { return null }
  })()

  const [form, setForm] = useState(draft?.form ?? {
    bus_number:         record?.bus_number ?? '',
    actual_departure:   record?.actual_departure
      ? new Date(record.actual_departure).toISOString().slice(11, 16) : '',
    actual_arrival:     record?.actual_arrival
      ? new Date(record.actual_arrival).toISOString().slice(11, 16) : '',
    passenger_count:    record?.passenger_count ?? '',
    missed_count:       record?.missed_count ?? 0,
    operational_status: record?.operational_status ?? 'Normal',
    screen_works:       record?.screen_works     ?? true,
    wheelchair_works:   record?.wheelchair_works ?? true,
    toilet_works:       record?.toilet_works     ?? true,
    notes:              record?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // تذاكر المتخلفين
  const [missedTickets, setMissedTickets] = useState(draft?.missedTickets ?? record?.missed_tickets ?? [])
  const [ticketInput, setTicketInput]     = useState('')
  const [ticketStation, setTicketStation] = useState(trip?.from_station?.name_ar || trip?.from_station?.name_en || '')
  const [showTicketScanner, setShowTicketScanner] = useState(false)

  // مطابقة الكشف — يجب أن تكون قبل useEffect الذي يستخدمها
  const [manifestMatch, setManifestMatch] = useState(
    draft?.manifestMatch !== undefined ? draft.manifestMatch : (record?.manifest_match ?? null)
  )
  const [manifestTotal, setManifestTotal] = useState(draft?.manifestTotal ?? record?.manifest_total ?? '')

  // حفظ المسودة عند كل تغيير
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        tripKey: trip._key, isArrival, stationId,
        recordDate: recordDate || todayStr(),
        form, missedTickets, manifestMatch, manifestTotal,
      }))
    } catch {}
  }, [form, missedTickets, manifestMatch, manifestTotal])

  function clearDraft() { sessionStorage.removeItem(DRAFT_KEY) }
  function closeAndClear() { clearDraft(); onClose() }
  useEscapeKey(closeAndClear)

  function addTicket(numOverride) {
    const t = (numOverride ?? ticketInput).trim()
    if (!t) return
    if (missedTickets.some(m => m.ticket === t)) return // تجنب التكرار
    setMissedTickets(prev => [...prev, { ticket: t, station: ticketStation }])
    if (!numOverride) setTicketInput('')
  }
  function removeTicket(i) {
    setMissedTickets(prev => prev.filter((_, idx) => idx !== i))
  }
  function handleTicketScan(ticketNum) {
    addTicket(ticketNum)
  }

  // الفرق المحسوب: من أصل − الركاب = المتخلفين المتوقعين
  const expectedMissed = (() => {
    if (manifestMatch !== false) return null
    const total = Number(manifestTotal)
    const pax   = Number(form.passenger_count)
    if (!manifestTotal || isNaN(total) || isNaN(pax) || form.passenger_count === '') return null
    return total - pax
  })()

  // الوقت المجدول والفعلي حسب النوع (وصول/مغادرة)
  const schedDep = schedTime || (isArrival ? trip.scheduled_arrival : trip.scheduled_departure)?.slice(0, 5) || ''
  const actualKey = isArrival ? 'actual_arrival' : 'actual_departure'

  // Live accuracy preview
  const accuracyPreview = () => {
    if (!form[actualKey] || !schedDep) return null
    const [sh, sm] = schedDep.split(':').map(Number)
    const [ah, am] = form[actualKey].split(':').map(Number)
    let diff = (ah * 60 + am) - (sh * 60 + sm)
    if (diff < -120) diff += 1440 // تجاوز منتصف الليل
    if (diff < -2) return <span className="text-blue-500">{isAr ? 'مبكر' : 'Early'} ({Math.abs(diff)} {isAr ? 'د' : 'min'})</span>
    if (diff <= 5)  return <span className="text-green-500">{isAr ? 'في الوقت ✓' : 'On Time ✓'}</span>
    if (diff <= 15) return <span className="text-yellow-500">{isAr ? 'غير منتظم' : 'Not On Time'} (+{diff} {isAr ? 'د' : 'min'})</span>
    return <span className="text-red-500">{isAr ? 'متأخر ⚠' : 'Delayed ⚠'} (+{diff} {isAr ? 'د' : 'min'})</span>
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    if (!form.bus_number?.trim()) {
      setError(isAr ? 'يرجى إدخال رقم الحافلة' : 'Bus number is required')
      return
    }
    if (!form[actualKey]) {
      setError(isAr
        ? (isArrival ? 'يرجى إدخال وقت الوصول الفعلي' : 'يرجى إدخال وقت المغادرة الفعلي')
        : (isArrival ? 'Actual arrival time is required' : 'Actual departure time is required'))
      return
    }
    if (form.passenger_count === '' || form.passenger_count === null || form.passenger_count === undefined) {
      setError(isAr ? 'يرجى إدخال عدد الركاب (يمكن أن يكون 0)' : 'Passenger count is required (can be 0)')
      return
    }

    // التحقق من تطابق عدد التذاكر مع الفرق المحسوب (المغادرة فقط)
    if (!isArrival && manifestMatch === false && expectedMissed !== null) {
      if (expectedMissed < 0) {
        setError(isAr
          ? `عدد الركاب (${Number(form.passenger_count)}) أكبر من الكشف (${manifestTotal}) — تحقق من الأرقام`
          : `Passenger count exceeds manifest total — check the numbers`)
        return
      }
      if (missedTickets.length < expectedMissed) {
        setError(isAr
          ? `تذاكر المتخلفين غير مكتملة — المطلوب ${expectedMissed} وتم إدخال ${missedTickets.length}`
          : `Missed tickets incomplete — expected ${expectedMissed}, entered ${missedTickets.length}`)
        return
      }
      if (missedTickets.length > expectedMissed) {
        setError(isAr
          ? `تذاكر المتخلفين أكثر من المتوقع — المتوقع ${expectedMissed} وتم إدخال ${missedTickets.length}`
          : `More missed tickets than expected — expected ${expectedMissed}, entered ${missedTickets.length}`)
        return
      }
    }

    setSaving(true)

    const dateStr = recordDate || todayStr()
    const ts = v => v ? `${dateStr}T${v}:00` : null

    const base = {
      trip_schedule_id:   trip.id,
      record_date:        dateStr,
      station_id:         stationId,
      is_arrival:         !!isArrival,
      bus_number:         form.bus_number || null,
      passenger_count:    Number(form.passenger_count),
      manifest_match:     manifestMatch,
      manifest_total:     manifestMatch === false && manifestTotal ? Number(manifestTotal) : null,
      screen_works:       form.screen_works,
      wheelchair_works:   form.wheelchair_works,
      toilet_works:       form.toilet_works,
      operational_status: form.operational_status,
      is_extra_trip:      !!trip.is_extra,
      missed_count:       isArrival ? 0 : missedTickets.length,
      missed_tickets:     isArrival ? [] : missedTickets,
      notes:              form.notes || null,
      created_by:         profile.id,
      created_by_name:    profile.full_name_ar,
    }

    // وقت المغادرة أو الوصول حسب النوع
    if (isArrival) base.actual_arrival = ts(form.actual_arrival)
    else           base.actual_departure = ts(form.actual_departure)

    let res
    if (record) {
      // قفل متفائل: لا تكتب إلا إذا لم يتغيّر الصف منذ فتحه (يمنع الكتابة فوق تعديل مستخدم آخر)
      let q = supabase.from('trip_records').update({
        ...base,
        updated_by:      profile.id,
        updated_by_name: profile.full_name_ar,
        updated_at:      new Date().toISOString(),
      }).eq('id', record.id)
      q = record.updated_at ? q.eq('updated_at', record.updated_at) : q.is('updated_at', null)
      res = await q.select('id')
      if (!res.error && (!res.data || res.data.length === 0)) {
        setError(isAr
          ? '⚠ عُدّل هذا السجل من مستخدم آخر للتو. حدّث الصفحة وأعد الإدخال حتى لا تُمحى بياناته.'
          : '⚠ This record was just changed by another user. Refresh and re-enter to avoid overwriting.')
        setSaving(false)
        return
      }
    } else {
      res = await supabase.from('trip_records').upsert(base, {
        onConflict: 'trip_schedule_id,record_date,station_id,is_arrival',
        ignoreDuplicates: false,
      })
    }

    if (res.error) setError(res.error.message)
    else { clearDraft(); onSaved(); onClose() }
    setSaving(false)
  }

  const S = {
    input: {
      width: '100%', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 12px', fontSize: '0.875rem', background: 'var(--surface)',
      color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit',
      transition: 'border-color 0.14s', boxSizing: 'border-box',
    },
    label: { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 5, letterSpacing: '0.04em' },
  }

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px 16px 80px' }} dir={isAr ? 'rtl' : 'ltr'}>
      <div style={{ background:'var(--card)', borderRadius:16, boxShadow:'var(--shadow-xl)', width:'100%', maxWidth:520, maxHeight:'calc(100vh - 112px)', overflowY:'auto', border:'1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background: isArrival ? 'var(--brand-700)' : 'var(--brand-900)', borderRadius:'16px 16px 0 0' }}>
          <div>
            <p style={{ margin:0, fontWeight:700, color:'#fff', fontSize:'0.875rem', letterSpacing:'0.02em' }}>{trip.trip_number}{trip.trip_name ? ` — ${trip.trip_name}` : ''}</p>
            <p style={{ margin:'3px 0 0', fontSize:'0.72rem', color:'rgba(255,255,255,0.6)' }}>
              {isAr ? trip.from_station?.name_ar : trip.from_station?.name_en}
              {' → '}
              {isAr ? trip.to_station?.name_ar : trip.to_station?.name_en}
            </p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
            <span style={{ fontSize:'0.7rem', borderRadius:20, padding:'3px 10px', fontWeight:700, background: isArrival ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)', color: isArrival ? '#34D399' : '#FBBF24' }}>
              {isArrival ? (isAr ? 'وصول' : 'Arrival') : (isAr ? 'مغادرة' : 'Departure')}
            </span>
            {trip.bus_type && busTypeLookup(trip.bus_type) && (
              <span style={{ fontSize:'0.65rem', borderRadius:4, padding:'2px 8px', ...busTypeLookup(trip.bus_type).style }}>
                {isAr ? busTypeLookup(trip.bus_type).ar : busTypeLookup(trip.bus_type).en}
              </span>
            )}
            <p style={{ margin:0, fontSize:'0.7rem', fontFamily:'monospace', color:'rgba(255,255,255,0.5)' }}>{schedDep} {isAr ? 'مجدول' : 'sched.'}</p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* Bus number */}
          <div>
            <label style={S.label}>{isAr ? 'رقم الحافلة *' : 'Bus Number *'}</label>
            <input
              inputMode="numeric" pattern="[0-9]*"
              style={S.input}
              value={form.bus_number} onChange={e => set('bus_number', toLatinDigits(e.target.value))}
              placeholder={isAr ? 'مثال: 4521' : 'e.g. 4521'}
              onFocus={e => e.target.style.borderColor='var(--accent)'}
              onBlur={e => e.target.style.borderColor='var(--border)'}
            />
          </div>

          {/* Actual time */}
          <div>
            <label style={S.label}>
              {isArrival ? (isAr ? 'وقت الوصول الفعلي *' : 'Actual Arrival *') : (isAr ? 'وقت المغادرة الفعلي *' : 'Actual Departure *')}
            </label>
            <TimeInput24 value={form[actualKey]} onChange={v => set(actualKey, v)} />
            {form[actualKey] && schedDep && (
              <p style={{ margin:'5px 0 0', fontSize:'0.72rem', color:'var(--text-3)' }}>
                {isAr ? 'المجدول:' : 'Scheduled:'} {schedDep} → {accuracyPreview()}
              </p>
            )}
          </div>

          {/* Passengers */}
          <div>
            <label style={S.label}>{isAr ? 'الركاب *' : 'Passengers *'}</label>
            <input type="text" inputMode="numeric" style={S.input} placeholder="0"
              value={form.passenger_count} onChange={e => set('passenger_count', cleanNumber(e.target.value))}
              onFocus={e => e.target.style.borderColor='var(--accent)'}
              onBlur={e => e.target.style.borderColor='var(--border)'}
            />
          </div>

          {/* تذاكر المتخلفين */}
          {!isArrival && <div>
            <label style={S.label}>
              {isAr ? 'تذاكر المتخلفين عن الرحلة' : 'Missed Passenger Tickets'}
              {' · '}
              {isAr ? 'العدد:' : 'Count:'} {missedTickets.length}
              {expectedMissed !== null && (
                <span style={{
                  marginRight: 8,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: expectedMissed < 0
                    ? 'var(--danger)'
                    : missedTickets.length === expectedMissed
                      ? 'var(--success)'
                      : 'var(--danger)',
                }}>
                  {expectedMissed < 0
                    ? (isAr ? ' ⚠ عدد الركاب يتجاوز الكشف' : ' ⚠ Exceeds manifest')
                    : missedTickets.length === expectedMissed
                      ? (isAr ? ` / ${expectedMissed} ✓` : ` / ${expectedMissed} ✓`)
                      : (isAr ? ` / ${expectedMissed} مطلوب` : ` / ${expectedMissed} required`)}
                </span>
              )}
            </label>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', minHeight:90 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'6px 12px', fontSize:'0.7rem', fontWeight:600, color:'var(--text-3)' }}>
                  <span>{isAr ? 'المحطة' : 'Station'}</span>
                  <span style={{ textAlign:'left' }}>{isAr ? 'رقم التذكرة' : 'Ticket #'}</span>
                </div>
                {missedTickets.length === 0 ? (
                  <p style={{ textAlign:'center', color:'var(--text-3)', fontSize:'0.75rem', padding:'14px 0' }}>{isAr ? 'لا يوجد متخلفون' : 'No missed passengers'}</p>
                ) : missedTickets.map((m, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:'6px 12px', fontSize:'0.75rem', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.station}</span>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontFamily:'monospace', color:'var(--text-1)' }}>{m.ticket}</span>
                      <button type="button" onClick={() => removeTicket(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.75rem', padding:'0 4px' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, width:176, flexShrink:0 }}>
                <select value={ticketStation} onChange={e => setTicketStation(e.target.value)}
                  style={{ ...S.input, padding:'7px 10px', fontSize:'0.75rem' }}>
                  {[trip?.from_station?.name_ar, trip?.from_station?.name_en, trip?.to_station?.name_ar, trip?.to_station?.name_en]
                    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
                    .map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{ display:'flex', gap:6 }}>
                  <input
                    value={ticketInput}
                    onChange={e => setTicketInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTicket())}
                    placeholder={isAr ? 'رقم التذكرة' : 'Ticket #'}
                    style={{ ...S.input, flex:1, minWidth:0, padding:'7px 10px', fontSize:'0.75rem', fontFamily:'monospace' }}
                    onFocus={e => e.target.style.borderColor='var(--accent)'}
                    onBlur={e => e.target.style.borderColor='var(--border)'}
                  />
                  <button type="button" onClick={() => addTicket()} disabled={!ticketInput.trim()}
                    title={isAr ? 'إضافة' : 'Add'}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'center',
                      width:34, flexShrink:0, borderRadius:8, border:'1px solid var(--border)',
                      background: ticketInput.trim() ? 'var(--accent)' : 'var(--surface)',
                      color: ticketInput.trim() ? '#fff' : 'var(--text-3)',
                      cursor: ticketInput.trim() ? 'pointer' : 'default',
                      transition:'all 0.14s',
                    }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
                    </svg>
                  </button>
                </div>
                {/* زر مسح QR */}
                <button type="button" onClick={() => setShowTicketScanner(true)}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    padding:'8px 10px', borderRadius:8, fontSize:'0.75rem', fontWeight:600,
                    cursor:'pointer', border:'2px dashed var(--border)',
                    background:'var(--surface)', color:'var(--text-2)',
                    transition:'all 0.14s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-2)' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                    <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2.2"/>
                  </svg>
                  {isAr ? 'مسح رقم التذكرة' : 'Scan Ticket'}
                </button>
                <p style={{ margin:0, fontSize:'0.65rem', color:'var(--text-3)' }}>{isAr ? 'اكتب أو امسح رقم التذكرة' : 'Type or scan ticket number'}</p>
              </div>
            </div>
          </div>}

          {/* ماسح التذاكر */}
          {showTicketScanner && (
            <QRScannerModal
              isAr={isAr}
              onScan={handleTicketScan}
              onClose={() => setShowTicketScanner(false)}
              expectedCount={expectedMissed !== null && expectedMissed >= 0 ? expectedMissed : null}
              initialCount={missedTickets.length}
              existingTickets={missedTickets.map(m => m.ticket)}
            />
          )}

          {/* مطابقة الكشف */}
          <div>
            <label style={S.label}>{isAr ? 'مطابقة الكشف' : 'Manifest Check'}</label>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => setManifestMatch(true)}
                style={{ flex:1, padding:'10px', borderRadius:8, fontSize:'0.875rem', fontWeight:600, cursor:'pointer', border:'2px solid', transition:'all 0.14s',
                  background: manifestMatch === true ? 'var(--success)' : 'var(--surface)',
                  borderColor: manifestMatch === true ? 'var(--success)' : 'var(--border)',
                  color: manifestMatch === true ? '#fff' : 'var(--text-2)' }}>
                ✓ {isAr ? 'مطابق الكشف' : 'Matches'}
              </button>
              <button type="button" onClick={() => setManifestMatch(false)}
                style={{ flex:1, padding:'10px', borderRadius:8, fontSize:'0.875rem', fontWeight:600, cursor:'pointer', border:'2px solid', transition:'all 0.14s',
                  background: manifestMatch === false ? 'var(--danger)' : 'var(--surface)',
                  borderColor: manifestMatch === false ? 'var(--danger)' : 'var(--border)',
                  color: manifestMatch === false ? '#fff' : 'var(--text-2)' }}>
                ✗ {isAr ? 'غير مطابق الكشف' : 'Mismatch'}
              </button>
            </div>
            {manifestMatch === false && (
              <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>{isAr ? 'من أصل' : 'Out of'}</span>
                  <input type="text" inputMode="numeric"
                    value={manifestTotal}
                    onChange={e => setManifestTotal(toLatinDigits(e.target.value).replace(/\D/g, ''))}
                    placeholder="0"
                    style={{ ...S.input, width:80, borderColor:'var(--danger)', fontFamily:'monospace', textAlign:'center' }}
                  />
                  {expectedMissed !== null && (
                    <span style={{
                      fontSize:'0.75rem', fontWeight:700,
                      color: expectedMissed < 0 ? 'var(--danger)' : 'var(--text-1)',
                    }}>
                      {expectedMissed < 0
                        ? (isAr ? `⚠ الركاب يتجاوز الكشف بـ ${Math.abs(expectedMissed)}` : `⚠ Pax exceeds manifest by ${Math.abs(expectedMissed)}`)
                        : !isArrival
                          ? (isAr ? `→ المتخلفون: ${expectedMissed}` : `→ Expected missed: ${expectedMissed}`)
                          : null}
                    </span>
                  )}
                </div>
                {!isArrival && expectedMissed !== null && expectedMissed >= 0 && (
                  <div style={{
                    padding:'6px 10px', borderRadius:6, fontSize:'0.72rem',
                    background: missedTickets.length === expectedMissed
                      ? 'rgba(var(--success-rgb,34,197,94),0.12)'
                      : 'rgba(var(--danger-rgb,239,68,68),0.12)',
                    color: missedTickets.length === expectedMissed ? 'var(--success)' : 'var(--danger)',
                    fontWeight: 600,
                  }}>
                    {missedTickets.length === expectedMissed
                      ? (isAr ? `✓ تم إدخال ${expectedMissed} تذكرة — مطابق` : `✓ ${expectedMissed} tickets entered — match`)
                      : missedTickets.length < expectedMissed
                        ? (isAr ? `⚠ ناقص ${expectedMissed - missedTickets.length} تذكرة (مدخل: ${missedTickets.length} / مطلوب: ${expectedMissed})` : `⚠ Missing ${expectedMissed - missedTickets.length} ticket(s) (entered: ${missedTickets.length} / required: ${expectedMissed})`)
                        : (isAr ? `⚠ زيادة ${missedTickets.length - expectedMissed} تذكرة (مدخل: ${missedTickets.length} / مطلوب: ${expectedMissed})` : `⚠ ${missedTickets.length - expectedMissed} extra ticket(s) (entered: ${missedTickets.length} / required: ${expectedMissed})`)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trip Status */}
          <div>
            <label style={S.label}>⚡ {isAr ? 'حالة الرحلة' : 'Trip Status'}</label>
            <select style={S.input}
              value={form.operational_status} onChange={e => set('operational_status', e.target.value)}>
              {TRIP_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{isAr ? s.ar : s.en}</option>
              ))}
            </select>
          </div>

          {/* Facilities status */}
          <div>
            <label style={S.label}>{isAr ? 'حالة التجهيزات' : 'Facilities'}</label>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                { k: 'screen_works',     label: isAr ? 'الشاشة' : 'Screen' },
                ...(/^4[01]/.test(form.bus_number || '') ? [] : [{ k: 'wheelchair_works', label: isAr ? '♿ ويل تشير' : 'Wheelchair' }]),
                { k: 'toilet_works',     label: isAr ? 'دورات المياه' : 'Toilets' },
              ].map(f => (
                <div key={f.k} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface)', borderRadius:8, padding:'8px 12px', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:'0.875rem', color:'var(--text-2)' }}>{f.label}</span>
                  <div style={{ display:'flex', gap:4 }}>
                    <button type="button" onClick={() => set(f.k, true)}
                      style={{ padding:'4px 12px', borderRadius:6, fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1px solid', transition:'all 0.14s',
                        background: form[f.k] ? 'var(--success)' : 'var(--card)', borderColor: form[f.k] ? 'var(--success)' : 'var(--border)', color: form[f.k] ? '#fff' : 'var(--text-3)' }}>
                      {isAr ? 'تعمل' : 'Works'}
                    </button>
                    <button type="button" onClick={() => set(f.k, false)}
                      style={{ padding:'4px 12px', borderRadius:6, fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1px solid', transition:'all 0.14s',
                        background: !form[f.k] ? 'var(--danger)' : 'var(--card)', borderColor: !form[f.k] ? 'var(--danger)' : 'var(--border)', color: !form[f.k] ? '#fff' : 'var(--text-3)' }}>
                      {isAr ? 'لا تعمل' : 'Faulty'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={S.label}>{isAr ? 'ملاحظات' : 'Notes'}</label>
            <textarea rows={2} style={{ ...S.input, resize:'none' }}
              value={form.notes} onChange={e => set('notes', e.target.value)}
              onFocus={e => e.target.style.borderColor='var(--accent)'}
              onBlur={e => e.target.style.borderColor='var(--border)'}
            />
          </div>

          {error && (
            <p style={{ margin:0, fontSize:'0.75rem', background:'var(--danger-bg)', color:'var(--danger)', borderRadius:8, padding:'8px 12px' }}>{error}</p>
          )}

          <p style={{ margin:0, fontSize:'0.7rem', color:'var(--text-3)', borderTop:'1px solid var(--border)', paddingTop:10 }}>
            ✍ {profile?.full_name_ar} · {new Date().toLocaleDateString('ar-SA-u-ca-gregory')} {new Date().toLocaleTimeString('ar-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>

          <div style={{ display:'flex', gap:8 }}>
            <button type="submit" disabled={saving}
              style={{ flex:1, color:'#fff', padding:'11px 0', borderRadius:8, fontSize:'0.875rem', fontWeight:700, border:'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, transition:'all 0.14s', background: isArrival ? 'var(--brand-700)' : 'var(--brand-900)' }}>
              {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
            </button>
            <button type="button" onClick={closeAndClear}
              style={{ padding:'11px 18px', borderRadius:8, fontSize:'0.875rem', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-2)', cursor:'pointer', transition:'all 0.14s' }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function TransportationPage() {
  const { profile, isGeneralAdmin, isStationAdmin, isAccountant, isAreaSupervisor, allowedStationIds } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const initialDate = todayStr()
  const initialStationId = profile?.station_id || null
  const initialTransportCacheKey = `transport_${initialStationId}_${initialDate}`
  const initialTransportCache = getCached(initialTransportCacheKey)

  const [date, setDate]       = useState(initialDate)
  const handleDateChange = d => { setDate(d); sessionStorage.setItem('tp_date', d) }
  const [trips, setTrips]     = useState(() => initialTransportCache?.trips ?? [])
  const [records, setRecords] = useState(() => initialTransportCache?.records ?? [])
  const [shipmentMap, setShipmentMap] = useState({}) // trip_schedule_id → shipments[]
  const [loading, setLoading] = useState(() => !initialStationId ? false : !initialTransportCache)
  const [modal, setModal]     = useState(null)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('departure') // 'departure' | 'arrival' | 'all'
  const [viewMode, setViewMode] = useState('station') // 'station' | 'schedule'
  const [scheduleData, setScheduleData] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(false)

  const [stations, setStations]           = useState([])
  const [selectedStation, setSelectedStation] = useState(profile?.station_id ?? '')
  const [showUpload, setShowUpload]       = useState(false)
  const [confirmRf,  setConfirmRf]        = useState(null)
  const [showSelect, setShowSelect]       = useState(false)
  const [hiddenCount, setHiddenCount]     = useState(0)  // رحلات المحطة الموقوفة كلياً أو أحد اتجاهيها

  // محطات مثبّتة — مخزّنة في Supabase لكل مستخدم
  const [pinnedIds, setPinnedIds] = useState([])
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('user_preferences').select('pinned_stations').eq('user_id', profile.id).single()
      .then(({ data }) => { if (data?.pinned_stations) setPinnedIds(data.pinned_stations) })
  }, [profile?.id])
  const savePins = async ids => {
    setPinnedIds(ids)
    if (!profile?.id) return
    await supabase.from('user_preferences').upsert({ user_id: profile.id, pinned_stations: ids, updated_at: new Date().toISOString() })
  }
  const togglePin = id => savePins(pinnedIds.includes(id) ? pinnedIds.filter(p => p !== id) : [...pinnedIds, id])
  const isPinned = id => pinnedIds.includes(id)

  // ترتيب المحطات: المثبّتة أولاً ثم الباقية أبجدياً
  const sortedStations = [
    ...stations.filter(s => pinnedIds.includes(s.id)),
    ...stations.filter(s => !pinnedIds.includes(s.id)),
  ]
  const [showExtra, setShowExtra]         = useState(false)
  const [showNewTrip, setShowNewTrip]     = useState(false)


  // الأدمن/المحاسب يتنقّلون بين كل المحطات؛ المشرف بين محطاته المعيّنة فقط
  const stationId = selectedStation || null

  // جلب المحطات: الأدمن يرى الكل؛ مشرف المنطقة محطاته؛ المشرف والمحاسب محطاتهم فقط
  useEffect(() => {
    if (isGeneralAdmin) {
      supabase.from('stations').select('id, name_ar, name_en, city_group').eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data.filter(s => !isRestStation(s))) })
    } else if (isAreaSupervisor && allowedStationIds?.length) {
      supabase.from('stations').select('id, name_ar, name_en, city_group').in('id', allowedStationIds).eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data.filter(s => !isRestStation(s))) })
    } else if ((isStationAdmin || isAccountant) && profile?.id) {
      supabase.from('user_stations').select('station:station_id(id, name_ar, name_en)').eq('user_id', profile.id)
        .then(({ data }) => {
          let sts = (data ?? []).map(r => r.station).filter(Boolean).filter(s => !isRestStation(s))
          if (sts.length === 0 && profile?.station) sts = [profile.station]
          setStations(sts)
        })
    }
  }, [isGeneralAdmin, isAccountant, isStationAdmin, isAreaSupervisor, allowedStationIds, profile?.id])

  // اختيار محطة افتراضية
  useEffect(() => {
    if (selectedStation) return
    if (stations.length) setSelectedStation(stations[0].id)
    else if (profile?.station_id) setSelectedStation(profile.station_id)
  }, [stations, profile])

  const fetchData = useCallback(async () => {
    if (!stationId) {
      setTrips([]); setRecords([]); setLoading(false)
      return
    }
    const cacheKey = `transport_${stationId}_${date}`
    const cached = getCached(cacheKey)
    if (cached) { setTrips(cached.trips); setRecords(cached.records); setLoading(false) } else { setLoading(true) }

    const tripFields = `
      id, trip_number, trip_name, scheduled_departure, scheduled_arrival, bus_type, is_active, is_rf, rf_date,
      from_station_id, to_station_id,
      from_station:from_station_id(id, name_ar, name_en, city_group),
      to_station:to_station_id(id, name_ar, name_en, city_group)
    `

    const [
      { data: chosen },
      { data: stopRows },
      { data: recs },
      { data: crossRecs },
      { data: shipmentRows },
    ] = await Promise.all([
      supabase.from('station_trips')
        .select(`departure_time, arrival_time, is_extra, dep_enabled, arr_enabled, departure_station:departure_station_id(id, name_ar, name_en), trip:trip_schedule_id(${tripFields})`)
        .eq('station_id', stationId),

      supabase.from('trip_schedule_stops')
        .select('trip_schedule_id, arrival_time, departure_time')
        .eq('station_id', stationId),

      supabase.from('trip_records')
        .select('*')
        .eq('record_date', date)
        .eq('station_id', stationId),

      // سجلات المغادرة من محطات أخرى لنفس الرحلات (لعرض الوقت الفعلي للوصول)
      supabase.from('trip_records')
        .select('trip_schedule_id, actual_departure, station_id')
        .eq('record_date', date)
        .neq('station_id', stationId)
        .not('actual_departure', 'is', null),

      // ارساليات معتمدة مرتبطة برحلات اليوم
      supabase.from('shipments')
        .select('trip_schedule_id, shipment_number, status, from_st:from_station_id(name_ar), to_st:to_station_id(name_ar)')
        .eq('record_date', date)
        .in('status', ['approved', 'in_transit']),
    ])

    // خريطة المغادرة الفعلية من محطات أخرى: tripId → actual_departure
    const crossDepMap = {}
    ;(crossRecs ?? []).forEach(r => { crossDepMap[r.trip_schedule_id] = r.actual_departure })

    const stopMap = {}
    ;(stopRows ?? []).forEach(s => { stopMap[s.trip_schedule_id] = { arrival: s.arrival_time, departure: s.departure_time } })

    const sMap = {}
    ;(shipmentRows ?? []).forEach(s => {
      if (!sMap[s.trip_schedule_id]) sMap[s.trip_schedule_id] = []
      sMap[s.trip_schedule_id].push(s)
    })
    setShipmentMap(sMap)
    const stationObj = stations.find(s => s.id === stationId) || profile?.station || { id: stationId }
    const s5 = t => t ? String(t).slice(0, 5) : ''

    const entries = []
    ;(chosen ?? []).forEach(r => {
      const tr = r.trip
      if (!tr || !tr.is_active) return
      if (tr.is_rf && tr.rf_date !== date) return            // رحلة إضافية تظهر في تاريخها فقط
      const isDest   = tr.to_station?.id === stationId   || tr.to_station_id   === stationId
      const isOrigin = tr.from_station?.id === stationId || tr.from_station_id === stationId
      const stop     = stopMap[tr.id]                          // المحطة محطة عبور
      const base = { ...tr, is_extra: !!r.is_extra, is_rf: !!tr.is_rf }
      const arrOn = r.arr_enabled !== false   // وصول مفعّل؟
      const depOn = r.dep_enabled !== false   // مغادرة مفعّلة؟

      // الوقتان: وقت الجدول (من trip_schedule_stops) يُقدَّم على وقت station_trips إلا إذا كان station_trips مختلفاً (تعديل يدوي)
      const arrT = r.arrival_time || ''
      const depT = r.departure_time || ''
      const crossDep = crossDepMap[tr.id]
      const addArr = (toStation, time) => arrOn && time && entries.push({ ...base, role: 'arrival', ...(toStation ? { to_station: toStation } : {}), schedTime: s5(time), _key: tr.id + '-a', crossActualDep: crossDep ?? null })
      const addDep = (fromStation, time) => depOn && time && entries.push({ ...base, role: 'departure', ...(fromStation ? { from_station: fromStation } : {}), schedTime: s5(time), _key: tr.id + '-d' })

      const toId   = tr.to_station?.id   || tr.to_station_id
      const fromId = tr.from_station?.id || tr.from_station_id

      // فلترة رحلات داخل نفس المدينة
      // city_group (من DB إن وُجد) أو أول كلمة من name_en كـ fallback
      const groupOf = st => {
        if (!st) return null
        if (st.city_group) return st.city_group
        const w = (st.name_en || '').split(/[\s-]+/)[0].toLowerCase()
        return w || null
      }
      // استخدم بيانات الرحلة المُدمجة مباشرة أولاً ثم stations كـ fallback
      const stFrom = tr.from_station || stations.find(s => s.id === fromId)
      const stTo   = tr.to_station   || stations.find(s => s.id === toId)
      const currentGroup = groupOf(stationObj)
      const fromGroup    = groupOf(stFrom)
      const toGroup      = groupOf(stTo)

      if (isDest) {
        addArr(stationObj, arrT || tr.scheduled_arrival)
      } else if (isOrigin) {
        addDep(r.departure_station || tr.from_station, depT || tr.scheduled_departure)
      } else if (stop) {
        // محطة عبور — فلترة مستقلة لكل اتجاه:
        // وصول: لا يظهر إذا كانت نقطة الانطلاق في نفس مدينة المحطة الحالية
        // مغادرة: لا تظهر إذا كانت الوجهة في نفس مدينة المحطة الحالية
        const sameFrom = currentGroup && fromGroup && currentGroup === fromGroup
        const sameTo   = currentGroup && toGroup   && currentGroup === toGroup
        if (!sameFrom) addArr(stationObj, stop.arrival  || arrT)
        if (!sameTo)   addDep(stationObj, stop.departure || depT)
      } else {
        // لا يوجد سجل توقف → فقط إذا كان الوقت محدداً يدوياً
        if (!(currentGroup && fromGroup && currentGroup === fromGroup)) addArr(stationObj, arrT)
        if (!(currentGroup && toGroup   && currentGroup === toGroup))   addDep(stationObj, depT)
      }
    })
    entries.sort((a, b) => (a.schedTime || '').localeCompare(b.schedTime || ''))

    // عدد الرحلات المخفية (كلياً أو أحد اتجاهيها) — لتنبيه الأدمن
    setHiddenCount((chosen ?? []).filter(r =>
      r.trip && r.trip.is_active && (!r.trip.is_rf || r.trip.rf_date === date) &&
      (r.dep_enabled === false || r.arr_enabled === false)
    ).length)

    const finalRecords = recs ?? []
    if (entries.length || finalRecords.length) setCached(cacheKey, { trips: entries, records: finalRecords })
    setTrips(entries)
    setRecords(finalRecords)
    setLoading(false)
  }, [date, stationId, stations, profile])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true)

    const [{ data: allTrips }, { data: allRecords }] = await Promise.all([
      supabase.from('station_trips')
        .select(`
          station_id,
          departure_time,
          dep_enabled,
          trip:trip_schedule_id(
            id, trip_number, trip_name, scheduled_departure, scheduled_arrival,
            from_station:from_station_id(id, name_ar, name_en),
            to_station:to_station_id(id, name_ar, name_en)
          )
        `)
        .eq('dep_enabled', true),

      supabase.from('trip_records')
        .select('trip_schedule_id, actual_departure, is_cancelled, station_id, bus_number, passenger_count')
        .eq('record_date', date)
        .eq('is_arrival', false),
    ])

    const recMap = {}
    ;(allRecords ?? []).forEach(r => { recMap[r.trip_schedule_id] = r })

    const seen = new Set()
    const entries = []
    ;(allTrips ?? []).forEach(st => {
      const tr = st.trip
      if (!tr || !tr.id) return
      if (seen.has(tr.id)) return
      seen.add(tr.id)
      const rec = recMap[tr.id]
      const schedTime = (st.departure_time || tr.scheduled_departure || '').slice(0, 5)
      entries.push({
        id: tr.id,
        trip_number: tr.trip_number,
        trip_name: tr.trip_name,
        from_station: tr.from_station,
        to_station: tr.to_station,
        schedTime,
        rec,
        status: rec?.actual_departure ? 'departed' : 'scheduled',
        actual_departure: rec?.actual_departure ? new Date(rec.actual_departure).toISOString().slice(11, 16) : null,
        bus_number: rec?.bus_number,
        passenger_count: rec?.passenger_count,
      })
    })
    entries.sort((a, b) => (a.schedTime || '').localeCompare(b.schedTime || ''))
    setScheduleData(entries)
    setScheduleLoading(false)
  }, [date])

  useEffect(() => { if (viewMode === 'schedule') fetchSchedule() }, [viewMode, fetchSchedule])

  // Real-time sync — تحديث فوري عند أي تغيير من أي جهاز
  useEffect(() => {
    if (!stationId) return
    const channel = supabase.channel(`transport_${stationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_records' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_trips', filter: `station_id=eq.${stationId}` }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [stationId, fetchData])

  // Real-time sync للجدول الشامل
  useEffect(() => {
    if (viewMode !== 'schedule') return
    const ch = supabase.channel('global_schedule_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_records' }, () => fetchSchedule())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [viewMode, fetchSchedule])

  // عند بداية يوم جديد: تحديث ناعم للبيانات بدون إعادة تحميل الصفحة
  // (window.location.reload كان يغلق المودال المفتوح عند منتصف الليل أو العودة من الخلفية)
  const todayRef = useRef(todayStr())
  useEffect(() => {
    const id = setInterval(() => {
      const now = todayStr()
      if (now !== todayRef.current) {
        todayRef.current = now
        sessionStorage.removeItem('tp_date')
        setDate(now)   // تحديث التاريخ — يُشغّل إعادة جلب البيانات تلقائياً
      }
    }, 30000)
    return () => clearInterval(id)
  }, [])

  // استعادة المودال تلقائياً بعد إعادة التحميل (iOS tab discard)
  const draftRestoredRef = useRef(false)
  useEffect(() => {
    if (draftRestoredRef.current || loading || !trips.length) return
    draftRestoredRef.current = true
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.stationId !== stationId || draft.recordDate !== date) return
      const matchedTrip = trips.find(t => t._key === draft.tripKey)
      if (!matchedTrip) return
      const matchedRecord = records.find(r =>
        r.trip_schedule_id === matchedTrip.id && r.is_arrival === draft.isArrival
      ) ?? null
      setModal({ trip: matchedTrip, record: matchedRecord, isArrival: draft.isArrival, schedTime: matchedTrip.schedTime })
    } catch {}
  }, [loading, trips])

  // إخفاء (تعليق) اتجاه واحد من الرحلة (مغادرة أو وصول) — للأدمن
  async function suspendStationTrip(tripId, role) {
    const patch = role === 'arrival' ? { arr_enabled: false } : { dep_enabled: false }
    const { error } = await supabase.from('station_trips').update(patch)
      .eq('station_id', stationId).eq('trip_schedule_id', tripId)
    if (error) { alert((isAr ? 'فشل: ' : 'Failed: ') + error.message); return }
    fetchData()
  }

  // حذف رحلة إضافية (RF) نهائياً — للمشرف والأدمن
  async function deleteRfTrip(tripId) {
    setConfirmRf(tripId)
  }
  async function doDeleteRfTrip(tripId) {
    setConfirmRf(null)
    try {
      await supabase.from('trip_records').delete().eq('trip_schedule_id', tripId)
      await supabase.from('station_trips').delete().eq('trip_schedule_id', tripId)
      await supabase.from('trip_schedule_stops').delete().eq('trip_schedule_id', tripId)
      const { error } = await supabase.from('trip_schedule').delete().eq('id', tripId)
      if (error) throw error
      fetchData()
    } catch (err) {
      alert((isAr ? 'فشل الحذف: ' : 'Delete failed: ') + (err.message || ''))
    }
  }

  // تطبيق أي جدول مستقبلي حان موعده (للأدمن فقط، مرة عند الفتح)
  useEffect(() => {
    if (!isGeneralAdmin || !profile?.id) return
    applyDueSchedules(profile).then(n => { if (n > 0) fetchData() }).catch(() => {})
  }, [isGeneralAdmin, profile?.id])

  const recordMap = {}
  records.forEach(r => {
    const key = `${r.trip_schedule_id}|${r.is_arrival ? 'arrival' : 'departure'}`
    recordMap[key] = r
  })

  // Filter & search
  const filtered = trips.filter(t => {
    if (filter !== 'all' && t.role !== filter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.trip_number?.toLowerCase().includes(q) ||
      t.trip_name?.toLowerCase().includes(q) ||
      t.trip_name?.includes(q) ||
      t.to_station?.name_ar?.includes(q) ||
      t.to_station?.name_en?.toLowerCase().includes(q) ||
      recordMap[`${t.id}|${t.role === 'arrival' ? 'arrival' : 'departure'}`]?.bus_number?.includes(q)
    )
  })

  // Stats
  const total        = trips.length
  const departureCnt = trips.filter(t => t.role === 'departure').length
  const arrivalCnt   = trips.filter(t => t.role === 'arrival').length
  const entered      = Object.keys(recordMap).length
  const onTime       = records.filter(r => r.departure_accuracy === 'On Time').length
  const delayed      = records.filter(r => r.departure_accuracy === 'Delayed').length
  const cancelled    = records.filter(r => r.is_cancelled).length
  const extra        = records.filter(r => r.is_extra_trip).length
  const enteredPct   = total > 0 ? Math.round((entered / total) * 100) : 0

  // المحاسب الصرف لا يُدخل ترحيلاً — لكن المشرف/الأدمن الذي يحمل صفة محاسب إضافية يُدخل عادي
  const canEdit = isGeneralAdmin || isStationAdmin || !isAccountant

  const selectedStationName = stations.find(s => s.id === selectedStation)
    ? (isAr
        ? stations.find(s => s.id === selectedStation)?.name_ar
        : stations.find(s => s.id === selectedStation)?.name_en)
    : (isAr ? 'اختر محطة' : 'Select station')

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-nwbus-primary">
            {isAr ? 'الترحيل' : 'Transportation'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {profile?.station ? (isAr ? profile.station.name_ar : profile.station.name_en) : selectedStationName}
          </p>
        </div>

        {/* شريط المحطات المثبّتة — فوق صف الأزرار لمنع التحريك */}
        {pinnedIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pinnedIds.map(id => {
              const st = stations.find(s => s.id === id)
              if (!st) return null
              const isActive = selectedStation === id
              return (
                <button key={id} onClick={() => setSelectedStation(id)}
                  className={`h-9 flex items-center rounded-lg px-3.5 text-xs font-semibold border transition-colors ${
                    isActive
                      ? 'bg-nwbus-primary text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}>
                  {isAr ? st.name_ar : st.name_en}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          {/* Upload schedule — admin only */}
          {isGeneralAdmin && (
            <button onClick={() => setShowUpload(true)}
              className="h-9 flex items-center bg-nwbus-primary text-white rounded-lg px-3.5 text-xs font-semibold hover:opacity-90">
              {isAr ? 'رفع جدول الرحلات' : 'Upload Schedule'}
            </button>
          )}
          {/* New permanent trip — admin only */}
          {isGeneralAdmin && (
            <button onClick={() => setShowNewTrip(true)}
              className="h-9 flex items-center bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 text-xs font-semibold hover:border-gray-400 transition-colors">
              {isAr ? 'رحلة جديدة' : 'New Trip'}
            </button>
          )}
          {/* Select station trips — supervisor & admin */}
          {isGeneralAdmin && stationId && (
            <button onClick={() => setShowSelect(true)}
              className="h-9 flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 text-xs font-semibold hover:border-gray-400 transition-colors">
              {isAr ? 'تفعيل رحلات المحطة' : 'Activate Trips'}
              {hiddenCount > 0 && (
                <span title={isAr ? 'رحلات مخفية كلياً أو أحد اتجاهيها' : 'Trips hidden fully or one direction'}
                  className="min-w-[18px] h-[18px] grid place-items-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
                  {hiddenCount}
                </span>
              )}
            </button>
          )}
          {/* Add extra trip (RF) — supervisor & admin */}
          {(isGeneralAdmin || isStationAdmin) && (
            <button onClick={() => setShowExtra(true)}
              className="h-9 flex items-center bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 text-xs font-semibold hover:border-gray-400 transition-colors">
              {isAr ? 'رحلة إضافية (RF)' : 'Extra Trip (RF)'}
            </button>
          )}
          {/* Station selector — admin/accountant always, supervisor when multi-station */}
          {(isGeneralAdmin || ((isStationAdmin || isAccountant) && stations.length > 1)) && stations.length > 0 && (
            <div className="flex items-center gap-1">
              <SearchSelect isAr={isAr} value={selectedStation} onChange={setSelectedStation}
                placeholder={isAr ? '— اختر محطة —' : '— Select station —'}
                className="h-9 flex items-center border border-gray-300 rounded-lg px-3 text-xs bg-white min-w-[180px]"
                options={sortedStations.map(s => ({
                  value: s.id,
                  label: isAr ? s.name_ar : s.name_en
                }))} />
              {selectedStation && (
                <button
                  onClick={() => togglePin(selectedStation)}
                  title={isPinned(selectedStation) ? (isAr ? 'إلغاء التثبيت' : 'Unpin') : (isAr ? 'تثبيت المحطة' : 'Pin station')}
                  className={`h-9 w-9 grid place-items-center rounded-lg border transition-colors ${
                    isPinned(selectedStation)
                      ? 'bg-amber-50 border-amber-300 text-amber-600'
                      : 'bg-white border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
                  }`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76V7a1 1 0 011-1h4a1 1 0 011 1v3.76a2 2 0 00.59 1.42l1.82 1.82a1 1 0 01-.71 1.7H7.3a1 1 0 01-.71-1.7l1.82-1.82A2 2 0 009 10.76z"/></svg>
                </button>
              )}
            </div>
          )}
          <DatePicker value={date} onChange={handleDateChange} isAr={isAr}
            className="h-9 border border-gray-300 rounded-lg px-3 text-xs bg-white min-w-[150px]"
          />
        </div>
      </div>


      {/* شريط الحالة التشغيلية — سطر واحد مسطّح */}
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <div className="flex flex-wrap">
          {[
            { label: isAr ? 'إجمالي الرحلات' : 'Total',   val: total },
            { label: isAr ? 'مُدخلة' : 'Entered',          val: `${entered} / ${total}`, sub: `${enteredPct}%` },
            { label: isAr ? 'في الوقت' : 'On Time',        val: onTime,   tone: onTime > 0 ? 'text-green-700' : '' },
            { label: isAr ? 'متأخرة' : 'Delayed',          val: delayed,  tone: delayed > 0 ? 'text-red-600' : '' },
            { label: isAr ? 'مغادرة' : 'Departures',       val: departureCnt },
            { label: isAr ? 'وصول' : 'Arrivals',            val: arrivalCnt },
          ].map((s, i) => (
            <div key={s.label} className={`flex-1 min-w-[100px] px-4 py-2.5 text-center ${i > 0 ? 'border-s border-gray-200' : ''}`}>
              <div className={`text-base font-bold font-mono leading-tight ${s.tone || 'text-gray-800'}`}>
                {s.val}{s.sub && <span className="text-[10px] text-gray-400 font-normal ms-1">({s.sub})</span>}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        {total > 0 && (
          <div className="h-1 bg-gray-100">
            <div className="h-full transition-all duration-700" style={{ width: `${enteredPct}%`, background: 'var(--accent)' }} />
          </div>
        )}
      </div>

      {/* تبديل العرض: المحطة / الجدول الشامل */}
      <div className="flex border border-gray-300 rounded-md overflow-hidden shrink-0 mb-3 w-fit">
        <button onClick={() => setViewMode('station')}
          className={`px-4 py-2 text-xs font-semibold transition-colors border-e border-gray-300 ${viewMode === 'station' ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {isAr ? 'المحطة' : 'Station'}
        </button>
        <button onClick={() => setViewMode('schedule')}
          className={`px-4 py-2 text-xs font-semibold transition-colors ${viewMode === 'schedule' ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {isAr ? 'الجدول الشامل' : 'Schedule'}
        </button>
      </div>

      {viewMode === 'station' && (
      <>
      {/* شريط الأدوات: تصفية + بحث */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex border border-gray-300 rounded-md overflow-hidden shrink-0">
          {[
            { val: 'departure', label: isAr ? 'مغادرة' : 'Departures', cnt: departureCnt },
            { val: 'arrival',   label: isAr ? 'وصول' : 'Arrivals',     cnt: arrivalCnt },
            { val: 'all',       label: isAr ? 'الكل' : 'All',          cnt: total },
          ].map((t, i) => (
            <button key={t.val} onClick={() => setFilter(t.val)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors ${i > 0 ? 'border-s border-gray-300' : ''} ${
                filter === t.val ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {t.label}
              <span className={`font-mono text-[10px] ${filter === t.val ? 'opacity-75' : 'text-gray-400'}`}>{t.cnt}</span>
            </button>
          ))}
        </div>
        <input type="text"
          placeholder={isAr ? 'بحث برقم الرحلة أو الاسم أو رقم الحافلة…' : 'Search by trip #, name or bus #…'}
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none"
        />
      </div>

      {/* جدول الرحلات */}
      {loading ? (
        <p className="text-center py-20 text-gray-400 text-sm">{isAr ? 'جارٍ تحميل الرحلات…' : 'Loading trips…'}</p>
      ) : !stationId ? (
        <p className="text-center py-20 text-gray-400 text-sm">{isAr ? 'اختر محطة لعرض رحلاتها' : 'Select a station to view trips'}</p>
      ) : trips.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">{isAr ? 'لا توجد رحلات مسجلة لهذه المحطة' : 'No trips found for this station'}</p>
          <p className="text-xs mt-1 text-gray-300">
            {isAr ? 'يمكن للأدمن العام إضافة رحلات من صفحة إدارة الرحلات' : 'General admin can add trips from trip management'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-16 text-gray-400 text-sm">{isAr ? 'لا نتائج للبحث' : 'No results found'}</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider border-b border-gray-200">
                <th className="px-3 py-2 text-center w-16 font-semibold">{isAr ? 'الوقت' : 'Time'}</th>
                <th className="px-2 py-2 text-center w-16 font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                <th className="px-3 py-2 text-start font-semibold">{isAr ? 'الرحلة' : 'Trip'}</th>
                <th className="px-3 py-2 text-start font-semibold hidden md:table-cell">{isAr ? 'الخط' : 'Route'}</th>
                <th className="px-3 py-2 text-start font-semibold hidden lg:table-cell">{isAr ? 'التنفيذ' : 'Execution'}</th>
                <th className="px-3 py-2 w-36"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(trip => {
                const isArrival   = trip.role === 'arrival'
                const rec         = recordMap[`${trip.id}|${isArrival ? 'arrival' : 'departure'}`]
                const isEntry     = !!rec
                const isCancelled = rec?.is_cancelled
                const showTime    = trip.schedTime
                const tripShipments = shipmentMap[trip.id] || []
                const bt = trip.bus_type && busTypeLookup(trip.bus_type)

                return (
                  <tr key={trip._key}
                    className={`border-b border-gray-100 last:border-b-0 ${isCancelled ? 'opacity-45' : 'hover:bg-gray-50'}`}
                    style={{ borderInlineStart: isEntry || isCancelled ? '3px solid transparent' : '3px solid var(--accent)' }}>

                    {/* الوقت */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-mono font-bold text-gray-800">{showTime}</span>
                    </td>

                    {/* النوع */}
                    <td className="px-2 py-2.5 text-center">
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
                        style={{ background: isArrival ? 'var(--success-bg)' : 'var(--info-bg)', color: isArrival ? 'var(--success)' : 'var(--info)' }}>
                        {isArrival ? (isAr ? 'وصول' : 'ARR') : (isAr ? 'مغادرة' : 'DEP')}
                      </span>
                    </td>

                    {/* الرحلة */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono font-bold text-gray-800 ${isCancelled ? 'line-through' : ''}`}>{trip.trip_number}</span>
                        {bt && bt.ar !== 'STANDARD' && (
                          <span className="text-[9px] font-mono font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-px">
                            {isAr ? bt.ar : bt.en}
                          </span>
                        )}
                        {(trip.is_rf || trip.is_extra || rec?.is_extra_trip) && (
                          <span className="text-[9px] font-mono font-bold rounded px-1.5 py-px" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>RF</span>
                        )}
                        {trip.enabled === false && (
                          <span className="text-[9px] font-bold text-gray-400 bg-gray-100 rounded px-1.5 py-px">
                            {isAr ? 'معلّقة' : 'OFF'}
                          </span>
                        )}
                        {tripShipments.map((sh, si) => (
                          <span key={si} className="text-[9px] font-bold rounded px-1.5 py-px" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                            {sh.from_st?.name_ar} ← {sh.to_st?.name_ar}
                          </span>
                        ))}
                      </div>
                      {trip.trip_name && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{trip.trip_name}</div>}
                      {/* اسم الخط على الجوال */}
                      <div className="md:hidden text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {isAr ? trip.from_station?.name_ar : trip.from_station?.name_en}
                        <span style={{ margin:'0 3px', color:'var(--border)' }}>←</span>
                        {isAr ? trip.to_station?.name_ar : trip.to_station?.name_en}
                      </div>
                    </td>

                    {/* الخط */}
                    <td className="px-3 py-2.5 text-xs hidden md:table-cell" style={{ color: 'var(--text-3)' }}>
                      {isAr ? trip.from_station?.name_ar : trip.from_station?.name_en}
                      <span style={{ margin:'0 4px', color:'var(--border)' }}>←</span>
                      {isAr ? trip.to_station?.name_ar : trip.to_station?.name_en}
                    </td>

                    {/* التنفيذ */}
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      {isEntry ? (
                        <div className="flex items-center gap-2.5 flex-wrap text-xs">
                          {rec.departure_accuracy && !isArrival && (
                            <span className={accuracyColor(rec.departure_accuracy)}>
                              {isAr ? accuracyAr(rec.departure_accuracy) : rec.departure_accuracy}
                            </span>
                          )}
                          {rec.bus_number && <span className="font-mono text-gray-500">{rec.bus_number}</span>}
                          {rec.passenger_count > 0 && (
                            <span className="text-gray-500 font-mono">{rec.passenger_count} {isAr ? 'راكب' : 'pax'}</span>
                          )}
                          {rec.operational_status && rec.operational_status !== 'Normal' && (
                            <span className="text-red-600 font-semibold">
                              {isAr ? TRIP_STATUSES.find(s => s.value === rec.operational_status)?.ar : rec.operational_status}
                            </span>
                          )}
                        </div>
                      ) : isArrival && trip.crossActualDep ? (
                        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 rounded px-2 py-0.5">
                          {isAr ? 'غادر' : 'Departed'} {new Date(trip.crossActualDep).toISOString().slice(11, 16)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-300">{isAr ? 'لم تُدخل' : 'Not entered'}</span>
                      )}
                    </td>

                    {/* إجراءات */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {trip.is_rf && (isGeneralAdmin || isStationAdmin) && (
                          <button onClick={() => deleteRfTrip(trip.id)}
                            title={isAr ? 'حذف الرحلة الإضافية' : 'Delete extra trip'}
                            className="text-[11px] border border-gray-300 text-gray-400 rounded-sm px-1.5 py-1 hover:border-red-400 hover:text-red-500">
                            ✕
                          </button>
                        )}
                        {isGeneralAdmin && (
                          <button onClick={() => suspendStationTrip(trip.id, trip.role)}
                            title={isAr ? (trip.role === 'arrival' ? 'إخفاء الوصول' : 'إخفاء المغادرة') : 'Hide'}
                            className="text-[11px] border border-gray-300 text-gray-400 rounded-sm px-1.5 py-1 hover:border-red-400 hover:text-red-500">
                            —
                          </button>
                        )}
                        {canEdit ? (
                          <button
                            onClick={() => setModal({ trip, record: rec ?? null, isArrival, schedTime: trip.schedTime })}
                            className={`text-xs rounded-sm px-3 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                              isEntry
                                ? 'border border-gray-300 text-gray-500 hover:border-gray-400 bg-white'
                                : 'bg-nwbus-primary text-white hover:bg-nwbus-dark'}`}>
                            {isEntry ? (isAr ? 'تعديل' : 'Edit') : (isAr ? '+ إدخال' : '+ Enter')}
                          </button>
                        ) : (
                          <span className={`w-2.5 h-2.5 inline-block ${isEntry ? 'bg-green-600' : 'bg-gray-200'}`} style={{ borderRadius: 1 }} />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* سطر ملخص سفلي */}
      {trips.length > 0 && !loading && (extra > 0 || cancelled > 0 || delayed > 0) && (
        <p className="mt-3 text-xs text-gray-500">
          {[
            extra > 0 && `${extra} ${isAr ? 'إضافية' : 'extra'}`,
            cancelled > 0 && `${cancelled} ${isAr ? 'ملغاة' : 'cancelled'}`,
            delayed > 0 && `${delayed} ${isAr ? 'متأخرة' : 'delayed'}`,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      </>
      )}

      {/* الجدول الشامل */}
      {viewMode === 'schedule' && (
        <div>
          {scheduleLoading ? (
            <p className="text-center py-20 text-gray-400 text-sm">جارٍ تحميل الجدول…</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              {/* إحصائيات سريعة */}
              <div className="flex border-b border-gray-100 text-center">
                {[
                  { label: 'إجمالي الرحلات', val: scheduleData.length },
                  { label: 'غادرت', val: scheduleData.filter(t => t.status === 'departed').length, tone: 'text-green-600' },
                  { label: 'مجدول', val: scheduleData.filter(t => t.status === 'scheduled').length, tone: 'text-gray-500' },
                ].map((s, i) => (
                  <div key={s.label} className={`flex-1 px-4 py-2.5 text-center ${i > 0 ? 'border-s border-gray-100' : ''}`}>
                    <div className={`text-base font-bold font-mono ${s.tone || 'text-gray-800'}`}>{s.val}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider border-b border-gray-200">
                    <th className="px-3 py-2 text-center w-16 font-semibold">الوقت</th>
                    <th className="px-3 py-2 text-start font-semibold">الرحلة</th>
                    <th className="px-3 py-2 text-start font-semibold">من</th>
                    <th className="px-3 py-2 text-start font-semibold">إلى</th>
                    <th className="px-3 py-2 text-center font-semibold">الحالة</th>
                    <th className="px-3 py-2 text-center font-semibold">الفعلي</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleData.map(trip => (
                    <tr key={trip.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                      style={{ borderInlineStart: trip.status === 'departed' ? '3px solid #22c55e' : '3px solid #e5e7eb' }}>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-gray-800">{trip.schedTime}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono font-bold text-gray-800">{trip.trip_number}</span>
                        {trip.trip_name && <div className="text-[10px] text-gray-400">{trip.trip_name}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{trip.from_station?.name_ar}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{trip.to_station?.name_ar}</td>
                      <td className="px-3 py-2.5 text-center">
                        {trip.status === 'departed' && (
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">غادرت</span>
                        )}
                        {trip.status === 'scheduled' && (
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-gray-50 text-gray-400 border border-gray-200">مجدول</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {trip.actual_departure ? (
                          <span className="font-mono text-xs font-bold text-green-600">{trip.actual_departure}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal && (
        <TripModal
          trip={modal.trip}
          record={modal.record}
          stationId={stationId}
          stationName={selectedStationName || (isAr ? profile?.station?.name_ar : profile?.station?.name_en) || ''}
          stations={stations}
          isArrival={modal.isArrival}
          schedTime={modal.schedTime}
          recordDate={date}
          onClose={() => setModal(null)}
          onSaved={fetchData}
        />
      )}

      {showUpload && (
        <ScheduleUploadModal
          isAr={isAr}
          onClose={() => setShowUpload(false)}
          onDone={fetchData}
        />
      )}

      {showSelect && stationId && (
        <StationTripsModal
          stationId={stationId}
          stationName={selectedStationName || (isAr ? profile?.station?.name_ar : profile?.station?.name_en) || ''}
          stations={stations}
          isAr={isAr}
          onClose={() => setShowSelect(false)}
          onDone={fetchData}
        />
      )}

      {showExtra && (
        <ExtraTripModal
          isAr={isAr}
          onClose={() => setShowExtra(false)}
          onCreated={fetchData}
        />
      )}

      {showNewTrip && (
        <NewTripModal
          isAr={isAr}
          onClose={() => setShowNewTrip(false)}
          onCreated={fetchData}
        />
      )}

      {confirmRf && (
        <ConfirmDialog
          message={isAr ? 'حذف الرحلة الإضافية (RF) نهائياً من كل المحطات؟' : 'Permanently delete this extra (RF) trip from all stations?'}
          onConfirm={() => doDeleteRfTrip(confirmRf)}
          onCancel={() => setConfirmRf(null)}
        />
      )}
    </div>
  )
}

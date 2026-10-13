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
import ManualTripsModal from '../components/transportation/ManualTripsModal'
import { applyDueSchedules } from '../utils/importSchedule'

/* ─── helpers ────────────────────────────────────────────── */
import { todayStr } from '../utils/dates'
import RouteText from '../components/shared/RouteText'
import { isRestStation } from '../utils/stations'
import SelectField from '../components/shared/SelectField'

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
const BUS_TYPE_ALIAS = { WCH: 'WHEELCHAIR', 'WHEEL CHAIR': 'WHEELCHAIR', STD: 'STANDARD', NORMAL: 'STANDARD', 'عادي': 'STANDARD', 'قائد': 'QAID' }
const busTypeLookup = t => {
  const k = String(t || '').trim().toUpperCase()
  if (!k) return null
  const hit = BUS_TYPE[BUS_TYPE_ALIAS[k] ?? k]
  // نوع غير معروف: نعرضه كما هو بدل ما نخفيه
  return hit ?? { ar: String(t).trim(), en: String(t).trim(), style: { background: 'var(--surface-2)', color: 'var(--text-2)', fontWeight: 600, borderRadius: 4 } }
}

// رقم الحافلة ومدة تأخرها من آخر محطة غادرتها (يُدخلها موظف المحطة السابقة)
function UpstreamChip({ up, isAr }) {
  if (!up) return null
  const d = up.delay_minutes
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      {up.bus_number && <span className="font-mono text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">{up.bus_number}</span>}
      {typeof d === 'number' && (
        d < 0
          ? <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5">⚠ {isAr ? `غادرت قبل موعدها (${-d} د)` : `Left before schedule (${-d} min)`}</span>
          : <span className={d > 5 ? 'text-red-600 font-semibold' : 'text-green-700'}>
              {d > 5 ? `${isAr ? 'متأخرة' : 'Late'} ${d} ${isAr ? 'د' : 'min'}` : (isAr ? 'في الوقت' : 'On time')}
            </span>
      )}
    </span>
  )
}

/* ─── Trip Entry Modal ──────────────────────────────────── */
const DRAFT_KEY = 'tm_draft'

function TripModal({ trip, record, stationId, stationName, stations = [], isArrival, combined = false, arrivalRecord = null, schedArrTime = '', suggestedBusNumber = null, schedTime, recordDate, onClose, onSaved }) {
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
    bus_number:         record?.bus_number ?? arrivalRecord?.bus_number ?? suggestedBusNumber ?? '',
    actual_departure:   record?.actual_departure
      ? new Date(record.actual_departure).toISOString().slice(11, 16) : '',
    actual_arrival:     (combined ? arrivalRecord : record)?.actual_arrival
      ? new Date((combined ? arrivalRecord : record).actual_arrival).toISOString().slice(11, 16) : '',
    arr_passenger_count: arrivalRecord?.passenger_count ?? '',
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
  // المحطة الحالية (اللي يدخل منها الموظف السجل) هي الافتراضية — مو بداية الرحلة، عشان محطات العبور (مثل الحوية) تُسجَّل باسمها
  const curStationRow = stations.find(s => s.id === stationId)
  const curStationNames = [curStationRow?.name_ar, curStationRow?.name_en, stationName].filter(Boolean)
  // ثابتة: كل تذاكر المتخلفين بهذا السجل تُنسب لمحطة السجل نفسها (بدون اختيار)
  const ticketStation = curStationNames[0] || trip?.from_station?.name_ar || trip?.from_station?.name_en || ''
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
    if (diff < -720) diff += 1440      // تجاوز منتصف الليل
    else if (diff > 720) diff -= 1440
    if (diff < 0) return <span className="text-amber-600 font-semibold">{isArrival ? (isAr ? 'وصلت قبل موعدها' : 'Arrived before schedule') : (isAr ? 'غادرت قبل موعدها' : 'Left before schedule')} ({Math.abs(diff)} {isAr ? 'د' : 'min'})</span>
    if (diff <= 5)  return <span className="text-green-500">{isAr ? 'في الوقت ✓' : 'On Time ✓'}</span>
    if (diff <= 15) return <span className="text-yellow-500">{isAr ? 'غير منتظم' : 'Not On Time'} (+{diff} {isAr ? 'د' : 'min'})</span>
    return <span className="text-red-500">{isAr ? 'متأخر ⚠' : 'Delayed ⚠'} (+{diff} {isAr ? 'د' : 'min'})</span>
  }

  // مغادرة مبكرة (ولو بدقيقة): تنبيه ظاهر في البطاقة
  const earlyMin = (() => {
    if (isArrival || !form.actual_departure || !schedDep) return 0
    const [sh, sm] = schedDep.split(':').map(Number)
    const [ah, am] = form.actual_departure.split(':').map(Number)
    let d = (ah * 60 + am) - (sh * 60 + sm)
    if (d < -720) d += 1440
    else if (d > 720) d -= 1440
    return d < 0 ? -d : 0
  })()

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
    if (combined) {
      if (!form.actual_arrival) { setError(isAr ? 'يرجى إدخال وقت الوصول الفعلي' : 'Actual arrival time is required'); return }
      if (form.arr_passenger_count === '' || form.arr_passenger_count === null || form.arr_passenger_count === undefined) {
        setError(isAr ? 'يرجى إدخال عدد ركاب الوصول (يمكن أن يكون 0)' : 'Arrival passenger count is required (can be 0)')
        return
      }
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
      missed_tickets:     isArrival ? [] : missedTickets.map(m => ({ ...m, station: ticketStation })),
      notes:              form.notes || null,
      created_by:         profile.id,
      created_by_name:    profile.full_name_ar,
    }

    // وقت المغادرة أو الوصول حسب النوع
    const sharedBase = { ...base }
    if (isArrival) base.actual_arrival = ts(form.actual_arrival)
    else           base.actual_departure = ts(form.actual_departure)

    const conflictMsg = isAr
      ? '⚠ عُدّل هذا السجل من مستخدم آخر للتو. حدّث الصفحة وأعد الإدخال حتى لا تُمحى بياناته.'
      : '⚠ This record was just changed by another user. Refresh and re-enter to avoid overwriting.'

    // كتابة سجل واحد: تعديل بقفل متفائل لو موجود (يمنع الكتابة فوق تعديل مستخدم آخر)، وإلا إضافة
    async function writeRecord(existing, payload) {
      if (existing) {
        let q = supabase.from('trip_records').update({
          ...payload,
          updated_by:      profile.id,
          updated_by_name: profile.full_name_ar,
          updated_at:      new Date().toISOString(),
        }).eq('id', existing.id)
        q = existing.updated_at ? q.eq('updated_at', existing.updated_at) : q.is('updated_at', null)
        const r = await q.select('id')
        if (!r.error && (!r.data || r.data.length === 0)) return { conflict: true }
        return r
      }
      return supabase.from('trip_records').upsert(payload, {
        onConflict: 'trip_schedule_id,record_date,station_id,is_arrival',
        ignoreDuplicates: false,
      })
    }

    // بطاقة وصول + مغادرة: سجل الوصول أولاً ثم سجل المغادرة بنفس الحافلة — كل منهما سجل مستقل يظهر في التقارير
    if (combined) {
      const arrPayload = {
        ...sharedBase,
        is_arrival: true,
        passenger_count: Number(form.arr_passenger_count),
        manifest_match: null, manifest_total: null,
        missed_count: 0, missed_tickets: [],
        actual_arrival: ts(form.actual_arrival),
      }
      const ra = await writeRecord(arrivalRecord, arrPayload)
      if (ra.conflict) { setError(conflictMsg); setSaving(false); return }
      if (ra.error) { setError(ra.error.message); setSaving(false); return }
    }

    const res = await writeRecord(record, base)
    if (res.conflict) { setError(conflictMsg); setSaving(false); return }
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
        <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background: isArrival ? 'var(--solid-2)' : 'var(--solid-1)', borderRadius:'16px 16px 0 0' }}>
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
              {combined ? (isAr ? 'وصول + مغادرة' : 'Arrival + Departure') : isArrival ? (isAr ? 'وصول' : 'Arrival') : (isAr ? 'مغادرة' : 'Departure')}
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
            {!record && !arrivalRecord && suggestedBusNumber && form.bus_number === suggestedBusNumber && (
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-3)' }}>
                {isAr ? 'من موظف المحطة السابقة — تأكد منه، تقدر تغيّره' : 'From the previous station — confirm or change it'}
              </p>
            )}
          </div>

          {/* بطاقة وصول + مغادرة: قسم الوصول */}
          {combined && (
            <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', background:'var(--surface)', display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ margin:0, fontSize:'0.75rem', fontWeight:700, color:'var(--success)' }}>
                {isAr ? 'الوصول' : 'Arrival'}{schedArrTime ? ` · ${isAr ? 'مجدول' : 'sched.'} ${schedArrTime}` : ''}
              </p>
              <div>
                <label style={S.label}>{isAr ? 'وقت الوصول الفعلي *' : 'Actual Arrival *'}</label>
                <TimeInput24 value={form.actual_arrival} onChange={v => set('actual_arrival', v)} />
              </div>
              <div>
                <label style={S.label}>{isAr ? 'ركاب الوصول *' : 'Arrival passengers *'}</label>
                <input type="text" inputMode="numeric" style={S.input} placeholder="0"
                  value={form.arr_passenger_count} onChange={e => set('arr_passenger_count', cleanNumber(e.target.value))}
                  onFocus={e => e.target.style.borderColor='var(--accent)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'}
                />
              </div>
            </div>
          )}

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
            {earlyMin > 0 && (
              <div style={{ marginTop:8, border:'1px solid #f59e0b', background:'#fffbeb', color:'#92400e', borderRadius:8, padding:'8px 12px', fontSize:'0.78rem', fontWeight:700 }}>
                {isAr ? `⚠ تنبيه: الحافلة غادرت قبل موعدها المجدول (${schedDep}) بـ ${earlyMin} دقيقة` : `⚠ Warning: the bus left ${earlyMin} min before its scheduled time (${schedDep})`}
              </div>
            )}
          </div>

          {/* Passengers */}
          <div>
            <label style={S.label}>{combined ? (isAr ? 'ركاب المغادرة *' : 'Departure passengers *') : (isAr ? 'الركاب *' : 'Passengers *')}</label>
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
                    <span style={{ color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ticketStation}</span>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontFamily:'monospace', color:'var(--text-1)' }}>{m.ticket}</span>
                      <button type="button" onClick={() => removeTicket(i)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'0.75rem', padding:'0 4px' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, width:176, flexShrink:0 }}>
                <div style={{ ...S.input, padding:'7px 10px', fontSize:'0.75rem', background:'var(--surface-2)', color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                  title={isAr ? 'محطة التذاكر ثابتة: محطة هذا السجل' : 'Ticket station is fixed to this record\'s station'}>
                  {ticketStation}
                </div>
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
            <SelectField style={S.input}
              value={form.operational_status} onChange={e => set('operational_status', e.target.value)}>
              {TRIP_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{isAr ? s.ar : s.en}</option>
              ))}
            </SelectField>
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
            ✍ {profile?.full_name_ar} · {new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')} {new Date().toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>

          <div style={{ display:'flex', gap:8 }}>
            <button type="submit" disabled={saving}
              style={{ flex:1, color:'#fff', padding:'11px 0', borderRadius:8, fontSize:'0.875rem', fontWeight:700, border:'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, transition:'all 0.14s', background: isArrival ? 'var(--solid-2)' : 'var(--solid-1)' }}>
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
  const { profile, isGeneralAdmin, isRestricted, isStationAdmin, isAccountant, isAreaSupervisor, allowedStationIds, allowCap, grantCap, supervisedStationIds, workStations } = useAuth()
  // الحساب المقيّد (مسمى مخصص) يستخدم أزرار الأدمن حسب المفاتيح المفعّلة له فقط
  const adminLike = isGeneralAdmin || isRestricted
  // الرحلة الإضافية RF: للأدمن ومشرف المحطة/المنطقة فقط — مو مشرف الوردية ولا الموظف
  const canManageRf = adminLike || profile?.role === 'station_admin'
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const scopedIds = grantCap('scope_assigned_stations') && supervisedStationIds?.length ? supervisedStationIds : null

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
  const [schedStatus, setSchedStatus] = useState('all')   // all | departed | scheduled | late
  const [schedShift, setSchedShift] = useState('all')    // all | A | B | C
  const [schedQ, setSchedQ] = useState('')
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
  const [showManualTrips, setShowManualTrips] = useState(false)


  // الأدمن/المحاسب يتنقّلون بين كل المحطات؛ المشرف بين محطاته المعيّنة فقط
  const stationId = selectedStation || null

  // جلب المحطات: الأدمن يرى الكل؛ مشرف المنطقة محطاته؛ المشرف والمحاسب محطاتهم فقط
  useEffect(() => {
    if (isGeneralAdmin && !scopedIds) {
      supabase.from('stations').select('id, name_ar, name_en, city_group, combined_arr_dep').eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data.filter(s => !isRestStation(s))) })
    } else if (scopedIds) {
      supabase.from('stations').select('id, name_ar, name_en, city_group, combined_arr_dep').in('id', scopedIds).eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data.filter(s => !isRestStation(s))) })
    } else if (isAreaSupervisor && allowedStationIds?.length) {
      supabase.from('stations').select('id, name_ar, name_en, city_group, combined_arr_dep').in('id', allowedStationIds).eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data.filter(s => !isRestStation(s))) })
    } else if (workStations?.length > 1) {
      // موظف/محاسب يعمل بأكثر من محطة (محطته الأساسية أولاً ثم الإضافية التي حدّدها الأدمن) — يتنقّل بينها مثل المشرف
      setStations(workStations.filter(s => !isRestStation(s)))
    } else if ((isStationAdmin || isAccountant) && profile?.id) {
      supabase.from('user_stations').select('station:station_id(id, name_ar, name_en, city_group, combined_arr_dep)').eq('user_id', profile.id)
        .then(async ({ data }) => {
          let sts = (data ?? []).map(r => r.station).filter(Boolean).filter(s => !isRestStation(s))
          if (sts.length === 0 && profile?.station_id) {
            const { data: st } = await supabase.from('stations').select('id, name_ar, name_en, city_group, combined_arr_dep').eq('id', profile.station_id).maybeSingle()
            sts = st ? [st] : (profile?.station ? [profile.station] : [])
          }
          setStations(sts)
        })
    } else if (profile?.station_id) {
      // الموظف: محطته فقط — نجيبها كاملة (بما فيها إعداد دمج الوصول والمغادرة) عشان تظهر له نفس بطاقة الأدمن
      supabase.from('stations').select('id, name_ar, name_en, city_group, combined_arr_dep').eq('id', profile.station_id).maybeSingle()
        .then(({ data }) => { if (data) setStations([data]) })
    }
  }, [isGeneralAdmin, isAccountant, isStationAdmin, isAreaSupervisor, allowedStationIds, profile?.id, profile?.station_id, scopedIds?.join(','), workStations])

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
      days_of_week, start_date, end_date,
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
        .select('trip_schedule_id, actual_departure, station_id, bus_number, delay_minutes')
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
    // آخر مغادرة سُجّلت لنفس الرحلة من محطة أخرى: منها نعرف رقم الحافلة ومدة التأخير قبل ما توصل هذي المحطة
    const upstreamMap = {}
    ;(crossRecs ?? []).forEach(r => {
      const cur = upstreamMap[r.trip_schedule_id]
      if (!cur || r.actual_departure > cur.actual_departure) upstreamMap[r.trip_schedule_id] = r
    })
    const crossDepMap = {}
    Object.entries(upstreamMap).forEach(([tid, r]) => { crossDepMap[tid] = r.actual_departure })

    // مدة التأخير تُحسب هنا مقابل موعد الرحلة المجدول في المحطة اللي غادرتها (مو موعد انطلاق الرحلة الأصلي)
    const upIds = Object.keys(upstreamMap)
    const upStopMap = {}
    if (upIds.length) {
      const { data: upStops } = await supabase.from('trip_schedule_stops')
        .select('trip_schedule_id, station_id, departure_time').in('trip_schedule_id', upIds)
      ;(upStops ?? []).forEach(x => { upStopMap[`${x.trip_schedule_id}|${x.station_id}`] = x.departure_time })
    }
    const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
    const upstreamFor = tr => {
      const r = upstreamMap[tr.id]
      if (!r) return null
      const originId = tr.from_station?.id || tr.from_station_id
      const sched = upStopMap[`${r.trip_schedule_id}|${r.station_id}`] || (r.station_id === originId ? tr.scheduled_departure : null)
      let delay = null
      if (sched && r.actual_departure) {
        delay = toMin(String(r.actual_departure).slice(11, 16)) - toMin(sched)
        if (delay < -720) delay += 1440
        else if (delay > 720) delay -= 1440
      }
      return { ...r, delay_minutes: delay }
    }

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

    let entries = []
    ;(chosen ?? []).forEach(r => {
      const tr = r.trip
      if (!tr || !tr.is_active) return
      if (tr.is_rf && tr.rf_date !== date) return            // رحلة إضافية تظهر في تاريخها فقط
      if (tr.start_date && date < tr.start_date) return       // لسا ما بدأت صلاحيتها
      if (tr.end_date && date > tr.end_date) return            // انتهت صلاحيتها
      if (tr.days_of_week?.length && !tr.days_of_week.includes(new Date(date + 'T00:00:00').getDay())) return  // مو من أيامها المحددة
      const isDest   = tr.to_station?.id === stationId   || tr.to_station_id   === stationId
      const isOrigin = tr.from_station?.id === stationId || tr.from_station_id === stationId
      const stop     = stopMap[tr.id]                          // المحطة محطة عبور
      const base = { ...tr, is_extra: !!r.is_extra, is_rf: !!tr.is_rf }
      const arrOn = r.arr_enabled !== false   // وصول مفعّل؟
      const depOn = r.dep_enabled !== false   // مغادرة مفعّلة؟

      // الوقتان: التعديل اليدوي (station_trips) يتقدّم، وإلا وقت الجدول (trip_schedule_stops)
      const arrT = r.arrival_time || ''
      const depT = r.departure_time || ''
      const crossDep = crossDepMap[tr.id]
      const addArr = (toStation, time) => arrOn && time && entries.push({ ...base, role: 'arrival', ...(toStation ? { to_station: toStation } : {}), schedTime: s5(time), _key: tr.id + '-a', crossActualDep: crossDep ?? null, upstream: upstreamFor(tr) })
      const addDep = (fromStation, time) => depOn && time && entries.push({ ...base, role: 'departure', ...(fromStation ? { from_station: fromStation } : {}), schedTime: s5(time), _key: tr.id + '-d', upstream: upstreamFor(tr) })

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
        // التعديل اليدوي من «تفعيل رحلات المحطة» (station_trips) يتقدّم على وقت التوقف بالجدول — يكون فارغاً لو ما عُدّل
        if (!sameFrom) addArr(stationObj, arrT || stop.arrival)
        if (!sameTo)   addDep(stationObj, depT || stop.departure)
      } else {
        // لا يوجد سجل توقف → فقط إذا كان الوقت محدداً يدوياً
        if (!(currentGroup && fromGroup && currentGroup === fromGroup)) addArr(stationObj, arrT)
        if (!(currentGroup && toGroup   && currentGroup === toGroup))   addDep(stationObj, depT)
      }
    })
    // محطة "وصول ومغادرة ببطاقة واحدة": الرحلة اللي فيها وصول ومغادرة معاً تُعرض بطاقة واحدة
    if (stationObj?.combined_arr_dep) {
      const byTrip = {}
      entries.forEach(e => { (byTrip[e.id] ??= {})[e.role] = e })
      const seenTrip = new Set()
      entries = entries.reduce((acc, e) => {
        const g = byTrip[e.id]
        if (g.arrival && g.departure) {
          if (!seenTrip.has(e.id)) {
            seenTrip.add(e.id)
            acc.push({ ...g.arrival, role: 'both', schedTime: g.arrival.schedTime, schedArr: g.arrival.schedTime, schedDep: g.departure.schedTime, depFromStation: g.departure.from_station, depToStation: g.departure.to_station, _key: e.id + '-ad' })
          }
        } else acc.push(e)
        return acc
      }, [])
    }
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

    // الخادم يقصّ كل استجابة عند 1000 صف وهذا الجدول يضم رحلات كل المحطات — نقرأ على دفعات حتى نكمل
    const pageAll = async make => {
      const out = []
      for (let f = 0; f < 20000; f += 1000) {
        const { data, error } = await make().range(f, f + 999)
        if (error) break
        out.push(...(data ?? []))
        if ((data ?? []).length < 1000) break
      }
      return out
    }
    const [allTrips, { data: allRecords }] = await Promise.all([
      pageAll(() => supabase.from('station_trips')
        .select(`
          station_id,
          departure_time,
          dep_enabled,
          trip:trip_schedule_id(
            id, trip_number, trip_name, scheduled_departure, scheduled_arrival,
            is_active, is_rf, rf_date, start_date, end_date, days_of_week,
            from_station:from_station_id(id, name_ar, name_en),
            to_station:to_station_id(id, name_ar, name_en)
          )
        `)
        .eq('dep_enabled', true)
        .order('trip_schedule_id').order('station_id')),

      supabase.from('trip_records')
        .select('trip_schedule_id, actual_departure, is_cancelled, station_id, bus_number, passenger_count, missed_count')
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
      // نفس شروط عرض رحلات المحطة: الرحلة الإضافية (RF) تظهر في تاريخها فقط، والمتوقفة/المنتهية/خارج أيامها لا تظهر بالجدول الشامل
      if (tr.is_active === false) return
      if (tr.is_rf && tr.rf_date !== date) return
      if (tr.start_date && date < tr.start_date) return
      if (tr.end_date && date > tr.end_date) return
      if (tr.days_of_week?.length && !tr.days_of_week.includes(new Date(date + 'T00:00:00').getDay())) return
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
        missed: rec?.missed_count,
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
      const isBothTrip = matchedTrip.role === 'both'
      const matchedArr = isBothTrip ? (records.find(r => r.trip_schedule_id === matchedTrip.id && r.is_arrival === true) ?? null) : null
      setModal({ trip: matchedTrip, record: matchedRecord, arrivalRecord: matchedArr, combined: isBothTrip, isArrival: draft.isArrival, schedTime: isBothTrip ? matchedTrip.schedDep : matchedTrip.schedTime })
    } catch {}
  }, [loading, trips])

  // إخفاء (تعليق) اتجاه واحد من الرحلة (مغادرة أو وصول) — للأدمن
  async function suspendStationTrip(tripId, role) {
    const patch = role === 'arrival' ? { arr_enabled: false } : role === 'both' ? { arr_enabled: false, dep_enabled: false } : { dep_enabled: false }
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

  // محطة كل رحلاتها بطاقة وصول+مغادرة: تبويبات وصول/مغادرة تكرر نفس البطاقات، فنخفيها ونعرض الكل
  const allBoth = trips.length > 0 && trips.every(t => t.role === 'both')
  const combinedStation = !!stations.find(s => s.id === stationId)?.combined_arr_dep
  // محطة البطاقة الواحدة: قائمة واحدة بكل الرحلات (وصول ومغادرة وبطاقات مدمجة) بدون تبويبات تفرّقها
  const oneList = allBoth || combinedStation
  const effFilter = oneList ? 'all' : filter

  // Filter & search
  const filtered = trips.filter(t => {
    if (effFilter !== 'all' && t.role !== effFilter && t.role !== 'both') return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.trip_number?.toLowerCase().includes(q) ||
      t.trip_name?.toLowerCase().includes(q) ||
      t.trip_name?.includes(q) ||
      t.to_station?.name_ar?.includes(q) ||
      t.to_station?.name_en?.toLowerCase().includes(q) ||
      recordMap[`${t.id}|${t.role === 'arrival' ? 'arrival' : 'departure'}`]?.bus_number?.includes(q) ||
      (t.role === 'both' && recordMap[`${t.id}|arrival`]?.bus_number?.includes(q))
    )
  })

  // ── لوحة الكمبيوتر: الرحلات مجمّعة بالورديات مع مؤشر "الآن" والرحلة القادمة ──────────
  const renderTripRow = (trip, nowMin, isToday) => {
    const { isBoth, isArrival, rec, arrRec, dRec, isEntry, isComplete, isCancelled, tripShipments, bt, stn, edge, earlyMin } = tripState(trip)
    const t0 = isBoth ? trip.schedDep : trip.schedTime
    const tm = t0 ? Number(String(t0).slice(0, 2)) * 60 + Number(String(t0).slice(3, 5)) : null
    const overdue = isToday && !isEntry && !isCancelled && tm != null && tm < nowMin - 5
    const chip = (bg, c) => ({ background: bg, color: c, borderRadius: 99, padding: '2px 10px', fontSize: '0.66rem', fontWeight: 800, whiteSpace: 'nowrap' })
    const typeChip = isBoth ? { t: isAr ? 'وصول + مغادرة' : 'ARR + DEP', bg: 'var(--surface-2)', c: 'var(--text-2)' }
      : isArrival ? { t: isAr ? 'وصول' : 'ARR', bg: 'var(--success-bg)', c: 'var(--success)' } : { t: isAr ? 'مغادرة' : 'DEP', bg: 'var(--info-bg)', c: 'var(--info)' }
    const track = (from, to) => (
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(36px, 70px) minmax(0,1fr)', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', textAlign: 'end' }}>{stn(from)}</span>
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}>
          <i style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-3)' }} />
          <i style={{ flex: 1, height: 0, borderTop: '2px dashed var(--border-2)', margin: '0 3px' }} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>{stn(to)}</span>
      </div>
    )
    return (
      <div key={trip._key} className="tp-row" style={{ alignItems: 'center', padding: '12px 18px', background: 'var(--card)', border: '1px solid var(--border-2)', borderInlineStart: `5px solid ${edge}`, borderRadius: 14, opacity: isCancelled ? 0.5 : 1 }}>
        {/* الوقت */}
        <div className="tp-time" style={{ textAlign: 'center' }}>
          {isBoth ? (
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-1)', lineHeight: 1.5 }}>
              <div>{trip.schedDep}</div><div style={{ color: 'var(--text-3)' }}>{trip.schedArr}</div>
            </div>
          ) : <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-1)', lineHeight: 1.1 }}>{trip.schedTime}</div>}
          <span style={{ ...chip(typeChip.bg, typeChip.c), display: 'inline-block', marginTop: 6 }}>{typeChip.t}</span>
        </div>

        {/* الرحلة */}
        <div className="tp-trip" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.02rem', color: 'var(--text-1)', textDecoration: isCancelled ? 'line-through' : 'none' }}>{trip.trip_number}</span>
            {(trip.is_rf || trip.is_extra || rec?.is_extra_trip) && <span style={chip('var(--info-bg)', 'var(--info)')}>RF</span>}
            {bt && <span style={chip('var(--surface-2)', 'var(--text-2)')}>{isAr ? bt.ar : bt.en}</span>}
            {trip.enabled === false && <span style={chip('var(--surface-2)', 'var(--text-3)')}>{isAr ? 'معلّقة' : 'OFF'}</span>}
            {tripShipments.map((sh, si) => <span key={si} style={chip('var(--warning-bg)', 'var(--warning)')}><RouteText from={sh.from_st?.name_ar} to={sh.to_st?.name_ar} /></span>)}
          </div>
          {trip.trip_name && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3 }}>{trip.trip_name}</div>}
          {overdue && <span style={{ ...chip('var(--warning-bg)', 'var(--warning)'), display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5 }}><i className="tp-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }} />{isAr ? 'بانتظار الإدخال' : 'Awaiting entry'}</span>}
        </div>

        {/* المسار */}
        <div className="tp-route">
          {isBoth ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={chip('var(--info-bg)', 'var(--info)')}>{isAr ? 'مغ' : 'DEP'}</span><div style={{ flex: 1 }}>{track(trip.depFromStation, trip.depToStation)}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={chip('var(--success-bg)', 'var(--success)')}>{isAr ? 'وص' : 'ARR'}</span><div style={{ flex: 1 }}>{track(trip.from_station, trip.to_station)}</div></div>
            </div>
          ) : track(trip.from_station, trip.to_station)}
        </div>

        {/* التنفيذ */}
        <div className="tp-exec" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: '0.76rem' }}>
          {isEntry ? (
            <>
              {isBoth && !isComplete && <span style={chip('var(--warning-bg)', 'var(--warning)')}>{isAr ? (rec ? 'ناقص: الوصول' : 'ناقص: المغادرة') : (rec ? 'Missing arrival' : 'Missing departure')}</span>}
              {rec && !isArrival && (earlyMin > 0
                ? <span style={chip('var(--warning-bg)', 'var(--warning)')}>⚠ {isAr ? `قبل موعدها ${earlyMin} د` : `${earlyMin} min early`}</span>
                : rec.departure_accuracy ? <span className={accuracyColor(rec.departure_accuracy)}>{isAr ? accuracyAr(rec.departure_accuracy) : rec.departure_accuracy}</span> : null)}
              {rec?.actual_departure && !isArrival && <span style={{ fontFamily: MONO, fontWeight: 700, color: 'var(--text-1)' }}>{String(rec.actual_departure).slice(11, 16)}</span>}
              {dRec?.bus_number && <span style={{ fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)', background: 'var(--surface-2)', borderRadius: 6, padding: '1px 8px' }}>{dRec.bus_number}</span>}
              {isBoth && arrRec?.passenger_count > 0 && <span style={{ fontFamily: MONO, color: 'var(--text-2)' }}>↓ {arrRec.passenger_count}</span>}
              {rec?.passenger_count > 0 && <span style={{ fontFamily: MONO, color: 'var(--text-2)' }}>{isBoth ? '↑ ' : ''}{rec.passenger_count} {isAr ? 'راكب' : 'pax'}</span>}
              {dRec?.operational_status && dRec.operational_status !== 'Normal' && <span style={{ color: 'var(--danger)', fontWeight: 800 }}>{isAr ? TRIP_STATUSES.find(x => x.value === dRec.operational_status)?.ar : dRec.operational_status}</span>}
            </>
          ) : trip.upstream || (isArrival && trip.crossActualDep) ? (
            <>
              <UpstreamChip up={trip.upstream} isAr={isAr} />
              {trip.crossActualDep && <span style={chip('var(--info-bg)', 'var(--info)')}>{isAr ? 'غادر' : 'Departed'} {new Date(trip.crossActualDep).toISOString().slice(11, 16)}</span>}
            </>
          ) : <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'لم تُدخل بعد' : 'Not entered yet'}</span>}
        </div>

        {/* إجراءات */}
        <div className="tp-act" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          {trip.is_rf && canManageRf && allowCap('transport_delete_rf') && (
            <button onClick={() => deleteRfTrip(trip.id)} title={isAr ? 'حذف الرحلة الإضافية' : 'Delete extra trip'} aria-label={isAr ? 'حذف الرحلة الإضافية' : 'Delete extra trip'}
              style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
          )}
          {adminLike && allowCap('transport_manage_trips') && (
            <button onClick={() => suspendStationTrip(trip.id, trip.role)} title={isAr ? 'إخفاء' : 'Hide'} aria-label={isAr ? 'إخفاء الرحلة' : 'Hide trip'}
              style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--text-3)', cursor: 'pointer' }}>—</button>
          )}
          {canEdit ? (
            <button onClick={() => setModal({ trip, record: rec ?? null, arrivalRecord: arrRec ?? null, combined: isBoth, isArrival, suggestedBusNumber: trip.upstream?.bus_number ?? null, schedTime: isBoth ? trip.schedDep : trip.schedTime })}
              style={{ minWidth: 96, minHeight: 38, padding: '0 18px', borderRadius: 10, border: isEntry ? '1px solid var(--border-2)' : 'none', background: isEntry ? 'var(--card)' : 'var(--solid-btn)', color: isEntry ? 'var(--text-1)' : '#fff', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              {isEntry ? (isComplete ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'إكمال' : 'Complete')) : (isAr ? '+ إدخال' : '+ Enter')}
            </button>
          ) : <span style={{ fontSize: '0.74rem', fontWeight: 700, color: isEntry ? 'var(--success)' : 'var(--text-3)' }}>{isEntry ? (isAr ? 'تم الإدخال' : 'Entered') : (isAr ? 'لم تُدخل' : 'Not entered')}</span>}
        </div>
      </div>
    )
  }

  const renderBoard = () => {
    const isToday = date === todayStr()
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const minsOf = t => { const x = t.role === 'both' ? t.schedDep : t.schedTime; return x ? Number(String(x).slice(0, 2)) * 60 + Number(String(x).slice(3, 5)) : 0 }
    const sorted = [...filtered].sort((a, b) => minsOf(a) - minsOf(b))
    const shifts = [
      { k: 'A', ar: 'الوردية أ', en: 'Shift A', from: 0, to: 480, range: '00:00 – 08:00' },
      { k: 'B', ar: 'الوردية ب', en: 'Shift B', from: 480, to: 960, range: '08:00 – 16:00' },
      { k: 'C', ar: 'الوردية ج', en: 'Shift C', from: 960, to: 1440, range: '16:00 – 24:00' },
    ]
    const entered = t => { const s = tripState(t); return s.isEntry }
    // الرحلة القادمة: أول رحلة غير مُدخلة موعدها الآن أو بعده
    const next = isToday ? sorted.find(t => !entered(t) && !tripState(t).isCancelled && minsOf(t) >= nowMin - 5) : null
    const nextIn = next ? minsOf(next) - nowMin : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {next && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg, var(--solid-1), var(--solid-2))', color: '#fff', borderRadius: 14, padding: '12px 18px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', fontWeight: 800, opacity: 0.85 }}><i className="tp-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#34D399' }} />{isAr ? 'الرحلة القادمة' : 'Next up'}</span>
            <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.2rem' }}>{next.trip_number}</span>
            <span dir="ltr" style={{ fontWeight: 700, fontSize: '0.84rem', opacity: 0.9 }}>{tripState(next).stn(next.from_station)} → {tripState(next).stn(next.to_station)}</span>
            <span style={{ marginInlineStart: 'auto', fontFamily: MONO, fontWeight: 800, fontSize: '1.05rem' }} dir="ltr">{next.role === 'both' ? next.schedDep : next.schedTime}</span>
            <span style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 99, padding: '3px 14px', fontSize: '0.76rem', fontWeight: 800 }}>{nextIn <= 0 ? (isAr ? 'الآن' : 'Now') : (isAr ? `بعد ${nextIn >= 60 ? `${Math.floor(nextIn / 60)}س ${nextIn % 60}د` : `${nextIn} د`}` : `in ${nextIn} min`)}</span>
          </div>
        )}
        {shifts.map(sh => {
          const list = sorted.filter(t => { const m = minsOf(t); return m >= sh.from && m < sh.to })
          if (!list.length) return null
          const done = list.filter(entered).length
          const pct = Math.round((done / list.length) * 100)
          const nowHere = isToday && nowMin >= sh.from && nowMin < sh.to
          let nowPlaced = false
          return (
            <section key={sh.k}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ width: 4, height: 18, background: 'var(--accent)', borderRadius: 2 }} />
                <span style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? sh.ar : sh.en}</span>
                <span dir="ltr" style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-3)' }}>{sh.range}</span>
                {nowHere && <span style={{ background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 99, padding: '1px 10px', fontSize: '0.66rem', fontWeight: 800 }}>{isAr ? 'الحالية' : 'Current'}</span>}
                <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-2)' }} dir="ltr">{done}/{list.length}</span>
                  <span style={{ width: 120, height: 6, borderRadius: 99, background: 'var(--border-2)', overflow: 'hidden' }}><i style={{ display: 'block', width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 99 }} /></span>
                  <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: 'var(--text-3)' }}>{pct}%</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map(t => {
                  const row = renderTripRow(t, nowMin, isToday)
                  if (nowHere && !nowPlaced && minsOf(t) >= nowMin) {
                    nowPlaced = true
                    return (
                      <div key={`now-${t._key}`} style={{ display: 'contents' }}>
                        <div aria-label={isAr ? 'الوقت الآن' : 'Now'} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', fontFamily: MONO, fontSize: '0.7rem', fontWeight: 800 }}>
                          <i style={{ flex: 1, height: 0, borderTop: '2px solid var(--danger)', opacity: 0.6 }} />
                          <span dir="ltr" style={{ background: 'var(--danger-bg)', borderRadius: 99, padding: '1px 12px' }}>{isAr ? 'الآن' : 'NOW'} {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</span>
                          <i style={{ flex: 1, height: 0, borderTop: '2px solid var(--danger)', opacity: 0.6 }} />
                        </div>
                        {row}
                      </div>
                    )
                  }
                  return row
                })}
              </div>
            </section>
          )
        })}
      </div>
    )
  }


  // ── الجدول الشامل: لوحة تحكم + تصفية + ورديات + مؤشر الآن (كمبيوتر) وبطاقات (جوال) ───────────
  const renderSchedule = () => {
    const isToday = date === todayStr()
    const nowD = new Date(), nowMin = nowD.getHours() * 60 + nowD.getMinutes()
    const toMin = t => (t ? Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5)) : null)
    const en = st => st?.name_en || st?.name_ar || '—'
    const rows = scheduleData.map(t => {
      const sm = toMin(t.schedTime), am = toMin(t.actual_departure)
      let dly = null
      if (sm != null && am != null) { dly = am - sm; if (dly < -720) dly += 1440; else if (dly > 720) dly -= 1440 }
      const departed = t.status === 'departed'
      const overdue = isToday && !departed && sm != null && sm < nowMin - 5
      return { ...t, sm: sm ?? 0, dly, departed, overdue, late: departed && dly != null && dly > 5 }
    })
    const total = rows.length
    const departedN = rows.filter(r => r.departed).length
    const lateN = rows.filter(r => r.late).length
    const overdueN = rows.filter(r => r.overdue).length
    const paxSum = rows.reduce((a, r) => a + (Number(r.passenger_count) || 0), 0)
    const missSum = rows.reduce((a, r) => a + (Number(r.missed) || 0), 0)
    const meas = rows.filter(r => r.dly != null)
    const punct = meas.length ? Math.round((meas.filter(r => r.dly <= 5).length / meas.length) * 100) : null
    const pct = total ? Math.round((departedN / total) * 100) : 0
    const SH = [['A', 'الوردية أ', 'Shift A', 0, 480, '00:00 – 08:00'], ['B', 'الوردية ب', 'Shift B', 480, 960, '08:00 – 16:00'], ['C', 'الوردية ج', 'Shift C', 960, 1440, '16:00 – 24:00']]
    const shiftOf = r => (r.sm < 480 ? 'A' : r.sm < 960 ? 'B' : 'C')
    const q = schedQ.trim().toLowerCase()
    const list = rows.filter(r => {
      if (schedStatus === 'departed' && !r.departed) return false
      if (schedStatus === 'scheduled' && r.departed) return false
      if (schedStatus === 'late' && !(r.late || r.overdue)) return false
      if (schedShift !== 'all' && shiftOf(r) !== schedShift) return false
      if (q && !`${r.trip_number} ${r.trip_name || ''} ${r.from_station?.name_ar || ''} ${r.from_station?.name_en || ''} ${r.to_station?.name_ar || ''} ${r.to_station?.name_en || ''} ${r.bus_number || ''}`.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => a.sm - b.sm)
    const hours = Array.from({ length: 24 }, (_, h) => ({ dep: rows.filter(r => r.departed && Math.floor(r.sm / 60) === h).length, sch: rows.filter(r => !r.departed && Math.floor(r.sm / 60) === h).length }))
    const hMax = Math.max(...hours.map(h => h.dep + h.sch), 1)
    const next = isToday ? rows.filter(r => !r.departed && r.sm >= nowMin - 5).sort((a, b) => a.sm - b.sm)[0] : null
    const nextIn = next ? next.sm - nowMin : null
    const chipS = (bg, c) => ({ background: bg, color: c, borderRadius: 99, padding: '2px 10px', fontSize: '0.66rem', fontWeight: 800, whiteSpace: 'nowrap' })
    const pill = on => ({ padding: '6px 14px', borderRadius: 99, fontSize: '0.74rem', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, background: on ? 'var(--accent)' : 'var(--card)', color: on ? '#fff' : 'var(--text-2)' })
    const statusChip = r => r.departed
      ? <span style={chipS(r.late ? 'var(--danger-bg)' : 'var(--success-bg)', r.late ? 'var(--danger)' : 'var(--success)')}>{isAr ? 'غادرت' : 'Departed'}{r.dly != null ? ` · ${r.dly > 0 ? '+' : ''}${r.dly}${isAr ? 'د' : 'm'}` : ''}</span>
      : r.overdue
        ? <span style={{ ...chipS('var(--warning-bg)', 'var(--warning)'), display: 'inline-flex', alignItems: 'center', gap: 5 }}><i className="tp-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }} />{isAr ? 'بانتظار التسجيل' : 'Awaiting entry'}</span>
        : <span style={chipS('var(--surface-2)', 'var(--text-3)')}>{isAr ? 'مجدولة' : 'Scheduled'}</span>
    const track = (from, to) => (
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(36px, 70px) minmax(0,1fr)', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', textAlign: 'end' }}>{en(from)}</span>
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}>
          <i style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-3)' }} />
          <i style={{ flex: 1, height: 0, borderTop: '2px dashed var(--border-2)', margin: '0 3px' }} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>{en(to)}</span>
      </div>
    )
    const exec = r => (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: '0.76rem' }}>
        {statusChip(r)}
        {r.actual_departure && <span style={{ fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)' }}>{r.actual_departure}</span>}
        {r.bus_number && <span style={{ fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)', background: 'var(--surface-2)', borderRadius: 6, padding: '1px 8px' }}>{r.bus_number}</span>}
        {r.passenger_count > 0 && <span style={{ fontFamily: MONO, color: 'var(--text-2)' }}>{r.passenger_count} {isAr ? 'راكب' : 'pax'}</span>}
        {r.missed > 0 && <span style={{ fontFamily: MONO, color: 'var(--danger)', fontWeight: 800 }}>−{r.missed}</span>}
      </div>
    )
    const edgeOf = r => (r.late ? 'var(--danger)' : r.departed ? 'var(--success)' : r.overdue ? 'var(--warning)' : 'var(--border-2)')
    const row = r => (
      <div key={r.id} className="tp-row tp-row-sched" style={{ alignItems: 'center', padding: '12px 18px', background: 'var(--card)', border: '1px solid var(--border-2)', borderInlineStart: `5px solid ${edgeOf(r)}`, borderRadius: 14 }}>
        <div className="tp-time" style={{ textAlign: 'center', fontFamily: MONO, fontWeight: 800, fontSize: '1.45rem', color: 'var(--text-1)', lineHeight: 1.1 }}>{r.schedTime}</div>
        <div className="tp-trip" style={{ minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.02rem', color: 'var(--text-1)' }}>{r.trip_number}</span>
          {r.trip_name && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{r.trip_name}</div>}
        </div>
        <div className="tp-route">{track(r.from_station, r.to_station)}</div>
        <div className="tp-exec">{exec(r)}</div>
      </div>
    )
    const card = r => (
      <div key={r.id} dir="ltr" style={{ border: '1px solid var(--border-2)', borderInlineStart: `4px solid ${edgeOf(r)}`, borderRadius: 12, background: 'var(--card)', padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>{r.trip_number}</span>
            {r.trip_name && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{r.trip_name}</div>}
            <div style={{ marginTop: 5 }}>{statusChip(r)}</div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--surface)', borderRadius: 10, padding: '6px 12px' }}>
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-1)' }}>{r.schedTime}</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'المجدول' : 'Sched.'}</div>
          </div>
        </div>
        <div style={{ margin: '9px 0' }}>{track(r.from_station, r.to_station)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center', background: 'var(--surface)', borderRadius: 10, padding: '8px 4px' }}>
          {[[isAr ? 'الفعلي' : 'Actual', r.actual_departure || '—', r.departed ? 'var(--success)' : 'var(--text-3)'], [isAr ? 'الفرق' : 'Delta', r.dly != null ? `${r.dly > 0 ? '+' : ''}${r.dly}` : '—', r.late ? 'var(--danger)' : 'var(--text-1)'], [isAr ? 'الركاب' : 'Pax', r.passenger_count ?? '—', 'var(--text-1)'], [isAr ? 'الحافلة' : 'Bus', r.bus_number || '—', 'var(--text-1)']].map(([l, v, c]) => (
            <div key={l}><div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.86rem', color: c }}>{v}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-3)', fontWeight: 700, marginTop: 2 }}>{l}</div></div>
          ))}
        </div>
      </div>
    )
    let nowPlaced = false
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* لوحة التحكم */}
        <div className="tp-hero" style={{ background: 'linear-gradient(135deg, var(--solid-1), var(--solid-2))', color: '#fff', borderRadius: 18, padding: '18px 22px', boxShadow: 'var(--shadow-lg)' }}>
          <div className="tp-ring" style={{ position: 'relative' }}>
            <svg width="100%" height="100%" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
              <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="10" />
              <circle cx="56" cy="56" r="48" fill="none" stroke={pct === 100 ? '#34D399' : '#F5A623'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 301.6} 301.6`} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} dir="ltr">
              <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>{pct}%</span>
              <span style={{ fontSize: '0.6rem', opacity: 0.75, fontWeight: 700, marginTop: 3 }}>{isAr ? 'غادرت' : 'departed'}</span>
            </div>
          </div>
          <div className="tp-head">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '1.02rem' }}>{isAr ? 'الجدول الشامل — كل المحطات' : 'Global schedule — all stations'}</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.75 }} dir="ltr">{date}</span>
            </div>
          </div>
          <div className="tp-kpis">
            {[
              [isAr ? 'إجمالي الرحلات' : 'Trips', total, '#fff'],
              [isAr ? 'غادرت' : 'Departed', departedN, '#34D399'],
              [isAr ? 'مجدولة' : 'Scheduled', total - departedN, '#fff'],
              [isAr ? 'متأخرة / بانتظار' : 'Late / awaiting', `${lateN} / ${overdueN}`, lateN + overdueN > 0 ? '#F87171' : '#fff'],
              [isAr ? 'التزام بالموعد' : 'On-time', punct != null ? `${punct}%` : '—', punct != null && punct >= 85 ? '#34D399' : punct != null && punct < 70 ? '#F87171' : '#fff'],
              [isAr ? 'ركاب / متخلفون' : 'Pax / missed', `${paxSum} / ${missSum}`, '#fff'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2, color: c }} dir="ltr">{v}</div>
                <div style={{ fontSize: '0.62rem', opacity: 0.75, fontWeight: 700, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          {/* خط الوقت: توزيع الرحلات على ساعات اليوم */}
          <div className="tp-shifts" dir="ltr">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 58 }}>
              {hours.map((h, i) => (
                <div key={i} title={`${String(i).padStart(2, '0')}:00 — ${h.dep} / ${h.dep + h.sch}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                  <div style={{ width: '100%', height: `${((h.dep + h.sch) / hMax) * 40}px`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: '3px 3px 0 0', overflow: 'hidden', outline: isToday && Math.floor(nowMin / 60) === i ? '2px solid #F87171' : 'none' }}>
                    <i style={{ display: 'block', height: `${h.sch ? (h.sch / (h.dep + h.sch)) * 100 : 0}%`, background: 'rgba(255,255,255,0.28)' }} />
                    <i style={{ display: 'block', height: `${h.dep ? (h.dep / (h.dep + h.sch)) * 100 : 0}%`, background: '#34D399' }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: '0.54rem', opacity: 0.7, height: 12 }}>{i % 3 === 0 ? i : ''}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: '0.64rem', opacity: 0.85, fontWeight: 700, marginTop: 2 }}>
              <span><i style={{ display: 'inline-block', width: 8, height: 8, background: '#34D399', borderRadius: 2, marginInlineEnd: 5 }} />{isAr ? 'غادرت' : 'Departed'}</span>
              <span><i style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(255,255,255,0.28)', borderRadius: 2, marginInlineEnd: 5 }} />{isAr ? 'مجدولة' : 'Scheduled'}</span>
              {isToday && <span><i style={{ display: 'inline-block', width: 8, height: 8, border: '2px solid #F87171', borderRadius: 2, marginInlineEnd: 5 }} />{isAr ? 'الساعة الحالية' : 'Current hour'}</span>}
            </div>
          </div>
        </div>

        {/* التصفية والبحث */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {[['all', isAr ? 'الكل' : 'All'], ['departed', isAr ? 'غادرت' : 'Departed'], ['scheduled', isAr ? 'مجدولة' : 'Scheduled'], ['late', isAr ? 'متأخرة / بانتظار' : 'Late / awaiting']].map(([k, l]) => <button key={k} type="button" style={{ ...pill(schedStatus === k), flexShrink: 0 }} onClick={() => setSchedStatus(k)}>{l}</button>)}
            <span style={{ width: 1, height: 20, background: 'var(--border-2)', flexShrink: 0 }} />
            {[['all', isAr ? 'كل الورديات' : 'All shifts'], ...SH.map(x => [x[0], isAr ? x[1] : x[2]])].map(([k, l]) => <button key={k} type="button" style={{ ...pill(schedShift === k), flexShrink: 0 }} onClick={() => setSchedShift(k)}>{l}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input value={schedQ} onChange={e => setSchedQ(e.target.value)} placeholder={isAr ? 'بحث: رقم الرحلة / المحطة / الحافلة' : 'Search trip / station / bus'} aria-label={isAr ? 'بحث بالجدول' : 'Search schedule'}
              style={{ flex: 1, minWidth: 0, border: '1px solid var(--border-2)', borderRadius: 10, padding: '9px 12px', fontSize: '0.82rem', fontFamily: 'inherit', background: 'var(--card)' }} />
            <span style={{ fontFamily: MONO, fontSize: '0.76rem', color: 'var(--text-3)', flexShrink: 0 }} dir="ltr">{list.length} / {total}</span>
          </div>
        </div>

        {next && schedStatus === 'all' && schedShift === 'all' && !q && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--info-bg)', border: '1px solid var(--border-2)', borderRadius: 14, padding: '10px 16px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', fontWeight: 800, color: 'var(--info)' }}><i className="tp-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />{isAr ? 'الرحلة القادمة' : 'Next up'}</span>
            <span style={{ fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)' }}>{next.trip_number}</span>
            <span dir="ltr" style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-2)' }}>{en(next.from_station)} → {en(next.to_station)}</span>
            <span style={{ marginInlineStart: 'auto', fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)' }} dir="ltr">{next.schedTime}</span>
            <span style={chipS('var(--card)', 'var(--text-1)')}>{nextIn <= 0 ? (isAr ? 'الآن' : 'Now') : (isAr ? `بعد ${nextIn >= 60 ? `${Math.floor(nextIn / 60)}س ${nextIn % 60}د` : `${nextIn} د`}` : `in ${nextIn} min`)}</span>
          </div>
        )}

        {list.length === 0 ? (
          <p className="text-center py-16 text-gray-400 text-sm">{isAr ? 'لا نتائج مطابقة' : 'No matching trips'}</p>
        ) : (
          <>
            <div className="md:hidden"><div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{list.map(card)}</div></div>
            <div className="hidden md:block">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {SH.map(([k, ar, enL, from, to, range]) => {
                  const grp = list.filter(r => r.sm >= from && r.sm < to)
                  if (!grp.length) return null
                  const all = rows.filter(r => r.sm >= from && r.sm < to)
                  const done = all.filter(r => r.departed).length
                  const sp = all.length ? Math.round((done / all.length) * 100) : 0
                  const nowHere = isToday && nowMin >= from && nowMin < to
                  return (
                    <section key={k}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                        <span style={{ width: 4, height: 18, background: 'var(--accent)', borderRadius: 2 }} />
                        <span style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? ar : enL}</span>
                        <span dir="ltr" style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-3)' }}>{range}</span>
                        {nowHere && <span style={chipS('var(--success-bg)', 'var(--success)')}>{isAr ? 'الحالية' : 'Current'}</span>}
                        <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: MONO, fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-2)' }} dir="ltr">{done}/{all.length}</span>
                          <span style={{ width: 120, height: 6, borderRadius: 99, background: 'var(--border-2)', overflow: 'hidden' }}><i style={{ display: 'block', width: `${sp}%`, height: '100%', background: sp === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 99 }} /></span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {grp.map(r => {
                          if (nowHere && !nowPlaced && r.sm >= nowMin) {
                            nowPlaced = true
                            return (
                              <div key={`now-${r.id}`} style={{ display: 'contents' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', fontFamily: MONO, fontSize: '0.7rem', fontWeight: 800 }}>
                                  <i style={{ flex: 1, height: 0, borderTop: '2px solid var(--danger)', opacity: 0.6 }} />
                                  <span dir="ltr" style={{ background: 'var(--danger-bg)', borderRadius: 99, padding: '1px 12px' }}>{isAr ? 'الآن' : 'NOW'} {String(nowD.getHours()).padStart(2, '0')}:{String(nowD.getMinutes()).padStart(2, '0')}</span>
                                  <i style={{ flex: 1, height: 0, borderTop: '2px solid var(--danger)', opacity: 0.6 }} />
                                </div>
                                {row(r)}
                              </div>
                            )
                          }
                          return row(r)
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }


  // Stats
  const total        = trips.length
  const departureCnt = trips.filter(t => t.role === 'departure' || t.role === 'both').length
  const arrivalCnt   = trips.filter(t => t.role === 'arrival' || t.role === 'both').length
  const hasBoth      = trips.some(t => t.role === 'both')
  const entered      = hasBoth
    ? trips.filter(t => t.role === 'both'
        ? (recordMap[`${t.id}|arrival`] && recordMap[`${t.id}|departure`])
        : recordMap[`${t.id}|${t.role === 'arrival' ? 'arrival' : 'departure'}`]).length
    : Object.keys(recordMap).length
  const onTime       = records.filter(r => r.departure_accuracy === 'On Time').length
  const delayed      = records.filter(r => r.departure_accuracy === 'Delayed').length
  const cancelled    = records.filter(r => r.is_cancelled).length
  const extra        = records.filter(r => r.is_extra_trip).length
  const enteredPct   = total > 0 ? Math.round((entered / total) * 100) : 0
  const depRecs      = records.filter(r => !r.is_arrival)
  const paxTotal     = depRecs.reduce((a, r) => a + (Number(r.passenger_count) || 0), 0)
  const missedTotal  = depRecs.reduce((a, r) => a + (Number(r.missed_count) || 0), 0)
  const measured     = depRecs.filter(r => r.departure_accuracy).length
  const punctPct     = measured ? Math.round((depRecs.filter(r => r.departure_accuracy === 'On Time' || r.departure_accuracy === 'Early').length / measured) * 100) : null
  const tMin = t => { const x = t.role === 'both' ? t.schedDep : t.schedTime; return x ? Number(String(x).slice(0, 2)) * 60 + Number(String(x).slice(3, 5)) : 0 }
  const shiftProg = [['A', isAr ? 'أ' : 'A', 0, 480], ['B', isAr ? 'ب' : 'B', 480, 960], ['C', isAr ? 'ج' : 'C', 960, 1440]].map(([k, lbl, a, b]) => {
    const list = trips.filter(t => { const m = tMin(t); return m >= a && m < b })
    const done = list.filter(t => (t.role === 'both'
      ? !!(recordMap[`${t.id}|departure`] || recordMap[`${t.id}|arrival`])
      : !!recordMap[`${t.id}|${t.role === 'arrival' ? 'arrival' : 'departure'}`])).length
    return { k, lbl, n: list.length, done }
  })

  // المحاسب الصرف لا يُدخل ترحيلاً — لكن المشرف/الأدمن الذي يحمل صفة محاسب إضافية يُدخل عادي
  const canEdit = (isGeneralAdmin || isStationAdmin || !isAccountant) && allowCap('transport_record_edit')

  const selectedStationName = stations.find(s => s.id === selectedStation)
    ? (isAr
        ? stations.find(s => s.id === selectedStation)?.name_ar
        : stations.find(s => s.id === selectedStation)?.name_en)
    : (isAr ? 'اختر محطة' : 'Select station')

  // ── بطاقات الجوال (نفس تصميم بطاقات التقارير) ─────────────────────────
  const MONO = "'IBM Plex Mono', ui-monospace, monospace"
  // حالة الرحلة المشتركة بين البطاقة (جوال) واللوحة (كمبيوتر)
  const tripState = trip => {
    const isBoth      = trip.role === 'both'
    const isArrival   = trip.role === 'arrival'
    const rec         = recordMap[`${trip.id}|${isArrival ? 'arrival' : 'departure'}`]
    const arrRec      = isBoth ? recordMap[`${trip.id}|arrival`] : null
    const dRec        = isBoth ? (rec || arrRec) : rec
    const isEntry     = isBoth ? !!(rec || arrRec) : !!rec
    const isComplete  = isBoth ? !!(rec && arrRec) : !!rec
    const isCancelled = rec?.is_cancelled
    const tripShipments = shipmentMap[trip.id] || []
    const bt = trip.bus_type && busTypeLookup(trip.bus_type)
    const stn = st => st?.name_en || st?.name_ar || '—'
    const edge = isCancelled ? 'var(--border-2)' : isComplete ? 'var(--success)' : isEntry ? 'var(--warning)' : 'var(--accent)'
    let earlyMin = 0
    if (rec && !isArrival) {
      const sched = isBoth ? trip.schedDep : trip.schedTime
      if (sched && rec.actual_departure) {
        const [ah, am] = String(rec.actual_departure).slice(11, 16).split(':').map(Number)
        const [sh, sm] = sched.split(':').map(Number)
        let d = (ah * 60 + am) - (sh * 60 + sm)
        if (d < -720) d += 1440; else if (d > 720) d -= 1440
        if (d < 0) earlyMin = -d
      }
    }
    return { isBoth, isArrival, rec, arrRec, dRec, isEntry, isComplete, isCancelled, tripShipments, bt, stn, edge, earlyMin }
  }
  const renderTripCard = trip => {
    const { isBoth, isArrival, rec, arrRec, dRec, isEntry, isComplete, isCancelled, tripShipments, bt, stn, edge, earlyMin } = tripState(trip)
    const typeChip = isBoth ? { t: isAr ? 'وصول + مغادرة' : 'ARR + DEP', bg: 'var(--surface-2)', c: 'var(--text-2)' }
      : isArrival ? { t: isAr ? 'وصول' : 'ARR', bg: 'var(--success-bg)', c: 'var(--success)' } : { t: isAr ? 'مغادرة' : 'DEP', bg: 'var(--info-bg)', c: 'var(--info)' }
    const chipStyle = (bg, c) => ({ background: bg, color: c, borderRadius: 99, padding: '1px 9px', fontSize: '0.64rem', fontWeight: 800, whiteSpace: 'nowrap' })
    // العدّ التنازلي / التأخر عن الإدخال (لليوم فقط)
    const nowD = new Date(), nowM = nowD.getHours() * 60 + nowD.getMinutes(), tMn = tMin(trip)
    const cdn = date === todayStr() && !isEntry && !isCancelled ? tMn - nowM : null
    const cdnChip = cdn == null ? null : cdn < -5
      ? { t: isAr ? 'بانتظار الإدخال' : 'Awaiting entry', bg: 'var(--warning-bg)', c: 'var(--warning)' }
      : { t: cdn <= 0 ? (isAr ? 'الآن' : 'Now') : (isAr ? `بعد ${cdn >= 60 ? `${Math.floor(cdn / 60)}س ${cdn % 60}د` : `${cdn} د`}` : `in ${cdn} min`), bg: cdn <= 15 ? 'var(--success-bg)' : 'var(--surface-2)', c: cdn <= 15 ? 'var(--success)' : 'var(--text-2)' }
    const route = (from, to) => (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.45 }}>{stn(from)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.45, textAlign: 'end' }}>{stn(to)}</span>
      </div>
    )
    const timeBox = (label, t) => (
      <div style={{ textAlign: 'center', background: 'var(--surface)', borderRadius: 10, padding: '6px 10px', minWidth: 70 }}>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: '1.02rem', color: 'var(--text-1)' }}>{t || '—'}</div>
        <div style={{ fontSize: '0.58rem', color: 'var(--text-3)', fontWeight: 700 }}>{label}</div>
      </div>
    )
    return (
      <div key={trip._key} dir="ltr" style={{ border: '1px solid var(--border-2)', borderInlineStart: `4px solid ${edge}`, borderRadius: 12, background: 'var(--card)', padding: '10px 12px', opacity: isCancelled ? 0.5 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)', textDecoration: isCancelled ? 'line-through' : 'none' }}>{trip.trip_number}</span>
              <span style={chipStyle(typeChip.bg, typeChip.c)}>{typeChip.t}</span>
              {(trip.is_rf || trip.is_extra || rec?.is_extra_trip) && <span style={chipStyle('var(--info-bg)', 'var(--info)')}>RF</span>}
              {bt && <span style={chipStyle('var(--surface-2)', 'var(--text-2)')}>{isAr ? bt.ar : bt.en}</span>}
              {trip.enabled === false && <span style={chipStyle('var(--surface-2)', 'var(--text-3)')}>{isAr ? 'معلّقة' : 'OFF'}</span>}
              {tripShipments.map((sh, si) => <span key={si} style={chipStyle('var(--warning-bg)', 'var(--warning)')}><RouteText from={sh.from_st?.name_ar} to={sh.to_st?.name_ar} /></span>)}
            </div>
            {trip.trip_name && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{trip.trip_name}</div>}
            {cdnChip && <span style={{ ...chipStyle(cdnChip.bg, cdnChip.c), display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, padding: '2px 10px' }}>{cdn < -5 && <i className="tp-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }} />}{cdnChip.t}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {isBoth ? <>{timeBox(isAr ? 'مغادرة' : 'Dep', trip.schedDep)}{timeBox(isAr ? 'وصول' : 'Arr', trip.schedArr)}</> : timeBox(isAr ? 'المجدول' : 'Sched.', trip.schedTime)}
          </div>
        </div>

        <div style={{ margin: '10px 0' }}>
          {isBoth ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><span style={{ ...chipStyle('var(--info-bg)', 'var(--info)'), marginInlineEnd: 6 }}>{isAr ? 'مغادرة' : 'DEP'}</span>{route(trip.depFromStation, trip.depToStation)}</div>
              <div><span style={{ ...chipStyle('var(--success-bg)', 'var(--success)'), marginInlineEnd: 6 }}>{isAr ? 'وصول' : 'ARR'}</span>{route(trip.from_station, trip.to_station)}</div>
            </div>
          ) : route(trip.from_station, trip.to_station)}
        </div>

        {/* التنفيذ */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '8px 10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: '0.74rem' }}>
          {isEntry ? (
            <>
              {isBoth && !isComplete && <span style={chipStyle('var(--warning-bg)', 'var(--warning)')}>{isAr ? (rec ? 'ناقص: الوصول' : 'ناقص: المغادرة') : (rec ? 'Missing arrival' : 'Missing departure')}</span>}
              {rec && !isArrival && (earlyMin > 0
                ? <span style={chipStyle('var(--warning-bg)', 'var(--warning)')}>⚠ {isAr ? `غادرت قبل موعدها (${earlyMin} د)` : `Left ${earlyMin} min early`}</span>
                : rec.departure_accuracy ? <span className={accuracyColor(rec.departure_accuracy)}>{isAr ? accuracyAr(rec.departure_accuracy) : rec.departure_accuracy}</span> : null)}
              {rec?.actual_departure && !isArrival && <span style={{ fontFamily: MONO, color: 'var(--text-2)' }}>{isAr ? 'فعلي' : 'act.'} {String(rec.actual_departure).slice(11, 16)}</span>}
              {dRec?.bus_number && <span style={{ fontFamily: MONO, fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'حافلة' : 'bus'} {dRec.bus_number}</span>}
              {isBoth && arrRec?.passenger_count > 0 && <span style={{ fontFamily: MONO, color: 'var(--text-2)' }}>↓ {arrRec.passenger_count}</span>}
              {rec?.passenger_count > 0 && <span style={{ fontFamily: MONO, color: 'var(--text-2)' }}>{isBoth ? '↑ ' : ''}{rec.passenger_count} {isAr ? 'راكب' : 'pax'}</span>}
              {dRec?.operational_status && dRec.operational_status !== 'Normal' && <span style={{ color: 'var(--danger)', fontWeight: 800 }}>{isAr ? TRIP_STATUSES.find(x => x.value === dRec.operational_status)?.ar : dRec.operational_status}</span>}
            </>
          ) : trip.upstream || (isArrival && trip.crossActualDep) ? (
            <>
              <UpstreamChip up={trip.upstream} isAr={isAr} />
              {trip.crossActualDep && <span style={chipStyle('var(--info-bg)', 'var(--info)')}>{isAr ? 'غادر' : 'Departed'} {new Date(trip.crossActualDep).toISOString().slice(11, 16)}</span>}
            </>
          ) : <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? 'لم تُدخل بعد' : 'Not entered yet'}</span>}
        </div>

        {/* إجراءات */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          {canEdit ? (
            <button onClick={() => setModal({ trip, record: rec ?? null, arrivalRecord: arrRec ?? null, combined: isBoth, isArrival, suggestedBusNumber: trip.upstream?.bus_number ?? null, schedTime: isBoth ? trip.schedDep : trip.schedTime })}
              style={{ flex: 1, minHeight: 42, borderRadius: 10, border: isEntry ? '1px solid var(--border-2)' : 'none', background: isEntry ? 'var(--card)' : 'var(--solid-btn)', color: isEntry ? 'var(--text-1)' : '#fff', fontWeight: 800, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              {isEntry ? (isComplete ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'إكمال' : 'Complete')) : (isAr ? '+ إدخال' : '+ Enter')}
            </button>
          ) : <span style={{ flex: 1, textAlign: 'center', fontSize: '0.74rem', fontWeight: 700, color: isEntry ? 'var(--success)' : 'var(--text-3)' }}>{isEntry ? (isAr ? 'تم الإدخال' : 'Entered') : (isAr ? 'لم تُدخل' : 'Not entered')}</span>}
          {trip.is_rf && canManageRf && allowCap('transport_delete_rf') && (
            <button onClick={() => deleteRfTrip(trip.id)} title={isAr ? 'حذف الرحلة الإضافية' : 'Delete extra trip'} aria-label={isAr ? 'حذف الرحلة الإضافية' : 'Delete extra trip'}
              style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--danger)', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
          )}
          {adminLike && allowCap('transport_manage_trips') && (
            <button onClick={() => suspendStationTrip(trip.id, trip.role)} title={isAr ? 'إخفاء' : 'Hide'} aria-label={isAr ? 'إخفاء الرحلة' : 'Hide trip'}
              style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--text-3)', fontSize: '1rem', cursor: 'pointer' }}>—</button>
          )}
        </div>
      </div>
    )
  }

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
          {adminLike && allowCap('transport_upload_schedule') && (
            <button onClick={() => setShowUpload(true)}
              className="h-9 flex items-center bg-nwbus-primary text-white rounded-lg px-3.5 text-xs font-semibold hover:opacity-90">
              {isAr ? 'رفع جدول الرحلات' : 'Upload Schedule'}
            </button>
          )}
          {/* New permanent trip — admin only */}
          {adminLike && allowCap('transport_manage_trips') && (
            <button onClick={() => setShowNewTrip(true)}
              className="h-9 flex items-center bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 text-xs font-semibold hover:border-gray-400 transition-colors">
              {isAr ? 'رحلة جديدة' : 'New Trip'}
            </button>
          )}
          {/* Manage manually added trips — admin only */}
          {adminLike && allowCap('transport_manage_trips') && (
            <button onClick={() => setShowManualTrips(true)}
              className="h-9 flex items-center bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 text-xs font-semibold hover:border-gray-400 transition-colors">
              {isAr ? 'الرحلات المضافة' : 'Added Trips'}
            </button>
          )}
          {/* Select station trips — supervisor & admin */}
          {adminLike && allowCap('transport_manage_trips') && stationId && (
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
          {(canManageRf && allowCap('transport_manage_trips')) && (
            <button onClick={() => setShowExtra(true)}
              className="h-9 flex items-center bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 text-xs font-semibold hover:border-gray-400 transition-colors">
              {isAr ? 'رحلة إضافية (RF)' : 'Extra Trip (RF)'}
            </button>
          )}
          {/* Station selector — admin/accountant always, supervisor when multi-station */}
          {(isGeneralAdmin || ((isStationAdmin || isAccountant || workStations?.length > 1) && stations.length > 1)) && stations.length > 0 && (
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


      {/* لوحة الترحيل: حلقة الإنجاز + مؤشرات اليوم + تقدّم الورديات */}
      {viewMode === 'station' && (
      <div className="tp-hero" style={{ background: 'linear-gradient(135deg, var(--solid-1), var(--solid-2))', color: '#fff', borderRadius: 18, padding: '18px 22px', marginBottom: 16, boxShadow: 'var(--shadow-lg)' }}>
        <div className="tp-ring" style={{ position: 'relative' }}>
          <svg width="100%" height="100%" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="10" />
            <circle cx="56" cy="56" r="48" fill="none" stroke={enteredPct === 100 ? '#34D399' : '#F5A623'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(enteredPct / 100) * 301.6} 301.6`} style={{ transition: 'stroke-dasharray .7s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} dir="ltr">
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 800, fontSize: '1.7rem', lineHeight: 1 }}>{enteredPct}%</span>
            <span style={{ fontSize: '0.62rem', opacity: 0.75, fontWeight: 700, marginTop: 3 }}>{isAr ? 'الإدخال' : 'entered'}</span>
          </div>
        </div>
        <div className="tp-head">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, fontSize: '1.02rem' }}>{selectedStationName || (isAr ? 'الترحيل' : 'Transportation')}</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.75 }} dir="ltr">{date}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: '0.78rem', opacity: 0.85 }} dir="ltr">{entered} / {total} {isAr ? 'رحلة' : 'trips'}</span>
          </div>
        </div>
        <div className="tp-kpis">
            {[
              [isAr ? 'إجمالي الرحلات' : 'Trips', total, '#fff'],
              [isAr ? 'التزام بالموعد' : 'On-time', punctPct != null ? `${punctPct}%` : '—', punctPct != null && punctPct >= 85 ? '#34D399' : punctPct != null && punctPct < 70 ? '#F87171' : '#fff'],
              [isAr ? 'متأخرة' : 'Delayed', delayed, delayed > 0 ? '#F87171' : '#fff'],
              [isAr ? 'ركاب مرحَّلون' : 'Passengers', paxTotal, '#fff'],
              [isAr ? 'متخلفون' : 'Missed', missedTotal, missedTotal > 0 ? '#FBBF24' : '#fff'],
              [isAr ? 'مغادرة / وصول' : 'Dep / Arr', `${departureCnt} / ${arrivalCnt}`, '#fff'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2, color: c }} dir="ltr">{v}</div>
                <div style={{ fontSize: '0.62rem', opacity: 0.75, fontWeight: 700, marginTop: 2 }}>{l}</div>
              </div>
            ))}
        </div>
        {total > 0 && (
          <div className="tp-shifts" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {shiftProg.map(sp => sp.n > 0 && (
              <div key={sp.k} style={{ flex: '1 1 150px', minWidth: 130 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 800, opacity: 0.9, marginBottom: 4 }}>
                  <span>{isAr ? `الوردية ${sp.lbl}` : `Shift ${sp.lbl}`}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }} dir="ltr">{sp.done}/{sp.n}</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', width: `${(sp.done / sp.n) * 100}%`, background: sp.done === sp.n ? '#34D399' : '#F5A623', borderRadius: 99, transition: 'width .6s ease' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* تبديل العرض: المحطة / الجدول الشامل */}
      <div className="flex border border-gray-300 rounded-md overflow-hidden shrink-0 mb-3 w-fit">
        <button onClick={() => setViewMode('station')}
          className={`px-4 py-2 text-xs font-semibold transition-colors border-e border-gray-300 ${viewMode === 'station' ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {isAr ? 'المحطة' : 'Station'}
        </button>
        {allowCap('transport_schedule_view') && <button onClick={() => setViewMode('schedule')}
          className={`px-4 py-2 text-xs font-semibold transition-colors ${viewMode === 'schedule' ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {isAr ? 'الجدول الشامل' : 'Schedule'}
        </button>}
      </div>

      {viewMode === 'station' && (
      <>
      {/* شريط الأدوات: تصفية + بحث */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {!oneList && <div className="flex border border-gray-300 rounded-md overflow-hidden shrink-0">
          {[
            { val: 'departure', label: isAr ? 'مغادرة' : 'Departures', cnt: departureCnt },
            { val: 'arrival',   label: isAr ? 'وصول' : 'Arrivals',     cnt: arrivalCnt },
            { val: 'all',       label: isAr ? 'الكل' : 'All',          cnt: total },
          ].map((t, i) => (
            <button key={t.val} onClick={() => setFilter(t.val)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors ${i > 0 ? 'border-s border-gray-300' : ''} ${
                effFilter === t.val ? 'bg-nwbus-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {t.label}
              <span className={`font-mono text-[10px] ${effFilter === t.val ? 'opacity-75' : 'text-gray-400'}`}>{t.cnt}</span>
            </button>
          ))}
        </div>}
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
        <>
        <div className="md:hidden"><div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{filtered.map(renderTripCard)}</div></div>
        <div className="hidden md:block">{renderBoard()}</div>
        </>
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
        scheduleLoading
          ? <p className="text-center py-20 text-gray-400 text-sm">{isAr ? 'جارٍ تحميل الجدول…' : 'Loading schedule…'}</p>
          : renderSchedule()
      )}

      {modal && (
        <TripModal
          trip={modal.trip}
          record={modal.record}
          stationId={stationId}
          stationName={selectedStationName || (isAr ? profile?.station?.name_ar : profile?.station?.name_en) || ''}
          stations={stations}
          isArrival={modal.isArrival}
          combined={!!modal.combined}
          arrivalRecord={modal.arrivalRecord}
          schedArrTime={modal.trip?.schedArr}
          suggestedBusNumber={modal.suggestedBusNumber}
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

      {showManualTrips && (
        <ManualTripsModal
          isAr={isAr}
          onClose={() => setShowManualTrips(false)}
          onChanged={fetchData}
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

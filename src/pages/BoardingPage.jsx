import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import QRScannerModal, { parseTicketQR } from '../components/shared/QRScannerModal'

const TODAY = () => new Date().toISOString().slice(0, 10)

/* ─── (QRScanner moved to components/shared/QRScannerModal) ─ */
function _unused({ onScan, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const lastRef = useRef('')
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        video.setAttribute('playsinline', true)
        await video.play()
        setReady(true)

        const tick = () => {
          if (!active) return
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = canvasRef.current
            if (canvas) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              const ctx = canvas.getContext('2d')
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
              if (code?.data && code.data !== lastRef.current) {
                lastRef.current = code.data
                onScan(code.data)
                setTimeout(() => { lastRef.current = '' }, 2500)
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch (e) {
        setErr('تعذّر فتح الكاميرا. تأكد من منح الإذن.')
      }
    })()
    return () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const W = Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 32, 380)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: W, height: W * 0.75, borderRadius: 14, overflow: 'hidden', background: '#111' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {!ready && !err && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.82rem' }}>
            جارٍ فتح الكاميرا...
          </div>
        )}
        {err && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.82rem', padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.7)' }}>
            {err}
          </div>
        )}
        {/* إطار المسح */}
        {ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 170, height: 170, position: 'relative' }}>
              {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
                <div key={i} style={{ position: 'absolute', width: 26, height: 26, ...pos,
                  borderTop:    pos.top    === 0 ? '3px solid #5B5BD6' : 'none',
                  borderBottom: pos.bottom === 0 ? '3px solid #5B5BD6' : 'none',
                  borderLeft:   pos.left   === 0 ? '3px solid #5B5BD6' : 'none',
                  borderRight:  pos.right  === 0 ? '3px solid #5B5BD6' : 'none',
                }} />
              ))}
            </div>
          </div>
        )}
      </div>
      <p style={{ color: '#ccc', fontSize: '0.82rem', margin: 0 }}>وجّه الكاميرا نحو باركود التذكرة</p>
      <button onClick={onClose} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: '#2a2a2a', color: '#fff', cursor: 'pointer', fontSize: '0.88rem' }}>إغلاق</button>
    </div>
  )
}

/* ─── Stat chip ──────────────────────────────────────────── */
function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 18px', background: 'var(--surface-2)', borderRadius: 8, minWidth: 80 }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: accent || 'var(--text-1)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

/* ─── صفحة الإقلاع الرئيسية ─────────────────────────────── */
export default function BoardingPage() {
  const { profile, isGeneralAdmin, isAreaSupervisor, allowedStationIds } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [stations, setStations] = useState([])
  const [selectedStation, setSelectedStation] = useState(profile?.station_id ?? '')
  const stationId = selectedStation || null

  // جلب المحطات حسب الدور
  useEffect(() => {
    if (isGeneralAdmin) {
      supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data) })
    } else if (isAreaSupervisor && allowedStationIds?.length) {
      supabase.from('stations').select('id, name_ar, name_en').in('id', allowedStationIds).eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data) })
    } else if (profile?.station_id) {
      setStations([{ id: profile.station_id, name_ar: profile.station?.name_ar || '' }])
      setSelectedStation(profile.station_id)
    }
  }, [isGeneralAdmin, isAreaSupervisor, profile?.station_id])

  // اختيار أول محطة تلقائياً للأدمن
  useEffect(() => {
    if (!selectedStation && stations.length) setSelectedStation(stations[0].id)
  }, [stations])

  const [date, setDate] = useState(TODAY())
  const [trips, setTrips] = useState([])
  const [sessions, setSessions] = useState({})       // tripId → session
  const [loadingTrips, setLoadingTrips] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [session, setSession] = useState(null)
  const [passengers, setPassengers] = useState([])
  const [luggage, setLuggage] = useState([])
  const [tab, setTab] = useState('passengers')
  const [showScanner, setShowScanner] = useState(false)
  const [manualTicket, setManualTicket] = useState('')
  const [scanError, setScanError] = useState('')
  const [adding, setAdding] = useState(false)
  const [luggageForm, setLuggageForm] = useState({ sticker_number: '', passenger_name: '', bag_count: 1, destination: '' })
  const [saving, setSaving] = useState(false)
  const [startingSession, setStartingSession] = useState(false)

  const canManage = ['general_admin', 'station_admin', 'shift_supervisor'].includes(profile?.role)

  /* ── جلب رحلات المغادرة ── */
  useEffect(() => {
    if (!stationId) return
    loadTrips()
  }, [stationId, date])

  async function loadTrips() {
    setLoadingTrips(true)
    const tripFields = `id, trip_number, trip_name, scheduled_departure, bus_type, is_active, is_rf, rf_date, from_station_id, to_station_id, from_station:from_station_id(name_ar), to_station:to_station_id(name_ar)`

    const [{ data: stRows }, { data: sesRows }] = await Promise.all([
      supabase.from('station_trips')
        .select(`dep_enabled, departure_time, trip:trip_schedule_id(${tripFields})`)
        .eq('station_id', stationId),
      supabase.from('boarding_sessions')
        .select('*')
        .eq('station_id', stationId)
        .eq('record_date', date),
    ])

    // بناء خريطة الجلسات
    const sesMap = {}
    ;(sesRows ?? []).forEach(s => { sesMap[s.trip_schedule_id] = s })
    setSessions(sesMap)

    // تصفية رحلات المغادرة النشطة
    const deps = []
    ;(stRows ?? []).forEach(r => {
      const tr = r.trip
      if (!tr || !tr.is_active) return
      if (tr.is_rf && tr.rf_date !== date) return
      if (r.dep_enabled === false) return
      // رحلات الانطلاق من هذه المحطة فقط
      if (tr.from_station_id !== stationId) return
      const time = r.departure_time || tr.scheduled_departure?.slice(0, 5) || ''
      deps.push({ ...tr, schedTime: time })
    })

    deps.sort((a, b) => a.schedTime.localeCompare(b.schedTime))
    setTrips(deps)
    setLoadingTrips(false)
  }

  /* ── فتح جلسة رحلة ── */
  async function openSession(trip) {
    setSelectedTrip(trip)
    setTab('passengers')
    setScanError('')
    const existing = sessions[trip.id]
    if (existing) {
      setSession(existing)
      await loadSessionData(existing.id)
    } else {
      setSession(null)
      setPassengers([])
      setLuggage([])
    }
  }

  async function loadSessionData(sessionId) {
    const [{ data: pax }, { data: lug }] = await Promise.all([
      supabase.from('boarded_passengers').select('*').eq('session_id', sessionId).order('scanned_at'),
      supabase.from('luggage_items').select('*').eq('session_id', sessionId).order('registered_at'),
    ])
    setPassengers(pax ?? [])
    setLuggage(lug ?? [])
  }

  /* ── Realtime ── */
  useEffect(() => {
    if (!session?.id) return
    const ch = supabase.channel(`boarding-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boarded_passengers', filter: `session_id=eq.${session.id}` }, () => loadSessionData(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'luggage_items', filter: `session_id=eq.${session.id}` }, () => loadSessionData(session.id))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [session?.id])

  /* ── بدء الإقلاع ── */
  async function startBoarding() {
    if (!selectedTrip || !canManage) return
    setStartingSession(true)
    const { data, error } = await supabase.from('boarding_sessions').insert({
      trip_schedule_id: selectedTrip.id,
      station_id: stationId,
      record_date: date,
      created_by: profile.auth_id,
    }).select().single()
    setStartingSession(false)
    if (error) { alert(error.message); return }
    setSession(data)
    setSessions(prev => ({ ...prev, [selectedTrip.id]: data }))
    setPassengers([])
    setLuggage([])
  }

  /* ── إغلاق الجلسة ── */
  async function closeSession() {
    if (!session || !canManage) return
    if (!confirm('إغلاق جلسة الإقلاع؟')) return
    const { data } = await supabase.from('boarding_sessions')
      .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: profile.auth_id })
      .eq('id', session.id).select().single()
    if (data) { setSession(data); setSessions(prev => ({ ...prev, [selectedTrip.id]: data })) }
  }

  const [lastRaw, setLastRaw] = useState('')   // عرض آخر QR خام للتشخيص

  /* ── تحليل بيانات QR ── */
  function parseQR(raw) {
    const s = raw.trim()
    // 1. JSON
    try {
      const obj = JSON.parse(s)
      return {
        ticket_number:  obj.ticketNumber  || obj.ticket_no   || obj.ticketNo   || obj.id       || s,
        passenger_name: obj.passengerName || obj.name        || obj.passenger  || '',
        passenger_id:   obj.nationalId    || obj.passengerId || obj.id_number  || '',
        seat_number:    obj.seatNumber    || obj.seat        || '',
        fare_type:      obj.fareType      || obj.fare        || '',
        origin:         obj.origin        || obj.from        || '',
        destination:    obj.destination   || obj.to          || '',
      }
    } catch {}

    // 2. URL params
    try {
      const url = new URL(s.includes('://') ? s : 'https://x.com?' + s)
      const p = url.searchParams
      const ticket = p.get('ticket') || p.get('ticketNo') || p.get('id') || url.pathname.split('/').pop()
      if (ticket) return {
        ticket_number:  ticket,
        passenger_name: p.get('name') || p.get('passengerName') || '',
        passenger_id:   p.get('nationalId') || p.get('id') || '',
        seat_number:    p.get('seat') || p.get('seatNo') || '',
        fare_type:      p.get('fare') || p.get('fareType') || '',
        origin:         p.get('from') || p.get('origin') || '',
        destination:    p.get('to') || p.get('destination') || '',
      }
    } catch {}

    // 3. pipe | أو فاصلة ,
    if (s.includes('|') || s.includes(',')) {
      const parts = s.split(/[|,]/).map(x => x.trim())
      return {
        ticket_number:  parts[0] || s,
        passenger_name: parts[1] || '',
        passenger_id:   parts[2] || '',
        origin:         parts[3] || '',
        destination:    parts[4] || '',
        seat_number:    parts[5] || '',
        fare_type:      parts[6] || '',
      }
    }

    // 4. سطور key:value
    if (s.includes('\n') || s.includes(':')) {
      const lines = s.split(/\n|;/)
      const map = {}
      lines.forEach(l => {
        const idx = l.indexOf(':')
        if (idx > 0) {
          const key = l.slice(0, idx).trim().toLowerCase().replace(/[\s_-]/g, '')
          map[key] = l.slice(idx + 1).trim()
        }
      })
      return {
        ticket_number:  map['ticketno'] || map['ticket'] || map['ticketnumber'] || map['rqm'] || s,
        passenger_name: map['name'] || map['passengername'] || map['alaism'] || '',
        passenger_id:   map['nationalid'] || map['id'] || map['alhwyt'] || '',
        seat_number:    map['seat'] || map['seaatno'] || map['almqad'] || '',
        fare_type:      map['faretype'] || map['fare'] || map['standard'] || '',
        origin:         map['from'] || map['origin'] || '',
        destination:    map['to'] || map['destination'] || '',
      }
    }

    // 5. النص كاملاً كرقم تذكرة
    return { ticket_number: s, passenger_name: '', passenger_id: '', seat_number: '', fare_type: '', origin: '', destination: '' }
  }

  /* ── مسح تذكرة ── */
  async function handleScan(parsed) {
    setShowScanner(false)
    setLastRaw(parsed.raw || parsed.ticket_number || '')
    await submitTicket(parsed, parsed.raw || null)
  }

  async function handleManualAdd() {
    const t = manualTicket.trim()
    if (!t) return
    await submitTicket(parseTicketQR(t), null)
    setManualTicket('')
  }

  async function submitTicket(parsed, rawQr) {
    if (!session) return
    setScanError('')
    setAdding(true)
    const { data, error } = await supabase.from('boarded_passengers').insert({
      session_id:     session.id,
      ticket_number:  parsed.ticket_number,
      passenger_name: parsed.passenger_name || null,
      passenger_id:   parsed.passenger_id   || null,
      seat_number:    parsed.seat_number     || null,
      fare_type:      parsed.fare_type       || null,
      origin:         parsed.origin          || null,
      destination:    parsed.destination     || null,
      raw_qr:         rawQr,
      scanned_by:     profile.auth_id,
      status:         'valid',
    }).select().single()
    setAdding(false)

    if (error) {
      if (error.code === '23505') {
        setScanError(`تذكرة مكررة: ${ticketNum}`)
        // تحديث سجل الركاب لإظهار المكرر
        await supabase.from('boarded_passengers').update({ status: 'duplicate' }).eq('session_id', session.id).eq('ticket_number', ticketNum)
      } else {
        setScanError(error.message)
      }
      return
    }
    setPassengers(prev => [...prev, data])
  }

  /* ── إضافة أمتعة ── */
  async function addLuggage(e) {
    e.preventDefault()
    if (!session || !luggageForm.sticker_number.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('luggage_items').insert({
      session_id: session.id,
      sticker_number: luggageForm.sticker_number.trim(),
      passenger_name: luggageForm.passenger_name.trim(),
      bag_count: parseInt(luggageForm.bag_count) || 1,
      destination: luggageForm.destination.trim(),
      registered_by: profile.auth_id,
    }).select().single()
    setSaving(false)
    if (error) { alert(error.message); return }
    setLuggage(prev => [...prev, data])
    setLuggageForm({ sticker_number: '', passenger_name: '', bag_count: 1, destination: '' })
  }

  /* ── حذف مسافر / أمتعة ── */
  async function deletePassenger(id) {
    await supabase.from('boarded_passengers').delete().eq('id', id)
    setPassengers(prev => prev.filter(p => p.id !== id))
  }
  async function deleteLuggage(id) {
    await supabase.from('luggage_items').delete().eq('id', id)
    setLuggage(prev => prev.filter(l => l.id !== id))
  }

  /* ── طباعة الكشف ── */
  function printManifest() {
    const trip = selectedTrip
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>كشف الإقلاع</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:13px}h1{font-size:16px;margin-bottom:4px}h2{font-size:13px;font-weight:normal;color:#555;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f0f0f0;font-weight:600}@media print{button{display:none}}</style>
    </head><body>
    <h1>كشف الإقلاع — رحلة ${trip?.trip_number || ''}</h1>
    <h2>${trip?.from_station?.name_ar || ''} → ${trip?.to_station?.name_ar || ''} | ${trip?.schedTime || ''} | حافلة: ${session?.bus_number || '—'} | التاريخ: ${date}</h2>
    <h3>الركاب (${passengers.length})</h3>
    <table><tr><th>#</th><th>رقم التذكرة</th><th>الاسم</th><th>الهوية</th><th>المقعد</th><th>نوع التذكرة</th><th>الحالة</th></tr>
    ${passengers.map((p, i) => `<tr><td>${i + 1}</td><td>${p.ticket_number}</td><td>${p.passenger_name || '—'}</td><td>${p.passenger_id || '—'}</td><td>${p.seat_number || '—'}</td><td>${p.fare_type || '—'}</td><td>${p.status === 'duplicate' ? '🔴 مكرر' : '✓'}</td></tr>`).join('')}
    </table>
    <h3 style="margin-top:16px">الأمتعة (${luggage.reduce((s, l) => s + l.bag_count, 0)} حقيبة)</h3>
    <table><tr><th>#</th><th>رقم الملصق</th><th>صاحب الأمتعة</th><th>الوجهة</th><th>عدد الحقائب</th></tr>
    ${luggage.map((l, i) => `<tr><td>${i + 1}</td><td>${l.sticker_number}</td><td>${l.passenger_name || '—'}</td><td>${l.destination || '—'}</td><td>${l.bag_count}</td></tr>`).join('')}
    </table>
    <button onclick="window.print()" style="margin-top:20px;padding:8px 20px">طباعة</button>
    </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  /* ── UI ─────────────────────────────────────────────────── */
  const S = {
    page: { padding: '20px 16px', maxWidth: 900, margin: '0 auto', direction: 'rtl' },
    header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
    title: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 },
    datePicker: { border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', background: 'var(--card)', color: 'var(--text-1)', fontSize: '0.85rem', cursor: 'pointer' },
    grid: { display: 'grid', gridTemplateColumns: selectedTrip ? '1fr 1fr' : '1fr', gap: 12, alignItems: 'start' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.14s' },
    cardActive: { borderColor: '#5B5BD6', boxShadow: '0 0 0 2px rgba(91,91,214,0.18)' },
    tripNum: { fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' },
    tripSub: { fontSize: '0.78rem', color: 'var(--text-2)' },
    badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600, background: color === 'green' ? 'var(--success-bg)' : color === 'amber' ? 'var(--warning-bg)' : 'var(--surface-2)', color: color === 'green' ? 'var(--success)' : color === 'amber' ? 'var(--warning)' : 'var(--text-3)' }),
    panel: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
    panelHead: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--border)' },
    tabBtn: (active) => ({ flex: 1, padding: '10px 0', border: 'none', borderBottom: active ? '2px solid #5B5BD6' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: active ? 700 : 400, color: active ? 'var(--text-1)' : 'var(--text-3)', transition: 'all 0.12s', marginBottom: -1 }),
    input: { flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text-1)', fontSize: '0.85rem', outline: 'none', minWidth: 0 },
    btn: (variant) => ({ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: variant === 'primary' ? '#5B5BD6' : variant === 'danger' ? 'var(--danger-bg)' : variant === 'success' ? 'var(--success-bg)' : 'var(--surface-2)', color: variant === 'primary' ? '#fff' : variant === 'danger' ? 'var(--danger)' : variant === 'success' ? 'var(--success)' : 'var(--text-2)', transition: 'opacity 0.12s' }),
    row: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' },
  }

  const validPax = passengers.filter(p => p.status !== 'duplicate').length
  const dupPax = passengers.filter(p => p.status === 'duplicate').length
  const totalBags = luggage.reduce((s, l) => s + (l.bag_count || 1), 0)

  return (
    <div style={S.page}>
      {/* ─ رأس الصفحة ─ */}
      <div style={S.header}>
        <h1 style={S.title}>نظام الإقلاع</h1>
        {(isGeneralAdmin || isAreaSupervisor) && stations.length > 1 && (
          <select value={selectedStation} onChange={e => { setSelectedStation(e.target.value); setSelectedTrip(null); setSession(null) }}
            style={{ ...S.datePicker, minWidth: 140 }}>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </select>
        )}
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setSelectedTrip(null); setSession(null) }} style={S.datePicker} />
      </div>

      {!stationId && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.9rem' }}>
          لا يوجد محطة مرتبطة بالحساب
        </div>
      )}

      {stationId && (
        <div style={S.grid}>
          {/* ─ قائمة الرحلات ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>رحلات المغادرة</p>
            {loadingTrips && <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>جارٍ التحميل...</p>}
            {!loadingTrips && trips.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.82rem', background: 'var(--card)', borderRadius: 10, border: '1px dashed var(--border)' }}>
                لا توجد رحلات مغادرة لهذا اليوم
              </div>
            )}
            {trips.map(trip => {
              const ses = sessions[trip.id]
              const isActive = ses?.status === 'active'
              const isClosed = ses?.status === 'closed'
              const isSelected = selectedTrip?.id === trip.id
              return (
                <div key={trip.id}
                  style={{ ...S.card, ...(isSelected ? S.cardActive : {}) }}
                  onClick={() => openSession(trip)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={S.tripNum}>{trip.trip_number} {trip.trip_name ? `— ${trip.trip_name}` : ''}</p>
                      <p style={S.tripSub}>{trip.from_station?.name_ar || ''} → {trip.to_station?.name_ar || ''}</p>
                      <p style={{ ...S.tripSub, marginTop: 2 }}>{trip.schedTime || '—'} · {trip.bus_type || ''}</p>
                    </div>
                    <div>
                      {isClosed
                        ? <span style={S.badge()}>مغلقة</span>
                        : isActive
                          ? <span style={S.badge('green')}>نشطة</span>
                          : <span style={S.badge('amber')}>لم تبدأ</span>
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─ لوحة الإقلاع ─ */}
          {selectedTrip && (
            <div style={S.panel}>
              {/* رأس اللوحة */}
              <div style={S.panelHead}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-1)' }}>
                    {selectedTrip.trip_number}
                    <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: '0.8rem', marginRight: 8 }}>
                      {selectedTrip.from_station?.name_ar} → {selectedTrip.to_station?.name_ar}
                    </span>
                  </p>
                  {session?.bus_number && (
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-3)' }}>حافلة: {session.bus_number}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {session?.status === 'active' && canManage && (
                    <button style={S.btn('danger')} onClick={closeSession}>إغلاق الجلسة</button>
                  )}
                  {session && (
                    <button style={S.btn()} onClick={printManifest}>طباعة الكشف</button>
                  )}
                  <button style={{ ...S.btn(), padding: '6px 8px' }} onClick={() => setSelectedTrip(null)}>✕</button>
                </div>
              </div>

              {/* بدء الجلسة */}
              {!session && canManage && (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginBottom: 16 }}>لم تبدأ جلسة الإقلاع لهذه الرحلة</p>
                  <button style={{ ...S.btn('primary'), padding: '10px 28px', fontSize: '0.9rem' }}
                    onClick={startBoarding} disabled={startingSession}>
                    {startingSession ? 'جارٍ البدء...' : 'ابدأ الإقلاع'}
                  </button>
                </div>
              )}

              {!session && !canManage && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
                  في انتظار بدء المشرف لجلسة الإقلاع
                </div>
              )}

              {session && (
                <>
                  {/* إحصائيات */}
                  <div style={{ padding: '12px 16px', display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <Stat label="ركاب صالحون" value={validPax} accent="var(--success)" />
                    {dupPax > 0 && <Stat label="مكررة" value={dupPax} accent="var(--danger)" />}
                    <Stat label="حقائب" value={totalBags} accent="var(--info)" />
                    <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>
                      <span style={S.badge(session.status === 'active' ? 'green' : '')}>
                        {session.status === 'active' ? 'جلسة نشطة' : 'جلسة مغلقة'}
                      </span>
                    </div>
                  </div>

                  {/* تبويبات */}
                  <div style={S.tabs}>
                    <button style={S.tabBtn(tab === 'passengers')} onClick={() => setTab('passengers')}>
                      الركاب ({passengers.length})
                    </button>
                    <button style={S.tabBtn(tab === 'luggage')} onClick={() => setTab('luggage')}>
                      الأمتعة ({luggage.length})
                    </button>
                  </div>

                  {/* تبويب الركاب */}
                  {tab === 'passengers' && (
                    <div>
                      {session.status === 'active' && (
                        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {/* مسح QR */}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ ...S.btn('primary'), display: 'flex', alignItems: 'center', gap: 6 }}
                              onClick={() => setShowScanner(true)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                <path d="M14 14h.01M14 17h.01M17 14h.01M17 17h3"/><path d="M20 14h.01M20 17h.01M20 20h.01"/>
                              </svg>
                              مسح QR
                            </button>
                            <input
                              style={S.input}
                              placeholder="رقم التذكرة يدوياً..."
                              value={manualTicket}
                              onChange={e => setManualTicket(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                              dir="ltr"
                            />
                            <button style={S.btn('success')} onClick={handleManualAdd} disabled={adding}>
                              {adding ? '...' : 'إضافة'}
                            </button>
                          </div>
                          {scanError && (
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--danger)', background: 'var(--danger-bg)', padding: '6px 10px', borderRadius: 6 }}>
                              {scanError}
                            </p>
                          )}
                          {lastRaw && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', background: 'var(--surface-2)', padding: '5px 8px', borderRadius: 5, direction: 'ltr', wordBreak: 'break-all' }}>
                              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>QR raw: </span>{lastRaw}
                            </div>
                          )}
                        </div>
                      )}

                      {/* قائمة الركاب */}
                      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                        {passengers.length === 0 && (
                          <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: '0.82rem' }}>لا يوجد ركاب بعد</p>
                        )}
                        {passengers.map((p, i) => (
                          <div key={p.id} style={{ ...S.row, background: p.status === 'duplicate' ? 'var(--danger-bg)' : 'transparent' }}>
                            <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', minWidth: 20 }}>{i + 1}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-1)', flex: 1, letterSpacing: '0.02em', direction: 'ltr' }}>{p.ticket_number}</span>
                            {p.passenger_name && <span style={{ color: 'var(--text-2)', fontSize: '0.78rem' }}>{p.passenger_name}</span>}
                            {p.seat_number && <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>م{p.seat_number}</span>}
                            {p.status === 'duplicate' && <span style={{ color: 'var(--danger)', fontSize: '0.7rem', fontWeight: 700 }}>مكرر</span>}
                            {session.status === 'active' && (
                              <button onClick={() => deletePassenger(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 4px', fontSize: '0.9rem' }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* تبويب الأمتعة */}
                  {tab === 'luggage' && (
                    <div>
                      {session.status === 'active' && (
                        <form onSubmit={addLuggage} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input style={S.input} placeholder="رقم الملصق *" value={luggageForm.sticker_number}
                              onChange={e => setLuggageForm(f => ({ ...f, sticker_number: e.target.value }))} required dir="ltr" />
                            <input style={{ ...S.input, maxWidth: 72 }} type="number" min="1" max="20" placeholder="عدد"
                              value={luggageForm.bag_count}
                              onChange={e => setLuggageForm(f => ({ ...f, bag_count: e.target.value }))} />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input style={S.input} placeholder="اسم صاحب الأمتعة" value={luggageForm.passenger_name}
                              onChange={e => setLuggageForm(f => ({ ...f, passenger_name: e.target.value }))} />
                            <input style={S.input} placeholder="الوجهة" value={luggageForm.destination}
                              onChange={e => setLuggageForm(f => ({ ...f, destination: e.target.value }))} />
                            <button type="submit" style={S.btn('primary')} disabled={saving}>إضافة</button>
                          </div>
                        </form>
                      )}

                      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                        {luggage.length === 0 && (
                          <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: '0.82rem' }}>لا توجد أمتعة مسجلة</p>
                        )}
                        {luggage.map((l, i) => (
                          <div key={l.id} style={S.row}>
                            <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', minWidth: 20 }}>{i + 1}</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-1)', direction: 'ltr' }}>{l.sticker_number}</span>
                            {l.passenger_name && <span style={{ color: 'var(--text-2)', fontSize: '0.8rem', flex: 1 }}>{l.passenger_name}</span>}
                            {l.destination && <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>{l.destination}</span>}
                            <span style={{ color: 'var(--info)', fontSize: '0.75rem', fontWeight: 600 }}>{l.bag_count} حقيبة</span>
                            {session.status === 'active' && (
                              <button onClick={() => deleteLuggage(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 4px' }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showScanner && <QRScannerModal onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  )
}

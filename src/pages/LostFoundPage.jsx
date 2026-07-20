import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ITEM_TYPES } from '../utils/constants'
import DatePicker from '../components/shared/DatePicker'
import { todayStr } from '../utils/dates'

const toLatinNums = v => v.replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => d.charCodeAt(0) - 1632)

const STATUS_LABELS = {
  ar: { unclaimed: 'غير مستلمة', claimed: 'مستلمة', disposed: 'تم التخلص منها' },
  en: { unclaimed: 'Unclaimed', claimed: 'Claimed', disposed: 'Disposed' },
}
const STATUS_COLORS = {
  unclaimed: 'bg-yellow-100 text-yellow-800',
  claimed:   'bg-green-100 text-green-800',
  disposed:  'bg-gray-100 text-gray-600',
}

/* ── helpers ── */
const nowLocal = () => {
  const d = new Date()
  return d.toLocaleTimeString('ar-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/* ── Searchable station route selector ── */
function StationRouteSelector({ stations, fromId, toId, onFromChange, onToChange }) {
  const [fromQ, setFromQ] = useState('')
  const [toQ,   setToQ]   = useState('')
  const filt = (q) => stations.filter(s => s.name_ar.includes(q) || s.name_en?.toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)' }}>وجهة الرحلة</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>

        {/* من */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600 }}>من</span>
          <input value={fromQ} onChange={e => { setFromQ(e.target.value); onFromChange('') }}
            placeholder="بحث محطة المغادرة..." style={{ ...inp, fontSize: '0.78rem' }} />
          <select value={fromId} onChange={e => onFromChange(e.target.value)} size={4}
            style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
            <option value="">— اختر —</option>
            {filt(fromQ).map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </select>
          {fromId && <span style={{ fontSize: '0.7rem', color: 'var(--brand-900)', fontWeight: 700 }}>✓ {stations.find(s => s.id === fromId)?.name_ar}</span>}
        </div>

        <span style={{ color: 'var(--text-3)', fontSize: '0.9rem', padding: '36px 2px 0' }}>←</span>

        {/* إلى */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600 }}>إلى</span>
          <input value={toQ} onChange={e => { setToQ(e.target.value); onToChange('') }}
            placeholder="بحث محطة الوصول..." style={{ ...inp, fontSize: '0.78rem' }} />
          <select value={toId} onChange={e => onToChange(e.target.value)} size={4}
            style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
            <option value="">— اختر —</option>
            {filt(toQ).map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </select>
          {toId && <span style={{ fontSize: '0.7rem', color: 'var(--brand-900)', fontWeight: 700 }}>✓ {stations.find(s => s.id === toId)?.name_ar}</span>}
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 1 — بلاغ مفقودات
══════════════════════════════════════════════════════════ */
const LOST_QUICK_GROUPS = [
  { label: 'النوع', items: ['شنطة ظهر', 'شنطة يد', 'شنطة سفر', 'حقيبة لابتوب', 'شنطة قماش', 'جوال', 'تابلت', 'محفظة', 'بطاقة هوية', 'جواز سفر', 'مفاتيح', 'ساعة يد', 'نظارة', 'ملابس'] },
  { label: 'الحجم', items: ['صغيرة', 'متوسطة', 'كبيرة'] },
  { label: 'اللون', items: ['سوداء', 'بنية', 'رمادية', 'زرقاء', 'حمراء', 'بيضاء', 'خضراء', 'بيج'] },
  { label: 'الخامة', items: ['جلد', 'قماش', 'بلاستيك', 'نايلون'] },
]

function LostReportTab({ stations, profile, isAr }) {
  const empty = {
    customer_name: '', contact_number: '', item_description: '',
    sticker_number: '', ticket_number: '', bus_number: '', departure_time: '',
    from_station_id: '', to_station_id: '', customer_location_id: '', notes: '',
  }
  const [form, setForm]       = useState(empty)
  const [locSearch, setLocSearch] = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  const filteredLoc = stations.filter(s =>
    !locSearch || s.name_ar.includes(locSearch) || s.name_en?.toLowerCase().includes(locSearch.toLowerCase())
  )

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedChips = form.item_description
    ? form.item_description.split('، ').map(s => s.trim()).filter(Boolean)
    : []

  const toggleChip = word => {
    const cur = new Set(selectedChips)
    cur.has(word) ? cur.delete(word) : cur.add(word)
    set('item_description', [...cur].join('، '))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const { error: err } = await supabase.from('lost_reports').insert({
      ...form,
      from_station_id:      form.from_station_id      || null,
      to_station_id:        form.to_station_id        || null,
      customer_location_id: form.customer_location_id || null,
      item_description:     form.item_description     || null,
      station_id:           profile.station_id,
      created_by:      profile.id,
      created_by_name: profile.full_name_ar,
      report_at:       new Date().toISOString(),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setDone(true)
    setTimeout(() => { setForm(empty); setDone(false) }, 2500)
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>

      {done && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 700, fontSize: '0.88rem' }}>
          ✓ تم تسجيل البلاغ بنجاح
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}></span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>بلاغ مفقودات</span>
          </div>
          {/* Staff name */}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 500 }}>
            {profile?.full_name_ar}
          </span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── إدخال سريع لوصف الغرض المفقود ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>وصف الغرض المفقود — إدخال سريع</p>
              {selectedChips.length > 0 && (
                <button type="button" onClick={() => set('item_description', '')}
                  style={{ fontSize: '0.65rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  مسح الكل
                </button>
              )}
            </div>
            {LOST_QUICK_GROUPS.map(group => (
              <div key={group.label}>
                <p style={{ margin: '0 0 4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-3)' }}>{group.label}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {group.items.map(item => {
                    const active = selectedChips.includes(item)
                    return (
                      <button key={item} type="button" onClick={() => toggleChip(item)}
                        style={{ fontSize: '0.72rem', fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: `1px solid ${active ? 'var(--brand-900)' : 'var(--border)'}`, background: active ? 'var(--brand-900)' : '#fff', color: active ? '#fff' : 'var(--text-2)', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit' }}>
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <Field label="وصف الغرض المفقود *">
            <textarea required rows={2} value={form.item_description} onChange={e => set('item_description', e.target.value)}
              style={{ ...inp, resize: 'none' }} placeholder="صف الغرض بدقة..." />
          </Field>

          {/* Row 1: اسم العميل + رقم التواصل */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="اسم العميل *">
              <input required value={form.customer_name} onChange={e => set('customer_name', e.target.value)}
                style={inp} placeholder="الاسم الكامل" />
            </Field>
            <Field label="رقم التواصل *">
              <input required value={form.contact_number} onChange={e => set('contact_number', toLatinNums(e.target.value))}
                style={inp} placeholder="05xxxxxxxx" dir="ltr" />
            </Field>
          </div>

          {/* مكان العميل الحالي */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)' }}>مكان العميل الحالي</p>
            <input
              value={locSearch}
              onChange={e => { setLocSearch(e.target.value); set('customer_location_id', '') }}
              placeholder="ابحث عن المحطة..."
              style={{ ...inp, marginBottom: 4 }}
            />
            {!form.customer_location_id ? (
              <select value={form.customer_location_id} onChange={e => { set('customer_location_id', e.target.value); setLocSearch(stations.find(s => s.id === e.target.value)?.name_ar || '') }}
                size={3} style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
                <option value="">— اختر المحطة —</option>
                {filteredLoc.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--brand-900) 6%, white)', border: '1px solid color-mix(in srgb, var(--brand-900) 20%, white)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--brand-900)' }}>{stations.find(s => s.id === form.customer_location_id)?.name_ar}</span>
                <button type="button" onClick={() => { set('customer_location_id', ''); setLocSearch('') }}
                  style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>

          {/* Row 2: رقم الاستكر + رقم التذكرة */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="رقم الاستكر">
              <input value={form.sticker_number} onChange={e => set('sticker_number', toLatinNums(e.target.value))}
                style={inp} placeholder="رقم ملصق الحقيبة" dir="ltr" />
            </Field>
            <Field label="رقم التذكرة">
              <input value={form.ticket_number} onChange={e => set('ticket_number', toLatinNums(e.target.value))}
                style={inp} placeholder="رقم تذكرة السفر" dir="ltr" />
            </Field>
          </div>

          {/* Row 3: وجهة الرحلة */}
          <StationRouteSelector
            stations={stations}
            fromId={form.from_station_id}
            toId={form.to_station_id}
            onFromChange={v => set('from_station_id', v)}
            onToChange={v => set('to_station_id', v)}
          />

          {/* Row 4: رقم الحافلة + وقت المغادرة */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="رقم الحافلة">
              <input value={form.bus_number} onChange={e => set('bus_number', toLatinNums(e.target.value))}
                style={inp} placeholder="رقم الحافلة" dir="ltr" />
            </Field>
            <Field label="وقت المغادرة">
              <input
                type="text"
                value={form.departure_time}
                onChange={e => {
                  let v = e.target.value.replace(/[^0-9]/g, '')
                  if (v.length > 4) v = v.slice(0, 4)
                  if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2)
                  set('departure_time', v)
                }}
                placeholder="HH:MM"
                maxLength={5}
                style={{ ...inp, fontFamily: 'monospace', letterSpacing: 2 }}
                dir="ltr"
              />
            </Field>
          </div>

          {/* Notes */}
          <Field label="ملاحظات">
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              style={{ ...inp, resize: 'none' }} placeholder="تفاصيل إضافية..." />
          </Field>

          {/* تاريخ البلاغ — auto */}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textAlign: isAr ? 'right' : 'left' }}>
            تاريخ البلاغ: {new Date().toLocaleDateString('ar-SA-u-ca-gregory')} — {nowLocal()}
          </div>

          <button type="submit" disabled={saving}
            style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'var(--brand-900)', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
            {saving ? 'جارٍ التسجيل...' : 'تسجيل البلاغ'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 2 — تسليم موجودات
══════════════════════════════════════════════════════════ */
function HandoverTab({ profile, isAr }) {
  const [items, setItems]   = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ owner_name: '', owner_contact: '', resolved_date: todayStr(), notes: '' })

  useEffect(() => {
    supabase.from('lost_found_items')
      .select('*')
      .eq('status', 'unclaimed')
      .eq('station_id', profile.station_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [done])

  const filtered = items.filter(i =>
    !search || i.item_description?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleHandover(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('lost_found_items').update({
      status: 'claimed',
      owner_name: form.owner_name,
      owner_contact: form.owner_contact,
      resolved_date: form.resolved_date,
      notes: form.notes,
      updated_by_name: profile.full_name_ar,
      updated_at: new Date().toISOString(),
      delivered_to_client_at: new Date().toISOString(),
    }).eq('id', selected.id)
    setSaving(false)
    setSelected(null)
    setDone(d => !d)
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}></span>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>تسليم موجودات</span>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن موجود..."
            style={{ ...inp, marginBottom: 12, width: '100%', boxSizing: 'border-box' }} />

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', padding: 20 }}>جارٍ التحميل...</p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', padding: 20 }}>لا توجد موجودات غير مستلمة</p>
          ) : filtered.map(item => (
            <div key={item.id} onClick={() => setSelected(item)}
              style={{ padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${selected?.id === item.id ? 'var(--brand-900)' : 'var(--border)'}`, marginBottom: 8, cursor: 'pointer', background: selected?.id === item.id ? 'color-mix(in srgb, var(--brand-900) 5%, white)' : '#fff', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.item_number && <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>#{item.item_number}</span>}
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{item.item_description}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3 }}>
                {item.found_date} · {item.found_location || '—'}
              </div>
            </div>
          ))}

          {selected && (
            <form onSubmit={handleHandover} style={{ marginTop: 16, padding: '16px', background: 'var(--surface)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-1)' }}>تسليم: {selected.item_description}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="اسم المستلم *">
                  <input required value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} style={inp} />
                </Field>
                <Field label="رقم التواصل">
                  <input value={form.owner_contact} onChange={e => setForm(f => ({ ...f, owner_contact: e.target.value }))} style={inp} dir="ltr" />
                </Field>
              </div>
              <Field label="تاريخ التسليم">
                <DatePicker isAr={true} value={form.resolved_date} onChange={v => setForm(f => ({ ...f, resolved_date: v }))} style={inp} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: 'var(--brand-900)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'جارٍ الحفظ...' : 'تأكيد التسليم'}
                </button>
                <button type="button" onClick={() => setSelected(null)}
                  style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 3 — تسجيل موجود
══════════════════════════════════════════════════════════ */
function RegisterItemTab({ profile, isAr, stations }) {
  const stationName = profile?.station?.name_ar || profile?.station_id || '—'
  const empty = {
    item_description: '', item_type: 'other', found_date: todayStr(),
    from_station_id: '', to_station_id: '',
    trip_number: '', bus_number: '', notes: '',
  }
  const [form, setForm]         = useState(empty)
  const [photos, setPhotos]     = useState([])
  const [previews, setPreviews] = useState([])
  const [saving, setSaving]     = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))


  function handleFiles(e) {
    const files = Array.from(e.target.files)
    setPhotos(prev => [...prev, ...files])
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removePhoto(i) {
    URL.revokeObjectURL(previews[i])
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setError(''); setProgress(0)

    // Upload photos
    const photoUrls = []
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i]
      const ext  = file.name.split('.').pop()
      const path = `${profile.station_id}/${Date.now()}_${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('lost-found').upload(path, file, { upsert: true })
      if (upErr) { setError('فشل رفع الصورة: ' + upErr.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('lost-found').getPublicUrl(path)
      photoUrls.push(publicUrl)
      setProgress(Math.round(((i + 1) / photos.length) * 100))
    }

    const { error: err } = await supabase.from('lost_found_items').insert({
      ...form,
      found_location:  stationName,
      station_id:      profile.station_id,
      status:          'unclaimed',
      created_by:      profile.id,
      created_by_name: profile.full_name_ar,
      photos:          photoUrls,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    previews.forEach(u => URL.revokeObjectURL(u))
    setPhotos([]); setPreviews([]); setProgress(0)
    setDone(true)
    setTimeout(() => { setForm(empty); setDone(false) }, 2500)
  }

  return (
    <form onSubmit={handleSave} style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>
      {done  && <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 700, fontSize: '0.88rem' }}>✓ تم تسجيل الموجود</div>}
      {error && <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.82rem' }}>{error}</div>}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}></span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>تسجيل موجود</span>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{profile?.full_name_ar}</span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* المحطة — ثابتة من بيانات المستخدم */}
          <div style={{ padding: '10px 14px', borderRadius: 9, background: 'color-mix(in srgb, var(--brand-900) 6%, white)', border: '1px solid color-mix(in srgb, var(--brand-900) 15%, white)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-900)" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 500 }}>المحطة:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--brand-900)' }}>{stationName}</span>
          </div>

          {/* ── أزرار الإدخال السريع (متعدد الاختيار) ── */}
          {(() => {
            const QUICK_GROUPS = [
              {
                label: 'النوع', type: 'bag', items: [
                  'شنطة ظهر', 'شنطة يد', 'شنطة سفر', 'حقيبة لابتوب', 'شنطة قماش', 'جوال', 'تابلت', 'محفظة', 'بطاقة هوية', 'جواز سفر', 'مفاتيح', 'ساعة يد', 'نظارة', 'ملابس',
                ]
              },
              {
                label: 'الحجم', items: ['صغيرة', 'متوسطة', 'كبيرة'],
              },
              {
                label: 'اللون', items: ['سوداء', 'بنية', 'رمادية', 'زرقاء', 'حمراء', 'بيضاء', 'خضراء', 'بيج'],
              },
              {
                label: 'الخامة', items: ['جلد', 'قماش', 'بلاستيك', 'نايلون'],
              },
            ]

            const selected = form.item_description
              ? form.item_description.split('، ').map(s => s.trim()).filter(Boolean)
              : []

            const toggle = (word, groupType) => {
              const current = new Set(selected)
              if (current.has(word)) {
                current.delete(word)
              } else {
                current.add(word)
              }
              const next = [...current].join('، ')
              set('item_description', next)
              if (groupType) set('item_type', groupType)
            }

            return (
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>إدخال سريع</p>
                  {selected.length > 0 && (
                    <button type="button" onClick={() => set('item_description', '')}
                      style={{ fontSize: '0.65rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                      مسح الكل
                    </button>
                  )}
                </div>
                {QUICK_GROUPS.map(group => (
                  <div key={group.label}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-3)' }}>{group.label}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {group.items.map(item => {
                        const active = selected.includes(item)
                        return (
                          <button key={item} type="button"
                            onClick={() => toggle(item, group.type)}
                            style={{
                              fontSize: '0.72rem', fontWeight: 600, padding: '4px 10px',
                              borderRadius: 99,
                              border: `1px solid ${active ? 'var(--brand-900)' : 'var(--border)'}`,
                              background: active ? 'var(--brand-900)' : '#fff',
                              color: active ? '#fff' : 'var(--text-2)',
                              cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
                            }}>
                            {item}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          <Field label="وصف الموجود *">
            <textarea required rows={2} value={form.item_description} onChange={e => set('item_description', e.target.value)}
              style={{ ...inp, resize: 'none' }} placeholder="صف الغرض بدقة..." />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="نوع الموجود">
              <select value={form.item_type} onChange={e => set('item_type', e.target.value)} style={inp}>
                {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.ar}</option>)}
              </select>
            </Field>
            <Field label="تاريخ الإيجاد">
              <DatePicker isAr={true} value={form.found_date} onChange={v => set('found_date', v)} style={inp} />
            </Field>
          </div>

          <StationRouteSelector
            stations={stations}
            fromId={form.from_station_id}
            toId={form.to_station_id}
            onFromChange={v => set('from_station_id', v)}
            onToChange={v => set('to_station_id', v)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="رقم الرحلة">
              <input value={form.trip_number} onChange={e => set('trip_number', toLatinNums(e.target.value))} style={inp} dir="ltr" />
            </Field>
            <Field label="رقم الحافلة">
              <input value={form.bus_number} onChange={e => set('bus_number', toLatinNums(e.target.value))} style={inp} dir="ltr" />
            </Field>
          </div>

          {/* صور */}
          <Field label="صور الموجود">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 9, border: '2px dashed var(--border)', cursor: 'pointer', background: 'var(--surface)', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-700)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>أضف صور (يمكن اختيار أكثر من صورة)</span>
              <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
            </label>

            {/* Previews */}
            {previews.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {previews.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button" onClick={() => removePhoto(i)}
                      style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      ✕
                    </button>
                  </div>
                ))}
                {/* Add more button */}
                <label style={{ width: 72, height: 72, borderRadius: 8, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1.4rem' }}>
                  +
                  <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            {/* Progress */}
            {saving && photos.length > 0 && progress < 100 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--brand-900)', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3, display: 'block' }}>جارٍ رفع الصور... {progress}%</span>
              </div>
            )}
          </Field>

          <Field label="ملاحظات">
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              style={{ ...inp, resize: 'none' }} />
          </Field>

          <button type="submit" disabled={saving}
            style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'var(--brand-900)', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
            {saving ? `جارٍ الحفظ... ${photos.length > 0 ? progress + '%' : ''}` : 'تسجيل الموجود'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: '0.85rem',
  fontFamily: 'inherit', color: 'var(--text-1)', background: '#fff',
  boxSizing: 'border-box', outline: 'none',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const TABS = [
  { id: 'report',   icon: '', ar: 'بلاغ مفقودات', hideForEmployee: true },
  { id: 'handover', icon: '', ar: 'تسليم موجودات' },
  { id: 'register', icon: '', ar: 'تسجيل موجود' },
  { id: 'logs',     icon: '',  ar: 'سجل الأرشيف' },
]

/* ── helpers ── */
const daysSince = (dateStr) => {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}
const ageBadge = (days) => {
  if (days >= 40) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: `${days} يوم` }
  if (days >= 30) return { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: `${days} يوم` }
  return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', label: `${days} يوم` }
}

const delBtn = (onClick, loading, label = 'حذف') => (
  <button onClick={onClick} disabled={loading}
    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: loading ? 0.5 : 1 }}>
    {loading ? '...' : label}
  </button>
)

/* ══════════════════════════════════════════════════════════
   TAB 4 — سجل الأرشيف (admin only)
══════════════════════════════════════════════════════════ */
function LogsTab({ stationFilter = null, isAdmin = false }) {
  const [sub, setSub]         = useState('reports')  // 'reports' | 'items'
  const [reports, setReports] = useState([])
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [busy, setBusy]       = useState(null)

  const autoDeleteCutoff  = new Date(Date.now() - 40 * 86400000).toISOString()
  const deliveredCutoff   = new Date(Date.now() - 30 * 86400000).toISOString()

  async function load() {
    setLoading(true)
    // حذف تلقائي لما فوق 40 يوم
    await supabase.from('lost_reports').delete().lt('created_at', autoDeleteCutoff)
    await supabase.from('lost_found_items').delete().lt('created_at', autoDeleteCutoff)
    // حذف الموجودات المسلّمة للعميل بعد 30 يوم (فقط إذا كان وقت التسليم مسجلاً)
    await supabase.from('lost_found_items')
      .delete()
      .eq('status', 'claimed')
      .not('delivered_to_client_at', 'is', null)
      .lt('delivered_to_client_at', deliveredCutoff)

    let rq = supabase.from('lost_reports')
      .select('*, from_st:from_station_id(name_ar), to_st:to_station_id(name_ar)')
      .order('created_at', { ascending: false })
    let iq = supabase.from('lost_found_items')
      .select('*')
      .order('created_at', { ascending: false })
    if (stationFilter) {
      rq = rq.eq('station_id', stationFilter)
      iq = iq.eq('station_id', stationFilter)
    }
    const [{ data: r }, { data: i }] = await Promise.all([rq, iq])
    setReports(r ?? [])
    setItems(i ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteReport(id) {
    setBusy(id)
    await supabase.from('lost_reports').delete().eq('id', id)
    setReports(prev => prev.filter(r => r.id !== id))
    setBusy(null)
  }

  async function deleteItem(id) {
    setBusy(id)
    await supabase.from('lost_found_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setBusy(null)
  }

  async function donateItem(id) {
    setBusy(id)
    const now = new Date().toISOString()
    const { error } = await supabase.from('lost_found_items').update({ status: 'donated', donated_at: now }).eq('id', id)
    if (!error) setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'donated', donated_at: now } : i))
    setBusy(null)
  }

  const filtR = reports.filter(r => !search || r.customer_name?.includes(search) || r.contact_number?.includes(search) || r.created_by_name?.includes(search))
  const filtI = items.filter(i => !search || i.item_description?.toLowerCase().includes(search.toLowerCase()) || i.created_by_name?.includes(search))

  const subBtn = (id, label, count) => (
    <button onClick={() => setSub(id)}
      style={{ padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: sub === id ? 800 : 500, fontSize: '0.83rem', background: sub === id ? 'var(--brand-900)' : 'transparent', color: sub === id ? '#fff' : 'var(--text-3)', transition: 'all 0.15s' }}>
      {label} <span style={{ opacity: 0.7 }}>({count})</span>
    </button>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span></span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>سجل الأرشيف</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>30 يوم → جمعية &nbsp; 40 يوم → حذف تلقائي</span>
            <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '3px 10px', borderRadius: 99, border: '1px solid #fecaca' }}>أدمن</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ padding: '10px 16px 0', display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
          {subBtn('reports', 'بلاغات المفقودات', reports.length)}
          {subBtn('items',   'الموجودات', items.length)}
        </div>

        <div style={{ padding: '14px 20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث..."
            style={{ ...inp, marginBottom: 14, boxSizing: 'border-box' }} />

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>جارٍ التحميل...</p>
          ) : sub === 'reports' ? (
            filtR.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>لا توجد بلاغات</p>
            : filtR.map(r => {
              const days = daysSince(r.created_at)
              const badge = ageBadge(days)
              return (
                <div key={r.id} style={{ borderRadius: 10, border: `1px solid ${days >= 30 ? badge.border : 'var(--border)'}`, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {r.report_number && <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>#{r.report_number}</span>}
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{r.customer_name}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>{r.contact_number}</span>
                        {r.from_st?.name_ar && r.to_st?.name_ar && <span>{r.from_st.name_ar} ← {r.to_st.name_ar}</span>}
                        <span>{r.created_by_name}</span>
                      </div>
                    </div>
                    {isAdmin && delBtn(() => deleteReport(r.id), busy === r.id)}
                  </div>
                </div>
              )
            })
          ) : (
            filtI.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>لا توجد موجودات</p>
            : filtI.map(item => {
              const days = daysSince(item.created_at)
              const badge = ageBadge(days)
              const foundDays  = daysSince(item.found_date || item.created_at)
              const canDonate = foundDays >= 30 && item.status === 'unclaimed'
              const isDonated  = item.status === 'donated'
              const isClaimed  = item.status === 'claimed'
              const deliveredDaysLeft = isClaimed && item.delivered_to_client_at
                ? Math.max(0, 30 - Math.floor((Date.now() - new Date(item.delivered_to_client_at)) / 86400000))
                : null
              return (
                <div key={item.id} style={{ borderRadius: 10, border: `1px solid ${isClaimed ? '#a7f3d0' : days >= 30 ? badge.border : 'var(--border)'}`, marginBottom: 10, overflow: 'hidden', background: isClaimed ? '#f0fdf4' : isDonated ? '#f0fdf4' : '#fff' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {item.item_number && <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>#{item.item_number}</span>}
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{item.item_description}</span>
                        {!isClaimed && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>}
                        {isClaimed && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>✓ سُلّم للعميل</span>}
                        {isClaimed && deliveredDaysLeft !== null && <span style={{ fontSize: '0.62rem', color: '#6b7280' }}>يُحذف بعد {deliveredDaysLeft} يوم</span>}
                        {isDonated && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>✓ سُلّم للجمعية</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>{item.found_location || '—'}</span>
                        <span>{item.created_by_name}</span>
                        <span>{item.found_date}</span>
                        {isClaimed && item.owner_name && <span>العميل: {item.owner_name}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {isAdmin && canDonate && (
                        <button onClick={() => donateItem(item.id)} disabled={busy === item.id}
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fde68a', background: '#fffbeb', color: '#d97706', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: busy === item.id ? 0.5 : 1 }}>
                          {busy === item.id ? '...' : 'تسليم للجمعية'}
                        </button>
                      )}
                      {isAdmin && delBtn(() => deleteItem(item.id), busy === item.id)}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 5 — سجلي (موجودات سجّلها الموظف)
══════════════════════════════════════════════════════════ */
function MyItemsTab({ profile }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('lost_found_items')
      .select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [profile.id])

  const statusBadge = status => {
    if (status === 'claimed')  return { label: 'سُلّم للعميل',  bg: '#dcfce7', color: '#15803d', border: '#86efac' }
    if (status === 'donated')  return { label: 'سُلّم للجمعية', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
    return                            { label: 'غير مستلم',     bg: '#fef9c3', color: '#854d0e', border: '#fde68a' }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span></span>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-1)' }}>موجوداتي المسجّلة</span>
          <span style={{ marginRight: 'auto', fontSize: '0.72rem', color: 'var(--text-3)' }}>{items.length} سجل</span>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>جارٍ التحميل...</p>
          ) : items.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>لا توجد موجودات مسجّلة بعد</p>
          ) : items.map(item => {
            const sb = statusBadge(item.status)
            return (
              <div key={item.id} style={{ borderRadius: 10, border: '1px solid var(--border)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  {item.item_number && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>
                      #{item.item_number}
                    </span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{item.item_description || '—'}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>
                    {sb.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{item.found_date || '—'}</span>
                  <span>{item.found_location || '—'}</span>
                  {item.status === 'claimed' && item.owner_name && <span>{item.owner_name}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function LostFoundPage() {
  const { i18n } = useTranslation()
  const { profile } = useAuth()
  const isAdmin      = profile?.role === 'general_admin' || profile?.role === 'station_admin'
  const isEmployee   = profile?.role === 'station_employee'
  const isAr = i18n.language === 'ar'
  const [tab, setTab] = useState(isEmployee ? 'register' : 'report')
  const [stations, setStations] = useState([])

  useEffect(() => {
    supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar')
      .then(({ data }) => setStations(data ?? []))
  }, [])

  const visibleTabs = TABS.filter(t => {
    if (t.hideForEmployee && isEmployee) return false
    return true
  })

  return (
    <div style={{ minHeight: 'calc(100vh - 58px)', background: 'var(--surface)' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.88rem', fontWeight: tab === t.id ? 800 : 500, fontFamily: 'inherit',
              color: tab === t.id ? 'var(--brand-900)' : 'var(--text-3)',
              borderBottom: `2.5px solid ${tab === t.id ? 'var(--brand-900)' : 'transparent'}`,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}>
            {t.icon} {t.ar}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'report'   && !isEmployee && <LostReportTab   stations={stations} profile={profile} isAr={isAr} />}
      {tab === 'handover' && <HandoverTab    profile={profile} isAr={isAr} />}
      {tab === 'register' && <RegisterItemTab profile={profile} isAr={isAr} stations={stations} />}
      {tab === 'logs'     && <LogsTab stationFilter={isEmployee ? profile?.station_id : null} isAdmin={isAdmin} />}
    </div>
  )
}

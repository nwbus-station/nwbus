import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached, clearCached } from '../lib/pageCache'
import { ITEM_TYPES } from '../utils/constants'
import DatePicker from '../components/shared/DatePicker'
import { todayStr } from '../utils/dates'

const toLatinNums = v => v.replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => d.charCodeAt(0) - 1632)

/* ── helpers ── */
const nowLocal = () => {
  const d = new Date()
  return d.toLocaleTimeString('ar-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const daysSince = (dateStr) => {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

const ageBadge = (days) => {
  if (days >= 40) return { label: `${days} يوم`, urgent: true }
  if (days >= 30) return { label: `${days} يوم`, urgent: false }
  return { label: `${days} يوم`, urgent: false }
}

/* ── Quick description builder — dropdown per category ── */
const QUICK_GROUPS = [
  { id: 'type',    label: 'النوع',   items: ['شنطة ظهر','شنطة يد','شنطة سفر','حقيبة لابتوب','شنطة قماش','جوال','تابلت','محفظة','بطاقة هوية','جواز سفر','مفاتيح','ساعة يد','نظارة','ملابس'] },
  { id: 'size',    label: 'الحجم',   items: ['صغيرة','متوسطة','كبيرة'] },
  { id: 'color',   label: 'اللون',   items: ['سوداء','بنية','رمادية','زرقاء','حمراء','بيضاء','خضراء','بيج','برتقالية','بنفسجية'] },
  { id: 'material',label: 'الخامة',  items: ['جلد','قماش','بلاستيك','نايلون','معدن','خشب'] },
]

function QuickDescBuilder({ value, onChange }) {
  const [openId, setOpenId] = useState(null)
  const ref = useRef(null)

  const selected = value ? value.split('، ').map(s => s.trim()).filter(Boolean) : []

  const toggle = (word) => {
    const cur = new Set(selected)
    cur.has(word) ? cur.delete(word) : cur.add(word)
    onChange([...cur].join('، '))
  }

  const groupSelected = (group) => group.items.filter(i => selected.includes(i))

  useEffect(() => {
    if (!openId) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenId(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openId])

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* صف أزرار الفئات */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {QUICK_GROUPS.map(group => {
          const picks = groupSelected(group)
          const isOpen = openId === group.id
          return (
            <div key={group.id} style={{ position: 'relative' }}>
              <button type="button"
                onClick={() => setOpenId(isOpen ? null : group.id)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: `1.5px solid ${picks.length > 0 ? 'var(--text-1)' : 'var(--border)'}`,
                  background: picks.length > 0 ? 'var(--text-1)' : 'var(--card)',
                  color: picks.length > 0 ? 'var(--card)' : 'var(--text-2)',
                  fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{group.label}</span>
                {picks.length > 0 && (
                  <span style={{ fontSize: '0.62rem', opacity: 0.8, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {picks.join(' · ')}
                  </span>
                )}
                {picks.length === 0 && (
                  <span style={{ fontSize: '0.62rem', opacity: 0.5 }}>اختر ▾</span>
                )}
              </button>

              {/* Dropdown */}
              {isOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
                  background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
                  minWidth: 160, maxHeight: 260, overflowY: 'auto',
                  padding: '6px 0',
                }}>
                  {group.items.map(item => {
                    const active = selected.includes(item)
                    return (
                      <button key={item} type="button"
                        onClick={() => toggle(item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '9px 14px', border: 'none',
                          background: active ? 'var(--surface)' : 'transparent',
                          color: 'var(--text-1)', fontSize: '0.82rem',
                          fontWeight: active ? 700 : 400, cursor: 'pointer',
                          fontFamily: 'inherit', textAlign: 'right',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = active ? 'var(--surface)' : 'transparent'}>
                        <span style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${active ? 'var(--text-1)' : 'var(--border)'}`,
                          background: active ? 'var(--text-1)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <span style={{ color: 'var(--card)', fontSize: '0.6rem', lineHeight: 1 }}>✓</span>}
                        </span>
                        {item}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* المحدد حالياً */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {selected.map(s => (
            <span key={s} style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {s}
              <button type="button" onClick={() => toggle(s)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.65rem', padding: 0, lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
            </span>
          ))}
          <button type="button" onClick={() => onChange('')}
            style={{ fontSize: '0.65rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            مسح الكل
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Searchable station route selector ── */
function StationRouteSelector({ stations, fromId, toId, onFromChange, onToChange, isAr = true }) {
  const [fromQ, setFromQ] = useState('')
  const [toQ,   setToQ]   = useState('')
  const filt = (q) => stations.filter(s => s.name_ar.includes(q) || s.name_en?.toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
      <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)' }}>{isAr ? 'وجهة الرحلة' : 'Trip Route'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>

        {/* من */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'من' : 'From'}</span>
          <input value={fromQ} onChange={e => { setFromQ(e.target.value); onFromChange('') }}
            placeholder={isAr ? 'بحث محطة المغادرة...' : 'Search departure...'} style={{ ...inp, fontSize: '0.78rem' }} />
          <select value={fromId} onChange={e => onFromChange(e.target.value)} size={4}
            style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
            {filt(fromQ).map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </select>
          {fromId && <span style={{ fontSize: '0.68rem', color: 'var(--text-1)', fontWeight: 700 }}>✓ {stations.find(s => s.id === fromId)?.name_ar}</span>}
        </div>

        <span style={{ color: 'var(--text-3)', fontSize: '0.9rem', padding: '36px 2px 0' }}>←</span>

        {/* إلى */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>{isAr ? 'إلى' : 'To'}</span>
          <input value={toQ} onChange={e => { setToQ(e.target.value); onToChange('') }}
            placeholder={isAr ? 'بحث محطة الوصول...' : 'Search arrival...'} style={{ ...inp, fontSize: '0.78rem' }} />
          <select value={toId} onChange={e => onToChange(e.target.value)} size={4}
            style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
            {filt(toQ).map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </select>
          {toId && <span style={{ fontSize: '0.68rem', color: 'var(--text-1)', fontWeight: 700 }}>✓ {stations.find(s => s.id === toId)?.name_ar}</span>}
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 1 — بلاغ مفقودات
══════════════════════════════════════════════════════════ */
function LostReportTab({ stations, profile, isAr }) {
  const empty = {
    customer_name: '', contact_number: '', item_description: '',
    sticker_number: '', ticket_number: '', bus_number: '', departure_time: '',
    from_station_id: '', to_station_id: '', customer_location_id: '', notes: '',
  }
  const [form, setForm]         = useState(empty)
  const [locSearch, setLocSearch] = useState('')
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  const filteredLoc = stations.filter(s =>
    !locSearch || s.name_ar.includes(locSearch) || s.name_en?.toLowerCase().includes(locSearch.toLowerCase())
  )
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const { error: err } = await supabase.from('lost_reports').insert({
      ...form,
      from_station_id:      form.from_station_id      || null,
      to_station_id:        form.to_station_id        || null,
      customer_location_id: form.customer_location_id || null,
      item_description:     form.item_description     || null,
      station_id:           profile.station_id || null,
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
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: '1.5px solid var(--text-1)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.85rem' }}>
          {isAr ? '✓ تم تسجيل البلاغ بنجاح' : '✓ Report submitted successfully'}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? 'بلاغ مفقودات' : 'Lost Report'}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{profile?.full_name_ar}</span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* إدخال سريع */}
          <div>
            <p style={{ margin: '0 0 8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{isAr ? 'وصف الغرض المفقود — إدخال سريع' : 'Quick Description'}</p>
            <QuickDescBuilder value={form.item_description} onChange={v => set('item_description', v)} />
          </div>

          <Field label={isAr ? 'وصف الغرض المفقود *' : 'Lost Item Description *'}>
            <textarea required rows={2} value={form.item_description} onChange={e => set('item_description', e.target.value)}
              style={{ ...inp, resize: 'none' }} placeholder={isAr ? 'صف الغرض بدقة...' : 'Describe the item in detail...'} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'اسم العميل *' : 'Customer Name *'}>
              <input required value={form.customer_name} onChange={e => set('customer_name', e.target.value)}
                style={inp} placeholder={isAr ? 'الاسم الكامل' : 'Full Name'} />
            </Field>
            <Field label={isAr ? 'رقم التواصل *' : 'Contact Number *'}>
              <input required inputMode="tel" value={form.contact_number} onChange={e => set('contact_number', toLatinNums(e.target.value))}
                style={inp} placeholder="05xxxxxxxx" dir="ltr" />
            </Field>
          </div>

          {/* مكان العميل */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)' }}>{isAr ? 'مكان العميل الحالي' : 'Customer Current Location'}</p>
            <input value={locSearch}
              onChange={e => { setLocSearch(e.target.value); set('customer_location_id', '') }}
              placeholder={isAr ? 'ابحث عن المحطة...' : 'Search station...'}
              style={{ ...inp, marginBottom: 4 }} />
            {!form.customer_location_id ? (
              <select value={form.customer_location_id}
                onChange={e => { set('customer_location_id', e.target.value); setLocSearch(stations.find(s => s.id === e.target.value)?.name_ar || '') }}
                size={3} style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}>
                <option value="">{isAr ? '— اختر المحطة —' : '— Select Station —'}</option>
                {filteredLoc.map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: 'var(--card)', border: '1.5px solid var(--text-1)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>{stations.find(s => s.id === form.customer_location_id)?.name_ar}</span>
                <button type="button" onClick={() => { set('customer_location_id', ''); setLocSearch('') }}
                  style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'رقم الاستكر' : 'Sticker No.'}>
              <input inputMode="numeric" value={form.sticker_number} onChange={e => set('sticker_number', toLatinNums(e.target.value))}
                style={inp} placeholder={isAr ? 'رقم ملصق الحقيبة' : 'Bag sticker number'} dir="ltr" />
            </Field>
            <Field label={isAr ? 'رقم التذكرة' : 'Ticket No.'}>
              <input inputMode="numeric" value={form.ticket_number} onChange={e => set('ticket_number', toLatinNums(e.target.value))}
                style={inp} placeholder={isAr ? 'رقم تذكرة السفر' : 'Travel ticket number'} dir="ltr" />
            </Field>
          </div>

          <StationRouteSelector
            stations={stations} fromId={form.from_station_id} toId={form.to_station_id}
            onFromChange={v => set('from_station_id', v)} onToChange={v => set('to_station_id', v)} isAr={isAr} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'رقم الحافلة' : 'Bus No.'}>
              <input inputMode="numeric" value={form.bus_number} onChange={e => set('bus_number', toLatinNums(e.target.value))}
                style={inp} placeholder={isAr ? 'رقم الحافلة' : 'Bus number'} dir="ltr" />
            </Field>
            <Field label={isAr ? 'وقت المغادرة' : 'Departure Time'}>
              <input inputMode="numeric" type="text" value={form.departure_time}
                onChange={e => {
                  let v = e.target.value.replace(/[^0-9]/g, '')
                  if (v.length > 4) v = v.slice(0, 4)
                  if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2)
                  set('departure_time', v)
                }}
                placeholder="HH:MM" maxLength={5}
                style={{ ...inp, fontFamily: 'monospace', letterSpacing: 2 }} dir="ltr" />
            </Field>
          </div>

          <Field label={isAr ? 'ملاحظات' : 'Notes'}>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              style={{ ...inp, resize: 'none' }} placeholder={isAr ? 'تفاصيل إضافية...' : 'Additional details...'} />
          </Field>

          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
            {isAr ? 'تاريخ البلاغ:' : 'Report Date:'} {new Date().toLocaleDateString('ar-SA-u-ca-gregory')} — {nowLocal()}
          </div>

          <button type="submit" disabled={saving}
            style={{ padding: '10px 32px', borderRadius: 8, border: '1.5px solid var(--text-1)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.88rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            {saving ? (isAr ? 'جارٍ التسجيل...' : 'Submitting...') : (isAr ? 'تسجيل البلاغ' : 'Submit Report')}
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
    let q = supabase.from('lost_found_items').select('*').eq('status', 'unclaimed')
    if (profile.station_id) q = q.eq('station_id', profile.station_id)
    q.order('created_at', { ascending: false })
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
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? 'تسليم موجودات' : 'Item Handover'}</span>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث عن موجود...' : 'Search found items...'}
            style={{ ...inp, marginBottom: 12, boxSizing: 'border-box' }} />

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', padding: 20 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', padding: 20 }}>{isAr ? 'لا توجد موجودات غير مستلمة' : 'No unclaimed items found'}</p>
          ) : filtered.map(item => (
            <div key={item.id} onClick={() => setSelected(item)}
              style={{ padding: '12px 14px', borderRadius: 10,
                border: `1.5px solid ${selected?.id === item.id ? 'var(--text-1)' : 'var(--border)'}`,
                marginBottom: 8, cursor: 'pointer',
                background: selected?.id === item.id ? 'var(--surface)' : 'var(--card)',
                transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.item_number && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>#{item.item_number}</span>
                )}
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{item.item_description}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3 }}>
                {item.found_date} · {item.found_location || '—'}
              </div>
            </div>
          ))}

          {selected && (
            <form onSubmit={handleHandover}
              style={{ marginTop: 16, padding: '16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-1)' }}>
                {isAr ? 'تسليم:' : 'Handover:'} {selected.item_description}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label={isAr ? 'اسم المستلم *' : 'Recipient Name *'}>
                  <input required value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} style={inp} />
                </Field>
                <Field label={isAr ? 'رقم التواصل' : 'Contact Number'}>
                  <input value={form.owner_contact} onChange={e => setForm(f => ({ ...f, owner_contact: e.target.value }))} style={inp} dir="ltr" />
                </Field>
              </div>
              <Field label={isAr ? 'تاريخ التسليم' : 'Handover Date'}>
                <DatePicker isAr={true} value={form.resolved_date} onChange={v => setForm(f => ({ ...f, resolved_date: v }))} style={inp} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={saving}
                  style={{ padding: '9px 24px', borderRadius: 8, border: '1.5px solid var(--text-1)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'تأكيد التسليم' : 'Confirm Handover')}
                </button>
                <button type="button" onClick={() => setSelected(null)}
                  style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {isAr ? 'إلغاء' : 'Cancel'}
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
  const hasStation = !!profile?.station_id
  const [selectedStationId, setSelectedStationId] = useState(profile?.station_id || '')
  const [stationSearch, setStationSearch] = useState('')

  const effectiveStationId = hasStation ? profile.station_id : selectedStationId
  const effectiveStation = hasStation
    ? (profile?.station?.name_ar || '—')
    : (stations.find(s => s.id === selectedStationId)?.name_ar || '—')

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
    e.preventDefault()
    if (!effectiveStationId) { setError(isAr ? 'يرجى اختيار المحطة' : 'Please select a station'); return }
    setSaving(true); setError(''); setProgress(0)

    const photoUrls = []
    for (let i = 0; i < photos.length; i++) {
      const file = photos[i]
      const ext  = file.name.split('.').pop()
      const path = `${effectiveStationId}/${Date.now()}_${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('lost-found').upload(path, file, { upsert: true })
      if (upErr) { setError('فشل رفع الصورة: ' + upErr.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('lost-found').getPublicUrl(path)
      photoUrls.push(publicUrl)
      setProgress(Math.round(((i + 1) / photos.length) * 100))
    }

    const { error: err } = await supabase.from('lost_found_items').insert({
      ...form,
      found_location:  effectiveStation,
      station_id:      effectiveStationId || null,
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
      {done  && <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: '1.5px solid var(--text-1)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.85rem' }}>{isAr ? '✓ تم تسجيل الموجود' : '✓ Item registered successfully'}</div>}
      {error && <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.82rem' }}>{error}</div>}

      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? 'تسجيل موجود' : 'Register Found Item'}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{profile?.full_name_ar}</span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* المحطة */}
          {hasStation ? (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 600 }}>{isAr ? 'المحطة:' : 'Station:'}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-1)' }}>{effectiveStation}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)' }}>{isAr ? 'المحطة *' : 'Station *'}</label>
              <input value={stationSearch}
                onChange={e => { setStationSearch(e.target.value); setSelectedStationId('') }}
                placeholder={isAr ? 'ابحث عن المحطة...' : 'Search station...'}
                style={inp} />
              {!selectedStationId ? (
                <select value={selectedStationId}
                  onChange={e => { setSelectedStationId(e.target.value); setStationSearch(stations.find(s => s.id === e.target.value)?.name_ar || '') }}
                  size={4} style={{ ...inp, height: 'auto', padding: '4px 8px', fontSize: '0.82rem' }}>
                  <option value="">{isAr ? '— اختر المحطة —' : '— Select Station —'}</option>
                  {stations.filter(s => !stationSearch || s.name_ar.includes(stationSearch)).map(s => (
                    <option key={s.id} value={s.id}>{s.name_ar}</option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1.5px solid var(--text-1)' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-1)' }}>{effectiveStation}</span>
                  <button type="button" onClick={() => { setSelectedStationId(''); setStationSearch('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.75rem' }}>✕</button>
                </div>
              )}
            </div>
          )}

          {/* إدخال سريع */}
          <div>
            <p style={{ margin: '0 0 8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{isAr ? 'إدخال سريع' : 'Quick Input'}</p>
            <QuickDescBuilder value={form.item_description} onChange={v => set('item_description', v)} />
          </div>

          <Field label={isAr ? 'وصف الموجود *' : 'Found Item Description *'}>
            <textarea required rows={2} value={form.item_description} onChange={e => set('item_description', e.target.value)}
              style={{ ...inp, resize: 'none' }} placeholder={isAr ? 'صف الغرض بدقة...' : 'Describe the item in detail...'} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'نوع الموجود' : 'Item Type'}>
              <select value={form.item_type} onChange={e => set('item_type', e.target.value)} style={inp}>
                {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.ar}</option>)}
              </select>
            </Field>
            <Field label={isAr ? 'تاريخ الإيجاد' : 'Date Found'}>
              <DatePicker isAr={true} value={form.found_date} onChange={v => set('found_date', v)} style={inp} />
            </Field>
          </div>

          <StationRouteSelector
            stations={stations} fromId={form.from_station_id} toId={form.to_station_id}
            onFromChange={v => set('from_station_id', v)} onToChange={v => set('to_station_id', v)} isAr={isAr} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={isAr ? 'رقم الرحلة' : 'Trip No.'}>
              <input inputMode="numeric" value={form.trip_number} onChange={e => set('trip_number', toLatinNums(e.target.value))} style={inp} dir="ltr" />
            </Field>
            <Field label={isAr ? 'رقم الحافلة' : 'Bus No.'}>
              <input inputMode="numeric" value={form.bus_number} onChange={e => set('bus_number', toLatinNums(e.target.value))} style={inp} dir="ltr" />
            </Field>
          </div>

          {/* صور */}
          <Field label={isAr ? 'صور الموجود' : 'Item Photos'}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1.5px dashed var(--border)', cursor: 'pointer', background: 'var(--surface)', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{isAr ? 'أضف صور (يمكن اختيار أكثر من صورة)' : 'Add photos (multiple allowed)'}</span>
              <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
            </label>

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
                <label style={{ width: 72, height: 72, borderRadius: 8, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1.4rem' }}>
                  +
                  <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            {saving && photos.length > 0 && progress < 100 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--text-1)', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3, display: 'block' }}>{isAr ? 'جارٍ رفع الصور...' : 'Uploading...'} {progress}%</span>
              </div>
            )}
          </Field>

          <Field label={isAr ? 'ملاحظات' : 'Notes'}>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              style={{ ...inp, resize: 'none' }} />
          </Field>

          <button type="submit" disabled={saving}
            style={{ padding: '10px 32px', borderRadius: 8, border: '1.5px solid var(--text-1)', background: 'var(--card)', color: 'var(--text-1)', fontWeight: 700, fontSize: '0.88rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            {saving ? `${isAr ? 'جارٍ الحفظ...' : 'Saving...'} ${photos.length > 0 ? progress + '%' : ''}` : (isAr ? 'تسجيل الموجود' : 'Register Item')}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 4 — سجل الأرشيف
══════════════════════════════════════════════════════════ */
const delBtn = (onClick, loading) => (
  <button onClick={onClick} disabled={loading}
    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: loading ? 0.5 : 1 }}>
    {loading ? '...' : 'حذف'}
  </button>
)

function LogsTab({ stationFilter = null, isAdmin = false, isAr = true }) {
  const initialLogsCacheKey = `lostfound_logs_${stationFilter ?? 'all'}`
  const initialLogsCache = getCached(initialLogsCacheKey)

  const [sub, setSub]         = useState('reports')
  const [reports, setReports] = useState(() => initialLogsCache?.reports ?? [])
  const [items, setItems]     = useState(() => initialLogsCache?.items ?? [])
  const [loading, setLoading] = useState(() => !initialLogsCache)
  const [search, setSearch]   = useState('')
  const [busy, setBusy]       = useState(null)
  const [expandedItem, setExpandedItem] = useState(null) // id لعنصر مفتوح تفاصيله
  const [lightbox, setLightbox] = useState(null) // رابط صورة مفتوحة بالحجم الكامل

  const autoDeleteCutoff = new Date(Date.now() - 40 * 86400000).toISOString()
  const deliveredCutoff  = new Date(Date.now() - 30 * 86400000).toISOString()

  async function load() {
    const cacheKey = `lostfound_logs_${stationFilter ?? 'all'}`
    const cached = getCached(cacheKey)
    if (cached) { setReports(cached.reports); setItems(cached.items); setLoading(false) } else { setLoading(true) }
    await supabase.from('lost_reports').delete().lt('created_at', autoDeleteCutoff)
    await supabase.from('lost_found_items').delete().lt('created_at', autoDeleteCutoff)
    await supabase.from('lost_found_items').delete().eq('status', 'claimed').not('delivered_to_client_at', 'is', null).lt('delivered_to_client_at', deliveredCutoff)

    let rq = supabase.from('lost_reports').select('*, from_st:from_station_id(name_ar), to_st:to_station_id(name_ar)').order('created_at', { ascending: false })
    let iq = supabase.from('lost_found_items').select('*').order('created_at', { ascending: false })
    if (stationFilter) { rq = rq.eq('station_id', stationFilter); iq = iq.eq('station_id', stationFilter) }
    const [{ data: r }, { data: i }] = await Promise.all([rq, iq])
    const rpts = r ?? [], itms = i ?? []
    if (rpts.length || itms.length) setCached(cacheKey, { reports: rpts, items: itms })
    setReports(rpts); setItems(itms); setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const ch = supabase.channel('lostfound_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_found_items' }, () => { clearCached(`lostfound_logs_${stationFilter ?? 'all'}`); load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_reports' }, () => { clearCached(`lostfound_logs_${stationFilter ?? 'all'}`); load() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [stationFilter])

  async function deleteReport(id) {
    setBusy(id); await supabase.from('lost_reports').delete().eq('id', id)
    setReports(prev => prev.filter(r => r.id !== id)); setBusy(null)
  }
  async function deleteItem(id) {
    setBusy(id); await supabase.from('lost_found_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id)); setBusy(null)
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
      style={{ padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        fontWeight: sub === id ? 800 : 500, fontSize: '0.83rem',
        background: sub === id ? 'var(--text-1)' : 'transparent',
        color: sub === id ? 'var(--card)' : 'var(--text-3)',
        transition: 'all 0.15s' }}>
      {label} <span style={{ opacity: 0.6 }}>({count})</span>
    </button>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? 'سجل الأرشيف' : 'Archive Log'}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>
            {isAr ? '30 يوم ← جمعية · 40 يوم ← حذف تلقائي' : '30 days → Charity · 40 days → Auto-delete'}
          </span>
        </div>

        <div style={{ padding: '10px 16px 0', display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
          {subBtn('reports', isAr ? 'بلاغات المفقودات' : 'Lost Reports', reports.length)}
          {subBtn('items', isAr ? 'الموجودات' : 'Found Items', items.length)}
        </div>

        <div style={{ padding: '14px 20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث...' : 'Search...'}
            style={{ ...inp, marginBottom: 14, boxSizing: 'border-box' }} />

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
          ) : sub === 'reports' ? (
            filtR.length === 0
              ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>{isAr ? 'لا توجد بلاغات' : 'No reports'}</p>
              : filtR.map(r => {
                const days = daysSince(r.created_at)
                const badge = ageBadge(days)
                return (
                  <div key={r.id} style={{ borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {r.report_number && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>#{r.report_number}</span>
                          )}
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{r.customer_name}</span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99,
                            border: `1px solid ${badge.urgent ? 'var(--text-1)' : 'var(--border)'}`,
                            color: badge.urgent ? 'var(--text-1)' : 'var(--text-3)',
                            background: 'var(--card)' }}>{badge.label}</span>
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
            filtI.length === 0
              ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>{isAr ? 'لا توجد موجودات' : 'No items'}</p>
              : filtI.map(item => {
                const days = daysSince(item.created_at)
                const badge = ageBadge(days)
                const foundDays = daysSince(item.found_date || item.created_at)
                const canDonate = foundDays >= 30 && item.status === 'unclaimed'
                const isDonated = item.status === 'donated'
                const isClaimed = item.status === 'claimed'
                const deliveredDaysLeft = isClaimed && item.delivered_to_client_at
                  ? Math.max(0, 30 - Math.floor((Date.now() - new Date(item.delivered_to_client_at)) / 86400000))
                  : null

                const statusLabel = isClaimed ? (isAr ? 'سُلّم للعميل' : 'Delivered')
                  : isDonated ? (isAr ? 'سُلّم للجمعية' : 'Donated')
                  : (isAr ? 'غير مستلم' : 'Unclaimed')

                const isOpen = expandedItem === item.id
                const typeLabel = ITEM_TYPES.find(t => t.value === item.item_type)?.ar
                const photos = item.photos ?? []
                return (
                  <div key={item.id} style={{ borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, overflow: 'hidden', background: 'var(--card)' }}>
                    <div onClick={() => setExpandedItem(isOpen ? null : item.id)}
                      style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {item.item_number && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>#{item.item_number}</span>
                          )}
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{item.item_description}</span>
                          {photos.length > 0 && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99, border: '1px solid var(--border)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              📷 {photos.length}
                            </span>
                          )}
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99, border: '1px solid var(--border)', color: 'var(--text-2)', background: 'var(--card)' }}>
                            {statusLabel}
                          </span>
                          {!isClaimed && (
                            <span style={{ fontSize: '0.65rem', padding: '1px 8px', borderRadius: 99,
                              border: `1px solid ${badge.urgent ? 'var(--text-1)' : 'var(--border)'}`,
                              color: badge.urgent ? 'var(--text-1)' : 'var(--text-3)',
                              fontWeight: badge.urgent ? 700 : 400, background: 'var(--card)' }}>{badge.label}</span>
                          )}
                          {isClaimed && deliveredDaysLeft !== null && (
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>
                              {isAr ? `يُحذف بعد ${deliveredDaysLeft} يوم` : `Deletes in ${deliveredDaysLeft} days`}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span>{item.found_location || '—'}</span>
                          <span>{item.created_by_name}</span>
                          <span>{item.found_date}</span>
                          {isClaimed && item.owner_name && <span>{isAr ? 'العميل:' : 'Client:'} {item.owner_name}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        {isAdmin && canDonate && (
                          <button onClick={() => donateItem(item.id)} disabled={busy === item.id}
                            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: busy === item.id ? 0.5 : 1 }}>
                            {busy === item.id ? '...' : (isAr ? 'تسليم للجمعية' : 'Donate')}
                          </button>
                        )}
                        {isAdmin && delBtn(() => deleteItem(item.id), busy === item.id)}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', alignSelf: 'center' }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: '0.76rem', color: 'var(--text-2)', margin: '10px 0' }}>
                          {typeLabel && <span><b style={{ color: 'var(--text-1)' }}>{isAr ? 'النوع:' : 'Type:'}</b> {typeLabel}</span>}
                          <span><b style={{ color: 'var(--text-1)' }}>{isAr ? 'المحطة:' : 'Station:'}</b> {item.found_location || '—'}</span>
                          <span><b style={{ color: 'var(--text-1)' }}>{isAr ? 'المسجّل:' : 'Registered by:'}</b> {item.created_by_name || '—'}</span>
                          {item.donated_at && <span><b style={{ color: 'var(--text-1)' }}>{isAr ? 'تاريخ التسليم للجمعية:' : 'Donated on:'}</b> {new Date(item.donated_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB')}</span>}
                        </div>

                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', margin: '0 0 6px' }}>
                          {isAr ? 'الصور' : 'Photos'} {photos.length > 0 && `(${photos.length})`}
                        </p>
                        {photos.length === 0 ? (
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: 0 }}>{isAr ? 'لا توجد صور مرفقة' : 'No photos attached'}</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {photos.map((url, pi) => (
                              <img key={pi} src={url} alt="" onClick={() => setLightbox(url)}
                                style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
          )}
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: 18, insetInlineEnd: 18, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TAB 5 — موجوداتي
══════════════════════════════════════════════════════════ */
function MyItemsTab({ profile, isAr = true }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('lost_found_items').select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [profile.id])

  const statusLabel = status => {
    if (status === 'claimed')  return isAr ? 'سُلّم للعميل'  : 'Delivered to Client'
    if (status === 'donated')  return isAr ? 'سُلّم للجمعية' : 'Donated to Charity'
    return                            isAr ? 'غير مستلم'     : 'Unclaimed'
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)' }}>{isAr ? 'موجوداتي المسجّلة' : 'My Registered Items'}</span>
          <span style={{ marginRight: 'auto', fontSize: '0.72rem', color: 'var(--text-3)' }}>{items.length} {isAr ? 'سجل' : 'records'}</span>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
          ) : items.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>{isAr ? 'لا توجد موجودات مسجّلة بعد' : 'No registered items yet'}</p>
          ) : items.map(item => (
            <div key={item.id} style={{ borderRadius: 10, border: '1px solid var(--border)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                {item.item_number && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace' }}>
                    #{item.item_number}
                  </span>
                )}
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-1)' }}>{item.item_description || '—'}</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 8px', borderRadius: 99, border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{item.found_date || '—'}</span>
                <span>{item.found_location || '—'}</span>
                {item.status === 'claimed' && item.owner_name && <span>{item.owner_name}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   SHARED
══════════════════════════════════════════════════════════ */
const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: '0.85rem',
  fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--card)',
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
  { id: 'report',   ar: 'بلاغ مفقودات',      en: 'Lost Report',     hideForEmployee: true },
  { id: 'handover', ar: 'تسليم موجودات',     en: 'Item Handover' },
  { id: 'register', ar: 'تسجيل موجود',       en: 'Register Item' },
  { id: 'logs',     ar: 'سجل الأرشيف',       en: 'Archive Log' },
]

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function LostFoundPage() {
  const { i18n } = useTranslation()
  const { profile, isAdmin } = useAuth()
  const isEmployee = profile?.role === 'station_employee'
  const isAr = i18n.language === 'ar'
  const [tab, setTab] = useState(isEmployee ? 'register' : 'report')
  const [stations, setStations] = useState([])

  useEffect(() => {
    supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar')
      .then(({ data }) => setStations(data ?? []))
  }, [])

  const visibleTabs = TABS.filter(t => !(t.hideForEmployee && isEmployee))

  return (
    <div style={{ minHeight: 'calc(100vh - 58px)', background: 'var(--surface)' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Tabs */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.88rem', fontWeight: tab === t.id ? 800 : 500, fontFamily: 'inherit',
              color: tab === t.id ? 'var(--text-1)' : 'var(--text-3)',
              borderBottom: `2.5px solid ${tab === t.id ? 'var(--text-1)' : 'transparent'}`,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
            {isAr ? t.ar : t.en}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'report'   && !isEmployee && <LostReportTab   stations={stations} profile={profile} isAr={isAr} />}
      {tab === 'handover' && <HandoverTab    profile={profile} isAr={isAr} />}
      {tab === 'register' && <RegisterItemTab profile={profile} isAr={isAr} stations={stations} />}
      {tab === 'logs'     && <LogsTab stationFilter={isEmployee ? profile?.station_id : null} isAdmin={isAdmin} isAr={isAr} />}
    </div>
  )
}

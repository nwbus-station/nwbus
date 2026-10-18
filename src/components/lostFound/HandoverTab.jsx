// تسليم الموجودات لأصحابها: قائمة بطاقات مع فلاتر، ولوحة تسليم جانبية للغرض المختار
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { clearCached } from '../../lib/pageCache'
import { ITEM_TYPES } from '../../utils/constants'
import { todayStr } from '../../utils/dates'
import DatePicker from '../shared/DatePicker'
import SelectField from '../shared/SelectField'
import ConfirmDialog from '../shared/ConfirmDialog'
import { MONO, card, fieldStyle, FormCard, Section, Banner, PrimaryButton, GhostButton } from './ui'

const toLatinNums = v => String(v ?? '').replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => d.charCodeAt(0) - 1632)
const daysSince = d => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)
const day10 = d => (d ? String(d).slice(0, 10) : '—')
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }

export default function HandoverTab({ profile, isAr = true }) {
  const t = (ar, en) => (isAr ? ar : en)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fStation, setFStation] = useState('')
  const [fType, setFType] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState({ owner_name: '', owner_contact: '', resolved_date: todayStr(), notes: '' })
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [banner, setBanner] = useState(null)   // { kind: 'ok'|'err', text }
  const panelRef = useRef(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('lost_found_items').select('*').eq('status', 'unclaimed').order('created_at', { ascending: false })
    if (error) setBanner({ kind: 'err', text: t('تعذّر تحميل الموجودات: ', 'Could not load items: ') + error.message })
    setItems(data ?? []); setLoading(false)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const stations = useMemo(() => [...new Map(items.filter(i => i.station_id && i.found_location).map(i => [i.station_id, i.found_location])).entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ar')), [items])
  const q = search.trim().toLowerCase()
  const list = useMemo(() => items.filter(i =>
    (!fStation || i.station_id === fStation)
    && (!fType || i.item_type === fType)
    && (!q || [i.item_description, i.found_location, i.created_by_name, String(i.item_number ?? '')].some(v => String(v ?? '').toLowerCase().includes(q)))
  ), [items, fStation, fType, q])
  const selected = items.find(i => i.id === selectedId) || null
  const filtersActive = !!(search || fStation || fType)

  function pick(item) {
    setSelectedId(item.id)
    setForm({ owner_name: '', owner_contact: '', resolved_date: todayStr(), notes: '' })
    setBanner(null)
    // الجوال: لوحة التسليم فوق القائمة، فنمرّر لها فور الاختيار
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  async function doHandover() {
    if (!selected) return
    setSaving(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('lost_found_items').update({
      status: 'claimed',
      owner_name: form.owner_name.trim(),
      owner_contact: form.owner_contact.trim(),
      resolved_date: form.resolved_date,
      notes: form.notes || null,
      updated_by_name: profile?.full_name_ar,
      updated_at: now,
      delivered_to_client_at: now,
    }).eq('id', selected.id)
    setSaving(false)
    if (error) { setBanner({ kind: 'err', text: t('تعذّر تسجيل التسليم: ', 'Handover failed: ') + error.message }); return }
    clearCached('lostfound_logs_all')
    setBanner({ kind: 'ok', text: t(`✓ تم تسليم الغرض #${selected.item_number ?? ''} إلى ${form.owner_name.trim()}`, `✓ Item #${selected.item_number ?? ''} handed over to ${form.owner_name.trim()}`) })
    setSelectedId(null)
    setItems(prev => prev.filter(i => i.id !== selected.id))
    setTimeout(() => setBanner(b => (b?.kind === 'ok' ? null : b)), 5000)
  }

  function submit(e) {
    e.preventDefault()
    if (!form.owner_name.trim()) return
    setConfirm(true)
  }

  const photo = selected && Array.isArray(selected.photos) ? selected.photos[0] : null
  const selDays = selected ? daysSince(selected.found_date || selected.created_at) : 0

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '18px 14px 40px' }} dir={isAr ? 'rtl' : 'ltr'}>
      {banner && <div style={{ marginBottom: 12 }}><Banner kind={banner.kind === 'ok' ? 'ok' : 'err'}>{banner.text}</Banner></div>}

      {confirm && selected && (
        <ConfirmDialog
          message={t(`تأكيد تسليم الغرض #${selected.item_number ?? ''} (${selected.item_description}) إلى ${form.owner_name.trim()}؟ لا يمكن التراجع.`, `Confirm handing item #${selected.item_number ?? ''} to ${form.owner_name.trim()}? This cannot be undone.`)}
          confirmLabel={t('تأكيد التسليم', 'Confirm')} cancelLabel={t('إلغاء', 'Cancel')}
          onConfirm={() => { setConfirm(false); doHandover() }} onCancel={() => setConfirm(false)} />
      )}

      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('تسليم لصاحبه', 'Hand over to owner')}</h2>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3 }}>{t('اختر الغرض من القائمة، ثم أدخل بيانات المستلم وأكّد التسليم', 'Pick an item, enter the recipient details, then confirm')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* القائمة */}
        <div style={{ minWidth: 0, order: 2 }}>
          <div style={{ ...card, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px', minWidth: 0 }}>
              <label style={label}>{t('بحث', 'Search')}</label>
              <input value={search} onChange={e => setSearch(e.target.value)} style={fieldStyle} placeholder={t('وصف الغرض، رقم، محطة…', 'Description, number, station…')} />
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <label style={label}>{t('المحطة', 'Station')}</label>
              <SelectField value={fStation} onChange={e => setFStation(e.target.value)} style={fieldStyle}>
                <option value="">{t('كل المحطات', 'All stations')}</option>
                {stations.map(([sid, name]) => <option key={sid} value={sid}>{name}</option>)}
              </SelectField>
            </div>
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <label style={label}>{t('النوع', 'Type')}</label>
              <SelectField value={fType} onChange={e => setFType(e.target.value)} style={fieldStyle}>
                <option value="">{t('كل الأنواع', 'All types')}</option>
                {ITEM_TYPES.map(x => <option key={x.value} value={x.value}>{isAr ? x.ar : x.en}</option>)}
              </SelectField>
            </div>
            {filtersActive && <button type="button" onClick={() => { setSearch(''); setFStation(''); setFType('') }} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{t('مسح', 'Clear')}</button>}
          </div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', margin: '0 2px 8px' }}>{t(`${list.length} غرض بانتظار التسليم`, `${list.length} items awaiting hand-over`)}</div>

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 30 }}>{t('جارٍ التحميل...', 'Loading...')}</p>
          ) : list.length === 0 ? (
            <div style={{ ...card, padding: 36, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>{t('لا توجد موجودات غير مستلمة مطابقة', 'No matching unclaimed items')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map(item => {
                const on = selectedId === item.id
                const days = daysSince(item.found_date || item.created_at)
                const ph = Array.isArray(item.photos) ? item.photos[0] : null
                const typeLabel = ITEM_TYPES.find(x => x.value === item.item_type)
                const due = days >= 30
                return (
                  <button key={item.id} type="button" onClick={() => pick(item)}
                    style={{ ...card, textAlign: 'start', padding: 12, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', borderInlineStart: `4px solid ${due ? '#dc2626' : '#d97706'}`, outline: on ? '2px solid var(--text-1)' : 'none', outlineOffset: -1, background: on ? 'var(--surface)' : 'var(--card)' }}>
                    {ph
                      ? <img src={ph} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }} />
                      : <span style={{ width: 54, height: 54, borderRadius: 10, background: 'var(--surface)', border: '1px dashed var(--border)', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: '0.6rem', flexShrink: 0 }}>{t('بلا صورة', 'No photo')}</span>}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 7px' }}>{item.item_number ? `#${item.item_number}` : '—'}</span>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-1)' }}>{item.item_description || '—'}</span>
                      </span>
                      <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                        <span>{item.found_location || '—'}</span>
                        {typeLabel && <span>{isAr ? typeLabel.ar : typeLabel.en}</span>}
                        <span dir="ltr">{day10(item.found_date || item.created_at)}</span>
                      </span>
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, whiteSpace: 'nowrap', background: due ? 'rgba(220,38,38,0.13)' : 'rgba(217,119,6,0.14)', color: due ? '#dc2626' : '#d97706' }}>{t(`${days} يوم`, `${days} d`)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* لوحة التسليم */}
        <div ref={panelRef} style={{ minWidth: 0, order: selected ? 1 : 3, scrollMarginTop: 80 }}>
          {!selected ? null : (
            <form onSubmit={submit}>
              <FormCard icon="hand" accent="#16a34a" title={t('تسليم الغرض', 'Hand over item')} subtitle={`${t('بواسطة', 'By')} ${profile?.full_name_ar || ''}`}>
                <Section title={t('الغرض', 'Item')}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {photo && <img src={photo} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 11, border: '1px solid var(--border)', flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: MONO, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)' }}>{selected.item_number ? `#${selected.item_number}` : ''}</div>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-1)', lineHeight: 1.5 }}>{selected.item_description}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4, lineHeight: 1.7 }}>
                        {selected.found_location || '—'} · <span dir="ltr">{day10(selected.found_date || selected.created_at)}</span> · {t(`${selDays} يوم`, `${selDays} d`)}
                      </div>
                    </div>
                  </div>
                </Section>
                <Section title={t('بيانات المستلم', 'Recipient')}>
                  <div>
                    <label style={label}>{t('اسم المستلم *', 'Recipient name *')}</label>
                    <input required value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={label}>{t('رقم التواصل', 'Contact number')}</label>
                    <input inputMode="tel" dir="ltr" value={form.owner_contact} onChange={e => setForm(f => ({ ...f, owner_contact: toLatinNums(e.target.value) }))} style={fieldStyle} placeholder="05xxxxxxxx" />
                  </div>
                  <div>
                    <label style={label}>{t('تاريخ التسليم', 'Handover date')}</label>
                    <DatePicker isAr={isAr} value={form.resolved_date} onChange={v => setForm(f => ({ ...f, resolved_date: v }))} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={label}>{t('ملاحظات', 'Notes')}</label>
                    <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...fieldStyle, resize: 'none' }} />
                  </div>
                </Section>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <PrimaryButton type="submit" disabled={saving}>{saving ? t('جارٍ الحفظ...', 'Saving...') : t('تأكيد التسليم', 'Confirm hand-over')}</PrimaryButton>
                  <GhostButton type="button" onClick={() => setSelectedId(null)}>{t('إلغاء', 'Cancel')}</GhostButton>
                </div>
              </FormCard>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// التسليم للجمعية (للمشرفين): تجهيز دفعة من الأغراض المستحقة (30 يوماً فأكثر وغير مستلمة)،
// تسجيل المستلم من الجمعية برقم محضر، وطباعة محضر التسليم، وسجل بكل الدفعات السابقة.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { clearCached } from '../../lib/pageCache'
import { ITEM_TYPES } from '../../utils/constants'
import { todayStr } from '../../utils/dates'
import { esc, docHeader, docShell, openDocWindow } from '../../utils/printDoc'
import SelectField from '../shared/SelectField'
import ConfirmDialog from '../shared/ConfirmDialog'
import { MONO, card, fieldStyle, FormCard, Section, Banner, PrimaryButton, GhostButton, AutoStamp, fmtDT } from './ui'

const DONATE_AFTER = 30
const LAST_CHARITY_KEY = 'nwbus_last_charity'
const NONE = '00000000-0000-0000-0000-000000000000'
const lri = v => `⁦${v}⁩`   // يعزل الأرقام والتواريخ داخل النص العربي
const toLatinNums = v => String(v ?? '').replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => d.charCodeAt(0) - 1632)
const daysSince = d => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0)
const day10 = d => (d ? String(d).slice(0, 10) : '—')
const donationLabel = n => `DN-${String(n ?? 0).padStart(4, '0')}`
const label = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }
const smallBtn = (danger = false) => ({ padding: '6px 12px', borderRadius: 8, border: `1px solid ${danger ? 'rgba(220,38,38,0.4)' : 'var(--border)'}`, background: 'var(--surface)', color: danger ? '#dc2626' : 'var(--text-2)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' })

// محضر تسليم موجودات للجمعية (نافذة طباعة)
export function printDonation(d, items) {
  const typeOf = v => ITEM_TYPES.find(x => x.value === v)?.ar || '—'
  const cell = (l, v) => `<div class="cell"><small>${esc(l)}</small><b>${v || '—'}</b></div>`
  const rows = items.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.item_number ? `#${i.item_number}` : '—')}</td><td class="l"><b>${esc(i.item_description || '—')}</b></td><td>${esc(typeOf(i.item_type))}</td><td class="l">${esc(i.found_location || '—')}</td><td>${lri(esc(day10(i.found_date || i.created_at)))}</td><td>${lri(String(daysSince(i.found_date || i.created_at)))}</td></tr>`).join('')
  const body = `
    ${docHeader({ title: 'محضر تسليم موجودات للجمعية', infoLines: [`رقم المحضر: <b>${lri(esc(donationLabel(d.donation_no)))}</b>`, `التاريخ والوقت: <b>${lri(esc(fmtDT(d.created_at || d.donated_date)))}</b>`, `عدد الأغراض: <b>${lri(String(items.length))}</b>`] })}
    <div class="body">
      <div class="sec"><h3>بيانات التسليم</h3><div class="grid g3">
        ${cell('الجمعية المستلمة', esc(d.charity_name))}${cell('اسم المستلم', esc(d.recipient_name))}${cell('رقم هوية المستلم', lri(esc(d.recipient_id_number)))}
        ${cell('جوال المستلم', d.recipient_phone ? lri(esc(d.recipient_phone)) : '')}${cell('المسلِّم (الموظف)', esc(d.created_by_name))}${cell('محطة التسليم', esc(d.station_name))}${cell('ملاحظات', esc(d.notes))}
      </div></div>
      <div class="sec" style="break-inside:auto"><h3>الأغراض المسلّمة</h3>
        <table class="t"><thead><tr><th>#</th><th>رقم الغرض</th><th>الوصف</th><th>النوع</th><th>المحطة</th><th>تاريخ العثور</th><th>الأيام</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <ul class="notes"><li>أقرّ المستلم أعلاه باستلام الأغراض الموضحة في هذا المحضر كما هي، وتنتقل ملكيتها للجمعية المستلمة بعد انقضاء مدة الاحتفاظ النظامية (${DONATE_AFTER} يوماً).</li></ul>
      <div class="sig"><div><span>المسلِّم</span><b>${esc(d.created_by_name || '')}</b><i></i></div><div><span>المستلم من الجمعية</span><b>${esc(d.recipient_name || '')}</b><i></i></div><div><span>اعتماد المشرف</span><b></b><i></i></div></div>
    </div>`
  openDocWindow(docShell({ title: `محضر تسليم ${donationLabel(d.donation_no)}`, body, footerLeft: lri(esc(fmtDT(d.created_at || d.donated_date))), footerRight: 'NORTH WEST BUS' }))
}

export default function CharityTab({ preselectId = null, onPreselectUsed, isAr = true }) {
  const t = (ar, en) => (isAr ? ar : en)
  const { profile, isGeneralAdmin, allowedStationIds, supervisedStationIds } = useAuth()
  // الأدمن يسلّم من كل المحطات؛ المشرف من محطاته فقط (القاعدة تمنع تعديل غيرها)
  const scopeIds = isGeneralAdmin ? null
    : allowedStationIds?.length ? allowedStationIds
    : supervisedStationIds?.length ? supervisedStationIds
    : profile?.station_id ? [profile.station_id] : []

  const [mode, setMode] = useState('prepare')   // prepare | history
  const [items, setItems] = useState([])
  const [donations, setDonations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fStation, setFStation] = useState('')
  const [fType, setFType] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => ({ charity_name: (() => { try { return localStorage.getItem(LAST_CHARITY_KEY) || '' } catch { return '' } })(), recipient_name: '', recipient_id_number: '', recipient_phone: '', notes: '' }))
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState(null)   // { kind, text, donation?, items? }
  const [openDon, setOpenDon] = useState(null)
  const [donItems, setDonItems] = useState({})

  const load = useCallback(async () => {
    let iq = supabase.from('lost_found_items').select('*').eq('status', 'unclaimed').order('created_at', { ascending: true })
    if (scopeIds) iq = iq.in('station_id', scopeIds.length ? scopeIds : [NONE])
    const [{ data: i, error: ie }, dRes] = await Promise.all([
      iq,
      supabase.from('charity_donations').select('*').order('created_at', { ascending: false }),
    ])
    if (ie) setBanner({ kind: 'err', text: t('تعذّر تحميل الموجودات: ', 'Could not load items: ') + ie.message })
    // الجدول قد لا يكون منشأً بعد: نعرض السجل فارغاً وننبّه عند أول محاولة تسليم
    setItems((i ?? []).filter(x => daysSince(x.found_date || x.created_at) >= DONATE_AFTER))
    setDonations(dRes?.error ? [] : (dRes?.data ?? []))
    setLoading(false)
  }, [scopeIds?.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  // فتح من الأرشيف بغرض محدد
  useEffect(() => {
    if (preselectId && items.some(i => i.id === preselectId)) {
      setSelected(new Set([preselectId])); setShowForm(true); setMode('prepare'); onPreselectUsed?.()
    }
  }, [preselectId, items])  // eslint-disable-line react-hooks/exhaustive-deps

  const stations = useMemo(() => [...new Map(items.filter(i => i.station_id && i.found_location).map(i => [i.station_id, i.found_location])).entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ar')), [items])
  const q = search.trim().toLowerCase()
  const list = useMemo(() => items.filter(i =>
    (!fStation || i.station_id === fStation) && (!fType || i.item_type === fType)
    && (!q || [i.item_description, i.found_location, i.created_by_name, String(i.item_number ?? '')].some(v => String(v ?? '').toLowerCase().includes(q)))
  ), [items, fStation, fType, q])
  const chosen = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected])
  const charityNames = useMemo(() => [...new Set(donations.map(d => d.charity_name).filter(Boolean))], [donations])
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const thisMonth = donations.filter(d => new Date(d.created_at) >= monthStart)
  const thisMonthItems = thisMonth.reduce((a, d) => a + (d.item_count || 0), 0)

  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAllVisible = () => setSelected(prev => { const n = new Set(prev); list.forEach(i => n.add(i.id)); return n })
  const clearSel = () => { setSelected(new Set()); setShowForm(false) }

  function submit(e) {
    e.preventDefault()
    if (chosen.length === 0) return
    if (form.recipient_id_number.trim().length < 5) { setBanner({ kind: 'err', text: t('أدخل رقم هوية المستلم (5 خانات على الأقل)', 'Enter the recipient ID number (at least 5 characters)') }); return }
    setConfirm(true)
  }

  async function doDonate() {
    setSaving(true)
    const rows = chosen
    const header = {
      charity_name: form.charity_name.trim(), recipient_name: form.recipient_name.trim(), recipient_id_number: form.recipient_id_number.trim(),
      recipient_phone: form.recipient_phone.trim() || null, donated_date: todayStr(), notes: form.notes.trim() || null,
      item_count: rows.length, created_by: profile?.id, created_by_name: profile?.full_name_ar, station_name: profile?.station?.name_ar || null,
    }
    const { data: don, error: de } = await supabase.from('charity_donations').insert(header).select().single()
    if (de || !don) {
      setSaving(false)
      const missing = /charity_donations|relation|does not exist|schema cache/i.test(de?.message || '')
      setBanner({ kind: 'err', text: missing ? t('جدول التسليم للجمعية غير موجود في قاعدة البيانات. شغّل أمر SQL الخاص بالنظام أولاً.', 'The charity table is missing in the database. Run the system SQL first.') : t('تعذّر إنشاء المحضر: ', 'Could not create the record: ') + (de?.message || '') })
      return
    }
    const now = new Date().toISOString()
    const { error: ue } = await supabase.from('lost_found_items').update({ status: 'donated', donated_at: now, donation_id: don.id }).in('id', rows.map(r => r.id))
    if (ue) {
      await supabase.from('charity_donations').delete().eq('id', don.id)   // لا نترك محضراً بلا أغراض
      setSaving(false)
      setBanner({ kind: 'err', text: t('تعذّر تسجيل الأغراض كمسلّمة (لم يُحفظ المحضر): ', 'Could not mark items as donated (record not saved): ') + ue.message })
      return
    }
    try { localStorage.setItem(LAST_CHARITY_KEY, header.charity_name) } catch { /* بدون تخزين */ }
    clearCached('lostfound_logs_all')
    setSaving(false)
    setBanner({ kind: 'ok', text: t(`✓ تم تسليم ${rows.length} غرض للجمعية — المحضر ${donationLabel(don.donation_no)}`, `✓ ${rows.length} items handed to charity — record ${donationLabel(don.donation_no)}`), donation: don, items: rows })
    setItems(prev => prev.filter(i => !selected.has(i.id)))
    setDonations(prev => [don, ...prev])
    setSelected(new Set()); setShowForm(false)
    setForm(f => ({ ...f, recipient_name: '', recipient_id_number: '', recipient_phone: '', notes: '' }))
  }

  async function toggleDonation(d) {
    if (openDon === d.id) { setOpenDon(null); return }
    setOpenDon(d.id)
    if (!donItems[d.id]) {
      const { data } = await supabase.from('lost_found_items').select('*').eq('donation_id', d.id).order('item_number', { ascending: true })
      setDonItems(prev => ({ ...prev, [d.id]: data ?? [] }))
    }
  }
  async function printOf(d) {
    let its = donItems[d.id]
    if (!its) {
      const { data } = await supabase.from('lost_found_items').select('*').eq('donation_id', d.id).order('item_number', { ascending: true })
      its = data ?? []; setDonItems(prev => ({ ...prev, [d.id]: its }))
    }
    printDonation(d, its)
  }

  const kpis = [[t('مستحقة للتسليم', 'Eligible'), items.length, '#dc2626'], [t('المختارة', 'Selected'), selected.size, '#8b5cf6'], [t('أغراض هذا الشهر', 'This month'), thisMonthItems, '#16a34a'], [t('عدد المحاضر', 'Records'), donations.length, 'var(--text-1)']]

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '18px 14px 90px' }} dir={isAr ? 'rtl' : 'ltr'}>
      {banner && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Banner kind={banner.kind === 'ok' ? 'ok' : 'err'}>{banner.text}</Banner>
          {banner.donation && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><PrimaryButton type="button" onClick={() => printDonation(banner.donation, banner.items)}>{t('طباعة محضر التسليم', 'Print hand-over record')}</PrimaryButton><GhostButton type="button" onClick={() => setBanner(null)}>{t('إغلاق', 'Dismiss')}</GhostButton></div>}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={t(`تسليم ${chosen.length} غرض إلى «${form.charity_name.trim()}» (المستلم: ${form.recipient_name.trim()})؟ يُنشأ محضر رسمي ولا يمكن التراجع.`, `Hand ${chosen.length} items to "${form.charity_name.trim()}" (recipient: ${form.recipient_name.trim()})? An official record is created and cannot be undone.`)}
          confirmLabel={t('تأكيد التسليم للجمعية', 'Confirm')} cancelLabel={t('إلغاء', 'Cancel')}
          onConfirm={() => { setConfirm(false); doDonate() }} onCancel={() => setConfirm(false)} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-1)' }}>{t('التسليم للجمعية', 'Charity hand-over')}</h2>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3 }}>{t(`الأغراض غير المستلمة بعد ${DONATE_AFTER} يوماً — تُسلَّم دفعة واحدة بمحضر رسمي`, `Unclaimed items after ${DONATE_AFTER} days — handed over in one batch with an official record`)}</div>
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
          {[['prepare', t('تجهيز دفعة', 'Prepare batch')], ['history', t('سجل التسليمات', 'History')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} style={{ padding: '9px 18px', border: 'none', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', background: mode === k ? 'var(--text-1)' : 'transparent', color: mode === k ? 'var(--card)' : 'var(--text-2)' }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8, marginBottom: 14 }}>
        {kpis.map(([l, n, c], i) => (
          <div key={i} style={{ ...card, padding: '12px 14px', borderTop: `3px solid ${c}` }}>
            <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.4rem', lineHeight: 1.1, color: 'var(--text-1)' }}>{n}</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      {loading ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>{t('جارٍ التحميل...', 'Loading...')}</p> : mode === 'history' ? (
        donations.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>{t('لا توجد تسليمات سابقة', 'No previous hand-overs')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {donations.map(d => {
              const open = openDon === d.id, its = donItems[d.id]
              return (
                <article key={d.id} style={{ ...card, overflow: 'hidden', borderTop: '3px solid #8b5cf6' }}>
                  <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-1)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 9px' }}>{donationLabel(d.donation_no)}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>{t(`${d.item_count || 0} غرض`, `${d.item_count || 0} items`)}</span>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('الجمعية', 'Charity')}</div><div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-1)' }}>{d.charity_name}</div></div>
                    <div><div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('المستلم', 'Recipient')}</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>{d.recipient_name}</div></div>
                    <div><div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('تاريخ ووقت التسليم', 'Date & time')}</div><div dir="ltr" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', textAlign: isAr ? 'right' : 'left' }}>{fmtDT(d.created_at || d.donated_date)}</div></div>
                    <div><div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('المسلِّم', 'By')}</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>{d.created_by_name || '—'}</div></div>
                    <div><div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('محطة التسليم', 'Station')}</div><div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>{d.station_name || '—'}</div></div>
                    <div><div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('رقم الهوية', 'ID')}</div><div dir="ltr" style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', textAlign: isAr ? 'right' : 'left' }}>{d.recipient_id_number || '—'}</div></div>
                  </div>
                  {open && (
                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {!its ? <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{t('جارٍ التحميل...', 'Loading...')}</div>
                        : its.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{t('لا توجد أغراض مرتبطة', 'No linked items')}</div>
                        : its.map(i => (
                          <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-1)' }}>
                            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: 'var(--text-3)' }}>{i.item_number ? `#${i.item_number}` : '—'}</span>
                            <span style={{ flex: 1, fontWeight: 700 }}>{i.item_description}</span>
                            <span style={{ color: 'var(--text-3)', fontSize: '0.7rem' }}>{i.found_location}</span>
                          </div>
                        ))}
                      {d.notes && <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: 4 }}><b style={{ color: 'var(--text-3)' }}>{t('ملاحظات', 'Notes')}: </b>{d.notes}</div>}
                    </div>
                  )}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => toggleDonation(d)} style={smallBtn()}>{open ? t('إخفاء الأغراض', 'Hide items') : t('عرض الأغراض', 'Show items')}</button>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={() => printOf(d)} style={{ ...smallBtn(), background: 'var(--text-1)', color: 'var(--card)', borderColor: 'var(--text-1)' }}>{t('طباعة المحضر', 'Print record')}</button>
                  </div>
                </article>
              )
            })}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {showForm && chosen.length > 0 && (
            <form onSubmit={submit}>
              <FormCard icon="hand" accent="#8b5cf6" title={t('بيانات التسليم للجمعية', 'Charity hand-over details')} subtitle={t(`${chosen.length} غرض مختار`, `${chosen.length} items selected`)}>
                <Section title={t('الجمعية والمستلم', 'Charity & recipient')}>
                  <div>
                    <label style={label}>{t('اسم الجمعية *', 'Charity name *')}</label>
                    <input required list="charity-names" value={form.charity_name} onChange={e => setForm(f => ({ ...f, charity_name: e.target.value }))} style={fieldStyle} />
                    <datalist id="charity-names">{charityNames.map(n => <option key={n} value={n} />)}</datalist>
                  </div>
                  <div>
                    <label style={label}>{t('اسم المستلم من الجمعية *', 'Recipient name *')}</label>
                    <input required value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={label}>{t('رقم هوية المستلم *', 'Recipient ID *')}</label>
                    <input required inputMode="numeric" dir="ltr" maxLength={20} value={form.recipient_id_number} onChange={e => setForm(f => ({ ...f, recipient_id_number: toLatinNums(e.target.value).replace(/\s/g, '') }))} style={{ ...fieldStyle, fontFamily: MONO, letterSpacing: 1 }} />
                  </div>
                  <div>
                    <label style={label}>{t('جوال المستلم', 'Recipient phone')}</label>
                    <input inputMode="tel" dir="ltr" value={form.recipient_phone} onChange={e => setForm(f => ({ ...f, recipient_phone: toLatinNums(e.target.value) }))} style={fieldStyle} placeholder="05xxxxxxxx" />
                  </div>
                  <AutoStamp isAr={isAr} label={t('تاريخ ووقت التسليم', 'Hand-over date & time')} />
                  <div>
                    <label style={label}>{t('ملاحظات', 'Notes')}</label>
                    <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...fieldStyle, resize: 'none' }} />
                  </div>
                </Section>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <PrimaryButton type="submit" disabled={saving}>{saving ? t('جارٍ الحفظ...', 'Saving...') : t(`تسليم ${chosen.length} غرض للجمعية`, `Hand over ${chosen.length} items`)}</PrimaryButton>
                  <GhostButton type="button" onClick={() => setShowForm(false)}>{t('رجوع للاختيار', 'Back')}</GhostButton>
                </div>
              </FormCard>
            </form>
          )}

          <div style={{ ...card, padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{t(`${list.length} غرض مستحق`, `${list.length} eligible items`)}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={selectAllVisible} style={smallBtn()} disabled={list.length === 0}>{t('تحديد الكل', 'Select all')}</button>
            {selected.size > 0 && <button type="button" onClick={clearSel} style={smallBtn(true)}>{t('إلغاء التحديد', 'Clear')}</button>}
          </div>

          {list.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>{items.length === 0 ? t(`لا توجد أغراض مستحقة للتسليم (لم يمر ${DONATE_AFTER} يوماً على أي غرض غير مستلم)`, 'No items are eligible yet') : t('لا توجد أغراض مطابقة', 'No matching items')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map(item => {
                const on = selected.has(item.id)
                const days = daysSince(item.found_date || item.created_at)
                const ph = Array.isArray(item.photos) ? item.photos[0] : null
                const typeLabel = ITEM_TYPES.find(x => x.value === item.item_type)
                return (
                  <button key={item.id} type="button" onClick={() => toggle(item.id)}
                    style={{ ...card, textAlign: 'start', padding: 12, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit', borderInlineStart: '4px solid #dc2626', outline: on ? '2px solid #8b5cf6' : 'none', outlineOffset: -1, background: on ? 'rgba(139,92,246,0.08)' : 'var(--card)' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: `2px solid ${on ? '#8b5cf6' : 'var(--border)'}`, background: on ? '#8b5cf6' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.78rem', fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    {ph ? <img src={ph} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }} /> : null}
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
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, whiteSpace: 'nowrap', background: 'rgba(220,38,38,0.13)', color: '#dc2626' }}>{t(`${days} يوم`, `${days} d`)}</span>
                  </button>
                )
              })}
            </div>
          )}

          {selected.size > 0 && !showForm && (
            <div style={{ position: 'sticky', bottom: 12, zIndex: 20, ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', borderColor: '#8b5cf6' }}>
              <span style={{ flex: 1, fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-1)' }}>{t(`تم اختيار ${selected.size} غرض`, `${selected.size} items selected`)}</span>
              <PrimaryButton type="button" onClick={() => { setShowForm(true); setBanner(null); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50) }}>{t('متابعة', 'Continue')}</PrimaryButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

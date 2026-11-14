// نموذج إنشاء إرسالية/شحنة: النوع (موجودات/مفقودات/شحنة) ← الخط الأول (من/إلى + الحافلة) ← خط ثانٍ اختياري ← الأغراض ← إصدار التذكرة
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import SelectField from '../shared/SelectField'
import { FormCard, Section, Banner, PrimaryButton, GhostButton, fieldStyle, MONO } from '../lostFound/ui'
import { DISPATCH_KINDS, dispatchError, fmtDate, toLatinDigits } from '../../utils/dispatch'

const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 5 }

export default function DispatchForm({ profile, isAr = true, isAdmin, stations, myStations, history = [], initial, onCancel, onCreated, onPrint }) {
  const t = (a, e) => (isAr ? a : e)
  const allowedFrom = isAdmin ? stations : (myStations.length ? myStations : stations.filter(s => s.id === profile?.station_id))
  const [kind, setKind] = useState(initial?.kind || 'found')
  const [fromId, setFromId] = useState(initial?.fromId || (allowedFrom.length === 1 ? allowedFrom[0].id : ''))
  const [toId, setToId] = useState(initial?.toId || '')
  const [twoLegs, setTwoLegs] = useState(false)
  const [to2Id, setTo2Id] = useState('')
  const [bus, setBus] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState('normal')
  const [party, setParty] = useState({ sender_name: '', sender_phone: '', recipient_name: '', recipient_phone: '' })
  const setP = (k, v) => setParty(p => ({ ...p, [k]: v }))
  const [cands, setCands] = useState([])          // أغراض/بلاغات المحطة المرسِلة
  const [loadingC, setLoadingC] = useState(false)
  const [picked, setPicked] = useState(() => new Map(initial?.items?.map(i => [i.ref_id, i]) || []))   // ref_id → item
  const [free, setFree] = useState([])
  const [freeText, setFreeText] = useState('')
  const [freeQty, setFreeQty] = useState(1)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)
  // أكثر المحطات التي أُرسل إليها من المحطة المختارة (اختصار سريع)
  const topTo = useMemo(() => {
    const c = {}
    history.forEach(d => { const l = (d.legs || []).find(x => x.leg_no === 1); if (l && l.from_station_id === fromId) c[l.to_station_id] = (c[l.to_station_id] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0])
  }, [history, fromId])
  const nm = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])

  // قائمة ما يمكن إرساله من المحطة المختارة
  useEffect(() => {
    if (!fromId || kind === 'shipment') { setCands([]); return }
    let off = false
    setLoadingC(true)
    const q = kind === 'found'
      ? supabase.from('lost_found_items').select('id, item_description, found_date, item_type').eq('station_id', fromId).eq('status', 'unclaimed').order('created_at', { ascending: false }).limit(120)
      : supabase.from('lost_reports').select('id, item_description, customer_name, report_at').eq('station_id', fromId).order('created_at', { ascending: false }).limit(120)
    q.then(({ data }) => { if (!off) { setCands(data ?? []); setLoadingC(false) } })
    return () => { off = true }
  }, [fromId, kind])

  const refType = kind === 'found' ? 'found' : 'report'
  const togglePick = c => setPicked(p => {
    const n = new Map(p)
    if (n.has(c.id)) n.delete(c.id)
    else n.set(c.id, { ref_type: refType, ref_id: c.id, description: c.item_description || (kind === 'lost' ? `بلاغ مفقود${c.customer_name ? ' — ' + c.customer_name : ''}` : 'غرض'), qty: 1 })
    return n
  })
  const addFree = () => {
    const d = freeText.trim()
    if (!d) return
    setFree(f => [...f, { ref_type: 'free', ref_id: null, description: d, qty: Math.max(1, Number(freeQty) || 1) }])
    setFreeText(''); setFreeQty(1)
  }
  const allItems = [...picked.values(), ...free]

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!fromId || !toId) { setErr(t('اختر محطة الإرسال ومحطة الاستقبال', 'Select the sending and receiving stations')); return }
    if (twoLegs && !to2Id) { setErr(t('اختر محطة الخط الثاني أو ألغِ الخط الثاني', 'Select the second leg station or remove it')); return }
    if (!bus.trim()) { setErr(t('أدخل رقم الحافلة', 'Enter the bus number')); return }
    if (!allItems.length) { setErr(kind === 'shipment' ? t('أضف محتويات الشحنة', 'Add the shipment contents') : t('أضف غرضاً واحداً على الأقل', 'Add at least one item')); return }
    if (kind === 'shipment' && !party.recipient_name.trim()) { setErr(t('أدخل اسم المستلِم النهائي للشحنة', 'Enter the recipient name')); return }
    setSaving(true)
    const { data, error } = await supabase.rpc('dispatch_create', {
      p_kind: kind, p_from: fromId, p_to: toId, p_bus: bus.trim(), p_to2: twoLegs ? to2Id : null,
      p_note: note.trim() || null, p_items: allItems, p_request: initial?.requestId || null,
      p_party: kind === 'shipment' ? Object.fromEntries(Object.entries(party).map(([k, v]) => [k, v.trim()])) : null, p_priority: priority,
    })
    setSaving(false)
    if (error) { const m = dispatchError(error); setErr(m === 'SETUP' ? t('لم يُجهَّز النظام بعد: شغّل ملفي SQL «024» ثم «025_dispatches_v2» في Supabase', 'Run the 024 and 025 SQL files in Supabase first') : m); return }
    setDone(data)
    onCreated?.(data)
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '30px 14px' }}>
        <div style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)', padding: '30px 22px' }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.14)', color: '#16a34a', margin: '0 auto 12px' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('تم إصدار الإرسالية وإشعار موظفي محطة الاستقبال', 'Dispatch issued and the receiving station was notified')}</div>
          <div dir="ltr" style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.9rem', letterSpacing: '.04em', color: 'var(--text-1)', margin: '8px 0 4px' }}>{done.ticket_no}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-3)' }}>{t('رقم تذكرة الإرسالية — سلّمه لسائق الحافلة وأرفقه مع الأغراض', 'Dispatch ticket number — hand it to the driver and attach to the items')}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <PrimaryButton type="button" onClick={() => onPrint?.(done.id)}>{t('طباعة التذكرة', 'Print ticket')}</PrimaryButton>
            <GhostButton type="button" onClick={onCancel}>{t('عرض الإرساليات', 'View dispatches')}</GhostButton>
          </div>
        </div>
      </div>
    )
  }

  const pill = (on, color) => ({ padding: '9px 20px', borderRadius: 10, border: `1.5px solid ${on ? color : 'var(--border)'}`, background: on ? `${color}1f` : 'var(--card)', color: on ? color : 'var(--text-2)', fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <form onSubmit={submit} style={{ maxWidth: 820, margin: '0 auto', padding: '18px 14px 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {err && <Banner kind="err">{err}</Banner>}
        {initial?.requestId && <Banner kind="ok">{t('تنفيذ طلب إرسال: بيانات الغرض والمحطة المطلوبة مُعبّأة مسبقاً — راجعها وأدخل رقم الحافلة', 'Fulfilling a send request: details are prefilled')}</Banner>}
        <FormCard icon="box" accent="#2563eb" title={t('إرسالية جديدة', 'New dispatch')} subtitle={profile?.full_name_ar}
          right={<GhostButton type="button" onClick={onCancel} style={{ padding: '8px 16px' }}>{t('رجوع', 'Back')}</GhostButton>}>

          <Section title={t('نوع الإرسالية', 'Dispatch type')}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(DISPATCH_KINDS).map(([k, m]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setPicked(new Map()) }} style={pill(kind === k, m.color)}>{isAr ? m.ar : m.en}</button>
              ))}
            </div>
          </Section>

          <Section title={t('الخط الأول', 'First leg')} hint={t('من محطة الإرسال إلى محطة الاستقبال', 'From the sending to the receiving station')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
              <div>
                <label style={lbl}>{t('من محطة *', 'From station *')}</label>
                {allowedFrom.length === 1
                  ? <div style={{ ...fieldStyle, fontWeight: 800 }}>{allowedFrom[0].name_ar || allowedFrom[0].name_en}</div>
                  : <SelectField value={fromId} onChange={e => { setFromId(e.target.value); setPicked(new Map()) }} style={fieldStyle}>
                      <option value="">{t('— اختر المحطة —', '— Select —')}</option>
                      {allowedFrom.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
                    </SelectField>}
              </div>
              <div>
                <label style={lbl}>{t('إلى محطة *', 'To station *')}</label>
                <SelectField value={toId} onChange={e => setToId(e.target.value)} style={fieldStyle}>
                  <option value="">{t('— اختر المحطة —', '— Select —')}</option>
                  {stations.filter(s => s.id !== fromId).map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
                </SelectField>
                {topTo.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 800, color: 'var(--text-3)', alignSelf: 'center' }}>{t('الأكثر إرسالاً:', 'Frequent:')}</span>
                    {topTo.map(id => <button key={id} type="button" onClick={() => setToId(id)} style={{ padding: '4px 11px', borderRadius: 99, border: `1px solid ${toId === id ? '#2563eb' : 'var(--border)'}`, background: toId === id ? 'rgba(37,99,235,0.12)' : 'var(--card)', color: toId === id ? '#2563eb' : 'var(--text-2)', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{nm[id]}</button>)}
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>{t('رقم الحافلة *', 'Bus number *')}</label>
                <input value={bus} onChange={e => setBus(toLatinDigits(e.target.value))} dir="ltr" inputMode="text" placeholder="4521" style={{ ...fieldStyle, fontFamily: MONO, fontWeight: 800 }} />
              </div>
            </div>
          </Section>

          {kind === 'shipment' && (
            <Section title={t('بيانات الشحنة', 'Shipment details')} hint={t('المرسِل والمستلِم النهائي', 'Sender and final recipient')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                <div><label style={lbl}>{t('اسم المرسِل (العميل)', 'Sender name')}</label><input value={party.sender_name} onChange={e => setP('sender_name', e.target.value)} style={fieldStyle} /></div>
                <div><label style={lbl}>{t('جوال المرسِل', 'Sender phone')}</label><input value={party.sender_phone} onChange={e => setP('sender_phone', toLatinDigits(e.target.value))} dir="ltr" inputMode="tel" style={{ ...fieldStyle, fontFamily: MONO }} /></div>
                <div><label style={lbl}>{t('اسم المستلِم النهائي *', 'Recipient name *')}</label><input value={party.recipient_name} onChange={e => setP('recipient_name', e.target.value)} style={fieldStyle} /></div>
                <div><label style={lbl}>{t('جوال المستلِم', 'Recipient phone')}</label><input value={party.recipient_phone} onChange={e => setP('recipient_phone', toLatinDigits(e.target.value))} dir="ltr" inputMode="tel" style={{ ...fieldStyle, fontFamily: MONO }} /></div>
              </div>
            </Section>
          )}

          <Section title={t('الأولوية', 'Priority')}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" aria-pressed={priority === 'normal'} onClick={() => setPriority('normal')} style={pill(priority === 'normal', '#2563eb')}>{t('عادية', 'Normal')}</button>
              <button type="button" aria-pressed={priority === 'urgent'} onClick={() => setPriority('urgent')} style={pill(priority === 'urgent', '#dc2626')}>{t('عاجلة', 'Urgent')}</button>
            </div>
          </Section>

          <Section title={t('الخط الثاني', 'Second leg')} hint={t('اختياري: عند التحويل عبر محطة وسيطة', 'Optional: when transferring via an intermediate station')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)', cursor: 'pointer' }}>
              <input type="checkbox" checked={twoLegs} onChange={e => { setTwoLegs(e.target.checked); if (!e.target.checked) setTo2Id('') }} style={{ width: 18, height: 18, accentColor: '#2563eb' }} />
              {t('إضافة خط ثانٍ (تستلم المحطة الأولى ثم تُرسلها للمحطة التالية)', 'Add a second leg (the first station receives then forwards)')}
            </label>
            {twoLegs && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
                <div>
                  <label style={lbl}>{t('من محطة (محطة الاستقبال الأولى)', 'From (first receiving station)')}</label>
                  <div style={{ ...fieldStyle, fontWeight: 800, opacity: toId ? 1 : 0.5 }}>{toId ? nm[toId] : t('اختر محطة الاستقبال أولاً', 'Select the first receiving station')}</div>
                </div>
                <div>
                  <label style={lbl}>{t('إلى محطة *', 'To station *')}</label>
                  <SelectField value={to2Id} onChange={e => setTo2Id(e.target.value)} style={fieldStyle}>
                    <option value="">{t('— اختر المحطة —', '— Select —')}</option>
                    {stations.filter(s => s.id !== fromId && s.id !== toId).map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
                  </SelectField>
                </div>
              </div>
            )}
          </Section>

          <Section title={kind === 'shipment' ? t('محتويات الشحنة', 'Shipment contents') : t('الأغراض', 'Items')} hint={kind === 'shipment' ? t('أضف أصناف الشحنة يدوياً', 'Add the shipment items manually') : fromId ? t(`من سجلات ${nm[fromId] || 'المحطة'}`, '') : t('اختر محطة الإرسال أولاً', 'Select the sending station first')}>
            {fromId && kind !== 'shipment' && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', maxHeight: 230, overflowY: 'auto' }}>
                {loadingC ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>{t('جارٍ التحميل…', 'Loading…')}</div>
                  : cands.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>{kind === 'found' ? t('لا موجودات غير مستلمة في هذه المحطة — أضف أغراضك يدوياً بالأسفل', 'No unclaimed items here — add items manually below') : t('لا بلاغات في هذه المحطة — أضف أغراضك يدوياً بالأسفل', 'No reports here — add items manually below')}</div>
                  : cands.map(c => {
                    const on = picked.has(c.id)
                    return (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: on ? 'rgba(37,99,235,0.08)' : 'transparent' }}>
                        <input type="checkbox" checked={on} onChange={() => togglePick(c)} style={{ width: 18, height: 18, accentColor: '#2563eb', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-1)' }}>{c.item_description || (kind === 'lost' ? t('بلاغ مفقود', 'Lost report') : t('غرض', 'Item'))}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{kind === 'found' ? `${t('سُجّل', 'Logged')} ${fmtDate(c.found_date)}` : [c.customer_name, fmtDate(c.report_at)].filter(Boolean).join(' · ')}</span>
                        </span>
                      </label>
                    )
                  })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label style={lbl}>{t('إضافة غرض يدوياً', 'Add an item manually')}</label>
                <input value={freeText} onChange={e => setFreeText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree() } }} placeholder={t('مثال: كرتون ملابس', 'e.g. a box of clothes')} style={fieldStyle} />
              </div>
              <div style={{ width: 84 }}>
                <label style={lbl}>{t('العدد', 'Qty')}</label>
                <input type="number" min={1} value={freeQty} onChange={e => setFreeQty(e.target.value)} dir="ltr" style={{ ...fieldStyle, fontFamily: MONO }} />
              </div>
              <GhostButton type="button" onClick={addFree} style={{ padding: '9px 18px' }}>{t('إضافة', 'Add')}</GhostButton>
            </div>
            {allItems.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allItems.map((i, idx) => (
                  <span key={(i.ref_id || 'f') + idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px', borderRadius: 99, background: 'rgba(37,99,235,0.1)', color: '#2563eb', fontSize: '0.78rem', fontWeight: 700 }}>
                    {i.description}{i.qty > 1 && <b dir="ltr" style={{ fontFamily: MONO }}>×{i.qty}</b>}
                    <button type="button" aria-label={t('حذف', 'Remove')} onClick={() => (i.ref_id ? togglePick({ id: i.ref_id }) : setFree(f => f.filter((_, k) => k !== free.indexOf(i))))}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(37,99,235,0.18)', color: '#2563eb', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title={t('ملاحظة', 'Note')} hint={t('اختياري', 'Optional')}>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500} placeholder={t('أي تفاصيل تهم موظفي محطة الاستقبال', 'Anything the receiving staff should know')} style={{ ...fieldStyle, resize: 'vertical' }} />
          </Section>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <GhostButton type="button" onClick={onCancel}>{t('إلغاء', 'Cancel')}</GhostButton>
            <PrimaryButton type="submit" disabled={saving}>{saving ? t('جارٍ الإصدار…', 'Issuing…') : t('إرسال وإصدار التذكرة', 'Send & issue ticket')}</PrimaryButton>
          </div>
        </FormCard>
      </div>
    </form>
  )
}

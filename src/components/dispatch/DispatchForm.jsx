// نموذج إنشاء إرسالية/شحنة كلوحة جانبية (ورقة سفلية على الجوال): النوع ← المسار والحافلة ← خط ثانٍ اختياري ← الأغراض ← إصدار التذكرة
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import SelectField from '../shared/SelectField'
import Sheet, { Ic } from './Sheet'
import { fieldStyle, MONO } from '../lostFound/ui'
import { btn } from './DispatchCards'
import { DISPATCH_KINDS, dispatchError, fmtDate, toLatinDigits } from '../../utils/dispatch'

const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }

// قسم داخل النموذج (خارج المكوّن حتى لا تفقد الحقول التركيز عند الكتابة)
const Block = ({ title, hintTxt, children }) => (
  <section style={{ paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--text-1)' }}>{title}</span>
      {hintTxt && <span style={{ fontSize: '0.66rem', color: 'var(--text-3)' }}>{hintTxt}</span>}
    </div>
    {children}
  </section>
)

export default function DispatchForm({ profile, isAr = true, isAdmin, stations, myStations, history = [], initial, onClose, onCreated, onPrint, onShow }) {
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
    if (error) { const m = dispatchError(error); setErr(m === 'SETUP' ? t('لم يُجهَّز النظام بعد: شغّل ملفات SQL «024» و«025» و«026» في Supabase', 'Run the 024 and 025 SQL files in Supabase first') : m); return }
    setDone(data)
    onCreated?.(data)
  }

  // أي بيانات مُدخلة؟ (لتأكيد الإغلاق قبل ضياعها)
  const dirty = !done && !!(toId || bus.trim() || note.trim() || allItems.length || Object.values(party).some(v => v.trim()))
  const requestClose = () => { if (dirty && !window.confirm(t('لديك بيانات غير محفوظة. إغلاق النموذج؟', 'You have unsaved data. Close the form?'))) return; onClose?.() }

  if (done) {
    return (
      <Sheet isAr={isAr} variant="drawer" width={520} title={t('تم إصدار الإرسالية', 'Dispatch issued')} icon={Ic.check} accent="#16a34a" onClose={onClose}
        footer={<>
          <button type="button" onClick={() => onPrint?.(done.id)} style={btn('ghost')}>{t('طباعة التذكرة', 'Print ticket')}</button>
          <button type="button" onClick={() => { onShow?.(done.id); onClose?.() }} style={{ ...btn('primary'), padding: '11px 26px', fontSize: '0.88rem' }}>{t('عرض الإرسالية', 'View dispatch')}</button>
        </>}>
        <div style={{ textAlign: 'center', padding: '24px 6px 8px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,0.14)', color: '#16a34a', margin: '0 auto 14px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-3)' }}>{t('أُشعر موظفو محطة الاستقبال', 'The receiving station was notified')}</div>
          <div dir="ltr" style={{ fontFamily: MONO, fontWeight: 900, fontSize: '2rem', letterSpacing: '.05em', color: 'var(--text-1)', margin: '10px 0 6px' }}>{done.ticket_no}</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', lineHeight: 1.8 }}>{t('رقم تذكرة الإرسالية — سلّمه لسائق الحافلة وأرفقه مع الأغراض', 'Dispatch ticket — hand it to the driver and attach it to the items')}</div>
        </div>
      </Sheet>
    )
  }

  const seg = (on, color) => ({ flex: 1, minWidth: 0, padding: '10px 6px', borderRadius: 11, border: `1.5px solid ${on ? color : 'var(--border)'}`, background: on ? `${color}1a` : 'var(--card)', color: on ? color : 'var(--text-2)', fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' })
  const stationOpt = list => list.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)

  return (
    <Sheet isAr={isAr} variant="drawer" width={620} title={t('إرسالية / شحنة جديدة', 'New dispatch / shipment')} icon={Ic.send} onClose={requestClose} closeOnBackdrop={false}
      sub={initial?.requestId ? t('تنفيذ طلب إرسال: بيانات الغرض والمحطة مُعبّأة مسبقاً — أدخل رقم الحافلة', 'Fulfilling a send request: details prefilled') : profile?.full_name_ar}
      footer={<>
        <button type="button" onClick={requestClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="submit" form="dsp-form" disabled={saving} style={{ ...btn('primary'), padding: '11px 30px', fontSize: '0.9rem', opacity: saving ? 0.6 : 1 }}>{saving ? t('جارٍ الإصدار…', 'Issuing…') : t('إرسال وإصدار التذكرة', 'Send & issue ticket')}</button>
      </>}>
      <form id="dsp-form" onSubmit={submit}>
        {err && <div role="alert" style={{ padding: '11px 14px', borderRadius: 11, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.35)', color: '#dc2626', fontSize: '0.82rem', fontWeight: 800, marginBottom: 16, lineHeight: 1.7 }}>{err}</div>}

        <Block title={t('نوع الإرسالية', 'Type')}>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(DISPATCH_KINDS).map(([k, m]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setPicked(new Map()) }} style={seg(kind === k, m.color)}>{isAr ? m.ar : m.en}</button>
            ))}
          </div>
        </Block>

        <Block title={t('المسار', 'Route')} hintTxt={t('الخط الأول', 'First leg')}>
          <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: '0 12px', alignItems: 'stretch' }}>
            <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 30, paddingBottom: 12 }}>
              <i style={{ width: 12, height: 12, borderRadius: '50%', border: '3px solid #2563eb', background: 'var(--card)' }} />
              <i style={{ flex: 1, width: 2, background: 'repeating-linear-gradient(to bottom, #2563eb 0 5px, transparent 5px 9px)', margin: '4px 0' }} />
              <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#2563eb' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>{t('من محطة *', 'From *')}</label>
                {allowedFrom.length === 1
                  ? <div style={{ ...fieldStyle, fontWeight: 800 }}>{allowedFrom[0].name_ar || allowedFrom[0].name_en}</div>
                  : <SelectField value={fromId} onChange={e => { setFromId(e.target.value); setPicked(new Map()) }} style={fieldStyle}><option value="">{t('— اختر المحطة —', '— Select —')}</option>{stationOpt(allowedFrom)}</SelectField>}
              </div>
              <div>
                <label style={lbl}>{t('إلى محطة *', 'To *')}</label>
                <SelectField value={toId} onChange={e => setToId(e.target.value)} style={fieldStyle}><option value="">{t('— اختر المحطة —', '— Select —')}</option>{stationOpt(stations.filter(s => s.id !== fromId))}</SelectField>
                {topTo.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 800, color: 'var(--text-3)' }}>{t('الأكثر إرسالاً:', 'Frequent:')}</span>
                    {topTo.map(id => <button key={id} type="button" onClick={() => setToId(id)} style={{ padding: '4px 11px', borderRadius: 99, border: `1px solid ${toId === id ? '#2563eb' : 'var(--border)'}`, background: toId === id ? 'rgba(37,99,235,0.12)' : 'var(--card)', color: toId === id ? '#2563eb' : 'var(--text-2)', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{nm[id]}</button>)}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>{t('رقم الحافلة *', 'Bus number *')}</label>
            <input value={bus} onChange={e => setBus(toLatinDigits(e.target.value))} dir="ltr" inputMode="text" placeholder="4521" style={{ ...fieldStyle, fontFamily: MONO, fontWeight: 900, fontSize: '1rem', letterSpacing: '.04em' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '11px 13px', borderRadius: 12, border: `1px dashed ${twoLegs ? '#2563eb' : 'var(--border-2)'}`, background: twoLegs ? 'rgba(37,99,235,0.06)' : 'transparent', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-1)', cursor: 'pointer' }}>
            <input type="checkbox" checked={twoLegs} onChange={e => { setTwoLegs(e.target.checked); if (!e.target.checked) setTo2Id('') }} style={{ width: 18, height: 18, accentColor: '#2563eb' }} />
            <span style={{ flex: 1 }}>{t('إضافة خط ثانٍ عبر محطة تحويل', 'Add a second leg via a transfer station')}<span style={{ display: 'block', fontSize: '0.66rem', color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>{t('تستلمها المحطة الأولى ثم تُرسلها للمحطة التالية', 'The first station receives then forwards it')}</span></span>
          </label>
          {twoLegs && (
            <div style={{ marginTop: 12 }}>
              <label style={lbl}>{t(`إلى محطة (من ${toId ? nm[toId] : 'محطة الاستقبال الأولى'}) *`, 'Second leg to *')}</label>
              <SelectField value={to2Id} onChange={e => setTo2Id(e.target.value)} style={fieldStyle}><option value="">{t('— اختر المحطة —', '— Select —')}</option>{stationOpt(stations.filter(s => s.id !== fromId && s.id !== toId))}</SelectField>
            </div>
          )}
        </Block>

        {kind === 'shipment' && (
          <Block title={t('بيانات الشحنة', 'Shipment details')} hintTxt={t('المرسِل والمستلِم النهائي', 'Sender and final recipient')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div><label style={lbl}>{t('اسم المرسِل (العميل)', 'Sender name')}</label><input value={party.sender_name} onChange={e => setP('sender_name', e.target.value)} style={fieldStyle} /></div>
              <div><label style={lbl}>{t('جوال المرسِل', 'Sender phone')}</label><input value={party.sender_phone} onChange={e => setP('sender_phone', toLatinDigits(e.target.value))} dir="ltr" inputMode="tel" style={{ ...fieldStyle, fontFamily: MONO }} /></div>
              <div><label style={lbl}>{t('اسم المستلِم النهائي *', 'Recipient name *')}</label><input value={party.recipient_name} onChange={e => setP('recipient_name', e.target.value)} style={fieldStyle} /></div>
              <div><label style={lbl}>{t('جوال المستلِم', 'Recipient phone')}</label><input value={party.recipient_phone} onChange={e => setP('recipient_phone', toLatinDigits(e.target.value))} dir="ltr" inputMode="tel" style={{ ...fieldStyle, fontFamily: MONO }} /></div>
            </div>
          </Block>
        )}

        <Block title={kind === 'shipment' ? t('محتويات الشحنة', 'Contents') : t('الأغراض', 'Items')} hintTxt={kind === 'shipment' ? t('أضف الأصناف يدوياً', 'Add manually') : fromId ? t(`من سجلات ${nm[fromId] || 'المحطة'}`, '') : t('اختر محطة الإرسال أولاً', 'Select the sending station first')}>
          {fromId && kind !== 'shipment' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', maxHeight: 210, overflowY: 'auto', marginBottom: 12 }}>
              {loadingC ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>{t('جارٍ التحميل…', 'Loading…')}</div>
                : cands.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem', lineHeight: 1.7 }}>{kind === 'found' ? t('لا موجودات غير مستلمة في هذه المحطة — أضف أغراضك يدوياً بالأسفل', 'No unclaimed items here — add items manually below') : t('لا بلاغات في هذه المحطة — أضف أغراضك يدوياً بالأسفل', 'No reports here — add items manually below')}</div>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={lbl}>{t('إضافة غرض يدوياً', 'Add an item manually')}</label>
              <input value={freeText} onChange={e => setFreeText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree() } }} placeholder={t('مثال: كرتون ملابس', 'e.g. a box of clothes')} style={fieldStyle} />
            </div>
            <div style={{ width: 70 }}>
              <label style={lbl}>{t('العدد', 'Qty')}</label>
              <input type="number" min={1} value={freeQty} onChange={e => setFreeQty(e.target.value)} dir="ltr" style={{ ...fieldStyle, fontFamily: MONO }} />
            </div>
            <button type="button" onClick={addFree} style={{ ...btn('ghost'), height: 42, padding: '0 16px' }}>{t('إضافة', 'Add')}</button>
          </div>
          {allItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {allItems.map((i, idx) => (
                <span key={(i.ref_id || 'f') + idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px', borderRadius: 99, background: 'rgba(37,99,235,0.1)', color: '#2563eb', fontSize: '0.78rem', fontWeight: 700 }}>
                  {i.description}{i.qty > 1 && <b dir="ltr" style={{ fontFamily: MONO }}>×{i.qty}</b>}
                  <button type="button" aria-label={t('حذف', 'Remove')} onClick={() => (i.ref_id ? togglePick({ id: i.ref_id }) : setFree(f => f.filter((_, k) => k !== free.indexOf(i))))}
                    style={{ width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(37,99,235,0.18)', color: '#2563eb', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </Block>

        <Block title={t('الأولوية والملاحظة', 'Priority & note')}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" aria-pressed={priority === 'normal'} onClick={() => setPriority('normal')} style={seg(priority === 'normal', '#2563eb')}>{t('عادية', 'Normal')}</button>
            <button type="button" aria-pressed={priority === 'urgent'} onClick={() => setPriority('urgent')} style={seg(priority === 'urgent', '#dc2626')}>{t('عاجلة', 'Urgent')}</button>
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500} placeholder={t('ملاحظة لموظفي محطة الاستقبال (اختياري)', 'Note for the receiving staff (optional)')} style={{ ...fieldStyle, resize: 'vertical' }} />
        </Block>
      </form>
    </Sheet>
  )
}

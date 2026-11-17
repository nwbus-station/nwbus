// تبويب الشريط الإخباري: رسائل نصية قصيرة تتحرك في شريط أسفل شاشات المحطات (عادية أو عاجلة بشريط أحمر)
// الوجهة: كل الشاشات / محطات / شاشات محددة، مع جدولة، وموافقة تفرضها القاعدة في الخادم
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic, useMedia } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import DatePicker from '../shared/DatePicker'
import TimeInput24 from '../shared/TimeInput24'
import StationPicker from './StationPicker'
import { lbl, input, Pill, Empty, Err, SG_ACCENT } from './common'
import {
  DAYS, DAY_PRESETS, TIME_PRESETS, fmtDT, sgError, toRiyadhISO, fromRiyadhISO, scopeLabel, scheduleLabel, strToMin, minToStr,
  riyadhNow, addDaysStr, campaignActiveNow, campaignTargets, sameDays, isOnline,
} from '../../utils/signage'

const FILTERS = ['all', 'pending', 'active', 'paused', 'rejected']
const TK_STATUS = {
  active:   { ar: 'نشطة',            en: 'Active',   color: '#16a34a' },
  pending:  { ar: 'بانتظار الموافقة', en: 'Pending',  color: '#d97706' },
  paused:   { ar: 'موقوفة',          en: 'Paused',   color: '#6366f1' },
  rejected: { ar: 'مرفوضة',          en: 'Rejected', color: '#dc2626' },
}
const URGENT = '#dc2626'
const LEVEL_COLOR = { normal: '#64748b', urgent: URGENT }
const MAX_LEN = 200
const PHRASES = [
  { ar: 'تأخرت رحلة … دقيقة', en: 'Trip delayed … minutes', fill: { ar: 'تأخرت رحلة جدة 15 دقيقة', en: 'The Jeddah trip is delayed by 15 minutes' }, example: true },
  { ar: 'نرحب بكم في محطاتنا', en: 'Welcome to our stations', fill: { ar: 'نرحب بكم في محطاتنا', en: 'Welcome to our stations' } },
  { ar: 'يرجى الالتزام بالتعليمات وعدم ترك الأمتعة', en: 'Please follow instructions and never leave luggage unattended', fill: { ar: 'يرجى الالتزام بالتعليمات وعدم ترك الأمتعة', en: 'Please follow instructions and never leave luggage unattended' } },
  { ar: 'نتمنى لكم رحلة سعيدة', en: 'Have a pleasant trip', fill: { ar: 'نتمنى لكم رحلة سعيدة', en: 'Have a pleasant trip' } },
]

// هل الرسالة تُعرض الآن؟ (نفس منطق الحملات: «active» هنا تقابل «approved» هناك)
export const tickerLiveNow = k => campaignActiveNow({ ...k, status: k.status === 'active' ? 'approved' : k.status })

/* ───────────── شريط الأخبار المتحرك (معاينة بنمط شاشات التلفاز) ───────────── */
const TICK_CSS = `
@keyframes nwTickMove{from{transform:translateX(-50%)}to{transform:translateX(0)}}
.nw-tick .nw-track{display:flex;width:max-content;animation:nwTickMove var(--tk-dur,30s) linear infinite}
.nw-tick:hover .nw-track{animation-play-state:paused}
@media (prefers-reduced-motion: reduce){.nw-tick{overflow-x:auto !important}.nw-tick .nw-track{animation:none}}
`

function TickerBar({ items, height = 56, isAr = true, empty }) {
  const t = (a, e) => (isAr ? a : e)
  const bar = { background: '#0f172a', borderRadius: 4, overflow: 'hidden', height, display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' }
  if (!items.length) {
    return <div style={{ ...bar, padding: '0 16px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>{empty || t('لا توجد رسائل تُعرض الآن', 'Nothing is showing right now')}</div>
  }
  const total = items.reduce((n, i) => n + i.text.length, 0)
  const rep = Math.max(1, Math.ceil(160 / Math.max(total, 1)))
  const dur = Math.max(14, Math.round(total * rep * 0.26))
  const seg = (it, k) => (
    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', height, flexShrink: 0 }}>
      {it.level === 'urgent' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: '100%', padding: '0 24px', background: URGENT, color: '#fff', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 900, padding: '2px 8px', background: '#fff', color: URGENT, borderRadius: 2 }}>{t('عاجل', 'URGENT')}</span>
          <span dir="auto" style={{ fontSize: '1.02rem', fontWeight: 900 }}>{it.text}</span>
        </span>
      ) : (
        <span dir="auto" style={{ padding: '0 22px', color: '#f1f5f9', fontSize: '1.02rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{it.text}</span>
      )}
      <i aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
    </span>
  )
  const half = (p) => Array.from({ length: rep }).flatMap((_, r) => items.map((it, i) => seg(it, `${p}${r}-${i}`)))
  return (
    <div className="nw-tick" dir="ltr" style={{ ...bar, display: 'block', '--tk-dur': `${dur}s` }}>
      <style>{TICK_CSS}</style>
      <div className="nw-track" style={{ height }}>
        <div style={{ display: 'flex' }}>{half('a')}</div>
        <div style={{ display: 'flex' }} aria-hidden="true">{half('b')}</div>
      </div>
    </div>
  )
}

/* ───────────── التبويب ───────────── */
export default function TickersTab({ isAr, role, myUserId, tickers, devices, stations, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const isAdmin = role === 'admin'
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(null)        // null | { k? }
  const [ask, setAsk] = useState(null)          // { kind: 'delete'|'pause'|'reject', k }
  const [busy, setBusy] = useState(false)
  const stationsById = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const devicesById = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])), [devices])
  const activeDevices = useMemo(() => devices.filter(d => d.status === 'active'), [devices])
  const ordered = useMemo(() => [...tickers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [tickers])
  const list = ordered.filter(k => filter === 'all' || k.status === filter)
  const count = s => (s === 'all' ? tickers.length : tickers.filter(k => k.status === s).length)
  const mine = k => isAdmin || k.created_by === myUserId
  const reach = k => activeDevices.filter(d => campaignTargets(k, d))
  const liveItems = useMemo(() => list.filter(tickerLiveNow).sort((a, b) => (b.level === 'urgent') - (a.level === 'urgent')).map(k => ({ text: k.text, level: k.level })), [list]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn, ok) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false); setAsk(null)
    if (error) { flash(sgError(error, isAr), false); return }
    flash(ok, true); reload()
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {FILTERS.map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              style={{ padding: '7px 14px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', border: `1.5px solid ${filter === f ? SG_ACCENT : 'var(--border)'}`, background: filter === f ? `${SG_ACCENT}18` : 'var(--card)', color: filter === f ? SG_ACCENT : 'var(--text-2)' }}>
              {f === 'all' ? t('الكل', 'All') : TK_STATUS[f][isAr ? 'ar' : 'en']} <span dir="ltr" style={{ opacity: 0.7 }}>{count(f)}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setForm({})} style={{ ...btn('primary'), background: SG_ACCENT, padding: '10px 20px', fontSize: '0.84rem' }}>{t('رسالة جديدة', 'New message')}</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-2)' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: liveItems.length ? '#16a34a' : '#94a3b8' }} />
          {t('معاينة الشريط كما يظهر على الشاشات', 'Ticker preview as shown on screens')}
          <span dir="ltr" style={{ color: 'var(--text-3)' }}>({liveItems.length})</span>
        </div>
        <TickerBar items={liveItems} isAr={isAr} height={56} empty={t('لا توجد رسائل تُعرض الآن ضمن هذه القائمة', 'No live messages in this list')} />
      </div>

      {list.length === 0 ? <Empty title={t('لا توجد رسائل', 'No messages')} hint={t('أنشئ رسالة تظهر في الشريط المتحرك على الشاشات المستهدفة.', 'Create a message for the scrolling ticker on target screens.')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(k => {
            const st = TK_STATUS[k.status] || TK_STATUS.paused
            const live = tickerLiveNow(k)
            const n = reach(k).length
            const urgent = k.level === 'urgent'
            return (
              <article key={k.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, background: 'var(--card)', border: '1px solid var(--border)', borderInlineStart: `4px solid ${urgent ? URGENT : st.color}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Pill color={LEVEL_COLOR[k.level] || LEVEL_COLOR.normal}>{urgent ? t('عاجل', 'Urgent') : t('عادي', 'Normal')}</Pill>
                  <Pill color={st.color} dot>{st[isAr ? 'ar' : 'en']}</Pill>
                  {live && <Pill color="#16a34a">{t('يُعرض الآن', 'Showing now')}</Pill>}
                </div>
                <div dir="auto" style={{ fontWeight: 900, fontSize: '1.12rem', lineHeight: 1.7, color: urgent ? URGENT : 'var(--text-1)', overflowWrap: 'anywhere' }}>{k.text}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.9 }}>
                  <b>{t('الوجهة', 'Target')}:</b> {scopeLabel(k, stationsById, devicesById, isAr) || '—'}
                  {k.status === 'active' && <span style={{ color: n ? 'var(--text-3)' : '#d97706', fontWeight: 700 }}> ({n ? t(`${n} شاشة`, `${n} screen(s)`) : t('لا توجد شاشات مطابقة', 'no matching screens')})</span>}
                  {' · '}<b>{t('الجدولة', 'Schedule')}:</b> {scheduleLabel(k, isAr)}
                  <br /><span style={{ color: 'var(--text-3)' }}>{t('أنشأها', 'By')} {k.created_by_name || '—'} · {fmtDT(k.created_at)}</span>
                  {k.reviewed_by_name && <span style={{ color: 'var(--text-3)' }}> · {k.status === 'rejected' ? t('رفضها', 'Rejected by') : t('اعتمدها', 'Approved by')} {k.reviewed_by_name}</span>}
                </div>
                {k.status === 'rejected' && k.review_note && <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#dc2626' }}>{t('سبب الرفض', 'Reason')}: {k.review_note}</div>}
                {k.status === 'pending' && <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#d97706' }}>{isAdmin && k.created_by !== myUserId ? t('بانتظار قرارك', 'Awaiting your decision') : t('بانتظار موافقة الإدارة، لن تظهر قبلها', 'Awaiting admin approval; not shown yet')}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
                  {k.status === 'pending' && isAdmin && k.created_by !== myUserId && <>
                    <button type="button" disabled={busy} onClick={() => run(() => supabase.rpc('signage_ticker_review', { p_id: k.id, p_approve: true, p_note: null }), t('تمت الموافقة، الرسالة منشورة الآن', 'Approved and live'))} style={btn('ok')}>{t('موافقة ونشر', 'Approve')}</button>
                    <button type="button" disabled={busy} onClick={() => setAsk({ kind: 'reject', k })} style={btn('danger')}>{t('رفض', 'Reject')}</button>
                  </>}
                  {k.status === 'paused' && mine(k) && <button type="button" disabled={busy} onClick={() => run(() => supabase.rpc('signage_ticker_toggle', { p_id: k.id, p_on: true }), t('تم الاستئناف (الرسائل الموجّهة لكل الشاشات أو العاجلة قد تنتظر موافقة الإدارة)', 'Resumed (all-screen or urgent messages may need approval)'))} style={btn('ok')}>{t('استئناف', 'Resume')}</button>}
                  {k.status === 'active' && mine(k) && <button type="button" disabled={busy} onClick={() => setAsk({ kind: 'pause', k })} style={btn('warn')}>{t('إيقاف مؤقت', 'Pause')}</button>}
                  {mine(k) && k.status !== 'pending' && <button type="button" disabled={busy} onClick={() => setForm({ k })} style={btn('ghost')}>{t('تعديل', 'Edit')}</button>}
                  {mine(k) && <button type="button" disabled={busy} onClick={() => setAsk({ kind: 'delete', k })} style={btn('danger')}>{t('حذف', 'Delete')}</button>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {form && <TickerForm isAr={isAr} role={role} k={form.k} devices={devices} stations={stations} onClose={() => setForm(null)}
        onDone={msg => { setForm(null); flash(msg, true); reload() }} />}
      {ask?.kind === 'delete' && <ConfirmDialog title={t('حذف الرسالة', 'Delete message')} confirmLabel={busy ? '…' : t('حذف نهائي', 'Delete')}
        message={t('ستُحذف هذه الرسالة نهائياً وتختفي من الشريط على الشاشات خلال دقيقة. لا يمكن التراجع عن الحذف.', 'This message is permanently deleted and leaves the ticker within a minute. This cannot be undone.')}
        onCancel={() => setAsk(null)} onConfirm={() => run(() => supabase.rpc('signage_ticker_delete', { p_id: ask.k.id }), t('تم حذف الرسالة', 'Message deleted'))} />}
      {ask?.kind === 'pause' && <ConfirmDialog danger={false} title={t('إيقاف الرسالة مؤقتاً', 'Pause message')} confirmLabel={busy ? '…' : t('إيقاف', 'Pause')}
        message={t('ستختفي من الشريط خلال دقيقة، ويمكنك استئنافها لاحقاً (الرسائل الموجّهة لكل الشاشات أو العاجلة تحتاج موافقة جديدة عند الاستئناف من حساب التسويق).', 'It leaves the ticker within a minute and can be resumed later.')}
        onCancel={() => setAsk(null)} onConfirm={() => run(() => supabase.rpc('signage_ticker_toggle', { p_id: ask.k.id, p_on: false }), t('تم الإيقاف المؤقت', 'Paused'))} />}
      {ask?.kind === 'reject' && <RejectSheet isAr={isAr} k={ask.k} busy={busy} onClose={() => setAsk(null)}
        onConfirm={note => run(() => supabase.rpc('signage_ticker_review', { p_id: ask.k.id, p_approve: false, p_note: note }), t('تم رفض الرسالة وإشعار صاحبها', 'Rejected'))} />}
    </div>
  )
}

function RejectSheet({ isAr, k, busy, onClose, onConfirm }) {
  const t = (a, e) => (isAr ? a : e)
  const [note, setNote] = useState('')
  return (
    <Sheet isAr={isAr} title={t('رفض الرسالة', 'Reject message')} icon={Ic.x} accent="#dc2626" onClose={onClose} sub={k.text.length > 70 ? `${k.text.slice(0, 70)}…` : k.text}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={busy || !note.trim()} onClick={() => onConfirm(note.trim())} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '11px 28px', fontSize: '0.88rem', opacity: busy || !note.trim() ? 0.55 : 1 }}>{busy ? '…' : t('تأكيد الرفض', 'Reject')}</button>
      </>}>
      <label style={lbl}>{t('سبب الرفض *', 'Reason *')}</label>
      <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={300} style={{ ...input, resize: 'vertical' }} placeholder={t('يصل السبب لصاحب الرسالة بإشعار', 'The creator is notified with the reason')} />
    </Sheet>
  )
}

/* ───────────── نافذة الرسالة (بأقسام مرقّمة مع ملخص حيّ) ───────────── */
const Chip = ({ on, onClick, children, title, color = SG_ACCENT }) => (
  <button type="button" aria-pressed={on} title={title} onClick={onClick}
    style={{ padding: '8px 14px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: '100%', border: `1.5px solid ${on ? color : 'var(--border)'}`, background: on ? `${color}18` : 'var(--card)', color: on ? color : 'var(--text-2)' }}>{children}</button>
)
const Card = ({ n, title, hint, children }) => (
  <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--card)', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: SG_ACCENT, color: '#fff', fontSize: '0.74rem', fontWeight: 900, flexShrink: 0 }}>{n}</span>
      <div><div style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{title}</div>{hint && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 1 }}>{hint}</div>}</div>
    </div>
    {children}
  </section>
)

function TickerForm({ isAr, role, k, devices, stations, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const desk = useMedia('(min-width: 900px)')
  const s0 = fromRiyadhISO(k?.starts_at), e0 = fromRiyadhISO(k?.ends_at)
  const [text, setText] = useState(k?.text || '')
  const [level, setLevel] = useState(k?.level || 'normal')
  const [scope, setScope] = useState(k?.scope || 'stations')
  const [stIds, setStIds] = useState(k?.station_ids || [])
  const [dvIds, setDvIds] = useState(k?.device_ids || [])
  const [dq, setDq] = useState('')
  const [sd, setSd] = useState(s0.date), [st, setSt] = useState(s0.time), [ed, setEd] = useState(e0.date), [et, setEt] = useState(e0.time)
  const [days, setDays] = useState(k?.days || [])
  const [allDay, setAllDay] = useState(k?.from_min == null)
  const [from, setFrom] = useState(k?.from_min != null ? minToStr(k.from_min) : '08:00'), [to, setTo] = useState(k?.to_min != null ? minToStr(k.to_min) : '22:00')
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
  const needsApproval = role !== 'admin' && (scope === 'all' || level === 'urgent')
  const activeDevices = useMemo(() => devices.filter(d => d.status === 'active'), [devices])
  const stName = id => { const s = stations.find(x => x.id === id); return s?.name_ar || s?.name_en || '' }

  // الشاشات التي ستستلم الرسالة
  const reach = useMemo(() => activeDevices.filter(d => campaignTargets({ scope, station_ids: stIds, device_ids: dvIds }, d)), [activeDevices, scope, stIds, dvIds])
  const reachStations = new Set(reach.map(d => d.station_id).filter(Boolean)).size

  // اختصارات التوقيت
  const today = riyadhNow().date
  const datePreset = p => {
    if (p === 'none') { setSd(''); setEd(''); setSt(''); setEt(''); return }
    const n = p === 'today' ? 0 : Number(p) - 1
    setSd(today); setEd(addDaysStr(today, n)); setSt('00:00'); setEt('23:59')
  }
  const curDatePreset = !sd && !ed ? 'none' : (sd === today && ed === today ? 'today' : (sd === today && ed === addDaysStr(today, 6) ? '7' : (sd === today && ed === addDaysStr(today, 29) ? '30' : 'custom')))
  const curDayPreset = DAY_PRESETS.find(p => sameDays(p.days, days))?.k || 'custom'
  const curTimePreset = allDay ? 'all' : (TIME_PRESETS.find(p => p.from != null && minToStr(p.from) === from && minToStr(p.to) === to)?.k || 'custom')
  const setTimePreset = p => { if (p.from == null) { setAllDay(true) } else { setAllDay(false); setFrom(minToStr(p.from)); setTo(minToStr(p.to)) } }

  const dayText = days.length === 0 || days.length === 7 ? t('كل الأيام', 'Every day') : days.map(d => DAYS[d][isAr ? 'ar' : 'en']).join('، ')
  const timeText = allDay ? t('طوال اليوم', 'All day') : t(`من ${from} إلى ${to}`, `${from}–${to}`)
  const dateText = sd || ed ? t(`من ${sd || '…'} إلى ${ed || '…'}`, `${sd || '…'} → ${ed || '…'}`) : t('بدون تاريخ انتهاء', 'No end date')

  const insertPhrase = p => {
    const add = p.fill[isAr ? 'ar' : 'en']
    setText(cur => (cur.trim() ? `${cur.trim()} ${add}` : add).slice(0, MAX_LEN))
  }

  async function save() {
    setErr('')
    if (!text.trim()) { setErr(t('اكتب نص الرسالة', 'Enter the message text')); return }
    if (scope === 'stations' && !stIds.length) { setErr(t('اختر محطة واحدة على الأقل', 'Pick at least one station')); return }
    if (scope === 'devices' && !dvIds.length) { setErr(t('اختر شاشة واحدة على الأقل', 'Pick at least one screen')); return }
    if (!allDay && (from.length !== 5 || to.length !== 5)) { setErr(t('اكتب وقت البداية والنهاية بصيغة 24 ساعة', 'Enter start and end time (24h)')); return }
    const sIso = toRiyadhISO(sd, st), eIso = toRiyadhISO(ed, et)
    if (sIso && eIso && new Date(eIso) <= new Date(sIso)) { setErr(t('تاريخ النهاية يجب أن يكون بعد البداية', 'End must be after start')); return }
    setSaving(true)
    const { error } = await supabase.rpc('signage_ticker_save', {
      p_id: k?.id || null, p_text: text.trim(), p_level: level, p_scope: scope, p_stations: scope === 'stations' ? stIds : [], p_devices: scope === 'devices' ? dvIds : [],
      p_starts: sIso, p_ends: eIso, p_days: days.length && days.length < 7 ? days : null,
      p_from: allDay ? null : strToMin(from), p_to: allDay ? null : strToMin(to),
    })
    setSaving(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone(needsApproval ? t('حُفظت وأُرسلت للموافقة. ستظهر بعد موافقة الإدارة', 'Saved and sent for approval') : t('حُفظت ونُشرت على الشريط', 'Saved and published'))
  }

  // الشاشات مجمّعة بمحطاتها (لتحديد شاشات محددة)
  const groups = useMemo(() => {
    const term = dq.trim().toLowerCase(); const g = {}
    activeDevices.filter(d => !term || d.name.toLowerCase().includes(term) || stName(d.station_id).toLowerCase().includes(term)).forEach(d => { (g[d.station_id || '_'] = g[d.station_id || '_'] || []).push(d) })
    return Object.entries(g).map(([id, ds]) => ({ id, name: id === '_' ? t('بدون محطة', 'No station') : stName(id), ds })).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  }, [activeDevices, dq, stations]) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = (
    <aside style={{ border: `1.5px solid ${SG_ACCENT}55`, background: `${SG_ACCENT}0a`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: desk ? 'sticky' : 'static', top: 0, minWidth: 0 }}>
      <div style={{ fontWeight: 900, fontSize: '0.9rem', color: 'var(--text-1)' }}>{t('ملخص الرسالة', 'Summary')}</div>
      <div style={{ fontSize: '0.78rem', lineHeight: 1.9, color: 'var(--text-2)' }}>
        <div><b>{t('النوع', 'Level')}:</b> <span style={{ color: level === 'urgent' ? URGENT : 'var(--text-1)', fontWeight: 900 }}>{level === 'urgent' ? t('عاجل (شريط أحمر)', 'Urgent (red bar)') : t('عادي', 'Normal')}</span></div>
        <div><b>{t('تظهر على', 'Shown on')}:</b> <span style={{ color: reach.length ? '#16a34a' : '#d97706', fontWeight: 900 }}>{t(`${reach.length} شاشة`, `${reach.length} screen(s)`)}</span>{reachStations > 0 && t(` في ${reachStations} محطة`, ` in ${reachStations} station(s)`)}</div>
        {reach.length > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{reach.slice(0, 5).map(d => d.name).join('، ')}{reach.length > 5 ? t(` و${reach.length - 5} أخرى`, ` +${reach.length - 5}`) : ''}</div>}
        {reach.length > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{t(`متصلة الآن: ${reach.filter(isOnline).length}`, `Online: ${reach.filter(isOnline).length}`)}</div>}
        <div><b>{t('الفترة', 'Period')}:</b> {dateText}</div>
        <div><b>{t('الأيام', 'Days')}:</b> {dayText}</div>
        <div><b>{t('الوقت', 'Time')}:</b> {timeText}</div>
      </div>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, lineHeight: 1.7, color: needsApproval ? '#d97706' : '#16a34a', padding: '8px 10px', borderRadius: 9, background: needsApproval ? 'rgba(217,119,6,.1)' : 'rgba(22,163,74,.1)' }}>
        {needsApproval ? t('ستنتظر موافقة الإدارة قبل أن تظهر على الشاشات.', 'Needs admin approval before showing.') : t('تُنشر مباشرة عند الحفظ.', 'Publishes immediately on save.')}
      </div>
    </aside>
  )

  return (
    <Sheet isAr={isAr} variant="drawer" width={900} title={k ? t('تعديل الرسالة', 'Edit message') : t('رسالة جديدة', 'New message')} icon={Ic.send} accent={SG_ACCENT} onClose={onClose}
      sub={t('اكتب الرسالة ثم حدّد الوجهة والتوقيت. الملخص يتحدّث مباشرة.', 'Write the message, then pick target and timing. The summary updates live.')}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={saving} onClick={save} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 24px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : needsApproval ? t('حفظ وإرسال للموافقة', 'Save & request approval') : t('حفظ ونشر', 'Save & publish')}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: desk ? 'minmax(0,1fr) 280px' : 'minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        {!desk && summary}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Err>{err}</Err>

          <Card n="1" title={t('النص', 'Message')}>
            <label style={lbl}>{t('نص الرسالة *', 'Message text *')}</label>
            <textarea value={text} maxLength={MAX_LEN} rows={3} onChange={e => setText(e.target.value)} style={{ ...input, resize: 'vertical', fontSize: '1rem', lineHeight: 1.7 }} placeholder={t('مثال: تأخرت رحلة جدة 15 دقيقة', 'e.g. The Jeddah trip is delayed by 15 minutes')} />
            <div dir="ltr" style={{ textAlign: isAr ? 'left' : 'right', fontSize: '0.7rem', fontWeight: 800, marginTop: 4, color: text.length >= MAX_LEN - 20 ? '#d97706' : 'var(--text-3)' }}>{text.length} / {MAX_LEN}</div>

            <label style={{ ...lbl, marginTop: 10 }}>{t('عبارات سريعة', 'Quick phrases')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PHRASES.map(p => <Chip key={p.ar} on={false} onClick={() => insertPhrase(p)} title={p.example ? t('تُدرج مثالاً جاهزاً، عدّل الوجهة والدقائق', 'Inserts an example; edit destination and minutes') : undefined}>{p[isAr ? 'ar' : 'en']}{p.example && <span style={{ opacity: 0.6, marginInlineStart: 6 }}>({t('مثال', 'example')})</span>}</Chip>)}
            </div>

            <label style={{ ...lbl, marginTop: 14 }}>{t('نوع الرسالة', 'Level')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Chip on={level === 'normal'} onClick={() => setLevel('normal')}>{t('عادي', 'Normal')}</Chip>
              <Chip on={level === 'urgent'} onClick={() => setLevel('urgent')} color={URGENT}>{t('عاجل', 'Urgent')}</Chip>
            </div>
            {level === 'urgent' && (
              <div role="note" style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.35)', color: URGENT, fontSize: '0.76rem', fontWeight: 800, lineHeight: 1.7 }}>
                {t('يظهر شريط أحمر فوق أي محتوى على الشاشات المستهدفة', 'A red bar is shown over any content on the target screens')}
              </div>
            )}

            <label style={{ ...lbl, marginTop: 14 }}>{t('معاينة مباشرة', 'Live preview')}</label>
            <TickerBar items={text.trim() ? [{ text: text.trim(), level }] : []} isAr={isAr} height={48} empty={t('اكتب النص لتراه هنا', 'Type the text to see it here')} />
          </Card>

          <Card n="2" title={t('الوجهة', 'Target')} hint={t('تظهر المحطات التي فيها شاشات مربوطة فقط', 'Only stations with paired screens are listed')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {[['all', t('كل الشاشات', 'All screens')], ['stations', t('محطات محددة', 'Stations')], ['devices', t('شاشات محددة', 'Screens')]].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={scope === v} onClick={() => setScope(v)}
                  style={{ flex: 1, minWidth: 110, padding: '10px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', border: `2px solid ${scope === v ? SG_ACCENT : 'var(--border)'}`, background: scope === v ? `${SG_ACCENT}14` : 'var(--card)', color: scope === v ? SG_ACCENT : 'var(--text-2)' }}>{l}</button>
              ))}
            </div>
            {scope === 'all' && <div style={{ fontSize: '0.78rem', color: needsApproval ? '#d97706' : 'var(--text-2)', fontWeight: 700, lineHeight: 1.9 }}>{needsApproval ? t(`ستظهر على كل الشاشات النشطة (${activeDevices.length}) بعد موافقة الإدارة.`, 'All-screen messages need admin approval.') : t(`ستظهر على كل الشاشات النشطة (${activeDevices.length} شاشة).`, `Shown on every active screen (${activeDevices.length}).`)}</div>}
            {scope === 'stations' && <StationPicker stations={stations} devices={devices} selected={stIds} onChange={setStIds} isAr={isAr} />}
            {scope === 'devices' && (activeDevices.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{t('لا توجد شاشات مربوطة بعد.', 'No paired screens yet.')}</div> : (
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <input value={dq} onChange={e => setDq(e.target.value)} placeholder={t('ابحث باسم الشاشة أو المحطة…', 'Search screens…')} style={{ ...input, flex: '1 1 160px', width: 'auto', minWidth: 0, padding: '8px 11px' }} />
                  <button type="button" onClick={() => setDvIds(dvIds.length === activeDevices.length ? [] : activeDevices.map(d => d.id))} style={btn('ghost', { padding: '8px 14px' })}>{dvIds.length === activeDevices.length ? t('إلغاء الكل', 'Clear') : t(`تحديد كل الشاشات (${activeDevices.length})`, 'Select all')}</button>
                </div>
                <div style={{ maxHeight: 290, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {groups.map(g => {
                    const allOn = g.ds.every(d => dvIds.includes(d.id))
                    return (
                      <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', fontWeight: 900, fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-1)' }}>
                          <input type="checkbox" checked={allOn} onChange={() => setDvIds(allOn ? dvIds.filter(id => !g.ds.some(d => d.id === id)) : [...new Set([...dvIds, ...g.ds.map(d => d.id)])])} /> {g.name}
                          <span style={{ marginInlineStart: 'auto', fontSize: '0.68rem', color: 'var(--text-3)' }}>{t(`${g.ds.length} شاشة`, `${g.ds.length}`)}</span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                          {g.ds.map(d => (
                            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: 'var(--text-1)', minWidth: 0 }}>
                              <input type="checkbox" checked={dvIds.includes(d.id)} onChange={() => toggle(dvIds, setDvIds, d.id)} />
                              <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline(d) ? '#16a34a' : '#94a3b8', flexShrink: 0 }} /> <span style={{ overflowWrap: 'anywhere' }}>{d.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </Card>

          <Card n="3" title={t('التوقيت', 'Timing')} hint={t('بتوقيت السعودية', 'Riyadh time')}>
            <label style={lbl}>{t('الأيام', 'Days')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {DAY_PRESETS.map(p => <Chip key={p.k} on={curDayPreset === p.k} onClick={() => setDays(p.days)}>{isAr ? p.ar : p.en}</Chip>)}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {DAYS.map(d => <Chip key={d.v} on={days.includes(d.v) || days.length === 0 || days.length === 7} onClick={() => setDays(days.length === 0 || days.length === 7 ? [0, 1, 2, 3, 4, 5, 6].filter(x => x !== d.v) : days.includes(d.v) ? days.filter(x => x !== d.v) : [...days, d.v])}>{d[isAr ? 'ar' : 'en']}</Chip>)}
            </div>
            <label style={lbl}>{t('وقت العرض خلال اليوم', 'Time of day')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {TIME_PRESETS.map(p => <Chip key={p.k} on={curTimePreset === p.k} onClick={() => setTimePreset(p)}>{isAr ? p.ar : p.en}</Chip>)}
              <Chip on={curTimePreset === 'custom'} onClick={() => { setAllDay(false) }}>{t('وقت مخصص', 'Custom')}</Chip>
            </div>
            {!allDay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <TimeInput24 value={from} onChange={setFrom} style={{ ...input, width: 110, textAlign: 'center' }} /> <span>{t('إلى', 'to')}</span> <TimeInput24 value={to} onChange={setTo} style={{ ...input, width: 110, textAlign: 'center' }} />
              </div>
            )}
            <label style={{ ...lbl, marginTop: 14 }}>{t('الفترة (من تاريخ إلى تاريخ)', 'Period')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[['none', t('بدون تاريخ', 'No dates')], ['today', t('اليوم فقط', 'Today only')], ['7', t('7 أيام', '7 days')], ['30', t('30 يوماً', '30 days')]].map(([p, l]) => <Chip key={p} on={curDatePreset === p} onClick={() => datePreset(p)}>{l}</Chip>)}
              {curDatePreset === 'custom' && <Chip on onClick={() => {}}>{t('مخصصة', 'Custom')}</Chip>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: desk ? 'minmax(0,1fr) 100px minmax(0,1fr) 100px' : 'minmax(0,1fr) 100px', gap: 8 }}>
              <DatePicker value={sd} onChange={setSd} isAr={isAr} className="input" placeholder={t('تاريخ البداية', 'Start date')} />
              <TimeInput24 value={st} onChange={setSt} placeholder="00:00" style={input} />
              <DatePicker value={ed} onChange={setEd} isAr={isAr} className="input" placeholder={t('تاريخ النهاية', 'End date')} />
              <TimeInput24 value={et} onChange={setEt} placeholder="23:59" style={input} />
            </div>
          </Card>
        </div>
        {desk && summary}
      </div>
    </Sheet>
  )
}

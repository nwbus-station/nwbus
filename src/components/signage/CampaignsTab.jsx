// تبويب الحملات: ربط المحتوى بالشاشات (كل المملكة / محطات فيها شاشات / شاشات محددة) مع جدولة سريعة وموافقة وترتيب العرض
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic, useMedia } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import DatePicker from '../shared/DatePicker'
import TimeInput24 from '../shared/TimeInput24'
import StationPicker from './StationPicker'
import { lbl, input, Pill, Empty, Err, Thumb, SG_ACCENT } from './common'
import {
  CAMP_STATUS, DAYS, DAY_PRESETS, TIME_PRESETS, mediaUrl, fmtDT, sgError, toRiyadhISO, fromRiyadhISO, scopeLabel, scheduleLabel, strToMin, minToStr,
  riyadhNow, addDaysStr, campaignActiveNow, campaignTargets, sameDays, isOnline,
} from '../../utils/signage'

const FILTERS = ['all', 'pending', 'approved', 'draft', 'paused', 'rejected']
const sortFn = (a, b) => (a.sort - b.sort) || (new Date(b.created_at) - new Date(a.created_at))
const KIND_AR = { all: 'الكل', image: 'صور', video: 'فيديو', board: 'شاشة العرض' }

export default function CampaignsTab({ isAr, role, myUserId, campaigns, media, devices, stations, filter, setFilter, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const isAdmin = role === 'admin'
  const [form, setForm] = useState(null)        // null | { c? }
  const [ask, setAsk] = useState(null)          // { kind: 'delete'|'pause'|'reject', c }
  const [busy, setBusy] = useState(false)
  const mediaById = useMemo(() => Object.fromEntries(media.map(m => [m.id, m])), [media])
  const stationsById = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const devicesById = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])), [devices])
  const activeDevices = useMemo(() => devices.filter(d => d.status === 'active'), [devices])
  const ordered = useMemo(() => [...campaigns].sort(sortFn), [campaigns])
  const list = ordered.filter(c => filter === 'all' || c.status === filter)
  const count = s => (s === 'all' ? campaigns.length : campaigns.filter(c => c.status === s).length)
  const mine = c => isAdmin || c.created_by === myUserId
  const reach = c => activeDevices.filter(d => campaignTargets(c, d))

  async function run(fn, ok) {
    setBusy(true)
    const { data, error } = await fn()
    setBusy(false); setAsk(null)
    if (error) { flash(sgError(error, isAr), false); return }
    flash(typeof ok === 'function' ? ok(data) : ok, true); reload()
  }
  const submit = c => run(() => supabase.rpc('signage_campaign_submit', { p_id: c.id }),
    st => (st === 'pending' ? t('أُرسلت للموافقة. ستُنشر بعد موافقة الإدارة', 'Sent for approval') : t('تم النشر على الشاشات المستهدفة', 'Published')))
  // ترتيب العرض: نبدّل الحملة مع جارتها في القائمة الكاملة ثم نحفظ الترتيب كله
  function move(c, dir) {
    const ids = ordered.map(x => x.id); const i = ids.indexOf(c.id); const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => supabase.rpc('signage_campaign_reorder', { p_ids: ids }), t('تم تغيير الترتيب', 'Order updated'))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {FILTERS.map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              style={{ padding: '7px 14px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', border: `1.5px solid ${filter === f ? SG_ACCENT : 'var(--border)'}`, background: filter === f ? `${SG_ACCENT}18` : 'var(--card)', color: filter === f ? SG_ACCENT : 'var(--text-2)' }}>
              {f === 'all' ? t('الكل', 'All') : CAMP_STATUS[f][isAr ? 'ar' : 'en']} <span dir="ltr" style={{ opacity: 0.7 }}>{count(f)}</span>
            </button>
          ))}
        </div>
        <button type="button" disabled={!media.length} onClick={() => setForm({})} style={{ ...btn('primary'), background: SG_ACCENT, padding: '10px 20px', fontSize: '0.84rem', opacity: media.length ? 1 : 0.5 }}>{t('حملة جديدة', 'New campaign')}</button>
      </div>

      {filter === 'all' && campaigns.length > 1 && <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.8 }}>{t('الأرقام هي ترتيب العرض على الشاشات (الأصغر أولاً). استخدم الأسهم لتغيير الترتيب.', 'Numbers are the playback order. Use the arrows to reorder.')}</div>}
      {!media.length && <div style={{ marginBottom: 14 }}><Empty title={t('ارفع محتوى أولاً', 'Upload media first')} hint={t('من تبويب «المحتوى».', 'From the Media tab.')} /></div>}
      {list.length === 0 && media.length > 0 ? <Empty title={t('لا توجد حملات', 'No campaigns')} hint={t('أنشئ حملة لتحديد أين ومتى يُعرض المحتوى.', 'Create a campaign to decide where and when media plays.')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(c => {
            const m = mediaById[c.media_id], st = CAMP_STATUS[c.status]
            const idx = ordered.findIndex(x => x.id === c.id)
            const live = campaignActiveNow(c)
            const n = reach(c).length
            return (
              <article key={c.id} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--border)', borderInlineStart: `4px solid ${st.color}`, borderRadius: 14, padding: 14 }}>
                {filter === 'all' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <button type="button" aria-label={t('أعلى', 'Up')} disabled={busy || idx === 0} onClick={() => move(c, -1)} style={arrowBtn(idx === 0)}>▲</button>
                    <span dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '0.84rem', color: 'var(--text-2)' }}>{idx + 1}</span>
                    <button type="button" aria-label={t('أسفل', 'Down')} disabled={busy || idx === ordered.length - 1} onClick={() => move(c, 1)} style={arrowBtn(idx === ordered.length - 1)}>▼</button>
                  </div>
                )}
                {m && <Thumb m={m} url={mediaUrl(m.path)} style={{ width: 150, aspectRatio: '16 / 9', borderRadius: 10, flexShrink: 0, alignSelf: 'center' }} />}
                <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 900, fontSize: '0.96rem', color: 'var(--text-1)' }}>{c.title}</div>
                    <Pill color={st.color} dot>{st[isAr ? 'ar' : 'en']}</Pill>
                    {live && <Pill color="#16a34a">{t('يُعرض الآن', 'Playing now')}</Pill>}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.9 }}>
                    <b>{t('الوجهة', 'Target')}:</b> {scopeLabel(c, stationsById, devicesById, isAr) || '—'}
                    {c.status === 'approved' && <span style={{ color: n ? 'var(--text-3)' : '#d97706', fontWeight: 700 }}> ({n ? t(`${n} شاشة`, `${n} screen(s)`) : t('لا توجد شاشات مطابقة', 'no matching screens')})</span>}
                    {' · '}<b>{t('الجدولة', 'Schedule')}:</b> {scheduleLabel(c, isAr)}
                    <br /><span style={{ color: 'var(--text-3)' }}>{t('أنشأها', 'By')} {c.created_by_name || '—'} · {fmtDT(c.created_at)}</span>
                    {c.reviewed_by_name && <span style={{ color: 'var(--text-3)' }}> · {c.status === 'rejected' ? t('رفضها', 'Rejected by') : t('اعتمدها', 'Approved by')} {c.reviewed_by_name}</span>}
                  </div>
                  {c.status === 'rejected' && c.review_note && <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#dc2626' }}>{t('سبب الرفض', 'Reason')}: {c.review_note}</div>}
                  {c.status === 'pending' && <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#d97706' }}>{isAdmin && c.created_by !== myUserId ? t('بانتظار قرارك', 'Awaiting your decision') : t('بانتظار موافقة الإدارة، لن تُعرض قبلها', 'Awaiting admin approval; not shown yet')}</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 }}>
                    {c.status === 'pending' && isAdmin && c.created_by !== myUserId && <>
                      <button type="button" disabled={busy} onClick={() => run(() => supabase.rpc('signage_campaign_review', { p_id: c.id, p_approve: true, p_note: null }), t('تمت الموافقة، الحملة منشورة الآن', 'Approved and live'))} style={btn('ok')}>{t('موافقة ونشر', 'Approve')}</button>
                      <button type="button" onClick={() => setAsk({ kind: 'reject', c })} style={btn('danger')}>{t('رفض', 'Reject')}</button>
                    </>}
                    {['draft', 'rejected', 'paused'].includes(c.status) && mine(c) && <button type="button" disabled={busy} onClick={() => submit(c)} style={btn('ok')}>{c.status === 'paused' ? t('استئناف', 'Resume') : t('نشر', 'Publish')}</button>}
                    {c.status === 'approved' && mine(c) && <button type="button" onClick={() => setAsk({ kind: 'pause', c })} style={btn('warn')}>{t('إيقاف مؤقت', 'Pause')}</button>}
                    {mine(c) && c.status !== 'pending' && <button type="button" onClick={() => setForm({ c })} style={btn('ghost')}>{t('تعديل', 'Edit')}</button>}
                    {mine(c) && <button type="button" onClick={() => setAsk({ kind: 'delete', c })} style={btn('danger')}>{t('حذف', 'Delete')}</button>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {form && <CampaignForm isAr={isAr} role={role} c={form.c} media={media} devices={devices} stations={stations} onClose={() => setForm(null)}
        onDone={msg => { setForm(null); flash(msg, true); reload() }} />}
      {ask?.kind === 'delete' && <ConfirmDialog title={t('حذف الحملة', 'Delete campaign')} confirmLabel={busy ? '…' : t('حذف نهائي', 'Delete')}
        message={t(`ستُحذف «${ask.c.title}» ويتوقف عرضها فوراً. لا يمكن التراجع (المحتوى نفسه يبقى بالمكتبة).`, `"${ask.c.title}" stops playing and is deleted. The media stays in the library.`)}
        onCancel={() => setAsk(null)} onConfirm={() => run(() => supabase.rpc('signage_campaign_delete', { p_id: ask.c.id }), t('تم حذف الحملة', 'Campaign deleted'))} />}
      {ask?.kind === 'pause' && <ConfirmDialog danger={false} title={t('إيقاف الحملة مؤقتاً', 'Pause campaign')} confirmLabel={busy ? '…' : t('إيقاف', 'Pause')}
        message={t('ستختفي من الشاشات خلال دقيقة، ويمكنك استئنافها لاحقاً (حملة «كل الشاشات» تحتاج موافقة جديدة).', 'It disappears from screens within a minute and can be resumed later.')}
        onCancel={() => setAsk(null)} onConfirm={() => run(() => supabase.rpc('signage_campaign_pause', { p_id: ask.c.id }), t('تم الإيقاف المؤقت', 'Paused'))} />}
      {ask?.kind === 'reject' && <RejectSheet isAr={isAr} c={ask.c} busy={busy} onClose={() => setAsk(null)}
        onConfirm={note => run(() => supabase.rpc('signage_campaign_review', { p_id: ask.c.id, p_approve: false, p_note: note }), t('تم رفض الحملة وإشعار صاحبها', 'Rejected'))} />}
    </div>
  )
}

const arrowBtn = off => ({ width: 30, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: off ? 'default' : 'pointer', opacity: off ? 0.35 : 1, fontSize: '0.7rem', lineHeight: 1 })

function RejectSheet({ isAr, c, busy, onClose, onConfirm }) {
  const t = (a, e) => (isAr ? a : e)
  const [note, setNote] = useState('')
  return (
    <Sheet isAr={isAr} title={t('رفض الحملة', 'Reject campaign')} icon={Ic.x} accent="#dc2626" onClose={onClose} sub={c.title}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={busy || !note.trim()} onClick={() => onConfirm(note.trim())} style={{ ...btn('danger'), background: '#dc2626', color: '#fff', border: 'none', padding: '11px 28px', fontSize: '0.88rem', opacity: busy || !note.trim() ? 0.55 : 1 }}>{busy ? '…' : t('تأكيد الرفض', 'Reject')}</button>
      </>}>
      <label style={lbl}>{t('سبب الرفض *', 'Reason *')}</label>
      <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={300} style={{ ...input, resize: 'vertical' }} placeholder={t('يصل السبب لصاحب الحملة بإشعار', 'The creator is notified with the reason')} />
    </Sheet>
  )
}

/* ───────────── نافذة الحملة (أوسع، بأقسام، مع ملخص حيّ) ───────────── */
const Chip = ({ on, onClick, children, title }) => (
  <button type="button" aria-pressed={on} title={title} onClick={onClick}
    style={{ padding: '8px 14px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap', border: `1.5px solid ${on ? SG_ACCENT : 'var(--border)'}`, background: on ? `${SG_ACCENT}18` : 'var(--card)', color: on ? SG_ACCENT : 'var(--text-2)' }}>{children}</button>
)
const Card = ({ n, title, hint, children }) => (
  <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--card)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: SG_ACCENT, color: '#fff', fontSize: '0.74rem', fontWeight: 900, flexShrink: 0 }}>{n}</span>
      <div><div style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{title}</div>{hint && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 1 }}>{hint}</div>}</div>
    </div>
    {children}
  </section>
)

function CampaignForm({ isAr, role, c, media, devices, stations, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const desk = useMedia('(min-width: 900px)')
  const s0 = fromRiyadhISO(c?.starts_at), e0 = fromRiyadhISO(c?.ends_at)
  const [title, setTitle] = useState(c?.title || '')
  const [mediaId, setMediaId] = useState(c?.media_id || '')
  const [kindF, setKindF] = useState('all')
  const [scope, setScope] = useState(c?.scope || 'stations')
  const [stIds, setStIds] = useState(c?.station_ids || [])
  const [dvIds, setDvIds] = useState(c?.device_ids || [])
  const [dq, setDq] = useState('')
  const [sd, setSd] = useState(s0.date), [st, setSt] = useState(s0.time), [ed, setEd] = useState(e0.date), [et, setEt] = useState(e0.time)
  const [days, setDays] = useState(c?.days || [])
  const [allDay, setAllDay] = useState(c?.from_min == null)
  const [from, setFrom] = useState(c?.from_min != null ? minToStr(c.from_min) : '08:00'), [to, setTo] = useState(c?.to_min != null ? minToStr(c.to_min) : '22:00')
  const [dur, setDur] = useState(c?.duration_sec || '')
  const [sort, setSort] = useState(c?.sort ?? 100)
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  const m = media.find(x => x.id === mediaId)
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
  const needsApproval = scope === 'all' && role !== 'admin'
  const activeDevices = useMemo(() => devices.filter(d => d.status === 'active'), [devices])
  const stName = id => { const s = stations.find(x => x.id === id); return s?.name_ar || s?.name_en || '' }

  // الشاشات التي ستستلم الحملة
  const reach = useMemo(() => activeDevices.filter(d => scope === 'all' || (scope === 'stations' && d.station_id && stIds.includes(d.station_id)) || (scope === 'devices' && dvIds.includes(d.id))), [activeDevices, scope, stIds, dvIds])
  const reachStations = new Set(reach.map(d => d.station_id).filter(Boolean)).size
  const kindMedia = media.filter(x => kindF === 'all' || x.kind === kindF)

  // اختصارات
  const today = riyadhNow().date
  const datePreset = k => {
    if (k === 'none') { setSd(''); setEd(''); setSt(''); setEt(''); return }
    const n = k === 'today' ? 0 : Number(k) - 1
    setSd(today); setEd(addDaysStr(today, n)); setSt('00:00'); setEt('23:59')
  }
  const curDatePreset = !sd && !ed ? 'none' : (sd === today && ed === today ? 'today' : (sd === today && ed === addDaysStr(today, 6) ? '7' : (sd === today && ed === addDaysStr(today, 29) ? '30' : 'custom')))
  const curDayPreset = DAY_PRESETS.find(p => sameDays(p.days, days))?.k || 'custom'
  const curTimePreset = allDay ? 'all' : (TIME_PRESETS.find(p => p.from != null && minToStr(p.from) === from && minToStr(p.to) === to)?.k || 'custom')
  const setTimePreset = p => { if (p.from == null) { setAllDay(true) } else { setAllDay(false); setFrom(minToStr(p.from)); setTo(minToStr(p.to)) } }

  const dayText = days.length === 0 || days.length === 7 ? t('كل الأيام', 'Every day') : days.map(d => DAYS[d][isAr ? 'ar' : 'en']).join('، ')
  const timeText = allDay ? t('طوال اليوم', 'All day') : t(`من ${from} إلى ${to}`, `${from}–${to}`)
  const dateText = sd || ed ? t(`من ${sd || '…'} إلى ${ed || '…'}`, `${sd || '…'} → ${ed || '…'}`) : t('بدون تاريخ انتهاء', 'No end date')

  async function save(publish) {
    setErr('')
    if (!title.trim()) { setErr(t('اكتب عنواناً للحملة', 'Enter a title')); return }
    if (!mediaId) { setErr(t('اختر المحتوى', 'Pick the media')); return }
    if (scope === 'stations' && !stIds.length) { setErr(t('اختر محطة واحدة على الأقل', 'Pick at least one station')); return }
    if (scope === 'devices' && !dvIds.length) { setErr(t('اختر شاشة واحدة على الأقل', 'Pick at least one screen')); return }
    if (!allDay && (from.length !== 5 || to.length !== 5)) { setErr(t('اكتب وقت البداية والنهاية بصيغة 24 ساعة', 'Enter start and end time (24h)')); return }
    if (publish && reach.length === 0) { setErr(t('لا توجد شاشات تستلم هذه الحملة. اختر محطات فيها شاشات أو شاشات محددة', 'No screens would receive this campaign')); return }
    setSaving(true)
    const { data: id, error } = await supabase.rpc('signage_campaign_save', {
      p_id: c?.id || null, p_title: title.trim(), p_media: mediaId, p_scope: scope, p_stations: scope === 'stations' ? stIds : [], p_devices: scope === 'devices' ? dvIds : [],
      p_starts: toRiyadhISO(sd, st), p_ends: toRiyadhISO(ed, et), p_days: days.length && days.length < 7 ? days : null,
      p_from: allDay ? null : strToMin(from), p_to: allDay ? null : strToMin(to), p_duration: m && m.kind !== 'video' && dur ? Number(dur) : null, p_sort: Number(sort) || 100,
    })
    if (error) { setSaving(false); setErr(sgError(error, isAr)); return }
    if (publish) {
      const { data: status, error: e2 } = await supabase.rpc('signage_campaign_submit', { p_id: id })
      setSaving(false)
      if (e2) { setErr(sgError(e2, isAr)); return }
      onDone(status === 'pending' ? t('حُفظت وأُرسلت للموافقة. ستُنشر بعد موافقة الإدارة', 'Saved and sent for approval') : t('حُفظت ونُشرت على الشاشات المستهدفة', 'Saved and published'))
      return
    }
    setSaving(false); onDone(t('حُفظت كمسودة', 'Saved as draft'))
  }

  // الشاشات مجمّعة بمحطاتها (لتحديد شاشات محددة)
  const groups = useMemo(() => {
    const term = dq.trim().toLowerCase(); const g = {}
    activeDevices.filter(d => !term || d.name.toLowerCase().includes(term) || stName(d.station_id).toLowerCase().includes(term)).forEach(d => { (g[d.station_id || '_'] = g[d.station_id || '_'] || []).push(d) })
    return Object.entries(g).map(([id, ds]) => ({ id, name: id === '_' ? t('بدون محطة', 'No station') : stName(id), ds })).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  }, [activeDevices, dq, stations]) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = (
    <aside style={{ border: `1.5px solid ${SG_ACCENT}55`, background: `${SG_ACCENT}0a`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: desk ? 'sticky' : 'static', top: 0 }}>
      <div style={{ fontWeight: 900, fontSize: '0.9rem', color: 'var(--text-1)' }}>{t('ملخص الحملة', 'Summary')}</div>
      {m ? <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Thumb m={m} url={mediaUrl(m.path)} style={{ width: 84, aspectRatio: '16 / 9', borderRadius: 8, flexShrink: 0 }} /><div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{m.title}</div></div>
        : <div style={{ fontSize: '0.76rem', color: 'var(--text-3)' }}>{t('لم تختر محتوى بعد', 'No media selected')}</div>}
      <div style={{ fontSize: '0.78rem', lineHeight: 1.9, color: 'var(--text-2)' }}>
        <div><b>{t('تُعرض على', 'Shown on')}:</b> <span style={{ color: reach.length ? '#16a34a' : '#d97706', fontWeight: 900 }}>{t(`${reach.length} شاشة`, `${reach.length} screen(s)`)}</span>{reachStations > 0 && t(` في ${reachStations} محطة`, ` in ${reachStations} station(s)`)}</div>
        {reach.length > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{reach.slice(0, 5).map(d => d.name).join('، ')}{reach.length > 5 ? t(` و${reach.length - 5} أخرى`, ` +${reach.length - 5}`) : ''}</div>}
        {reach.length > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{t(`متصلة الآن: ${reach.filter(isOnline).length}`, `Online: ${reach.filter(isOnline).length}`)}</div>}
        <div><b>{t('الفترة', 'Period')}:</b> {dateText}</div>
        <div><b>{t('الأيام', 'Days')}:</b> {dayText}</div>
        <div><b>{t('الوقت', 'Time')}:</b> {timeText}</div>
        {m && m.kind !== 'video' && <div><b>{t('المدة', 'Duration')}:</b> {dur || m.duration_sec} {t('ثانية', 'sec')}</div>}
      </div>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, lineHeight: 1.7, color: needsApproval ? '#d97706' : '#16a34a', padding: '8px 10px', borderRadius: 9, background: needsApproval ? 'rgba(217,119,6,.1)' : 'rgba(22,163,74,.1)' }}>
        {needsApproval ? t('ستنتظر موافقة الإدارة قبل أن تظهر على الشاشات.', 'Needs admin approval before showing.') : t('تُنشر مباشرة عند «حفظ ونشر».', 'Publishes immediately on Save & publish.')}
      </div>
    </aside>
  )

  return (
    <Sheet isAr={isAr} variant="drawer" width={1040} title={c ? t('تعديل الحملة', 'Edit campaign') : t('حملة جديدة', 'New campaign')} icon={Ic.send} accent={SG_ACCENT} onClose={onClose}
      sub={c?.status === 'approved' && role !== 'admin' ? t('تنبيه: تعديل حملة منشورة يعيدها مسودة وتتوقف حتى تنشرها من جديد.', 'Editing a live campaign returns it to draft until you publish again.') : t('اختر المحتوى ثم الوجهة والتوقيت. الملخص على الجانب يتحدّث مباشرة.', 'Pick media, target and timing. The summary updates live.')}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={saving} onClick={() => save(false)} style={btn('ghost', { padding: '11px 20px', fontSize: '0.86rem' })}>{t('حفظ كمسودة', 'Save draft')}</button>
        <button type="button" disabled={saving} onClick={() => save(true)} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 24px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : needsApproval ? t('حفظ وإرسال للموافقة', 'Save & request approval') : t('حفظ ونشر', 'Save & publish')}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: desk ? 'minmax(0,1fr) 300px' : '1fr', gap: 18, alignItems: 'start' }}>
        {!desk && summary}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Err>{err}</Err>

          <Card n="1" title={t('المحتوى', 'Content')}>
            <div style={{ marginBottom: 12 }}><label style={lbl}>{t('عنوان الحملة *', 'Title *')}</label><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} style={input} placeholder={t('مثال: عرض اليوم الوطني', 'e.g. National Day offer')} /></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {Object.entries(KIND_AR).map(([k, l]) => <Chip key={k} on={kindF === k} onClick={() => setKindF(k)}>{isAr ? l : k}</Chip>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))', gap: 8, maxHeight: 250, overflowY: 'auto', padding: 2 }}>
              {kindMedia.map(x => (
                <button key={x.id} type="button" aria-pressed={mediaId === x.id} onClick={() => setMediaId(x.id)} title={x.title}
                  style={{ padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `2.5px solid ${mediaId === x.id ? SG_ACCENT : 'var(--border)'}`, background: 'var(--card)', textAlign: 'start', fontFamily: 'inherit' }}>
                  <Thumb m={x} url={mediaUrl(x.path)} style={{ aspectRatio: '16 / 9' }} />
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, padding: '5px 7px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</div>
                </button>
              ))}
              {kindMedia.length === 0 && <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: 'var(--text-3)', padding: 10 }}>{t('لا يوجد محتوى من هذا النوع.', 'None of this type.')}</div>}
            </div>
          </Card>

          <Card n="2" title={t('أين تُعرض؟', 'Where')} hint={t('تظهر المحطات التي فيها شاشات مربوطة فقط', 'Only stations with paired screens are listed')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {[['all', t('كل الشاشات', 'All screens')], ['stations', t('محطات محددة', 'Stations')], ['devices', t('شاشات محددة', 'Screens')]].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={scope === v} onClick={() => setScope(v)}
                  style={{ flex: 1, minWidth: 110, padding: '10px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', border: `2px solid ${scope === v ? SG_ACCENT : 'var(--border)'}`, background: scope === v ? `${SG_ACCENT}14` : 'var(--card)', color: scope === v ? SG_ACCENT : 'var(--text-2)' }}>{l}</button>
              ))}
            </div>
            {scope === 'all' && <div style={{ fontSize: '0.78rem', color: needsApproval ? '#d97706' : 'var(--text-2)', fontWeight: 700, lineHeight: 1.9 }}>{needsApproval ? t(`ستُعرض على كل الشاشات النشطة (${activeDevices.length}) بعد موافقة الإدارة.`, 'All-screen campaigns need admin approval.') : t(`ستُعرض على كل الشاشات النشطة (${activeDevices.length} شاشة).`, `Shown on every active screen (${activeDevices.length}).`)}</div>}
            {scope === 'stations' && <StationPicker stations={stations} devices={devices} selected={stIds} onChange={setStIds} isAr={isAr} />}
            {scope === 'devices' && (activeDevices.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{t('لا توجد شاشات مربوطة بعد.', 'No paired screens yet.')}</div> : (
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <input value={dq} onChange={e => setDq(e.target.value)} placeholder={t('ابحث باسم الشاشة أو المحطة…', 'Search screens…')} style={{ ...input, flex: '1 1 160px', width: 'auto', padding: '8px 11px' }} />
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                          {g.ds.map(d => (
                            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: 'var(--text-1)' }}>
                              <input type="checkbox" checked={dvIds.includes(d.id)} onChange={() => toggle(dvIds, setDvIds, d.id)} />
                              <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline(d) ? '#16a34a' : '#94a3b8', flexShrink: 0 }} /> {d.name}
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

          <Card n="3" title={t('متى تُعرض؟', 'When')} hint={t('بتوقيت السعودية', 'Riyadh time')}>
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
              {[['none', t('بدون تاريخ', 'No dates')], ['today', t('اليوم فقط', 'Today only')], ['7', t('7 أيام', '7 days')], ['30', t('30 يوماً', '30 days')]].map(([k, l]) => <Chip key={k} on={curDatePreset === k} onClick={() => datePreset(k)}>{l}</Chip>)}
              {curDatePreset === 'custom' && <Chip on onClick={() => {}}>{t('مخصصة', 'Custom')}</Chip>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: desk ? '1fr 100px 1fr 100px' : '1fr 100px', gap: 8 }}>
              <DatePicker value={sd} onChange={setSd} isAr={isAr} className="input" placeholder={t('تاريخ البداية', 'Start date')} />
              <TimeInput24 value={st} onChange={setSt} placeholder="00:00" style={input} />
              <DatePicker value={ed} onChange={setEd} isAr={isAr} className="input" placeholder={t('تاريخ النهاية', 'End date')} />
              <TimeInput24 value={et} onChange={setEt} placeholder="23:59" style={input} />
            </div>
          </Card>

          <Card n="4" title={t('خيارات العرض', 'Display options')}>
            <div style={{ display: 'grid', gridTemplateColumns: m && m.kind !== 'video' ? '1fr 1fr' : '1fr', gap: 12 }}>
              {m && m.kind !== 'video' && <div><label style={lbl}>{t('مدة العرض (ثانية)', 'Duration (sec)')}</label><input type="number" min="3" max="300" value={dur} onChange={e => setDur(e.target.value)} placeholder={String(m.duration_sec || 15)} style={input} /></div>}
              <div><label style={lbl}>{t('الترتيب (الأصغر أولاً)', 'Order (lowest first)')}</label><input type="number" min="1" max="9999" value={sort} onChange={e => setSort(e.target.value)} style={input} />
                <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4 }}>{t('يمكنك أيضاً ترتيب الحملات بالأسهم من قائمة الحملات.', 'You can also reorder with the arrows in the list.')}</div></div>
            </div>
          </Card>
        </div>
        {desk && summary}
      </div>
    </Sheet>
  )
}

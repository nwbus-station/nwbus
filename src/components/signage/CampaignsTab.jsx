// تبويب الحملات: ربط المحتوى بالشاشات (كل المملكة / محطات / شاشات محددة) مع الجدولة والموافقة
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import DatePicker from '../shared/DatePicker'
import TimeInput24 from '../shared/TimeInput24'
import { lbl, input, Pill, Empty, Err, Thumb, SG_ACCENT } from './common'
import { CAMP_STATUS, DAYS, mediaUrl, fmtDT, sgError, toRiyadhISO, fromRiyadhISO, scopeLabel, scheduleLabel, strToMin, minToStr } from '../../utils/signage'

const FILTERS = ['all', 'pending', 'approved', 'draft', 'paused', 'rejected']

export default function CampaignsTab({ isAr, role, myUserId, campaigns, media, devices, stations, filter, setFilter, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const isAdmin = role === 'admin'
  const [form, setForm] = useState(null)        // null | { c? }
  const [ask, setAsk] = useState(null)          // { kind: 'delete'|'pause'|'reject', c }
  const [busy, setBusy] = useState(false)
  const mediaById = useMemo(() => Object.fromEntries(media.map(m => [m.id, m])), [media])
  const stationsById = useMemo(() => Object.fromEntries(stations.map(s => [s.id, s.name_ar || s.name_en])), [stations])
  const devicesById = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])), [devices])
  const list = campaigns.filter(c => filter === 'all' || c.status === filter)
  const count = s => (s === 'all' ? campaigns.length : campaigns.filter(c => c.status === s).length)
  const mine = c => isAdmin || c.created_by === myUserId

  async function run(fn, ok) {
    setBusy(true)
    const { data, error } = await fn()
    setBusy(false); setAsk(null)
    if (error) { flash(sgError(error, isAr), false); return }
    flash(typeof ok === 'function' ? ok(data) : ok, true); reload()
  }
  const submit = c => run(() => supabase.rpc('signage_campaign_submit', { p_id: c.id }),
    st => (st === 'pending' ? t('أُرسلت للموافقة. ستُنشر بعد موافقة الإدارة', 'Sent for approval') : t('تم النشر على الشاشات المستهدفة', 'Published')))

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

      {!media.length && <div style={{ marginBottom: 14 }}><Empty title={t('ارفع محتوى أولاً', 'Upload media first')} hint={t('من تبويب «المحتوى».', 'From the Media tab.')} /></div>}
      {list.length === 0 && media.length > 0 ? <Empty title={t('لا توجد حملات', 'No campaigns')} hint={t('أنشئ حملة لتحديد أين ومتى يُعرض المحتوى.', 'Create a campaign to decide where and when media plays.')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(c => {
            const m = mediaById[c.media_id], st = CAMP_STATUS[c.status]
            return (
              <article key={c.id} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--border)', borderInlineStart: `4px solid ${st.color}`, borderRadius: 14, padding: 14 }}>
                {m && <Thumb m={m} url={mediaUrl(m.path)} style={{ width: 150, aspectRatio: '16 / 9', borderRadius: 10, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 900, fontSize: '0.96rem', color: 'var(--text-1)' }}>{c.title}</div>
                    <Pill color={st.color} dot>{st[isAr ? 'ar' : 'en']}</Pill>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.9 }}>
                    <b>{t('الوجهة', 'Target')}:</b> {scopeLabel(c, stationsById, devicesById, isAr) || '—'} · <b>{t('الجدولة', 'Schedule')}:</b> {scheduleLabel(c, isAr)}
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

function CampaignForm({ isAr, role, c, media, devices, stations, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const s0 = fromRiyadhISO(c?.starts_at), e0 = fromRiyadhISO(c?.ends_at)
  const [title, setTitle] = useState(c?.title || '')
  const [mediaId, setMediaId] = useState(c?.media_id || '')
  const [scope, setScope] = useState(c?.scope || 'stations')
  const [stIds, setStIds] = useState(c?.station_ids || [])
  const [dvIds, setDvIds] = useState(c?.device_ids || [])
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
  const activeDevices = devices.filter(d => d.status === 'active')

  async function save(publish) {
    setErr('')
    if (!title.trim()) { setErr(t('اكتب عنواناً للحملة', 'Enter a title')); return }
    if (!mediaId) { setErr(t('اختر المحتوى', 'Pick the media')); return }
    if (scope === 'stations' && !stIds.length) { setErr(t('اختر محطة واحدة على الأقل', 'Pick at least one station')); return }
    if (scope === 'devices' && !dvIds.length) { setErr(t('اختر شاشة واحدة على الأقل', 'Pick at least one screen')); return }
    if (!allDay && (from.length !== 5 || to.length !== 5)) { setErr(t('اكتب وقت البداية والنهاية بصيغة 24 ساعة', 'Enter start and end time (24h)')); return }
    setSaving(true)
    const { data: id, error } = await supabase.rpc('signage_campaign_save', {
      p_id: c?.id || null, p_title: title.trim(), p_media: mediaId, p_scope: scope, p_stations: scope === 'stations' ? stIds : [], p_devices: scope === 'devices' ? dvIds : [],
      p_starts: toRiyadhISO(sd, st), p_ends: toRiyadhISO(ed, et), p_days: days.length && days.length < 7 ? days : null,
      p_from: allDay ? null : strToMin(from), p_to: allDay ? null : strToMin(to), p_duration: m?.kind === 'image' && dur ? Number(dur) : null, p_sort: Number(sort) || 100,
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

  return (
    <Sheet isAr={isAr} variant="drawer" width={640} title={c ? t('تعديل الحملة', 'Edit campaign') : t('حملة جديدة', 'New campaign')} icon={Ic.send} accent={SG_ACCENT} onClose={onClose}
      sub={c?.status === 'approved' && role !== 'admin' ? t('تنبيه: تعديل حملة منشورة يعيدها مسودة وتتوقف حتى تنشرها من جديد.', 'Editing a live campaign returns it to draft until you publish again.') : undefined}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={saving} onClick={() => save(false)} style={btn('ghost', { padding: '11px 20px', fontSize: '0.86rem' })}>{t('حفظ كمسودة', 'Save draft')}</button>
        <button type="button" disabled={saving} onClick={() => save(true)} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 24px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : needsApproval ? t('حفظ وإرسال للموافقة', 'Save & request approval') : t('حفظ ونشر', 'Save & publish')}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Err>{err}</Err>
        <div><label style={lbl}>{t('عنوان الحملة *', 'Title *')}</label><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} style={input} placeholder={t('مثال: عرض اليوم الوطني', 'e.g. National Day offer')} /></div>

        <div>
          <label style={lbl}>{t('المحتوى *', 'Media *')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8, maxHeight: 230, overflowY: 'auto', padding: 2 }}>
            {media.map(x => (
              <button key={x.id} type="button" aria-pressed={mediaId === x.id} onClick={() => setMediaId(x.id)} title={x.title}
                style={{ padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: `2.5px solid ${mediaId === x.id ? SG_ACCENT : 'var(--border)'}`, background: 'var(--card)', textAlign: 'start', fontFamily: 'inherit' }}>
                <Thumb m={x} url={mediaUrl(x.path)} style={{ aspectRatio: '16 / 9' }} />
                <div style={{ fontSize: '0.64rem', fontWeight: 800, padding: '4px 6px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl}>{t('أين تُعرض؟ *', 'Where? *')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['all', t('كل الشاشات', 'All screens')], ['stations', t('محطات محددة', 'Stations')], ['devices', t('شاشات محددة', 'Screens')]].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={scope === v} onClick={() => setScope(v)}
                style={{ flex: 1, minWidth: 110, padding: '10px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', border: `2px solid ${scope === v ? SG_ACCENT : 'var(--border)'}`, background: scope === v ? `${SG_ACCENT}14` : 'var(--card)', color: scope === v ? SG_ACCENT : 'var(--text-2)' }}>{l}</button>
            ))}
          </div>
          {scope === 'all' && <div style={{ fontSize: '0.74rem', color: needsApproval ? '#d97706' : 'var(--text-3)', fontWeight: 700, marginTop: 8, lineHeight: 1.8 }}>{needsApproval ? t('حملات «كل الشاشات» لا تُنشر إلا بعد موافقة الإدارة.', 'All-screen campaigns need admin approval.') : t('ستُعرض على كل الشاشات النشطة في المملكة.', 'Shown on every active screen.')}</div>}
          {scope === 'stations' && <Checks items={stations.map(s => ({ id: s.id, label: s.name_ar || s.name_en }))} sel={stIds} onToggle={id => toggle(stIds, setStIds, id)} onAll={() => setStIds(stIds.length === stations.length ? [] : stations.map(s => s.id))} isAr={isAr} />}
          {scope === 'devices' && (activeDevices.length ? <Checks items={activeDevices.map(d => ({ id: d.id, label: d.name }))} sel={dvIds} onToggle={id => toggle(dvIds, setDvIds, id)} onAll={() => setDvIds(dvIds.length === activeDevices.length ? [] : activeDevices.map(d => d.id))} isAr={isAr} /> : <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 8 }}>{t('لا توجد شاشات مربوطة بعد.', 'No paired screens yet.')}</div>)}
        </div>

        <div>
          <label style={lbl}>{t('الفترة (اختياري، بتوقيت السعودية)', 'Period (optional, Riyadh time)')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, marginBottom: 8 }}>
            <DatePicker value={sd} onChange={setSd} isAr={isAr} className="input" placeholder={t('تاريخ البداية', 'Start date')} />
            <TimeInput24 value={st} onChange={setSt} placeholder="00:00" style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
            <DatePicker value={ed} onChange={setEd} isAr={isAr} className="input" placeholder={t('تاريخ النهاية', 'End date')} />
            <TimeInput24 value={et} onChange={setEt} placeholder="23:59" style={input} />
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 6 }}>{t('اتركها فارغة لتعمل بدون تاريخ انتهاء.', 'Leave blank for no start/end.')}</div>
        </div>

        <div>
          <label style={lbl}>{t('الأيام', 'Days')} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{t('(بدون اختيار = كل الأيام)', '(none = every day)')}</span></label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map(d => {
              const on = days.includes(d.v)
              return <button key={d.v} type="button" aria-pressed={on} onClick={() => toggle(days, setDays, d.v)}
                style={{ padding: '7px 13px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', border: `1.5px solid ${on ? SG_ACCENT : 'var(--border)'}`, background: on ? `${SG_ACCENT}18` : 'var(--card)', color: on ? SG_ACCENT : 'var(--text-2)' }}>{d[isAr ? 'ar' : 'en']}</button>
            })}
          </div>
        </div>

        <div>
          <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> {t('طوال اليوم', 'All day')}
          </label>
          {!allDay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <TimeInput24 value={from} onChange={setFrom} style={{ ...input, width: 110, textAlign: 'center' }} /> <span>{t('إلى', 'to')}</span> <TimeInput24 value={to} onChange={setTo} style={{ ...input, width: 110, textAlign: 'center' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: m?.kind === 'image' ? '1fr 1fr' : '1fr', gap: 12 }}>
          {m?.kind === 'image' && <div><label style={lbl}>{t('مدة العرض (ثانية)', 'Duration (sec)')}</label><input type="number" min="3" max="300" value={dur} onChange={e => setDur(e.target.value)} placeholder="15" style={input} /></div>}
          <div><label style={lbl}>{t('الترتيب (الأصغر أولاً)', 'Order (lowest first)')}</label><input type="number" min="1" max="9999" value={sort} onChange={e => setSort(e.target.value)} style={input} /></div>
        </div>
      </div>
    </Sheet>
  )
}

function Checks({ items, sel, onToggle, onAll, isAr }) {
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={onAll} style={{ width: '100%', padding: '8px 12px', textAlign: 'start', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.74rem', cursor: 'pointer', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--surface)', color: SG_ACCENT }}>
        {sel.length === items.length ? (isAr ? 'إلغاء تحديد الكل' : 'Clear all') : (isAr ? 'تحديد الكل' : 'Select all')} <span dir="ltr" style={{ color: 'var(--text-3)' }}>({sel.length}/{items.length})</span>
      </button>
      <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {items.map(x => (
          <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', color: 'var(--text-1)' }}>
            <input type="checkbox" checked={sel.includes(x.id)} onChange={() => onToggle(x.id)} /> {x.label}
          </label>
        ))}
      </div>
    </div>
  )
}

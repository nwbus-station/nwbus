// تبويب الشاشات: حالة الاتصال والمراقبة + ربط شاشة جديدة (رمز الربط) + تعديل/إيقاف/حذف (للأدمن)
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import SelectField from '../shared/SelectField'
import { lbl, input, Pill, Empty, Err, SG_ACCENT } from './common'
import { isOnline, ago, fmtDT, sgError } from '../../utils/signage'

export default function DevicesTab({ isAr, isAdmin, devices, stations, plays, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const [pairing, setPairing] = useState(false)
  const [edit, setEdit] = useState(null)
  const [ask, setAsk] = useState(null)       // { kind: 'revoke'|'delete', d }
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const stName = id => stations.find(s => s.id === id)?.name_ar || stations.find(s => s.id === id)?.name_en || '—'
  const playerUrl = `${location.origin}/s`

  async function act(fn, ok) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false); setAsk(null)
    if (error) { flash(sgError(error, isAr), false); return }
    flash(ok, true); reload()
  }

  const rows = [...devices].sort((a, b) => (a.status === 'revoked') - (b.status === 'revoked') || (isOnline(b) - isOnline(a)) || a.name.localeCompare(b.name, 'ar'))

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 900, fontSize: '0.88rem', color: 'var(--text-1)' }}>{t('رابط مشغّل الشاشة', 'Screen player link')}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.8 }}>{t('افتحه في متصفح جهاز الشاشة (Android) واتركه بملء الشاشة. سيظهر رمز الربط ثم تدخله هنا.', 'Open it in the screen device browser (Android) in fullscreen. A pairing code appears; enter it here.')}</div>
            <div dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.86rem', fontWeight: 800, color: SG_ACCENT, marginTop: 6, overflowWrap: 'anywhere' }}>{playerUrl}</div>
          </div>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(playerUrl).then(() => flash(t('تم نسخ الرابط', 'Link copied'), true), () => {}) }} style={btn('ghost')}>{t('نسخ الرابط', 'Copy link')}</button>
          <button type="button" onClick={() => setAsk({ kind: 'reload_all' })} style={btn('ghost')}>{t('إعادة تشغيل كل الشاشات', 'Restart all')}</button>
          <button type="button" onClick={() => setPairing(true)} style={{ ...btn('primary'), background: SG_ACCENT, padding: '10px 20px', fontSize: '0.84rem' }}>{t('ربط شاشة جديدة', 'Pair a new screen')}</button>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty title={t('لا توجد شاشات مربوطة', 'No paired screens')} hint={isAdmin ? t('افتح رابط المشغّل على جهاز الشاشة ثم اضغط «ربط شاشة جديدة».', 'Open the player link on the screen device, then press Pair.') : t('تربط الإدارة الشاشات من هنا.', 'Admins pair screens here.')} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
          {rows.map(d => {
            const on = isOnline(d), revoked = d.status === 'revoked'
            const c = revoked ? '#dc2626' : on ? '#16a34a' : '#d97706'
            return (
              <article key={d.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${c}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, opacity: revoked ? 0.75 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{d.name}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', marginTop: 2 }}>{d.station_id ? stName(d.station_id) : t('بدون محطة', 'No station')}</div>
                  </div>
                  <Pill color={c} dot>{revoked ? t('موقوفة', 'Revoked') : on ? t('متصلة', 'Online') : t('منقطعة', 'Offline')}</Pill>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: '0.74rem' }}>
                  <Meta label={t('آخر ظهور', 'Last seen')}>{ago(d.last_seen_at, isAr)}</Meta>
                  <Meta label={t('عُرض خلال 24 ساعة', 'Plays (24h)')}><b dir="ltr">{plays[d.id] ?? 0}</b></Meta>
                  <Meta label={t('يعرض الآن', 'Now playing')}>{on && d.now_playing ? d.now_playing : '—'}</Meta>
                  <Meta label={t('الاتجاه', 'Orientation')}>{d.orientation === 'portrait' ? t('عمودي', 'Portrait') : t('أفقي', 'Landscape')}</Meta>
                </div>
                {d.suspect && (
                  <div role="alert" style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(220,38,38,.1)', color: '#dc2626', fontSize: '0.74rem', fontWeight: 800, lineHeight: 1.8 }}>
                    {t('مشتبه بها', 'Suspicious')}: {d.suspect_reason}<br />
                    <span style={{ fontWeight: 600, color: 'var(--text-3)' }}>{fmtDT(d.suspect_at)}{d.last_ip ? ` · ${d.last_ip}` : ''}</span>
                    {isAdmin && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" onClick={() => setAsk({ kind: 'clear', d })} style={btn('ghost', { padding: '5px 12px' })}>{t('هي سليمة', 'It is fine')}</button>
                      <button type="button" onClick={() => setAsk({ kind: 'revoke', d })} style={btn('danger', { padding: '5px 12px' })}>{t('إيقاف فوري', 'Revoke now')}</button>
                    </div>}
                  </div>
                )}
                {isAdmin && !revoked && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setPreview(d)} style={btn('primary', { background: SG_ACCENT, padding: '7px 14px' })}>{t('معاينة حيّة', 'Live preview')}</button>
                    <button type="button" onClick={() => setAsk({ kind: 'reload', d })} style={btn('ghost', { padding: '7px 14px' })}>{t('إعادة تشغيل', 'Restart')}</button>
                    <button type="button" onClick={() => setAsk({ kind: 'rotate', d })} style={btn('ghost', { padding: '7px 14px' })}>{t('تدوير المفتاح', 'Rotate key')}</button>
                  </div>
                )}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
                    <button type="button" onClick={() => setEdit(d)} style={btn('ghost')}>{t('تعديل', 'Edit')}</button>
                    {!revoked && <button type="button" onClick={() => setAsk({ kind: 'revoke', d })} style={btn('warn')}>{t('إيقاف', 'Revoke')}</button>}
                    <button type="button" onClick={() => setAsk({ kind: 'delete', d })} style={btn('danger')}>{t('حذف', 'Delete')}</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {pairing && <PairSheet isAr={isAr} stations={stations} onClose={() => setPairing(false)} onDone={() => { setPairing(false); flash(t('تم ربط الشاشة. ستبدأ العرض خلال ثوانٍ', 'Screen paired. It starts within seconds'), true); reload() }} />}
      {edit && <EditSheet isAr={isAr} d={edit} stations={stations} onClose={() => setEdit(null)} onDone={() => { setEdit(null); flash(t('تم الحفظ', 'Saved'), true); reload() }} />}
      {preview && <PreviewSheet isAr={isAr} d={preview} onClose={() => setPreview(null)} />}
      {ask?.kind === 'reload' && <ConfirmDialog danger={false} title={t('إعادة تشغيل الشاشة', 'Restart screen')} confirmLabel={busy ? '…' : t('إعادة تشغيل', 'Restart')}
        message={t(`ستعيد «${ask.d.name}» تحميل المشغّل خلال نصف دقيقة وتعود للعرض تلقائياً.`, `"${ask.d.name}" reloads within ~30 seconds.`)} onCancel={() => setAsk(null)}
        onConfirm={() => act(() => supabase.rpc('signage_device_command', { p_id: ask.d.id, p_cmd: 'reload' }), t('أُرسل أمر إعادة التشغيل', 'Restart sent'))} />}
      {ask?.kind === 'reload_all' && <ConfirmDialog danger={false} title={t('إعادة تشغيل كل الشاشات', 'Restart all screens')} confirmLabel={busy ? '…' : t('إعادة تشغيل الكل', 'Restart all')}
        message={t('ستعيد كل الشاشات المربوطة تحميل المشغّل خلال نصف دقيقة. استخدمه بعد تحديثات النظام.', 'Every paired screen reloads within ~30 seconds.')} onCancel={() => setAsk(null)}
        onConfirm={() => act(() => supabase.rpc('signage_devices_command_all', { p_cmd: 'reload' }), t('أُرسل أمر إعادة التشغيل لكل الشاشات', 'Restart sent to all'))} />}
      {ask?.kind === 'rotate' && <ConfirmDialog danger={false} title={t('تدوير مفتاح الشاشة', 'Rotate key')} confirmLabel={busy ? '…' : t('تدوير', 'Rotate')}
        message={t(`ستستلم «${ask.d.name}» مفتاحاً سرياً جديداً عند اتصالها القادم ويبطل القديم. لا يتأثر العرض.`, 'The screen gets a new secret key; the old one stops working.')} onCancel={() => setAsk(null)}
        onConfirm={() => act(() => supabase.rpc('signage_device_command', { p_id: ask.d.id, p_cmd: 'rotate' }), t('طُلب تدوير المفتاح', 'Rotation requested'))} />}
      {ask?.kind === 'clear' && <ConfirmDialog danger={false} title={t('تأكيد سلامة الشاشة', 'Mark as safe')} confirmLabel={busy ? '…' : t('هي سليمة', 'Mark safe')}
        message={t('هل تأكدت أن الشاشة في مكانها ولم يُنسخ مفتاحها؟ سيُزال تنبيه الاشتباه.', 'The suspicion flag will be cleared.')} onCancel={() => setAsk(null)}
        onConfirm={() => act(() => supabase.rpc('signage_device_clear_suspect', { p_id: ask.d.id }), t('أُزيل الاشتباه', 'Cleared'))} />}
      {ask?.kind === 'revoke' && (
        <ConfirmDialog title={t('إيقاف الشاشة', 'Revoke screen')} confirmLabel={busy ? '…' : t('إيقاف الآن', 'Revoke now')}
          message={t(`ستتوقف «${ask.d.name}» عن العرض فوراً ولن تعمل بنفس المفتاح مرة أخرى. استخدمه عند سرقة الجهاز أو الاشتباه باختراقه.`, `"${ask.d.name}" stops immediately and its key can never be used again.`)}
          onCancel={() => setAsk(null)} onConfirm={() => act(() => supabase.rpc('signage_device_revoke', { p_id: ask.d.id }), t('تم إيقاف الشاشة', 'Screen revoked'))} />
      )}
      {ask?.kind === 'delete' && (
        <ConfirmDialog title={t('حذف الشاشة', 'Delete screen')} confirmLabel={busy ? '…' : t('حذف نهائي', 'Delete')}
          message={t(`سيُحذف «${ask.d.name}» وسجل تشغيله نهائياً ولا يمكن التراجع. إن كان الجهاز ما زال شغالاً سيطلب ربطاً جديداً.`, `"${ask.d.name}" and its play history will be deleted permanently.`)}
          onCancel={() => setAsk(null)} onConfirm={() => act(() => supabase.rpc('signage_device_delete', { p_id: ask.d.id }), t('تم حذف الشاشة', 'Screen deleted'))} />
      )}
    </div>
  )
}

const Meta = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontWeight: 700, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{children}</div>
  </div>
)

function StationSelect({ value, onChange, stations, isAr }) {
  return (
    <SelectField value={value} onChange={e => onChange(e.target.value)} style={input}>
      <option value="">{isAr ? '— بدون محطة —' : '— No station —'}</option>
      {stations.map(s => <option key={s.id} value={s.id}>{s.name_ar || s.name_en}</option>)}
    </SelectField>
  )
}
const Orient = ({ value, onChange, isAr }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    {[['landscape', isAr ? 'أفقي' : 'Landscape'], ['portrait', isAr ? 'عمودي' : 'Portrait']].map(([v, l]) => (
      <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
        style={{ flex: 1, padding: '10px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', border: `2px solid ${value === v ? SG_ACCENT : 'var(--border)'}`, background: value === v ? `${SG_ACCENT}14` : 'var(--card)', color: value === v ? SG_ACCENT : 'var(--text-2)' }}>{l}</button>
    ))}
  </div>
)

function PairSheet({ isAr, stations, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [station, setStation] = useState(''); const [orient, setOrient] = useState('landscape')
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  async function submit(e) {
    e?.preventDefault()
    if (code.trim().length < 8) { setErr(t('اكتب الرمز المكوّن من 8 خانات الظاهر على الشاشة', 'Enter the 8-character code shown on the screen')); return }
    if (!name.trim()) { setErr(t('اكتب اسماً للشاشة', 'Enter a name')); return }
    setSaving(true); setErr('')
    const { error } = await supabase.rpc('signage_pair_confirm', { p_code: code.trim(), p_name: name.trim(), p_station: station || null, p_orientation: orient })
    setSaving(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone()
  }
  return (
    <Sheet isAr={isAr} title={t('ربط شاشة جديدة', 'Pair a new screen')} icon={Ic.box} accent={SG_ACCENT} onClose={onClose}
      sub={t('افتح /s على جهاز الشاشة ثم اكتب الرمز الظاهر عليه. صالح 10 دقائق ويُستخدم مرة واحدة.', 'Open /s on the device and enter the code. Valid 10 minutes, single use.')}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="submit" form="sg-pair" disabled={saving} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : t('ربط', 'Pair')}</button>
      </>}>
      <form id="sg-pair" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Err>{err}</Err>
        <div>
          <label style={lbl}>{t('رمز الربط *', 'Pairing code *')}</label>
          <input autoFocus dir="ltr" value={code} maxLength={8} onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setErr('') }} placeholder="XXXXXXXX" autoComplete="off" spellCheck={false}
            style={{ ...input, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '1.5rem', letterSpacing: '.22em', textAlign: 'center', padding: '14px 12px' }} />
        </div>
        <div><label style={lbl}>{t('اسم الشاشة *', 'Screen name *')}</label><input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder={t('مثال: صالة الانتظار - الرياض', 'e.g. Waiting hall - Riyadh')} style={input} /></div>
        <div><label style={lbl}>{t('المحطة', 'Station')}</label><StationSelect value={station} onChange={setStation} stations={stations} isAr={isAr} /></div>
        <div><label style={lbl}>{t('اتجاه الشاشة', 'Orientation')}</label><Orient value={orient} onChange={setOrient} isAr={isAr} /></div>
      </form>
    </Sheet>
  )
}

function EditSheet({ isAr, d, stations, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const [name, setName] = useState(d.name); const [station, setStation] = useState(d.station_id || ''); const [orient, setOrient] = useState(d.orientation)
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  async function submit(e) {
    e?.preventDefault()
    if (!name.trim()) { setErr(t('اكتب اسماً للشاشة', 'Enter a name')); return }
    setSaving(true); setErr('')
    const { error } = await supabase.rpc('signage_device_update', { p_id: d.id, p_name: name.trim(), p_station: station || null, p_orientation: orient })
    setSaving(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone()
  }
  return (
    <Sheet isAr={isAr} title={t('تعديل الشاشة', 'Edit screen')} icon={Ic.box} accent={SG_ACCENT} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="submit" form="sg-edit" disabled={saving} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : t('حفظ', 'Save')}</button>
      </>}>
      <form id="sg-edit" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Err>{err}</Err>
        <div><label style={lbl}>{t('اسم الشاشة *', 'Screen name *')}</label><input value={name} maxLength={80} onChange={e => setName(e.target.value)} style={input} /></div>
        <div><label style={lbl}>{t('المحطة', 'Station')}</label><StationSelect value={station} onChange={setStation} stations={stations} isAr={isAr} /></div>
        <div><label style={lbl}>{t('اتجاه الشاشة', 'Orientation')}</label><Orient value={orient} onChange={setOrient} isAr={isAr} /></div>
      </form>
    </Sheet>
  )
}

// معاينة حيّة: نطلب لقطة من الشاشة (تصل خلال نصف دقيقة تقريباً) ونعرضها
function PreviewSheet({ isAr, d, onClose }) {
  const t = (a, e) => (isAr ? a : e)
  const [snap, setSnap] = useState(null)       // { img, at, playing }
  const [state, setState] = useState('idle')   // idle | waiting | timeout | error
  const [err, setErr] = useState('')
  const since = useRef(0); const timer = useRef(null); const alive = useRef(true)

  async function read() {
    const { data } = await supabase.from('signage_devices').select('snapshot, snapshot_at, now_playing').eq('id', d.id).maybeSingle()
    return data
  }
  async function request() {
    setErr(''); setState('waiting'); since.current = Date.now()
    const { error } = await supabase.rpc('signage_device_command', { p_id: d.id, p_cmd: 'snapshot' })
    if (error) { setState('error'); setErr(sgError(error, isAr)); return }
    clearInterval(timer.current)
    timer.current = setInterval(async () => {
      const r = await read()
      if (!alive.current) return
      if (r?.snapshot && r.snapshot_at && new Date(r.snapshot_at).getTime() >= since.current - 2000) { setSnap({ img: r.snapshot, at: r.snapshot_at, playing: r.now_playing }); setState('idle'); clearInterval(timer.current) }
      else if (Date.now() - since.current > 75000) { setState('timeout'); clearInterval(timer.current) }
    }, 3000)
  }
  useEffect(() => {
    alive.current = true
    ;(async () => { const r = await read(); if (alive.current && r?.snapshot) setSnap({ img: r.snapshot, at: r.snapshot_at, playing: r.now_playing }) })()
    request()
    return () => { alive.current = false; clearInterval(timer.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet isAr={isAr} title={t(`معاينة: ${d.name}`, `Preview: ${d.name}`)} icon={Ic.box} accent={SG_ACCENT} variant="modal" width={760} onClose={onClose}
      sub={isOnline(d) ? t('الشاشة متصلة. اللقطة تُلتقط من الشاشة نفسها.', 'Screen online. Captured from the screen itself.') : t('الشاشة منقطعة حالياً؛ ستظهر اللقطة عند عودة الاتصال.', 'Screen offline.')}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إغلاق', 'Close')}</button>
        <button type="button" disabled={state === 'waiting'} onClick={request} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 24px', fontSize: '0.86rem', opacity: state === 'waiting' ? 0.6 : 1 }}>{state === 'waiting' ? t('جارٍ الالتقاط…', 'Capturing…') : t('لقطة جديدة', 'New capture')}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Err>{err}</Err>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#0b1220', borderRadius: 12, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
          {snap?.img ? <img src={snap.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /> : <span style={{ color: '#64748b', fontWeight: 800 }}>{state === 'waiting' ? t('بانتظار اللقطة من الشاشة…', 'Waiting for the screen…') : t('لا توجد لقطة بعد', 'No capture yet')}</span>}
          {state === 'waiting' && snap?.img && <span style={{ position: 'absolute', top: 10, insetInlineStart: 10, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99 }}>{t('تحديث…', 'Updating…')}</span>}
        </div>
        {snap?.at && <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', lineHeight: 1.9 }}>{t('وقت اللقطة', 'Captured')}: <b>{fmtDT(snap.at)}</b>{snap.playing ? <> · {t('يعرض', 'Playing')}: <b>{snap.playing}</b></> : null}</div>}
        {state === 'timeout' && <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#d97706', lineHeight: 1.8 }}>{t('لم تصل اللقطة خلال المهلة. تأكد أن الشاشة متصلة وحاول مرة أخرى.', 'No capture arrived. Check the screen and retry.')}</div>}
      </div>
    </Sheet>
  )
}

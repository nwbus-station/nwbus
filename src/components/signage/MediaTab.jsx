// تبويب المحتوى: رفع صور وفيديو (مع التحقق من النوع والحجم) ومكتبة بمعاينة وحذف محمي
import { lazy, Suspense, useRef, useState } from 'react'
import { safeImport } from '../../lib/chunkReload'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import { lbl, input, Pill, Empty, Err, Thumb, SG_ACCENT } from './common'
import { THEMES } from '../board/boardParts'
import SceneBuilder, { LayoutDiagram } from './SceneBuilder'
import SceneView from '../scene/SceneView'
const AdStudio = lazy(() => safeImport(() => import('../studio/AdStudio')))
import { ACCEPT, SG_BUCKET, validateFile, readVideoDuration, newFileName, mediaUrl, fmtSize, fmtDur, fmtDT, sgError } from '../../utils/signage'

export default function MediaTab({ isAr, role, myUserId, media, campaigns, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const fileRef = useRef(null)
  const [queue, setQueue] = useState([])          // [{ name, state: 'up'|'err', msg }]
  const [preview, setPreview] = useState(null)
  const [ask, setAsk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [boardForm, setBoardForm] = useState(false)
  const [kindF, setKindF] = useState('all'); const [q, setQ] = useState(''); const [ren, setRen] = useState(null)
  const [studio, setStudio] = useState(null)       // null | {} (جديد) | { initial } (فتح إعلان محفوظ للتعديل كنسخة)
  const [sceneForm, setSceneForm] = useState(null)   // null | {} (جديد) | { scene } (تعديل)
  const usedBy = id => campaigns.filter(c => c.media_id === id).length

  async function upload(files) {
    const list = Array.from(files || []); if (!list.length) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { flash(t('انتهت الجلسة، سجّل الدخول من جديد', 'Session expired'), false); return }
    let okCount = 0
    for (const file of list) {
      const id = `${file.name}-${file.size}-${Date.now()}`
      const set = (state, msg) => setQueue(q => { const o = q.filter(x => x.id !== id); return [...o, { id, name: file.name, state, msg }] })
      const v = validateFile(file, isAr)
      if (v.error) { set('err', v.error); continue }
      set('up')
      const dur = v.kind === 'video' ? await readVideoDuration(file) : 15
      const path = `media/${user.id}/${newFileName(v.ext)}`
      const up = await supabase.storage.from(SG_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
      if (up.error) { set('err', t('فشل الرفع: ', 'Upload failed: ') + (up.error.message || '')); continue }
      const { error } = await supabase.rpc('signage_media_add', { p_kind: v.kind, p_title: file.name.replace(/\.[^.]+$/, '').slice(0, 120), p_path: path, p_mime: file.type, p_size: file.size, p_duration: dur })
      if (error) { await supabase.storage.from(SG_BUCKET).remove([path]); set('err', sgError(error, isAr)); continue }
      okCount++; setQueue(q => q.filter(x => x.id !== id))
    }
    if (okCount) { flash(t(`تم رفع ${okCount} ملف`, `${okCount} file(s) uploaded`), true); reload() }
  }

  async function del(m) {
    setBusy(true)
    const { data: path, error } = await supabase.rpc('signage_media_delete', { p_id: m.id })
    if (error) { setBusy(false); setAsk(null); flash(sgError(error, isAr), false); return }
    if (m.kind !== 'board' && m.kind !== 'scene') await supabase.storage.from(SG_BUCKET).remove([path])
    setBusy(false); setAsk(null); flash(t('تم حذف المحتوى', 'Media deleted'), true); reload()
  }
  const canDelete = m => role === 'admin' || m.uploaded_by === myUserId
  const shown = media.filter(m => (kindF === 'all' || m.kind === kindF) && (!q.trim() || m.title.toLowerCase().includes(q.trim().toLowerCase())))
  const cnt = k => (k === 'all' ? media.length : media.filter(m => m.kind === k).length)

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        style={{ border: `2px dashed ${drag ? SG_ACCENT : 'var(--border-2)'}`, background: drag ? `${SG_ACCENT}10` : 'var(--card)', borderRadius: 16, padding: '26px 18px', textAlign: 'center', marginBottom: 16, transition: 'all .12s' }}>
        <div style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-1)' }}>{t('اسحب الملفات هنا أو اخترها', 'Drag files here or choose')}</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', margin: '6px 0 14px', lineHeight: 1.8 }}>{t('فيديو MP4 أو WebM حتى 200MB، وصور JPG أو PNG أو WebP حتى 15MB. يفضَّل فيديو H.264 بدقة 1080p.', 'MP4/WebM video up to 200MB, JPG/PNG/WebP images up to 15MB. H.264 1080p recommended.')}</div>
        <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btn('primary'), background: SG_ACCENT, padding: '10px 24px', fontSize: '0.86rem' }}>{t('اختيار ملفات', 'Choose files')}</button>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border-2)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" onClick={() => setStudio({})} style={{ ...btn('primary'), background: '#EE712D', padding: '9px 20px', fontSize: '0.82rem' }}>{t('استوديو الإعلانات (قوالب جاهزة)', 'Ad studio')}</button>
            <button type="button" onClick={() => setSceneForm({})} style={{ ...btn('primary'), background: SG_ACCENT, padding: '9px 20px', fontSize: '0.82rem' }}>{t('إنشاء مشهد (شاشة مقسّمة + شريط + عناصر جاهزة)', 'Create scene')}</button>
            <button type="button" onClick={() => setBoardForm(true)} style={btn('ghost', { padding: '9px 20px', fontSize: '0.82rem' })}>{t('إضافة شاشة العرض (حركة الرحلات المباشرة)', 'Add Live Board (trip movements)')}</button>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 6 }}>{t('تعرض رحلات محطة الشاشة تلقائياً وتتحدّث وحدها.', "Shows the screen's station trips and updates automatically.")}</div>
        </div>
      </div>

      {queue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {queue.map(q => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${q.state === 'err' ? 'rgba(220,38,38,.4)' : 'var(--border)'}`, background: q.state === 'err' ? 'rgba(220,38,38,.07)' : 'var(--card)' }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.82rem', overflowWrap: 'anywhere' }}>{q.name}</span>
              {q.state === 'up' ? <Pill color={SG_ACCENT}>{t('جارٍ الرفع…', 'Uploading…')}</Pill> : <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#dc2626' }}>{q.msg}</span>}
              {q.state === 'err' && <button type="button" onClick={() => setQueue(x => x.filter(y => y.id !== q.id))} style={btn('ghost', { padding: '4px 10px' })} aria-label={t('إخفاء', 'Dismiss')}>×</button>}
            </div>
          ))}
        </div>
      )}

      {media.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {[['all', t('الكل', 'All')], ['image', t('صور', 'Images')], ['video', t('فيديو', 'Videos')], ['board', t('شاشة العرض', 'Live Board')], ['scene', t('مشاهد', 'Scenes')]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={kindF === k} onClick={() => setKindF(k)}
                style={{ padding: '7px 14px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', border: `1.5px solid ${kindF === k ? SG_ACCENT : 'var(--border)'}`, background: kindF === k ? `${SG_ACCENT}18` : 'var(--card)', color: kindF === k ? SG_ACCENT : 'var(--text-2)' }}>{l} <span dir="ltr" style={{ opacity: 0.7 }}>{cnt(k)}</span></button>
            ))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث في المحتوى…', 'Search media…')} style={{ ...input, width: 220, padding: '8px 12px' }} />
        </div>
      )}
      {media.length === 0 ? <Empty title={t('المكتبة فارغة', 'Library is empty')} hint={t('ارفع أول صورة أو فيديو ثم أنشئ منه حملة.', 'Upload your first image or video, then create a campaign.')} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {shown.map(m => (
            <article key={m.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button type="button" onClick={() => setPreview(m)} aria-label={t('معاينة', 'Preview')} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'block' }}>
                <Thumb m={m} url={mediaUrl(m.path)} style={{ aspectRatio: '16 / 9' }} />
              </button>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{m.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
                  {m.kind === 'scene' ? `${t('مشهد', 'Scene')} · ${({ full: 'كاملة', side: 'مع جانب', bottom: 'مع شريط', side_bottom: 'جانب + شريط' })[m.config?.layout] || ''}` : m.kind === 'board' ? `${t('شاشة العرض', 'Live Board')} · ${m.config?.mode === 'actual' ? t('الفعلي', 'Actual') : t('جدول اليوم', "Today's schedule")}` : <>{m.kind === 'video' ? `${t('فيديو', 'Video')} · ${fmtDur(m.duration_sec)}` : t('صورة', 'Image')} · {fmtSize(m.size_bytes)}</>}<br />
                  {m.uploaded_by_name || '—'} · {fmtDT(m.created_at)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                  <Pill color={usedBy(m.id) ? '#16a34a' : '#64748b'}>{usedBy(m.id) ? t(`في ${usedBy(m.id)} حملة`, `${usedBy(m.id)} campaign(s)`) : t('غير مستخدم', 'Unused')}</Pill>
                  <span style={{ flex: 1 }} />
                  {m.kind === 'image' && m.config?.studio && canDelete(m) && <button type="button" onClick={() => setStudio({ initial: m })} style={btn('ghost', { padding: '5px 12px' })}>{t('استوديو', 'Studio')}</button>}
                  {m.kind === 'scene' && canDelete(m) && <button type="button" onClick={() => setSceneForm({ scene: m })} style={btn('ghost', { padding: '5px 12px' })}>{t('تعديل', 'Edit')}</button>}
                  {canDelete(m) && <button type="button" onClick={() => setRen(m)} style={btn('ghost', { padding: '5px 12px' })}>{t('تسمية', 'Rename')}</button>}
                  {canDelete(m) && <button type="button" onClick={() => setAsk(m)} style={btn('danger', { padding: '5px 12px' })}>{t('حذف', 'Delete')}</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {studio && <Suspense fallback={null}><AdStudio isAr={isAr} media={media} initial={studio.initial} onClose={() => setStudio(null)} onDone={msg => { setStudio(null); flash(msg, true); reload() }} /></Suspense>}
      {sceneForm && <SceneBuilder isAr={isAr} scene={sceneForm.scene} media={media} onClose={() => setSceneForm(null)} onDone={msg => { setSceneForm(null); flash(msg, true); reload() }} />}
      {preview && (
        <Sheet isAr={isAr} title={preview.title} icon={Ic.box} accent={SG_ACCENT} variant="modal" width={860} onClose={() => setPreview(null)}
          footer={<button type="button" onClick={() => setPreview(null)} style={btn('ghost')}>{t('إغلاق', 'Close')}</button>}>
          {preview.kind === 'scene'
            ? <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000', borderRadius: 10, overflow: 'hidden' }}><SceneView config={preview.config} refs={Object.fromEntries(media.map(x => [x.id, { kind: x.kind, path: x.path }]))} tickers={[{ id: 'd', text: 'معاينة الشريط الإخباري', level: 'normal' }]} lat={24.7136} lng={46.6753} getBoard={async mode => ({ station: 'معاينة', mode, events: [] })} demo /></div>
            : preview.kind === 'board'
            ? <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-2)', lineHeight: 2, fontWeight: 700 }}>{t('شاشة العرض تُرسم على الشاشة نفسها ببيانات محطتها. اربطها بحملة وستظهر هناك.', 'The Live Board renders on the screen with its station data. Attach it to a campaign.')}</div>
            : preview.kind === 'video'
            ? <video src={mediaUrl(preview.path)} controls autoPlay muted playsInline style={{ width: '100%', maxHeight: '64vh', background: '#000', borderRadius: 10 }} />
            : <img src={mediaUrl(preview.path)} alt={preview.title} style={{ width: '100%', maxHeight: '64vh', objectFit: 'contain', background: '#000', borderRadius: 10 }} />}
        </Sheet>
      )}
      {ren && <RenameSheet isAr={isAr} m={ren} onClose={() => setRen(null)} onDone={() => { setRen(null); flash(t('تم تغيير الاسم', 'Renamed'), true); reload() }} />}
      {boardForm && <BoardSheet isAr={isAr} onClose={() => setBoardForm(false)} onDone={() => { setBoardForm(false); flash(t('أُضيفت شاشة العرض للمكتبة. أنشئ بها حملة لتظهر على الشاشة', 'Live Board added. Create a campaign to show it'), true); reload() }} />}
      {ask && (
        <ConfirmDialog title={t('حذف المحتوى', 'Delete media')} confirmLabel={busy ? '…' : t('حذف نهائي', 'Delete')}
          message={usedBy(ask.id) ? t('هذا المحتوى مستخدم في حملة؛ احذف الحملة أولاً وإلا سيرفض النظام الحذف.', 'This media is used by a campaign; delete the campaign first.') : t(`سيُحذف «${ask.title}» من المكتبة والتخزين نهائياً ولا يمكن التراجع.`, `"${ask.title}" will be deleted permanently.`)}
          onCancel={() => setAsk(null)} onConfirm={() => del(ask)} />
      )}
    </div>
  )
}

function BoardSheet({ isAr, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const [title, setTitle] = useState('شاشة العرض'); const [mode, setMode] = useState('scheduled'); const [layout, setLayout] = useState('columns')
  const [theme, setTheme] = useState('nwb'); const [dur, setDur] = useState(30)
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  async function save() {
    if (!title.trim()) { setErr(t('اكتب اسماً', 'Enter a name')); return }
    setSaving(true); setErr('')
    const { error } = await supabase.rpc('signage_board_add', { p_title: title.trim(), p_mode: mode, p_layout: layout, p_theme: theme, p_duration: Number(dur) || 30 })
    setSaving(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone()
  }
  const Seg = ({ value, onChange, opts }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opts.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          style={{ flex: '1 1 120px', padding: '10px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', border: `2px solid ${value === v ? SG_ACCENT : 'var(--border)'}`, background: value === v ? `${SG_ACCENT}14` : 'var(--card)', color: value === v ? SG_ACCENT : 'var(--text-2)' }}>{l}</button>
      ))}
    </div>
  )
  return (
    <Sheet isAr={isAr} title={t('إضافة شاشة العرض', 'Add Live Board')} icon={Ic.box} accent={SG_ACCENT} onClose={onClose}
      sub={t('تعرض حركة رحلات محطة الشاشة (أو كل المحطات إن لم تُحدَّد للشاشة محطة).', "Shows the screen station's trip movements.")}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="button" disabled={saving} onClick={save} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : t('إضافة', 'Add')}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Err>{err}</Err>
        <div><label style={lbl}>{t('الاسم *', 'Name *')}</label><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} style={input} /></div>
        <div><label style={lbl}>{t('نوع البيانات', 'Data')}</label><Seg value={mode} onChange={setMode} opts={[['scheduled', t('جدول اليوم', "Today's schedule")], ['actual', t('الفعلي المسجّل', 'Actual (recorded)')]]} /></div>
        <div><label style={lbl}>{t('طريقة العرض', 'Layout')}</label><Seg value={layout} onChange={setLayout} opts={[['columns', t('عمودان', 'Two columns')], ['feed', t('قائمة متتالية', 'Feed')], ['auto', t('تنقّل تلقائي', 'Auto')]]} /></div>
        <div><label style={lbl}>{t('اللون', 'Theme')}</label><Seg value={theme} onChange={setTheme} opts={Object.entries(THEMES).map(([k, v]) => [k, v.name])} /></div>
        <div style={{ maxWidth: 200 }}><label style={lbl}>{t('مدة الظهور بالتناوب (ثانية)', 'Seconds on screen')}</label><input type="number" min="5" max="1800" value={dur} onChange={e => setDur(e.target.value)} style={input} /></div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', lineHeight: 1.9 }}>{t('لو كانت شاشة العرض هي الوحيدة في حملات الشاشة تبقى ثابتة؛ ولو معها محتوى آخر تتناوب كل (المدة) ثانية.', 'If it is the only item it stays; otherwise it rotates.')}</div>
      </div>
    </Sheet>
  )
}

function RenameSheet({ isAr, m, onClose, onDone }) {
  const t = (a, e) => (isAr ? a : e)
  const [title, setTitle] = useState(m.title); const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  async function save(e) {
    e?.preventDefault()
    if (!title.trim()) { setErr(t('اكتب اسماً', 'Enter a name')); return }
    setSaving(true)
    const { error } = await supabase.rpc('signage_media_rename', { p_id: m.id, p_title: title.trim() })
    setSaving(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone()
  }
  return (
    <Sheet isAr={isAr} title={t('تغيير اسم المحتوى', 'Rename media')} icon={Ic.box} accent={SG_ACCENT} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>{t('إلغاء', 'Cancel')}</button>
        <button type="submit" form="sg-ren" disabled={saving} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : t('حفظ', 'Save')}</button>
      </>}>
      <form id="sg-ren" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Err>{err}</Err>
        <input autoFocus value={title} maxLength={120} onChange={e => setTitle(e.target.value)} style={input} />
      </form>
    </Sheet>
  )
}

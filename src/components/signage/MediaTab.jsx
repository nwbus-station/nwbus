// تبويب المحتوى: رفع صور وفيديو (مع التحقق من النوع والحجم) ومكتبة بمعاينة وحذف محمي
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import ConfirmDialog from '../shared/ConfirmDialog'
import { lbl, input, Pill, Empty, Err, Thumb, SG_ACCENT } from './common'
import { ACCEPT, SG_BUCKET, validateFile, readVideoDuration, newFileName, mediaUrl, fmtSize, fmtDur, fmtDT, sgError } from '../../utils/signage'

export default function MediaTab({ isAr, role, myUserId, media, campaigns, reload, flash }) {
  const t = (a, e) => (isAr ? a : e)
  const fileRef = useRef(null)
  const [queue, setQueue] = useState([])          // [{ name, state: 'up'|'err', msg }]
  const [preview, setPreview] = useState(null)
  const [ask, setAsk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
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
    await supabase.storage.from(SG_BUCKET).remove([path])
    setBusy(false); setAsk(null); flash(t('تم حذف المحتوى', 'Media deleted'), true); reload()
  }
  const canDelete = m => role === 'admin' || m.uploaded_by === myUserId

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        style={{ border: `2px dashed ${drag ? SG_ACCENT : 'var(--border-2)'}`, background: drag ? `${SG_ACCENT}10` : 'var(--card)', borderRadius: 16, padding: '26px 18px', textAlign: 'center', marginBottom: 16, transition: 'all .12s' }}>
        <div style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-1)' }}>{t('اسحب الملفات هنا أو اخترها', 'Drag files here or choose')}</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', margin: '6px 0 14px', lineHeight: 1.8 }}>{t('فيديو MP4 أو WebM حتى 200MB، وصور JPG أو PNG أو WebP حتى 15MB. يفضَّل فيديو H.264 بدقة 1080p.', 'MP4/WebM video up to 200MB, JPG/PNG/WebP images up to 15MB. H.264 1080p recommended.')}</div>
        <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btn('primary'), background: SG_ACCENT, padding: '10px 24px', fontSize: '0.86rem' }}>{t('اختيار ملفات', 'Choose files')}</button>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
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

      {media.length === 0 ? <Empty title={t('المكتبة فارغة', 'Library is empty')} hint={t('ارفع أول صورة أو فيديو ثم أنشئ منه حملة.', 'Upload your first image or video, then create a campaign.')} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {media.map(m => (
            <article key={m.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button type="button" onClick={() => setPreview(m)} aria-label={t('معاينة', 'Preview')} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'block' }}>
                <Thumb m={m} url={mediaUrl(m.path)} style={{ aspectRatio: '16 / 9' }} />
              </button>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{m.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
                  {m.kind === 'video' ? `${t('فيديو', 'Video')} · ${fmtDur(m.duration_sec)}` : t('صورة', 'Image')} · {fmtSize(m.size_bytes)}<br />
                  {m.uploaded_by_name || '—'} · {fmtDT(m.created_at)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                  <Pill color={usedBy(m.id) ? '#16a34a' : '#64748b'}>{usedBy(m.id) ? t(`في ${usedBy(m.id)} حملة`, `${usedBy(m.id)} campaign(s)`) : t('غير مستخدم', 'Unused')}</Pill>
                  <span style={{ flex: 1 }} />
                  {canDelete(m) && <button type="button" onClick={() => setAsk(m)} style={btn('danger', { padding: '5px 12px' })}>{t('حذف', 'Delete')}</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <Sheet isAr={isAr} title={preview.title} icon={Ic.box} accent={SG_ACCENT} variant="modal" width={860} onClose={() => setPreview(null)}
          footer={<button type="button" onClick={() => setPreview(null)} style={btn('ghost')}>{t('إغلاق', 'Close')}</button>}>
          {preview.kind === 'video'
            ? <video src={mediaUrl(preview.path)} controls autoPlay muted playsInline style={{ width: '100%', maxHeight: '64vh', background: '#000', borderRadius: 10 }} />
            : <img src={mediaUrl(preview.path)} alt={preview.title} style={{ width: '100%', maxHeight: '64vh', objectFit: 'contain', background: '#000', borderRadius: 10 }} />}
        </Sheet>
      )}
      {ask && (
        <ConfirmDialog title={t('حذف المحتوى', 'Delete media')} confirmLabel={busy ? '…' : t('حذف نهائي', 'Delete')}
          message={usedBy(ask.id) ? t('هذا المحتوى مستخدم في حملة؛ احذف الحملة أولاً وإلا سيرفض النظام الحذف.', 'This media is used by a campaign; delete the campaign first.') : t(`سيُحذف «${ask.title}» من المكتبة والتخزين نهائياً ولا يمكن التراجع.`, `"${ask.title}" will be deleted permanently.`)}
          onCancel={() => setAsk(null)} onConfirm={() => del(ask)} />
      )}
    </div>
  )
}

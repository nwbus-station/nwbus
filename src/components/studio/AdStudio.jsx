// استوديو الإعلانات: قوالب جاهزة بالألوان الرسمية + صورة خلفية مُحسَّنة داخل المتصفح، يُصدَّر JPEG ويدخل مكتبة المحتوى
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic, useMedia } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import { lbl, input, Err, SG_ACCENT } from '../signage/common'
import { TEMPLATES, PALETTES, AD_SIZES, AdCanvas } from './templates'
import { autoEnhance, processBackground } from './imageTools'
import { SG_BUCKET, MAX_IMAGE, mediaUrl, newFileName, validateFile, sgError } from '../../utils/signage'

const BG0 = { media_id: '', brightness: 1, contrast: 1, saturate: 1, fit: 'cover', fx: 0.5, fy: 0.5 }

// معاينة مصغّرة لقالب (على لوحة ثابتة مُصغَّرة بدون تحجيم الجذر نفسه)
function Mini({ tpl, palette, width = 150 }) {
  const { w, h } = AD_SIZES.landscape, sc = width / w
  return (
    <div dir="ltr" style={{ width, height: h * sc, overflow: 'hidden', borderRadius: 6, position: 'relative', background: '#000' }}>
      <div style={{ width: w, height: h, transform: `scale(${sc})`, transformOrigin: 'top left' }}>
        <AdCanvas template={tpl.key} data={tpl.defaults} palette={palette} bgUrl="" orientation="landscape" logo />
      </div>
    </div>
  )
}

const Slider = ({ label, value, min, max, step = 0.01, onChange }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr 44px', alignItems: 'center', gap: 10, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-2)' }}>
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    <span dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-3)' }}>{Number(value).toFixed(2)}</span>
  </label>
)
const Chip = ({ on, onClick, children }) => (
  <button type="button" aria-pressed={on} onClick={onClick}
    style={{ padding: '8px 14px', borderRadius: 99, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap', border: `1.5px solid ${on ? SG_ACCENT : 'var(--border)'}`, background: on ? `${SG_ACCENT}18` : 'var(--card)', color: on ? SG_ACCENT : 'var(--text-2)' }}>{children}</button>
)
const Card = ({ n, title, children }) => (
  <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--card)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: SG_ACCENT, color: '#fff', fontSize: '0.74rem', fontWeight: 900, flexShrink: 0 }}>{n}</span>
      <div style={{ fontWeight: 900, fontSize: '0.92rem', color: 'var(--text-1)' }}>{title}</div>
    </div>
    {children}
  </section>
)

export default function AdStudio({ isAr = true, media, initial, onClose, onDone }) {
  const desk = useMedia('(min-width: 1000px)')
  const s0 = initial?.config?.studio
  const [tplKey, setTplKey] = useState(s0?.template || TEMPLATES[0].key)
  const tpl = TEMPLATES.find(x => x.key === tplKey) || TEMPLATES[0]
  const [data, setData] = useState(s0?.data || TEMPLATES[0].defaults)
  const [orientation, setOrientation] = useState(s0?.orientation || 'landscape')
  const [paletteKey, setPaletteKey] = useState(s0?.palette || PALETTES[0].key)
  const [logo, setLogo] = useState(s0?.logo !== false)
  const [bg, setBg] = useState({ ...BG0, ...(s0?.bg || {}) })
  const [name, setName] = useState(initial ? `${initial.title} (نسخة)` : '')
  const [duration, setDuration] = useState(initial?.duration_sec || 15)
  const [extra, setExtra] = useState([])           // خلفيات رُفعت الآن
  const [bgUrl, setBgUrl] = useState(''); const [bgBusy, setBgBusy] = useState(false)
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false); const [exporting, setExporting] = useState(false)
  const palette = PALETTES.find(p => p.key === paletteKey) || PALETTES[0]
  const size = AD_SIZES[orientation]
  const images = useMemo(() => [...extra, ...media.filter(m => m.kind === 'image')], [media, extra])
  const bgMedia = images.find(m => m.id === bg.media_id)
  const fileRef = useRef(null), exportRef = useRef(null), prevRef = useRef(null)
  const [pv, setPv] = useState(0.3)

  useEffect(() => {
    const el = prevRef.current; if (!el) return
    const fit = () => setPv(el.clientWidth / size.w)
    fit(); const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [size.w, desk])

  // معالجة الخلفية (مؤجّلة قليلاً أثناء تحريك المنزلقات)
  useEffect(() => {
    if (!bgMedia) { setBgUrl(''); return }
    let alive = true; setBgBusy(true)
    const t = setTimeout(async () => {
      try { const u = await processBackground(mediaUrl(bgMedia.path), { w: size.w, h: size.h, ...bg }); if (alive) setBgUrl(u) } catch { if (alive) setBgUrl('') }
      if (alive) setBgBusy(false)
    }, 160)
    return () => { alive = false; clearTimeout(t) }
  }, [bgMedia?.path, bg.brightness, bg.contrast, bg.saturate, bg.fit, bg.fx, bg.fy, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickTemplate = k => {
    const t = TEMPLATES.find(x => x.key === k); if (!t) return
    // ما كتبه المستخدم بنفسه (يختلف عن نص القالب القديم) ينتقل للقالب الجديد إن كان فيه نفس الحقل
    const old = TEMPLATES.find(x => x.key === tplKey)?.defaults || {}
    const keep = Object.fromEntries(['title', 'subtitle', 'note'].filter(k => t.fields.some(f => f.k === k) && data[k] && data[k] !== old[k]).map(k => [k, data[k]]))
    setTplKey(k); setData({ ...t.defaults, ...keep })
  }

  async function uploadBg(file) {
    setErr('')
    const v = validateFile(file, isAr)
    if (v.error || v.kind !== 'image') { setErr(v.error || 'اختر صورة (JPG أو PNG أو WebP)'); return }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const path = `media/${user.id}/${newFileName(v.ext)}`
      const up = await supabase.storage.from(SG_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
      if (up.error) throw up.error
      const title = `خلفية: ${file.name.replace(/\.[^.]+$/, '')}`.slice(0, 120)
      const { data: id, error } = await supabase.rpc('signage_media_add', { p_kind: 'image', p_title: title, p_path: path, p_mime: file.type, p_size: file.size, p_duration: 15 })
      if (error) { await supabase.storage.from(SG_BUCKET).remove([path]); throw error }
      const m = { id, kind: 'image', title, path }
      setExtra(e => [m, ...e]); setBg(b => ({ ...b, media_id: id }))
    } catch (e) { setErr(sgError(e, isAr)) }
  }

  async function enhance() {
    if (!bgMedia) return
    try { const v = await autoEnhance(mediaUrl(bgMedia.path)); setBg(b => ({ ...b, ...v })) } catch { setErr('تعذّر تحليل الصورة') }
  }

  async function save() {
    setErr('')
    const title = (name.trim() || String(data.title || tpl.ar)).slice(0, 120)
    if (tpl.bg === 'required' && !bgUrl) { setErr('هذا القالب يحتاج صورة خلفية'); return }
    setSaving(true); setExporting(true)
    let path = null
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      await document.fonts?.ready
      const el = exportRef.current
      await Promise.all([...el.querySelectorAll('img')].map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())))
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, { scale: 1, width: size.w, height: size.h, useCORS: true, backgroundColor: null, logging: false,
        onclone: d => { const st = d.createElement('style'); st.textContent = '*{animation:none !important;transition:none !important}'; d.head.appendChild(st) } })
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) throw new Error('render failed')
      if (blob.size > MAX_IMAGE) throw new Error('bad image')
      const { data: { user } } = await supabase.auth.getUser()
      path = `media/${user.id}/${newFileName('jpg')}`
      const up = await supabase.storage.from(SG_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
      if (up.error) throw up.error
      const { data: id, error } = await supabase.rpc('signage_media_add', { p_kind: 'image', p_title: title, p_path: path, p_mime: 'image/jpeg', p_size: blob.size, p_duration: Number(duration) || 15 })
      if (error) throw error
      path = null
      const cfg = { studio: { template: tplKey, data, palette: paletteKey, orientation, logo, bg } }
      const { error: e2 } = await supabase.rpc('signage_media_set_config', { p_id: id, p_config: cfg })
      onDone(e2 ? 'أُضيف الإعلان للمكتبة (لم تُحفظ إعدادات القالب للتعديل لاحقاً: شغّل SQL 034)' : 'أُضيف الإعلان للمكتبة. أنشئ به حملة ليظهر على الشاشات')
    } catch (e) {
      if (path) await supabase.storage.from(SG_BUCKET).remove([path])
      setErr(/bad image/.test(e?.message || '') ? 'الصورة الناتجة أكبر من الحد المسموح' : sgError(e, isAr))
    }
    setExporting(false); setSaving(false)
  }

  const canvasProps = { template: tplKey, data, palette, bgUrl, orientation, logo }
  const preview = (
    <div style={{ position: desk ? 'sticky' : 'static', top: 0 }}>
      <div style={{ fontWeight: 900, fontSize: '0.88rem', color: 'var(--text-1)', marginBottom: 8 }}>معاينة الإعلان {bgBusy && <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: '0.72rem' }}> · جارٍ تجهيز الصورة…</span>}</div>
      <div ref={prevRef} dir="ltr" style={{ position: 'relative', width: '100%', maxWidth: orientation === 'portrait' ? 300 : '100%', margin: '0 auto', aspectRatio: `${size.w} / ${size.h}`, border: '2px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <div style={{ width: size.w, height: size.h, transform: `scale(${pv})`, transformOrigin: 'top left' }}><AdCanvas {...canvasProps} /></div>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 8, lineHeight: 1.8 }}>يُصدَّر بدقة {size.w}×{size.h} (JPEG) ويدخل مكتبة المحتوى كأي صورة.</div>
    </div>
  )

  return (
    <Sheet isAr={isAr} variant="drawer" width={1240} title={initial ? 'تعديل في الاستوديو (حفظ كنسخة جديدة)' : 'استوديو الإعلانات'} icon={Ic.box} accent={SG_ACCENT} onClose={onClose}
      sub="اختر قالباً، اكتب النصوص، واختر الألوان والصورة. الإعلان يُصمَّم بالألوان الرسمية بدون برامج تصميم."
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>إلغاء</button>
        <button type="button" disabled={saving} onClick={save} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? 'جارٍ التصدير…' : 'حفظ في المكتبة'}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: desk ? 'minmax(0, 1fr) 470px' : '1fr', gap: 18, alignItems: 'start' }}>
        {!desk && preview}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Err>{err}</Err>
          <Card n="1" title="القالب">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {TEMPLATES.map(t => (
                <button key={t.key} type="button" aria-pressed={tplKey === t.key} onClick={() => pickTemplate(t.key)}
                  style={{ padding: 8, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', border: `2px solid ${tplKey === t.key ? SG_ACCENT : 'var(--border)'}`, background: tplKey === t.key ? `${SG_ACCENT}10` : 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <Mini tpl={t} palette={palette} />
                  <span style={{ fontWeight: 800, fontSize: '0.76rem', color: tplKey === t.key ? SG_ACCENT : 'var(--text-2)' }}>{t.ar}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}><label style={lbl}>اتجاه الشاشة</label><div style={{ display: 'flex', gap: 6 }}><Chip on={orientation === 'landscape'} onClick={() => setOrientation('landscape')}>أفقي (1920×1080)</Chip><Chip on={orientation === 'portrait'} onClick={() => setOrientation('portrait')}>عمودي (1080×1920)</Chip></div></div>
          </Card>

          <Card n="2" title="النصوص">
            <div style={{ display: 'grid', gap: 12 }}>
              {tpl.fields.map(f => (
                <div key={f.k}>
                  <label style={lbl}>{f.label}</label>
                  {f.multiline
                    ? <textarea rows={2} maxLength={f.max} value={data[f.k] || ''} placeholder={f.placeholder} onChange={e => setData(d => ({ ...d, [f.k]: e.target.value }))} style={{ ...input, resize: 'vertical' }} />
                    : <input maxLength={f.max} value={data[f.k] || ''} placeholder={f.placeholder} onChange={e => setData(d => ({ ...d, [f.k]: e.target.value }))} style={input} />}
                </div>
              ))}
            </div>
          </Card>

          <Card n="3" title="الألوان والشعار">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {PALETTES.map(p => (
                <button key={p.key} type="button" aria-pressed={paletteKey === p.key} onClick={() => setPaletteKey(p.key)} title={p.ar}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', border: `2px solid ${paletteKey === p.key ? SG_ACCENT : 'var(--border)'}`, background: 'var(--card)', color: 'var(--text-1)' }}>
                  <span aria-hidden="true" style={{ display: 'inline-flex', width: 34, height: 18, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(0,0,0,.2)' }}><i style={{ flex: 1, background: p.bg }} /><i style={{ flex: 1, background: p.accent }} /><i style={{ flex: 1, background: p.fg }} /></span>{p.ar}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)', cursor: 'pointer' }}><input type="checkbox" checked={logo} onChange={e => setLogo(e.target.checked)} /> إظهار شعار نورث وست باص الرسمي</label>
          </Card>

          {tpl.bg !== 'none' && (
            <Card n="4" title={tpl.bg === 'required' ? 'صورة الخلفية (مطلوبة)' : 'صورة الخلفية (اختيارية)'}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                {tpl.bg !== 'required' && <Chip on={!bg.media_id} onClick={() => setBg(b => ({ ...b, media_id: '' }))}>بدون صورة</Chip>}
                <button type="button" onClick={() => fileRef.current?.click()} style={btn('ghost', { padding: '8px 14px' })}>رفع صورة جديدة</button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadBg(f) }} />
              </div>
              {images.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, maxHeight: 190, overflowY: 'auto', padding: 2 }}>
                  {images.map(m => (
                    <button key={m.id} type="button" aria-pressed={bg.media_id === m.id} onClick={() => setBg(b => ({ ...b, media_id: m.id }))} title={m.title}
                      style={{ padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: `2.5px solid ${bg.media_id === m.id ? SG_ACCENT : 'var(--border)'}`, background: '#0b1220', aspectRatio: '16 / 9' }}>
                      <img src={mediaUrl(m.path)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
              {bgMedia && (
                <div style={{ display: 'grid', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border-2)' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" onClick={enhance} style={{ ...btn('primary'), background: SG_ACCENT, padding: '8px 16px' }}>تحسين تلقائي</button>
                    <button type="button" onClick={() => setBg(b => ({ ...b, brightness: 1, contrast: 1, saturate: 1 }))} style={btn('ghost', { padding: '8px 14px' })}>إعادة الضبط</button>
                    <Chip on={bg.fit === 'cover'} onClick={() => setBg(b => ({ ...b, fit: 'cover' }))}>تملأ الإطار</Chip>
                    <Chip on={bg.fit === 'contain'} onClick={() => setBg(b => ({ ...b, fit: 'contain' }))}>كاملة بخلفية ضبابية</Chip>
                  </div>
                  <Slider label="السطوع" value={bg.brightness} min={0.6} max={1.6} onChange={v => setBg(b => ({ ...b, brightness: v }))} />
                  <Slider label="التباين" value={bg.contrast} min={0.8} max={1.5} onChange={v => setBg(b => ({ ...b, contrast: v }))} />
                  <Slider label="التشبّع" value={bg.saturate} min={0} max={2} onChange={v => setBg(b => ({ ...b, saturate: v }))} />
                  {bg.fit === 'cover' && <>
                    <Slider label="التركيز أفقياً" value={bg.fx} min={0} max={1} onChange={v => setBg(b => ({ ...b, fx: v }))} />
                    <Slider label="التركيز عمودياً" value={bg.fy} min={0} max={1} onChange={v => setBg(b => ({ ...b, fy: v }))} />
                  </>}
                </div>
              )}
            </Card>
          )}

          <Card n={tpl.bg === 'none' ? '4' : '5'} title="اسم الإعلان في المكتبة">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12 }}>
              <div><label style={lbl}>الاسم</label><input value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder={String(data.title || tpl.ar)} style={input} /></div>
              <div><label style={lbl}>مدة الظهور (ثانية)</label><input type="number" min="3" max="300" value={duration} onChange={e => setDuration(e.target.value)} style={input} /></div>
            </div>
          </Card>
        </div>
        {desk && preview}
      </div>
      {exporting && (
        <div aria-hidden="true" style={{ position: 'fixed', left: -30000, top: 0, width: size.w, height: size.h, pointerEvents: 'none' }}>
          <div ref={exportRef} style={{ width: size.w, height: size.h }}><AdCanvas {...canvasProps} /></div>
        </div>
      )}
    </Sheet>
  )
}

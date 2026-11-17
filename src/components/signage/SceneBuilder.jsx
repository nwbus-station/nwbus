// منشئ المشاهد: اختر التخطيط (تقسيم الشاشة) ثم محتوى كل منطقة (وسائط / شاشة العرض / عناصر جاهزة / شريط أخبار) مع معاينة حيّة
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Sheet, { Ic, useMedia } from '../dispatch/Sheet'
import { btn } from '../dispatch/DispatchCards'
import SelectField from '../shared/SelectField'
import SceneView, { LAYOUTS } from '../scene/SceneView'
import { WIDGET_META } from '../scene/widgets'
import { SAUDI_CITIES } from '../scene/cities'
import { THEMES } from '../board/boardParts'
import { lbl, input, Err, Thumb, SG_ACCENT } from './common'
import { mediaUrl, sgError } from '../../utils/signage'

export const LAYOUT_META = [
  { k: 'full', ar: 'شاشة كاملة', zones: ['main'] },
  { k: 'side', ar: 'رئيسي + جانب', zones: ['main', 'side'] },
  { k: 'bottom', ar: 'رئيسي + شريط أخبار', zones: ['main', 'ticker'] },
  { k: 'side_bottom', ar: 'رئيسي + جانب + شريط', zones: ['main', 'side', 'ticker'] },
]
const ZONE_AR = { main: 'المنطقة الرئيسية', side: 'المنطقة الجانبية', ticker: 'شريط الأخبار' }

const DEMO_TICKERS = [{ id: 'd1', text: 'مثال: تأخرت رحلة جدة 15 دقيقة', level: 'normal' }, { id: 'd2', text: 'نرحب بكم في محطات نورث وست باص', level: 'normal' }]
const evt = (id, type, time, status, f, t) => ({ id, type, time, status, trip: { trip_number: id.split('-')[0], from_station: { name_ar: f, name_en: f }, to_station: { name_ar: t, name_en: t } } })
const DEMO_BOARD = { station: 'محطة تجريبية', mode: 'scheduled', events: [evt('R101-d', 'departure', '08:10', 'done', 'الرياض', 'جدة'), evt('R102-d', 'departure', '08:40', 'upcoming', 'الرياض', 'الدمام'), evt('R103-d', 'departure', '09:15', 'upcoming', 'الرياض', 'حائل'), evt('R201-a', 'arrival', '08:05', 'done', 'جدة', 'الرياض'), evt('R202-a', 'arrival', '08:55', 'upcoming', 'الدمام', 'الرياض')] }
const demoGetBoard = async mode => ({ ...DEMO_BOARD, mode })

// مخطط صغير للتخطيط
export function LayoutDiagram({ k, size = 64, active }) {
  const lay = LAYOUTS[k] || LAYOUTS.full; const f = size / 1920
  const col = { main: '#38bdf8', side: '#f59e0b', ticker: '#ef4444' }
  return (
    <svg width={size} height={size * 0.5625} viewBox={`0 0 ${size} ${size * 0.5625}`} aria-hidden="true" style={{ display: 'block', borderRadius: 3, background: '#0b1220', outline: active ? `2px solid ${SG_ACCENT}` : 'none' }}>
      {Object.entries(lay).map(([z, [x, y, w, h]]) => <rect key={z} x={x * f + 1} y={y * f + 1} width={w * f - 2} height={h * f - 2} rx="1.5" fill={col[z]} opacity="0.85" />)}
    </svg>
  )
}

const Seg = ({ value, onChange, opts, small }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {opts.map(([v, l]) => (
      <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
        style={{ flex: small ? '0 0 auto' : '1 1 100px', padding: small ? '7px 14px' : '9px 10px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', border: `2px solid ${value === v ? SG_ACCENT : 'var(--border)'}`, background: value === v ? `${SG_ACCENT}14` : 'var(--card)', color: value === v ? SG_ACCENT : 'var(--text-2)' }}>{l}</button>
    ))}
  </div>
)

function ZoneEditor({ name, zone, onChange, media }) {
  const isTicker = name === 'ticker'
  const usable = media.filter(m => m.kind === 'image' || m.kind === 'video')
  const setType = type => {
    if (type === 'media') onChange({ type: 'media', media_id: usable[0]?.id || '', fit: 'contain' })
    else if (type === 'board') onChange({ type: 'board', mode: 'scheduled', layout: 'columns' })
    else onChange({ type: 'widgets', items: ['clock', 'prayer'] })
  }
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--card)' }}>
      <div style={{ fontWeight: 900, fontSize: '0.86rem', color: 'var(--text-1)', marginBottom: 10 }}>{ZONE_AR[name]}</div>
      {isTicker ? (
        <div>
          <label style={lbl}>سرعة الحركة</label>
          <Seg small value={zone?.speed || 'normal'} onChange={v => onChange({ type: 'ticker', speed: v })} opts={[['slow', 'بطيئة'], ['normal', 'متوسطة'], ['fast', 'سريعة']]} />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 8, lineHeight: 1.8 }}>تظهر هنا رسائل تبويب «الشريط الإخباري» الموجَّهة لكل شاشة. الرسائل العاجلة بخلفية حمراء.</div>
        </div>
      ) : (
        <>
          <Seg value={zone?.type} onChange={setType} opts={[['media', 'صورة / فيديو'], ['board', 'شاشة العرض'], ['widgets', 'عناصر جاهزة']]} />
          <div style={{ marginTop: 12 }}>
            {zone?.type === 'media' && (
              <>
                {usable.length === 0 ? <div style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 700 }}>ارفع صورة أو فيديو من تبويب «المحتوى» أولاً.</div> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, maxHeight: 200, overflowY: 'auto', padding: 2 }}>
                    {usable.map(x => (
                      <button key={x.id} type="button" aria-pressed={zone.media_id === x.id} onClick={() => onChange({ ...zone, media_id: x.id })} title={x.title}
                        style={{ padding: 0, borderRadius: 9, overflow: 'hidden', cursor: 'pointer', border: `2.5px solid ${zone.media_id === x.id ? SG_ACCENT : 'var(--border)'}`, background: 'var(--card)', textAlign: 'start', fontFamily: 'inherit' }}>
                        <Thumb m={x} url={mediaUrl(x.path)} style={{ aspectRatio: '16 / 9' }} />
                        <div style={{ fontSize: '0.64rem', fontWeight: 800, padding: '4px 6px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10 }}><label style={lbl}>ملاءمة الصورة للمنطقة</label><Seg small value={zone.fit || 'contain'} onChange={v => onChange({ ...zone, fit: v })} opts={[['contain', 'كاملة بدون قص'], ['cover', 'تملأ المنطقة (قد تُقص)']]} /></div>
              </>
            )}
            {zone?.type === 'board' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div><label style={lbl}>نوع البيانات</label><Seg small value={zone.mode} onChange={v => onChange({ ...zone, mode: v })} opts={[['scheduled', 'جدول اليوم'], ['actual', 'الفعلي المسجّل']]} /></div>
                <div><label style={lbl}>طريقة العرض</label><Seg small value={zone.layout} onChange={v => onChange({ ...zone, layout: v })} opts={[['columns', 'عمودان'], ['feed', 'قائمة متتالية'], ['auto', 'تنقّل تلقائي']]} /></div>
              </div>
            )}
            {zone?.type === 'widgets' && (
              <div style={{ display: 'grid', gap: 8 }}>
                {WIDGET_META.map(w => {
                  const on = (zone.items || []).includes(w.key)
                  return (
                    <label key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? SG_ACCENT : 'var(--border)'}`, background: on ? `${SG_ACCENT}10` : 'var(--card)' }}>
                      <input type="checkbox" checked={on} onChange={() => onChange({ ...zone, items: on ? zone.items.filter(x => x !== w.key) : [...(zone.items || []), w.key].slice(0, 4) })} />
                      <span style={{ flex: 1, fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-1)' }}>{w.ar}</span>
                      {w.needsLocation && <span style={{ fontSize: '0.64rem', color: 'var(--text-3)', fontWeight: 700 }}>بحسب منطقة المحطة</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const defaultZone = name => (name === 'ticker' ? { type: 'ticker', speed: 'normal' } : name === 'side' ? { type: 'widgets', items: ['clock', 'prayer', 'weather'] } : { type: 'board', mode: 'scheduled', layout: 'columns' })

export default function SceneBuilder({ isAr = true, scene, media, onClose, onDone }) {
  const desk = useMedia('(min-width: 1000px)')
  const c0 = scene?.config
  const [title, setTitle] = useState(scene?.title || '')
  const [duration, setDuration] = useState(scene?.duration_sec || 30)
  const [layout, setLayout] = useState(c0?.layout || 'side_bottom')
  const [theme, setTheme] = useState(c0?.theme || 'nwb')
  const [city, setCity] = useState(c0?.fallback_city || '')
  const [zones, setZones] = useState(c0?.zones || {})
  const [err, setErr] = useState(''); const [saving, setSaving] = useState(false)
  const meta = LAYOUT_META.find(l => l.k === layout)

  const zoneOf = n => zones[n] || defaultZone(n)
  const config = useMemo(() => ({ layout, theme, ...(city ? { fallback_city: city } : {}), zones: Object.fromEntries(meta.zones.map(n => [n, zoneOf(n)])) }), [layout, theme, city, zones]) // eslint-disable-line react-hooks/exhaustive-deps
  const refs = useMemo(() => Object.fromEntries(media.map(m => [m.id, { kind: m.kind, path: m.path, duration: m.duration_sec }])), [media])
  const riyadh = { lat: 24.7136, lng: 46.6753 }

  async function save() {
    setErr('')
    if (!title.trim()) { setErr('اكتب اسماً للمشهد'); return }
    for (const n of meta.zones) {
      const z = zoneOf(n)
      if (z.type === 'media' && !z.media_id) { setErr(`اختر صورة أو فيديو لـ«${ZONE_AR[n]}»`); return }
      if (z.type === 'widgets' && !(z.items || []).length) { setErr(`اختر عنصراً جاهزاً واحداً على الأقل في «${ZONE_AR[n]}»`); return }
    }
    setSaving(true)
    const { error } = await supabase.rpc('signage_scene_save', { p_id: scene?.id || null, p_title: title.trim(), p_config: config, p_duration: Number(duration) || 30 })
    setSaving(false)
    if (error) { setErr(sgError(error, isAr)); return }
    onDone(scene ? 'تم حفظ المشهد' : 'أُضيف المشهد للمكتبة. أنشئ به حملة ليظهر على الشاشات')
  }

  const preview = (
    <div style={{ position: desk ? 'sticky' : 'static', top: 0 }}>
      <div style={{ fontWeight: 900, fontSize: '0.88rem', color: 'var(--text-1)', marginBottom: 8 }}>معاينة حيّة</div>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', border: '2px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <SceneView config={config} refs={refs} tickers={DEMO_TICKERS} lat={riyadh.lat} lng={riyadh.lng} getBoard={demoGetBoard} demo />
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 8, lineHeight: 1.8 }}>المعاينة ببيانات تجريبية للرحلات والشريط، وبإحداثيات الرياض للصلاة والطقس. على الشاشة الفعلية تُستخدم بيانات محطتها.</div>
    </div>
  )

  return (
    <Sheet isAr={isAr} variant="drawer" width={1180} title={scene ? 'تعديل المشهد' : 'مشهد جديد'} icon={Ic.box} accent={SG_ACCENT} onClose={onClose}
      sub="قسّم الشاشة لمناطق واختر محتوى كل منطقة، ثم استخدم المشهد في حملة كأي محتوى آخر."
      footer={<>
        <button type="button" onClick={onClose} style={btn('ghost')}>إلغاء</button>
        <button type="button" disabled={saving} onClick={save} style={{ ...btn('primary'), background: SG_ACCENT, padding: '11px 28px', fontSize: '0.88rem', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'حفظ المشهد'}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: desk ? 'minmax(0, 1fr) 440px' : '1fr', gap: 18, alignItems: 'start' }}>
        {!desk && preview}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Err>{err}</Err>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
            <div><label style={lbl}>اسم المشهد *</label><input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} style={input} placeholder="مثال: شاشة الصالة" /></div>
            <div><label style={lbl}>مدة الظهور (ثانية)</label><input type="number" min="5" max="1800" value={duration} onChange={e => setDuration(e.target.value)} style={input} /></div>
          </div>
          <div>
            <label style={lbl}>تقسيم الشاشة</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {LAYOUT_META.map(l => (
                <button key={l.k} type="button" aria-pressed={layout === l.k} onClick={() => setLayout(l.k)}
                  style={{ padding: 10, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', border: `2px solid ${layout === l.k ? SG_ACCENT : 'var(--border)'}`, background: layout === l.k ? `${SG_ACCENT}10` : 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <LayoutDiagram k={l.k} size={110} />
                  <span style={{ fontWeight: 800, fontSize: '0.76rem', color: layout === l.k ? SG_ACCENT : 'var(--text-2)' }}>{l.ar}</span>
                </button>
              ))}
            </div>
          </div>
          {meta.zones.map(n => <ZoneEditor key={n} name={n} zone={zoneOf(n)} media={media} onChange={z => setZones(s => ({ ...s, [n]: z }))} />)}
          <div style={{ display: 'grid', gridTemplateColumns: desk ? '1fr 1fr' : '1fr', gap: 12 }}>
            <div><label style={lbl}>اللون</label><Seg small value={theme} onChange={setTheme} opts={Object.entries(THEMES).map(([k, v]) => [k, v.name])} /></div>
            <div>
              <label style={lbl}>مدينة احتياطية (للصلاة والطقس)</label>
              <SelectField value={city} onChange={e => setCity(e.target.value)} style={input}>
                <option value="">— بدون (تعتمد على إحداثيات المحطة) —</option>
                {SAUDI_CITIES.map(c => <option key={c.key} value={c.key}>{c.ar}</option>)}
              </SelectField>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4, lineHeight: 1.7 }}>تُستخدم فقط للشاشات التي محطتها بلا إحداثيات في قسم الخريطة.</div>
            </div>
          </div>
        </div>
        {desk && preview}
      </div>
    </Sheet>
  )
}

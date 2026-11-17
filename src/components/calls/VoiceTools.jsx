// أدوات صوت النداء: إعدادات الصوت (الصوت/النموذج/الثبات) مع تجربة فورية + قاموس نطق أسماء المحطات بالتشكيل.
// تعمل مع Edge Function «swift-responder» (ElevenLabs) والمفتاح يبقى بالخادم.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { matchesSearch } from '../../utils/digits'
import ConfirmDialog from '../shared/ConfirmDialog'

const MODELS = [
  ['eleven_multilingual_v2', 'متعدد اللغات v2 (الافتراضي، مستقر)'],
  ['eleven_v3', 'v3 (الأحدث، قد يكون نطقه العربي أوضح)'],
  ['eleven_turbo_v2_5', 'Turbo v2.5 (أسرع)'],
  ['eleven_flash_v2_5', 'Flash v2.5 (الأسرع)'],
]
const SAMPLE = 'نداءٌ على الركابِ المسافرين إلى الرِّيَاضِ، مروراً بحائِل'

export function VoiceSettingsCard({ isAr = true, onTest, onRegenerateAll, busy }) {
  const [s, setS] = useState({ voice_id: '', model_id: 'eleven_multilingual_v2', stability: 0.85, similarity: 0.85 })
  const [state, setState] = useState('loading')   // loading | ready | missing
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false); const [testing, setTesting] = useState(false)
  const [askRegen, setAskRegen] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('call_voice_get')
      if (!alive) return
      if (error) { setState('missing'); return }
      setS({ voice_id: data.voice_id || '', model_id: data.model_id || 'eleven_multilingual_v2', stability: Number(data.stability ?? 0.85), similarity: Number(data.similarity ?? 0.85), by: data.updated_by_name, at: data.updated_at })
      setState('ready')
    })()
    return () => { alive = false }
  }, [])

  if (state === 'loading') return null
  if (state === 'missing') return <div className="cl-note warn">إعدادات الصوت تحتاج تشغيل ملف SQL «035» في Supabase.</div>

  const err = e => (/bad voice id/.test(e?.message || '') ? 'معرّف الصوت غير صالح (أحرف وأرقام إنجليزية فقط، 10 إلى 40)' : /not allowed/.test(e?.message || '') ? 'ليس لديك صلاحية' : 'تعذّر الحفظ')
  async function save() {
    setSaving(true); setMsg('')
    const { error } = await supabase.rpc('call_voice_set', { p_voice: s.voice_id.trim() || null, p_model: s.model_id, p_stability: s.stability, p_similarity: s.similarity })
    setSaving(false); setMsg(error ? err(error) : 'تم الحفظ. المقاطع الجديدة تُولَّد بهذا الصوت.')
  }
  async function test() {
    setTesting(true); setMsg('')
    try { await onTest(SAMPLE, { voiceId: s.voice_id.trim() || undefined, modelId: s.model_id, stability: s.stability, similarity: s.similarity }) } catch (e) { setMsg(e.message || 'تعذّر تشغيل التجربة') }
    setTesting(false)
  }

  return (
    <section className="cl-card" style={{ marginBottom: 14 }}>
      <div className="cl-card-h"><div className="cl-grow"><div className="cl-card-t">إعدادات الصوت</div><div className="cl-card-s">اختر صوتاً عربياً أصيلاً وجرّبه قبل الحفظ، دون إعادة نشر أي شيء</div></div></div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label className="cl-label">معرّف الصوت (Voice ID)</label>
          <input className="cl-input" dir="ltr" value={s.voice_id} onChange={e => setS(x => ({ ...x, voice_id: e.target.value }))} placeholder="مثال: pNInz6obpgDQGcFmaJgB (اتركه فارغاً للصوت الافتراضي)" />
          <p className="cl-hint">الصوت الافتراضي (Adam) إنجليزي ينطق العربية بلكنة. من موقع elevenlabs.io: Voices ← Voice Library، اختر اللغة Arabic، استمع للمعاينات، أضف الصوت لمكتبتك، ثم انسخ Voice ID هنا.</p>
        </div>
        <div>
          <label className="cl-label">النموذج</label>
          <select className="cl-input" value={s.model_id} onChange={e => setS(x => ({ ...x, model_id: e.target.value }))}>{MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="cl-label">الثبات: {s.stability.toFixed(2)}</label><input type="range" min="0" max="1" step="0.05" value={s.stability} onChange={e => setS(x => ({ ...x, stability: Number(e.target.value) }))} style={{ width: '100%' }} /></div>
          <div><label className="cl-label">التشابه مع الصوت: {s.similarity.toFixed(2)}</label><input type="range" min="0" max="1" step="0.05" value={s.similarity} onChange={e => setS(x => ({ ...x, similarity: Number(e.target.value) }))} style={{ width: '100%' }} /></div>
        </div>
        <p className="cl-hint">ثبات أعلى = نطق أوضح وأقل تعبيراً (مناسب للنداء). نموذج v3 يقرّب الثبات إلى 0 أو 0.5 أو 1 تلقائياً. جملة التجربة بالتشكيل: «{SAMPLE}».</p>
        {msg && <div className="cl-note" style={{ margin: 0 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="cl-btn" onClick={test} disabled={testing}>{testing ? 'جارٍ التجربة…' : 'تجربة الصوت'}</button>
          <button type="button" className="cl-btn pri" onClick={save} disabled={saving}>{saving ? '…' : 'حفظ الإعدادات'}</button>
          <button type="button" className="cl-btn" onClick={() => setAskRegen(true)} disabled={!!busy}>إعادة توليد كل المقاطع بالصوت الحالي</button>
        </div>
        {s.at && <p className="cl-hint">آخر تعديل: {s.by || '—'} · {new Date(s.at).toLocaleString('en-GB', { hour12: false, timeZone: 'Asia/Riyadh' })}</p>}
      </div>
      {askRegen && (
        <ConfirmDialog danger={false} title="إعادة توليد المقاطع"
          message="ستُستبدل كل المقاطع الموجودة (العبارتان وأسماء المحطات) بمقاطع جديدة بالصوت المحفوظ، وهذا يستهلك رصيد ElevenLabs لكل مقطع. احفظ الإعدادات أولاً. هل تتابع؟"
          confirmLabel="إعادة التوليد" cancelLabel="إلغاء" onCancel={() => setAskRegen(false)} onConfirm={() => { setAskRegen(false); onRegenerateAll() }} />
      )}
    </section>
  )
}

// قاموس النطق: اكتب الاسم بالتشكيل كما يُنطق، وسيُستخدم عند توليد مقطع المحطة
export function PronunciationEditor({ isAr = true, stations, pron, clipsIndex, onSave, onTest, busyId }) {
  const [q, setQ] = useState(''); const [drafts, setDrafts] = useState({})
  const list = stations.filter(s => !q.trim() || matchesSearch(s.name_ar, q)).slice(0, 40)
  const val = s => drafts[s.id] ?? pron[s.id] ?? ''
  return (
    <section className="cl-card" style={{ marginBottom: 14 }}>
      <div className="cl-card-h"><div className="cl-grow"><div className="cl-card-t">قاموس نطق أسماء المحطات</div><div className="cl-card-s">اكتب الاسم بالتشكيل ليُنطق صحيحاً (مثال: الرِّيَاض، حَائِل، تَبُوك)</div></div></div>
      <input className="cl-input" value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث عن محطة…" style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map(s => {
          const v = val(s), changed = (pron[s.id] || '') !== v.trim()
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 0.7fr) minmax(120px, 1.3fr) auto', gap: 8, alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--text-1)' }}>{s.name_ar}{pron[s.id] && <span className="cl-badge ok" style={{ marginInlineStart: 6 }}>مخصَّص</span>}</div>
              <input className="cl-input" value={v} onChange={e => setDrafts(d => ({ ...d, [s.id]: e.target.value }))} placeholder={s.name_ar} style={{ height: 38, padding: '0 10px' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="cl-btn sm" onClick={() => onTest(v.trim() || s.name_ar)} aria-label="تجربة">تجربة</button>
                <button type="button" className="cl-btn sm pri" disabled={busyId === s.id || (!changed && !!clipsIndex.has(s.id))}
                  onClick={async () => { await onSave(s, v.trim()); setDrafts(d => { const n = { ...d }; delete n[s.id]; return n }) }}>{busyId === s.id ? '…' : 'حفظ وتوليد'}</button>
              </div>
            </div>
          )
        })}
        {list.length === 0 && <p className="cl-hint">لا توجد محطات مطابقة.</p>}
      </div>
    </section>
  )
}

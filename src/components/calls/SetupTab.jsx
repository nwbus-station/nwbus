import { useState, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { matchesSearch } from '../../utils/digits'
import { arabizeStation, hasLatin } from '../../utils/arabizeStation'
import { vocalize } from '../../utils/arabicVocalize'
import { AUDIO_BUCKET, PHRASE_DEFS, activePhrases, stationSpoken, phraseText, clipUrl, generateClip, speakLive, friendlyError, listVoices, chooseVoice, cloneVoice } from '../../utils/callAudio'
import ConfirmDialog from '../shared/ConfirmDialog'
import StatStrip from '../shared/StatStrip'

// أخطاء تُوقف التجهيز كله (إعادة المحاولة لباقي العناصر لا فائدة منها)
const isFatal = msg => /مفتاح|انتهى حدّ|ما عندك صلاحية|انتهت جلسة|غير مضبوط/.test(msg)
const pause = ms => new Promise(r => setTimeout(r, ms))
const preview = path => { const a = new Audio(`${clipUrl(path)}?t=${Date.now()}`); a.play().catch(() => {}) }

function Badge({ ok, okText = 'جاهز', noText = 'ناقص' }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>{ok ? okText : noText}</span>
}

export default function SetupTab({ lib }) {
  const { stations, clipsIndex, phraseClips, stats, refresh, markClip, markPhrase, renameLocal, voice, setVoice, config, saveConfig } = lib
  const [drafts, setDrafts] = useState({})          // { stationId: اسم عربي معدّل }
  const [run, setRun] = useState(null)              // { label, item, done, total } أثناء التجهيز
  const [failed, setFailed] = useState([])          // [{ key, label, error }]
  const [fatal, setFatal] = useState('')
  const [summary, setSummary] = useState('')
  const [confirm, setConfirm] = useState(null)      // { message, onYes }
  const [testState, setTestState] = useState({ busy: false, ok: false, error: '' })
  const [search, setSearch] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [rowBusy, setRowBusy] = useState('')
  const [rowError, setRowError] = useState('')
  const [voices, setVoices] = useState(null)       // null = لم تُحمَّل بعد
  const [voicesBusy, setVoicesBusy] = useState(false)
  const [voiceMsg, setVoiceMsg] = useState({ ok: '', err: '' })
  const [voiceTest, setVoiceTest] = useState('')
  const [voiceChanged, setVoiceChanged] = useState(false)
  const [showClone, setShowClone] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloneFile, setCloneFile] = useState(null)
  const [cloneOk, setCloneOk] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [phraseDrafts, setPhraseDrafts] = useState({})  // { key: نص معدّل }
  const [editPron, setEditPron] = useState(null)         // { id, val }
  const stopRef = useRef(false)
  const uploadTarget = useRef(null)
  const fileRef = useRef(null)

  const latin = useMemo(() => stations.filter(s => hasLatin(s.name_ar)), [stations])
  const suggestion = s => (drafts[s.id] ?? arabizeStation(s.name_ar)).trim()
  const renameList = useMemo(
    () => latin.map(s => ({ id: s.id, name: (drafts[s.id] ?? arabizeStation(s.name_ar)).trim() })).filter(x => x.name && !hasLatin(x.name)),
    [latin, drafts],
  )
  const missingPhrases = activePhrases().filter(p => !phraseClips[p.key])
  const missingClips = stations.filter(s => !clipsIndex.has(s.id))
  const busy = !!run || !!rowBusy
  const allReady = stats.total > 0 && !latin.length && !missingPhrases.length && !missingClips.length

  // ── التجهيز التلقائي الكامل: ترجمة الأسماء ← العبارات ← أصوات المحطات ──
  async function prepareAll() {
    stopRef.current = false
    setFailed([]); setFatal(''); setSummary('')
    const fails = []
    const total = renameList.length + missingPhrases.length + missingClips.length + renameList.filter(r => clipsIndex.has(r.id)).length
    let done = 0
    const step = (label, item) => setRun({ label, item, done, total })
    try {
      // 1) حفظ الأسماء العربية
      const renamed = new Set()
      for (const r of renameList) {
        if (stopRef.current) throw new Error('__stopped__')
        step('حفظ الأسماء العربية', r.name)
        const { error } = await supabase.from('stations').update({ name_ar: r.name }).eq('id', r.id)
        if (error) { fails.push({ key: `n${r.id}`, label: r.name, error: error.message }); done++; continue }
        renameLocal(r.id, r.name); renamed.add(r.id); done++
      }
      // 2) العبارتان الثابتتان
      for (const p of missingPhrases) {
        if (stopRef.current) throw new Error('__stopped__')
        step('العبارات الثابتة', p.text)
        try { await generateClip(p.text, `phrases/${p.key}.mp3`); markPhrase(p.key) }
        catch (e) { const m = friendlyError(e); if (isFatal(m)) throw new Error(m); fails.push({ key: `p${p.key}`, label: p.text, error: m }) }
        done++; await pause(350)
      }
      // 3) أصوات المحطات: الناقصة + التي أُعيدت تسميتها
      const todo = stations
        .map(s => ({ ...s, name_ar: renamed.has(s.id) ? renameList.find(r => r.id === s.id).name : s.name_ar }))
        .filter(s => !clipsIndex.has(s.id) || renamed.has(s.id))
      for (const s of todo) {
        if (stopRef.current) throw new Error('__stopped__')
        step('أصوات المحطات', stationSpoken(s))
        try { await generateClip(stationSpoken(s), `stations/${s.id}.mp3`); markClip(s.id) }
        catch (e) { const m = friendlyError(e); if (isFatal(m)) throw new Error(m); fails.push({ key: `s${s.id}`, label: s.name_ar, error: m }) }
        done++; await pause(350)
      }
      setSummary(fails.length ? `اكتمل التجهيز مع ${fails.length} إخفاق.` : 'اكتمل التجهيز. كل الأصوات جاهزة للنداء.')
    } catch (e) {
      if (e.message === '__stopped__') setSummary('أُوقف التجهيز. ما تم حفظه يبقى، وتقدر تكمل لاحقاً.')
      else setFatal(friendlyError(e))
    }
    setFailed(fails)
    setRun(null)
    await refresh()
  }
  function askPrepare() {
    const parts = []
    if (renameList.length) parts.push(`ترجمة وحفظ ${renameList.length} اسم`)
    if (missingPhrases.length) parts.push(`${missingPhrases.length} عبارة ثابتة`)
    const clips = missingClips.length + renameList.filter(r => clipsIndex.has(r.id)).length
    if (clips) parts.push(`${clips} صوت محطة`)
    setConfirm({
      message: `سيتم: ${parts.join('، ')}. هذا يستهلك من رصيد حسابك في ElevenLabs. متابعة؟`,
      onYes: prepareAll,
    })
  }

  // ── عمليات المحطة الواحدة ──
  async function regenerateStation(s) {
    setRowBusy(s.id); setRowError('')
    try { await generateClip(stationSpoken(s), `stations/${s.id}.mp3`); markClip(s.id) }
    catch (e) { setRowError(`${s.name_ar}: ${friendlyError(e)}`) }
    setRowBusy('')
  }
  async function saveName(s) {
    const name = suggestion(s)
    if (!name || hasLatin(name)) return
    setRowBusy(s.id); setRowError('')
    try {
      const { error } = await supabase.from('stations').update({ name_ar: name }).eq('id', s.id)
      if (error) throw error
      renameLocal(s.id, name)
      setDrafts(p => { const n = { ...p }; delete n[s.id]; return n })
      if (clipsIndex.has(s.id)) await generateClip(stationSpoken({ id: s.id, name_ar: name }), `stations/${s.id}.mp3`)
    } catch (e) { setRowError(`${s.name_ar}: ${friendlyError(e)}`) }
    setRowBusy('')
  }
  async function savePhrase(key, text) {
    setRowBusy(key); setRowError('')
    try {
      await saveConfig({ ...config, phrases: { ...config.phrases, [key]: text.trim() } })
      setPhraseDrafts(p => { const n = { ...p }; delete n[key]; return n })
      if (text.trim()) { await generateClip(text.trim(), `phrases/${key}.mp3`); markPhrase(key) }
    } catch (e) { setRowError(friendlyError(e)) }
    setRowBusy('')
  }
  async function savePron(s, val) {
    setRowBusy(s.id); setRowError('')
    try {
      const pron = { ...config.pron }
      if (val.trim()) pron[s.id] = val.trim(); else delete pron[s.id]
      await saveConfig({ ...config, pron })
      setEditPron(null)
      if (clipsIndex.has(s.id)) { await generateClip(stationSpoken({ id: s.id, name_ar: s.name_ar }), `stations/${s.id}.mp3`); markClip(s.id) }
    } catch (e) { setRowError(`${s.name_ar}: ${friendlyError(e)}`) }
    setRowBusy('')
  }
  async function regeneratePhrase(p) {
    setRowBusy(p.key); setRowError('')
    try { await generateClip(p.text, `phrases/${p.key}.mp3`); markPhrase(p.key) }
    catch (e) { setRowError(friendlyError(e)) }
    setRowBusy('')
  }
  async function uploadRecording(file) {
    const target = uploadTarget.current
    if (!file || !target) return
    setRowBusy(target.id); setRowError('')
    try {
      const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(target.path, file, { upsert: true, contentType: file.type || 'audio/mpeg' })
      if (error) throw error
      await refresh()
    } catch (e) { setRowError(friendlyError(e)) }
    setRowBusy('')
  }
  function pickRecording(id, path) { uploadTarget.current = { id, path }; fileRef.current?.click() }

  async function openVoices() {
    setVoicesBusy(true); setVoiceMsg({ ok: '', err: '' })
    try { setVoices(await listVoices()) }
    catch (e) { setVoiceMsg({ ok: '', err: /Missing text/.test(e.message) ? 'الدالة swift-responder في Supabase قديمة. الصق فيها الكود الجديد ثم أعد المحاولة.' : friendlyError(e) }) }
    setVoicesBusy(false)
  }
  async function doClone() {
    if (!cloneFile || !cloneName.trim() || !cloneOk) return
    if (cloneFile.size > 8 * 1024 * 1024) { setVoiceMsg({ ok: '', err: friendlyError(new Error('Sample too large')) }); return }
    setCloning(true); setVoiceMsg({ ok: '', err: '' })
    try {
      const id = await cloneVoice(cloneName.trim(), cloneFile)
      setVoice({ id, name: cloneName.trim() }); setVoiceChanged(true); setVoices(null)
      setVoiceMsg({ ok: `تم إنشاء الصوت واعتماده: ${cloneName.trim()}`, err: '' })
      setShowClone(false); setCloneName(''); setCloneFile(null); setCloneOk(false)
    } catch (e) { setVoiceMsg({ ok: '', err: /Missing text/.test(e.message) ? 'الدالة swift-responder في Supabase قديمة. الصق فيها الكود الجديد ثم أعد المحاولة.' : friendlyError(e) }) }
    setCloning(false)
  }
  async function tryVoice(v) {
    setVoiceTest(v.voice_id); setVoiceMsg({ ok: '', err: '' })
    try { await speakLive('نداء على الركاب المسافرين إلى الرياض مروراً بالقصيم.', undefined, v.voice_id) }
    catch (e) { setVoiceMsg({ ok: '', err: friendlyError(e) }) }
    setVoiceTest('')
  }
  async function pickVoice(v) {
    setVoicesBusy(true); setVoiceMsg({ ok: '', err: '' })
    try { await chooseVoice(v.voice_id, v.name); setVoice({ id: v.voice_id, name: v.name }); setVoiceChanged(true); setVoiceMsg({ ok: `تم اعتماد الصوت: ${v.name}`, err: '' }) }
    catch (e) { setVoiceMsg({ ok: '', err: /Missing text/.test(e.message) ? 'الدالة swift-responder في Supabase قديمة. الصق فيها الكود الجديد ثم أعد المحاولة.' : friendlyError(e) }) }
    setVoicesBusy(false)
  }
  async function testConnection() {
    setTestState({ busy: true, ok: false, error: '' })
    try { await speakLive('تجربة صوت النداء. نداء على الركاب المسافرين إلى الرياض.'); setTestState({ busy: false, ok: true, error: '' }) }
    catch (e) { setTestState({ busy: false, ok: false, error: friendlyError(e) }) }
  }
  function askRegenerateAll() {
    const have = stations.filter(s => clipsIndex.has(s.id))
    setConfirm({
      message: `إعادة توليد ${have.length} صوت محطة وعبارتين؟ هذا يستبدل الأصوات الحالية (بما فيها التسجيلات المرفوعة يدوياً) ويستهلك من رصيد ElevenLabs.`,
      onYes: async () => {
        stopRef.current = false; setFailed([]); setFatal(''); setSummary('')
        const fails = []; let done = 0; const total = have.length + activePhrases().length
        try {
          for (const p of activePhrases()) {
            if (stopRef.current) throw new Error('__stopped__')
            setRun({ label: 'العبارات الثابتة', item: p.text, done, total })
            try { await generateClip(p.text, `phrases/${p.key}.mp3`); markPhrase(p.key) } catch (e) { const m = friendlyError(e); if (isFatal(m)) throw new Error(m); fails.push({ key: p.key, label: p.text, error: m }) }
            done++; await pause(350)
          }
          for (const s of have) {
            if (stopRef.current) throw new Error('__stopped__')
            setRun({ label: 'أصوات المحطات', item: stationSpoken(s), done, total })
            try { await generateClip(stationSpoken(s), `stations/${s.id}.mp3`) } catch (e) { const m = friendlyError(e); if (isFatal(m)) throw new Error(m); fails.push({ key: s.id, label: s.name_ar, error: m }) }
            done++; await pause(350)
          }
          setSummary(fails.length ? `اكتملت إعادة التوليد مع ${fails.length} إخفاق.` : 'اكتملت إعادة التوليد.')
        } catch (e) { if (e.message === '__stopped__') setSummary('أُوقفت إعادة التوليد.'); else setFatal(friendlyError(e)) }
        setFailed(fails); setRun(null); await refresh()
      },
    })
  }

  const shown = stations.filter(s => matchesSearch(s.name_ar, search))
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0

  return (
    <div className="space-y-4">
      <StatStrip items={[
        { label: 'أسماء عربية', val: `${stats.arabic}/${stats.total}`, tone: stats.total && stats.arabic === stats.total ? 'text-green-600' : undefined },
        { label: 'عبارات ثابتة', val: `${stats.phrases}/${stats.phraseTotal}`, tone: stats.phrases === stats.phraseTotal ? 'text-green-600' : undefined },
        { label: 'أصوات المحطات', val: `${stats.clips}/${stats.total}`, tone: stats.total && stats.clips === stats.total ? 'text-green-600' : undefined },
      ]} />

      {/* البطاقة الرئيسية: زر واحد يجهّز كل شيء */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {run ? (
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">{run.label}</p>
                <p className="text-xs text-gray-500 truncate">{run.item}</p>
              </div>
              <span className="font-mono text-sm text-gray-700 shrink-0">{run.done}/{run.total}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded overflow-hidden"><div className="h-full bg-nwbus-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <button type="button" onClick={() => { stopRef.current = true }} className="mt-3 text-xs px-3 py-1.5 border border-red-200 text-red-600 bg-red-50 rounded font-semibold">إيقاف بعد العنصر الحالي</button>
          </div>
        ) : allReady ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-green-700">كل شيء جاهز</p>
              <p className="text-xs text-gray-500 mt-0.5">أسماء المحطات بالعربية والعبارات وأصوات كل المحطات مولّدة. اذهب إلى تبويب «النداء».</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800">تجهيز الأصوات تلقائياً</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                زر واحد ينفّذ بالترتيب: {latin.length > 0 && 'ترجمة أسماء المحطات الإنجليزية ثم '}توليد العبارتين الثابتتين ثم صوت كل محطة ناقصة. يمكن إيقافه وإكماله لاحقاً.
              </p>
            </div>
            <button type="button" onClick={askPrepare} disabled={busy || stats.total === 0}
              className="px-5 py-2.5 bg-nwbus-primary text-white rounded-lg text-sm font-bold disabled:opacity-40 shrink-0">تجهيز كل شيء</button>
          </div>
        )}

        {fatal && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 leading-relaxed">{fatal}</div>}
        {summary && !run && <p className={`mt-3 text-sm ${failed.length ? 'text-amber-700' : 'text-green-700'}`}>{summary}</p>}
        {failed.length > 0 && !run && (
          <div className="mt-2 border border-amber-200 bg-amber-50 rounded p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">تعذّر تجهيز:</p>
            <ul className="text-xs text-amber-900 space-y-0.5">{failed.slice(0, 8).map(f => <li key={f.key}>{f.label} — {f.error}</li>)}{failed.length > 8 && <li>و{failed.length - 8} أخرى</li>}</ul>
            <button type="button" onClick={askPrepare} disabled={busy} className="mt-2 text-xs px-3 py-1.5 bg-amber-600 text-white rounded font-semibold disabled:opacity-40">إعادة المحاولة للناقص</button>
          </div>
        )}
      </div>

      {/* فحص الاتصال */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800">فحص الصوت</p>
          <p className="text-xs text-gray-500 mt-0.5">يتأكد أن مفتاح ElevenLabs يعمل وتسمع الصوت المستخدم في النداء.</p>
        </div>
        <button type="button" onClick={testConnection} disabled={testState.busy || busy}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 shrink-0">{testState.busy ? 'جارٍ الفحص...' : 'تجربة الصوت'}</button>
        {testState.ok && <p className="w-full text-sm text-green-700">الاتصال سليم.</p>}
        {testState.error && <p className="w-full text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 leading-relaxed">{testState.error}</p>}
      </div>

      {/* صوت المذيع */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800">صوت المذيع</p>
            <p className="text-xs text-gray-500 mt-0.5">الصوت الحالي: <span className="font-semibold text-gray-700">{voice.id ? (voice.name || 'مخصص') : 'الافتراضي (Adam)'}</span></p>
          </div>
          <button type="button" onClick={openVoices} disabled={voicesBusy || busy} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 shrink-0">{voicesBusy && !voices ? 'جارٍ التحميل...' : voices ? 'تحديث القائمة' : 'تغيير الصوت'}</button>
        </div>
        {voiceMsg.err && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 leading-relaxed">{voiceMsg.err}</p>}
        {voiceMsg.ok && <p className="mt-3 text-sm text-green-700">{voiceMsg.ok}</p>}
        {voiceChanged && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 leading-relaxed">
            الأصوات المولّدة سابقاً ما زالت بالصوت القديم. لتطبيق الصوت الجديد عليها اضغط «إعادة توليد كل الأصوات» من الخيارات المتقدمة بالأسفل.
          </div>
        )}
        {voices && (
          <div className="mt-3 border border-gray-200 rounded divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {voices.map(v => {
              const meta = [v.labels?.gender === 'male' ? 'رجالي' : v.labels?.gender === 'female' ? 'نسائي' : '', v.labels?.accent, v.labels?.description || v.labels?.use_case].filter(Boolean).join(' · ')
              const current = voice.id === v.voice_id
              return (
                <div key={v.voice_id} className="flex items-center gap-2 px-3 py-2 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm text-gray-800 font-semibold">{v.name}{current && <span className="text-[11px] text-green-700 ms-2">المعتمد</span>}</p>
                    {meta && <p className="text-[11px] text-gray-400 truncate" dir="ltr">{meta}</p>}
                  </div>
                  {v.preview_url && <button type="button" onClick={() => new Audio(v.preview_url).play().catch(() => {})} className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 shrink-0">عينة</button>}
                  <button type="button" onClick={() => tryVoice(v)} disabled={!!voiceTest || voicesBusy} className="text-xs text-nwbus-primary border border-nwbus-primary rounded px-2 py-1 disabled:opacity-40 shrink-0">{voiceTest === v.voice_id ? '...' : 'تجربة بالعربي'}</button>
                  <button type="button" onClick={() => pickVoice(v)} disabled={current || voicesBusy} className="text-xs bg-nwbus-primary text-white rounded px-3 py-1 disabled:opacity-40 shrink-0">اعتماد</button>
                </div>
              )
            })}
            {voices.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا توجد أصوات في حسابك</p>}
          </div>
        )}
        <button type="button" onClick={() => setShowClone(o => !o)} className="mt-3 text-xs text-nwbus-primary font-semibold underline">{showClone ? 'إخفاء' : 'إضافة صوتي الخاص (استنساخ الصوت واللهجة)'}</button>
        {showClone && (
          <div className="mt-2 border border-gray-200 rounded p-3 space-y-2.5">
            <p className="text-xs text-gray-600 leading-relaxed">ارفع تسجيلاً واضحاً للصوت المطلوب بلهجته (دقيقة إلى 3 دقائق، شخص واحد، بدون موسيقى أو ضجيج). يُنشأ منه صوت جديد يُعتمد للنداء على كل المحطات. يحتاج باقة ElevenLabs تدعم الاستنساخ ومفتاحاً بصلاحية Voices = Write.</p>
            <input value={cloneName} onChange={e => setCloneName(e.target.value)} placeholder="اسم الصوت (مثال: مذيع النداء)" className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
            <label className="block text-xs text-gray-600">ملف العيّنة الصوتية (mp3 أو m4a أو wav، أقل من 8 ميجا)
              <input type="file" accept="audio/*" onChange={e => setCloneFile(e.target.files?.[0] || null)} className="block mt-1 text-xs w-full" />
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
              <input type="checkbox" className="accent-nwbus-primary mt-0.5" checked={cloneOk} onChange={e => setCloneOk(e.target.checked)} />
              أؤكد أن الصوت صوتي أنا، أو لدي موافقة صاحبه على استخدامه في نداء الركاب.
            </label>
            <button type="button" onClick={doClone} disabled={cloning || busy || !cloneFile || !cloneName.trim() || !cloneOk} className="px-4 py-2 bg-nwbus-primary text-white rounded-lg text-sm font-bold disabled:opacity-40">{cloning ? 'جارٍ إنشاء الصوت...' : 'إنشاء واعتماد الصوت'}</button>
          </div>
        )}
        {voices && <p className="text-[11px] text-gray-400 mt-2">«عينة» تسمع الصوت بالإنجليزية مجاناً. «تجربة بالعربي» تنطق جملة نداء بالعربي وتستهلك رصيداً بسيطاً.</p>}
      </div>

      {/* مراجعة الأسماء */}
      {latin.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-bold text-gray-800">أسماء محطات تحتاج ترجمة ({latin.length})</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-3 leading-relaxed">هذه المحطات مكتوبة بالإنجليزية فينطقها الصوت بشكل سيئ. الترجمة المقترحة تُحفظ تلقائياً عند «تجهيز كل شيء»، ويمكنك تعديل أي اسم قبل ذلك.</p>
          <div className="border border-gray-200 rounded divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {latin.map(s => {
              const val = drafts[s.id] ?? arabizeStation(s.name_ar)
              const invalid = hasLatin(val)
              return (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2 flex-wrap">
                  <span className="text-xs text-gray-400 w-full sm:w-1/3 truncate" dir="ltr">{s.name_ar}</span>
                  <input dir="rtl" value={val} onChange={e => setDrafts(p => ({ ...p, [s.id]: e.target.value }))}
                    className={`flex-1 min-w-[140px] border rounded px-2.5 py-1.5 text-sm ${invalid ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`} />
                  <button type="button" onClick={() => saveName(s)} disabled={busy || invalid || !val.trim()}
                    className="text-xs px-3 py-1.5 border border-nwbus-primary text-nwbus-primary rounded font-semibold disabled:opacity-40 shrink-0">حفظ الآن</button>
                </div>
              )
            })}
          </div>
          {latin.some(s => hasLatin(drafts[s.id] ?? arabizeStation(s.name_ar))) && <p className="text-xs text-amber-700 mt-2">اسم يحتوي أحرفاً لاتينية لن يُحفظ؛ اكتبه بالعربية.</p>}
        </div>
      )}

      {/* العبارات والمحطات */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-bold text-gray-800 mb-2">العبارات الثابتة</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {PHRASE_DEFS.map(p => {
            const cur = phraseText(p.key)
            const draft = phraseDrafts[p.key] ?? cur
            const changed = draft.trim() !== cur
            return (
              <div key={p.key} className="border border-gray-200 rounded px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-400">{p.ar}</p>
                  {cur ? <Badge ok={phraseClips[p.key]} /> : <span className="text-[11px] text-gray-500 border border-gray-200 rounded px-2 py-0.5">محذوفة من النداء</span>}
                </div>
                <input value={draft} onChange={e => setPhraseDrafts(d => ({ ...d, [p.key]: e.target.value }))} disabled={busy}
                  placeholder="(فارغ = بدون هذه العبارة)" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm" />
                <div className="flex items-center gap-2 flex-wrap">
                  {changed && <button type="button" onClick={() => savePhrase(p.key, draft)} disabled={busy} className="text-xs bg-nwbus-primary text-white rounded px-3 py-1 disabled:opacity-40">{draft.trim() ? 'حفظ وتوليد الصوت' : 'حذف العبارة'}</button>}
                  {changed && <button type="button" onClick={() => setPhraseDrafts(d => { const n = { ...d }; delete n[p.key]; return n })} className="text-xs text-gray-500">تراجع</button>}
                  {!changed && cur && phraseClips[p.key] && <button type="button" onClick={() => preview(`phrases/${p.key}.mp3`)} className="text-xs text-nwbus-primary font-semibold">استماع</button>}
                  {!changed && cur && <button type="button" onClick={() => regeneratePhrase({ key: p.key, text: cur })} disabled={busy} className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 disabled:opacity-40">{phraseClips[p.key] ? 'إعادة' : 'توليد'}</button>}
                  {!changed && !cur && <button type="button" onClick={() => savePhrase(p.key, p.text)} disabled={busy} className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 disabled:opacity-40">استعادة الافتراضي</button>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-bold text-gray-800">أصوات المحطات</p>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن محطة..." className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm" />
        </div>
        {rowError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2.5 mb-2 leading-relaxed">{rowError}</div>}
        <div className="border border-gray-200 rounded divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {shown.map(s => {
            const has = clipsIndex.has(s.id)
            return (
              <div key={s.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{s.name_ar}</p>
                  {!hasLatin(s.name_ar) && <p className="text-[11px] text-gray-400 truncate" title="كما يُنطق في النداء">{config.pron[s.id] ? 'نطق مخصص: ' : ''}{vocalize(stationSpoken(s))}</p>}
                </div>
                <Badge ok={has} />
                {has && <button type="button" onClick={() => preview(`stations/${s.id}.mp3`)} className="text-xs text-nwbus-primary font-semibold shrink-0">استماع</button>}
                <button type="button" onClick={() => regenerateStation(s)} disabled={busy || hasLatin(s.name_ar)} title={hasLatin(s.name_ar) ? 'ترجم الاسم أولاً' : ''}
                  className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 disabled:opacity-40 shrink-0">{rowBusy === s.id ? '...' : has ? 'إعادة' : 'توليد'}</button>
                {!hasLatin(s.name_ar) && <button type="button" onClick={() => setEditPron(e => (e?.id === s.id ? null : { id: s.id, val: config.pron[s.id] || '' }))} disabled={busy} className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 disabled:opacity-40 shrink-0">نطق</button>}
                {showAdvanced && <button type="button" onClick={() => pickRecording(s.id, `stations/${s.id}.mp3`)} disabled={busy} className="text-xs text-gray-600 border border-gray-300 rounded px-2 py-1 disabled:opacity-40 shrink-0">رفع تسجيل</button>}
              </div>
              {editPron?.id === s.id && (
                <div className="mt-2 bg-slate-50 border border-gray-200 rounded p-2.5 space-y-2">
                  <p className="text-[11px] text-gray-500 leading-relaxed">اكتب الكلمة بالشكل الذي تريد أن تُنطق به (يمكنك التشكيل، مثل: تَبُوك). اتركها فارغة للعودة إلى الاسم الأصلي. عند الحفظ يُعاد توليد صوت المحطة.</p>
                  <div className="flex items-center gap-2">
                    <input dir="rtl" value={editPron.val} onChange={e => setEditPron({ id: s.id, val: e.target.value })} placeholder={stationSpoken({ id: s.id, name_ar: s.name_ar })} className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-sm" />
                    <button type="button" onClick={() => savePron(s, editPron.val)} disabled={busy} className="text-xs bg-nwbus-primary text-white rounded px-3 py-1.5 disabled:opacity-40">حفظ</button>
                    <button type="button" onClick={() => setEditPron(null)} className="text-xs text-gray-500">إلغاء</button>
                  </div>
                </div>
              )}
              </div>
            )
          })}
          {shown.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا توجد محطات</p>}
        </div>
      </div>

      {/* خيارات متقدمة */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <button type="button" onClick={() => setShowAdvanced(o => !o)} className="flex items-center justify-between w-full text-start">
          <span className="text-sm font-bold text-gray-800">خيارات متقدمة</span>
          <span className="text-xs text-gray-400">{showAdvanced ? 'إخفاء' : 'إظهار'}</span>
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3 text-xs text-gray-600 leading-relaxed">
            <p><span className="font-semibold">رفع تسجيل صوتي:</span> إذا أردت صوتاً مسجّلاً بصوتك أو صوت آخر لمحطة معينة بدل الصوت الآلي، اضغط «رفع تسجيل» بجانبها واختر ملف صوت (mp3). يستبدل الصوت الحالي لتلك المحطة فقط.</p>
            <p><span className="font-semibold">إعادة توليد الكل:</span> استخدمها بعد تغيير صوت ElevenLabs أو تحسين التشكيل. تستبدل كل الأصوات الحالية.</p>
            <button type="button" onClick={askRegenerateAll} disabled={busy || !clipsIndex.size}
              className="px-4 py-2 border border-nwbus-primary text-nwbus-primary rounded font-semibold disabled:opacity-40">إعادة توليد كل الأصوات</button>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="audio/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadRecording(f) }} />

      {confirm && (
        <ConfirmDialog danger={false} message={confirm.message} confirmLabel="متابعة" cancelLabel="إلغاء"
          onConfirm={() => { const fn = confirm.onYes; setConfirm(null); fn() }} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}

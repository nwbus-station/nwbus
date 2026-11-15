import { matchesSearch } from '../../utils/digits'
import { arabizeStation, hasLatin } from '../../utils/arabizeStation'

// مكتبة المقاطع الصوتية الجاهزة — عرض فقط؛ كل الحالة والعمليات تأتي من CallPage عبر props
const PHRASES = [
  { key: 'intro', ar: 'عبارة المقدمة', en: 'Intro phrase', text: 'نداء على الركاب المسافرين إلى' },
  { key: 'via', ar: 'عبارة "مروراً بـ"', en: '"Via" phrase', text: 'مروراً بـ' },
]

export default function ClipsLibrary({
  isAr, phraseClips, clipsIndex, allStations, stationSearch, onStationSearch, uploadingId, bulkProgress, renaming,
  nameDrafts, onNameDraft, onUploadPhrase, onGeneratePhrase, onUploadStation, onGenerateStation, onGenerateAll, onAskRename, onPlay,
}) {
  const latin = allStations.filter(s => hasLatin(s.name_ar))
  const draftOf = s => nameDrafts[s.id] ?? arabizeStation(s.name_ar)
  const ready = latin.map(s => ({ id: s.id, name: draftOf(s).trim() })).filter(x => x.name && !hasLatin(x.name))
  const doneCount = allStations.filter(s => clipsIndex.has(s.id)).length

  return (
    <div className="cl-lib">
      <p className="cl-lib-info">
        {isAr
          ? 'اضغط "توليد" يسوّي الصوت تلقائياً عبر ElevenLabs ويحفظه مباشرة (نفس صوت صفحة النداء) — أو ارفع ملف mp3 جاهز بنفسك لو تبي تستبدله بتسجيل يدوي. عبارتين ثابتتين + اسم كل محطة، مرة وحدة بس، وتُستخدم دايماً بنفس الجودة.'
          : 'Click "Generate" to create the audio automatically via ElevenLabs and save it directly (same voice as the announcement page) — or upload a ready-made mp3 file yourself to replace it with a manual recording. Two fixed phrases + each station name, once only, always used at the same quality.'}
      </p>

      <div className="cl-phrases">
        {PHRASES.map(p => (
          <div key={p.key} className="cl-phrase">
            <div className="cl-phrase-h">
              <span>{isAr ? p.ar : p.en} ({p.text})</span>
              <span className={`cl-badge ${phraseClips[p.key] ? 'ok' : 'no'}`}>
                {phraseClips[p.key] ? (isAr ? 'مرفوع' : 'Uploaded') : (isAr ? 'غير مرفوع' : 'Not uploaded')}
              </span>
            </div>
            <div className="cl-phrase-b">
              <button type="button" className="cl-btn sm pri" onClick={() => onGeneratePhrase(p.key, p.text)} disabled={uploadingId === p.key}>
                {uploadingId === p.key ? (isAr ? 'جارٍ...' : 'Working...') : (isAr ? 'توليد' : 'Generate')}
              </button>
              <input type="file" accept="audio/*" disabled={uploadingId === p.key} className="cl-file"
                onChange={e => { const f = e.target.files?.[0]; if (f) onUploadPhrase(p.key, f); e.target.value = '' }} />
              {phraseClips[p.key] && <button type="button" className="cl-btn sm" onClick={() => onPlay(`phrases/${p.key}.mp3`)}>{isAr ? 'تشغيل' : 'Play'}</button>}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="cl-lib-bar">
          <input value={stationSearch} onChange={e => onStationSearch(e.target.value)} className="cl-input" style={{ flex: 1 }}
            placeholder={isAr ? 'ابحث عن محطة...' : 'Search for a station...'} aria-label={isAr ? 'بحث عن محطة' : 'Search stations'} />
          <button type="button" className="cl-btn pri" onClick={onGenerateAll} disabled={!!bulkProgress || allStations.length === 0}>
            {bulkProgress ? (isAr ? `جارٍ التوليد ${bulkProgress.done}/${bulkProgress.total}...` : `Generating ${bulkProgress.done}/${bulkProgress.total}...`) : (isAr ? 'توليد كل الناقص' : 'Generate all missing')}
          </button>
        </div>
        {allStations.length > 0 && (
          <p className="cl-hint" style={{ margin: '0 0 8px' }}>{isAr ? `مقاطع المحطات الجاهزة: ${doneCount} من ${allStations.length}` : `Station clips ready: ${doneCount} of ${allStations.length}`}</p>
        )}

        {latin.length > 0 && (
          <div className="cl-fix">
            <p>
              {isAr
                ? `${latin.length} محطة اسمها بالإنجليزية فيُنطق بشكل سيء في النداء. اقترحت لها أسماء عربية — راجعها أو عدّلها في الحقول أدناه ثم احفظ.`
                : `${latin.length} stations have English names, which sound poor in announcements. Arabic suggestions are filled in below — review, edit, then save.`}
            </p>
            <button type="button" className="cl-btn sm warn" disabled={!ready.length || !!renaming} onClick={() => onAskRename(ready)}>
              {isAr ? `حفظ المقترحات المكتملة (${ready.length})` : `Save completed suggestions (${ready.length})`}
            </button>
          </div>
        )}

        <div className="cl-lib-rows">
          {allStations.filter(s => matchesSearch(s.name_ar, stationSearch)).map(s => (
            <div key={s.id} className="cl-lib-row">
              {hasLatin(s.name_ar) ? (
                <div className="cl-lib-edit">
                  <span className="cl-lib-old" dir="ltr">{s.name_ar}</span>
                  <input dir="rtl" value={draftOf(s)} onChange={e => onNameDraft(s.id, e.target.value)}
                    className={`cl-input ${hasLatin(draftOf(s)) ? 'bad' : ''}`} />
                  <button type="button" className="cl-btn sm warn" disabled={!!renaming || !draftOf(s).trim()}
                    onClick={() => onAskRename([{ id: s.id, name: draftOf(s).trim() }])}>{isAr ? 'حفظ الاسم' : 'Save name'}</button>
                </div>
              ) : (
                <span className="cl-lib-name">{s.name_ar}</span>
              )}
              <span className={`cl-badge ${clipsIndex.has(s.id) ? 'ok' : 'mute'}`}>{clipsIndex.has(s.id) ? (isAr ? 'جاهز' : 'Ready') : (isAr ? 'بدون صوت' : 'No audio')}</span>
              {clipsIndex.has(s.id) && <button type="button" className="cl-btn sm" onClick={() => onPlay(`stations/${s.id}.mp3`)}>{isAr ? 'تشغيل' : 'Play'}</button>}
              <button type="button" className="cl-btn sm pri" onClick={() => onGenerateStation(s)} disabled={uploadingId === s.id || !!bulkProgress}>
                {uploadingId === s.id ? '...' : (isAr ? 'توليد' : 'Generate')}
              </button>
              <input type="file" accept="audio/*" disabled={uploadingId === s.id} className="cl-file sm"
                onChange={e => { const f = e.target.files?.[0]; if (f) onUploadStation(s.id, f); e.target.value = '' }} />
            </div>
          ))}
          {allStations.length === 0 && <p className="cl-empty">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>}
        </div>
      </div>
    </div>
  )
}

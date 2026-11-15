import SelectField from '../shared/SelectField'

// الخطوة 3: لوحة النداء — الحالة + الوجهة + النص + خيارات الصوت والتكرار + أزرار التشغيل
export default function AnnounceConsole({
  isAr, mode, text, onText, clipsMode, destName, viaNames, status, repeatLabel,
  chimeOn, onChime, chimeSupported, onTestChime,
  repeatEvery, onRepeat, repeatOptions, repeating, playing,
  voiceURI, voiceOptions, onVoice, showTestVoice, onTestVoice, needsBrowserTts, ttsSupported, hasDeviceVoices,
  clipsCheck, onOpenLibrary, announceDisabled, onAnnounce, onStop,
}) {
  const live = status !== 'idle'
  const statusTitle = status === 'repeat' ? (isAr ? 'نداء متكرر نشط' : 'Repeating announcement active')
    : status === 'playing' ? (isAr ? 'جارٍ النداء الآن' : 'Announcing now')
    : (isAr ? 'جاهز للنداء' : 'Ready to announce')
  const statusSub = status === 'repeat' ? repeatLabel : (isAr ? 'لا يوجد نداء قيد التشغيل' : 'No announcement is playing')
  const goLabel = repeating ? (isAr ? 'جارٍ النداء المتكرر...' : 'Repeating announcement...') : playing ? (isAr ? 'جارٍ النداء...' : 'Announcing...') : (isAr ? 'نداء' : 'Announce')

  return (
    <section className="cl-card" aria-label={isAr ? 'لوحة النداء' : 'Announcement console'}>
      <div className="cl-card-h">
        <span className="cl-step" aria-hidden="true">3</span>
        <div className="cl-grow">
          <div className="cl-card-t">{isAr ? 'لوحة النداء' : 'Announcement console'}</div>
          <div className="cl-card-s">{isAr ? 'راجع النص واختر الصوت ثم نفّذ النداء' : 'Review the text, choose the voice, then announce'}</div>
        </div>
      </div>

      <div className={`cl-status ${live ? 'live' : ''}`} role="status" aria-live="polite">
        <span className="cl-eq" aria-hidden="true"><i /><i /><i /><i /></span>
        <div>
          <div className="cl-st-t">{statusTitle}</div>
          <div className="cl-st-s">{statusSub}</div>
        </div>
      </div>

      {mode === 'trip' && (
        <div className="cl-target">
          <div className="cl-target-k">{isAr ? 'الوجهة المُعلن عنها' : 'Announced destination'}</div>
          <div className="cl-target-v">{destName || (isAr ? 'لم تُحدَّد بعد' : 'Not set yet')}</div>
          {viaNames.length > 0 && (
            <div className="cl-chips" aria-label={isAr ? 'مروراً بـ' : 'Via'}>
              {viaNames.map(n => <span key={n} className="cl-chip">{n}</span>)}
            </div>
          )}
        </div>
      )}

      <label className="cl-label" htmlFor="cl-text">{isAr ? 'نص النداء' : 'Announcement text'}</label>
      <textarea id="cl-text" value={text} onChange={e => onText(e.target.value)} rows={3} className="cl-input"
        placeholder={mode === 'free'
          ? (isAr ? 'اكتب نص النداء هنا...' : 'Type the announcement text here...')
          : (isAr ? 'اختر رحلة ووجهة ليتم تعبئة النص تلقائياً، وتقدر تعدّله' : 'Select a trip and destination to auto-fill the text; you can edit it')}
        disabled={clipsMode} />
      {clipsMode && (
        <p className="cl-hint">{isAr ? 'وضع المقاطع الجاهزة ما يستخدم هذا النص — يشغّل مقاطع المحطات المختارة مباشرة.' : 'Ready-made clips mode does not use this text — it plays the clips of the selected stations.'}</p>
      )}

      {clipsCheck && (
        <div className={`cl-ready ${clipsCheck.length ? 'no' : 'ok'}`}>
          <span>
            {clipsCheck.length
              ? (isAr ? `ناقص ${clipsCheck.length} مقطع صوت: ${clipsCheck.join('، ')}` : `Missing ${clipsCheck.length} audio clip(s): ${clipsCheck.join(', ')}`)
              : (isAr ? 'كل المقاطع المطلوبة لهذا النداء جاهزة' : 'All clips needed for this announcement are ready')}
          </span>
          {clipsCheck.length > 0 && <button type="button" className="cl-btn sm" onClick={onOpenLibrary}>{isAr ? 'فتح المكتبة' : 'Open library'}</button>}
        </div>
      )}

      <div className="cl-opts">
        <div className="cl-opt-row">
          <span className="cl-opt-k">{isAr ? 'صوت النداء:' : 'Announcement voice:'}</span>
          <SelectField value={voiceURI} onChange={onVoice} className="cl-sel border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0">
            {voiceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectField>
          {showTestVoice && (
            <button type="button" className="cl-btn sm" onClick={onTestVoice} disabled={needsBrowserTts && !ttsSupported}>{isAr ? 'تجربة' : 'Test'}</button>
          )}
        </div>
        {!hasDeviceVoices && ttsSupported && (
          <p className="cl-hint" style={{ margin: 0 }}>
            {isAr
              ? 'ما وجدنا صوت عربي إضافي مثبّت بهذا الجهاز — استخدم مقاطع جاهزة أو ElevenLabs، أو ثبّت صوت عربي من إعدادات الجهاز.'
              : 'No additional Arabic voice is installed on this device — use ready-made clips or ElevenLabs, or install an Arabic voice from the device settings.'}
          </p>
        )}
        <div className="cl-opt-row">
          <label className="cl-check">
            <input type="checkbox" checked={chimeOn} onChange={e => onChime(e.target.checked)} />
            {isAr ? 'نغمة قبل النداء' : 'Chime before announcement'}
          </label>
        </div>
        <div className="cl-opt-row">
          <label>{isAr ? 'تكرار النداء:' : 'Repeat announcement:'}</label>
          <SelectField value={repeatEvery} onChange={onRepeat} disabled={repeating} className="cl-sel border rounded-lg px-2 py-1.5 text-sm">
            {repeatOptions.map(o => <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>)}
          </SelectField>
        </div>
      </div>

      <div className="cl-actions">
        <button type="button" onClick={onAnnounce} disabled={announceDisabled} className="cl-btn pri cl-go">{goLabel}</button>
        {(playing || repeating) && (
          <button type="button" onClick={onStop} className="cl-btn stop">{isAr ? 'إيقاف' : 'Stop'}</button>
        )}
        {chimeOn && (
          <button type="button" onClick={onTestChime} disabled={!chimeSupported} className="cl-btn">{isAr ? 'تجربة النغمة' : 'Test chime'}</button>
        )}
      </div>
    </section>
  )
}

// الخطوة 2: اختيار المحطات والتوقفات — آخر محطة مفعّلة هي الوجهة المُعلن عنها
export default function StopsPanel({ isAr, hasTrip, loading, stops, stopOff, onToggle, onAll, onNone, destId, showAudio, clipsIndex }) {
  return (
    <section className="cl-card" aria-label={isAr ? 'المحطات والتوقفات' : 'Stations and stops'}>
      <div className="cl-card-h">
        <span className="cl-step" aria-hidden="true">2</span>
        <div className="cl-grow">
          <div className="cl-card-t">{isAr ? 'المحطات والتوقفات' : 'Stations and stops'}</div>
          <div className="cl-card-s">{isAr ? 'آخر محطة مفعّلة هي الوجهة المُعلن عنها' : 'The last enabled station is the announced destination'}</div>
        </div>
        {hasTrip && (
          <>
            <button type="button" onClick={onAll} className="cl-link">{isAr ? 'الكل' : 'All'}</button>
            <button type="button" onClick={onNone} className="cl-link mute">{isAr ? 'لا شيء' : 'None'}</button>
          </>
        )}
      </div>
      {!hasTrip ? (
        <div className="cl-empty big">
          <b>{isAr ? 'لم تختر رحلة بعد' : 'No trip selected'}</b>
          <span>{isAr ? 'اختر رحلة من القائمة لتظهر محطاتها هنا' : 'Pick a trip from the list to see its stations here'}</span>
        </div>
      ) : loading ? (
        <p className="cl-empty">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
      ) : (
        <div className="cl-list tall" style={{ marginTop: 0 }}>
          {stops.map((s, i) => (
            <label key={s.id} className={`cl-stop ${!stopOff[s.id] ? 'on' : ''}`}>
              <input type="checkbox" checked={!stopOff[s.id]} onChange={() => onToggle(s.id)} />
              <span className="cl-sn">
                {s.name}{s.rest ? (isAr ? ' (استراحة)' : ' (Rest stop)') : ''}
                {i === 0 && <span className="cl-badge org">{isAr ? 'المنشأ' : 'Origin'}</span>}
                {s.id === destId && <span className="cl-badge dst">{isAr ? 'الوجهة' : 'Destination'}</span>}
                {showAudio && (
                  <span className={`cl-badge ${clipsIndex.has(s.id) ? 'ok' : 'no'}`}>
                    {clipsIndex.has(s.id) ? (isAr ? 'صوت جاهز' : 'Audio ready') : (isAr ? 'بدون صوت' : 'No audio')}
                  </span>
                )}
              </span>
              <span className="cl-tt">{s.time ? s.time.slice(0, 5) : ''}</span>
            </label>
          ))}
          {stops.length === 0 && <p className="cl-empty">{isAr ? 'لا توجد نقاط توقف مسجّلة لهذه الرحلة' : 'No stops are recorded for this trip'}</p>}
        </div>
      )}
    </section>
  )
}

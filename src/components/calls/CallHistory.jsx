// سجل نداءات الجلسة الحالية (واجهة فقط — يُمسح عند تحديث الصفحة)
const pad = n => String(n).padStart(2, '0')
const fmt = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

export default function CallHistory({ isAr, items, onReuse, onClear }) {
  const kindLabel = k => k === 'clips' ? (isAr ? 'مقاطع جاهزة' : 'Ready clips') : k === 'eleven' ? 'ElevenLabs' : (isAr ? 'صوت الجهاز' : 'Device voice')
  return (
    <section className="cl-card" aria-label={isAr ? 'سجل النداءات' : 'Announcement history'}>
      <div className="cl-card-h">
        <div className="cl-grow">
          <div className="cl-card-t">{isAr ? 'سجل نداءات الجلسة' : 'Session announcements'}</div>
          <div className="cl-card-s">{isAr ? 'آخر النداءات المنفّذة منذ فتح الصفحة' : 'Announcements made since this page was opened'}</div>
        </div>
        {items.length > 0 && <button type="button" onClick={onClear} className="cl-link mute">{isAr ? 'مسح' : 'Clear'}</button>}
      </div>
      {items.length === 0 ? (
        <p className="cl-empty" style={{ padding: '10px 0' }}>{isAr ? 'لم يُنفَّذ أي نداء بعد' : 'No announcements yet'}</p>
      ) : (
        <div className="cl-hist">
          {items.map(h => (
            <div key={h.id} className="cl-h-item">
              <span className="cl-h-time">{fmt(h.at)}</span>
              <div className="cl-h-b">
                <div className="cl-h-t">{h.dest || h.text || (isAr ? 'نداء' : 'Announcement')}</div>
                <div className="cl-h-s">
                  {h.trip ? `${isAr ? 'رحلة' : 'Trip'} ${h.trip} · ` : ''}{kindLabel(h.kind)}
                </div>
              </div>
              {h.text && <button type="button" className="cl-btn sm" onClick={() => onReuse(h.text)}>{isAr ? 'إعادة النص' : 'Reuse text'}</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

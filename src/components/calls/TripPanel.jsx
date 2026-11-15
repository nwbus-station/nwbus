// الخطوة 1: اختيار الرحلة (بحث + قائمة) — عرض فقط، حالة الصفحة تأتي من CallPage
export default function TripPanel({ isAr, query, onQuery, loading, trips, total, selectedId, onSelect }) {
  const arrow = isAr ? '←' : '→'
  return (
    <section className="cl-card" aria-label={isAr ? 'اختيار الرحلة' : 'Trip selection'}>
      <div className="cl-card-h">
        <span className="cl-step" aria-hidden="true">1</span>
        <div className="cl-grow">
          <div className="cl-card-t">{isAr ? 'الرحلة' : 'Trip'}</div>
          <div className="cl-card-s">{isAr ? `${total} رحلة فعّالة` : `${total} active trips`}</div>
        </div>
      </div>
      <input value={query} onChange={e => onQuery(e.target.value)} className="cl-input"
        aria-label={isAr ? 'بحث عن رحلة' : 'Search trips'}
        placeholder={isAr ? 'ابحث برقم الرحلة أو الخط أو المحطة...' : 'Search by trip number, route or station...'} />
      {loading ? (
        <p className="cl-empty">{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
      ) : (
        <div className="cl-list">
          {trips.map(t => (
            <button key={t.id} type="button" onClick={() => onSelect(t.id)} className={`cl-trip ${selectedId === t.id ? 'on' : ''}`}>
              <span className="cl-tn">{t.trip_number}</span>
              <span className="cl-tb">
                <span className="cl-tr" style={{ display: 'block' }}>{t.from_station?.name_ar || '—'} {arrow} {t.to_station?.name_ar || '—'}</span>
                {t.route && <span className="cl-tm" style={{ display: 'block' }}>{isAr ? `خط ${t.route}` : `Route ${t.route}`}</span>}
              </span>
              <span className="cl-tt">{t.scheduled_departure ? t.scheduled_departure.slice(0, 5) : ''}</span>
            </button>
          ))}
          {trips.length === 0 && <p className="cl-empty">{isAr ? 'لا يوجد نتائج' : 'No results'}</p>}
        </div>
      )}
    </section>
  )
}

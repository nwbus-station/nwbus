// شريط التصفية لقوائم الطلبات
// الكمبيوتر: بحث بالموظف + حالة بأعداد + نوع الطلب. الجوال: أزرار الحالة كما كانت.
const ST = {
  ar: [['all', 'الكل'], ['pending', 'قيد المراجعة'], ['approved', 'مقبولة'], ['rejected', 'مرفوضة']],
  en: [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']],
}

export default function LeaveFilterBar({ desk, isAr = true, status, setStatus, counts, query, setQuery, type, setType, types, shown, showSearch }) {
  const list = isAr ? ST.ar : ST.en

  if (!desk) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {list.map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)}
            style={{ padding: '5px 16px', borderRadius: 8, border: `1.5px solid ${status === v ? '#1C2B4A' : 'var(--border)'}`, background: status === v ? '#1C2B4A' : 'var(--card)', color: status === v ? '#fff' : 'var(--text-3)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {l}
          </button>
        ))}
      </div>
    )
  }

  const field = { padding: '10px 13px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: '0.92rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 14px', marginBottom: 18 }}>
      <div role="group" aria-label={isAr ? 'تصفية بالحالة' : 'Filter by status'} style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 11, padding: 4 }}>
        {list.map(([v, l]) => {
          const on = status === v
          return (
            <button key={v} type="button" onClick={() => setStatus(v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: on ? 800 : 600, background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-3)', boxShadow: on ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}>
              {l}
              <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: '0.76rem', fontWeight: 800, color: on ? '#EE712D' : 'var(--text-3)' }}>{counts?.[v] ?? 0}</span>
            </button>
          )
        })}
      </div>
      <span style={{ flex: 1 }} />
      {showSearch && (
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={isAr ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search name or job number...'}
          style={{ ...field, width: 'clamp(220px, 24vw, 340px)' }} />
      )}
      <select value={type} onChange={e => setType(e.target.value)} aria-label={isAr ? 'نوع الطلب' : 'Request type'} style={{ ...field, minWidth: 170, cursor: 'pointer' }}>
        <option value="all">{isAr ? 'كل الأنواع' : 'All types'}</option>
        {types.map(t => <option key={t.id} value={t.id}>{t.ar}</option>)}
      </select>
      <span style={{ fontSize: '0.84rem', color: 'var(--text-3)', fontWeight: 700 }}>{isAr ? `${shown} طلب معروض` : `${shown} shown`}</span>
    </div>
  )
}

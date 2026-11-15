// شريط تبويبات صفحة الإجازات: أزرار مقسّمة (segmented) — عريضة على الكمبيوتر، قابلة للتمرير أفقياً على الجوال
export default function LeaveTabs({ tabs, tab, onChange, desk, countFor, isAr = true }) {
  return (
    <nav role="tablist" aria-label={isAr ? 'أقسام الإجازات' : 'Leave sections'}
      style={{ display: 'flex', gap: desk ? 6 : 4, overflowX: 'auto', padding: desk ? 6 : 4, marginBottom: desk ? 20 : 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: desk ? 16 : 12, scrollbarWidth: 'none' }}>
      {tabs.map(t => {
        const on = tab === t.id
        const count = on ? countFor?.(t.id) : null
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            style={{
              flex: desk ? '1 1 0' : '0 0 auto', maxWidth: desk ? 260 : 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: desk ? '12px 22px' : '9px 14px', borderRadius: desk ? 11 : 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              background: on ? '#1C2B4A' : 'transparent', color: on ? '#fff' : 'var(--text-2)',
              fontSize: desk ? '0.96rem' : '0.82rem', fontWeight: on ? 800 : 700, transition: 'background .15s, color .15s',
            }}>
            {isAr ? t.ar : t.en}
            {count > 0 && (
              <span style={{ fontSize: desk ? '0.76rem' : '0.66rem', fontWeight: 800, background: '#EE712D', color: '#fff', borderRadius: 99, padding: '1px 9px', minWidth: 22, textAlign: 'center' }}>{count}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

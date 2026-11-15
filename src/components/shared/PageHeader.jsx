// ترويسة صفحة موحّدة (الإجازات، التقييم، السجل الوظيفي...): عنوان + وصف + إجراءات + شريط مؤشرات
// الكمبيوتر: بطاقة عريضة بشريط لوني علوي ومؤشرات ملوّنة؛ الجوال: مضغوطة.
import { useMedia } from '../dispatch/Sheet'

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

/**
 * title, subtitle, accent (لون الشريط)، actions: عقد React (أزرار)، stats: [{ label, value, hint?, color?, onClick? }]
 */
export default function PageHeader({ title, subtitle, accent = '#5B5BD6', actions, stats, children }) {
  const desk = useMedia('(min-width: 900px)')
  return (
    <header style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: desk ? 18 : 14, overflow: 'hidden', marginBottom: desk ? 20 : 12 }}>
      <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: desk ? '22px 26px' : '14px 14px' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: desk ? '1.55rem' : '1.1rem', fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-.01em' }}>{title}</h1>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: desk ? '0.9rem' : '0.76rem', color: 'var(--text-3)', lineHeight: 1.7, fontWeight: 500 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
      </div>
      {stats?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, desk ? 6 : 3)}, minmax(0, 1fr))`, borderTop: '1px solid var(--border)' }}>
          {stats.map((s, i) => {
            const Tag = s.onClick ? 'button' : 'div'
            return (
              <Tag key={i} type={s.onClick ? 'button' : undefined} onClick={s.onClick}
                style={{ textAlign: 'start', padding: desk ? '16px 24px' : '10px 12px', background: 'transparent', border: 'none', borderInlineStart: i ? '1px solid var(--border)' : 'none', cursor: s.onClick ? 'pointer' : 'default', fontFamily: 'inherit', minWidth: 0 }}>
                <div style={{ fontSize: desk ? '1.7rem' : '1.2rem', fontWeight: 900, lineHeight: 1.1, color: s.color || 'var(--text-1)', fontFamily: MONO }}>{s.value ?? '—'}</div>
                <div style={{ fontSize: desk ? '0.8rem' : '0.66rem', fontWeight: 800, color: 'var(--text-2)', marginTop: 5 }}>{s.label}</div>
                {s.hint && desk && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{s.hint}</div>}
              </Tag>
            )
          })}
        </div>
      )}
      {children}
    </header>
  )
}

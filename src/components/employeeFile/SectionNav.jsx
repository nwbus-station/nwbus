// شريط انتقال سريع بين أقسام الملف (كمبيوتر فقط): يبقى ثابتاً أعلى عمود المحتوى أثناء التمرير
import { f } from './ui'

export default function SectionNav({ items, onJump, isAr }) {
  if (items.length < 2) return null
  return (
    <nav aria-label={isAr ? 'انتقال سريع بين الأقسام' : 'Jump to section'} className="ef-nav"
      style={{ position: 'sticky', top: 76, zIndex: 20, alignItems: 'center', marginBottom: 20, padding: '8px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: f('0.72rem'), fontWeight: 800, color: 'var(--text-3)', padding: '0 8px', whiteSpace: 'nowrap' }}>{isAr ? 'انتقال سريع' : 'Jump to'}</span>
      {items.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onJump(id)}
          style={{ padding: '6px 14px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', fontWeight: 700, fontSize: f('0.78rem'), cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
      ))}
    </nav>
  )
}

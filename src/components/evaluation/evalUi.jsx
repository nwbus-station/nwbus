// عناصر عرض مشتركة لصفحة التقييم الوظيفي (نسخة الكمبيوتر): ألوان الدرجات، الأفاتار، مقياس النتيجة، حلقة النتيجة، حالة فارغة.
// لا منطق بيانات هنا — عرض فقط.

export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"

export const SCORE_LABELS    = ['', 'ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز']
export const SCORE_LABELS_EN = ['', 'Poor', 'Acceptable', 'Good', 'Very Good', 'Excellent']
export const SCORE_COLORS    = ['', '#DC2626', '#D97706', '#2563EB', '#059669', '#7C3AED']

// درجة النتيجة من 100 -> لون + وصف (نفس عتبات التقرير المطبوع)
export function toneOf(score, complete = true) {
  if (score == null) return { key: 'none', color: 'var(--text-3)', ar: 'لم يُقيَّم', en: 'Not rated' }
  if (score >= 98 && complete) return { key: 'star', color: '#7C3AED', ar: 'متميز', en: 'Outstanding' }
  if (score >= 85) return { key: 'great', color: '#059669', ar: 'ممتاز', en: 'Excellent' }
  if (score >= 70) return { key: 'vgood', color: '#3B82F6', ar: 'جيد جداً', en: 'Very good' }
  if (score >= 50) return { key: 'good', color: '#D97706', ar: 'جيد', en: 'Good' }
  return { key: 'low', color: '#DC2626', ar: 'يحتاج تحسين', en: 'Needs improvement' }
}

export function Icon({ d, size = 16, stroke = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export const ICONS = {
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  check: 'M20 6L9 17l-5-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  plus: 'M12 5v14M5 12h14',
  station: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  lock: 'M7 11V7a5 5 0 0110 0v4M5 11h14v10H5z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
}

export function StarMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  )
}

// أفاتار بالأحرف الأولى
export function Avatar({ name, size = 44, tone }) {
  const parts = String(name || '?').trim().split(/\s+/)
  const ini = (parts[0]?.[0] || '?') + (parts[1]?.[0] || '')
  const c = tone || 'var(--accent)'
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center',
      background: tone ? `${tone}14` : 'var(--gold-dim)', color: c, border: `1px solid ${tone ? `${tone}30` : 'transparent'}`,
      fontWeight: 900, fontSize: size >= 44 ? '1rem' : '0.85rem', letterSpacing: '-.02em',
    }}>{ini}</span>
  )
}

// مقياس نتيجة أفقي: شريط + رقم من 10 + نسبة
export function ScoreMeter({ score, complete = true, size = 'md', isAr = true }) {
  const t = toneOf(score, complete)
  const big = size === 'lg'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 56, height: big ? 10 : 8, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: t.color, borderRadius: 99, transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15, minWidth: big ? 64 : 54 }}>
        <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: big ? '1.5rem' : '1.1rem', color: t.color }}>
          {(score / 10).toFixed(1)}<span style={{ fontSize: big ? '.8rem' : '.7rem', color: 'var(--text-3)', fontWeight: 600 }}>/10</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: '.72rem', color: 'var(--text-3)' }}>{score}%</span>
      </div>
    </div>
  )
}

// حلقة نتيجة دائرية
export function ScoreRing({ score, size = 168, stroke = 14, complete = true, label }) {
  const t = toneOf(score, complete)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
        <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: size * 0.24 + 'px', color: score == null ? 'var(--text-3)' : 'var(--text-1)' }}>
          {score == null ? '—' : (score / 10).toFixed(1)}
        </span>
        {score != null && <span style={{ fontFamily: MONO, fontSize: size * 0.085 + 'px', color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>/10</span>}
        {label && <span style={{ fontSize: size * 0.085 + 'px', color: 'var(--text-3)', fontWeight: 700, marginTop: 4 }}>{label}</span>}
      </div>
    </div>
  )
}

export function Chip({ children, color = 'var(--text-2)', bg, border, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: '.74rem', fontWeight: 800,
      color, background: bg || 'var(--surface)', border: `1px solid ${border || 'var(--border)'}`, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  )
}

export function EmptyState({ title, hint, icon = ICONS.clipboard }) {
  return (
    <div style={{ padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 60, height: 60, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
        <Icon d={icon} size={26} stroke={1.6} />
      </span>
      <p style={{ margin: '4px 0 0', fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-2)', maxWidth: 520, lineHeight: 1.7 }}>{title}</p>
      {hint && <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-3)' }}>{hint}</p>}
    </div>
  )
}

export function SkeletonRows({ count = 5, height = 74 }) {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }, (_, i) => <div key={i} style={{ height, background: 'var(--surface)', borderRadius: 12 }} />)}
    </div>
  )
}

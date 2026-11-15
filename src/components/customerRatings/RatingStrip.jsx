import { toneVar } from './shared'

// شريط تقييم من 5 قطع مسطّحة — اللون + العدد المعبّأ + الرقم المرافق (لا يعتمد على اللون وحده)
export default function RatingStrip({ value, isAr, width = 96, height = 8 }) {
  const color = toneVar(value)
  return (
    <span role="img" aria-label={isAr ? `${value} من 5` : `${value} of 5`}
      style={{ display: 'inline-flex', gap: 3, width, flexShrink: 0 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ flex: 1, height, borderRadius: 1, background: i <= Math.round(value) ? color : 'var(--border-2)' }} />
      ))}
    </span>
  )
}

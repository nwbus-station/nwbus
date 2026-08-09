import { toLatinDigits } from '../../utils/digits'

/**
 * حقل وقت 24 ساعة — يستخدم input type="time" الأصلي.
 * يفتح منتقي الوقت الأصلي على الجوال، وعلى الديسكتوب يقبل كتابة مباشرة.
 * value/onChange بصيغة "HH:MM".
 */
export default function TimeInput24({ value = '', onChange, placeholder = '--:--', style = {} }) {
  function handle(e) {
    const raw = toLatinDigits(e.target.value)
    onChange(raw || '')
  }

  return (
    <input
      type="time"
      value={value}
      onChange={handle}
      dir="ltr"
      style={{
        width: '100%',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: '1rem',
        fontFamily: 'monospace',
        fontWeight: 600,
        background: 'var(--surface)',
        color: value ? 'var(--text-1)' : 'var(--text-3)',
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        ...style,
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  )
}

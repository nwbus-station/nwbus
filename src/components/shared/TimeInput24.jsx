import { useState, useEffect } from 'react'
import { toLatinDigits } from '../../utils/digits'

/**
 * حقل وقت 24 ساعة: اكتب 4 أرقام مثل 0900 → 09:00
 * أو 1505 → 15:05. عند الخروج يكتمل التنسيق تلقائياً.
 */
export default function TimeInput24({ value = '', onChange, placeholder = '--:--', style = {} }) {
  const [text, setText] = useState(value)

  useEffect(() => { setText(value) }, [value])

  function handle(e) {
    const d = toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 4)
    const display = d.length <= 2 ? d : d.slice(0, 2) + ':' + d.slice(2)
    setText(display)
    if (d.length === 4) {
      const hh = Math.min(23, parseInt(d.slice(0, 2), 10))
      const mm = Math.min(59, parseInt(d.slice(2), 10))
      onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
    } else if (d.length === 0) {
      onChange('')
    }
  }

  function blur() {
    const d = toLatinDigits(text).replace(/\D/g, '')
    if (!d) { setText(''); onChange(''); return }
    const hh = Math.min(23, parseInt(d.slice(0, 2) || '0', 10))
    const mm = d.length >= 3 ? Math.min(59, parseInt(d.slice(2, 4), 10)) : 0
    const v = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    setText(v)
    onChange(v)
  }

  return (
    <input
      value={text}
      onChange={handle}
      inputMode="numeric"
      maxLength={5}
      placeholder={placeholder}
      dir="ltr"
      style={{
        width: '100%',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: '1.1rem',
        fontFamily: 'monospace',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textAlign: 'center',
        background: 'var(--surface)',
        color: 'var(--text-1)',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.14s',
        ...style,
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => { e.target.style.borderColor = 'var(--border)'; blur() }}
    />
  )
}

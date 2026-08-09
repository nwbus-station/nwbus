import { useState, useEffect } from 'react'
import { toLatinDigits } from '../../utils/digits'

/**
 * مدخل وقت 24 ساعة سريع: اكتب الأرقام فقط (مثل 1505) وتنسّق تلقائياً 15:05.
 * value/onChange بصيغة "HH:MM".
 */
export default function TimeInput24({ value = '', onChange, className = '', placeholder = '--:--' }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])

  function parse(raw) {
    const d = toLatinDigits(raw).replace(/\D/g, '').slice(0, 4)
    if (!d) return { d: '', v: '' }
    // رقم واحد أو اثنان = ساعة فقط، بدون دقائق → أضف 00
    const hStr = d.length <= 2 ? d.padStart(2, '0') : d.slice(0, 2)
    const mStr = d.length >= 3 ? d.slice(2).padEnd(2, '0') : '00'
    const hh = Math.min(23, parseInt(hStr, 10))
    const mm = Math.min(59, parseInt(mStr, 10))
    const v = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    return { d, v }
  }

  function handle(e) {
    const d = toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 4)
    const out = d.length <= 2 ? d : d.slice(0, 2) + ':' + d.slice(2)
    setText(out)
    // أطلق onChange فور اكتمال 4 أرقام أو برقمين إذا ≤ 23
    if (d.length === 4) {
      const { v } = parse(d)
      onChange(v)
    } else if (d.length <= 2 && d.length > 0) {
      const h = parseInt(d, 10)
      if (h >= 3) {         // ≥3 ساعة لا يمكن أن يكون بادئة صحيحة لساعتين → أطلق مباشرة
        const { v } = parse(d)
        onChange(v); setText(v)
      }
    } else if (d.length === 0) {
      onChange('')
    }
  }

  function blur() {
    const { d, v } = parse(text)
    if (!d) { setText(''); onChange(''); return }
    setText(v); onChange(v)
  }

  return (
    <input value={text} onChange={handle} onBlur={blur}
      inputMode="numeric" maxLength={5} placeholder={placeholder} dir="ltr"
      className={`border rounded-xl px-3 py-2.5 text-sm text-center font-mono tracking-wider focus:ring-2 focus:ring-nwbus-primary focus:outline-none ${className}`} />
  )
}

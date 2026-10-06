/**
 * اختيار وقت 24 ساعة بأرقام لاتينية — بديل عن <input type="time">
 * (المتصفحات غير كروم تعرض أرقاماً عربية و12 ساعة).
 * value: 'HH:MM' أو '' · onChange: (value) => void
 */
const pad = n => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i))

export default function TimePicker({ value, onChange, style, className = '' }) {
  const [h = '', m = ''] = (value || '').split(':')
  const emit = (nh, nm) => onChange(nh === '' && nm === '' ? '' : `${nh || '00'}:${nm || '00'}`)
  const sel = { ...style, width: '100%', direction: 'ltr', textAlign: 'center' }
  return (
    <div dir="ltr" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={h} onChange={e => emit(e.target.value, m)} style={sel} className={className}>
        <option value="">--</option>
        {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <span style={{ fontWeight: 700 }}>:</span>
      <select value={m} onChange={e => emit(h, e.target.value)} style={sel} className={className}>
        <option value="">--</option>
        {MINUTES.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  )
}

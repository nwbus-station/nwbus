import { Children, Fragment, isValidElement, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import SearchSelect from './SearchSelect'

/**
 * بديل مباشر لـ <select> الأصلي: نفس الخصائص (value / onChange(e) / className / style / disabled / required)
 * ونفس أبناء <option> و <optgroup>، لكن بالتصميم الاحترافي (قائمة عائمة على الكمبيوتر وورقة سفلية على الجوال).
 * onChange يستقبل كائناً شبيهاً بالحدث: e.target.value
 */
const textOf = n => {
  if (n === null || n === undefined || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (isValidElement(n)) return textOf(n.props.children)
  return ''
}

function collect(children, group, out) {
  Children.forEach(children, ch => {
    if (!isValidElement(ch)) return
    if (ch.type === 'option') {
      const label = textOf(ch.props.children)
      out.push({ value: ch.props.value ?? label, label, disabled: !!ch.props.disabled, group })
    } else if (ch.type === 'optgroup') {
      collect(ch.props.children, ch.props.label, out)
    } else if (ch.type === Fragment || ch.props?.children) {
      collect(ch.props.children, group, out)
    }
  })
}

export default function SelectField({ value, onChange, children, className = '', style, disabled, required, id, name, title, placeholder, 'aria-label': ariaLabel }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const options = useMemo(() => { const o = []; collect(children, undefined, o); return o }, [children])
  return (
    <SearchSelect isAr={isAr} value={value} options={options} className={className} style={style} disabled={disabled} required={required} id={id}
      title={title || ariaLabel || ''} placeholder={placeholder}
      onChange={v => { const sv = String(v ?? ''); onChange?.({ target: { value: sv, name }, currentTarget: { value: sv, name }, preventDefault() {}, stopPropagation() {} }) }} />
  )
}

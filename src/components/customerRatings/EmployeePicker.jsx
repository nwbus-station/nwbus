import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesSearch } from '../../utils/digits'

// قائمة موظفين قابلة للبحث بالاسم أو الرقم الوظيفي — بديل عن <SelectField> عادي لما تكون
// القائمة طويلة (كل من عنده صلاحية "يُقيّم من العميل" بكل المحطات)
// desk: تنسيق الكمبيوتر (حقل بعرض كامل)؛ بدونه يبقى تنسيق الجوال كما كان
export default function EmployeePicker({ employees, value, onChange, defaultLabel, desk = false }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const selected = employees.find(e => e.id === value)

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = query.trim()
  const filtered = !q ? employees : employees.filter(e =>
    matchesSearch(e.full_name_ar, q) || matchesSearch(e.job_number, q)
  )

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen(o => !o); setQuery('') }} aria-haspopup="listbox" aria-expanded={open}
        className={desk ? 'cr-pick' : 'border rounded-lg px-3 py-2 text-sm bg-white text-start w-48 truncate'}>
        {selected ? `${selected.full_name_ar}${selected.job_number ? ` (${selected.job_number})` : ''}` : defaultLabel}
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 p-2 ${desk ? 'w-full min-w-[300px]' : 'w-72'}`}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or job number...'}
            className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2" />
          <div className="max-h-56 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className={`block w-full text-start px-2 py-1.5 rounded-lg text-sm hover:bg-gray-50 ${!value ? 'font-bold text-nwbus-primary' : 'text-gray-700'}`}>
              {defaultLabel}
            </button>
            {filtered.map(e => (
              <button key={e.id} type="button" onClick={() => { onChange(e.id); setOpen(false) }}
                className={`block w-full text-start px-2 py-1.5 rounded-lg text-sm hover:bg-gray-50 ${value === e.id ? 'font-bold text-nwbus-primary' : 'text-gray-700'}`}>
                {e.full_name_ar}{e.job_number ? ` (${e.job_number})` : ''}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">{isAr ? 'لا يوجد نتائج' : 'No results'}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

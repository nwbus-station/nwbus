import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

/**
 * قائمة اختيار مع بحث — احترافية ومناسبة للجوال.
 *  • الكمبيوتر: قائمة منسدلة بحقل بحث وتنقل بلوحة المفاتيح (↑ ↓ Enter Esc) وتمييز كلمات البحث.
 *  • الجوال: ورقة سفلية كاملة العرض (Bottom sheet) بصفوف كبيرة سهلة اللمس وحقل بحث ثابت أعلاها.
 * props: value, onChange(value), options [{value,label}], placeholder, className, isAr, title
 */
const norm = s => String(s ?? '').toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .trim()

function Highlight({ text, q }) {
  const nq = norm(q)
  if (!nq) return text
  const i = norm(text).indexOf(nq)
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-amber-100 text-inherit rounded-sm px-0.5">{text.slice(i, i + nq.length)}</mark>
      {text.slice(i + nq.length)}
    </>
  )
}

const Chevron = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
)

export default function SearchSelect({ value, onChange, options = [], placeholder = '', className = '', isAr = true, title = '' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches)
  const ref = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 639px)')
    if (!mq) return
    const on = e => setMobile(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  const matches = useMemo(() => {
    const nq = norm(q)
    if (!nq) return options
    const words = nq.split(/\s+/).filter(Boolean)
    return options.filter(o => { const l = norm(o.label); return words.every(w => l.includes(w)) })
      .sort((a, b) => (norm(a.label).startsWith(nq) ? 0 : 1) - (norm(b.label).startsWith(nq) ? 0 : 1))
  }, [options, q])

  function close() { setOpen(false); setQ('') }
  function pick(o) { onChange(o.value); close() }

  // إغلاق عند الضغط خارج القائمة (الكمبيوتر)
  useEffect(() => {
    if (!open || mobile) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) close() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, mobile])

  // قفل تمرير الصفحة خلف الورقة السفلية (الجوال) + إغلاق بـ Esc
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    if (mobile) document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, mobile])

  // عند الفتح: ركّز البحث وانزل للعنصر المختار
  useEffect(() => {
    if (!open) return
    const idx = Math.max(0, matches.findIndex(o => o.value === value))
    setActive(idx)
    const t = setTimeout(() => {
      if (!mobile) inputRef.current?.focus()
      listRef.current?.querySelector('[data-sel="1"]')?.scrollIntoView({ block: 'center' })
    }, 30)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => { listRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(matches.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[active]) pick(matches[active]) }
  }

  const searchBox = (
    <div className="relative">
      <svg className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0) }} onKeyDown={onKeyDown}
        placeholder={isAr ? 'ابحث عن محطة…' : 'Search…'} enterKeyHint="search" autoComplete="off"
        className="w-full bg-gray-50 border border-gray-200 rounded-xl ps-9 pe-9 py-2.5 text-[16px] sm:text-sm focus:bg-white focus:ring-2 focus:ring-nwbus-primary/40 focus:border-nwbus-primary focus:outline-none" />
      {q && (
        <button type="button" onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="clear"
          className="absolute top-1/2 -translate-y-1/2 end-2 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-sm leading-none grid place-items-center">×</button>
      )}
    </div>
  )

  const list = (
    <div ref={listRef} className={mobile ? 'flex-1 overflow-y-auto overscroll-contain px-2 pb-4' : 'max-h-72 overflow-y-auto overscroll-contain mt-2'} role="listbox">
      {matches.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">{isAr ? 'لا توجد نتائج' : 'No results'}</p>
          {q && <button type="button" onClick={() => setQ('')} className="text-xs text-nwbus-primary font-semibold mt-1.5">{isAr ? 'مسح البحث' : 'Clear search'}</button>}
        </div>
      ) : matches.map((o, i) => {
        const isSel = o.value === value
        return (
          <button key={o.value || '_'} type="button" role="option" aria-selected={isSel}
            data-sel={isSel ? '1' : undefined} data-active={i === active ? '1' : undefined}
            onClick={() => pick(o)} onMouseEnter={() => !mobile && setActive(i)}
            className={`w-full flex items-center justify-between gap-3 text-start rounded-xl transition-colors ${mobile ? 'px-4 py-3.5 text-[15px]' : 'px-3 py-2 text-sm'}
              ${isSel ? 'bg-blue-50 text-nwbus-primary font-bold' : i === active ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="min-w-0 break-words" dir="auto"><Highlight text={o.label} q={q} /></span>
            {isSel && <svg className="shrink-0 text-nwbus-primary" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="relative" ref={ref} dir={isAr ? 'rtl' : 'ltr'}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={`${className} flex items-center justify-between gap-2 ${!selected ? 'text-gray-400' : ''}`}>
        <span className="truncate">{selected ? selected.label : (placeholder || (isAr ? '— اختر —' : '— Select —'))}</span>
        <Chevron open={open} />
      </button>

      {open && !mobile && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[260px] bg-white rounded-2xl shadow-[0_12px_40px_rgba(15,23,42,0.18)] border border-gray-100 p-2.5">
          {searchBox}
          <p className="text-[10px] font-semibold text-gray-400 px-1 mt-2">{matches.length} {isAr ? 'نتيجة' : 'results'}</p>
          {list}
        </div>
      )}

      {open && mobile && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end" dir={isAr ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={close} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[82vh] animate-[nwsheet_.22s_ease-out]">
            <div className="pt-2.5 pb-1 grid place-items-center"><span className="w-10 h-1.5 rounded-full bg-gray-300" /></div>
            <div className="flex items-center justify-between px-5 pb-2.5">
              <h4 className="text-[15px] font-extrabold text-gray-900">{title || placeholder || (isAr ? 'اختر المحطة' : 'Select')}</h4>
              <button type="button" onClick={close} aria-label="close" className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 text-xl leading-none grid place-items-center">×</button>
            </div>
            <div className="px-4 pb-2">{searchBox}</div>
            <p className="text-[11px] font-semibold text-gray-400 px-5 pb-1.5">{matches.length} {isAr ? 'نتيجة' : 'results'}</p>
            {list}
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
          <style>{'@keyframes nwsheet{from{transform:translateY(100%)}to{transform:translateY(0)}}'}</style>
        </div>,
        document.body,
      )}
    </div>
  )
}

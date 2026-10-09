import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

/**
 * قائمة اختيار احترافية مناسبة للجوال — تُستخدم بكل قوائم التطبيق.
 *  • الكمبيوتر: قائمة منسدلة عائمة (لا تُقصّ داخل النوافذ والجداول) بحقل بحث للقوائم الطويلة،
 *    تنقل بلوحة المفاتيح (↑ ↓ Enter Esc) وتمييز كلمات البحث.
 *  • الجوال: ورقة سفلية كاملة العرض بصفوف كبيرة سهلة اللمس.
 * props: value, onChange(value), options [{value,label,group?,disabled?}], placeholder, className, style,
 *        isAr, title, disabled, id, required, searchable (افتراضياً تلقائي: أكثر من 7 خيارات)
 */
const norm = s => String(s ?? '').toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .trim()


// خصائص التموضع (العرض/المرونة/الهوامش/الإخفاء) تنتقل لغلاف القائمة حتى تتصرف مثل <select> الأصلي داخل الصفوف والشبكات
const LAYOUT_RE = /^(-?m[trblxyse]?-|w-|min-w-|max-w-|flex-|grow|shrink|basis-|col-span-|row-span-|col-start-|self-|justify-self-|order-|hidden$|block$|inline-block$)/
function splitLayout(className, style) {
  const wrap = [], btn = []
  String(className || '').split(/\s+/).filter(Boolean).forEach(tok => {
    const base = tok.replace(/^(sm|md|lg|xl|2xl):/, '')
    if (LAYOUT_RE.test(base)) { wrap.push(tok); if (base.startsWith('w-') || base.startsWith('min-w-') || base.startsWith('max-w-')) btn.push('') }
    else btn.push(tok)
  })
  const wStyle = {}, bStyle = { ...(style || {}) }
  for (const k of ['width', 'minWidth', 'maxWidth', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginInlineStart', 'marginInlineEnd', 'gridColumn', 'alignSelf', 'display']) {
    if (bStyle[k] !== undefined) { wStyle[k] = bStyle[k]; delete bStyle[k] }
  }
  return { wrapClass: wrap.join(' '), btnClass: btn.filter(Boolean).join(' '), wStyle, bStyle }
}

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

export default function SearchSelect({
  value, onChange, options = [], placeholder = '', className = '', style, isAr = true, title = '',
  disabled = false, id, required = false, searchable,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const cur = value === undefined || value === null ? '' : String(value)
  const selected = options.find(o => String(o.value ?? '') === cur)
  const showSearch = searchable ?? options.length > 7

  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 639px)')
    if (!mq) return
    const on = e => setMobile(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // القوائم الطويلة (محطات…) تُرتَّب أبجدياً تلقائياً — الخيار الفارغ ("الكل") يبقى أولاً، والقوائم ذات المجموعات تبقى كما هي
  const ordered = useMemo(() => {
    if (options.length <= 20 || options.some(o => o.group)) return options
    const head = options.filter(o => String(o.value ?? '') === '')
    const rest = options.filter(o => String(o.value ?? '') !== '')
    const lang = isAr ? 'ar' : 'en'
    return [...head, ...rest.sort((a, b) => String(a.label).localeCompare(String(b.label), lang, { numeric: true, sensitivity: 'base' }))]
  }, [options, isAr])
  const letterOf = o => { const ch = norm(o.label).replace(/[^a-z0-9\u0600-\u06FF]/g, '').charAt(0); return ch ? ch.toUpperCase() : '#' }
  const useLetters = ordered.length > 20 && !ordered.some(o => o.group)

  const matches = useMemo(() => {
    const nq = norm(q)
    if (!nq) return ordered
    const words = nq.split(/\s+/).filter(Boolean)
    return ordered.filter(o => { const l = norm(o.label); return words.every(w => l.includes(w)) })
      .sort((a, b) => (norm(a.label).startsWith(nq) ? 0 : 1) - (norm(b.label).startsWith(nq) ? 0 : 1))
  }, [ordered, q])

  function close() { setOpen(false); setQ('') }
  function pick(o) { if (o.disabled) return; onChange?.(o.value); close() }

  // موضع القائمة العائمة (الكمبيوتر): أسفل الزر أو أعلاه لو ما فيه مساحة
  function place() {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const width = Math.max(r.width, 230)
    let left = isAr ? r.right - width : r.left
    left = Math.max(8, Math.min(left, vw - width - 8))
    const estH = Math.min(showSearch ? 372 : 300, 56 + options.length * 38)
    const below = vh - r.bottom
    const up = below < estH + 12 && r.top > below
    setPos({ left, width, top: up ? undefined : r.bottom + 6, bottom: up ? vh - r.top + 6 : undefined, maxH: Math.max(160, (up ? r.top : below) - 20) })
  }
  useLayoutEffect(() => { if (open && !mobile) place() }, [open, mobile])

  // إغلاق عند الضغط خارج القائمة / التمرير / تغيير الحجم (الكمبيوتر)
  useEffect(() => {
    if (!open || mobile) return
    const onDoc = e => { if (!btnRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) close() }
    const onScroll = e => { if (!popRef.current?.contains(e.target)) close() }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close) }
  }, [open, mobile])

  // قفل تمرير الصفحة خلف الورقة السفلية (الجوال) + إغلاق بـ Esc
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    document.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    if (mobile) document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev }
  }, [open, mobile])

  // عند الفتح: حدّد المختار وانزل له، وركّز البحث
  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, ordered.findIndex(o => String(o.value ?? '') === cur)))
    const t = setTimeout(() => {
      if (!mobile && showSearch) inputRef.current?.focus()
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

  const searchBox = showSearch && (
    <div className="relative">
      <svg className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0) }} onKeyDown={onKeyDown}
        placeholder={isAr ? 'ابحث…' : 'Search…'} enterKeyHint="search" autoComplete="off"
        className="w-full bg-gray-50 border border-gray-200 rounded-xl ps-9 pe-9 py-2.5 text-[16px] sm:text-sm focus:bg-white focus:ring-2 focus:ring-nwbus-primary/40 focus:border-nwbus-primary focus:outline-none" />
      {q && (
        <button type="button" onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="clear"
          className="absolute top-1/2 -translate-y-1/2 end-2 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-sm leading-none grid place-items-center">×</button>
      )}
    </div>
  )

  let lastGroup, lastLetter
  const list = (
    <div ref={listRef} onKeyDown={onKeyDown} tabIndex={-1} role="listbox" style={!mobile && pos ? { maxHeight: Math.min(pos.maxH - (showSearch ? 78 : 22), 300) } : undefined}
      className={mobile ? 'flex-1 overflow-y-auto overscroll-contain px-2 pb-4 outline-none' : `overflow-y-auto overscroll-contain outline-none ${showSearch ? 'mt-2' : ''}`}>
      {matches.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">{isAr ? 'لا توجد نتائج' : 'No results'}</p>
          {q && <button type="button" onClick={() => setQ('')} className="text-xs text-nwbus-primary font-semibold mt-1.5">{isAr ? 'مسح البحث' : 'Clear search'}</button>}
        </div>
      ) : matches.map((o, i) => {
        const isSel = String(o.value ?? '') === cur
        let head = o.group && o.group !== lastGroup ? o.group : null
        lastGroup = o.group
        const L = useLetters && !q ? letterOf(o) : null
        const newLetter = L && L !== lastLetter
        if (L) lastLetter = L
        if (newLetter && String(o.value ?? '') !== '') head = head || L
        return (
          <div key={(o.value ?? '') + '|' + i}>
            {head && <p data-letter={newLetter ? L : undefined} className={`text-[11px] font-extrabold tracking-wide px-3 pt-2.5 pb-1 ${newLetter ? 'sticky top-0 z-[1] bg-white/95 text-nwbus-primary border-b border-gray-100' : 'text-gray-400'}`}>{head}</p>}
            <button type="button" role="option" aria-selected={isSel} disabled={o.disabled}
              data-sel={isSel ? '1' : undefined} data-active={i === active ? '1' : undefined}
              onClick={() => pick(o)} onMouseEnter={() => !mobile && setActive(i)}
              className={`w-full flex items-center justify-between gap-3 text-start rounded-xl transition-colors disabled:opacity-40 ${mobile ? 'px-4 py-3.5 text-[15px]' : 'px-3 py-2 text-sm'}
                ${isSel ? 'bg-blue-50 text-nwbus-primary font-bold' : i === active ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}>
              <span className="min-w-0 break-words" dir="auto"><Highlight text={String(o.label)} q={q} /></span>
              {isSel && <svg className="shrink-0 text-nwbus-primary" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
          </div>
        )
      })}
    </div>
  )

  const muted = !selected || String(selected.value ?? '') === ''
  const lay = splitLayout(className, style)
  return (
    <div className={`relative ${lay.wrapClass}`} style={lay.wStyle} dir={isAr ? 'rtl' : 'ltr'}>
      <button ref={btnRef} id={id} type="button" disabled={disabled} style={lay.bStyle} onClick={() => !disabled && setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={e => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); setOpen(true) } }}
        className={`${lay.btnClass} w-full flex items-center justify-between gap-2 text-start ${muted ? 'text-gray-400' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
        <span className="truncate">{selected && String(selected.label) !== '' ? selected.label : (placeholder || (isAr ? '— اختر —' : '— Select —'))}</span>
        <Chevron open={open} />
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" required value={cur} onChange={() => {}} className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none" />}

      {open && !mobile && pos && createPortal(
        <div ref={popRef} dir={isAr ? 'rtl' : 'ltr'}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 10000 }}
          className="bg-white rounded-2xl shadow-[0_12px_40px_rgba(15,23,42,0.2)] border border-gray-100 p-2">
          {searchBox}
          {showSearch && <p className="text-[10px] font-semibold text-gray-400 px-1 mt-1.5">{matches.length} {isAr ? 'نتيجة' : 'results'}</p>}
          {list}
        </div>,
        document.body,
      )}

      {open && mobile && createPortal(
        <div className="fixed inset-0 z-[10000] flex flex-col justify-end" dir={isAr ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={close} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[82vh] animate-[nwsheet_.22s_ease-out]">
            <div className="pt-2.5 pb-1 grid place-items-center"><span className="w-10 h-1.5 rounded-full bg-gray-300" /></div>
            <div className="flex items-center justify-between px-5 pb-2.5">
              <h4 className="text-[15px] font-extrabold text-gray-900">{title || (placeholder && !muted ? placeholder : '') || (isAr ? 'اختر' : 'Select')}</h4>
              <button type="button" onClick={close} aria-label="close" className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 text-xl leading-none grid place-items-center">×</button>
            </div>
            {showSearch && <div className="px-4 pb-2">{searchBox}</div>}
            {useLetters && !q && (
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
                {[...new Set(ordered.filter(o => String(o.value ?? '') !== '').map(letterOf))].map(L => (
                  <button key={L} type="button" onClick={() => listRef.current?.querySelector(`[data-letter="${L}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                    className="shrink-0 min-w-8 h-8 px-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold">{L}</button>
                ))}
              </div>
            )}
            {showSearch && <p className="text-[11px] font-semibold text-gray-400 px-5 pb-1.5">{matches.length} {isAr ? 'نتيجة' : 'results'}</p>}
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

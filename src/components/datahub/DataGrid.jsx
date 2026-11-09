import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { display, sortVal, matches } from '../../utils/dataHub'

// شبكة بيانات بنمط Excel: تمرير سريع لعشرات الآلاف من الصفوف (عرض الظاهر فقط)، فرز وفلاتر لكل عمود، تغيير عرض الأعمدة،
// تحديد خلايا بالماوس أو الأسهم (مع Shift)، نسخ (Ctrl+C) للصق مباشرة في Excel، وشريط حالة بمجموع ومتوسط المحدد.
const NUM_W = 54
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

export default function DataGrid({ cols, rows, isAr = true, rowH = 34, search = '', height = 560, onView }) {
  const T = (a, e) => (isAr ? a : e)
  const [hidden, setHidden] = useState(() => new Set(cols.filter(c => c.hidden).map(c => c.key)))
  const [widths, setWidths] = useState({})
  const [sort, setSort] = useState(null)               // { key, dir: 1 | -1 }
  const [filters, setFilters] = useState({})
  const [showFilters, setShowFilters] = useState(false)
  const [menu, setMenu] = useState(false)
  const [pin, setPin] = useState(false)                 // تثبيت أول عمود بيانات
  const [sel, setSel] = useState(null)                  // { r1, c1, r2, c2 }
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [copied, setCopied] = useState(false)
  const box = useRef(null), drag = useRef(false), resize = useRef(null)

  const vcols = useMemo(() => cols.filter(c => !hidden.has(c.key)).map(c => ({ ...c, w: widths[c.key] ?? c.width })), [cols, hidden, widths])

  const view = useMemo(() => {
    const q = search.trim().toLowerCase()
    const fl = Object.entries(filters).filter(([, v]) => v && v.trim()).map(([k, v]) => [vcols.find(c => c.key === k), v]).filter(([c]) => c)
    let out = rows
    if (q) out = out.filter(r => vcols.some(c => display(c, r[c.key]).toLowerCase().includes(q)))
    if (fl.length) out = out.filter(r => fl.every(([c, v]) => matches(c, r[c.key], v)))
    if (sort) {
      const c = vcols.find(x => x.key === sort.key)
      if (c) {
        out = [...out].sort((a, b) => {
          const x = sortVal(c, a[c.key]), y = sortVal(c, b[c.key])
          if (x === null && y === null) return 0
          if (x === null) return 1
          if (y === null) return -1
          return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ar', { numeric: true })) * sort.dir
        })
      }
    }
    return out
  }, [rows, vcols, search, filters, sort])

  useEffect(() => { onView?.({ rows: view, cols: vcols }) }, [view, vcols]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalW = NUM_W + vcols.reduce((a, c) => a + c.w, 0)
  const bodyH = view.length * rowH
  const vh = height - 38 - (showFilters ? 40 : 0)
  const first = Math.max(0, Math.floor(scroll.top / rowH) - 6)
  const last = Math.min(view.length, Math.ceil((scroll.top + vh) / rowH) + 6)
  const visible = view.slice(first, last)

  // ── التحديد
  const norm = s => (s ? { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) } : null)
  const n = norm(sel)
  const inSel = (r, c) => n && r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2
  const stats = useMemo(() => {
    if (!n) return null
    const nums = []
    let cnt = 0
    for (let r = n.r1; r <= n.r2 && r < view.length; r++) for (let c = n.c1; c <= n.c2 && c < vcols.length; c++) {
      const v = view[r][vcols[c].key]
      if (v !== null && v !== undefined && v !== '') cnt++
      if (vcols[c].type === 'num' && v !== null && v !== undefined) nums.push(Number(v))
    }
    const sum = nums.reduce((a, b) => a + b, 0)
    return { cells: (n.r2 - n.r1 + 1) * (n.c2 - n.c1 + 1), cnt, nums: nums.length, sum, avg: nums.length ? sum / nums.length : 0, min: nums.length ? Math.min(...nums) : 0, max: nums.length ? Math.max(...nums) : 0 }
  }, [n?.r1, n?.r2, n?.c1, n?.c2, view, vcols]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = useCallback(async () => {
    if (!n) return
    const lines = []
    for (let r = n.r1; r <= n.r2 && r < view.length; r++) {
      const cells = []
      for (let c = n.c1; c <= n.c2 && c < vcols.length; c++) cells.push(display(vcols[c], view[r][vcols[c].key]).replace(/[\t\r\n]+/g, ' '))
      lines.push(cells.join('\t'))
    }
    const text = lines.join('\n')
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') } catch { /* بدون نسخ */ } ta.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1400)
  }, [n?.r1, n?.r2, n?.c1, n?.c2, view, vcols]) // eslint-disable-line react-hooks/exhaustive-deps

  const ensure = (r, c) => {
    const el = box.current; if (!el) return
    const top = r * rowH, bottom = top + rowH
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + vh) el.scrollTop = bottom - vh
    void c
  }
  function onKey(e) {
    if (!sel) { if (view.length && vcols.length && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) setSel({ r1: 0, c1: 0, r2: 0, c2: 0 }); return }
    const k = e.key
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') { e.preventDefault(); copy(); return }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); setSel({ r1: 0, c1: 0, r2: Math.max(0, view.length - 1), c2: Math.max(0, vcols.length - 1) }); return }
    const dr = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : k === 'PageDown' ? 15 : k === 'PageUp' ? -15 : 0
    const rtl = isAr
    const dc = k === 'ArrowRight' ? (rtl ? -1 : 1) : k === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
    if (!dr && !dc) { if (k === 'Escape') setSel(null); return }
    e.preventDefault()
    const r2 = Math.min(view.length - 1, Math.max(0, sel.r2 + dr)), c2 = Math.min(vcols.length - 1, Math.max(0, sel.c2 + dc))
    setSel(e.shiftKey ? { ...sel, r2, c2 } : { r1: r2, c1: c2, r2, c2 })
    ensure(r2, c2)
  }

  // ── تغيير عرض العمود بالسحب
  useEffect(() => {
    const move = e => {
      const rs = resize.current; if (!rs) return
      const d = (isAr ? rs.x - e.clientX : e.clientX - rs.x)
      setWidths(w => ({ ...w, [rs.key]: Math.max(60, Math.min(600, rs.w + d)) }))
    }
    const up = () => { resize.current = null; drag.current = false }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [isAr])

  const toggleSort = key => setSort(s => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))
  const activeFilters = Object.values(filters).filter(v => v && v.trim()).length
  const fmtN = x => Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })
  const cellStyle = (c, ci, r) => ({
    position: 'relative', width: c.w, minWidth: c.w, height: rowH, display: 'flex', alignItems: 'center', padding: '0 10px', boxSizing: 'border-box',
    borderInlineEnd: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden',
    justifyContent: c.type === 'num' ? 'flex-end' : c.type === 'bool' ? 'center' : 'flex-start',
    background: inSel(r, ci) ? 'var(--gold-dim)' : undefined,
    boxShadow: n && r === sel.r2 && ci === sel.c2 ? 'inset 0 0 0 2px var(--accent)' : undefined,
    ...(pin && ci === 0 ? { position: 'sticky', insetInlineStart: NUM_W, zIndex: 2, background: inSel(r, ci) ? 'var(--gold-dim)' : 'var(--card)' } : null),
  })
  const tb = on => ({ minHeight: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, background: on ? 'var(--gold-dim)' : 'var(--card)', color: 'var(--text-1)', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 })

  return (
    <div style={{ border: '1px solid var(--border-2)', borderRadius: 14, background: 'var(--card)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* شريط أدوات الشبكة */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface)' }}>
        <button type="button" style={tb(showFilters || activeFilters > 0)} aria-pressed={showFilters} onClick={() => setShowFilters(o => !o)}>{T('فلاتر الأعمدة', 'Column filters')}{activeFilters > 0 && <b style={{ fontFamily: MONO }}>{activeFilters}</b>}</button>
        {activeFilters > 0 && <button type="button" style={tb(false)} onClick={() => setFilters({})}>{T('مسح الفلاتر', 'Clear filters')}</button>}
        <div style={{ position: 'relative' }}>
          <button type="button" style={tb(menu)} aria-expanded={menu} onClick={() => setMenu(o => !o)}>{T('الأعمدة', 'Columns')} <b style={{ fontFamily: MONO }}>{vcols.length}/{cols.length}</b></button>
          {menu && (
            <div role="menu" style={{ position: 'absolute', insetInlineStart: 0, top: '100%', marginTop: 6, zIndex: 20, width: 260, maxHeight: 340, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 12, boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(0,0,0,.2))', padding: 6 }}>
              <div style={{ display: 'flex', gap: 6, padding: 4 }}>
                <button type="button" style={{ ...tb(false), minHeight: 30 }} onClick={() => setHidden(new Set())}>{T('إظهار الكل', 'Show all')}</button>
                <button type="button" style={{ ...tb(false), minHeight: 30 }} onClick={() => setHidden(new Set(cols.filter(c => c.hidden).map(c => c.key)))}>{T('الافتراضي', 'Default')}</button>
              </div>
              {cols.map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 36, padding: '4px 8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)', borderRadius: 8 }}>
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden(p => { const nx = new Set(p); nx.has(c.key) ? nx.delete(c.key) : nx.add(c.key); return nx })} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button type="button" style={tb(pin)} aria-pressed={pin} onClick={() => setPin(o => !o)}>{T('تثبيت أول عمود', 'Freeze first column')}</button>
        <span style={{ marginInlineStart: 'auto', fontSize: '0.7rem', color: 'var(--text-3)' }}>{T('اضغط خلية ثم Ctrl+C للنسخ إلى Excel · Shift/سحب لتحديد نطاق · اضغط العنوان للفرز', 'Click a cell, Ctrl+C to copy to Excel · Shift/drag to select a range · click a header to sort')}</span>
      </div>

      {/* الشبكة */}
      <div ref={box} tabIndex={0} role="grid" aria-rowcount={view.length} aria-colcount={vcols.length} onKeyDown={onKey}
        onScroll={e => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
        style={{ height, overflow: 'auto', position: 'relative', outline: 'none', direction: isAr ? 'rtl' : 'ltr', background: 'var(--card)' }}>
        <div style={{ width: totalW, minWidth: '100%' }}>
          {/* الترويسة */}
          <div style={{ position: 'sticky', top: 0, zIndex: 4, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', height: 38, borderBottom: '2px solid var(--accent)' }}>
              <div style={{ position: 'sticky', insetInlineStart: 0, zIndex: 5, width: NUM_W, minWidth: NUM_W, display: 'grid', placeItems: 'center', background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', color: 'var(--text-3)', fontSize: '0.66rem', fontWeight: 800 }}>#</div>
              {vcols.map((c, ci) => (
                <div key={c.key} role="columnheader" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  style={{ position: pin && ci === 0 ? 'sticky' : 'relative', ...(pin && ci === 0 ? { insetInlineStart: NUM_W, zIndex: 5 } : null), width: c.w, minWidth: c.w, background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button type="button" onClick={() => toggleSort(c.key)} title={T('اضغط للفرز', 'Click to sort')}
                    style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.74rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0 8px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                    <span aria-hidden="true" style={{ color: sort?.key === c.key ? 'var(--accent)' : 'var(--text-3)', fontSize: 10, opacity: sort?.key === c.key ? 1 : 0.4 }}>{sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '⇅'}</span>
                  </button>
                  <i onMouseDown={e => { e.preventDefault(); resize.current = { key: c.key, x: e.clientX, w: c.w } }} aria-hidden="true"
                    style={{ position: 'absolute', insetInlineEnd: 0, top: 0, width: 7, height: '100%', cursor: 'col-resize', zIndex: 6 }} />
                </div>
              ))}
            </div>
            {showFilters && (
              <div style={{ display: 'flex', height: 40, borderBottom: '1px solid var(--border-2)', background: 'var(--card)' }}>
                <div style={{ position: 'sticky', insetInlineStart: 0, zIndex: 5, width: NUM_W, minWidth: NUM_W, background: 'var(--card)', borderInlineEnd: '1px solid var(--border-2)' }} />
                {vcols.map((c, ci) => (
                  <div key={c.key} style={{ ...(pin && ci === 0 ? { position: 'sticky', insetInlineStart: NUM_W, zIndex: 5 } : null), width: c.w, minWidth: c.w, padding: 4, boxSizing: 'border-box', background: 'var(--card)', borderInlineEnd: '1px solid var(--border)' }}>
                    <input value={filters[c.key] ?? ''} onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))} placeholder={c.type === 'num' ? '> 100' : '…'} aria-label={`${T('تصفية', 'Filter')} ${c.label}`} dir="auto"
                      style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: `1px solid ${filters[c.key] ? 'var(--accent)' : 'var(--border-2)'}`, borderRadius: 7, padding: '0 8px', fontSize: '0.72rem', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text-1)' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الصفوف (الظاهرة فقط) */}
          <div style={{ position: 'relative', height: bodyH }}>
            {visible.map((row, k) => {
              const r = first + k
              return (
                <div key={r} role="row" className="dg-row" style={{ position: 'absolute', top: r * rowH, insetInlineStart: 0, display: 'flex', height: rowH, width: totalW, background: r % 2 ? 'var(--surface)' : 'var(--card)' }}>
                  <div style={{ position: 'sticky', insetInlineStart: 0, zIndex: 3, width: NUM_W, minWidth: NUM_W, height: rowH, display: 'grid', placeItems: 'center', background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', borderBottom: '1px solid var(--border)', color: n && r >= n.r1 && r <= n.r2 ? 'var(--accent)' : 'var(--text-3)', fontFamily: MONO, fontSize: '0.66rem', fontWeight: 800 }}>{r + 1}</div>
                  {vcols.map((c, ci) => {
                    const v = row[c.key]
                    const text = display(c, v)
                    return (
                      <div key={c.key} role="gridcell" aria-selected={!!inSel(r, ci)} title={text}
                        onMouseDown={e => { box.current?.focus(); drag.current = true; setSel(e.shiftKey && sel ? { ...sel, r2: r, c2: ci } : { r1: r, c1: ci, r2: r, c2: ci }) }}
                        onMouseEnter={() => { if (drag.current && !resize.current) setSel(s => (s ? { ...s, r2: r, c2: ci } : s)) }}
                        style={cellStyle(c, ci, r)}>
                        {c.type === 'bool'
                          ? (v === null || v === undefined ? null : <span style={{ borderRadius: 99, padding: '1px 9px', fontSize: '0.68rem', fontWeight: 800, background: v ? 'var(--success-bg)' : 'var(--surface-2)', color: v ? 'var(--success)' : 'var(--text-3)' }}>{text}</span>)
                          : <span dir={c.type === 'text' ? 'auto' : 'ltr'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-1)', fontFamily: c.type === 'num' || c.type === 'stamp' || c.type === 'date' ? MONO : 'inherit', fontWeight: c.type === 'num' ? 700 : 500 }}>{text}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {view.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.86rem', position: 'sticky', insetInlineStart: 0 }}>{T('لا توجد صفوف مطابقة', 'No matching rows')}</div>}
        </div>
      </div>

      {/* شريط الحالة (مثل Excel) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minHeight: 38, padding: '6px 12px', borderTop: '1px solid var(--border-2)', background: 'var(--surface)', fontSize: '0.74rem', color: 'var(--text-2)' }}>
        <span><b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{view.length.toLocaleString('en-US')}</b> {T('من', 'of')} <span style={{ fontFamily: MONO }}>{rows.length.toLocaleString('en-US')}</span> {T('صف', 'rows')}</span>
        {stats && <span style={{ color: 'var(--text-3)' }}>{T('المحدد', 'Selected')}: <b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{stats.cells}</b> {T('خلية', 'cells')}</span>}
        {stats && stats.nums > 0 && (
          <>
            <span>{T('المجموع', 'Sum')}: <b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{fmtN(stats.sum)}</b></span>
            <span>{T('المتوسط', 'Average')}: <b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{fmtN(stats.avg)}</b></span>
            <span>{T('الأقل', 'Min')}: <b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{fmtN(stats.min)}</b></span>
            <span>{T('الأعلى', 'Max')}: <b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{fmtN(stats.max)}</b></span>
            <span>{T('العدد', 'Count')}: <b style={{ fontFamily: MONO, color: 'var(--text-1)' }}>{stats.nums}</b></span>
          </>
        )}
        {copied && <span style={{ marginInlineStart: 'auto', color: 'var(--success)', fontWeight: 800 }}>{T('تم النسخ إلى الحافظة', 'Copied to clipboard')}</span>}
        {sel && !copied && <button type="button" onClick={copy} style={{ ...tb(false), marginInlineStart: 'auto', minHeight: 30 }}>{T('نسخ المحدد', 'Copy selection')}</button>}
      </div>
    </div>
  )
}

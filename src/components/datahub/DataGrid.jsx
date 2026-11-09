import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { display, sortVal, matches } from '../../utils/dataHub'

// شبكة بيانات بنمط Excel: تمرير سريع لعشرات الآلاف من الصفوف (عرض الظاهر فقط)، فرز وفلاتر لكل عمود، تغيير عرض الأعمدة،
// تحديد خلايا بالماوس أو الأسهم (مع Shift)، نسخ (Ctrl+C) للصق مباشرة في Excel، وشريط حالة بمجموع ومتوسط المحدد.
const NUM_W = 54
const NO_SUM = /number|_no$|phone|mobile|code|_id$|^id$|order|sort|seq|year|month|day|hour|version|rating|score|rate|percent|accuracy/i
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

export default function DataGrid({ cols, rows, isAr = true, rowH = 34, search = '', height = 560, onView }) {
  const T = (a, e) => (isAr ? a : e)
  const hiddenByDefault = useMemo(() => new Set(cols.filter(c => c.hidden).map(c => c.key)), [cols])
  const [hidden, setHidden] = useState(() => new Set(cols.filter(c => c.hidden).map(c => c.key)))
  const [widths, setWidths] = useState({})
  const [sort, setSort] = useState(null)               // { key, dir: 1 | -1 }
  const [filters, setFilters] = useState({})
  const [showFilters, setShowFilters] = useState(false)
  const [menu, setMenu] = useState(false)
  const [pin, setPin] = useState(true)                  // تثبيت أول عمود بيانات (يبقى ظاهراً أثناء التحريك الأفقي)
  const [edge, setEdge] = useState({ s: false, e: false }) // هل يوجد محتوى مخفي قبل/بعد (للظلال والأسهم)
  const [panMode, setPanMode] = useState(false)             // وضع اليد: السحب يحرّك الجدول بدل تحديد الخلايا
  const [panning, setPanning] = useState(false)
  const pan = useRef(null), momentum = useRef(0), auto = useRef(null), ptr = useRef({ x: 0, y: 0 }), justPanned = useRef(false)
  const [sel, setSel] = useState(null)                  // { r1, c1, r2, c2 }
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [copied, setCopied] = useState(false)
  const [detail, setDetail] = useState(null)             // فهرس الصف المعروض تفاصيله
  const [cw, setCw] = useState(0)                        // عرض الحاوية لملء المساحة بدون تمرير جانبي
  const box = useRef(null), drag = useRef(false), resize = useRef(null)

  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => { setCw(el.clientWidth); measureEdge() })
    ro.observe(el); setCw(el.clientWidth); measureEdge()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function measureEdge() {
    const el = box.current; if (!el) return
    const pos = Math.abs(el.scrollLeft), max = el.scrollWidth - el.clientWidth
    const s = pos > 3, e = pos < max - 3
    setEdge(p => (p.s === s && p.e === e ? p : { s, e }))
  }
  // اتجاهات فيزيائية: يسار/يمين الشاشة (في RTL بداية المحتوى يمين الشاشة)
  const canL = isAr ? edge.e : edge.s
  const canR = isAr ? edge.s : edge.e
  const panBy = dir => { const el = box.current; if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.72), behavior: 'smooth' }) }

  const vcols = useMemo(() => {
    const vis = cols.filter(c => !hidden.has(c.key))
    const manual = vis.reduce((a, c) => a + (widths[c.key] ?? 0), 0)
    const auto = vis.reduce((a, c) => a + (widths[c.key] ? 0 : c.width), 0)
    // توزيع المساحة الفارغة على الأعمدة بدل ترك فراغ جانبي (حتى ×2.2)
    const k = auto && cw ? Math.min(2.2, Math.max(1, (cw - NUM_W - 2 - manual) / auto)) : 1
    return vis.map(c => ({ ...c, w: widths[c.key] ?? Math.round(c.width * k) }))
  }, [cols, hidden, widths, cw])

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

  // إجماليات الأعمدة الرقمية للصفوف الظاهرة بعد الفلاتر (تتحدث مع أي فلتر)
  const totals = useMemo(() => {
    const t = vcols.map(c => {
      if (c.type !== 'num' || NO_SUM.test(c.key)) return null
      let sum = 0, any = false
      for (const r of view) { const v = r[c.key]; if (typeof v === 'number') { sum += v; any = true } }
      return any ? sum : null
    })
    return t.some(x => x !== null) ? t : null
  }, [view, vcols])

  const totalW = NUM_W + vcols.reduce((a, c) => a + c.w, 0)
  useEffect(() => { measureEdge() }, [totalW, cw]) // eslint-disable-line react-hooks/exhaustive-deps
  const bodyH = view.length * rowH
  const vh = height - 38 - (showFilters ? 40 : 0) - (totals ? rowH + 2 : 0)
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
    // أفقياً: نُبقي العمود المحدد ظاهراً (مع مراعاة عمود الأرقام والعمود المثبّت)
    let off = NUM_W
    for (let i = 0; i < c && i < vcols.length; i++) off += vcols[i].w
    const w = vcols[c]?.w || 0
    const pos = Math.abs(el.scrollLeft), cwid = el.clientWidth
    const lead = NUM_W + (pin && c > 0 ? (vcols[0]?.w || 0) : 0)
    let np = pos
    if (off - lead < pos) np = Math.max(0, off - lead)
    else if (off + w > pos + cwid) np = off + w - cwid
    if (np !== pos) el.scrollLeft = isAr ? -np : np
  }
  function onKey(e) {
    if (e.key === 'Enter' && sel && view[sel.r2]) { setDetail(sel.r2); return }
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

  useEffect(() => {
    if (detail === null) return
    const k = e => { if (e.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [detail])

  // ── تغيير عرض العمود بالسحب + تحريك الجدول باليد (مع زخم) + تمرير تلقائي أثناء سحب التحديد قرب الحافة
  useEffect(() => {
    const move = e => {
      ptr.current = { x: e.clientX, y: e.clientY }
      const rs = resize.current
      if (rs) {
        const d = (isAr ? rs.x - e.clientX : e.clientX - rs.x)
        setWidths(w => ({ ...w, [rs.key]: Math.max(60, Math.min(600, rs.w + d)) }))
        return
      }
      const p = pan.current, el = box.current
      if (p && el) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y
        if (!p.moved && Math.hypot(dx, dy) > 4) { p.moved = true; setPanning(true) }
        if (p.moved) {
          el.scrollLeft = p.sl - dx
          if (p.both) el.scrollTop = p.st - dy
          const now = performance.now(), dt = Math.max(1, now - p.t)
          p.vx = 0.8 * p.vx + 0.2 * ((p.lx - e.clientX) / dt * 16)
          p.lx = e.clientX; p.t = now
        }
      }
    }
    const up = () => {
      const p = pan.current
      if (p?.moved) {
        justPanned.current = true; setTimeout(() => { justPanned.current = false }, 60)
        let v = p.vx
        const step = () => { const el = box.current; if (!el || Math.abs(v) < 0.4) return; el.scrollLeft += v; v *= 0.94; momentum.current = requestAnimationFrame(step) }
        cancelAnimationFrame(momentum.current); momentum.current = requestAnimationFrame(step)
      }
      pan.current = null; setPanning(false)
      resize.current = null; drag.current = false
      clearInterval(auto.current); auto.current = null
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); cancelAnimationFrame(momentum.current); clearInterval(auto.current) }
  }, [isAr])

  const startPan = (e, both) => {
    const el = box.current; if (!el) return
    cancelAnimationFrame(momentum.current)
    pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false, both, vx: 0, lx: e.clientX, t: performance.now() }
  }
  // أثناء سحب تحديد الخلايا: إذا اقترب المؤشر من حافة الشبكة يتحرك الجدول تلقائياً
  const startAutoScroll = () => {
    clearInterval(auto.current)
    auto.current = setInterval(() => {
      const el = box.current; if (!el || !drag.current || pan.current) return
      const r = el.getBoundingClientRect(), { x, y } = ptr.current, edgeZ = 56
      const sp = d => Math.min(26, 4 + (edgeZ - d) / 2)
      if (x < r.left + edgeZ) el.scrollLeft -= sp(Math.max(0, x - r.left))
      else if (x > r.right - edgeZ) el.scrollLeft += sp(Math.max(0, r.right - x))
      if (y < r.top + 38 + edgeZ / 2) el.scrollTop -= 14
      else if (y > r.bottom - edgeZ / 2) el.scrollTop += 14
    }, 16)
  }

  const toggleSort = key => { if (justPanned.current) return; setSort(s => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null)) }
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

      <style>{`
        .dg-scroll{scrollbar-width:thin;scrollbar-color:var(--border-2) transparent}
        .dg-scroll::-webkit-scrollbar{height:12px;width:12px}
        .dg-scroll::-webkit-scrollbar-track{background:transparent}
        .dg-scroll::-webkit-scrollbar-thumb{background:var(--border-2);border-radius:99px;border:3px solid var(--card)}
        .dg-scroll::-webkit-scrollbar-thumb:hover{background:var(--accent)}
        .dg-wrap:hover .dg-arrow{opacity:.95 !important}
        .dg-arrow:hover{transform:scale(1.08)}
        @media (hover:none){.dg-arrow{opacity:.9 !important}}
      `}</style>
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
                <button type="button" style={{ ...tb(false), minHeight: 30 }} onClick={() => setHidden(new Set(hiddenByDefault))}>{T('الافتراضي', 'Default')}</button>
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
        <button type="button" style={tb(panMode)} aria-pressed={panMode} onClick={() => setPanMode(o => !o)} title={T('وضع اليد: اسحب الجدول بالماوس في أي اتجاه', 'Hand mode: drag the grid in any direction')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 00-4 0v5M14 10V4a2 2 0 00-4 0v7M10 10.5V6a2 2 0 00-4 0v8" /><path d="M18 8a2 2 0 014 0v6a8 8 0 01-8 8h-2c-2.5 0-4-1-5.3-2.4L3.4 15.6a2 2 0 013-2.6L8 14.5" /></svg>
          {T('يد', 'Hand')}
        </button>
        <button type="button" style={tb(pin)} aria-pressed={pin} onClick={() => setPin(o => !o)}>{T('تثبيت أول عمود', 'Freeze first column')}</button>

      </div>

      {/* الشبكة */}
      <div className="dg-wrap" style={{ position: 'relative' }}>
      <div ref={box} className="dg-scroll" tabIndex={0} role="grid" aria-rowcount={view.length} aria-colcount={vcols.length} onKeyDown={onKey}
        onScroll={e => { setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }); measureEdge() }}
        style={{ height, overflow: 'auto', position: 'relative', outline: 'none', direction: isAr ? 'rtl' : 'ltr', background: 'var(--card)', userSelect: panning || panMode ? 'none' : undefined, cursor: panMode ? (panning ? 'grabbing' : 'grab') : undefined }}>
        <div style={{ width: totalW, minWidth: '100%' }}>
          {/* الترويسة */}
          <div style={{ position: 'sticky', top: 0, zIndex: 4, background: 'var(--surface)' }}>
            <div onMouseDown={e => { if (e.button === 0) startPan(e, false) }} style={{ display: 'flex', height: 38, borderBottom: '2px solid var(--accent)', cursor: panning ? 'grabbing' : 'grab' }}>
              <div style={{ position: 'sticky', insetInlineStart: 0, zIndex: 5, width: NUM_W, minWidth: NUM_W, display: 'grid', placeItems: 'center', background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', color: 'var(--text-3)', fontSize: '0.66rem', fontWeight: 800 }}>#</div>
              {vcols.map((c, ci) => (
                <div key={c.key} role="columnheader" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  style={{ position: pin && ci === 0 ? 'sticky' : 'relative', ...(pin && ci === 0 ? { insetInlineStart: NUM_W, zIndex: 5 } : null), width: c.w, minWidth: c.w, background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button type="button" onClick={() => toggleSort(c.key)} title={T('اضغط للفرز', 'Click to sort')}
                    style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: '0.82rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0 8px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                    <span aria-hidden="true" style={{ color: sort?.key === c.key ? 'var(--accent)' : 'var(--text-3)', fontSize: 10, opacity: sort?.key === c.key ? 1 : 0.4 }}>{sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '⇅'}</span>
                  </button>
                  <i onMouseDown={e => { e.preventDefault(); e.stopPropagation(); resize.current = { key: c.key, x: e.clientX, w: c.w } }} aria-hidden="true"
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
                  <div style={{ position: 'sticky', insetInlineStart: 0, zIndex: 3, width: NUM_W, minWidth: NUM_W, height: rowH, display: 'grid', placeItems: 'center', background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', borderBottom: '1px solid var(--border)', color: n && r >= n.r1 && r <= n.r2 ? 'var(--accent)' : 'var(--text-3)', fontFamily: MONO, fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer' }} role="button" title={T('عرض كل تفاصيل الصف', 'Show full row details')} onClick={() => setDetail(r)}>{r + 1}</div>
                  {vcols.map((c, ci) => {
                    const v = row[c.key]
                    const text = display(c, v)
                    return (
                      <div key={c.key} role="gridcell" aria-selected={!!inSel(r, ci)} title={text}
                        onMouseDown={e => { box.current?.focus(); if (panMode) { e.preventDefault(); startPan(e, true); return } drag.current = true; startAutoScroll(); setSel(e.shiftKey && sel ? { ...sel, r2: r, c2: ci } : { r1: r, c1: ci, r2: r, c2: ci }) }}
                        onDoubleClick={() => setDetail(r)}
                        onMouseEnter={() => { if (drag.current && !resize.current) setSel(s => (s ? { ...s, r2: r, c2: ci } : s)) }}
                        style={cellStyle(c, ci, r)}>
                        {c.type === 'bool'
                          ? (v === null || v === undefined ? null : <span style={{ borderRadius: 99, padding: '1px 9px', fontSize: '0.68rem', fontWeight: 800, background: c.tones ? c.tones[!!v][0] : v ? 'var(--success-bg)' : 'var(--surface-2)', color: c.tones ? c.tones[!!v][1] : v ? 'var(--success)' : 'var(--text-3)' }}>{text}</span>)
                          : <span dir={c.type === 'text' ? 'auto' : 'ltr'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.88rem', color: 'var(--text-1)', fontFamily: c.type === 'num' || c.type === 'stamp' || c.type === 'date' ? MONO : 'inherit', fontWeight: c.type === 'num' ? 700 : 500 }}>{text}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {totals && view.length > 0 && (
            <div role="row" style={{ position: 'sticky', bottom: 0, zIndex: 4, display: 'flex', height: rowH + 2, width: totalW, background: 'var(--surface)', borderTop: '2px solid var(--accent)' }}>
              <div style={{ position: 'sticky', insetInlineStart: 0, zIndex: 5, width: NUM_W, minWidth: NUM_W, display: 'grid', placeItems: 'center', background: 'var(--surface)', borderInlineEnd: '1px solid var(--border-2)', fontWeight: 900, fontSize: '0.8rem', color: 'var(--accent)' }}>Σ</div>
              {vcols.map((c, ci) => (
                <div key={c.key} style={{ width: c.w, minWidth: c.w, display: 'flex', alignItems: 'center', justifyContent: c.type === 'num' ? 'flex-end' : 'flex-start', padding: '0 10px', boxSizing: 'border-box', borderInlineEnd: '1px solid var(--border)', fontFamily: MONO, fontWeight: 900, fontSize: '0.8rem', color: 'var(--text-1)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {totals[ci] !== null ? fmtN(totals[ci]) : (ci === 0 ? <span style={{ fontFamily: 'inherit', color: 'var(--text-2)', fontSize: '0.74rem' }}>{T(`الإجمالي (${view.length.toLocaleString('en-US')} صف)`, `Total (${view.length.toLocaleString('en-US')} rows)`)}</span> : null)}
                </div>
              ))}
            </div>
          )}
          {view.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.86rem', position: 'sticky', insetInlineStart: 0 }}>{T('لا توجد صفوف مطابقة', 'No matching rows')}</div>}
        </div>
      </div>

      {/* ظلال الأطراف وأسهم التحريك: تظهر فقط عند وجود أعمدة مخفية */}
      <i aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: isAr ? 0 : NUM_W, width: 44, pointerEvents: 'none', zIndex: 8, opacity: canL ? 1 : 0, transition: 'opacity .2s', background: 'linear-gradient(to right, rgba(0,0,0,.22), transparent)' }} />
      <i aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: isAr ? NUM_W : 0, width: 44, pointerEvents: 'none', zIndex: 8, opacity: canR ? 1 : 0, transition: 'opacity .2s', background: 'linear-gradient(to left, rgba(0,0,0,.22), transparent)' }} />
      {[['L', canL, -1], ['R', canR, 1]].map(([k, can, dir]) => (
        <button key={k} type="button" className="dg-arrow" onClick={() => panBy(dir)} aria-label={dir < 0 ? T('تحريك لليسار', 'Scroll left') : T('تحريك لليمين', 'Scroll right')} tabIndex={can ? 0 : -1}
          style={{ position: 'absolute', top: '50%', [dir < 0 ? 'left' : 'right']: 12, marginTop: -20, width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border-2)', background: 'var(--card)', color: 'var(--text-1)', display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 9, boxShadow: '0 4px 14px rgba(0,0,0,.28)', transition: 'opacity .18s, transform .18s', opacity: 0, pointerEvents: can ? 'auto' : 'none', visibility: can ? 'visible' : 'hidden' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dir < 0 ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}</svg>
        </button>
      ))}
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

      {detail !== null && view[detail] && (
        <>
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 59 }} />
          <aside role="dialog" aria-label={T('تفاصيل الصف', 'Row details')} dir={isAr ? 'rtl' : 'ltr'}
            style={{ position: 'fixed', top: 0, bottom: 0, insetInlineEnd: 0, width: 'min(460px, 100vw)', zIndex: 60, background: 'var(--card)', borderInlineStart: '1px solid var(--border-2)', boxShadow: 'var(--shadow-xl, 0 0 40px rgba(0,0,0,.35))', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface)' }}>
              <b style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-1)' }}>{T('تفاصيل الصف', 'Row details')} <span style={{ fontFamily: MONO, color: 'var(--text-3)' }}>{detail + 1} / {view.length.toLocaleString('en-US')}</span></b>
              <button type="button" style={tb(false)} disabled={detail <= 0} onClick={() => setDetail(d => Math.max(0, d - 1))} aria-label={T('السابق', 'Previous')}>▲</button>
              <button type="button" style={tb(false)} disabled={detail >= view.length - 1} onClick={() => setDetail(d => Math.min(view.length - 1, d + 1))} aria-label={T('التالي', 'Next')}>▼</button>
              <button type="button" style={tb(true)} onClick={() => setDetail(null)}>{T('إغلاق', 'Close')}</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {[false, true].map(tech => {
                const list = cols.filter(c => (tech ? hiddenByDefault.has(c.key) : !hiddenByDefault.has(c.key)) && !(view[detail][c.key] === null || view[detail][c.key] === undefined || view[detail][c.key] === ''))
                if (!list.length) return null
                return (
                  <div key={String(tech)} style={{ marginBottom: 14 }}>
                    {tech && <div style={{ fontSize: '0.66rem', fontWeight: 900, color: 'var(--text-3)', margin: '6px 4px', letterSpacing: '.05em' }}>{T('بيانات تقنية', 'Technical')}</div>}
                    {list.map(c => (
                      <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: 10, padding: '9px 6px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{c.label}</span>
                        <span dir="auto" style={{ color: 'var(--text-1)', fontWeight: 600, wordBreak: 'break-word', fontFamily: c.type === 'num' || c.type === 'stamp' || c.type === 'date' || c.type === 'id' ? MONO : 'inherit', textAlign: 'start' }}>{display(c, view[detail][c.key])}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

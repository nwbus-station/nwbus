import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { clearCached } from '../lib/pageCache'
import { isRestStation } from '../utils/stations'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

/* ── أنواع النقاط ─────────────────────────────────────── */
const KINDS = {
  main:    { ar: 'محطة رئيسية', en: 'Main station', color: '#1C2B36' },
  transit: { ar: 'نقطة توقف',   en: 'Stop point',   color: '#E8930C' },
  rest:    { ar: 'استراحة',      en: 'Rest stop',    color: '#0E9F9A' },
}
const INACTIVE = '#94a3b8'
const kindOf = s => (isRestStation(s) ? 'rest' : s.type === 'transit' ? 'transit' : 'main')
const colorOf = s => (s.is_active === false ? INACTIVE : KINDS[kindOf(s)].color)
const hasCoords = s => Number.isFinite(s.lat) && Number.isFinite(s.lng)
const nameOf = (s, isAr) => (isAr ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) || '—'
const mapsLink = s => s.maps_url || `https://www.google.com/maps?q=${s.lat},${s.lng}`

const TILES = {
  map: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors', sub: 'abc' },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri', sub: '' },
}

// قراءة إحداثيات من رابط Google Maps أو نص "lat, lng"
function parseCoords(text) {
  if (!text) return null
  const t = decodeURIComponent(String(text).trim())
  const pats = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
  ]
  for (const p of pats) {
    const m = t.match(p)
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) }
  }
  return null
}
const validCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
const outsideKsa = (lat, lng) => lat < 15 || lat > 33 || lng < 34 || lng > 57

const makeIcon = (color, { size = 14, selected = false, ghost = false } = {}) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:${size}px;height:${size}px">
    ${selected ? `<span style="position:absolute;inset:-7px;border-radius:50%;background:${color};opacity:.22"></span>` : ''}
    <div style="position:absolute;inset:0;border-radius:50%;background:${ghost ? '#fff' : color};border:${ghost ? `3px dashed ${color}` : '2.5px solid #fff'};box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
  </div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
})

/* ── مكونات الخريطة ───────────────────────────────────── */
function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 13, { duration: 1 }) }, [target])
  return null
}

function FitOnce({ points }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !points.length) return
    done.current = true
    map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [50, 50] })
  }, [points])
  return null
}

function MapEvents({ onClick, onZoom, onReady }) {
  const map = useMapEvents({
    click: e => onClick?.(e.latlng),
    zoomend: () => onZoom(map.getZoom()),
  })
  useEffect(() => {
    onReady(map)
    setTimeout(() => map.invalidateSize(), 60)
    const c = map.getContainer()
    const prevent = e => { if (e.touches && e.touches.length > 1) e.preventDefault() }
    const prevG = e => e.preventDefault()
    c.addEventListener('touchmove', prevent, { passive: false })
    c.addEventListener('gesturestart', prevG, { passive: false })
    c.addEventListener('gesturechange', prevG, { passive: false })
    return () => {
      c.removeEventListener('touchmove', prevent)
      c.removeEventListener('gesturestart', prevG)
      c.removeEventListener('gesturechange', prevG)
    }
  }, [map])
  return null
}

const Ico = ({ d, size = 14, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const ICONS = {
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7a3 3 0 100 6 3 3 0 000-6z',
  plus: 'M12 5v14M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  x: 'M18 6L6 18M6 6l12 12',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  route: 'M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4',
  layers: 'M12 2l10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  search: 'M21 21l-4.35-4.35M11 3a8 8 0 100 16 8 8 0 000-16z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  check: 'M20 6L9 17l-5-5',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
}

/* ══════════════════════════════════════════════════════════
   الصفحة
══════════════════════════════════════════════════════════ */
export default function MapPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile, isGeneralAdmin, grantCap } = useAuth()
  const canManage = isGeneralAdmin || grantCap('map_manage')

  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [tab, setTab] = useState('list')            // list | noloc | route
  const [base, setBase] = useState('sat')   // الافتراضي: صور الأقمار الصناعية لكل الحسابات
  const [zoom, setZoom] = useState(6)
  const [flyTarget, setFlyTarget] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [editing, setEditing] = useState(null)      // { mode:'relocate'|'add'|'place', id?, lat, lng, orig? }
  const [form, setForm] = useState(null)            // نموذج بيانات النقطة (إضافة/تعديل)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [linkText, setLinkText] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [routeFrom, setRouteFrom] = useState(null)
  const [routeTo, setRouteTo] = useState(null)
  const [routeInfo, setRouteInfo] = useState(null)  // { km, points }
  const [routeLoading, setRouteLoading] = useState(false)
  const [placeStationId, setPlaceStationId] = useState(null)   // وضع "تحديد نقطة ← اختيار محطة"
  const [placeSearch, setPlaceSearch] = useState('')
  const mapRef = useRef(null)

  const say = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200) }

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('stations')
      .select('id, name_ar, name_en, type, lat, lng, is_active, region, maps_url')
    if (error) { setFetchError(error.message); setLoading(false); return }
    const rows = (data ?? []).map(s => ({
      ...s,
      lat: s.lat == null || s.lat === '' ? null : Number(s.lat),
      lng: s.lng == null || s.lng === '' ? null : Number(s.lng),
    })).sort((a, b) => nameOf(a, true).localeCompare(nameOf(b, true), 'ar'))
    setStations(rows)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // منع تكبير المتصفح بالإصبعين أثناء استخدام الخريطة (iOS Safari)
  useEffect(() => {
    const pm = e => { if (e.touches && e.touches.length > 1) e.preventDefault() }
    const pg = e => e.preventDefault()
    document.addEventListener('touchstart', pm, { passive: false })
    document.addEventListener('touchmove', pm, { passive: false })
    document.addEventListener('gesturestart', pg, { passive: false })
    document.addEventListener('gesturechange', pg, { passive: false })
    return () => {
      document.removeEventListener('touchstart', pm); document.removeEventListener('touchmove', pm)
      document.removeEventListener('gesturestart', pg); document.removeEventListener('gesturechange', pg)
    }
  }, [])

  const located   = useMemo(() => stations.filter(hasCoords), [stations])
  const unlocated = useMemo(() => stations.filter(s => !hasCoords(s)), [stations])
  const selected  = useMemo(() => stations.find(s => s.id === selectedId) ?? null, [stations, selectedId])
  const regions   = useMemo(() => ['all', ...Array.from(new Set(stations.map(s => s.region).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'))], [stations])
  const counts = useMemo(() => ({
    all: stations.length,
    main: stations.filter(s => kindOf(s) === 'main').length,
    transit: stations.filter(s => kindOf(s) === 'transit').length,
    rest: stations.filter(s => kindOf(s) === 'rest').length,
  }), [stations])

  // كشف المواقع المشبوهة: نفس إحداثيات محطة ثانية (نسخ بالغلط)، أو رقم "مدوّر" تماماً
  // بدون أي كسور دقيقة (يدل غالباً إنه تقدير تقريبي على الخريطة مو موقع GPS حقيقي)
  const suspectIds = useMemo(() => {
    const byCoord = {}
    located.forEach(s => { const k = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`; (byCoord[k] ??= []).push(s.id) })
    const dup = new Set(Object.values(byCoord).filter(ids => ids.length > 1).flat())
    const round = new Set(located.filter(s => Math.round(s.lat * 100) === s.lat * 100 && Math.round(s.lng * 100) === s.lng * 100).map(s => s.id))
    return new Set([...dup, ...round])
  }, [located])
  const suspectReason = s => {
    const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`
    const isDup = located.some(o => o.id !== s.id && `${o.lat.toFixed(4)},${o.lng.toFixed(4)}` === key)
    if (isDup) return { ar: 'نفس موقع محطة ثانية بالضبط', en: 'Exact same location as another station' }
    return { ar: 'إحداثيات مدوّرة — يبدو موقعاً تقديرياً لا GPS دقيق', en: 'Rounded coordinates — looks approximate, not a precise GPS pin' }
  }

  const matches = s => {
    const q = search.trim().toLowerCase()
    return (kindFilter === 'all' || kindOf(s) === kindFilter)
      && (regionFilter === 'all' || s.region === regionFilter)
      && (!q || (s.name_ar || '').toLowerCase().includes(q) || (s.name_en || '').toLowerCase().includes(q) || (s.region || '').toLowerCase().includes(q))
  }
  const listRows = (tab === 'noloc' ? unlocated : tab === 'suspect' ? located.filter(st => suspectIds.has(st.id)) : (canManage ? stations : located)).filter(matches)
  const mapRows = located.filter(matches)

  /* ── اختيار نقطة ── */
  const focus = s => { if (hasCoords(s)) setFlyTarget({ lat: s.lat, lng: s.lng, zoom: Math.max(zoom, 12), t: Date.now() }) }
  function pick(s) {
    if (tab === 'route') {
      if (!hasCoords(s)) return
      if (!routeFrom) setRouteFrom(s)
      else if (!routeTo && s.id !== routeFrom.id) setRouteTo(s)
      else { setRouteFrom(s); setRouteTo(null) }
      focus(s)
      return
    }
    if (editing) return
    setSelectedId(s.id)
    focus(s)
    setDrawerOpen(false)
  }

  /* ── مسار بين نقطتين ── */
  useEffect(() => {
    if (!routeFrom || !routeTo) { setRouteInfo(null); return }
    let dead = false
    setRouteLoading(true)
    fetch(`https://router.project-osrm.org/route/v1/driving/${routeFrom.lng},${routeFrom.lat};${routeTo.lng},${routeTo.lat}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(d => {
        if (dead) return
        if (d.routes?.[0]) setRouteInfo({ km: Math.round(d.routes[0].distance / 1000), points: d.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]) })
        else throw new Error('no route')
      })
      .catch(() => {
        if (dead) return
        setRouteInfo({ km: Math.round(L.latLng(routeFrom.lat, routeFrom.lng).distanceTo(L.latLng(routeTo.lat, routeTo.lng)) / 1000), points: null, straight: true })
      })
      .finally(() => { if (!dead) setRouteLoading(false) })
    return () => { dead = true }
  }, [routeFrom?.id, routeTo?.id])

  /* ══ الإدارة ══════════════════════════════════════════ */
  function startRelocate(s) {
    setSelectedId(s.id); setForm(null); setLinkText('')
    setEditing({ mode: 'relocate', id: s.id, lat: s.lat, lng: s.lng, orig: hasCoords(s) ? { lat: s.lat, lng: s.lng } : null })
    if (hasCoords(s)) focus(s)
    setDrawerOpen(false)
  }
  function startAdd() {
    setSelectedId(null); setLinkText('')
    setEditing({ mode: 'add', lat: null, lng: null })
    setForm({ id: null, name_ar: '', name_en: '', kind: 'main', region: '', is_active: true })
    setDrawerOpen(false)
  }
  function startPlace() {
    setSelectedId(null); setLinkText(''); setForm(null)
    setEditing({ mode: 'place', lat: null, lng: null })
    setPlaceStationId(null); setPlaceSearch('')
    setDrawerOpen(false)
  }
  function startEditInfo(s) {
    setEditing(null); setLinkText('')
    setForm({ id: s.id, name_ar: s.name_ar || '', name_en: s.name_en || '', kind: kindOf(s), region: s.region || '', is_active: s.is_active !== false })
  }
  function cancelEdit() { setEditing(null); setForm(null); setLinkText(''); setPlaceStationId(null); setPlaceSearch('') }

  function onMapClick(latlng) {
    if (!editing) return
    setLinkText('')
    setEditing(e => ({ ...e, lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) }))
  }
  function applyLink(text) {
    setLinkText(text)
    const c = parseCoords(text)
    if (c && validCoords(c.lat, c.lng)) {
      setEditing(e => ({ ...(e ?? { mode: 'add' }), lat: c.lat, lng: c.lng }))
      setFlyTarget({ lat: c.lat, lng: c.lng, zoom: 14, t: Date.now() })
    }
  }

  const movedKm = editing?.orig && validCoords(editing.lat, editing.lng)
    ? L.latLng(editing.orig.lat, editing.orig.lng).distanceTo(L.latLng(editing.lat, editing.lng)) / 1000 : null

  async function saveLocation() {
    if (!editing || !validCoords(editing.lat, editing.lng)) { say(isAr ? 'حدد موقعاً صحيحاً على الخريطة' : 'Pick a valid location', 'err'); return }
    const targetId = editing.mode === 'place' ? placeStationId : editing.id
    if (!targetId) { say(isAr ? 'اختر المحطة اللي تخص هذا الموقع' : 'Choose the station this location belongs to', 'err'); return }
    setSaving(true)
    const { error } = await supabase.from('stations')
      .update({ lat: editing.lat, lng: editing.lng, maps_url: null }).eq('id', targetId)
    setSaving(false)
    if (error) { say(error.message, 'err'); return }
    clearCached('stations_all')
    await load()
    say(isAr ? 'تم تحديث موقع المحطة' : 'Location updated')
    setSelectedId(targetId)
    cancelEdit()
  }

  async function saveForm() {
    if (!form) return
    const nameAr = form.name_ar.trim(), nameEn = form.name_en.trim()
    if (!nameAr && !nameEn) { say(isAr ? 'اسم المحطة مطلوب' : 'Name is required', 'err'); return }
    let en = nameEn || nameAr
    if (form.kind === 'rest' && !/only\s*rest/i.test(en) && !/استراحة/.test(nameAr)) en = `${en} (ONLY REST)`
    const payload = {
      name_ar: nameAr || en, name_en: en,
      type: form.kind === 'main' ? 'main' : 'transit',
      region: form.region.trim() || null,
      is_active: form.is_active,
    }
    if (form.id == null) {
      if (!editing || !validCoords(editing.lat, editing.lng)) { say(isAr ? 'اضغط على الخريطة لتحديد الموقع أولاً' : 'Click the map to set the location first', 'err'); return }
      payload.lat = editing.lat; payload.lng = editing.lng; payload.created_by = profile?.id
    }
    setSaving(true)
    const res = form.id == null
      ? await supabase.from('stations').insert(payload).select('id').single()
      : await supabase.from('stations').update(payload).eq('id', form.id).select('id').single()
    setSaving(false)
    if (res.error) { say(res.error.message, 'err'); return }
    clearCached('stations_all')
    await load()
    say(form.id == null ? (isAr ? 'تمت إضافة النقطة' : 'Point added') : (isAr ? 'تم حفظ البيانات' : 'Saved'))
    const newId = res.data?.id
    setForm(null); setEditing(null); setLinkText('')
    if (newId) setSelectedId(newId)
  }

  async function toggleActive(s) {
    const { error } = await supabase.from('stations').update({ is_active: s.is_active === false }).eq('id', s.id)
    if (error) { say(error.message, 'err'); return }
    clearCached('stations_all'); await load()
    say(s.is_active === false ? (isAr ? 'تم تفعيل النقطة' : 'Activated') : (isAr ? 'تم تعطيل النقطة' : 'Deactivated'))
  }

  const copyLink = s => {
    navigator.clipboard?.writeText(mapsLink(s))
    setCopiedId(s.id); setTimeout(() => setCopiedId(null), 1500)
  }

  const picking = !!editing
  const editingStation = editing?.mode === 'place' ? (stations.find(s => s.id === placeStationId) ?? null) : editing?.id ? stations.find(s => s.id === editing.id) : null
  const showLabels = zoom >= 10

  /* ══ الواجهة ══════════════════════════════════════════ */
  const chip = (active, color = '#1C2B36') => ({
    padding: '5px 11px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1.5px solid ${active ? color : '#e5e7eb'}`, background: active ? color : '#fff', color: active ? '#fff' : '#475569',
  })
  const btn = (kind = 'ghost') => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
    fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap',
    ...(kind === 'primary' ? { background: '#1C2B36', color: '#fff', border: '1.5px solid #1C2B36' }
      : kind === 'danger' ? { background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca' }
      : kind === 'accent' ? { background: '#E8930C', color: '#fff', border: '1.5px solid #E8930C' }
      : { background: '#fff', color: '#334155', border: '1.5px solid #e2e8f0' }),
  })
  const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }

  const Legend = () => (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.68rem', color: '#475569' }}>
      {Object.entries(KINDS).map(([k, v]) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: v.color, display: 'inline-block' }} />{isAr ? v.ar : v.en}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: INACTIVE, display: 'inline-block' }} />{isAr ? 'غير نشطة' : 'Inactive'}
      </span>
    </div>
  )

  return (
    <div className="map-outer" dir={isAr ? 'rtl' : 'ltr'} style={{ display: 'flex', height: 'calc(100vh - 98px)', background: '#eef1f4', position: 'relative' }}>
      <style>{`
        @media (max-width: 767px) {
          .map-outer { height: calc(100vh - 54px - 60px - env(safe-area-inset-bottom)) !important; }
          .map-sidebar { position: fixed !important; bottom: calc(60px + env(safe-area-inset-bottom)); left: 0; right: 0; top: auto !important; width: 100% !important; height: 68vh; border-radius: 18px 18px 0 0; transform: translateY(calc(100% + 60px)); transition: transform .3s ease; z-index: 550 !important; border-inline-end: none !important; box-shadow: 0 -6px 28px rgba(0,0,0,.18) !important; }
          .map-sidebar.open { transform: translateY(0); }
          .map-fab { display: flex !important; bottom: calc(60px + env(safe-area-inset-bottom) + 16px) !important; z-index: 560 !important; }
          .map-overlay { bottom: calc(60px + env(safe-area-inset-bottom)) !important; }
          .map-card { inset-inline-start: 8px !important; inset-inline-end: 8px !important; width: auto !important; bottom: calc(8px) !important; }
        }
        @media (min-width: 768px) { .map-fab, .map-overlay, .map-handle { display: none !important; } }
        .leaflet-container { touch-action: none !important; font-family: inherit; }
        .leaflet-tooltip.st-label { background: rgba(255,255,255,.92); border: none; box-shadow: 0 1px 4px rgba(0,0,0,.25); color: #0f172a; font-weight: 700; font-size: 11px; padding: 2px 6px; }
        .map-pick .leaflet-container { cursor: crosshair !important; }
      `}</style>

      <div className="map-overlay" onClick={() => setDrawerOpen(false)}
        style={{ display: drawerOpen ? 'block' : 'none', position: 'fixed', top: 58, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.3)', zIndex: 490 }} />
      <button className="map-fab" onClick={() => setDrawerOpen(o => !o)}
        style={{ display: 'none', position: 'fixed', bottom: 20, right: 16, zIndex: 510, width: 48, height: 48, borderRadius: '50%', background: '#1C2B36', border: 'none', color: '#fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.25)', cursor: 'pointer' }}>
        <Ico d={drawerOpen ? ICONS.x : ICONS.list} size={18} sw={2.4} />
      </button>

      {/* ══ الشريط الجانبي ══ */}
      <aside className={`map-sidebar${drawerOpen ? ' open' : ''}`} style={{ width: 340, background: '#fff', borderInlineEnd: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0 }}>
        <div className="map-handle" style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}><div style={{ width: 36, height: 4, borderRadius: 99, background: '#ddd' }} /></div>

        {/* الرأس */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{isAr ? 'خريطة المحطات' : 'Stations Map'}</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                {isAr ? `${counts.all} نقطة · ${located.length} بموقع · ${unlocated.length} بدون موقع` : `${counts.all} points · ${located.length} located · ${unlocated.length} unlocated`}
              </p>
            </div>
            {canManage && (
              <button onClick={() => { setManageMode(m => !m); cancelEdit() }} style={btn(manageMode ? 'accent' : 'ghost')}>
                <Ico d={ICONS.edit} size={13} />{isAr ? 'وضع الإدارة' : 'Manage'}
              </button>
            )}
          </div>
          {manageMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <button onClick={startAdd} style={{ ...btn('primary'), width: '100%' }}>
                <Ico d={ICONS.plus} size={14} sw={2.5} />{isAr ? 'إضافة محطة أو نقطة توقف' : 'Add station / stop'}
              </button>
              <button onClick={startPlace} style={{ ...btn('ghost'), width: '100%' }}>
                <Ico d={ICONS.pin} size={14} sw={2.5} />{isAr ? 'تحديد نقطة على الخريطة لمحطة موجودة' : 'Pick a map point for an existing station'}
              </button>
            </div>
          )}
        </div>

        {/* التبويبات */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
          {[
            ['list', isAr ? 'النقاط' : 'Points'],
            ...(canManage ? [['noloc', `${isAr ? 'بدون موقع' : 'No location'} (${unlocated.length})`]] : []),
            ...(canManage && suspectIds.size ? [['suspect', `${isAr ? 'قد تحتاج تحقق' : 'Needs review'} (${suspectIds.size})`]] : []),
            ['route', isAr ? 'مسار' : 'Route'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); if (id !== 'route') { setRouteFrom(null); setRouteTo(null) } }}
              style={{ flex: 1, padding: '10px 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: tab === id ? 800 : 500, color: tab === id ? '#0f172a' : '#94a3b8', borderBottom: `2.5px solid ${tab === id ? '#1C2B36' : 'transparent'}` }}>
              {label}
            </button>
          ))}
        </div>

        {/* المسار */}
        {tab === 'route' && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 6 }}>{isAr ? 'اختر نقطتين من القائمة أو الخريطة' : 'Pick two points from the list or map'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, padding: '6px 8px', borderRadius: 7, background: routeFrom ? '#1C2B36' : '#e2e8f0', color: routeFrom ? '#fff' : '#94a3b8', fontSize: '0.72rem', fontWeight: 700 }}>{routeFrom ? nameOf(routeFrom, isAr) : (isAr ? 'من…' : 'From…')}</div>
              <div style={{ flex: 1, padding: '6px 8px', borderRadius: 7, background: routeTo ? '#E8930C' : '#e2e8f0', color: routeTo ? '#fff' : '#94a3b8', fontSize: '0.72rem', fontWeight: 700 }}>{routeTo ? nameOf(routeTo, isAr) : (isAr ? 'إلى…' : 'To…')}</div>
            </div>
            {routeLoading && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>{isAr ? 'جارٍ حساب المسافة…' : 'Calculating…'}</div>}
            {routeInfo && !routeLoading && (
              <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#0f172a', fontWeight: 800, textAlign: 'center' }}>
                {isAr ? `${routeInfo.straight ? 'المسافة المباشرة' : 'مسافة الطريق'}: ${routeInfo.km} كم` : `${routeInfo.straight ? 'Straight distance' : 'Road distance'}: ${routeInfo.km} km`}
              </div>
            )}
          </div>
        )}

        {/* الفلاتر */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [isAr ? 'right' : 'left']: 10, color: '#94a3b8' }}><Ico d={ICONS.search} size={13} /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? 'ابحث بالاسم أو المنطقة…' : 'Search name or region…'}
              style={{ ...input, padding: isAr ? '8px 30px 8px 10px' : '8px 10px 8px 30px' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <button onClick={() => setKindFilter('all')} style={chip(kindFilter === 'all')}>{isAr ? 'الكل' : 'All'} {counts.all}</button>
            {Object.entries(KINDS).map(([k, v]) => counts[k] > 0 && (
              <button key={k} onClick={() => setKindFilter(k)} style={chip(kindFilter === k, v.color)}>{isAr ? v.ar : v.en} {counts[k]}</button>
            ))}
          </div>
          {regions.length > 2 && (
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ ...input, padding: '6px 8px', fontSize: '0.76rem' }}>
              {regions.map(r => <option key={r} value={r}>{r === 'all' ? (isAr ? 'كل المناطق' : 'All regions') : r}</option>)}
            </select>
          )}
        </div>

        {/* القائمة */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '6px 8px' }}>
          {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>
            : listRows.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                {tab === 'noloc' ? (isAr ? 'كل المحطات لها مواقع' : 'All stations have locations')
                  : tab === 'suspect' ? (isAr ? 'ما فيه مواقع مشبوهة حالياً' : 'No suspicious locations right now')
                  : (isAr ? 'لا نتائج' : 'No results')}
              </div>
            ) : listRows.map(s => {
              const isSel = selectedId === s.id
              const isFrom = routeFrom?.id === s.id, isTo = routeTo?.id === s.id
              const on = isSel || isFrom || isTo
              const noLoc = !hasCoords(s)
              const isSuspect = canManage && suspectIds.has(s.id)
              return (
                <div key={s.id} onClick={() => !noLoc && pick(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, marginBottom: 2, cursor: noLoc ? 'default' : 'pointer',
                    background: isFrom ? '#1C2B36' : isTo ? '#E8930C' : isSel ? '#eef2f7' : isSuspect ? '#fffbeb' : 'transparent', color: isFrom || isTo ? '#fff' : '#0f172a' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: isSuspect ? '#D97706' : colorOf(s), flexShrink: 0, boxShadow: on ? `0 0 0 3px ${colorOf(s)}33` : 'none' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(s, isAr)}</div>
                    <div style={{ fontSize: '0.68rem', color: isFrom || isTo ? 'rgba(255,255,255,.75)' : '#94a3b8', marginTop: 1 }}>
                      {isAr ? KINDS[kindOf(s)].ar : KINDS[kindOf(s)].en}{s.region ? ` · ${s.region}` : ''}{s.is_active === false ? (isAr ? ' · غير نشطة' : ' · inactive') : ''}
                    </div>
                    {isSuspect && (
                      <div style={{ fontSize: '0.66rem', color: '#B45309', marginTop: 2, fontWeight: 600 }}>
                        ⚠ {isAr ? suspectReason(s).ar : suspectReason(s).en}
                      </div>
                    )}
                  </div>
                  {manageMode && canManage && (
                    noLoc
                      ? <button onClick={e => { e.stopPropagation(); startRelocate(s) }} style={{ ...btn('accent'), padding: '5px 9px', fontSize: '0.7rem' }}><Ico d={ICONS.pin} size={12} />{isAr ? 'تحديد الموقع' : 'Set'}</button>
                      : <button onClick={e => { e.stopPropagation(); startRelocate(s) }} title={isAr ? 'تعديل الموقع' : 'Relocate'} style={{ ...btn(), padding: 6 }}><Ico d={ICONS.move} size={13} /></button>
                  )}
                </div>
              )
            })}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}><Legend /></div>
      </aside>

      {/* ══ الخريطة ══ */}
      <div className={picking ? 'map-pick' : ''} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {fetchError && <div style={{ padding: 14, background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 }}>{isAr ? 'خطأ: ' : 'Error: '}{fetchError}</div>}

        <MapContainer center={[23.8859, 45.0792]} zoom={6} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <MapEvents onClick={onMapClick} onZoom={setZoom} onReady={m => { mapRef.current = m }} />
          <TileLayer key={base} url={TILES[base].url} attribution={TILES[base].attr} subdomains={TILES[base].sub || 'abc'} maxZoom={19} />
          <FitOnce points={located} />
          {flyTarget && <FlyTo target={flyTarget} />}

          {routeInfo?.points && <Polyline positions={routeInfo.points} pathOptions={{ color: '#1C2B36', weight: 5, opacity: 0.85 }} />}
          {routeInfo?.straight && routeFrom && routeTo && <Polyline positions={[[routeFrom.lat, routeFrom.lng], [routeTo.lat, routeTo.lng]]} pathOptions={{ color: '#1C2B36', weight: 3, dashArray: '8 6', opacity: 0.6 }} />}

          {/* الموقع القديم أثناء التعديل + خط الانتقال */}
          {editing?.mode === 'relocate' && editing.orig && validCoords(editing.lat, editing.lng) && (
            <Polyline positions={[[editing.orig.lat, editing.orig.lng], [editing.lat, editing.lng]]} pathOptions={{ color: '#E8930C', weight: 2, dashArray: '5 6' }} />
          )}

          {mapRows.filter(s => !(editing?.mode === 'relocate' && editing.id === s.id)).map(s => {
            const isSel = selectedId === s.id || routeFrom?.id === s.id || routeTo?.id === s.id
            const isSuspect = canManage && suspectIds.has(s.id)
            return (
              <Marker key={`${s.id}-${showLabels}-${isSel}`} position={[s.lat, s.lng]}
                icon={makeIcon(routeTo?.id === s.id ? '#E8930C' : isSuspect ? '#D97706' : colorOf(s), { size: isSel ? 19 : isSuspect ? 15 : 13, selected: isSel })}
                eventHandlers={{ click: () => pick(s) }}>
                <Tooltip className="st-label" direction="top" offset={[0, -8]} permanent={showLabels || isSel}>{nameOf(s, isAr)}{isSuspect ? ' ⚠' : ''}</Tooltip>
              </Marker>
            )
          })}

          {/* النقطة قيد التعديل / الإضافة (قابلة للسحب) */}
          {editing && validCoords(editing.lat, editing.lng) && (
            <Marker key={`edit-${editing.id ?? 'new'}`} position={[editing.lat, editing.lng]} draggable
              icon={makeIcon('#E8930C', { size: 22, selected: true })}
              eventHandlers={{ dragend: e => { const p = e.target.getLatLng(); setEditing(cur => ({ ...cur, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) })) } }}>
              <Tooltip className="st-label" direction="top" offset={[0, -12]} permanent>{editingStation ? nameOf(editingStation, isAr) : (isAr ? 'الموقع الجديد' : 'New location')}</Tooltip>
            </Marker>
          )}
        </MapContainer>

        {/* شريط أدوات الخريطة */}
        <div style={{ position: 'absolute', top: 12, [isAr ? 'left' : 'right']: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,.15)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            {[{ l: '+', fn: () => mapRef.current?.zoomIn() }, { l: '−', fn: () => mapRef.current?.zoomOut() }].map((b, i) => (
              <button key={i} onClick={b.fn} style={{ display: 'block', width: 36, height: 36, background: 'none', border: 'none', borderBottom: i === 0 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: '1.15rem', fontWeight: 700, color: '#334155' }}>{b.l}</button>
            ))}
          </div>
          <button onClick={() => setBase(b => (b === 'map' ? 'sat' : 'map'))} title={isAr ? 'تبديل نوع الخريطة' : 'Toggle base map'}
            style={{ width: 36, height: 36, borderRadius: 10, background: base === 'sat' ? '#1C2B36' : '#fff', color: base === 'sat' ? '#fff' : '#334155', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,.15)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <Ico d={ICONS.layers} size={16} />
          </button>
          <button onClick={() => located.length && mapRef.current?.fitBounds(L.latLngBounds(located.map(p => [p.lat, p.lng])), { padding: [50, 50] })} title={isAr ? 'عرض كل النقاط' : 'Fit all'}
            style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,.15)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <Ico d={ICONS.pin} size={16} />
          </button>
        </div>

        {/* رسالة النجاح/الخطأ */}
        {toast && (
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, padding: '9px 16px', borderRadius: 10, background: toast.kind === 'err' ? '#dc2626' : '#16a34a', color: '#fff', fontSize: '0.8rem', fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>{toast.msg}</div>
        )}

        {/* لوحة الإدارة: تعديل موقع / إضافة */}
        {(editing || form) && (
          <div className="map-card" style={{ position: 'absolute', bottom: 16, [isAr ? 'right' : 'left']: 16, width: 360, maxHeight: '78%', overflowY: 'auto', zIndex: 1050, background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.28)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff7ed', borderRadius: '14px 14px 0 0' }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#9a3412' }}>
                {editing?.mode === 'relocate' ? (isAr ? `تعديل موقع: ${editingStation ? nameOf(editingStation, isAr) : ''}` : 'Relocate')
                  : editing?.mode === 'place' ? (isAr ? 'تحديد موقع لمحطة موجودة' : 'Place point for a station')
                  : form?.id == null ? (isAr ? 'إضافة محطة / نقطة توقف' : 'Add station / stop') : (isAr ? 'تعديل بيانات النقطة' : 'Edit point')}
              </div>
              <button onClick={cancelEdit} style={{ ...btn(), padding: 5 }}><Ico d={ICONS.x} size={13} sw={2.5} /></button>
            </div>

            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {form && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label style={lbl}>{isAr ? 'الاسم بالعربي' : 'Arabic name'}</label><input style={input} value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} /></div>
                    <div><label style={lbl}>{isAr ? 'الاسم بالإنجليزي' : 'English name'}</label><input style={input} dir="ltr" value={form.name_en} onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lbl}>{isAr ? 'النوع' : 'Type'}</label>
                      <select style={input} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
                        {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{isAr ? v.ar : v.en}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>{isAr ? 'المنطقة' : 'Region'}</label>
                      <input style={input} list="map-regions" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
                      <datalist id="map-regions">{regions.filter(r => r !== 'all').map(r => <option key={r} value={r} />)}</datalist>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />{isAr ? 'نقطة نشطة' : 'Active'}
                  </label>
                </>
              )}

              {editing && (
                <>
                  <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '9px 11px', fontSize: '0.76rem', color: '#475569', lineHeight: 1.7 }}>
                    {validCoords(editing.lat, editing.lng)
                      ? (editing.mode === 'place'
                          ? (isAr ? 'تم تحديد الموقع. اسحب النقطة لتعديلها، واختر تحت أي محطة تخصها.' : 'Location set. Drag to adjust, then choose which station it belongs to below.')
                          : (isAr ? 'اسحب النقطة البرتقالية أو اضغط على الخريطة لتغيير الموقع.' : 'Drag the orange point or click the map to move it.'))
                      : (isAr ? 'اضغط على الخريطة لتحديد الموقع، أو الصق رابط Google Maps / الإحداثيات تحت.' : 'Click the map to set the location, or paste a Google Maps link / coordinates below.')}
                  </div>
                  <div>
                    <label style={lbl}>{isAr ? 'لصق رابط Google Maps أو إحداثيات (lat, lng)' : 'Paste Google Maps link or lat, lng'}</label>
                    <input style={input} dir="ltr" value={linkText} onChange={e => applyLink(e.target.value)} placeholder="24.7136, 46.6753" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label style={lbl}>Lat</label><input style={{ ...input, direction: 'ltr' }} inputMode="decimal" value={editing.lat ?? ''} onChange={e => setEditing(c => ({ ...c, lat: e.target.value === '' ? null : Number(e.target.value) }))} /></div>
                    <div><label style={lbl}>Lng</label><input style={{ ...input, direction: 'ltr' }} inputMode="decimal" value={editing.lng ?? ''} onChange={e => setEditing(c => ({ ...c, lng: e.target.value === '' ? null : Number(e.target.value) }))} /></div>
                  </div>
                  {movedKm != null && (
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: movedKm > 50 ? '#dc2626' : '#16a34a' }}>
                      {isAr ? `المسافة عن الموقع القديم: ${movedKm < 1 ? `${Math.round(movedKm * 1000)} م` : `${movedKm.toFixed(1)} كم`}` : `Moved ${movedKm.toFixed(2)} km`}
                      {movedKm > 50 && (isAr ? ' — تأكد أن هذا صحيح' : ' — double check')}
                    </div>
                  )}
                  {validCoords(editing.lat, editing.lng) && outsideKsa(editing.lat, editing.lng) && (
                    <div style={{ fontSize: '0.74rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 9px' }}>{isAr ? 'الموقع خارج نطاق المملكة — تأكد من الإحداثيات.' : 'Location is outside Saudi Arabia — check the coordinates.'}</div>
                  )}
                  {editing.mode === 'place' && (
                    <div>
                      <label style={lbl}>{isAr ? 'اختر المحطة' : 'Choose station'}{placeStationId ? ` — ${nameOf(stations.find(s => s.id === placeStationId) ?? {}, isAr)}` : ''}</label>
                      <input style={{ ...input, marginBottom: 6 }} value={placeSearch} onChange={e => setPlaceSearch(e.target.value)}
                        placeholder={isAr ? 'ابحث عن محطة…' : 'Search stations…'} />
                      <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, maxHeight: 170, overflowY: 'auto' }}>
                        {stations
                          .filter(s => { const q = placeSearch.trim().toLowerCase(); return !q || (s.name_ar || '').toLowerCase().includes(q) || (s.name_en || '').toLowerCase().includes(q) })
                          .sort((a, b) => (hasCoords(a) ? 1 : 0) - (hasCoords(b) ? 1 : 0))
                          .map(s => (
                            <div key={s.id} onClick={() => setPlaceStationId(s.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: '0.78rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: placeStationId === s.id ? '#eef2f7' : 'transparent' }}>
                              <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${placeStationId === s.id ? '#1C2B36' : '#cbd5e1'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                {placeStationId === s.id && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1C2B36' }} />}
                              </span>
                              <span style={{ flex: 1, fontWeight: placeStationId === s.id ? 700 : 500 }}>{nameOf(s, isAr)}</span>
                              {!hasCoords(s) && <span style={{ fontSize: '0.64rem', color: '#94a3b8' }}>{isAr ? 'بدون موقع' : 'no location'}</span>}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={saving || (editing?.mode === 'place' && !placeStationId)} onClick={form ? saveForm : saveLocation} style={{ ...btn('primary'), flex: 1, opacity: (saving || (editing?.mode === 'place' && !placeStationId)) ? .6 : 1 }}>
                  <Ico d={ICONS.check} size={14} sw={2.6} />{saving ? '…' : (isAr ? 'حفظ' : 'Save')}
                </button>
                <button onClick={cancelEdit} style={btn()}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              </div>
            </div>
          </div>
        )}

        {/* بطاقة النقطة المحددة */}
        {selected && !editing && !form && tab !== 'route' && hasCoords(selected) && (
          <div className="map-card" style={{ position: 'absolute', bottom: 16, [isAr ? 'right' : 'left']: 16, width: 340, zIndex: 1000, background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.25)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ height: 5, background: colorOf(selected) }} />
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{nameOf(selected, isAr)}</div>
                  {(isAr ? selected.name_en : selected.name_ar) && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }} dir={isAr ? 'ltr' : 'rtl'}>{isAr ? selected.name_en : selected.name_ar}</div>}
                </div>
                <button onClick={() => setSelectedId(null)} style={{ ...btn(), padding: 5 }}><Ico d={ICONS.x} size={12} sw={2.5} /></button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: `${colorOf(selected)}1f`, color: colorOf(selected) }}>{isAr ? KINDS[kindOf(selected)].ar : KINDS[kindOf(selected)].en}</span>
                {selected.region && <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>{selected.region}</span>}
                {selected.is_active === false && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: '#fef2f2', color: '#dc2626' }}>{isAr ? 'غير نشطة' : 'Inactive'}</span>}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace', marginTop: 9, direction: 'ltr', textAlign: isAr ? 'right' : 'left' }}>{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</div>
              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                <a href={mapsLink(selected)} target="_blank" rel="noopener noreferrer" style={{ ...btn('primary'), flex: 1 }}><Ico d={ICONS.pin} size={13} />{isAr ? 'فتح في الخرائط' : 'Open in Maps'}</a>
                <button onClick={() => copyLink(selected)} style={btn()} title={isAr ? 'نسخ الرابط' : 'Copy link'}><Ico d={copiedId === selected.id ? ICONS.check : ICONS.copy} size={13} /></button>
                <button onClick={() => { setTab('route'); setRouteFrom(selected); setRouteTo(null) }} style={btn()} title={isAr ? 'مسار من هنا' : 'Route from here'}><Ico d={ICONS.route} size={13} /></button>
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: 7, marginTop: 8, paddingTop: 9, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  <button onClick={() => { setManageMode(true); startRelocate(selected) }} style={{ ...btn('accent'), flex: 1 }}><Ico d={ICONS.move} size={13} />{isAr ? 'تعديل الموقع' : 'Relocate'}</button>
                  <button onClick={() => { setManageMode(true); startEditInfo(selected) }} style={btn()}><Ico d={ICONS.edit} size={13} />{isAr ? 'البيانات' : 'Edit'}</button>
                  <button onClick={() => toggleActive(selected)} style={btn(selected.is_active === false ? 'ghost' : 'danger')}>{selected.is_active === false ? (isAr ? 'تفعيل' : 'Activate') : (isAr ? 'تعطيل' : 'Deactivate')}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

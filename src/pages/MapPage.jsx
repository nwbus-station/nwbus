import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useTranslation } from 'react-i18next'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const makeIcon = (color, size = 14) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>`,
  iconSize: [size, size],
  iconAnchor: [size/2, size/2],
})

function FlyTo({ coords }) {
  const map = useMap()
  useEffect(() => { if (coords) map.flyTo(coords, 13, { duration: 1.2 }) }, [coords])
  return null
}

function FitBounds({ stations }) {
  const map = useMap()
  useEffect(() => {
    if (stations.length > 0) {
      const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [])
  return null
}

export default function MapPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [stations, setStations] = useState([])
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [flyTo, setFlyTo] = useState(null)
  const [regionFilter, setRegionFilter] = useState('all')
  const [routeMode, setRouteMode] = useState(false)
  const [routeFrom, setRouteFrom] = useState(null)
  const [routeTo, setRouteTo] = useState(null)
  const markerRefs = useRef({})

  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    supabase.from('stations')
      .select('id, name_ar, name_en, lat, lng, is_active, region, maps_url')
      .then(({ data, error }) => {
        if (error) { setFetchError(error.message); setLoading(false); return }
        setStations((data ?? []).filter(s => s.lat && s.lng))
        setLoading(false)
      })
  }, [])

  const regions = ['all', ...Array.from(new Set(stations.map(s => s.region).filter(Boolean))).sort()]

  const filtered = stations.filter(s => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q || (s.name_ar||'').includes(q) || (s.name_en||'').toLowerCase().includes(q)
    const matchRegion = regionFilter === 'all' || s.region === regionFilter
    return matchSearch && matchRegion
  })

  const saudiCenter = [23.8859, 45.0792]

  function selectStation(s) {
    if (routeMode) {
      if (!routeFrom) { setRouteFrom(s); setFlyTo([s.lat, s.lng]) }
      else if (!routeTo && s.id !== routeFrom.id) { setRouteTo(s); setFlyTo([s.lat, s.lng]) }
      else { setRouteFrom(s); setRouteTo(null); setFlyTo([s.lat, s.lng]) }
      return
    }
    setSelected(s)
    setFlyTo([s.lat, s.lng])
    setTimeout(() => { markerRefs.current[s.id]?.openPopup() }, 1400)
  }

  function getMarkerColor(s) {
    if (routeMode) {
      if (routeFrom?.id === s.id) return '#1C2B36'
      if (routeTo?.id === s.id) return '#F5A623'
      return '#94a3b8'
    }
    return selected?.id === s.id ? '#1C2B36' : '#64748b'
  }

  function getMarkerSize(s) {
    if (routeFrom?.id === s.id || routeTo?.id === s.id) return 18
    if (selected?.id === s.id) return 18
    return 12
  }

  const routeDistance = routeFrom && routeTo
    ? (L.latLng(routeFrom.lat, routeFrom.lng).distanceTo(L.latLng(routeTo.lat, routeTo.lng)) / 1000).toFixed(0)
    : null

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', background: '#f0f0f0', position: 'relative' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Sidebar ── */}
      <div style={{ width: 290, background: '#fff', borderInlineEnd: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '2px 0 12px rgba(0,0,0,0.06)', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: '#1C2B36', color: '#fff' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16"/><path d="M16 6v16"/>
                </svg>
              </span>
              {isAr ? 'خريطة المحطات' : 'Stations Map'}
            </h2>
            <span style={{ fontSize: '0.7rem', color: '#888', background: '#f5f5f5', borderRadius: 6, padding: '2px 8px' }}>
              {filtered.length} / {stations.length}
            </span>
          </div>

          {/* Route mode toggle */}
          <button onClick={() => { setRouteMode(r => !r); setRouteFrom(null); setRouteTo(null); setSelected(null) }}
            style={{ marginTop: 10, width: '100%', padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${routeMode ? '#1C2B36' : '#e5e5e5'}`, background: routeMode ? '#1C2B36' : '#fafafa', color: routeMode ? '#fff' : '#555', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', transition: 'all 0.2s' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>
            </svg>
            {routeMode ? (isAr ? 'إلغاء المسار' : 'Cancel Route') : (isAr ? 'عرض مسار بين محطتين' : 'Show Route')}
          </button>

          {/* Route info */}
          {routeMode && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 4 }}>{isAr ? 'اختر محطتين من الخريطة أو القائمة' : 'Pick 2 stations from map or list'}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, background: routeFrom ? '#1C2B36' : '#e2e8f0', color: routeFrom ? '#fff' : '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>
                  {routeFrom ? (isAr ? routeFrom.name_ar : routeFrom.name_en) : (isAr ? 'من...' : 'From...')}
                </div>
                <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, background: routeTo ? '#F5A623' : '#e2e8f0', color: routeTo ? '#fff' : '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>
                  {routeTo ? (isAr ? routeTo.name_ar : routeTo.name_en) : (isAr ? 'إلى...' : 'To...')}
                </div>
              </div>
              {routeDistance && (
                <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#1C2B36', fontWeight: 700, textAlign: 'center' }}>
                  {isAr ? `المسافة التقريبية: ${routeDistance} كم` : `~${routeDistance} km (straight line)`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Region filter */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', minWidth: 'max-content' }}>
            {regions.map(r => (
              <button key={r} onClick={() => setRegionFilter(r)}
                style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${regionFilter === r ? '#1C2B36' : '#e5e5e5'}`, background: regionFilter === r ? '#1C2B36' : '#fafafa', color: regionFilter === r ? '#fff' : '#666', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                {r === 'all' ? (isAr ? 'الكل' : 'All') : r}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', [isAr?'right':'left']: 10, top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث عن محطة...' : 'Search station...'}
              style={{ width: '100%', padding: `7px ${isAr?'10px':'32px'} 7px ${isAr?'32px':'10px'}`, borderRadius: 8, border: '1.5px solid #e8e8e8', fontSize: '0.8rem', outline: 'none', background: '#fafafa', color: '#111', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#1C2B36'}
              onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: '0.8rem' }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: '0.8rem' }}>{isAr ? 'لا نتائج' : 'No results'}</div>
          ) : filtered.map(s => {
            const isFrom = routeFrom?.id === s.id
            const isTo = routeTo?.id === s.id
            const isSel = selected?.id === s.id
            const active = isSel || isFrom || isTo
            return (
              <button key={s.id} onClick={() => selectStation(s)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'start', background: isFrom ? '#1C2B36' : isTo ? '#F5A623' : isSel ? '#1C2B36' : 'transparent', color: active ? '#fff' : '#222', transition: 'all 0.15s', marginBottom: 1 }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: active ? '#fff' : '#1C2B36', opacity: active ? 1 : 0.4 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isAr ? s.name_ar : s.name_en}
                  </div>
                  {s.region && (
                    <div style={{ fontSize: '0.68rem', color: active ? 'rgba(255,255,255,0.6)' : '#aaa', marginTop: 1 }}>{s.region}</div>
                  )}
                </div>
                {/* Google Maps mini link */}
                {s.maps_url && !routeMode && (
                  <a href={s.maps_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Google Maps"
                    style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: active ? 'rgba(255,255,255,0.15)' : '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : '#888'} strokeWidth="2.2" strokeLinecap="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                  </a>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        {selected && !routeMode && (
          <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 12px', background: '#fafafa' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>{isAr ? 'المحطة المحددة' : 'Selected'}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111' }}>{isAr ? selected.name_ar : selected.name_en}</div>
            <div style={{ fontSize: '0.68rem', color: '#bbb', marginTop: 2, fontFamily: 'monospace' }}>{selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {selected.maps_url && (
                <a href={selected.maps_url} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: '6px', borderRadius: 7, background: '#1C2B36', color: '#fff', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {isAr ? 'افتح في الخرائط' : 'Open in Maps'}
                </a>
              )}
              <button onClick={() => { setSelected(null); setFlyTo(null) }}
                style={{ padding: '6px 10px', borderRadius: 7, background: '#f5f5f5', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#888' }}>
                {isAr ? 'إلغاء' : 'Clear'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        {fetchError && (
          <div style={{ padding: 20, background: '#fee', color: '#900', fontFamily: 'monospace', fontSize: '0.8rem', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 }}>
            خطأ: {fetchError}
          </div>
        )}
        {stations.length === 0 && !loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa', gap: 12 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{isAr ? 'لا توجد محطات بإحداثيات' : 'No stations with coordinates'}</div>
          </div>
        ) : (
          <MapContainer center={saudiCenter} zoom={6} style={{ width: '100%', height: 'calc(100vh - 58px)' }} zoomControl={false}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
            {stations.length > 0 && <FitBounds stations={stations} />}
            {flyTo && <FlyTo coords={flyTo} />}

            {/* Route line */}
            {routeFrom && routeTo && (
              <Polyline positions={[[routeFrom.lat, routeFrom.lng], [routeTo.lat, routeTo.lng]]}
                pathOptions={{ color: '#1C2B36', weight: 3, dashArray: '8 6', opacity: 0.85 }} />
            )}

            {filtered.map(s => (
              <Marker key={s.id} position={[s.lat, s.lng]}
                icon={makeIcon(getMarkerColor(s), getMarkerSize(s))}
                ref={el => { markerRefs.current[s.id] = el }}
                eventHandlers={{ click: () => selectStation(s) }}>
                <Popup>
                  <div style={{ fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', direction: isAr ? 'rtl' : 'ltr', minWidth: 190 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1C2B36', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0a0a0a', lineHeight: 1.2 }}>{isAr ? s.name_ar : s.name_en}</div>
                        {s.region && <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 1 }}>{s.region}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#aaa', fontFamily: 'monospace', marginBottom: 8 }}>{s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}</div>
                    {s.maps_url && (
                      <a href={s.maps_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 7, background: '#1C2B36', color: '#fff', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        {isAr ? 'افتح في Google Maps' : 'Open in Google Maps'}
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}

        {/* Zoom controls */}
        <div style={{ position: 'absolute', top: 12, [isAr?'left':'right']: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.12)', overflow: 'hidden', border: '1px solid #e8e8e8' }}>
            {[{l:'+',t:'in'},{l:'−',t:'out'}].map((b,i) => (
              <button key={i} onClick={() => document.querySelector(`.leaflet-control-zoom-${b.t}`)?.click()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'none', border: 'none', borderBottom: i===0?'1px solid #f0f0f0':'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, color: '#333' }}
                onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                {b.l}
              </button>
            ))}
          </div>
        </div>

        <style>{`.leaflet-control-zoom { display: none !important; }`}</style>
      </div>
    </div>
  )
}

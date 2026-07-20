import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useTranslation } from 'react-i18next'

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const makeIcon = (active) => L.divIcon({
  className: '',
  html: `<div style="
    width:${active?18:14}px;height:${active?18:14}px;border-radius:50%;
    background:${active?'#0a0a0a':'#fff'};
    border:${active?'3px solid #fff':'2.5px solid #111'};
    box-shadow:0 2px 12px rgba(0,0,0,${active?0.5:0.25});
    transition:all 0.2s;
  "></div>`,
  iconSize:   [active?18:14, active?18:14],
  iconAnchor: [active?9:7,  active?9:7],
})

function FlyTo({ coords }) {
  const map = useMap()
  useEffect(() => { if (coords) map.flyTo(coords, 13, { duration: 1.2 }) }, [coords])
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
  const markerRefs = useRef({})

  useEffect(() => {
    supabase.from('stations')
      .select('id, name_ar, name_en, lat, lng, is_active, region')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (error) console.error('Map stations error:', error)
        setStations((data ?? []).filter(s => s.lat && s.lng))
        setLoading(false)
      })
  }, [])

  const filtered = stations.filter(s => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (s.name_ar||'').includes(q) || (s.name_en||'').toLowerCase().includes(q)
  })

  const saudiCenter = [23.8859, 45.0792]

  function selectStation(s) {
    setSelected(s)
    setFlyTo([s.lat, s.lng])
    setTimeout(() => { markerRefs.current[s.id]?.openPopup() }, 1400)
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', background: '#f0f0f0', position: 'relative' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Sidebar ── */}
      <div style={{ width: 280, background: '#fff', borderInlineEnd: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '2px 0 12px rgba(0,0,0,0.06)', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: '#0a0a0a', color: '#fff' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16"/><path d="M16 6v16"/>
              </svg>
            </span>
            {isAr ? 'خريطة المحطات' : 'Stations Map'}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#888' }}>
            {stations.length} {isAr ? 'محطة نشطة' : 'active stations'}
          </p>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', [isAr?'right':'left']: 10, top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? 'ابحث عن محطة...' : 'Search station...'}
              style={{ width: '100%', padding: `8px ${isAr?'10px':'34px'} 8px ${isAr?'34px':'10px'}`, borderRadius: 8, border: '1.5px solid #e8e8e8', fontSize: '0.82rem', outline: 'none', background: '#fafafa', color: '#111', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#111'}
              onBlur={e => e.target.style.borderColor = '#e8e8e8'} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: '0.8rem' }}>
              {isAr ? 'جارٍ التحميل...' : 'Loading...'}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: '0.8rem' }}>
              {isAr ? 'لا نتائج' : 'No results'}
            </div>
          ) : filtered.map(s => (
            <button key={s.id} onClick={() => selectStation(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'start',
                background: selected?.id === s.id ? '#0a0a0a' : 'transparent',
                color: selected?.id === s.id ? '#fff' : '#222',
                transition: 'all 0.15s', marginBottom: 1,
              }}
              onMouseEnter={e => { if (selected?.id !== s.id) e.currentTarget.style.background = '#f5f5f5' }}
              onMouseLeave={e => { if (selected?.id !== s.id) e.currentTarget.style.background = 'transparent' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: selected?.id === s.id ? '#fff' : '#0a0a0a',
                border: selected?.id === s.id ? '2px solid rgba(255,255,255,0.4)' : '2px solid #ddd',
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isAr ? s.name_ar : s.name_en}
                </div>
                {s.region && (
                  <div style={{ fontSize: '0.7rem', color: selected?.id === s.id ? 'rgba(255,255,255,0.55)' : '#aaa', marginTop: 1 }}>
                    {s.region}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        {selected && (
          <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 12px', background: '#fafafa' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>{isAr ? 'المحطة المحددة' : 'Selected'}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111' }}>{isAr ? selected.name_ar : selected.name_en}</div>
            <div style={{ fontSize: '0.7rem', color: '#bbb', marginTop: 2, fontFamily: 'monospace' }}>{selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}</div>
            <button onClick={() => { setSelected(null); setFlyTo(null) }}
              style={{ marginTop: 8, fontSize: '0.72rem', color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              {isAr ? 'إلغاء التحديد' : 'Clear selection'}
            </button>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {stations.length === 0 && !loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa', gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16"/><path d="M16 6v16"/>
            </svg>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{isAr ? 'لا توجد محطات بإحداثيات' : 'No stations with coordinates'}</div>
            <div style={{ fontSize: '0.78rem', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
              {isAr ? 'أضف أعمدة lat و lng لجدول المحطات في Supabase' : 'Add lat & lng columns to the stations table in Supabase'}
            </div>
          </div>
        ) : (
          <MapContainer center={saudiCenter} zoom={6} style={{ width: '100%', height: '100%' }}
            zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {flyTo && <FlyTo coords={flyTo} />}
            {filtered.map(s => (
              <Marker key={s.id} position={[s.lat, s.lng]}
                icon={makeIcon(selected?.id === s.id)}
                ref={el => { markerRefs.current[s.id] = el }}
                eventHandlers={{ click: () => setSelected(s) }}>
                <Popup>
                  <div style={{ fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', direction: isAr ? 'rtl' : 'ltr', minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0a0a0a', lineHeight: 1.2 }}>
                          {isAr ? s.name_ar : s.name_en}
                        </div>
                        {s.region && (
                          <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 1 }}>
                            {s.region}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div style={{ background: '#f5f5f5', borderRadius: 7, padding: '6px 8px' }}>
                        <div style={{ fontSize: '0.62rem', color: '#aaa', marginBottom: 1 }}>{isAr ? 'خط العرض' : 'Latitude'}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: '#111' }}>{s.lat?.toFixed(5)}</div>
                      </div>
                      <div style={{ background: '#f5f5f5', borderRadius: 7, padding: '6px 8px' }}>
                        <div style={{ fontSize: '0.62rem', color: '#aaa', marginBottom: 1 }}>{isAr ? 'خط الطول' : 'Longitude'}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: '#111' }}>{s.lng?.toFixed(5)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, padding: '5px 8px', borderRadius: 6, background: '#0a0a0a', color: '#fff', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center' }}>
                      ● {isAr ? 'محطة نشطة' : 'Active Station'}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}

        {/* Map controls */}
        <div style={{ position: 'absolute', top: 12, [isAr?'left':'right']: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.12)', overflow: 'hidden', border: '1px solid #e8e8e8' }}>
            {[
              { label: '+', title: 'Zoom in',  fn: () => document.querySelector('.leaflet-control-zoom-in')?.click() },
              { label: '−', title: 'Zoom out', fn: () => document.querySelector('.leaflet-control-zoom-out')?.click() },
            ].map((b, i) => (
              <button key={i} title={b.title} onClick={b.fn}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'none', border: 'none', borderBottom: i===0?'1px solid #f0f0f0':'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, color: '#333' }}
                onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                {b.label}
              </button>
            ))}
          </div>
          <button title={isAr?'عرض كامل':'Fit all'} onClick={() => setFlyTo(null)}
            style={{ width: 34, height: 34, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
            onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.2" strokeLinecap="round">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
          </button>
        </div>

        {/* Hide default leaflet zoom */}
        <style>{`.leaflet-control-zoom { display: none !important; }`}</style>
      </div>
    </div>
  )
}

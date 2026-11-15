import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getCached, setCached } from '../lib/pageCache'
import { useMedia } from '../components/dispatch/Sheet'
import PageHeader from '../components/shared/PageHeader'
import StatStrip from '../components/shared/StatStrip'
import SelectField from '../components/shared/SelectField'
import StationForm from '../components/stations/StationForm'
import MergeSheet from '../components/stations/MergeSheet'
import StationsDesktop from '../components/stations/StationsDesktop'
import { STN_CSS, TYPE_COLOR, ShiftBar, statusOf } from '../components/stations/stationsUi'

export default function StationsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const desk = useMedia('(min-width: 900px)')
  const { isGeneralAdmin, allowCap, isRestricted, grantCap, supervisedStationIds } = useAuth()
  // مشرف المرحلين (حساب مقيّد) بصلاحية "تعديل محطاته المخصصة": يشوف ويعدّل محطاته فقط بدون إضافة أو دمج
  const restrictedManager = isRestricted && grantCap('stations_manage_assigned')
  const canEditStation = s => isGeneralAdmin || (restrictedManager && (supervisedStationIds ?? []).includes(s.id))
  const [stations, setStations] = useState(() => getCached('stations_all') ?? [])
  const [loading, setLoading]   = useState(() => !getCached('stations_all'))
  const [modal, setModal]       = useState(null)
  const [showMerge, setShowMerge] = useState(false)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('all')
  const [sort, setSort]         = useState('name')
  const [view, setView]         = useState(() => { try { return localStorage.getItem('stations_view') || 'table' } catch { return 'table' } })
  const [staff, setStaff]       = useState({})   // عدد الموظفين النشطين لكل محطة

  const fetch = useCallback(async () => {
    const cached = getCached('stations_all')
    if (cached) { setStations(cached); setLoading(false) } else { setLoading(true) }
    const { data } = await supabase.from('stations').select('*').order('name_ar')
    if (data) { setCached('stations_all', data); setStations(data) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => {
    supabase.from('users').select('station_id').eq('is_active', true).not('station_id', 'is', null).limit(5000)
      .then(({ data }) => { const m = {}; for (const u of data ?? []) m[u.station_id] = (m[u.station_id] || 0) + 1; setStaff(m) })
  }, [])

  const staffOf = id => staff[id] ?? 0
  const tripsOf = s => (Array.isArray(s.trip_numbers) ? s.trip_numbers.length : 0)
  const fourShifts = s => Array.isArray(s.shift_ends) && s.shift_ends.length === 4
  const visible = stations.filter(s => !isRestricted || (supervisedStationIds ?? []).includes(s.id))
  const q = search.trim().toLowerCase()
  const FILTERS = [
    ['all', isAr ? 'الكل' : 'All', () => true],
    ['main', isAr ? 'رئيسية' : 'Main', s => s.type === 'main'],
    ['transit', isAr ? 'مرور' : 'Transit', s => s.type === 'transit'],
    ['active', isAr ? 'نشطة' : 'Active', s => s.is_active && !s.merged_into],
    ['inactive', isAr ? 'معطلة' : 'Inactive', s => !s.is_active || !!s.merged_into],
    ['agent', isAr ? 'وكيل' : 'Agent', s => !!s.is_agent],
    ['four', isAr ? '4 ورديات' : '4 shifts', fourShifts],
  ]
  const filterFn = FILTERS.find(f => f[0] === filter)?.[2] ?? (() => true)
  const filtered = visible
    .filter(filterFn)
    .filter(s => !q || (s.name_ar || '').toLowerCase().includes(q) || (s.name_en || '').toLowerCase().includes(q) || (s.region || '').toLowerCase().includes(q) || (s.city_group || '').toLowerCase().includes(q))
    .sort((a, b) => sort === 'trips' ? tripsOf(b) - tripsOf(a) : sort === 'staff' ? staffOf(b.id) - staffOf(a.id) : (a.name_ar || a.name_en || '').localeCompare(b.name_ar || b.name_en || '', isAr ? 'ar' : 'en'))

  const mainCount    = visible.filter(s => s.type === 'main').length
  const transitCount = visible.filter(s => s.type === 'transit').length
  const activeCount  = visible.filter(s => s.is_active && !s.merged_into).length
  const inactiveCount = visible.length - activeCount
  const agentCount   = visible.filter(s => s.is_agent).length
  const fourCount    = visible.filter(fourShifts).length

  if (!allowCap('stations_page') || (isRestricted && !restrictedManager)) {
    return <div className="flex items-center justify-center text-sm text-gray-400" style={{ minHeight: 'calc(100vh - 58px)' }}>{isAr ? 'غير مصرح' : 'Access denied'}</div>
  }

  const changeView = k => { setView(k); try { localStorage.setItem('stations_view', k) } catch { /* بدون تخزين */ } }
  const clearFilters = () => { setSearch(''); setFilter('all') }
  const subtitle = isAr ? `${visible.length} محطة — المعروض ${filtered.length}` : `${visible.length} stations — showing ${filtered.length}`

  const dialogs = (
    <>
      {modal && (
        <StationForm
          station={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetch}
        />
      )}
      {showMerge && (
        <MergeSheet
          stations={stations}
          onClose={() => setShowMerge(false)}
          onSaved={fetch}
        />
      )}
    </>
  )

  /* ─── الكمبيوتر ─── */
  if (desk) {
    const stats = [
      { label: isAr ? 'إجمالي المحطات' : 'Total stations', value: visible.length, hint: isAr ? `منها ${fourCount} بـ 4 ورديات` : `${fourCount} with 4 shifts`, onClick: () => setFilter('all') },
      { label: isAr ? 'رئيسية' : 'Main', value: mainCount, color: TYPE_COLOR.main, onClick: () => setFilter('main') },
      { label: isAr ? 'مرور' : 'Transit', value: transitCount, color: TYPE_COLOR.transit, onClick: () => setFilter('transit') },
      { label: isAr ? 'نشطة' : 'Active', value: activeCount, color: 'var(--success)', onClick: () => setFilter('active') },
      { label: isAr ? 'معطلة / مدمجة' : 'Inactive / merged', value: inactiveCount, color: inactiveCount ? 'var(--warning)' : undefined, onClick: () => setFilter('inactive') },
      { label: isAr ? 'وكلاء' : 'Agents', value: agentCount, onClick: () => setFilter('agent') },
    ]
    return (
      <div className="stn-wrap" dir={isAr ? 'rtl' : 'ltr'} style={{ maxWidth: 'min(100%, 1560px)', margin: '0 auto', padding: 'clamp(16px, 2vw, 32px)' }}>
        <style>{STN_CSS}</style>
        <PageHeader accent="#5B5BD6" title={isAr ? 'المحطات' : 'Stations'} subtitle={subtitle} stats={stats}
          actions={isGeneralAdmin && (
            <>
              <button type="button" className="stn-btn stn-btn-warn" onClick={() => setShowMerge(true)}>{isAr ? 'دمج محطات' : 'Merge'}</button>
              <button type="button" className="stn-btn stn-btn-primary" onClick={() => setModal('new')}>+ {isAr ? 'محطة جديدة' : 'New Station'}</button>
            </>
          )} />
        <StationsDesktop isAr={isAr}
          filterItems={FILTERS.map(([k, l, fn]) => ({ k, label: l, n: visible.filter(fn).length }))}
          filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} sort={sort} setSort={setSort}
          view={view} setView={changeView} total={visible.length} stations={filtered} loading={loading}
          tripsOf={tripsOf} staffOf={staffOf} canEdit={canEditStation} onEdit={setModal} onClear={clearFilters} />
        {dialogs}
      </div>
    )
  }

  /* ─── الجوال (بدون تغيير في السلوك) ─── */
  const typeChip = s => (
    <span className={`inline-block text-[11px] font-bold rounded px-2 py-0.5 border ${s.type === 'main' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-purple-200 bg-purple-50 text-purple-700'}`}>
      {s.type === 'main' ? (isAr ? 'رئيسية' : 'Main') : (isAr ? 'مرور' : 'Transit')}
    </span>
  )
  const badges = s => (
    <>
      {s.is_agent && <span className="text-[10px] bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 font-bold">{isAr ? 'وكيل' : 'Agent'}</span>}
      {s.combined_arr_dep && <span className="text-[10px] bg-sky-100 text-sky-700 rounded px-1.5 py-0.5 font-bold">{isAr ? 'وصول + مغادرة' : 'Arr + Dep'}</span>}
    </>
  )
  const statusClass = s => s.merged_into ? { dot: 'bg-amber-500', txt: 'text-amber-700' } : s.is_active ? { dot: 'bg-green-500', txt: 'text-green-700' } : { dot: 'bg-gray-400', txt: 'text-gray-500' }
  const editBtn = s => canEditStation(s) && (
    <button onClick={() => setModal(s)}
      className="text-xs font-semibold border border-gray-300 text-gray-700 rounded-md px-3 py-1.5 hover:border-nwbus-primary hover:text-nwbus-primary transition-colors">
      {isAr ? 'تعديل' : 'Edit'}
    </button>
  )

  return (
    <div className="stn-wrap p-4" dir={isAr ? 'rtl' : 'ltr'} style={{ maxWidth: 'min(100%, 1560px)', margin: '0 auto' }}>
      <style>{STN_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">{isAr ? 'المحطات' : 'Stations'}</h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {isGeneralAdmin && (
            <button onClick={() => setShowMerge(true)}
              className="border border-amber-600 text-amber-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors">
              {isAr ? 'دمج محطات' : 'Merge'}
            </button>
          )}
          {isGeneralAdmin && (
            <button onClick={() => setModal('new')}
              className="bg-nwbus-primary text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-nwbus-dark transition-colors">
              + {isAr ? 'محطة جديدة' : 'New Station'}
            </button>
          )}
        </div>
      </div>

      <StatStrip className="mb-4" items={[
        { label: isAr ? 'الإجمالي' : 'Total', val: visible.length },
        { label: isAr ? 'رئيسية' : 'Main', val: mainCount },
        { label: isAr ? 'مرور' : 'Transit', val: transitCount },
        { label: isAr ? 'نشطة' : 'Active', val: activeCount, tone: 'text-green-700' },
        { label: isAr ? 'معطلة / مدمجة' : 'Inactive', val: inactiveCount, tone: inactiveCount ? 'text-amber-700' : undefined },
        { label: isAr ? 'وكلاء' : 'Agents', val: agentCount },
        { label: isAr ? '4 ورديات' : '4 shifts', val: fourCount },
      ]} />

      {/* أدوات: بحث + تصفية + ترتيب */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" /></svg>
          <input placeholder={isAr ? 'ابحث بالاسم أو المنطقة…' : 'Search name or region…'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg ps-9 pe-3 py-2 text-sm bg-white focus:ring-2 focus:ring-nwbus-primary/40 focus:border-nwbus-primary focus:outline-none" />
        </div>
        <SelectField value={sort} onChange={e => setSort(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700">
          <option value="name">{isAr ? 'ترتيب: الاسم' : 'Sort: name'}</option>
          <option value="trips">{isAr ? 'ترتيب: الرحلات' : 'Sort: trips'}</option>
          <option value="staff">{isAr ? 'ترتيب: الموظفون' : 'Sort: staff'}</option>
        </SelectField>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {FILTERS.map(([k, l, fn]) => {
          const n = visible.filter(fn).length
          const on = filter === k
          return (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 border transition-colors ${on ? 'bg-nwbus-primary text-white border-nwbus-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {l} <span className={`font-mono ms-1 ${on ? 'opacity-80' : 'text-gray-400'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 text-sm">{isAr ? 'لا توجد محطات مطابقة' : 'No matching stations'}</p>
          {(search || filter !== 'all') && <button type="button" onClick={clearFilters} className="mt-2 text-xs font-semibold text-nwbus-primary underline">{isAr ? 'مسح التصفية' : 'Clear filters'}</button>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(s => {
            const st = statusOf(s, isAr), sc = statusClass(s)
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:border-gray-400 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-snug flex items-center gap-1.5 flex-wrap">{s.name_ar}{badges(s)}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate" dir="ltr" style={{ textAlign: isAr ? 'right' : 'left' }}>{s.name_en}</p>
                  </div>
                  {typeChip(s)}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[[isAr ? 'الرحلات' : 'Trips', tripsOf(s)], [isAr ? 'الموظفون' : 'Staff', staffOf(s.id)], [isAr ? 'المنطقة' : 'Region', s.region || '—']].map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-gray-50 border border-gray-100 py-1.5">
                      <div className="text-sm font-bold font-mono text-gray-800 truncate px-1">{v}</div>
                      <div className="text-[10px] text-gray-400">{l}</div>
                    </div>
                  ))}
                </div>
                <ShiftBar s={s} isAr={isAr} />
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${sc.txt}`}><i className={`w-2 h-2 rounded-full ${sc.dot}`} />{st.t}</span>
                  {editBtn(s)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialogs}
    </div>
  )
}

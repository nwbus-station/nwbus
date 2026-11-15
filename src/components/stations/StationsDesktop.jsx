// عرض الكمبيوتر لصفحة المحطات: شريط أدوات لاصق + جدول غني أو بطاقات عريضة
import { useMemo } from 'react'
import SelectField from '../shared/SelectField'
import { MONO, TYPE_COLOR, tint, shiftInfo, StationBadges, TypeTag, StatusPill, ShiftTimeline } from './stationsUi'

const MAX_TRIP_CHIPS = 3

function MiniBar({ n, max, color }) {
  return (
    <div aria-hidden="true" style={{ height: 4, borderRadius: 99, background: 'var(--surface-2)', marginTop: 6, width: 64, overflow: 'hidden' }}>
      <i style={{ display: 'block', height: '100%', width: `${max ? Math.max(n ? 6 : 0, (n / max) * 100) : 0}%`, background: color, borderRadius: 99 }} />
    </div>
  )
}

function TripChips({ s, limit = MAX_TRIP_CHIPS }) {
  const nums = Array.isArray(s.trip_numbers) ? s.trip_numbers : []
  if (!nums.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }} dir="ltr">
      {nums.slice(0, limit).map(n => <span key={n} className="stn-tripchip">{n}</span>)}
      {nums.length > limit && <span className="stn-tripchip" style={{ background: 'transparent', color: 'var(--text-3)' }}>+{nums.length - limit}</span>}
    </div>
  )
}

function EditButton({ s, canEdit, isAr, onEdit }) {
  if (!canEdit(s)) return null
  return <button type="button" className="stn-btn stn-btn-ghost stn-btn-sm" onClick={() => onEdit(s)}>{isAr ? 'تعديل' : 'Edit'}</button>
}

function StationRow({ s, isAr, trips, staff, maxTrips, maxStaff, canEdit, onEdit }) {
  const accent = TYPE_COLOR[s.type] || TYPE_COLOR.main
  return (
    <tr style={s.is_active && !s.merged_into ? undefined : { opacity: 0.78 }}>
      <td style={{ borderInlineStart: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.02rem', fontWeight: 900, color: 'var(--text-1)' }}>{s.name_ar}</span>
          <StationBadges s={s} isAr={isAr} />
        </div>
        <div dir="ltr" style={{ fontSize: '.82rem', color: 'var(--text-3)', marginTop: 3, textAlign: isAr ? 'right' : 'left' }}>{s.name_en}</div>
      </td>
      <td><TypeTag s={s} isAr={isAr} /></td>
      <td>
        <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>{s.region || '—'}</div>
        {s.city_group && <div dir="ltr" style={{ fontSize: '.76rem', color: 'var(--text-3)', marginTop: 2, fontFamily: MONO, textAlign: isAr ? 'right' : 'left' }}>{s.city_group}</div>}
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.15rem', color: trips ? 'var(--text-1)' : 'var(--text-3)' }}>{trips}</div>
            <MiniBar n={trips} max={maxTrips} color={accent} />
          </div>
          <TripChips s={s} />
        </div>
      </td>
      <td>
        <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.15rem', color: staff ? 'var(--text-1)' : 'var(--text-3)' }}>{staff}</div>
        <MiniBar n={staff} max={maxStaff} color="var(--success)" />
      </td>
      <td><ShiftTimeline s={s} isAr={isAr} /></td>
      <td><StatusPill s={s} isAr={isAr} /></td>
      <td style={{ textAlign: 'end' }}><EditButton s={s} canEdit={canEdit} isAr={isAr} onEdit={onEdit} /></td>
    </tr>
  )
}

function StationCard({ s, isAr, trips, staff, canEdit, onEdit }) {
  const accent = TYPE_COLOR[s.type] || TYPE_COLOR.main
  const off = !s.is_active || !!s.merged_into
  const { ends } = shiftInfo(s)
  const tiles = [
    [isAr ? 'الرحلات' : 'Trips', trips],
    [isAr ? 'الموظفون' : 'Staff', staff],
    [isAr ? 'الورديات' : 'Shifts', ends.length],
  ]
  return (
    <article className="stn-card" style={off ? { opacity: 0.82 } : undefined}>
      <div aria-hidden="true" style={{ height: 5, background: off ? 'var(--border-2)' : `linear-gradient(90deg, ${accent}, ${tint(accent, 35)})` }} />
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.4 }}>{s.name_ar}</div>
            <div dir="ltr" style={{ fontSize: '.84rem', color: 'var(--text-3)', marginTop: 2, textAlign: isAr ? 'right' : 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name_en}</div>
          </div>
          <TypeTag s={s} isAr={isAr} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '.86rem', color: 'var(--text-2)', minHeight: 24 }}>
          <span style={{ fontWeight: 700 }}>{s.region || '—'}</span>
          {s.city_group && <span dir="ltr" className="stn-tripchip">{s.city_group}</span>}
          <StationBadges s={s} isAr={isAr} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {tiles.map(([l, v]) => (
            <div key={l} className="stn-tile">
              <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1.3rem', color: v ? 'var(--text-1)' : 'var(--text-3)', lineHeight: 1.2 }}>{v}</div>
              <div style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-3)', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <ShiftTimeline s={s} isAr={isAr} detailed />
        {trips > 0 && <TripChips s={s} limit={6} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <StatusPill s={s} isAr={isAr} />
          <EditButton s={s} canEdit={canEdit} isAr={isAr} onEdit={onEdit} />
        </div>
      </div>
    </article>
  )
}

/**
 * props: isAr، filterItems [{k, label, n}]، filter/setFilter، search/setSearch، sort/setSort، view/setView،
 *        total، stations (المعروضة)، loading، tripsOf(s)، staffOf(id)، canEdit(s)، onEdit(s)، onClear
 */
export default function StationsDesktop({ isAr, filterItems, filter, setFilter, search, setSearch, sort, setSort, view, setView, total, stations, loading, tripsOf, staffOf, canEdit, onEdit, onClear }) {
  const maxTrips = useMemo(() => Math.max(0, ...stations.map(tripsOf)), [stations, tripsOf])
  const maxStaff = useMemo(() => Math.max(0, ...stations.map(s => staffOf(s.id))), [stations, staffOf])
  const th = [isAr ? 'المحطة' : 'Station', isAr ? 'النوع' : 'Type', isAr ? 'المنطقة' : 'Region', isAr ? 'الرحلات' : 'Trips', isAr ? 'الموظفون' : 'Staff', isAr ? 'الورديات' : 'Shifts', isAr ? 'الحالة' : 'Status', '']

  return (
    <>
      {/* شريط الأدوات اللاصق */}
      <div style={{ position: 'sticky', top: 76, zIndex: 5, background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 16, marginBottom: 18, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 560 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
              style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', insetInlineStart: 14, color: 'var(--text-3)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" /></svg>
            <input className="stn-input" style={{ paddingInlineStart: 42, fontSize: '1rem' }} value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث بالاسم أو المنطقة أو مجموعة المدينة…' : 'Search name, region or city group…'} />
          </div>
          <SelectField value={sort} onChange={e => setSort(e.target.value)} className="stn-input" style={{ minWidth: 200, width: 210 }}>
            <option value="name">{isAr ? 'ترتيب: الاسم' : 'Sort: name'}</option>
            <option value="trips">{isAr ? 'ترتيب: الرحلات' : 'Sort: trips'}</option>
            <option value="staff">{isAr ? 'ترتيب: الموظفون' : 'Sort: staff'}</option>
          </SelectField>
          <div className="stn-seg" role="group" aria-label={isAr ? 'طريقة العرض' : 'View'}>
            {[['table', isAr ? 'جدول' : 'Table'], ['cards', isAr ? 'بطاقات' : 'Cards']].map(([k, l]) => (
              <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
          <span style={{ marginInlineStart: 'auto', fontSize: '.86rem', color: 'var(--text-3)', fontWeight: 700 }}>
            {isAr ? `المعروض ${stations.length} من ${total}` : `Showing ${stations.length} of ${total}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filterItems.map(f => (
            <button key={f.k} type="button" className={`stn-chip ${filter === f.k ? 'on' : ''}`} onClick={() => setFilter(f.k)}>
              {f.label} <span className="n">{f.n}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="stn-skel" />)}</div>
      ) : stations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '72px 16px', border: '1px dashed var(--border-2)', borderRadius: 18, background: 'var(--card)' }}>
          <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-2)' }}>{isAr ? 'لا توجد محطات مطابقة' : 'No matching stations'}</p>
          <p style={{ margin: '6px 0 0', fontSize: '.88rem', color: 'var(--text-3)' }}>{isAr ? 'جرّب تغيير كلمة البحث أو التصفية.' : 'Try changing the search or filter.'}</p>
          {(search || filter !== 'all') && <button type="button" className="stn-btn stn-btn-ghost stn-btn-sm" style={{ marginTop: 16 }} onClick={onClear}>{isAr ? 'مسح التصفية' : 'Clear filters'}</button>}
        </div>
      ) : view === 'table' ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="stn-table">
              <thead><tr>{th.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {stations.map(s => (
                  <StationRow key={s.id} s={s} isAr={isAr} trips={tripsOf(s)} staff={staffOf(s.id)} maxTrips={maxTrips} maxStaff={maxStaff} canEdit={canEdit} onEdit={onEdit} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {stations.map(s => (
            <StationCard key={s.id} s={s} isAr={isAr} trips={tripsOf(s)} staff={staffOf(s.id)} canEdit={canEdit} onEdit={onEdit} />
          ))}
        </div>
      )}
    </>
  )
}

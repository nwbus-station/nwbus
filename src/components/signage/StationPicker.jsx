// محدّد المحطات: يعرض المحطات التي فيها شاشات فعلياً (مع عدد الشاشات والمتصلة)، مع «تحديد الكل» وبحث،
// وخيار إظهار المحطات التي بلا شاشات (غير قابلة للاختيار).
import { useMemo, useState } from 'react'
import { input, SG_ACCENT } from './common'
import { isOnline } from '../../utils/signage'

export function stationInfo(stations, devices) {
  const active = devices.filter(d => d.status === 'active')
  return stations.map(s => {
    const ds = active.filter(d => d.station_id === s.id)
    return { id: s.id, name: s.name_ar || s.name_en || '—', screens: ds.length, online: ds.filter(isOnline).length }
  })
}

export default function StationPicker({ stations, devices, selected, onChange, isAr = true }) {
  const t = (a, e) => (isAr ? a : e)
  const [q, setQ] = useState(''); const [showEmpty, setShowEmpty] = useState(false)
  const info = useMemo(() => stationInfo(stations, devices), [stations, devices])
  const withScreens = info.filter(s => s.screens > 0)
  const without = info.filter(s => s.screens === 0)
  const term = q.trim().toLowerCase()
  const match = s => !term || s.name.toLowerCase().includes(term)
  // المحطات المختارة سابقاً التي لا شاشات لها تبقى ظاهرة لتُلغى
  const shownEmpty = without.filter(s => match(s) && (showEmpty || selected.includes(s.id)))
  const shown = withScreens.filter(match)
  const allIds = withScreens.map(s => s.id)
  const allOn = allIds.length > 0 && allIds.every(id => selected.includes(id))
  const toggle = id => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

  const Row = ({ s, disabled }) => {
    const on = selected.includes(s.id)
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: disabled && !on ? 'not-allowed' : 'pointer', borderRadius: 10, border: `1.5px solid ${on ? SG_ACCENT : 'var(--border)'}`, background: on ? `${SG_ACCENT}10` : 'var(--card)', opacity: disabled && !on ? 0.5 : 1 }}>
        <input type="checkbox" checked={on} disabled={disabled && !on} onChange={() => toggle(s.id)} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: s.screens ? 'var(--text-3)' : '#d97706' }}>
            {s.screens ? <>{s.screens} {t('شاشة', 'screen(s)')} · <span style={{ color: s.online ? '#16a34a' : 'var(--text-3)' }}>{s.online} {t('متصلة', 'online')}</span></> : t('بلا شاشات', 'No screens')}
          </span>
        </span>
      </label>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث عن محطة…', 'Search stations…')} style={{ ...input, flex: '1 1 160px', width: 'auto', padding: '8px 11px' }} />
        <button type="button" disabled={!allIds.length} onClick={() => onChange(allOn ? [] : allIds)}
          style={{ padding: '8px 14px', borderRadius: 9, fontFamily: 'inherit', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', border: `1.5px solid ${SG_ACCENT}`, background: allOn ? SG_ACCENT : 'transparent', color: allOn ? '#fff' : SG_ACCENT, whiteSpace: 'nowrap' }}>
          {allOn ? t('إلغاء تحديد الكل', 'Clear all') : t(`تحديد كل المحطات التي فيها شاشات (${allIds.length})`, `Select all with screens (${allIds.length})`)}
        </button>
        {selected.length > 0 && <span style={{ fontSize: '0.74rem', fontWeight: 800, color: SG_ACCENT }}>{t(`${selected.length} محطة محددة`, `${selected.length} selected`)}</span>}
      </div>
      {withScreens.length === 0 && <div style={{ padding: 14, borderRadius: 10, background: 'rgba(217,119,6,.1)', color: '#d97706', fontWeight: 800, fontSize: '0.8rem', lineHeight: 1.8 }}>{t('لا توجد محطات فيها شاشات مربوطة بعد. اربط الشاشات بمحطاتها من تبويب «الشاشات».', 'No station has paired screens yet.')}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 2 }}>
        {shown.map(s => <Row key={s.id} s={s} />)}
        {shownEmpty.map(s => <Row key={s.id} s={s} disabled />)}
      </div>
      {without.length > 0 && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} /> {t(`إظهار المحطات التي بلا شاشات (${without.length})`, `Show stations without screens (${without.length})`)}
        </label>
      )}
    </div>
  )
}

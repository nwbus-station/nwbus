// فلاتر السجل الوظيفي: المحطة + الموظف + الفترة + الفترات الجاهزة + الأقسام المعروضة والمطبوعة
import DatePicker from '../shared/DatePicker'
import SearchSelect from '../shared/SearchSelect'
import { f, card, pill } from './ui'

export default function FilterBar({ isAr, desk, stations, stationF, onStation, empId, onEmp, empOptions, from, to, onFrom, onTo, onPreset, presets, showAll, sel, sections, onAll, onToggle }) {
  const inpCls = desk ? 'border border-gray-200 rounded-lg px-3.5 py-2.5 text-[0.95rem] bg-white' : 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'
  const lbl = { display: 'block', fontSize: f('0.68rem'), fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }
  const grp = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }
  const grpLbl = { fontSize: f('0.7rem'), fontWeight: 700, color: 'var(--text-3)', marginInlineEnd: 4 }
  return (
    <div style={{ ...card, padding: desk ? '20px 24px' : '14px 18px', display: 'flex', flexDirection: 'column', gap: desk ? 16 : 12 }}>
      <div style={{ display: 'flex', gap: desk ? 16 : 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 190, flex: desk ? '0 1 260px' : undefined }}>
          <label style={lbl}>{isAr ? 'المحطة' : 'Station'}</label>
          <SearchSelect isAr={isAr} value={stationF} onChange={onStation} className={inpCls + ' w-full'}
            options={[{ value: '', label: isAr ? 'كل المحطات' : 'All stations' }, ...stations.map(s => ({ value: s.id, label: isAr ? s.name_ar : (s.name_en || s.name_ar) }))]} />
        </div>
        <div style={{ minWidth: 260, flex: 1 }}>
          <label style={lbl}>{isAr ? 'الموظف' : 'Employee'}</label>
          <SearchSelect isAr={isAr} value={empId} onChange={onEmp} className={inpCls + ' w-full'} placeholder={isAr ? 'اختر الموظف…' : 'Pick an employee…'} options={empOptions} />
        </div>
        <div><label style={lbl}>{isAr ? 'من' : 'From'}</label>
          <DatePicker value={from} onChange={onFrom} isAr={isAr} className={inpCls + (desk ? ' w-44' : ' w-40')} /></div>
        <div><label style={lbl}>{isAr ? 'إلى' : 'To'}</label>
          <DatePicker value={to} onChange={onTo} isAr={isAr} className={inpCls + (desk ? ' w-44' : ' w-40')} /></div>
      </div>
      <div style={{ display: 'flex', gap: desk ? '12px 36px' : 12, flexWrap: 'wrap', flexDirection: desk ? 'row' : 'column', borderTop: '1px solid var(--border)', paddingTop: desk ? 14 : 10 }}>
        <div style={grp}>
          {desk && <span style={grpLbl}>{isAr ? 'الفترة:' : 'Period:'}</span>}
          {presets.map(([l, a, b]) => <button key={l} type="button" onClick={() => onPreset(a, b)} style={pill(from === a && to === b)}>{l}</button>)}
        </div>
        <div style={grp}>
          <span style={grpLbl}>{isAr ? 'الأقسام المعروضة والمطبوعة:' : 'Sections:'}</span>
          <button type="button" onClick={onAll} style={pill(showAll)}>{isAr ? 'الكل' : 'All'}</button>
          {sections.map(([id, l]) => <button key={id} type="button" onClick={() => onToggle(id)} style={pill(!showAll && sel.has(id))}>{l}</button>)}
        </div>
      </div>
    </div>
  )
}

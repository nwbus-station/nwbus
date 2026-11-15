import SelectField from '../shared/SelectField'
import DatePicker from '../shared/DatePicker'
import EmployeePicker from './EmployeePicker'
import { SHIFTS, stationLabel, FIELD_LABEL } from './shared'

function Field({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={FIELD_LABEL}>{label}</span>
      {children}
    </div>
  )
}

// شريط الفلاتر للكمبيوتر — نفس الحالات والمعالجات، بتسميات ظاهرة وحقول بعرض موحّد
export default function RatingsFilterBar({
  isAr, stations, employees, stationFilter, setStationFilter, shiftFilter, setShiftFilter, employeeFilter, setEmployeeFilter,
  dateFrom, setDateFrom, dateTo, setDateTo, sortBy, setSortBy, dirty, onReset,
}) {
  return (
    <section className="cr-card" style={{ padding: 20, marginBottom: 16 }} aria-label={isAr ? 'الفلاتر' : 'Filters'}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--text-1)' }}>{isAr ? 'تصفية النتائج' : 'Filter results'}</h2>
        {dirty && <button type="button" className="cr-ghost" onClick={onReset}>{isAr ? 'إعادة ضبط الفلاتر' : 'Reset filters'}</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14 }}>
        <Field label={isAr ? 'المحطة' : 'Station'}>
          <SelectField value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="cr-ctl">
            <option value="">{isAr ? 'كل المحطات' : 'All stations'}</option>
            {stations.map(s => <option key={s.id} value={s.id}>{stationLabel(s, isAr)}</option>)}
          </SelectField>
        </Field>
        <Field label={isAr ? 'الوردية' : 'Shift'}>
          <SelectField value={shiftFilter} onChange={e => setShiftFilter(e.target.value)} className="cr-ctl">
            <option value="">{isAr ? 'كل الورديات' : 'All shifts'}</option>
            {SHIFTS.map(s => <option key={s.value} value={s.value}>{isAr ? s.ar : s.en}</option>)}
          </SelectField>
        </Field>
        <Field label={isAr ? 'الموظف' : 'Employee'}>
          <EmployeePicker desk employees={employees} value={employeeFilter} onChange={setEmployeeFilter}
            defaultLabel={stationFilter ? (isAr ? 'كل موظفي المحطة' : 'All station employees') : (isAr ? 'كل الموظفين' : 'All employees')} />
        </Field>
        <Field label={isAr ? 'من تاريخ' : 'From date'}>
          <DatePicker isAr={isAr} value={dateFrom} onChange={setDateFrom} className="cr-ctl" placeholder={isAr ? 'من تاريخ' : 'From date'} />
        </Field>
        <Field label={isAr ? 'إلى تاريخ' : 'To date'}>
          <DatePicker isAr={isAr} value={dateTo} onChange={setDateTo} className="cr-ctl" placeholder={isAr ? 'إلى تاريخ' : 'To date'} />
        </Field>
        <Field label={isAr ? 'الترتيب' : 'Sort by'}>
          <SelectField value={sortBy} onChange={e => setSortBy(e.target.value)} className="cr-ctl">
            <option value="date">{isAr ? 'الأحدث' : 'Newest'}</option>
            <option value="best">{isAr ? 'الأعلى تقييماً' : 'Highest rated'}</option>
            <option value="worst">{isAr ? 'الأقل تقييماً' : 'Lowest rated'}</option>
          </SelectField>
        </Field>
      </div>
    </section>
  )
}

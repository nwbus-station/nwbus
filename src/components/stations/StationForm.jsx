// نموذج إضافة / تعديل محطة — لوحة جانبية على الكمبيوتر وورقة سفلية على الجوال (Sheet)
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { toLatinDigits } from '../../utils/digits'
import { syncStationTripsByNumbers } from '../../utils/importSchedule'
import { validEnds, fmtMin, toMin } from '../../utils/shifts'
import Sheet, { Ic } from '../dispatch/Sheet'
import SelectField from '../shared/SelectField'
import TimeInput24 from '../shared/TimeInput24'
import { MONO, AGENT_COLOR, tint } from './stationsUi'

const FORM_ID = 'station-form'

export default function StationForm({ station, onClose, onSaved }) {
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [form, setForm] = useState({
    name_ar:    station?.name_ar    ?? '',
    name_en:    station?.name_en    ?? '',
    type:       station?.type       ?? 'main',
    region:     station?.region     ?? '',
    city_group: station?.city_group ?? '',
    is_active:  station?.is_active  ?? true,
    combined_arr_dep: station?.combined_arr_dep ?? false,
    is_agent:   station?.is_agent   ?? false,
  })
  // ورديات المحطة (للإيرادات): فارغ = الافتراضي العام من الإعدادات، وإلا 3 أو 4 ورديات بأوقات نهاية مخصصة
  const initEnds = Array.isArray(station?.shift_ends) && validEnds(station.shift_ends) ? station.shift_ends : null
  const [shiftMode, setShiftMode] = useState(initEnds ? 'custom' : 'default')
  const [shiftCount, setShiftCount] = useState(initEnds ? initEnds.length : 3)
  const [shiftEnds, setShiftEnds] = useState(initEnds ? initEnds.slice(0, -1).map(fmtMin) : ['08:00', '16:00'])
  const setCountSafe = n => { setShiftCount(n); setShiftEnds(prev => n === 4 ? (prev.length === 3 ? prev : [prev[0] ?? '08:00', prev[1] ?? '16:00', '20:00']) : prev.slice(0, 2)) }
  const draftEnds = [...shiftEnds.map(toMin), 1440]
  const shiftsValid = shiftMode !== 'custom' || (draftEnds.length === shiftCount && validEnds(draftEnds))
  const [tripNums, setTripNums] = useState(Array.isArray(station?.trip_numbers) ? station.trip_numbers : [])
  const [numInput, setNumInput] = useState('')
  const [allTrips, setAllTrips] = useState([])   // قائمة الرحلات من الجدول
  const [tripSearch, setTripSearch] = useState('')
  const [tripOpen, setTripOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('trip_schedule')
      .select('trip_number, route, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en)')
      .eq('is_active', true).order('trip_number')
      .then(({ data }) => setAllTrips(data ?? []))
  }, [])

  const addNum = v => {
    const code = (v ?? toLatinDigits(numInput)).trim().toUpperCase()
    if (code && !tripNums.includes(code)) setTripNums(n => [...n, code])
    setNumInput('')
    setTripSearch('')   // تصفير البحث ليبدأ الاختيار التالي من جديد
  }
  const removeNum = i => setTripNums(n => n.filter((_, idx) => idx !== i))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    // الاسم العربي إن أُدخل — وإلا الإنجليزي (يُستخدم في العرض والمناداة الصوتية)
    if (!shiftsValid) { setError(isAr ? 'رتّب أوقات نهاية الورديات تصاعدياً (كل وقت بعد الذي قبله وقبل 24:00)' : 'Shift end times must be ascending and before 24:00'); setSaving(false); return }
    const payload = { ...form, name_ar: (form.name_ar || '').trim() || form.name_en, trip_numbers: tripNums, created_by: profile.id }
    // العمود يُرسل فقط عند الحاجة (تخصيص، أو إلغاء تخصيص سابق) حتى تعمل الصفحة قبل تشغيل SQL
    if (shiftMode === 'custom') payload.shift_ends = draftEnds
    else if (station?.shift_ends != null) payload.shift_ends = null
    const res = station
      ? await supabase.from('stations').update(payload).eq('id', station.id).select('id').single()
      : await supabase.from('stations').insert(payload).select('id').single()
    if (res.error) { setError(res.error.message); setSaving(false); return }
    // ربط أرقام الرحلات بالترحيل تلقائياً
    try { await syncStationTripsByNumbers(res.data.id, tripNums, profile) }
    catch (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
    setSaving(false)
  }

  const tq = tripSearch.trim().toLowerCase()
  const tripMatches = !tripOpen ? [] : allTrips.filter(t => !tripNums.includes(t.trip_number) && (!tq || (
    (t.trip_number || '').toLowerCase().includes(tq) ||
    (t.route || '').toLowerCase().includes(tq) ||
    (t.from_station?.name_ar || '').includes(tq) || (t.from_station?.name_en || '').toLowerCase().includes(tq) ||
    (t.to_station?.name_ar || '').includes(tq) || (t.to_station?.name_en || '').toLowerCase().includes(tq)
  )))

  const segBtn = on => ({
    padding: '9px 20px', border: 'none', fontFamily: 'inherit', fontSize: '.86rem', fontWeight: 800, cursor: 'pointer',
    background: on ? 'var(--accent)' : 'var(--card)', color: on ? '#fff' : 'var(--text-2)',
  })
  const segWrap = { display: 'inline-flex', alignSelf: 'flex-start', border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden' }

  const footer = (
    <>
      {error && <p role="alert" style={{ flex: '1 1 100%', margin: 0, padding: '8px 12px', borderRadius: 10, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '.82rem', fontWeight: 700 }}>{error}</p>}
      <button type="button" className="stn-btn stn-btn-ghost" onClick={onClose}>{isAr ? 'إلغاء' : 'Cancel'}</button>
      <button type="submit" form={FORM_ID} className="stn-btn stn-btn-primary" disabled={saving} style={{ minWidth: 130 }}>
        {saving ? '...' : (isAr ? 'حفظ' : 'Save')}
      </button>
    </>
  )

  return (
    <Sheet variant="drawer" width={680} isAr={isAr} accent="#5B5BD6" icon={Ic.box} onClose={onClose} footer={footer}
      title={station ? (isAr ? 'تعديل محطة' : 'Edit Station') : (isAr ? 'إضافة محطة' : 'Add Station')}
      sub={station ? station.name_en : (isAr ? 'أدخل بيانات المحطة وورديتها وأرقام رحلاتها.' : 'Enter the station details, shifts and trip numbers.')}>
      <form id={FORM_ID} onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="stn-sec">
          <h3 className="stn-sec-t">{isAr ? 'بيانات المحطة' : 'Station details'}</h3>
          <p className="stn-sec-d">{isAr ? 'الاسم الإنجليزي إلزامي؛ إن تُرك العربي فارغاً يُستخدم الإنجليزي في العرض.' : 'English name is required; if Arabic is empty, English is used for display.'}</p>
          <div className="stn-g2" style={{ marginBottom: 14 }}>
            <div>
              <label className="stn-lbl">{isAr ? 'اسم المحطة (إنجليزي) *' : 'Station Name (English) *'}</label>
              <input required dir="ltr" className="stn-input" value={form.name_en} onChange={e => set('name_en', e.target.value)} />
            </div>
            <div>
              <label className="stn-lbl">{isAr ? 'الاسم العربي (اختياري)' : 'Arabic name (optional)'}</label>
              <input dir="rtl" className="stn-input" value={form.name_ar === form.name_en ? '' : form.name_ar}
                onChange={e => set('name_ar', e.target.value)}
                placeholder={isAr ? 'اختياري — مثال: تَيْمَاء' : 'Optional — e.g. تيماء'} />
            </div>
          </div>
          <div className="stn-g2" style={{ marginBottom: 14 }}>
            <div>
              <label className="stn-lbl">{isAr ? 'النوع' : 'Type'}</label>
              <SelectField className="stn-input" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="main">{isAr ? 'رئيسية' : 'Main'}</option>
                <option value="transit">{isAr ? 'مرور' : 'Transit'}</option>
              </SelectField>
            </div>
            <div>
              <label className="stn-lbl">{isAr ? 'المنطقة' : 'Region'}</label>
              <input className="stn-input" value={form.region} onChange={e => set('region', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="stn-lbl">{isAr ? 'مجموعة المدينة (لمنع رحلات داخل المدينة)' : 'City Group (prevent intra-city trips)'}</label>
            <input className="stn-input" dir="ltr" placeholder="e.g. jeddah"
              value={form.city_group} onChange={e => set('city_group', e.target.value.toLowerCase().trim())} />
          </div>
        </section>

        <section className="stn-sec">
          <h3 className="stn-sec-t">{isAr ? 'أرقام رحلات المحطة (وصول/مغادرة)' : 'Station trip numbers'}</h3>
          <p className="stn-sec-d">{isAr ? 'تُضاف رحلاتها للترحيل تلقائياً عند الحفظ وعند رفع أي جدول جديد.' : 'Auto-added to transportation on save and on each schedule upload.'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={tripSearch} onFocus={() => setTripOpen(true)} onChange={e => { setTripSearch(e.target.value); setTripOpen(true) }}
              placeholder={isAr ? 'ابحث أو افتح القائمة...' : 'Search or open list...'}
              className="stn-input" style={{ flex: 1 }} />
            <button type="button" className="stn-btn stn-btn-ghost" onClick={() => setTripOpen(o => !o)}>
              {tripOpen ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'القائمة' : 'List')}
            </button>
          </div>
          {tripOpen && (
            <div className="stn-pop">
              {tripMatches.length === 0
                ? <p style={{ margin: 0, padding: 14, textAlign: 'center', fontSize: '.82rem', color: 'var(--text-3)' }}>{isAr ? 'لا رحلات' : 'No trips'}</p>
                : tripMatches.map(t => (
                  <button type="button" key={t.trip_number} onClick={() => addNum(t.trip_number)}>
                    <span style={{ fontFamily: MONO, fontWeight: 900, color: 'var(--accent)' }}>{t.trip_number}</span>
                    {t.route && <span style={{ color: 'var(--text-3)' }}>· {t.route}</span>}
                    <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.from_station ? `${isAr ? t.from_station.name_ar : t.from_station.name_en} → ${isAr ? t.to_station?.name_ar : t.to_station?.name_en}` : ''}</span>
                  </button>
                ))}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, minHeight: 44, border: '1px solid var(--border-2)', borderRadius: 12, padding: 10, background: 'var(--card)', alignItems: 'center' }}>
            {tripNums.length === 0
              ? <span style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>{isAr ? 'لا توجد رحلات بعد' : 'No trips yet'}</span>
              : tripNums.map((n, i) => {
                const route = allTrips.find(t => t.trip_number === n)?.route
                return (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-2)', background: 'var(--surface)', borderRadius: 999, padding: '4px 6px', paddingInlineStart: 12, fontSize: '.84rem' }}>
                    <span style={{ fontFamily: MONO, fontWeight: 900, color: 'var(--accent)' }}>{n}</span>
                    {route && <span style={{ color: 'var(--text-3)' }}>· {route}</span>}
                    <button type="button" onClick={() => removeNum(i)} aria-label={isAr ? `إزالة ${n}` : `Remove ${n}`}
                      style={{ border: 'none', background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 99, width: 22, height: 22, cursor: 'pointer', fontSize: '.95rem', lineHeight: 1 }}>×</button>
                  </span>
                )
              })}
          </div>
        </section>

        <section className="stn-sec">
          <h3 className="stn-sec-t">{isAr ? 'ورديات هذي المحطة' : 'Station shifts'}</h3>
          <p className="stn-sec-d">{isAr ? 'تُستخدم في الإيرادات والترحيل والتقييم والسجل الوظيفي لهذي المحطة. الافتراضي 3 ورديات (08:00 / 16:00 / 24:00).' : 'Used for sales, transportation, ratings and employee file of this station. Default: 3 shifts (08:00 / 16:00 / 24:00).'}</p>
          <div style={segWrap}>
            {[['default', isAr ? 'قياسية (3)' : 'Standard (3)'], ['custom', isAr ? 'مخصصة' : 'Custom']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setShiftMode(k)} style={segBtn(shiftMode === k)}>{l}</button>
            ))}
          </div>
          {shiftMode === 'custom' && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={segWrap}>
                {[3, 4].map(n => (
                  <button key={n} type="button" onClick={() => setCountSafe(n)} style={segBtn(shiftCount === n)}>{isAr ? `${n} ورديات` : `${n} shifts`}</button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                {shiftEnds.map((v, i) => (
                  <div key={i}>
                    <label className="stn-lbl">{isAr ? `نهاية ${['أ', 'ب', 'ج'][i]}` : `End of ${['A', 'B', 'C'][i]}`}</label>
                    <TimeInput24 value={v} onChange={x => setShiftEnds(prev => prev.map((p, j) => (j === i ? x : p)))} />
                  </div>
                ))}
                <div>
                  <label className="stn-lbl">{isAr ? `نهاية ${['أ', 'ب', 'ج', 'د'][shiftCount - 1]}` : `End of ${['A', 'B', 'C', 'D'][shiftCount - 1]}`}</label>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-3)', fontFamily: MONO, fontWeight: 700, fontSize: '1.1rem', textAlign: 'center', letterSpacing: '.12em' }}>24:00</div>
                </div>
              </div>
              {shiftsValid
                ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} dir="ltr">{draftEnds.map((e, i) => <span key={i} style={{ fontSize: '.76rem', fontFamily: MONO, background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '3px 10px', color: 'var(--text-2)' }}>{['A', 'B', 'C', 'D'][i]} {fmtMin(i ? draftEnds[i - 1] : 0)} – {fmtMin(e)}</span>)}</div>
                : <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--danger)', fontWeight: 700 }}>{isAr ? 'الأوقات لازم تتصاعد وتكون قبل 24:00' : 'Times must ascend and be before 24:00'}</p>}
            </div>
          )}
        </section>

        <section className="stn-sec">
          <h3 className="stn-sec-t">{isAr ? 'الحالة والخيارات' : 'Status and options'}</h3>
          <p className="stn-sec-d">{isAr ? 'تحكّم في ظهور المحطة وطريقة إدخال بياناتها.' : 'Control how the station appears and how its data is entered.'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="stn-opt">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
              <span style={{ fontSize: '.92rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'نشطة' : 'Active'}</span>
            </label>
            <label className="stn-opt" style={{ borderColor: tint(AGENT_COLOR, 35), background: tint(AGENT_COLOR, 6) }}>
              <input type="checkbox" checked={!!form.is_agent} onChange={e => set('is_agent', e.target.checked)} />
              <span>
                <span style={{ display: 'block', fontSize: '.92rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'محطة وكيل' : 'Agent station'}</span>
                <span style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.7 }}>{isAr ? 'تُشغَّل عبر وكيل وليست من محطات نورث وست — تظهر بعلامة "وكيل" وتُحسب منفصلة في التقارير.' : 'Operated by an agent, not a North West station — shown with an "Agent" badge and counted separately in reports.'}</span>
              </span>
            </label>
            <label className="stn-opt">
              <input type="checkbox" checked={!!form.combined_arr_dep} onChange={e => set('combined_arr_dep', e.target.checked)} />
              <span>
                <span style={{ display: 'block', fontSize: '.92rem', fontWeight: 800, color: 'var(--text-1)' }}>{isAr ? 'وصول ومغادرة ببطاقة إدخال واحدة' : 'Arrival + departure on one entry card'}</span>
                <span style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.7 }}>
                  {isAr ? 'للمحطات اللي الباص يوصلها ويغادرها بنفس الوقت (مثل الطائف): يُدخل الموظف بطاقة واحدة، وتُسجَّل في التقارير كوصول ومغادرة.'
                        : 'For stops where the bus arrives and departs together: one entry card, still recorded as both arrival and departure in reports.'}
                </span>
              </span>
            </label>
          </div>
        </section>
      </form>
    </Sheet>
  )
}

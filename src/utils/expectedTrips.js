// الرحلات المتوقعة لكل محطة (نفس منطق صفحة الترحيل): أطراف (رحلة|تاريخ|محطة|اتجاه) + ما أُدخل فعلاً.
// تُستخدم في أداء المحطات وفي تنبيه الإدخالات المتأخرة للمشرف. الورديات المتوقفة (stations.inactive_shifts) لا تُحسب.
import { shiftIdx } from './shifts'
import { shiftsOfStation } from './stationShifts'

const toMin = t => { const [h, m] = String(t || '0:0').slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const groupOf = x => { if (!x) return null; if (x.city_group) return x.city_group; const w = (x.name_en || '').split(/[\s-]+/)[0].toLowerCase(); return w || null }

export const TRIP_SELECT = `trip_schedule_id, station_id, departure_time, arrival_time, dep_enabled, arr_enabled,
  trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, days_of_week, start_date, end_date,
  from_station:from_station_id(id, name_en, city_group), to_station:to_station_id(id, name_en, city_group))`

// stationTrips: صفوف station_trips (مع trip)، stops: trip_schedule_stops، stById: المحطات (id → صف فيه shift_ends/inactive_shifts)
// lagMin: مهلة بعد وقت رحلة اليوم قبل أن تُحسب متوقعة. تُرجع { exp, tripInfo }
export function buildExpected({ stationTrips, stops, stById, days, today, nowMin, lagMin = 0 }) {
  const stopMap = {}
  stops.forEach(s => { stopMap[`${s.trip_schedule_id}|${s.station_id}`] = s })
  const tripInfo = {}
  stationTrips.forEach(st => { if (st.trip) tripInfo[st.trip_schedule_id] = st.trip })
  const exp = {}   // station_id → [{ key, shift, date, time, isArr, tripNo }]
  stationTrips.forEach(st => {
    const t = st.trip, stn = stById[st.station_id]
    if (!t || !t.is_active || !stn) return
    const isDest = t.to_station_id === st.station_id, isOrigin = t.from_station_id === st.station_id
    const stop = stopMap[`${st.trip_schedule_id}|${st.station_id}`]
    const arrOn = st.arr_enabled !== false, depOn = st.dep_enabled !== false
    const curG = groupOf(stn), fromG = groupOf(t.from_station), toG = groupOf(t.to_station)
    const sameFrom = !!(curG && fromG && curG === fromG), sameTo = !!(curG && toG && curG === toG)
    const shifts = shiftsOfStation(stn)
    const legs = []   // [isArr, time]
    if (isDest) { if (arrOn) legs.push([true, st.arrival_time || t.scheduled_arrival]) }
    else if (isOrigin) { if (depOn) legs.push([false, st.departure_time || t.scheduled_departure]) }
    else if (stop) { if (arrOn && !sameFrom) legs.push([true, st.arrival_time || stop.arrival_time]); if (depOn && !sameTo) legs.push([false, st.departure_time || stop.departure_time]) }
    else { if (arrOn && !sameFrom) legs.push([true, st.arrival_time]); if (depOn && !sameTo) legs.push([false, st.departure_time]) }
    days.forEach(date => {
      if (t.is_rf && t.rf_date !== date) return
      if (t.start_date && date < t.start_date) return
      if (t.end_date && date > t.end_date) return
      if (t.days_of_week?.length && !t.days_of_week.includes(new Date(date + 'T00:00:00').getDay())) return
      legs.forEach(([isArr, time]) => {
        if (!time) return
        if (date === today && toMin(time) + lagMin > nowMin) return   // رحلة اليوم التي لم يحن وقتها بعد لا تُحسب
        const sh = shifts[shiftIdx(toMin(time), shifts)]
        if (sh.off) return                                            // وردية متوقفة في هذي المحطة
        ;(exp[st.station_id] ??= []).push({ key: `${st.trip_schedule_id}|${date}|${st.station_id}|${isArr ? 'a' : 'd'}`, shift: sh.k, date, time: String(time).slice(0, 5), isArr, tripNo: t.trip_number })
      })
    })
  })
  return { exp, tripInfo }
}

// المُدخل فعلاً: مجموعة مفاتيح بنفس صيغة buildExpected
export function enteredKeys(records, tripInfo) {
  const entered = new Set()
  records.forEach(r => {
    const t = tripInfo[r.trip_schedule_id]
    let isArr
    if (t && (t.to_station_id === r.station_id || t.from_station_id === r.station_id)) isArr = t.to_station_id === r.station_id
    else isArr = r.is_arrival != null ? r.is_arrival === true : (r.actual_arrival != null && r.actual_departure == null)
    entered.add(`${r.trip_schedule_id}|${r.record_date}|${r.station_id}|${isArr ? 'a' : 'd'}`)
  })
  return entered
}

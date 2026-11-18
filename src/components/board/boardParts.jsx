// أجزاء شاشة العرض المشتركة بين صفحة /board (الموظف) ومشغّل الشاشات /screen (بمفتاح الجهاز)
import { useState, useEffect, memo } from 'react'
import { NWB_LOGO_SVG } from '../../utils/logo'

// الشعار الرسمي مقلوب الألوان للشاشة الداكنة (يحافظ على البرتقالي الرسمي)
export const BOARD_LOGO = NWB_LOGO_SVG
  .replace(/#1D1D1C/gi, '#FFFFFF').replace(/#264673/gi, '#6E94D1').replace(/fill="white"/g, 'fill="none"')
  .replace(/width="180" height="90"/, 'width="170" height="85"')
export const toMin = hm => { const [h, m] = (hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }

export function Clock({ accent, muted, isAr }) {
  const [c, setC] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setC(new Date()), 1000); return () => clearInterval(t) }, [])
  const hm = c.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sec = String(c.getSeconds()).padStart(2, '0')
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} dir="ltr">
      <div style={{ fontSize: 46, fontWeight: 700, color: accent, lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: isAr ? 'flex-start' : 'flex-end' }}>
        <span>{hm}</span><span style={{ fontSize: 22, opacity: 0.55 }}>:{sec}</span>
      </div>
      <div style={{ fontSize: 13, color: muted, marginTop: 6, fontFamily: "'IBM Plex Sans Arabic', sans-serif", textAlign: isAr ? 'left' : 'right' }} dir={isAr ? 'rtl' : 'ltr'}>
        {c.toLocaleDateString(isAr ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  )
}

// قوالب الشاشة: لون الخلفية + تدرجات ناعمة بدل اللون الواحد
const GRID = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 22px)'
export const THEMES = {
  nwb:   { name: 'هوية النظام',   bg: '#0C161F', fx: `${GRID}, radial-gradient(1100px 520px at 85% -10%, rgba(222,149,38,0.16), transparent 62%), radial-gradient(900px 480px at 0% 105%, rgba(111,177,216,0.12), transparent 58%), linear-gradient(180deg,#101C27,#091119)`, accent: '#E3A02E', arr: '#4BC98F', dep: '#6FB1D8', text: '#F2EFE8', muted: '#8493A0' },
  navy:  { name: 'كحلي/ذهبي',    bg: '#0B1B34', fx: `${GRID}, radial-gradient(1000px 520px at 90% -10%, rgba(217,178,95,0.16), transparent 60%), radial-gradient(900px 500px at 0% 110%, rgba(90,166,255,0.14), transparent 58%), linear-gradient(180deg,#0E2142,#081528)`, accent: '#D9B25F', arr: '#3DDC97', dep: '#5AA6FF', text: '#E8EEF7', muted: '#8EA3C4' },
  black: { name: 'أسود/كهرماني',  bg: '#0A0A0C', fx: `${GRID}, radial-gradient(1000px 520px at 85% -10%, rgba(240,169,43,0.14), transparent 60%), linear-gradient(180deg,#121216,#070709)`, accent: '#F0A92B', arr: '#37D67A', dep: '#5AA6FF', text: '#F2F2F4', muted: '#9A9AA2' },
  teal:  { name: 'بترولي',        bg: '#07211F', fx: `${GRID}, radial-gradient(1000px 520px at 85% -10%, rgba(230,198,107,0.15), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(79,195,217,0.14), transparent 58%), linear-gradient(180deg,#0A2B28,#051917)`, accent: '#E6C66B', arr: '#56E0B0', dep: '#4FC3D9', text: '#EAFAF6', muted: '#8FB8B2' },
}

export const nmOf = (s, isAr) => (isAr ? s?.name_ar : s?.name_en) || '—'

// إزالة التكرار: نفس الرحلة بنفس الاتجاه والوقت (تُسجّل في كل محطة تمر بها)
export const dedupeEvents = list => {
  const seen = new Set()
  return list.filter(e => {
    const k = `${e.type}|${e.trip?.trip_number || ''}|${e.time}|${e.trip?.from_station?.name_en || ''}|${e.trip?.to_station?.name_en || ''}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

// الالتزام بالموعد (للركاب): «وصول مبكر» أو «في موعدها» فقط. التأخر حتى نصف ساعة يُعدّ في الموعد، وما زاد عن ذلك لا يُعرض.
export const delayInfo = (time, sched, isAr = true, type = 'arrival') => {
  if (!time || !sched) return null
  let d = toMin(time) - toMin(sched)
  if (d > 720) d -= 1440; else if (d < -720) d += 1440
  if (d > 30) return null
  if (type === 'arrival' && d < -5) return { txt: isAr ? 'وصول مبكر' : 'Arrived early', col: '#6FB1D8' }
  return { txt: isAr ? 'في موعدها' : 'On time', col: '#4BC98F' }
}

// لوحة رقم الحافلة: بارزة وواضحة من بعيد
export const BusPlate = ({ no, accent, size = 30 }) => (
  <div dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `2px solid ${accent}`, background: 'rgba(0,0,0,0.38)', borderRadius: 8, padding: '3px 12px 3px 8px', boxShadow: `0 0 0 3px ${accent}18` }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2.5" /><path d="M3 11h18M7 17v3M17 17v3" /><circle cx="7.5" cy="14" r="0.6" fill={accent} /><circle cx="16.5" cy="14" r="0.6" fill={accent} /></svg>
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: size, letterSpacing: 2, color: '#fff', lineHeight: 1.1 }}>{no}</span>
  </div>
)

// صف الحركة — مكوّن مستقل ومُحفّظ (memo) حتى لا يُعاد إنشاؤه عند كل رسم (يمنع الاهتزاز). مقاسات كبيرة تُقرأ من بعيد على التلفزيون.
export const ROW_H = 100
export const Row = memo(function Row({ e, accent, th, isAr, nowMin, scoped }) {
  const upcoming = e.status === 'upcoming'
  const arr = e.type === 'arrival'
  const mins = upcoming && nowMin != null ? toMin(e.time) - nowMin : null
  const soon = mins != null && mins >= -10 && mins <= 20
  const dl = !upcoming ? delayInfo(e.time, e.sched, isAr, e.type) : null
  const otherName = nmOf(arr ? e.trip?.from_station : e.trip?.to_station, isAr)
  const prog = upcoming && mins != null ? Math.max(0, Math.min(1, 1 - mins / 90)) : 0     // يمتلئ كلما اقترب الموعد (آخر 90 دقيقة)
  return (
    <div className="lb-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, height: ROW_H, boxSizing: 'border-box', padding: '0 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: soon ? `linear-gradient(90deg, ${accent}1f, transparent 70%)` : 'transparent', opacity: upcoming && !soon ? 0.9 : 1 }}>
      <span style={{ position: 'absolute', insetInlineStart: 0, top: 12, bottom: 12, width: 5, borderRadius: 3, background: upcoming ? `${accent}77` : accent }} />
      {upcoming && prog > 0.02 && <span style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 3, background: 'rgba(255,255,255,0.05)' }}><i style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: `${prog * 100}%`, background: accent, opacity: 0.85, display: 'block' }} /></span>}
      <div dir="ltr" style={{ minWidth: 128, textAlign: 'center', lineHeight: 1 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 46, fontWeight: 800, color: th.text, letterSpacing: 1 }}>{e.time}</div>
        {e.sched && e.sched !== e.time && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: th.muted, marginTop: 6 }}>{isAr ? 'الموعد ' : 'Sched '}{e.sched}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {scoped ? (
          // شاشة محطة: طرف الرحلة الآخر فقط (المحطة نفسها معروفة) في سطر واحد: الوصول «من …» والمغادرة «إلى …»
          <div dir="ltr" style={{ display: 'flex', alignItems: 'baseline', justifyContent: isAr ? 'flex-end' : 'flex-start', gap: 14, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: th.text, ...(otherName.length > 30 ? { fontSize: 24 } : otherName.length > 22 ? { fontSize: 28 } : { fontSize: 34 }), overflow: 'hidden', textOverflow: 'ellipsis' }}>{otherName}</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: accent, letterSpacing: 1 }}>{arr ? (isAr ? 'من' : 'FROM') : (isAr ? 'إلى' : 'TO')}</span>
          </div>
        ) : (
          <div dir="ltr" style={{ fontSize: 27, fontWeight: 800, color: th.text, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: isAr ? 'right' : 'left' }}>
            {nmOf(e.trip?.from_station, isAr)} <span style={{ color: accent, fontWeight: 800, margin: '0 8px' }}>→</span> {nmOf(e.trip?.to_station, isAr)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isAr ? 'flex-end' : 'flex-start', gap: 8, marginTop: 8 }} dir="ltr">
          <span style={{ fontSize: 16, fontWeight: 700, color: th.muted, background: 'rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 10px', fontFamily: "'IBM Plex Mono', monospace" }}>{e.trip?.trip_number || '—'}</span>
        </div>
      </div>
      {e.bus ? <BusPlate no={e.bus} accent={accent} size={34} /> : null}
      <div style={{ textAlign: 'center', minWidth: 150 }}>
        {upcoming
          ? (soon
            ? <span className="lb-ar" style={{ fontSize: 20, fontWeight: 800, color: '#101010', background: accent, borderRadius: 8, padding: '7px 18px', whiteSpace: 'nowrap' }}>{mins <= 0 ? (isAr ? 'الآن' : 'Now') : (isAr ? `بعد ${mins} د` : `in ${mins} min`)}</span>
            : <span style={{ fontSize: 19, fontWeight: 700, color: th.text, opacity: 0.85, border: `1px solid ${th.muted}66`, borderRadius: 8, padding: '6px 16px', whiteSpace: 'nowrap' }}>{mins != null && mins > 0 ? (isAr ? `بعد ${mins >= 60 ? `${Math.floor(mins / 60)}س ${mins % 60}د` : `${mins} د`}` : `in ${mins}m`) : (isAr ? 'مجدولة' : 'Scheduled')}</span>)
          : <>
              <span style={{ fontSize: 20, fontWeight: 800, color: accent, background: `${accent}22`, border: `1px solid ${accent}66`, borderRadius: 8, padding: '6px 16px', whiteSpace: 'nowrap' }}>{arr ? (isAr ? '✓ تم الوصول' : '✓ Arrived') : (isAr ? '✓ تمت المغادرة' : '✓ Departed')}</span>
              {dl && <div style={{ marginTop: 7, fontSize: 16, fontWeight: 800, color: dl.col }}>{dl.txt}</div>}
            </>}
      </div>
    </div>
  )
})

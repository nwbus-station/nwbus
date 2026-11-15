// بطاقة الموظف: شريط عريض (جوال / كمبيوتر ضيّق) أو بطاقة جانبية عمودية (كمبيوتر عريض)
import { f, Ring } from './ui'

export default function ProfileHero({ u, titleLine, tags, evalAvg, loginRate, showEval, showActivity, isAr, side }) {
  const initial = String(u.full_name_ar || '?').trim().charAt(0)
  const inactive = u.is_active === false
  const rings = (showEval || showActivity) && (
    <div style={{ display: 'flex', gap: side ? 12 : 22, justifyContent: side ? 'space-around' : undefined, width: side ? '100%' : undefined, paddingTop: side ? 16 : 0, borderTop: side ? '1px solid rgba(255,255,255,0.16)' : 'none' }}>
      {showEval && <Ring pct={evalAvg ?? 0} color="#EE712D" label={evalAvg != null ? (evalAvg / 10).toFixed(1) : '—'} sub={isAr ? 'التقييم /10' : 'Eval /10'} size={side ? 92 : 84} subColor="rgba(255,255,255,0.78)" />}
      {showActivity && <Ring pct={loginRate * 100} color="#38bdf8" label={`${Math.round(loginRate * 100)}%`} sub={isAr ? 'نسبة الدخول' : 'Login rate'} size={side ? 92 : 84} subColor="rgba(255,255,255,0.78)" />}
    </div>
  )
  const status = <span style={{ background: inactive ? '#dc2626' : '#16a34a', borderRadius: 99, padding: '3px 12px', fontSize: f('0.74rem'), fontWeight: 800 }}>{inactive ? (isAr ? 'معطّل' : 'Disabled') : (isAr ? 'نشط' : 'Active')}</span>
  const tagEls = tags.map(t => <span key={t} style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 99, padding: '3px 12px', fontSize: f('0.74rem'), fontWeight: 700 }}>{t}</span>)

  if (side) {
    return (
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(160deg,#1C2B4A,#264673 70%,#34588f)', color: '#fff', padding: '26px 22px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <span style={{ width: 84, height: 84, borderRadius: '50%', background: '#EE712D', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '2.2rem', boxShadow: '0 0 0 5px rgba(255,255,255,0.14)' }}>{initial}</span>
        <div>
          <div style={{ fontWeight: 900, fontSize: f('1.3rem'), lineHeight: 1.35 }}>{u.full_name_ar}</div>
          <div style={{ opacity: 0.85, fontSize: f('0.82rem'), marginTop: 4 }}>{titleLine}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{tagEls}{status}</div>
        {rings}
      </div>
    )
  }
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg,#1C2B4A,#264673 70%,#34588f)', color: '#fff', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <span style={{ width: 66, height: 66, borderRadius: '50%', background: '#EE712D', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '1.7rem', flexShrink: 0 }}>{initial}</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 900, fontSize: f('1.3rem') }}>{u.full_name_ar}</div>
        <div style={{ opacity: 0.85, fontSize: f('0.82rem'), marginTop: 3 }}>{titleLine}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{tagEls}{status}</div>
      </div>
      {rings}
    </div>
  )
}

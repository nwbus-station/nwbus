// مبدّل العروض: ملف الموظف / أداء المحطات / الالتزام بالإيراد — بطاقات بوصف على الكمبيوتر، وأزرار متساوية على الجوال
import { f } from './ui'

export default function ViewTabs({ view, onChange, isAr, desk }) {
  const tabs = [
    ['employee', isAr ? 'ملف الموظف' : 'Employee', isAr ? 'سجل شامل لموظف واحد: الإجازات والأداء والإيرادات والتقييم' : 'Full record of one employee'],
    ['stations', isAr ? 'أداء المحطات' : 'Stations performance', isAr ? 'مقارنة أداء المحطات وترتيبها وتحديد المقصّر منها' : 'Compare and rank stations'],
    ['coverage', isAr ? 'الالتزام بالإيراد' : 'Revenue compliance', isAr ? 'أي المحطات لا تُدخل يومية الإيراد، وكم موظفاً فتح حسابه' : 'Which stations skip the daily revenue entry'],
  ]
  return (
    <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: desk ? 12 : 6, marginBottom: desk ? 20 : 12 }}>
      {tabs.map(([k, l, d]) => {
        const on = view === k
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)} className="ef-tab"
            style={{
              textAlign: desk ? 'start' : 'center', fontFamily: 'inherit', cursor: 'pointer', minWidth: 0,
              padding: desk ? '14px 20px' : '10px 6px', borderRadius: desk ? 14 : 10,
              border: `1.5px solid ${on ? '#1C2B4A' : 'var(--border)'}`, background: on ? '#1C2B4A' : 'var(--card)', color: on ? '#fff' : 'var(--text-1)',
              boxShadow: on && desk ? '0 6px 18px rgba(28,43,74,0.22)' : 'none',
            }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: desk ? 'flex-start' : 'center' }}>
              {desk && <span aria-hidden="true" style={{ width: 4, height: 16, borderRadius: 2, background: on ? '#EE712D' : 'var(--border-2)', flexShrink: 0 }} />}
              <span style={{ fontWeight: 800, fontSize: desk ? f('0.92rem') : '0.76rem', lineHeight: 1.35 }}>{l}</span>
            </span>
            {desk && <span style={{ display: 'block', marginTop: 5, fontSize: f('0.72rem'), lineHeight: 1.65, color: on ? 'rgba(255,255,255,0.78)' : 'var(--text-3)', fontWeight: 500 }}>{d}</span>}
          </button>
        )
      })}
    </div>
  )
}

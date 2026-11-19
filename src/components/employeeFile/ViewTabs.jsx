// مبدّل العروض: شريط تبويبات واحد مضغوط (يتمرّر أفقياً على الجوال) + سطر وصف للتبويب المحدد فقط — بدل بطاقات كبيرة مكررة.
// التبويبات: ملف الموظف · أداء المحطات · أداء الحسابات · الإدخالات المتأخرة · الالتزام بالإيراد
import { f } from './ui'

export default function ViewTabs({ view, onChange, isAr, desk }) {
  const tabs = [
    ['employee', isAr ? 'ملف الموظف' : 'Employee', isAr ? 'سجل شامل لموظف واحد: الإجازات والأداء والإيرادات والتقييم.' : 'Full record of one employee.'],
    ['stations', isAr ? 'أداء المحطات' : 'Stations', isAr ? 'مقارنة أداء المحطات وترتيبها وتحديد المقصّر منها.' : 'Compare and rank stations.'],
    ['accounts', isAr ? 'أداء الحسابات' : 'Accounts', isAr ? 'نشاط كل حساب: أيام الإدخال وآخر دخول ومن لم يدخل أبداً.' : 'Per-account activity and last login.'],
    ['late', isAr ? 'الإدخالات المتأخرة' : 'Late entries', isAr ? 'إيراد ورحلات لم تُدخل، ومن أقرّ من المشرفين بعلمه ومن لم يقرّ.' : 'Missing revenue/trips and who acknowledged.'],
    ['coverage', isAr ? 'الالتزام بالإيراد' : 'Revenue compliance', isAr ? 'أي المحطات لا تُدخل يومية الإيراد، وكم موظفاً فتح حسابه.' : 'Which stations skip the daily revenue entry.'],
  ]
  const cur = tabs.find(x => x[0] === view)
  return (
    <div style={{ marginBottom: desk ? 18 : 12 }}>
      <div role="tablist" style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '2px solid var(--border)' }}>
        {tabs.map(([k, l]) => {
          const on = view === k
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)} className="ef-tab"
              style={{
                flex: desk ? '0 0 auto' : '1 0 auto', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                padding: desk ? '11px 22px' : '10px 14px', border: 'none', background: on ? 'var(--card)' : 'transparent',
                borderBottom: `3px solid ${on ? '#EE712D' : 'transparent'}`, marginBottom: -2, borderRadius: '8px 8px 0 0',
                color: on ? 'var(--text-1)' : 'var(--text-3)', fontWeight: on ? 900 : 700, fontSize: desk ? f('0.9rem') : '0.8rem',
              }}>
              {l}
            </button>
          )
        })}
      </div>
      {cur && <p style={{ margin: '10px 4px 0', fontSize: f('0.76rem'), color: 'var(--text-3)', fontWeight: 600, lineHeight: 1.7 }}>{cur[2]}</p>}
    </div>
  )
}

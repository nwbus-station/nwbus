import PageHeader from '../shared/PageHeader'

// ترويسة الكمبيوتر: عنوان + مؤشرات + شريط تبويبات داخل نفس البطاقة
export default function RatingsHeader({ isAr, tab, onTab, stats, actions }) {
  const tabs = [
    { id: 'ratings', label: isAr ? 'التقييمات' : 'Ratings' },
    { id: 'messages', label: isAr ? 'رسائل المحطات' : 'Station Messages' },
    { id: 'survey', label: isAr ? 'استبيان العملاء' : 'Customer Survey' },
  ]
  return (
    <PageHeader
      title={isAr ? 'تقييمات العملاء' : 'Customer Ratings'}
      subtitle={isAr ? 'تقييم العملاء لموظفي خدمة العملاء والمرحّلين عبر رمز QR' : 'Customer ratings of customer service staff and dispatchers via QR code'}
      accent="var(--accent)"
      actions={actions}
      stats={stats}>
      <div className="cr-tabs" role="tablist" aria-label={isAr ? 'أقسام الصفحة' : 'Page sections'}>
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="cr-tab" onClick={() => onTab(t.id)}>{t.label}</button>
        ))}
      </div>
    </PageHeader>
  )
}

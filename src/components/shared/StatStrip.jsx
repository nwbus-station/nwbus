// شريط إحصاء مسطّح — بديل شبكات المربعات الملونة
// items: [{ label, val, tone? (كلاس لون للقيمة عند الحاجة الدلالية فقط) }]
export default function StatStrip({ items, className = '' }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-wrap ${className}`}>
      {items.map((s, i) => (
        <div key={s.label} className={`flex-1 min-w-[110px] px-4 py-2.5 text-center ${i > 0 ? 'border-s border-gray-200' : ''}`}>
          <div className={`text-base font-bold font-mono leading-tight ${s.tone || 'text-gray-800'}`}>{s.val}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

import { useState } from 'react'
import useCallLibrary from '../components/calls/useCallLibrary'
import AnnounceTab from '../components/calls/AnnounceTab'
import SetupTab from '../components/calls/SetupTab'

// نداء الركاب: تبويبان فقط — «النداء» للتشغيل اليومي، و«إعداد الأصوات» يُنفَّذ مرة واحدة (زر تجهيز تلقائي)
export default function CallPage() {
  const lib = useCallLibrary()
  const ready = lib.stats.total > 0 && lib.stats.arabic === lib.stats.total && lib.stats.phrases === lib.stats.phraseTotal && lib.stats.clips === lib.stats.total
  const [tab, setTab] = useState('announce')

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6" dir="rtl">
      <h1 className="text-xl font-bold text-gray-800 mb-1">نداء الركاب</h1>
      <p className="text-sm text-gray-500 mb-4">نداء صوتي لركاب رحلة معينة أو نص حر، بصوت بشري واضح.</p>

      <div className="flex border-b border-gray-200 mb-4">
        {[{ id: 'announce', label: 'النداء' }, { id: 'setup', label: 'إعداد الأصوات', dot: !lib.loading && !ready }].map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-nwbus-primary text-nwbus-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}{t.dot && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ms-1.5 align-middle" title="يحتاج إعداد" />}
          </button>
        ))}
      </div>

      {tab === 'announce' && !lib.loading && !ready && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg p-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <span>الأصوات غير مكتملة. اضغط «تجهيز كل شيء» مرة واحدة لتجهيزها، وبعدها يعمل النداء بسرعة وبلا استهلاك رصيد.</span>
          <button type="button" onClick={() => setTab('setup')} className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-semibold shrink-0">إعداد الأصوات</button>
        </div>
      )}

      {tab === 'announce' ? <AnnounceTab lib={lib} onGoSetup={() => setTab('setup')} /> : <SetupTab lib={lib} />}
    </div>
  )
}

import { useState, useEffect } from 'react'

// بريد/قناة التواصل لطلبات الخصوصية — عدّله هنا قبل الإطلاق الرسمي
const CONTACT = ''
const UPDATED = '2026-10-06'
const RETENTION_MONTHS = 24

const T = {
  ar: {
    dir: 'rtl', lang: 'العربية', title: 'سياسة الخصوصية', updated: 'آخر تحديث', back: 'رجوع',
    intro: 'تشرح هذه السياسة كيف تتعامل NW Bus (نظام تشغيل المحطات والحافلات) مع البيانات التي تتركها عند تعبئة استبيان تجربة الراكب. المشاركة بالاستبيان اختيارية بالكامل.',
    sections: [
      ['من هو المسؤول عن بياناتك؟', ['الجهة المشغّلة لخدمة NW Bus ونظام تشغيل المحطات، وهي المتحكم بالبيانات المذكورة هنا.']],
      ['البيانات التي نجمعها', [
        'إجاباتك على الاستبيان: تقييمات الرحلة أو المحطة، وتوصيتك بالخدمة، وما تختاره من أولويات تحسين.',
        'ما تكتبه بنفسك اختيارياً: الملاحظات النصية.',
        'معلومات اختيارية عنك دون اسمك: الفئة العمرية، نوع المسافر (طالب، موظف، عائلة…)، غرض الرحلة، تكرار السفر.',
        'رقم جوالك: فقط إذا قررت تركه لنتواصل معك.',
        'بيانات تقنية لمنع الإساءة والتكرار: معرّف عشوائي لجهازك لا يرتبط باسمك، ونسخة مشفّرة من عنوان الشبكة (IP) — لا نحتفظ بالعنوان نفسه.',
        'لا نطلب اسمك ولا هويتك ولا بيانات الدفع، ولا نتتبع موقعك.',
      ]],
      ['لماذا نستخدمها؟', [
        'قياس رضا العملاء وتحسين جودة الرحلات والمحطات والخدمة.',
        'إعداد إحصاءات مجمّعة للإدارة (مثل مؤشر الرضا حسب المحطة).',
        'التواصل معك للرد على ملاحظتك، إذا تركت رقمك.',
        'حماية الاستبيان من الإرسال الآلي والمكرر.',
      ]],
      ['الأساس النظامي', ['نعالج بياناتك بناءً على موافقتك: الاستبيان اختياري، وإرسالك له يعني موافقتك على الاستخدام الموضح هنا، ويمكنك سحبها في أي وقت.']],
      ['من يطّلع على بياناتك؟', [
        'فريق الإدارة المخوّل فقط، عبر حسابات بصلاحيات محددة.',
        'لا نبيع بياناتك ولا نشاركها مع جهات خارجية لأغراض تسويقية.',
        'نستخدم مزوّدي خدمات تقنية (استضافة وقاعدة بيانات) يعالجون البيانات نيابةً عنا وفق تعليماتنا فقط.',
      ]],
      ['مدة الاحتفاظ', [`نحتفظ ببيانات الاستبيان حتى ${RETENTION_MONTHS} شهراً من تاريخ إرسالها، ثم تُحذف.`]],
      ['حقوقك', [
        'الاطلاع على بياناتك وطلب نسخة منها.',
        'تصحيحها أو طلب حذفها.',
        'سحب موافقتك في أي وقت.',
        'ولأننا لا نطلب اسمك، قد نحتاج منك رقم الجوال أو تفاصيل الاستبيان (التاريخ والمحطة) لنتمكن من تحديد استجابتك.',
      ]],
      ['حماية البيانات', [
        'الاتصال مشفّر (HTTPS).',
        'الوصول للبيانات مقيّد بصلاحيات، ومحمي بقواعد على مستوى قاعدة البيانات.',
        'لا تُخزَّن كلمات المرور بشكل مقروء.',
      ]],
      ['الأطفال', ['إذا كان عمرك أقل من 18 سنة، نرجو موافقة ولي أمرك قبل ترك رقم جوالك.']],
      ['التحديثات', ['قد نحدّث هذه السياسة، وتاريخ آخر تحديث مذكور أعلاها.']],
    ],
    contact: 'للتواصل بخصوص بياناتك',
    contactFallback: 'تواصل مع إدارة NW Bus عبر قنواتنا الرسمية.',
  },
  en: {
    dir: 'ltr', lang: 'English', title: 'Privacy Policy', updated: 'Last updated', back: 'Back',
    intro: 'This policy explains how NW Bus (our stations and bus operations system) handles the data you provide when you fill in the passenger experience survey. Taking part in the survey is entirely optional.',
    sections: [
      ['Who is responsible for your data?', ['The operator of the NW Bus service and its stations operations system is the data controller for the data described here.']],
      ['What we collect', [
        'Your survey answers: ratings of your trip or station, your likelihood to recommend us, and the improvement priorities you pick.',
        'What you optionally write yourself: free-text comments.',
        'Optional details about you, without your name: age group, traveler type (student, employee, family…), trip purpose and travel frequency.',
        'Your mobile number: only if you choose to leave it so we can contact you.',
        'Technical data to prevent abuse and duplicates: a random device identifier not linked to your name, and an irreversibly hashed form of your network (IP) address — we do not keep the address itself.',
        'We do not ask for your name, ID or payment details, and we do not track your location.',
      ]],
      ['Why we use it', [
        'To measure customer satisfaction and improve trips, stations and service.',
        'To produce aggregated statistics for management (e.g. satisfaction by station).',
        'To reply to your comment, if you left your number.',
        'To protect the survey from automated or repeated submissions.',
      ]],
      ['Legal basis', ['We process your data based on your consent: the survey is optional, submitting it means you agree to the use described here, and you may withdraw consent at any time.']],
      ['Who can see your data', [
        'Only authorised management staff, through accounts with specific permissions.',
        'We do not sell your data or share it with third parties for marketing.',
        'We use technical service providers (hosting and database) who process data on our behalf and only on our instructions.',
      ]],
      ['Retention', [`We keep survey data for up to ${RETENTION_MONTHS} months from submission, then delete it.`]],
      ['Your rights', [
        'Access your data and request a copy.',
        'Correct it or request deletion.',
        'Withdraw your consent at any time.',
        'Because we do not ask for your name, we may need your mobile number or survey details (date and station) to identify your response.',
      ]],
      ['How we protect data', [
        'Connections are encrypted (HTTPS).',
        'Access is permission-based and enforced at the database level.',
        'Passwords are never stored in readable form.',
      ]],
      ['Children', ['If you are under 18, please get a parent or guardian’s approval before leaving your mobile number.']],
      ['Changes', ['We may update this policy; the last-updated date appears at the top.']],
    ],
    contact: 'To contact us about your data',
    contactFallback: 'Contact NW Bus management through our official channels.',
  },
}

export default function PrivacyPage() {
  const initial = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ar'
  const [lang, setLang] = useState(initial)
  const t = T[lang]

  useEffect(() => {
    const prevDir = document.documentElement.dir, prevLang = document.documentElement.lang
    document.documentElement.dir = t.dir
    document.documentElement.lang = lang
    return () => { document.documentElement.dir = prevDir; document.documentElement.lang = prevLang }
  }, [lang, t.dir])

  return (
    <div dir={t.dir} className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "system-ui, 'Segoe UI', Tahoma, Arial, sans-serif" }}>
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-extrabold tracking-tight">NW Bus</span>
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
            {['ar', 'en'].map(l => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${lang === l ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>{T[l].lang}</button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <p className="text-xs text-slate-400 mt-1">{t.updated}: {UPDATED}</p>
        <p className="text-sm text-slate-700 leading-relaxed mt-5">{t.intro}</p>
        <div className="mt-6 space-y-6">
          {t.sections.map(([h, items], i) => (
            <section key={i}>
              <h2 className="text-base font-bold text-slate-900 mb-2">{i + 1}. {h}</h2>
              <ul className="space-y-1.5">
                {items.map((x, j) => (
                  <li key={j} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />{x}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-8 bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-sm font-bold">{t.contact}</p>
          <p className="text-sm text-slate-600 mt-1" dir="auto">{CONTACT || t.contactFallback}</p>
        </div>
        <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = '/feedback'))}
          className="mt-6 text-xs font-semibold text-slate-500">← {t.back}</button>
      </main>
    </div>
  )
}

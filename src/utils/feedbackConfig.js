// استبيان العملاء العام (QR موحّد): هيكل الأسئلة والخيارات + الترجمات (عربي / English / اردو)
// الأردو تحتاج مراجعة ناطق أصلي قبل الإطلاق الرسمي

export const LANGS = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
]

// جوانب التقييم لكل جزء (مفاتيح تُخزَّن بالقاعدة) — skippable = يقدر العميل يقول "لم أستخدمه"
export const TRIP_ASPECTS = [
  { key: 'punctuality' },
  { key: 'driver' },
  { key: 'bus_clean' },
  { key: 'comfort' },
  { key: 'ticketing', skippable: true },
  { key: 'call_center', skippable: true },
]
export const STATION_ASPECTS = [
  { key: 'st_overall' },
  { key: 'st_clean' },
  { key: 'st_staff' },
  { key: 'st_facilities' },
  { key: 'st_info' },
]

export const IMPROVE_TRIP = ['delay', 'clean', 'driver', 'comfort', 'crowd', 'toilets', 'ticket', 'info', 'safety', 'staff']
export const IMPROVE_STATION = ['clean', 'toilets', 'staff', 'seating', 'wait', 'info', 'safety', 'crowd']
export const LOW_REASONS = ['delay', 'clean', 'rude', 'crowd', 'broken', 'slow', 'confusing', 'expensive', 'other']

export const AGE_GROUPS = ['age_u18', 'age_18', 'age_25', 'age_35', 'age_45', 'age_60']
export const TRAVELER_TYPES = ['tt_student', 'tt_employee', 'tt_family', 'tt_pilgrim', 'tt_tourist', 'tt_resident', 'tt_business']
export const TRIP_PURPOSES = ['pp_umrah', 'pp_family', 'pp_work', 'pp_study', 'pp_tourism', 'pp_medical', 'pp_other']
export const FREQUENCIES = ['fq_first', 'fq_monthly', 'fq_weekly']

export const FACES = ['😡', '☹️', '😐', '🙂', '😍']

export const T = {
  ar: {
    title: 'رأيك يهمنا', sub: 'أقل من دقيقة وتساعدنا نخدمك أفضل',
    startTrip: 'قيّم رحلتك', startTripHint: 'السائق والحافلة والموعد والتذكرة',
    startStation: 'قيّم المحطة', startStationHint: 'النظافة والموظفون والمرافق',
    back: 'رجوع', submit: 'إرسال التقييم', sending: 'جارٍ الإرسال…',
    tripSection: 'رحلتك', stationSection: 'المحطة',
    fromStation: 'محطة الركوب', toStation: 'محطة الوصول', tripNumber: 'رقم الرحلة (اختياري)',
    pickStation: 'اختر المحطة', searchStation: 'ابحث عن محطة…', noResults: 'لا توجد نتائج', close: 'إغلاق',
    rateTrip: 'كيف كانت تجربتك؟', rateStation: 'كيف كانت تجربتك بالمحطة؟',
    skipHint: 'اترك أي جانب لم تستخدمه بدون تقييم',
    faces: ['سيئ جداً', 'سيئ', 'مقبول', 'جيد', 'ممتاز'],
    nps: 'ما احتمال أن توصي أهلك وأصدقاءك بالسفر معنا؟', npsLow: 'غير محتمل أبداً', npsHigh: 'محتمل جداً',
    improveTitle: 'ما أكثر شي نحتاج نحسّنه؟ (اختر حتى اثنين)',
    lowTitle: 'نعتذر عن تجربتك — وش السبب؟',
    commentLabel: 'ملاحظاتك (اختياري)', commentPh: 'اكتب ما تحب أن نعرفه…',
    aboutYou: 'عرّفنا عليك', aboutHint: 'اختياري — تساعدنا نفهم عملاءنا ونخدمهم أفضل، ولا نطلب اسمك',
    age: 'الفئة العمرية', traveler: 'أنت', purpose: 'غرض الرحلة', frequency: 'كم مرة تسافر معنا؟',
    contactTitle: 'خلّنا نتواصل معك', contactLowTitle: 'نعتذر عن تجربتك — خلّنا نتواصل معك',
    contactHint: 'اترك رقم جوالك إذا تحب نرد على ملاحظتك أو نتابع تجربتك. اختياري، ونستخدمه لهذا الغرض فقط ولا نشاركه مع أحد.',
    contactPh: 'رقم الجوال، مثال: 05xxxxxxxx', badPhone: 'رقم الجوال غير صحيح',
    thanks: 'شكراً لك!', thanksSub: 'رأيك يصلنا مباشرة ويساعدنا نطوّر خدماتنا',
    rateOtherTrip: 'قيّم رحلتك أيضاً', rateOtherStation: 'قيّم المحطة أيضاً',
    needStations: 'اختر محطة الركوب ومحطة الوصول', needStation: 'اختر المحطة', needRating: 'قيّم جانباً واحداً على الأقل',
    dup: 'وصلنا تقييمك قبل قليل — شكراً لك', error: 'تعذّر الإرسال، حاول مرة أخرى', required: 'مطلوب',
    o: {
      delay: 'التأخير', clean: 'النظافة', staff: 'تعامل الموظفين', crowd: 'الازدحام', toilets: 'دورات المياه',
      ticket: 'التذاكر والحجز', info: 'المعلومات والإرشاد', safety: 'الأمان', driver: 'السائق', comfort: 'الراحة',
      seating: 'الجلوس والانتظار', wait: 'وقت الانتظار', broken: 'أعطال أو تلف', slow: 'بطء الخدمة',
      confusing: 'غموض المعلومات', rude: 'سوء التعامل', expensive: 'السعر', other: 'سبب آخر',
      age_u18: 'أقل من 18', age_18: '18–24', age_25: '25–34', age_35: '35–44', age_45: '45–59', age_60: '60 فأكثر',
      tt_student: 'طالب', tt_employee: 'موظف', tt_family: 'عائلة', tt_pilgrim: 'معتمر / حاج', tt_tourist: 'سائح', tt_resident: 'مقيم', tt_business: 'رجل أعمال',
      pp_umrah: 'عمرة / حج', pp_family: 'زيارة أهل', pp_work: 'عمل', pp_study: 'دراسة', pp_tourism: 'سياحة', pp_medical: 'علاج', pp_other: 'أخرى',
      fq_first: 'أول مرة', fq_monthly: 'شهرياً', fq_weekly: 'أسبوعياً أو أكثر',
    },
    a: {
      punctuality: 'الالتزام بالموعد', driver: 'السائق وقيادته', bus_clean: 'نظافة الحافلة', comfort: 'الراحة (المقاعد والتكييف)',
      ticketing: 'شراء التذكرة', call_center: 'مركز الاتصال',
      st_overall: 'تجربتك العامة بالمحطة', st_clean: 'نظافة المحطة ودورات المياه', st_staff: 'تعامل الموظفين',
      st_facilities: 'المرافق والجلوس', st_info: 'الإرشاد ولوحات المواعيد',
    },
  },
  en: {
    title: 'Your opinion matters', sub: 'Less than a minute — help us serve you better',
    startTrip: 'Rate your trip', startTripHint: 'Driver, bus, timing and ticketing',
    startStation: 'Rate the station', startStationHint: 'Cleanliness, staff and facilities',
    back: 'Back', submit: 'Submit feedback', sending: 'Sending…',
    tripSection: 'Your trip', stationSection: 'Station',
    fromStation: 'Boarding station', toStation: 'Destination station', tripNumber: 'Trip number (optional)',
    pickStation: 'Select station', searchStation: 'Search station…', noResults: 'No results', close: 'Close',
    rateTrip: 'How was your experience?', rateStation: 'How was your experience at the station?',
    skipHint: 'Leave anything you did not use unrated',
    faces: ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent'],
    nps: 'How likely are you to recommend us to family and friends?', npsLow: 'Not at all likely', npsHigh: 'Extremely likely',
    improveTitle: 'What should we improve most? (up to 2)',
    lowTitle: 'Sorry about your experience — what went wrong?',
    commentLabel: 'Your comments (optional)', commentPh: 'Tell us anything you would like us to know…',
    aboutYou: 'A little about you', aboutHint: 'Optional — helps us understand our customers; we never ask your name',
    age: 'Age group', traveler: 'I am a', purpose: 'Purpose of trip', frequency: 'How often do you travel with us?',
    contactTitle: 'Let us get back to you', contactLowTitle: 'We are sorry — let us make it right',
    contactHint: 'Leave your mobile number if you would like us to reply or follow up. Optional — used only for that purpose and never shared.',
    contactPh: 'Mobile number, e.g. 05xxxxxxxx', badPhone: 'Invalid mobile number',
    thanks: 'Thank you!', thanksSub: 'Your feedback reaches us directly and helps us improve',
    rateOtherTrip: 'Also rate your trip', rateOtherStation: 'Also rate the station',
    needStations: 'Select boarding and destination stations', needStation: 'Select the station', needRating: 'Rate at least one item',
    dup: 'We just received your feedback — thank you', error: 'Could not send, please try again', required: 'Required',
    o: {
      delay: 'Delays', clean: 'Cleanliness', staff: 'Staff conduct', crowd: 'Crowding', toilets: 'Restrooms',
      ticket: 'Tickets & booking', info: 'Information & signage', safety: 'Safety', driver: 'Driver', comfort: 'Comfort',
      seating: 'Seating & waiting area', wait: 'Waiting time', broken: 'Faults or damage', slow: 'Slow service',
      confusing: 'Unclear information', rude: 'Poor treatment', expensive: 'Price', other: 'Other',
      age_u18: 'Under 18', age_18: '18–24', age_25: '25–34', age_35: '35–44', age_45: '45–59', age_60: '60+',
      tt_student: 'Student', tt_employee: 'Employee', tt_family: 'Family', tt_pilgrim: 'Pilgrim', tt_tourist: 'Tourist', tt_resident: 'Resident', tt_business: 'Business traveler',
      pp_umrah: 'Umrah / Hajj', pp_family: 'Visiting family', pp_work: 'Work', pp_study: 'Study', pp_tourism: 'Tourism', pp_medical: 'Medical', pp_other: 'Other',
      fq_first: 'First time', fq_monthly: 'Monthly', fq_weekly: 'Weekly or more',
    },
    a: {
      punctuality: 'Punctuality', driver: 'Driver & driving', bus_clean: 'Bus cleanliness', comfort: 'Comfort (seats & A/C)',
      ticketing: 'Ticket purchase', call_center: 'Call center',
      st_overall: 'Overall station experience', st_clean: 'Station & restroom cleanliness', st_staff: 'Staff treatment',
      st_facilities: 'Facilities & seating', st_info: 'Signage & timetable screens',
    },
  },
  ur: {
    title: 'آپ کی رائے ہمارے لیے اہم ہے', sub: 'ایک منٹ سے کم — ہمیں بہتر خدمت میں مدد دیں',
    startTrip: 'اپنے سفر کی درجہ بندی کریں', startTripHint: 'ڈرائیور، بس، وقت اور ٹکٹ',
    startStation: 'اسٹیشن کی درجہ بندی کریں', startStationHint: 'صفائی، عملہ اور سہولیات',
    back: 'واپس', submit: 'رائے بھیجیں', sending: 'بھیجا جا رہا ہے…',
    tripSection: 'آپ کا سفر', stationSection: 'اسٹیشن',
    fromStation: 'سوار ہونے کا اسٹیشن', toStation: 'منزل کا اسٹیشن', tripNumber: 'ٹرپ نمبر (اختیاری)',
    pickStation: 'اسٹیشن منتخب کریں', searchStation: 'اسٹیشن تلاش کریں…', noResults: 'کوئی نتیجہ نہیں', close: 'بند کریں',
    rateTrip: 'آپ کا تجربہ کیسا رہا؟', rateStation: 'اسٹیشن پر آپ کا تجربہ کیسا رہا؟',
    skipHint: 'جو چیز استعمال نہیں کی اسے خالی چھوڑ دیں',
    faces: ['بہت برا', 'برا', 'ٹھیک ٹھاک', 'اچھا', 'بہترین'],
    nps: 'آپ اپنے خاندان اور دوستوں کو ہمارے ساتھ سفر کی کتنی سفارش کریں گے؟', npsLow: 'بالکل نہیں', npsHigh: 'ضرور',
    improveTitle: 'ہمیں سب سے زیادہ کیا بہتر کرنا چاہیے؟ (زیادہ سے زیادہ دو)',
    lowTitle: 'معذرت — کیا مسئلہ ہوا؟',
    commentLabel: 'آپ کی رائے (اختیاری)', commentPh: 'جو آپ ہمیں بتانا چاہیں لکھیں…',
    aboutYou: 'اپنا مختصر تعارف', aboutHint: 'اختیاری — ہمیں مسافروں کو سمجھنے میں مدد ملتی ہے، ہم آپ کا نام نہیں پوچھتے',
    age: 'عمر کا گروپ', traveler: 'میں ہوں', purpose: 'سفر کا مقصد', frequency: 'آپ ہمارے ساتھ کتنی بار سفر کرتے ہیں؟',
    contactTitle: 'ہم آپ سے رابطہ کریں', contactLowTitle: 'معذرت — ہمیں اصلاح کا موقع دیں',
    contactHint: 'اگر آپ چاہتے ہیں کہ ہم جواب دیں یا فالو اپ کریں تو اپنا موبائل نمبر لکھیں۔ اختیاری — صرف اسی مقصد کے لیے، کسی کے ساتھ شیئر نہیں کیا جاتا۔',
    contactPh: 'موبائل نمبر، مثال: 05xxxxxxxx', badPhone: 'موبائل نمبر درست نہیں',
    thanks: 'شکریہ!', thanksSub: 'آپ کی رائے ہم تک براہ راست پہنچتی ہے اور خدمات بہتر بنانے میں مدد دیتی ہے',
    rateOtherTrip: 'اپنے سفر کی بھی درجہ بندی کریں', rateOtherStation: 'اسٹیشن کی بھی درجہ بندی کریں',
    needStations: 'سوار ہونے اور منزل کا اسٹیشن منتخب کریں', needStation: 'اسٹیشن منتخب کریں', needRating: 'کم از کم ایک چیز کی درجہ بندی کریں',
    dup: 'آپ کی رائے ابھی موصول ہوئی ہے — شکریہ', error: 'بھیجا نہ جا سکا، دوبارہ کوشش کریں', required: 'ضروری',
    o: {
      delay: 'تاخیر', clean: 'صفائی', staff: 'عملے کا رویہ', crowd: 'رش', toilets: 'بیت الخلا',
      ticket: 'ٹکٹ اور بکنگ', info: 'معلومات اور رہنمائی', safety: 'حفاظت', driver: 'ڈرائیور', comfort: 'آرام',
      seating: 'بیٹھنے اور انتظار کی جگہ', wait: 'انتظار کا وقت', broken: 'خرابی یا نقصان', slow: 'سست سروس',
      confusing: 'غیر واضح معلومات', rude: 'برا سلوک', expensive: 'کرایہ', other: 'دیگر',
      age_u18: '18 سے کم', age_18: '18–24', age_25: '25–34', age_35: '35–44', age_45: '45–59', age_60: '60 اور اس سے زیادہ',
      tt_student: 'طالب علم', tt_employee: 'ملازم', tt_family: 'فیملی', tt_pilgrim: 'عمرہ / حج زائر', tt_tourist: 'سیاح', tt_resident: 'مقیم', tt_business: 'کاروباری',
      pp_umrah: 'عمرہ / حج', pp_family: 'رشتہ داروں سے ملاقات', pp_work: 'کام', pp_study: 'تعلیم', pp_tourism: 'سیر و تفریح', pp_medical: 'علاج', pp_other: 'دیگر',
      fq_first: 'پہلی بار', fq_monthly: 'ماہانہ', fq_weekly: 'ہفتہ وار یا زیادہ',
    },
    a: {
      punctuality: 'وقت کی پابندی', driver: 'ڈرائیور اور ڈرائیونگ', bus_clean: 'بس کی صفائی', comfort: 'آرام (نشستیں اور اے سی)',
      ticketing: 'ٹکٹ خریدنا', call_center: 'کال سینٹر',
      st_overall: 'اسٹیشن کا مجموعی تجربہ', st_clean: 'اسٹیشن اور بیت الخلا کی صفائی', st_staff: 'عملے کا سلوک',
      st_facilities: 'سہولیات اور نشستیں', st_info: 'رہنمائی اور ٹائم ٹیبل اسکرینیں',
    },
  },
}

// تسميات عربية للتقارير (أدمن)
export const AR_LABELS = { ...T.ar.o, ...T.ar.a }
export const AR_O = T.ar.o
export const AR_A = T.ar.a

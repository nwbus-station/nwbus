// Trip operational statuses
export const TRIP_STATUSES = [
  { value: 'Normal',                            ar: 'سارت بانتظام',                   en: 'Normal' },
  { value: 'Driver Absent',                     ar: 'تخلف السائق',                   en: 'Driver Absent' },
  { value: 'Accident between other vehicles',   ar: 'حادث بين المركبات الأخرى',      en: 'Accident between other vehicles' },
  { value: 'Health (Driver/Passengers)',         ar: 'الصحة (السائق/الركاب)',          en: 'Health (Driver/Passengers)' },
  { value: 'Passenger Misbehavior',             ar: 'سوء سلوك الركاب',               en: 'Passenger Misbehavior' },
  { value: 'Police Control',                    ar: 'سيطرة الشرطة',                  en: 'Police Control' },
  { value: 'Traffic Jam',                       ar: 'الازدحام المروري',               en: 'Traffic Jam' },
  { value: 'Weather',                           ar: 'طقس',                           en: 'Weather' },
  { value: 'Accident with NWB bus',             ar: 'حادث مع حافلة NWB',             en: 'Accident with NWB bus' },
  { value: 'Malfunction inside the station',    ar: 'عطل داخل المحطة',               en: 'Malfunction inside the station' },
  { value: 'Out-of-station malfunction',        ar: 'عطل خارج المحطة',               en: 'Out-of-station malfunction' },
]

// Bus types
export const BUS_TYPES = [
  { value: 'Standard', ar: 'عادي',              en: 'Standard' },
  { value: 'VIP',      ar: 'VIP',               en: 'VIP' },
  { value: 'WCH',      ar: 'ذوي الاحتياجات',    en: 'Wheelchair (WCH)' },
  { value: 'Qaid',     ar: 'قائد',              en: 'Qaid' },
]

// User roles
export const USER_ROLES = [
  { value: 'station_employee',  ar: 'موظف',              en: 'Employee' },
  { value: 'accountant',        ar: 'محاسب',              en: 'Accountant' },
  { value: 'station_admin',     ar: 'مشرف المحطة',        en: 'Station Supervisor' },
  { value: 'shift_supervisor',  ar: 'مشرف وردية',         en: 'Shift Supervisor' },
  { value: 'area_supervisor',   ar: 'مشرف منطقة',         en: 'Area Supervisor' },
  { value: 'general_admin',     ar: 'أدمن عام',           en: 'General Admin' },
  { value: 'stations_executive_director', ar: 'المدير التنفيذي للمحطات', en: 'Stations Executive Director' },
  { value: 'assistant_stations_executive_director', ar: 'مساعد المدير التنفيذي للمحطات', en: 'Assistant Stations Executive Director' },
]

// مساعد المدير التنفيذي: أدمن كامل + يشتغل كمشرف على محطاته المخصصة (يوافق على الإجازات أولاً ويقيّم موظفيه)
export const ASSISTANT_DIRECTOR_ROLE = 'assistant_stations_executive_director'

// تفاصيل حساب الأدمن مجمّعة بالصفحات — يختار منها كل مسمى ما يظهر له:
//  grant: تمنح قدرة إضافية للمسمى فقط لو فُعّلت (افتراضياً لا)
//  allow: تقيّد ما يملكه الأدمن أصلاً، تُقفل فقط لو أُلغيت (افتراضياً مسموحة)
export const TITLE_CAPABILITIES = [
  // التقارير
  { group: 'التقارير', key: 'reports_movements',  kind: 'allow', ar: 'تقرير الوصول والمغادرة', en: 'Arrivals & departures report' },
  { group: 'التقارير', key: 'reports_compliance', kind: 'allow', ar: 'تقرير الالتزام بالمواعيد', en: 'Punctuality report' },
  { group: 'التقارير', key: 'reports_transport',  kind: 'allow', ar: 'ملخص الترحيل', en: 'Transport summary' },
  { group: 'التقارير', key: 'reports_missed',     kind: 'allow', ar: 'تقرير المتخلفين', en: 'Missed passengers report' },
  { group: 'التقارير', key: 'reports_facilities', kind: 'allow', ar: 'تقرير الحالة التشغيلية', en: 'Facilities report' },
  { group: 'التقارير', key: 'reports_sales',      kind: 'allow', ar: 'ملخص المبيعات', en: 'Sales summary' },
  { group: 'التقارير', key: 'reports_lost',       kind: 'allow', ar: 'تقرير الموجودات', en: 'Lost & found report' },
  { group: 'التقارير', key: 'reports_activity_log', kind: 'allow', ar: 'سجل النشاط', en: 'Activity log' },
  // التقييم الوظيفي
  { group: 'التقييم الوظيفي', key: 'evaluation_dispatchers_only', kind: 'grant', ar: 'يقيّم المرحّلين فقط (من مسماهم الوظيفي مرحّل)', en: 'Evaluate dispatchers only' },
  { group: 'التقييم الوظيفي', key: 'evaluation_supervisors_tab',  kind: 'allow', ar: 'تبويب تقييم المشرفين', en: 'Supervisor evaluation tab' },
  { group: 'التقييم الوظيفي', key: 'evaluation_stations_tab',     kind: 'allow', ar: 'تبويب تقييم المحطات', en: 'Station evaluation tab' },
  { group: 'التقييم الوظيفي', key: 'evaluation_my_employees',     kind: 'grant', ar: 'يقيّم موظفيه (محطاته المخصصة أو مسؤوله المباشر) ويفتح على "موظفيني"', en: 'Evaluate his own employees' },
  // الترحيل
  { group: 'الترحيل', key: 'transport_upload_schedule', kind: 'allow', ar: 'رفع جدول الرحلات', en: 'Upload schedule' },
  { group: 'الترحيل', key: 'transport_manage_trips',    kind: 'allow', ar: 'رحلة جديدة والرحلات المضافة وتفعيل رحلات المحطة والرحلة الإضافية', en: 'Manage trips (new, added, activate, extra)' },
  // الإجازات
  { group: 'الإجازات', key: 'leaves_supervisor_stage', kind: 'grant', ar: 'يوافق على الإجازات كمشرف (لموظفي محطاته المخصصة) قبل الأدمن', en: 'Approve leaves as supervisor for his stations' },
  { group: 'الإجازات', key: 'leaves_final_approve',    kind: 'allow', adminOnly: true, ar: 'الاعتماد النهائي للإجازات (مرحلة الأدمن)', en: 'Final leave approval' },
  // الموظفون المحددون
  { group: 'الموظفون المحددون', key: 'assigned_employees', kind: 'grant', ar: 'موظفون محددون بالاسم أو الرقم الوظيفي: يقيّمهم ويوافق على إجازاتهم كمشرف (تحددهم من تعديل حسابه)', en: 'Specific employees he evaluates and approves leaves for' },
  // الصفحات والنطاق
  { group: 'الصفحات والنطاق', key: 'scope_assigned_stations', kind: 'grant', ar: 'يقتصر على المحطات المخصصة له (التقارير والترحيل)', en: 'Limit to his assigned stations' },
  { group: 'الصفحات والنطاق', key: 'stations_page',    kind: 'allow', adminOnly: true, ar: 'صفحة المحطات', en: 'Stations page' },
  { group: 'الصفحات والنطاق', key: 'settings_access',  kind: 'allow', adminOnly: true, ar: 'صفحة الإعدادات', en: 'Settings page' },
  { group: 'الصفحات والنطاق', key: 'lostfound_manage', kind: 'allow', adminOnly: true, ar: 'حذف وإهداء الموجودات', en: 'Delete / donate lost & found items' },
]

// أدوار لها صلاحيات الأدمن العام بالكامل — نفس الشيء بالضبط، فقط مسمى وظيفي مختلف
export const ADMIN_ROLE_VALUES = ['general_admin', 'stations_executive_director', 'assistant_stations_executive_director']

// Modules (sections of the system)
export const MODULES = [
  { value: 'transportation', ar: 'الترحيل',          en: 'Transportation' },
  { value: 'sales',          ar: 'المبيعات',         en: 'Sales' },
  { value: 'lost_found',     ar: 'الموجودات',        en: 'Lost & Found' },
  { value: 'reports',        ar: 'التقارير',         en: 'Reports' },
  { value: 'leaves',         ar: 'الإجازات',         en: 'Leaves' },
  { value: 'live_board',     ar: 'شاشة العرض',       en: 'Live Board' },
  { value: 'survey',         ar: 'تقييم الركاب',     en: 'Passenger Survey' },
  { value: 'evaluation',     ar: 'التقييم الوظيفي',  en: 'Staff Evaluation' },
  { value: 'users',          ar: 'الموظفون',         en: 'Staff' },
  { value: 'map',            ar: 'الخريطة',          en: 'Map' },
  { value: 'customer_ratings', ar: 'تقييم العملاء', en: 'Customer Ratings' },
  { value: 'magazine',       ar: 'إدارة Event',      en: 'Event Editor' },
]

// Departure accuracy thresholds (minutes)
export const ACCURACY_THRESHOLDS = {
  EARLY:       -2,   // more than 2 min early
  ON_TIME:      5,   // within 5 min
  NOT_ON_TIME: 15,   // within 15 min
  // > 15 = Delayed
}

// Report periods
export const REPORT_PERIODS = [
  { value: 'daily',       ar: 'يومي',        en: 'Daily' },
  { value: 'weekly',      ar: 'أسبوعي',      en: 'Weekly' },
  { value: 'monthly',     ar: 'شهري',        en: 'Monthly' },
  { value: 'quarterly',   ar: 'ربع سنوي',    en: 'Quarterly' },
  { value: 'semi_annual', ar: 'نصف سنوي',    en: 'Semi-Annual' },
  { value: 'annual',      ar: 'سنوي',        en: 'Annual' },
]

// Shifts
export const SHIFTS = ['A', 'B', 'C']

// Lost & Found item types
export const ITEM_TYPES = [
  { value: 'bag',       ar: 'شنطة',          en: 'Bag' },
  { value: 'phone',     ar: 'جوال',          en: 'Phone' },
  { value: 'wallet',    ar: 'محفظة',         en: 'Wallet' },
  { value: 'clothing',  ar: 'ملابس',         en: 'Clothing' },
  { value: 'document',  ar: 'وثائق',         en: 'Documents' },
  { value: 'other',     ar: 'أخرى',          en: 'Other' },
]

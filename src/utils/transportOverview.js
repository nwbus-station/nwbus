// من يرى «الجدول الشامل» في الترحيل: الأدمن يخصّص حسابات بعينها (تُحفظ في app_settings)، وهؤلاء يفتح لهم الجدول تلقائياً.
// قائمة فارغة = لم يُخصَّص أحد بعد، فيبقى السلوك السابق (صلاحية transport_schedule_view فقط).
export const OVERVIEW_USERS_KEY = 'transport_overview_users'

export function overviewUsers(raw) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [] } catch { return [] }
}

export function overviewState(settings, profileId, capOk) {
  const ids = overviewUsers(settings?.[OVERVIEW_USERS_KEY])
  const restricted = ids.length > 0
  const assigned = restricted && !!profileId && ids.includes(profileId)
  return { restricted, assigned, visible: !!capOk && (!restricted || assigned) }
}

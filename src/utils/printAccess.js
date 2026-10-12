// صلاحية طباعة اليومية — إعداد عام يحفظه الأدمن في app_settings (المفتاح sales_print_access) بصيغة JSON:
//   { all: bool, allUntil: 'YYYY-MM-DD'|null, accounts: { [userId]: { mode: 'allow'|'deny', until: 'YYYY-MM-DD'|null, name, job } } }
// القاعدة: استثناء الحساب (إن كان ساري المفعول) يغلب الوضع العام، والوضع العام الافتراضي مغلق.
// الموظف يطبع يومياته هو فقط (السجلات التي أدخلها)، والأدمن يطبع دائماً.
export const PRINT_ACCESS_KEY = 'sales_print_access'

export function parseAccess(raw) {
  try {
    const o = JSON.parse(raw || '{}')
    return { all: !!o.all, allUntil: o.allUntil || null, accounts: o.accounts && typeof o.accounts === 'object' ? o.accounts : {} }
  } catch { return { all: false, allUntil: null, accounts: {} } }
}

const live = (until, today) => !until || until >= today

// حالة حساب: allowed + مصدر القرار (account | global | default) + تاريخ الانتهاء إن وُجد
export function accountState(access, userId, today) {
  const e = access.accounts?.[userId]
  if (e && live(e.until, today)) return { allowed: e.mode === 'allow', source: 'account', until: e.until || null }
  if (access.all && live(access.allUntil, today)) return { allowed: true, source: 'global', until: access.allUntil || null }
  return { allowed: false, source: 'default', until: null }
}

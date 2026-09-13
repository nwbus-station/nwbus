// حساب رصيد الإجازة السنوية — مشترك بين صفحة الإجازات وصفحة الموظفين

export function yearsOfService(hireDateStr) {
  if (!hireDateStr) return 0
  return Math.floor((Date.now() - new Date(hireDateStr)) / (365.25 * 86400000))
}

export function annualEntitlement(hireDateStr) {
  return yearsOfService(hireDateStr) >= 5 ? 30 : 21
}

// الرصيد المتراكم تصاعدياً من تاريخ المباشرة (يزيد يومياً)
export function accruedBalance(hireDateStr, entitlement) {
  if (!hireDateStr) return 0
  const daysSince = (Date.now() - new Date(hireDateStr)) / 86400000
  if (daysSince < 0) return 0
  return (entitlement / 365) * daysSince
}

// الرصيد المتبقي الفعلي لموظف — يحترم التعديل اليدوي (لموظف كان بالشركة قبل النظام)
// annualLeaves: كل صفوف الإجازة السنوية المعتمدة لهذا الموظف [{ start_date, days_count }]
export function leaveRemaining(user, annualLeaves = []) {
  if (user.leave_balance_override != null) {
    const sinceDate = user.leave_balance_override_date ?? user.hire_date
    const usedSince = annualLeaves
      .filter(l => !sinceDate || new Date(l.start_date) >= new Date(sinceDate))
      .reduce((s, l) => s + (l.days_count ?? 0), 0)
    return Math.max(0, Number(user.leave_balance_override) - usedSince)
  }
  if (!user.hire_date) return null
  const entitlement = annualEntitlement(user.hire_date)
  const accrued = accruedBalance(user.hire_date, entitlement)
  const used = annualLeaves.reduce((s, l) => s + (l.days_count ?? 0), 0)
  return Math.max(0, accrued - used)
}

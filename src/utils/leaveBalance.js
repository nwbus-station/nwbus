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

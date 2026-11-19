// إحصائيات الالتزام لمجموعة حركات (وصول أو مغادرة) — مشتركة بين صفحة التقارير وملخص المحطات
export function complianceStats(list) {
  const measured = list.filter(m => !m.unentered && m.delay !== null)
  const c = k => measured.filter(m => m.acc?.key === k).length
  const onTime = c('ontime') + c('early')
  return {
    total: list.length,
    measured: measured.length,
    early: c('early'), ontime: c('ontime'), noton: c('noton'), delayed: c('delayed'),
    rate: measured.length ? Math.round(onTime / measured.length * 100) : null,
    avgDelay: measured.length ? Math.round(measured.reduce((s, m) => s + m.delay, 0) / measured.length) : null,
    maxDelay: measured.length ? Math.max(...measured.map(m => m.delay)) : null,
  }
}

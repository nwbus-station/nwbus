// مسار من ← إلى: اتجاه السهم يتبع اتجاه النص (أسماء إنجليزية تُقرأ يسار→يمين فالسهم →، والعربية العكس)
const isLatin = s => /[A-Za-z]/.test(s || '')

export default function RouteText({ from, to }) {
  const ltr = isLatin(from) || isLatin(to)
  return (
    <span dir={ltr ? 'ltr' : 'rtl'} style={{ unicodeBidi: 'isolate' }}>
      {from}
      <span style={{ margin: '0 5px', opacity: 0.7 }}>{ltr ? '→' : '←'}</span>
      {to}
    </span>
  )
}

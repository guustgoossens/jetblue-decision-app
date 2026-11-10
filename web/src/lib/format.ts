export const pct = (v: number) => `${Math.round(v * 100)}%`
export const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
export const num = (v: number, d = 0) =>
  v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
export const eur = (v: number) => `${v < 0 ? '-' : ''}€${num(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2)}`
export const signed = (v: number, d = 1) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(d)}`
export const shortId = (id: string, n = 8) => (id.length > n ? id.slice(0, n) : id)
export function prettyTs(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${date}, ${time} UTC`
}
export const usd = (v: number) => `${v < 0 ? '-' : ''}$${num(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2)}`

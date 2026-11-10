import { data, FEATURE_KEYS } from './data'
import type { Features } from './types'

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
const c = data.champion

export function predict(x: Features): number {
  let z = c.intercept
  FEATURE_KEYS.forEach((k, i) => { z += (c.coef[i] * (x[k] - c.mean[i])) / c.scale[i] })
  return sigmoid(z)
}

export function baseline(): number {
  return sigmoid(c.intercept)
}

export function contributions(x: Features) {
  const p = predict(x)
  const base = baseline()
  const rows = FEATURE_KEYS.map((key, i) => {
    const meta = data.meta.features.find((f) => f.key === key)
    return {
      key,
      label: meta?.label ?? key,
      name: meta?.name ?? key,
      unit: meta?.unit ?? '',
      value: x[key],
      logOdds: (c.coef[i] * (x[key] - c.mean[i])) / c.scale[i],
    }
  })
  const sum = rows.reduce((s, r) => s + r.logOdds, 0)
  return rows.map((r) => ({ ...r, pp: sum === 0 ? 0 : (r.logOdds / sum) * (p - base) * 100 }))
}

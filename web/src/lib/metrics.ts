import type { ScoreKey, ValidationRow } from './types'

export const SCORE_KEYS: ScoreKey[] = ['lr', 'rf', 'hgb', 'dummy']
export const MODEL_COLOR: Record<ScoreKey, string> = { lr: '#001e60', rf: '#2e8fe8', hgb: '#00857c', dummy: '#b7c3d3' }

export function confusion(rows: ValidationRow[], key: ScoreKey, t: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0
  for (const r of rows) {
    const contact = r[key] >= t
    if (contact && r.y === 1) tp++
    else if (contact) fp++
    else if (r.y === 1) fn++
    else tn++
  }
  const total = rows.length
  const contacted = tp + fp
  const recall = tp + fn ? tp / (tp + fn) : 0
  const specificity = tn + fp ? tn / (tn + fp) : 0
  return {
    tp, fp, tn, fn, contacted, total,
    contactRate: total ? contacted / total : 0,
    precision: contacted ? tp / contacted : 0,
    recall, specificity,
    accuracy: total ? (tp + tn) / total : 0,
    balancedAccuracy: (recall + specificity) / 2,
  }
}

export function roc(rows: ValidationRow[], key: ScoreKey): { fpr: number; tpr: number; t: number }[] {
  const pos = rows.filter((r) => r.y === 1).length
  const neg = rows.length - pos
  const sorted = [...rows].sort((a, b) => b[key] - a[key])
  const pts = [{ fpr: 0, tpr: 0, t: 1.01 }]
  let tp = 0, fp = 0
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].y === 1) tp++
    else fp++
    const next = sorted[i + 1]
    if (!next || next[key] !== sorted[i][key]) {
      pts.push({ fpr: neg ? fp / neg : 0, tpr: pos ? tp / pos : 0, t: sorted[i][key] })
    }
  }
  return pts
}

export function auc(points: { fpr: number; tpr: number }[]): number {
  let a = 0
  for (let i = 1; i < points.length; i++) {
    a += ((points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr)) / 2
  }
  return a
}

export function bestBalanced(rows: ValidationRow[], key: ScoreKey): { t: number; balancedAccuracy: number } {
  let best = { t: 0.5, balancedAccuracy: -1 }
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    const b = confusion(rows, key, t).balancedAccuracy
    if (b > best.balancedAccuracy) best = { t, balancedAccuracy: b }
  }
  return best
}

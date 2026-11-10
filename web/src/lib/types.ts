export type FeatureKey = 'x1' | 'x2' | 'x3'
export type ScoreKey = 'lr' | 'rf' | 'hgb' | 'dummy'
export type Split = 'train' | 'validation' | 'blind'
export type Features = Record<FeatureKey, number>

export interface FeatureMeta { key: FeatureKey; name: string; label: string; unit: string }
export interface ModelRow {
  key: ScoreKey; label: string; algorithm: string; runId: string; modelId: string
  accuracy: number; balancedAccuracy: number; auc: number; isChampion: boolean
}
export interface FeatureStat {
  min: number; max: number; median: number; mean: number; p25: number; p75: number
  hist: number[]; edges: number[]
}
export interface ValidationRow extends Features {
  id: string; segment: string; observedAt: string; y: number
  lr: number; rf: number; hgb: number; dummy: number
}
export interface QueueRow extends Features { id: string; segment: string; observedAt: string; risk: number }
export interface Observation {
  segment: string; entity_id: string; observed_at: string; available_at: string
  revision: number | string; source_batch: string; decimal_format: string | null
  x1: number | string | null; x2: number | string | null; x2_unit: string | null; x3: number | string | null
}
export interface Policy { purpose: string; allowed: boolean | string; revision: number | string; effective_at: string }
export interface Recovery { field: string; value: number | string | null; available_at: string }
export interface LineageItem {
  id: string; split: string; reason: string; detail: string; observedAt: string
  observations: Observation[]; policies: Policy[]; recovery: Recovery[]
  output: Features | null
}
export interface Lineage { rejected: LineageItem[]; repaired: LineageItem[] }
export interface SplitFunnel {
  expected: number; eligible: number; quarantined: number
  reasons: Record<string, number>; start: string; end: string
}
export interface Funnel {
  expected: number; eligible: number; quarantined: number
  bySplit: Record<Split, SplitFunnel>
  reasons: { key: string; label: string; explanation: string; count: number }[]
}
export interface Bundle {
  meta: {
    team: string; teamId: string; case: string; day: string; decision: string; target: string
    features: FeatureMeta[]; datasetId: string; runId: string; experimentId: string
    genieUrl: string; tables: Record<string, number>; schema: string; genieSpaceId: string
  }
  champion: { algorithm: string; intercept: number; coef: number[]; mean: number[]; scale: number[] }
  models: ModelRow[]
  featureStats: Record<FeatureKey, FeatureStat>
  positiveRate: { train: number; validation: number }
  validation: ValidationRow[]
  queue: QueueRow[]
  funnel: Funnel
  naive: Naive
  findings: { issue: string; test: string; resolution: string }[]
  genieFindings: string
  lineage: Lineage
  business: Business
}
export interface Naive {
  rawRows: number; keyVariants: number; nonNormalRows: number; lostOnRawJoin: number
  lateRows: number; lateRecords: number; lateMedianHours: number
  unitRows: Record<string, number>; commaRows: number; sentinelRows: number; nullX1Rows: number
  unparseableRows: number; replayRows: number; genieNaiveLate: number
  policyRows: number; marketingRows: number; recoveryRows: number; leakageAgreement: string
}
/** From the discovery rounds (customer answers), not from the data. */
export interface Business {
  latencyNowMin: number; latencyNeededMin: number; delaysPerWeek: number; targetReduction: number; decisionWindowMin: number
}

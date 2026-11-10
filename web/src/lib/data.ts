import bundle from '../data/bundle.json'
import type { Bundle, FeatureKey, ModelRow } from './types'

export const data = bundle as unknown as Bundle
export const FEATURE_KEYS: FeatureKey[] = ['x1', 'x2', 'x3']
export const champion: ModelRow = data.models.find((m) => m.isChampion) ?? data.models.find((m) => m.key === 'lr') ?? data.models[0]
export const dummy: ModelRow = data.models.find((m) => m.key === 'dummy') ?? data.models[data.models.length - 1]

import { create } from 'zustand'
import type { ScoreKey } from './types'

export const LOGGED_CUTOFF = 0.5
/** Editable, labelled assumptions. Not customer data. */
export interface Assumptions { interventionCost: number; disruptionCost: number; preventRate: number }
/** Act when risk * preventRate * disruptionCost > interventionCost. */
export const breakEven = (a: Assumptions) => {
  const d = a.preventRate * a.disruptionCost
  return d > 0 ? a.interventionCost / d : Infinity
}
export const REGIONS = ['north', 'south', 'east', 'west'] as const

export type Tenant = 'ops' | 'cio' | 'data'
export const TENANT_KEY = 'jb-tenant'
const readTenant = (): Tenant | null => {
  try { const v = sessionStorage.getItem(TENANT_KEY); return v === 'ops' || v === 'cio' || v === 'data' ? v : null } catch { return null }
}

interface State {
  tenant: Tenant | null
  setTenant: (t: Tenant | null) => void
  cutoff: number
  setCutoff: (v: number) => void
  capacity: number
  setCapacity: (v: number) => void
  regions: string[]
  toggleRegion: (r: string) => void
  model: ScoreKey
  setModel: (m: ScoreKey) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  assumptions: Assumptions
  setAssumption: (k: keyof Assumptions, v: number) => void
  server: 'checking' | 'online' | 'browser'
  setServer: (s: 'checking' | 'online' | 'browser') => void
}

export const useApp = create<State>()((set) => ({
  tenant: readTenant(),
  setTenant: (tenant) => {
    try { if (tenant) sessionStorage.setItem(TENANT_KEY, tenant); else sessionStorage.removeItem(TENANT_KEY) } catch { /* ignore */ }
    set({ tenant })
  },
  cutoff: 0.5,
  setCutoff: (cutoff) => set({ cutoff }),
  capacity: 25,
  setCapacity: (capacity) => set({ capacity }),
  regions: [...REGIONS],
  toggleRegion: (r) => set((s) => {
    const on = s.regions.includes(r)
    const next = on ? s.regions.filter((x) => x !== r) : [...s.regions, r]
    return { regions: next.length ? next : s.regions }
  }),
  model: 'lr',
  setModel: (model) => set({ model }),
  selectedId: null,
  setSelectedId: (selectedId) => set({ selectedId }),
  assumptions: { interventionCost: 500, disruptionCost: 5000, preventRate: 0.3 },
  setAssumption: (k, v) => set((s) => ({ assumptions: { ...s.assumptions, [k]: v } })),
  server: 'checking',
  setServer: (server) => set({ server }),
}))

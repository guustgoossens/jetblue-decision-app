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

export interface GenieReply { conversationId?: string; messageId?: string; text: string; sql?: string | null; columns: string[]; rows: unknown[][]; error?: string }
export interface GenieTurn { q: string; a?: GenieReply; failed?: string }

export type Tenant = 'ops' | 'cio' | 'data'
export const TENANT_KEY = 'jb-tenant'
const readTenant = (): Tenant | null => {
  try { const v = sessionStorage.getItem(TENANT_KEY); return v === 'ops' || v === 'cio' || v === 'data' ? v : null } catch { return null }
}

interface State {
  genieOpen: boolean
  setGenieOpen: (o: boolean) => void
  genieTurns: GenieTurn[]
  genieConv?: string
  genieBusy: boolean
  genieAsk: (question: string) => Promise<void>
  genieReset: () => void
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

export const useApp = create<State>()((set, get) => ({
  genieOpen: false,
  setGenieOpen: (genieOpen) => set({ genieOpen }),
  genieTurns: [],
  genieConv: undefined,
  genieBusy: false,
  genieReset: () => set({ genieTurns: [], genieConv: undefined }),
  genieAsk: async (question) => {
    const q = question.trim()
    if (!q || get().genieBusy) return
    set((s) => ({ genieBusy: true, genieTurns: [...s.genieTurns, { q }] }))
    const patch = (p: Partial<GenieTurn>) => set((s) => ({ genieTurns: s.genieTurns.map((x, i) => (i === s.genieTurns.length - 1 ? { ...x, ...p } : x)) }))
    try {
      const r = await fetch('/api/genie', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q, conversationId: get().genieConv }) })
      const j = (await r.json()) as GenieReply
      if (j.conversationId) set({ genieConv: j.conversationId })
      patch({ a: { ...j, columns: j.columns ?? [], rows: j.rows ?? [], text: j.text ?? '' } })
    } catch (e) {
      patch({ failed: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      set({ genieBusy: false })
    }
  },
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

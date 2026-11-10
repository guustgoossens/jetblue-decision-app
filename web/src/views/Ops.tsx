import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useReactTable, getCoreRowModel, getSortedRowModel, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { data } from '../lib/data'
import { predict, baseline, contributions } from '../lib/scoring'
import { useApp, REGIONS, type OpsFilters } from '../lib/store'
import { pct, pct1, num, signed, prettyTs } from '../lib/format'
import type { Features, FeatureKey } from '../lib/types'
import { Card, Pill, Slider, Note, Bar, Stat } from '../components/ui'
import '../styles/ops.css'

const NUM = new Set(['x1', 'x3'])
const COLS: ColumnDef<QRow>[] = [
  { id: 'due', header: 'Due' },
  { id: 'id', header: 'Flight-hour' },
  { id: 'segment', header: 'Region' },
  { id: 'p', header: 'Risk' },
  { id: 'x1', header: 'Queue' },
  { id: 'x2', header: 'Weather' },
  { id: 'x3', header: 'Buffer' },
  { id: 'action', header: 'Suggested action' },
  { id: 'owner', header: 'Owner' },
  { id: 'ack', header: '', enableSorting: false },
]

const KEYS: FeatureKey[] = ['x1', 'x2', 'x3']

interface QRow {
  id: string
  segment: string
  observedAt: string
  x1: number
  x2: number
  x3: number
  p: number
}

/** Rule-of-thumb heuristic from the duty desk. Not the model. */
function suggest(x: Features): { action: string; owner: string } {
  if (x.x2 >= 0.7) return { action: 'Weather plan, de-icing, gate swap', owner: 'Owner: station duty manager' }
  if (x.x3 <= 15) return { action: 'Protect turnaround, add ramp crew', owner: 'Owner: ramp supervisor' }
  if (x.x1 >= 45) return { action: 'Re-sequence departures', owner: 'Owner: ops control' }
  return { action: 'Duty manager review', owner: 'Owner: duty manager' }
}

const MIN = 60000
const tms = (ts: string) => new Date(ts).getTime()
const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'

const REASON: Record<string, string> = {
  policy_not_allowed: 'Not permitted for model use',
  x1_unparseable: 'Queue depth unreadable',
  no_observation_at_decision_time: 'No timely observation',
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const Ic = ({ children }: { children: ReactNode }) => (
  <svg className="ops-ic" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const IcSearch = () => <Ic><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></Ic>
const IcFilter = () => <Ic><path d="M3 5h14M6 10h8M8.5 15h3" /></Ic>
const IcDown = () => <Ic><path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4 16h12" /></Ic>
const IcFlag = () => <Ic><path d="M5 17V3.5M5 4h9l-2 3 2 3H5" /></Ic>
const IcEye = () => <Ic><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.2" /></Ic>
const IcCloud = () => <Ic><path d="M6 14.5h8a3 3 0 0 0 .4-6A4.5 4.5 0 0 0 5.8 7.6 3.4 3.4 0 0 0 6 14.5z" /></Ic>
const IcClock = () => <Ic><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2" /></Ic>
const IcPlay = () => <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 4l10 6-10 6z" /></svg>
const IcPause = () => <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" /></svg>

type Toggles = { flagged: boolean; manual: boolean; severe: boolean; short: boolean }
const RISKS = [0, 0.3, 0.5, 0.7, 0.9]

export default function Ops() {
  const f = useApp((s) => s.opsFilters)
  const setF = useApp((s) => s.setOpsFilters)
  const cutoff = f.minRisk
  const capacity = useApp((s) => s.capacity)
  const setCapacity = useApp((s) => s.setCapacity)
  const selectedId = useApp((s) => s.selectedId)
  const setSelectedId = useApp((s) => s.setSelectedId)
  const [open, setOpen] = useState(false)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const toggleAck = (id: string) => setAcked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pick = (id: string) => { setSelectedId(id); setOpen(true) }

  const q = f.query
  const region = f.region
  const maxBuf = f.maxBuffer ?? 0
  const tg: Toggles = { flagged: f.flaggedOnly, manual: f.manual, severe: f.severe, short: f.shortBuffer }
  const TK: Record<keyof Toggles, keyof OpsFilters> = { flagged: 'flaggedOnly', manual: 'manual', severe: 'severe', short: 'shortBuffer' }
  const [fOpen, setFOpen] = useState(false)
  const fRef = useRef<HTMLDivElement>(null)
  const setT = (k: keyof Toggles, v?: boolean) => setF({ [TK[k]]: v ?? !tg[k] } as Partial<OpsFilters>)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'p', desc: true }])
  useEffect(() => {
    if (!fOpen) return
    const dn = (e: MouseEvent) => { if (fRef.current && !fRef.current.contains(e.target as Node)) setFOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFOpen(false) }
    document.addEventListener('mousedown', dn)
    window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', dn); window.removeEventListener('keydown', k) }
  }, [fOpen])

  const rows: QRow[] = useMemo(
    () =>
      data.queue
        .map((r) => ({
          id: r.id, segment: r.segment, observedAt: r.observedAt,
          x1: r.x1, x2: r.x2, x3: r.x3,
          p: predict({ x1: r.x1, x2: r.x2, x3: r.x3 }),
        }))
        .sort((a, b) => b.p - a.p),
    [],
  )

  const winMin = data.business.decisionWindowMin
  const span = useMemo(() => {
    const ts = data.queue.map((r) => tms(r.observedAt))
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    return { t0, t1, live: Math.max(t0, t1 - winMin * MIN) }
  }, [winMin])
  const [now, setNow] = useState(span.live)
  const [playing, setPlaying] = useState(false)
  const nowRef = useRef(now)
  nowRef.current = now
  const atLive = now >= span.live
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (nowRef.current + MIN >= span.live) { setNow(span.live); setPlaying(false) } else setNow(nowRef.current + MIN)
    }, 250)
    return () => clearInterval(id)
  }, [playing, span.live])
  const togglePlay = () => {
    if (!playing && now >= span.live) setNow(span.t0)
    setPlaying((v) => !v)
  }
  const goLive = () => { setPlaying(false); setNow(span.live) }
  const seek = (t: number) => { setPlaying(false); setNow(Math.min(span.live, Math.max(span.t0, Math.round(t / MIN) * MIN))) }

  const issues = useMemo(
    () =>
      data.lineage.rejected
        .filter((x) => x.split === 'blind' && x.observedAt)
        .map((x) => ({ id: x.id, segment: x.id.split(':')[0], t: tms(x.observedAt as string), reason: REASON[x.reason] ?? x.reason }))
        .sort((a, b) => a.t - b.t),
    [],
  )

  const needle = q.trim().toLowerCase()
  const match = (id: string, seg: string) => !needle || id.toLowerCase().includes(needle) || seg.toLowerCase().includes(needle)
  const regionOk = (seg: string) => region === 'all' || seg === region

  const view = useMemo(() => {
    const inWin = rows.filter((r) => { const t = tms(r.observedAt); return t >= now && t <= now + winMin * MIN })
    const base = inWin.filter((r) => regionOk(r.segment) && match(r.id, r.segment)
      && (!tg.severe || r.x2 >= 0.7) && (!tg.short || r.x3 <= 15) && (!maxBuf || r.x3 <= maxBuf))
    const flagged = base.filter((r) => r.p >= cutoff)
    const actions = flagged.slice(0, capacity)
    const over = flagged.slice(capacity)
    const below = tg.flagged ? [] : base.filter((r) => r.p < cutoff)
    const ord = (a: QRow[]) => {
      const s0 = sorting[0]
      if (!s0 || (s0.id === 'p' && s0.desc)) return a
      const get = (r: QRow): number | string => s0.id === 'due' ? tms(r.observedAt) : s0.id === 'id' ? r.id : s0.id === 'segment' ? r.segment : s0.id === 'x1' ? r.x1 : s0.id === 'x2' ? r.x2 : s0.id === 'x3' ? r.x3 : s0.id === 'action' ? suggest(r).action : s0.id === 'owner' ? suggest(r).owner : r.p
      return [...a].sort((x, y) => { const u = get(x), v = get(y); const c = typeof u === 'string' ? u.localeCompare(v as string) : (u as number) - (v as number); return s0.desc ? -c : c })
    }
    const manual = tg.manual
      ? issues.filter((i) => i.t >= now && i.t <= now + winMin * MIN && regionOk(i.segment) && match(i.id, i.segment) && !tg.severe && !tg.short && !maxBuf)
      : []
    const manualAll = issues.filter((i) => i.t >= now && i.t <= now + winMin * MIN && regionOk(i.segment)).length
    return { due: base.length, flagged, actions: ord(actions), over: ord(over), below: ord(below), manual, manualAll }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, issues, region, needle, cutoff, capacity, now, winMin, f, maxBuf, sorting])

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0]
  const ackN = view.actions.filter((r) => acked.has(r.id)).length

  const exportCsv = () => {
    const lines = ['rank,flight_hour_id,region,observed_at,queue_depth,weather_severity,turnaround_buffer_min,risk,suggested_action_heuristic,owner,acknowledged']
    view.actions.forEach((r, i) => {
      const s = suggest(r)
      lines.push([i + 1, r.id, r.segment, r.observedAt, r.x1, r.x2, r.x3, r.p.toFixed(4), `"${s.action}"`, `"${s.owner.replace('Owner: ', '')}"`, acked.has(r.id) ? 'yes' : 'no'].join(','))
    })
    download('next-hour-action-list.csv', lines.join('\n') + '\n')
  }

  const table = useReactTable<QRow>({
    data: [], columns: COLS, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), enableSortingRemoval: false, sortDescFirst: false,
  })

  const chips: { k: string; label: string; off: () => void }[] = []
  if (region !== 'all') chips.push({ k: 'r', label: `Region: ${region}`, off: () => setF({ region: 'all' }) })
  if (cutoff > 0) chips.push({ k: 'c', label: `Risk ≥ ${pct(cutoff)}`, off: () => setF({ minRisk: 0 }) })
  if (maxBuf) chips.push({ k: 'b', label: `Buffer ≤ ${maxBuf} min`, off: () => setF({ maxBuffer: null }) })
  if (tg.severe) chips.push({ k: 's', label: 'Severe weather', off: () => setT('severe', false) })
  if (tg.short) chips.push({ k: 'sb', label: 'Short buffer', off: () => setT('short', false) })
  if (!tg.manual) chips.push({ k: 'm', label: 'Manual check hidden', off: () => setT('manual', true) })
  if (!tg.flagged) chips.push({ k: 'f', label: 'All scored', off: () => setT('flagged', true) })
  const nFilters = chips.length

  const riskOpts = RISKS.includes(cutoff) ? RISKS : [...RISKS, cutoff].sort((a, b) => a - b)

  const rowEl = (r: QRow, cls: string, i: number) => {
    const s = suggest(r)
    const done = acked.has(r.id)
    return (
      <tr key={r.id} className={'is-click' + cls + (r.id === selected?.id && open ? ' is-on' : '') + (done ? ' is-ack' : '')} onClick={() => pick(r.id)} data-i={i}>
        <td className="mono">in {Math.max(0, Math.round((tms(r.observedAt) - now) / MIN))} min</td>
        <td className="mono">{r.id}</td>
        <td className="ops-cap-n">{r.segment}</td>
        <td>
          <div className="q-prob">
            <span className="mono">{pct1(r.p)}</span>
            <Bar value={r.p} max={1} color={cls ? 'var(--faint)' : 'var(--coral)'} height={4} />
          </div>
        </td>
        <td className="q-num mono">{num(r.x1, 0)}</td>
        <td>{r.x2 >= 0.7 ? <Pill tone="coral">Severe {num(r.x2, 2)}</Pill> : <span className="mono">{num(r.x2, 2)}</span>}</td>
        <td className="q-num mono">{num(r.x3, 0)} min</td>
        <td>{cls ? <span className="ops-owner">Monitor only</span> : <Pill tone="navy">{s.action}</Pill>}</td>
        <td className="ops-owner">{s.owner.replace('Owner: ', '')}</td>
        <td>
          {!cls && (
            <button className={'btn ops-ack' + (done ? ' is-on' : '')} aria-pressed={done} onClick={(e) => { e.stopPropagation(); toggleAck(r.id) }}>
              {done ? 'Acknowledged' : 'Acknowledge'}
            </button>
          )}
        </td>
      </tr>
    )
  }
  const sepEl = (label: string, n: number, k: string) => (
    <tr className="ops-sep" key={k}><td colSpan={10}><span>{label}</span><b className="mono">{n}</b></td></tr>
  )
  const empty = !view.actions.length && !view.over.length && !view.below.length && !view.manual.length

  return (
    <div className="page ops-page">
      <div className="ops-bar">
        <div className="ops-bar__row">
          <h1 className="ops-title">Next {winMin} minutes</h1>
          <span className={'ops-live' + (atLive ? ' is-live' : '')}><i />{atLive ? 'Live' : 'Replay'}</span>
          <span className="mono ops-clock__t">{hhmm(now)}</span>
          <div className="ops-clock">
            <button className="ops-icb" onClick={togglePlay} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? <IcPause /> : <IcPlay />}</button>
            <button className="btn ops-golive" onClick={goLive} disabled={atLive}>Live</button>
          </div>
          <div className="ops-kpis">
            <Stat label={`Due in ${winMin} min`} value={num(view.due)} />
            <Stat label="Flagged" value={num(view.flagged.length)} sub={`≥ ${pct(cutoff)}`} />
            <Stat label="Action list" value={`${view.actions.length} / ${capacity}`} tone="coral" sub={`${ackN} ack`} />
            <Stat label="Manual check" value={num(view.manualAll)} />
          </div>
        </div>
        <Timeline rows={rows} issues={issues} span={span} now={now} winMs={winMin * MIN} onSeek={seek} />
        <div className="ops-find">
          <label className="ops-search">
            <IcSearch />
            <input value={q} onChange={(e) => setF({ query: e.target.value })} placeholder="Search flight-hour or region" aria-label="Search flight-hours" />
          </label>
          <div className="ops-pop" ref={fRef}>
            <button className={'ops-icb' + (fOpen || nFilters ? ' is-on' : '')} onClick={() => setFOpen((v) => !v)} aria-label="Filters" aria-expanded={fOpen}><IcFilter /></button>
            {fOpen && (
              <div className="ops-popcard" role="dialog" aria-label="Filters">
                <ul className="ops-tog">
                  {([
                    ['flagged', 'Flagged only', <IcFlag key="a" />],
                    ['manual', 'Manual check', <IcEye key="b" />],
                    ['severe', 'Severe weather', <IcCloud key="c" />],
                    ['short', 'Short buffer', <IcClock key="d" />],
                  ] as [keyof Toggles, string, ReactNode][]).map(([k, label, ic]) => (
                    <li key={k}>
                      <button onClick={() => setT(k)} aria-pressed={tg[k]}>
                        {ic}<span>{label}</span><i className={'ops-sw' + (tg[k] ? ' is-on' : '')} />
                      </button>
                    </li>
                  ))}
                </ul>
                <hr />
                <div className="ops-sel">
                  <label>Region
                    <select value={region} onChange={(e) => setF({ region: e.target.value as OpsFilters['region'] })}>
                      <option value="all">All</option>
                      {REGIONS.map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}
                    </select>
                  </label>
                  <label>Min risk
                    <select value={cutoff} onChange={(e) => setF({ minRisk: Number(e.target.value) })}>
                      {riskOpts.map((v) => <option key={v} value={v}>{v === 0 ? 'All' : pct(v)}</option>)}
                    </select>
                  </label>
                  <label>Max buffer
                    <select value={maxBuf} onChange={(e) => setF({ maxBuffer: Number(e.target.value) || null })}>
                      <option value={0}>All</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </label>
                  <label>Capacity / hour
                    <select value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                      {[...new Set([5, 10, 15, 20, 25, 30, 40, 60, capacity])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
          <button className="ops-icb" onClick={exportCsv} aria-label="Export action list as CSV" title="Export CSV"><IcDown /></button>
          <div className="ops-step" aria-label="Capacity per hour">
            <span>Capacity</span>
            <button className="ops-icb" onClick={() => setCapacity(Math.max(1, capacity - 1))} aria-label="Decrease capacity">−</button>
            <b className="mono">{capacity}</b>
            <button className="ops-icb" onClick={() => setCapacity(Math.min(200, capacity + 1))} aria-label="Increase capacity">+</button>
          </div>
          <div className="ops-chipsrow">
            {chips.map((c) => (
              <button key={c.k} className="ops-fchip" onClick={c.off} aria-label={`Remove filter ${c.label}`}>{c.label}<span aria-hidden="true">×</span></button>
            ))}
          </div>
        </div>
      </div>

      <div className="ops-main">
        <div className="q-scroll">
          <table className="tbl q-tbl ops-tbl">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const dir = h.column.getIsSorted()
                    return (
                      <th key={h.id} className={(NUM.has(h.id) ? 'q-num ' : '') + (h.column.getCanSort() ? 'ops-th' : '')} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}>
                        {h.column.getCanSort() ? (
                          <button className="ops-sortb" onClick={h.column.getToggleSortingHandler()}>
                            {h.column.columnDef.header as ReactNode}<span className="ops-arrow" aria-hidden="true">{dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : ''}</span>
                          </button>
                        ) : (h.column.columnDef.header as ReactNode)}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {view.actions.map((r, i) => rowEl(r, '', i))}
              {view.over.length > 0 && sepEl('Over capacity · monitor', view.over.length, 'sep-over')}
              {view.over.map((r, i) => rowEl(r, ' is-over', i))}
              {view.below.length > 0 && sepEl('Below cut-off', view.below.length, 'sep-below')}
              {view.below.map((r, i) => rowEl(r, ' is-over', i))}
              {view.manual.length > 0 && sepEl('Manual check · no model score', view.manual.length, 'sep-man')}
              {view.manual.map((i) => (
                <tr key={i.id} className="ops-man">
                  <td className="mono">in {Math.max(0, Math.round((i.t - now) / MIN))} min</td>
                  <td className="mono">{i.id}</td>
                  <td className="ops-cap-n">{i.segment}</td>
                  <td><Pill tone="neutral">Manual check</Pill></td>
                  <td colSpan={6} className="ops-owner">{i.reason}</td>
                </tr>
              ))}
              {empty && (
                <tr><td colSpan={10} className="q-empty">Nothing matches in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && selected && (
        <>
          <div className="ops-scrim" onClick={() => setOpen(false)} />
          <aside className="ops-drawer" aria-label="Flight-hour detail">
            <div className="ops-drawer__bar">
              <span className="ops-tag">Prediction</span>
              <button className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>
            <Detail key={selected.id} row={selected} cutoff={cutoff} />
          </aside>
        </>
      )}
    </div>
  )
}

function Detail({ row, cutoff }: { row: QRow; cutoff: number }) {
  const server = useApp((s) => s.server)
  const [x, setX] = useState<Features>({ x1: row.x1, x2: row.x2, x3: row.x3 })
  const orig = useMemo<Features>(() => ({ x1: row.x1, x2: row.x2, x3: row.x3 }), [row])
  const p0 = row.p
  const p = useMemo(() => predict(x), [x])
  const base = useMemo(() => baseline(), [])
  const contact = p >= cutoff
  const changed = KEYS.some((k) => x[k] !== orig[k])

  const contrib = useMemo(() => contributions(x), [x])
  const steps = useMemo(() => {
    let run = base * 100
    const out = contrib.map((c) => {
      const from = run
      run += c.pp
      return { c, from, to: run }
    })
    const all = [base * 100, ...out.map((o) => o.to), p * 100]
    const lo = Math.max(0, Math.min(...all) - 4)
    const hi = Math.min(100, Math.max(...all) + 4)
    return { out, lo, hi: hi > lo ? hi : lo + 1 }
  }, [contrib, base, p])
  const pos = (v: number) => ((v - steps.lo) / (steps.hi - steps.lo)) * 100

  // live server check
  const [live, setLive] = useState<number | null>(null)
  useEffect(() => {
    setLive(null)
    if (server !== 'online') return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [{ x1: x.x1, x2: x.x2, x3: x.x3 }] }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const v = j && Array.isArray(j.p) ? Number(j.p[0]) : NaN
          if (Number.isFinite(v)) setLive(v)
        })
        .catch(() => {})
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [server, x])

  const fs = data.featureStats
  const feats = data.meta.features

  return (
    <div className="q-detail">
      <Card eyebrow="Selected flight-hour" title={row.id}>
        <Sky sev={row.x2} />
        <dl className="q-facts">
          <div><dt>Region</dt><dd>{row.segment}</dd></div><div><dt>Observed</dt><dd className="mono">{prettyTs(row.observedAt)}</dd></div>
          <div><dt>Outcome</dt><dd>Unknown (blind flight-hour)</dd></div>
        </dl>
        <p className="ops-act"><b>{suggest(x).action}</b><span>{suggest(x).owner} · Heuristic</span></p>
        <div className="q-big">
          <span className="q-bigp mono">{pct1(p)}</span>
          <Pill tone={contact ? 'coral' : 'neutral'}>{contact ? 'Flag' : 'Monitor'}</Pill>
        </div>
        <div className="q-rail" aria-label="Decision rail">
          <div className="q-rail__track">
            <div className="q-rail__hold" style={{ width: `${cutoff * 100}%` }} />
            <div className="q-rail__contact" style={{ left: `${cutoff * 100}%` }} />
            <i className="q-mark q-mark--cut" style={{ left: `${cutoff * 100}%` }} />
            <i className="q-mark q-mark--base" style={{ left: `${base * 100}%` }} />
            <i className="q-mark q-mark--cust" style={{ left: `${p * 100}%` }} />
          </div>
          <div className="q-rail__lab mono">
            <span>0%</span>
            <span>Monitor</span>
            <span>Flag</span>
            <span>100%</span>
          </div>
          <ul className="q-legend">
            <li><i className="q-dot q-dot--cust" />This flight-hour {pct1(p)}</li>
            <li><i className="q-dot q-dot--cut" />Cut-off {pct(cutoff)}</li>
            <li><i className="q-dot q-dot--base" />Average {pct1(base)}</li>
          </ul>
        </div>
      </Card>

      <Card eyebrow="Explanation" title="What moves the risk">
        <div className="q-wf">
          <div className="q-wf__row q-wf__row--end">
            <span className="q-wf__name">Average flight-hour</span>
            <span className="q-wf__val mono" />
            <div className="q-wf__plot">
              <span className="q-wf__bar q-wf__bar--tot" style={{ left: 0, width: `${pos(base * 100)}%` }} />
            </div>
            <span className="q-wf__pp mono">{num(base * 100, 1)}%</span>
          </div>
          {steps.out.map(({ c, from, to }) => {
            const a = Math.min(from, to)
            const b = Math.max(from, to)
            return (
              <div className="q-wf__row" key={c.key}>
                <span className="q-wf__name">{c.name}</span>
                <span className="q-wf__val mono">{num(c.value, 1)}{c.unit ? ` ${c.unit}` : ''}</span>
                <div className="q-wf__plot">
                  <span
                    className={'q-wf__bar ' + (c.pp >= 0 ? 'q-wf__bar--up' : 'q-wf__bar--down')}
                    style={{ left: `${pos(a)}%`, width: `${Math.max(0.6, pos(b) - pos(a))}%` }}
                  />
                </div>
                <span className="q-wf__pp mono">{signed(c.pp, 1)} pp</span>
              </div>
            )
          })}
          <div className="q-wf__row q-wf__row--end">
            <span className="q-wf__name">This flight-hour</span>
            <span className="q-wf__val mono" />
            <div className="q-wf__plot">
              <span className="q-wf__bar q-wf__bar--tot" style={{ left: 0, width: `${pos(p * 100)}%` }} />
            </div>
            <span className="q-wf__pp mono">{num(p * 100, 1)}%</span>
          </div>
        </div>
        <Note>Log-odds attribution in risk points (pp).</Note>
      </Card>

      <Card
        eyebrow="Scenario"
        title="What-if"
        right={
          <button className="btn" disabled={!changed} onClick={() => setX(orig)}>
            Reset
          </button>
        }
      >
        <div className="q-sliders">
          {feats.map((f) => {
            const k = f.key as FeatureKey
            const st = fs[k]
            const span = st.max - st.min
            const step = span > 50 ? 1 : span > 5 ? 0.1 : 0.01
            return (
              <Slider
                key={k}
                label={`${f.name}${f.unit ? ` (${f.unit})` : ''}`}
                value={x[k]}
                min={st.min}
                max={st.max}
                step={step}
                onChange={(v: number) => setX((cur) => ({ ...cur, [k]: v }))}
                format={(v: number) => num(v, step < 1 ? (step < 0.1 ? 2 : 1) : 0)}
              />
            )
          })}
        </div>
        <div className="q-cmp">
          <div>
            <span className="eyebrow">Original</span>
            <b className="mono">{pct1(p0)}</b>
            <Pill tone={p0 >= cutoff ? 'coral' : 'neutral'}>{p0 >= cutoff ? 'Flag' : 'Monitor'}</Pill>
          </div>
          <div>
            <span className="eyebrow">What-if</span>
            <b className="mono">{pct1(p)}</b>
            <Pill tone={contact ? 'coral' : 'neutral'}>{contact ? 'Flag' : 'Monitor'}</Pill>
          </div>
        </div>
        <p className="q-live">
          {server === 'online' && live != null ? (
            <>
              model.joblib returned <span className="mono">{live.toFixed(4)}</span>
              {Math.abs(live - p) < 1e-6 && <span className="q-tick" aria-label="matches browser"> ✓</span>}
            </>
          ) : (
            "Scoring in the browser with the champion's exact coefficients"
          )}
        </p>
        <Note>Predicted risk, not a causal effect.</Note>
      </Card>
    </div>
  )
}

/** Scrubber + activity strip share one container: same left/right edges, x-domain [t0, t1]. */
function Timeline({ rows, issues, span, now, winMs, onSeek }: {
  rows: QRow[]
  issues: { id: string; t: number }[]
  span: { t0: number; t1: number; live: number }
  now: number
  winMs: number
  onSeek: (t: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const range = Math.max(1, span.t1 - span.t0)
  const f = (t: number) => Math.min(100, Math.max(0, ((t - span.t0) / range) * 100))
  const at = (e: { clientX: number }) => {
    const b = ref.current!.getBoundingClientRect()
    onSeek(span.t0 + Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * range)
  }
  const drag = useRef(false)
  return (
    <div
      className="ops-scrub" ref={ref} role="slider" tabIndex={0} aria-label="Current time"
      aria-valuemin={0} aria-valuemax={Math.round((span.live - span.t0) / MIN)} aria-valuenow={Math.round((now - span.t0) / MIN)} aria-valuetext={hhmm(now)}
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e) }}
      onPointerMove={(e) => { if (drag.current) at(e) }}
      onPointerUp={() => { drag.current = false }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(now - 5 * MIN) }
        if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(now + 5 * MIN) }
      }}
    >
      <div className="ops-scrub__track">
        <i className="ops-scrub__fill" style={{ width: `${f(now)}%` }} />
        <i className="ops-scrub__thumb" style={{ left: `${f(now)}%` }} />
      </div>
      <div className="ops-tl" aria-hidden="true">
        <i className="ops-tl__win" style={{ left: `${f(now)}%`, width: `${Math.max(0.3, f(now + winMs) - f(now))}%` }} />
        <i className="ops-tl__beyond" style={{ left: `${f(span.live)}%`, right: 0 }} />
        <i className="ops-tl__now" style={{ left: `${f(now)}%` }} />
        {issues.map((i) => <i key={i.id} className="ops-tl__iss" style={{ left: `${f(i.t)}%` }} />)}
        {rows.map((r) => (
          <i key={r.id} className={'ops-tl__dot' + (r.p >= 0.5 ? ' is-hi' : '')} style={{ left: `${f(tms(r.observedAt))}%`, top: `${4 + (1 - r.p) * 28}px`, opacity: 0.35 + 0.65 * r.p }} />
        ))}
      </div>
    </div>
  )
}


const SKY_MODES = [
  { key: 'clear', min: 0, label: 'Clear', note: 'normal ops' },
  { key: 'breezy', min: 0.3, label: 'Breezy', note: 'watch turnarounds' },
  { key: 'rough', min: 0.5, label: 'Rough weather', note: 'expect slower ramp work' },
  { key: 'storm', min: 0.7, label: 'Storm', note: 'weather plan, de-icing or gate swap' },
] as const

function Cloud({ x, y, s, cls }: { x: number; y: number; s: number; cls: string }) {
  return (
    <g className={'sky-c ' + cls} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="18" cy="14" rx="13" ry="8" />
      <ellipse cx="32" cy="9" rx="14" ry="11" />
      <ellipse cx="46" cy="14" rx="11" ry="7.5" />
      <rect x="6" y="13" width="52" height="9" rx="4.5" />
    </g>
  )
}

/** Side-view airliner, nose to the right, ~70 x 32 units around the origin. */
function Plane() {
  return (
    <g className="sky-craft">
      <path className="sky-trail" d="M-90 1 H0" />
      <path className="sky-wing-far" d="M30 -3 L23 -10 L28 -10 L38 -3Z" />
      <path className="sky-tail" d="M3 -4 L-3 -19 L7 -19 L17 -4Z" />
      <path className="sky-body" d="M5 -5 H55 Q67 -5 70 0 Q67 5 55 5 H5 Q0 5 0 0 Q0 -5 5 -5Z" />
      <path className="sky-stab" d="M1 1 L-6 6 L5 6 L13 2Z" />
      {Array.from({ length: 8 }, (_, i) => <circle key={i} className="sky-win" cx={20 + i * 4.4} cy="-1.2" r="0.95" />)}
      <path className="sky-cockpit" d="M61 -2.6 H65 Q68 -1.4 67 -0.2 H61Z" />
      <path className="sky-wing" d="M27 2 L16 14 L24 14 L42 3Z" />
      <ellipse className="sky-engine" cx="29" cy="7.2" rx="5.2" ry="2.3" />
    </g>
  )
}

function Sky({ sev }: { sev: number }) {
  const mode = [...SKY_MODES].reverse().find((m) => sev >= m.min) ?? SKY_MODES[0]
  const k = mode.key
  const wet = k === 'rough' || k === 'storm'
  const drops = k === 'storm' ? 26 : 12
  return (
    <div className="sky-wrap">
      <div className={'sky sky--' + k} role="img" aria-label={`Weather severity ${num(sev, 2)}: ${mode.label}`}>
        <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {k === 'clear' && <g className="sky-sun"><circle className="sky-sun__glow" cx="334" cy="30" r="26" /><circle cx="334" cy="30" r="12" /></g>}
          {k === 'breezy' && <circle className="sky-sun sky-sun--hazy" cx="340" cy="26" r="11" />}
          <Cloud x={0} y={10} s={k === 'clear' ? 0.9 : 1.3} cls="sky-c1" />
          <Cloud x={0} y={72} s={k === 'clear' ? 0.7 : 1} cls="sky-c2" />
          {k !== 'clear' && <Cloud x={0} y={36} s={1.6} cls="sky-c3" />}
          {k === 'storm' && <Cloud x={0} y={-6} s={2.2} cls="sky-c4" />}
          {(k === 'breezy' || k === 'rough') && (
            <g className="sky-wind">
              {[22, 48, 90, 104].map((y, i) => <path key={i} d={`M0 ${y} h${26 + (i % 2) * 18}`} style={{ animationDelay: `${i * 0.45}s` }} />)}
            </g>
          )}
          <g className="sky-plane"><g className="sky-bob"><Plane /></g></g>
          {wet && (
            <g className="sky-rain">
              {Array.from({ length: drops }, (_, i) => (
                <line key={i} x1={8 + i * (400 / drops)} y1={-16 - (i % 5) * 18} x2={2 + i * (400 / drops)} y2={-4 - (i % 5) * 18}
                  style={{ animationDelay: `${((i * 37) % 10) * 0.06}s` }} />
              ))}
            </g>
          )}
          {k === 'storm' && (
            <>
              <path className="sky-bolt" d="M262 14 L250 46 L262 46 L246 84" />
              <rect className="sky-flash" width="400" height="120" />
            </>
          )}
        </svg>
      </div>
      <div className="sky-lab">
        <b>{mode.label}</b> · weather severity {num(sev, 2)} · {mode.note}
      </div>
    </div>
  )
}

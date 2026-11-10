import { useEffect, useMemo, useRef, useState } from 'react'
import { data } from '../lib/data'
import { predict, baseline, contributions } from '../lib/scoring'
import { useApp, REGIONS } from '../lib/store'
import { pct, pct1, num, signed, prettyTs } from '../lib/format'
import type { Features, FeatureKey } from '../lib/types'
import { Card, Pill, Slider, Note, Bar, Stat } from '../components/ui'
import '../styles/ops.css'

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

export default function Ops() {
  const cutoff = useApp((s) => s.cutoff)
  const setCutoff = useApp((s) => s.setCutoff)
  const capacity = useApp((s) => s.capacity)
  const setCapacity = useApp((s) => s.setCapacity)
  const regions = useApp((s) => s.regions)
  const toggleRegion = useApp((s) => s.toggleRegion)
  const selectedId = useApp((s) => s.selectedId)
  const setSelectedId = useApp((s) => s.setSelectedId)
  const [open, setOpen] = useState(false)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const toggleAck = (id: string) => setAcked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pick = (id: string) => { setSelectedId(id); setOpen(true) }

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

  const span = useMemo(() => {
    const ts = data.queue.map((r) => tms(r.observedAt))
    return { t0: Math.min(...ts), t1: Math.max(...ts) }
  }, [])
  const winMin = data.business.decisionWindowMin
  const [now, setNow] = useState(span.t0)
  const [playing, setPlaying] = useState(false)
  const nowRef = useRef(now)
  nowRef.current = now
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (nowRef.current + MIN >= span.t1) { setNow(span.t1); setPlaying(false) } else setNow(nowRef.current + MIN)
    }, 250)
    return () => clearInterval(id)
  }, [playing, span.t1])
  const togglePlay = () => {
    if (!playing && now >= span.t1) setNow(span.t0)
    setPlaying((v) => !v)
  }

  const issues = useMemo(
    () =>
      data.lineage.rejected
        .filter((x) => x.split === 'blind' && x.observedAt)
        .map((x) => ({ id: x.id, segment: x.id.split(':')[0], t: tms(x.observedAt as string), reason: REASON[x.reason] ?? x.reason }))
        .sort((a, b) => a.t - b.t),
    [],
  )
  const winIssues = issues.filter((i) => i.t >= now && i.t <= now + winMin * MIN && regions.includes(i.segment))

  const view = useMemo(() => {
    const inWin = rows.filter((r) => { const t = tms(r.observedAt); return t >= now && t <= now + winMin * MIN })
    const inRegion = inWin.filter((r) => regions.includes(r.segment))
    const flagged = inRegion.filter((r) => r.p >= cutoff)
    const actions = flagged.slice(0, capacity)
    const byRegion = REGIONS.map((g) => {
      const all = inWin.filter((r) => r.segment === g)
      const fl = all.filter((r) => r.p >= cutoff)
      const act = actions.filter((r) => r.segment === g)
      return { g, total: all.length, flagged: fl.length, acted: act.length, avg: all.length ? all.reduce((s, r) => s + r.p, 0) / all.length : 0 }
    })
    return { inRegion, flagged, actions, byRegion }
  }, [rows, regions, cutoff, capacity, now, winMin])

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0]
  const overflow = Math.max(0, view.flagged.length - view.actions.length)
  const ackN = view.actions.filter((r) => acked.has(r.id)).length

  const exportCsv = () => {
    const lines = ['rank,flight_hour_id,region,observed_at,queue_depth,weather_severity,turnaround_buffer_min,risk,suggested_action_heuristic,owner,acknowledged']
    view.actions.forEach((r, i) => {
      const s = suggest(r)
      lines.push([i + 1, r.id, r.segment, r.observedAt, r.x1, r.x2, r.x3, r.p.toFixed(4), `"${s.action}"`, `"${s.owner.replace('Owner: ', '')}"`, acked.has(r.id) ? 'yes' : 'no'].join(','))
    })
    download('next-hour-action-list.csv', lines.join('\n') + '\n')
  }

  return (
    <div className="page ops-page">
      <div className="ops-bar">
        <div className="ops-bar__row">
          <h1 className="ops-title">Next {winMin} minutes</h1>
          <div className="ops-clock">
            <button className="btn btn--primary" onClick={togglePlay}>{playing ? 'Pause' : 'Auto-play'}</button>
            <input
              type="range" className="ops-range" aria-label="Current time"
              min={0} max={Math.round((span.t1 - span.t0) / MIN)} step={1}
              value={Math.round((now - span.t0) / MIN)}
              onChange={(e) => { setPlaying(false); setNow(span.t0 + Number(e.target.value) * MIN) }}
            />
            <span className="mono ops-clock__t">Now {hhmm(now)}</span>
          </div>
          <div className="q-chips ops-chips">
            {REGIONS.map((g) => (
              <button key={g} className={'q-chip' + (regions.includes(g) ? ' is-on' : '')} aria-pressed={regions.includes(g)} onClick={() => toggleRegion(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="ops-bar__row ops-bar__row--ctl">
          <div className="ops-ctl"><Slider label="Capacity / hour" value={capacity} min={5} max={80} step={1} onChange={setCapacity} format={(v) => num(v)} /></div>
          <div className="ops-ctl"><Slider label="Risk cut-off" value={cutoff} min={0.05} max={0.95} step={0.01} onChange={setCutoff} format={pct} /></div>
          <div className="ops-tlwrap">
            <Timeline rows={rows} issues={issues} span={span} now={now} winMs={winMin * MIN} onSet={(t) => { setPlaying(false); setNow(t) }} />
          </div>
        </div>
      </div>

      <div className="ops-kpis">
        <Stat label="Due in window" value={num(view.inRegion.length)} sub={`next ${winMin} min`} />
        <Stat label="Flagged" value={num(view.flagged.length)} sub={`cut-off ${pct(cutoff)}`} />
        <Stat label="Action list" value={num(view.actions.length)} sub={`capacity ${num(capacity)}`} tone="coral" />
        <Stat label="Over capacity" value={num(overflow)} sub={overflow ? 'monitor only' : 'none'} />
        <Stat label="Acknowledged" value={`${ackN} / ${view.actions.length}`} sub="this shift" />
        <Stat label="No model score" value={num(winIssues.length)} sub="manual check" />
      </div>

      <div className="ops-main">
        <Card
          eyebrow="Prediction"
          title="Action list"
          right={
            <div className="q-actions">
              <span className="ops-tag">Heuristic actions</span>
              <button className="btn btn--primary" onClick={exportCsv}>Export CSV</button>
            </div>
          }
          flush
        >
          <div className="q-scroll ops-scroll">
            <table className="tbl q-tbl ops-tbl">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Flight-hour</th>
                  <th>Region</th>
                  <th>Risk</th>
                  <th className="q-num">Queue</th>
                  <th>Weather</th>
                  <th className="q-num">Buffer</th>
                  <th>Suggested action</th>
                  <th>Owner</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {view.actions.map((r) => {
                  const s = suggest(r)
                  const done = acked.has(r.id)
                  return (
                    <tr key={r.id} className={'is-click' + (r.id === selected?.id && open ? ' is-on' : '') + (done ? ' is-ack' : '')} onClick={() => pick(r.id)}>
                      <td className="mono">in {Math.max(0, Math.round((tms(r.observedAt) - now) / MIN))} min</td>
                      <td className="mono">{r.id}</td>
                      <td className="ops-cap-n">{r.segment}</td>
                      <td>
                        <div className="q-prob">
                          <span className="mono">{pct1(r.p)}</span>
                          <Bar value={r.p} max={1} color="var(--coral)" height={4} />
                        </div>
                      </td>
                      <td className="q-num mono">{num(r.x1, 0)}</td>
                      <td>{r.x2 >= 0.7 ? <Pill tone="coral">Severe {num(r.x2, 2)}</Pill> : <span className="mono">{num(r.x2, 2)}</span>}</td>
                      <td className="q-num mono">{num(r.x3, 0)} min</td>
                      <td><Pill tone="navy">{s.action}</Pill></td>
                      <td className="ops-owner">{s.owner.replace('Owner: ', '')}</td>
                      <td>
                        <button
                          className={'btn ops-ack' + (done ? ' is-on' : '')}
                          aria-pressed={done}
                          onClick={(e) => { e.stopPropagation(); toggleAck(r.id) }}
                        >
                          {done ? 'Acknowledged' : 'Acknowledge'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!view.actions.length && (
                  <tr><td colSpan={10} className="q-empty">No flight-hour above the cut-off due in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="ops-side">
          <Card eyebrow="No model score" title="Issues · manual check">
            <p className="q-count mono">{winIssues.length} in window, {issues.length} in blind set</p>
            {winIssues.length ? (
              <ul className="ops-issues">
                {winIssues.map((i) => (
                  <li key={i.id}>
                    <span className="mono">{i.id}</span>
                    <span>{i.reason}</span>
                    <span className="mono ops-owner">in {Math.max(0, Math.round((i.t - now) / MIN))} min</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="q-empty">No unscored flight-hour in this window.</p>
            )}
          </Card>

          <Card eyebrow="Region load" title="Flagged by region">
            <div className="ops-load">
              {view.byRegion.map((b) => (
                <div key={b.g} className={'ops-load__row' + (regions.includes(b.g) ? '' : ' is-off')}>
                  <span className="ops-load__name">{b.g}</span>
                  <Bar value={b.flagged} max={Math.max(1, ...view.byRegion.map((x) => x.flagged))} color="var(--navy)" height={8} />
                  <span className="mono ops-load__n">{b.flagged} flagged</span>
                  <span className="mono ops-load__n">{regions.includes(b.g) ? b.acted : 0} listed</span>
                  <span className="mono ops-load__n">avg {pct(b.avg)}</span>
                </div>
              ))}
            </div>
          </Card>
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
        <dl className="q-facts">
          <div><dt>Flight-hour</dt><dd className="mono">{row.id}</dd></div>
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

function Timeline({ rows, issues, span, now, winMs, onSet }: {
  rows: QRow[]
  issues: { id: string; t: number }[]
  span: { t0: number; t1: number }
  now: number
  winMs: number
  onSet: (t: number) => void
}) {
  const W = 600, H = 56
  const range = Math.max(1, span.t1 - span.t0)
  const x = (t: number) => ((t - span.t0) / range) * W
  const set = (e: React.MouseEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width))
    onSet(Math.round((span.t0 + f * range) / MIN) * MIN)
  }
  const ws = Math.max(0, x(now)), we = Math.min(W, x(now + winMs))
  return (
    <svg className="ops-tl" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Timeline of blind flight-hours by risk" onClick={set} onMouseMove={(e) => { if (e.buttons === 1) set(e) }}>
      <rect x={ws} y={0} width={Math.max(2, we - ws)} height={H} fill="var(--coral-soft)" />
      <line x1={ws} x2={ws} y1={0} y2={H} stroke="var(--coral-deep)" strokeWidth={2} />
      {issues.map((i) => <rect key={i.id} x={x(i.t) - 1} y={H - 8} width={2} height={6} fill="var(--muted)" />)}
      {rows.map((r) => (
        <circle key={r.id} cx={x(tms(r.observedAt))} cy={4 + (1 - r.p) * (H - 20)} r={2} fill={r.p >= 0.5 ? 'var(--coral)' : 'var(--navy)'} opacity={0.35 + 0.65 * r.p} />
      ))}
    </svg>
  )
}

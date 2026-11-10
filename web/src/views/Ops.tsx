import { useEffect, useMemo, useRef, useState } from 'react'
import { data } from '../lib/data'
import { predict, baseline, contributions } from '../lib/scoring'
import { useApp, REGIONS } from '../lib/store'
import { pct, pct1, num, signed, prettyTs } from '../lib/format'
import type { Features, FeatureKey } from '../lib/types'
import { Page, Card, Pill, Slider, Note, Bar, Stat } from '../components/ui'
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
    const actionIds = new Set(actions.map((r) => r.id))
    const byRegion = REGIONS.map((g) => {
      const all = inWin.filter((r) => r.segment === g)
      const fl = all.filter((r) => r.p >= cutoff)
      const act = actions.filter((r) => r.segment === g)
      return { g, total: all.length, flagged: fl.length, acted: act.length, avg: all.length ? all.reduce((s, r) => s + r.p, 0) / all.length : 0 }
    })
    return { inRegion, flagged, actions, actionIds, byRegion }
  }, [rows, regions, cutoff, capacity, now, winMin])

  useEffect(() => {
    if (selectedId == null && rows.length) setSelectedId(rows[0].id)
  }, [selectedId, rows, setSelectedId])

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0]
  const overflow = Math.max(0, view.flagged.length - view.actions.length)

  const random = () => {
    if (!view.actions.length) return
    setSelectedId(view.actions[Math.floor(Math.random() * view.actions.length)].id)
  }

  const exportCsv = () => {
    const lines = ['rank,flight_hour_id,region,observed_at,queue_depth,weather_severity,turnaround_buffer_min,risk,suggested_action_heuristic,owner']
    view.actions.forEach((r, i) => {
      const s = suggest(r)
      lines.push([i + 1, r.id, r.segment, r.observedAt, r.x1, r.x2, r.x3, r.p.toFixed(4), `"${s.action}"`, `"${s.owner.replace('Owner: ', '')}"`].join(','))
    })
    download('next-hour-action-list.csv', lines.join('\n') + '\n')
  }

  return (
    <Page
      eyebrow="Action"
      title="Where should we act in the next hour?"
      lede="These are upcoming flight-hours the models never saw. Their outcome is unknown, so every risk below is a prediction, not a result. The desk acts on the top of the list, up to its capacity."
    >
      <div className="q-layout">
        <div className="q-left">
          <Card eyebrow="Decision clock" title={`Now ${hhmm(now)}, looking ${winMin} min ahead`}>
            <div className="ops-clock">
              <button className="btn btn--primary" onClick={togglePlay}>{playing ? 'Pause' : 'Auto-play'}</button>
              <input
                type="range" className="ops-range" aria-label="Current time"
                min={0} max={Math.round((span.t1 - span.t0) / MIN)} step={1}
                value={Math.round((now - span.t0) / MIN)}
                onChange={(e) => { setPlaying(false); setNow(span.t0 + Number(e.target.value) * MIN) }}
              />
              <span className="mono ops-clock__t">{hhmm(now)}</span>
            </div>
            <Timeline rows={rows} issues={issues} span={span} now={now} winMs={winMin * MIN} onSet={(t) => { setPlaying(false); setNow(t) }} />
            <p className="q-count mono">Blind window {hhmm(span.t0)} to {hhmm(span.t1)}. The desk sees only what is due in the next {winMin} minutes. Risks are predictions.</p>
          </Card>

          <Card eyebrow="Desk settings" title="Capacity, regions and cut-off">
            <div className="ops-set">
              <Slider label="Interventions the desk can handle this hour" value={capacity} min={5} max={80} step={1} onChange={setCapacity} format={(v) => num(v)} />
              <Slider label="Risk cut-off" value={cutoff} min={0.05} max={0.95} step={0.01} onChange={setCutoff} format={pct} />
            </div>
            <div className="q-chips">
              {REGIONS.map((g) => (
                <button key={g} className={'q-chip' + (regions.includes(g) ? ' is-on' : '')} aria-pressed={regions.includes(g)} onClick={() => toggleRegion(g)}>
                  {g}
                </button>
              ))}
            </div>
            <div className="ops-stats">
              <Stat label="Flagged in window" value={num(view.flagged.length)} sub={`of ${num(view.inRegion.length)} due in the next ${winMin} min`} />
              <Stat label="Action list" value={num(view.actions.length)} sub={`capacity ${num(capacity)}`} tone="coral" />
              <Stat label="Flagged, over capacity" value={num(overflow)} sub={overflow ? 'monitor, cannot act' : 'none'} />
            </div>
          </Card>

          <Card eyebrow="All 342 upcoming flight-hours" title="Sorted by risk, current window lit">
            <div className="ops-grid" role="list" aria-label="Flight-hours sorted by risk">
              {rows.map((r) => {
                const inView = regions.includes(r.segment)
                const tt = tms(r.observedAt)
                const inWin = tt >= now && tt <= now + winMin * MIN
                const cls = !inView || !inWin ? 'is-off' : view.actionIds.has(r.id) ? 'is-act' : r.p >= cutoff ? 'is-over' : 'is-mon'
                return (
                  <span key={r.id} style={{ display: 'contents' }}>
                    <button role="listitem" className={'ops-dot ' + cls + (r.id === selected?.id ? ' is-sel' : '')} title={`${r.id}: ${pct1(r.p)}`} aria-label={`${r.id} risk ${pct1(r.p)}`} onClick={() => setSelectedId(r.id)} />
                  </span>
                )
              })}
            </div>
            <ul className="q-legend">
              <li><i className="q-dot" style={{ background: 'var(--coral)' }} />Action list</li>
              <li><i className="q-dot" style={{ background: 'var(--navy)' }} />Flagged, over capacity</li>
              <li><i className="q-dot" style={{ background: 'var(--line)' }} />Monitor</li>
              <li><i className="q-dot" style={{ background: 'var(--line-soft)', border: '1px solid var(--line)' }} />Outside window or region</li>
            </ul>
          </Card>

          <Card eyebrow="Load by region" title="Where the flagged flight-hours sit">
            <div className="ops-load">
              {view.byRegion.map((b) => (
                <div key={b.g} className={'ops-load__row' + (regions.includes(b.g) ? '' : ' is-off')}>
                  <span className="ops-load__name">{b.g}</span>
                  <Bar value={b.flagged} max={Math.max(1, ...view.byRegion.map((x) => x.flagged))} color="var(--navy)" height={8} />
                  <span className="mono ops-load__n">{b.flagged} flagged</span>
                  <span className="mono ops-load__n">{regions.includes(b.g) ? b.acted : 0} on list</span>
                  <span className="mono ops-load__n">avg {pct(b.avg)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card eyebrow="Issues" title="No model score: act on manual check">
            <p className="q-count mono">{winIssues.length} in this window, {issues.length} across the blind set. These flight-hours had no trustworthy signal, so the model cannot rank them.</p>
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

          <Card
            eyebrow="Intervention queue"
            title={`Next ${winMin} min: top ${view.actions.length} by risk`}
            right={
              <div className="q-actions">
                <button className="btn" onClick={random}>Random</button>
                <button className="btn btn--primary" onClick={exportCsv}>Export action list</button>
              </div>
            }
          >
            <p className="q-count mono">
              {view.actions.length} on the list, {overflow} flagged beyond capacity. Suggested actions are a desk rule of thumb, not model output.
            </p>
            <div className="q-scroll ops-scroll">
              <table className="tbl q-tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Flight-hour</th>
                    <th>Due</th>
                    <th className="q-num">Queue</th>
                    <th className="q-num">Weather</th>
                    <th className="q-num">Buffer</th>
                    <th>Risk</th>
                    <th>Suggested action (heuristic)</th>
                  </tr>
                </thead>
                <tbody>
                  {view.actions.map((r, i) => {
                    const s = suggest(r)
                    return (
                      <tr key={r.id} className={'is-click' + (r.id === selected?.id ? ' is-on' : '')} onClick={() => setSelectedId(r.id)}>
                        <td className="mono">{i + 1}</td>
                        <td className="mono">{r.id}</td>
                        <td className="mono">in {Math.max(0, Math.round((tms(r.observedAt) - now) / MIN))} min<div className="ops-owner">{hhmm(tms(r.observedAt))}</div></td>
                        <td className="q-num mono">{num(r.x1, 0)}</td>
                        <td className="q-num mono">{num(r.x2, 2)}</td>
                        <td className="q-num mono">{num(r.x3, 0)}</td>
                        <td>
                          <div className="q-prob">
                            <span className="mono">{pct1(r.p)}</span>
                            <Bar value={r.p} max={1} color="var(--coral)" height={4} />
                          </div>
                        </td>
                        <td><b>{s.action}</b><div className="ops-owner">{s.owner}</div></td>
                      </tr>
                    )
                  })}
                  {!view.actions.length && (
                    <tr><td colSpan={8} className="q-empty">No flight-hour above the cut-off due in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="q-right">{selected && <Detail key={selected.id} row={selected} cutoff={cutoff} />}</div>
      </div>
    </Page>
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
        <p className="ops-act"><b>{suggest(x).action}</b><span>{suggest(x).owner}. Rule-of-thumb heuristic, not the model.</span></p>
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
        <Note>
          Exact attribution on log-odds, rescaled to risk points (pp). Lower turnaround buffer raises risk.
        </Note>
      </Card>

      <Card
        eyebrow="What-if"
        title="Change the conditions, re-score instantly"
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
        <Note>What-if scores are predicted risk, not causal effects: they do not show that acting prevents a disruption.</Note>
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

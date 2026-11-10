import { useMemo, useRef } from 'react'
import { data } from '../lib/data'
import { useApp, LOGGED_CUTOFF, breakEven } from '../lib/store'
import { confusion, bestBalanced } from '../lib/metrics'
import { pct, pct1, num, usd, signed } from '../lib/format'
import type { ScoreKey } from '../lib/types'
import { Page, Card, Stat, Seg, Slider, Pill, Note } from '../components/ui'
import '../styles/impact.css'

type M = 'lr' | 'rf' | 'hgb'
const COLS = 19
const CELL = 22
const C_TP = '#365d49'
const C_FN = '#e0a526'
const C_FP = '#fc967e'
const C_TN = '#c9d0cc'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function delta(cur: number, base: number, d: number, isPct = false) {
  const diff = cur - base
  if (Math.abs(diff) < 1e-9) return 'same as 0.50'
  return `${isPct ? signed(diff * 100, 1) + ' pp' : signed(diff, d)} vs 0.50`
}

export default function Impact() {
  const cutoff = useApp((s) => s.cutoff)
  const setCutoff = useApp((s) => s.setCutoff)
  const model = useApp((s) => s.model) as M
  const setModel = useApp((s) => s.setModel) as (m: M) => void
  const a = useApp((s) => s.assumptions)
  const setAssumption = useApp((s) => s.setAssumption)

  const rows = data.validation
  const key = model as ScoreKey
  const biz = data.business
  const label = (k: string) => data.models.find((m) => m.key === k)?.label ?? k

  const sorted = useMemo(() => rows.slice().sort((p, q) => q[key] - p[key]), [rows, key])
  const cm = useMemo(() => confusion(rows, key, cutoff), [rows, key, cutoff])
  const base = useMemo(() => confusion(rows, key, LOGGED_CUTOFF), [rows, key])
  const best = useMemo(() => bestBalanced(rows, key), [rows, key])
  const be = clamp(breakEven(a), 0, 1)
  const k = sorted.filter((r) => r[key] >= cutoff).length
  const per100 = 100 / cm.total

  // Expected value per 100 flight-hours at cut-off t, on validation labels, under the assumptions.
  const valueAt = (t: number) => {
    let flagged = 0
    let hit = 0
    for (const r of sorted) {
      if (r[key] < t) break
      flagged++
      if (r.y === 1) hit++
    }
    return ((hit * a.preventRate * a.disruptionCost - flagged * a.interventionCost) * 100) / sorted.length
  }
  const curve = useMemo(() => {
    const pts: { t: number; v: number }[] = []
    for (let i = 0; i <= 100; i++) pts.push({ t: i / 100, v: valueAt(i / 100) })
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, key, a])
  const value = valueAt(cutoff)
  const bestVal = curve.reduce((m, p) => (p.v > m.v ? p : m), curve[0])

  // Weekly scenario anchored on discovery
  const implied = cm.recall * a.preventRate
  const avoided = biz.delaysPerWeek * implied
  const targetN = biz.delaysPerWeek * biz.targetReduction
  // Interventions scale with disruptions: on validation the cut-off raises cm.contacted flags per (tp+fn) real disruptions.
  const flagsPerDisruption = cm.tp + cm.fn > 0 ? cm.contacted / (cm.tp + cm.fn) : 0
  const flagsPerWeek = biz.delaysPerWeek * flagsPerDisruption
  const meets = avoided >= targetN

  const weeklyAt = (p: number) =>
    biz.delaysPerWeek * cm.recall * p * a.disruptionCost - flagsPerWeek * a.interventionCost
  const weeklyNet = weeklyAt(a.preventRate)

  const presets: { label: string; t: number }[] = [
    { label: '0.50 logged', t: LOGGED_CUTOFF },
    { label: `Best balanced ${best.t.toFixed(2)}`, t: best.t },
    { label: `Break-even ${be.toFixed(2)}`, t: be },
    { label: `Best value ${bestVal.t.toFixed(2)}`, t: bestVal.t },
  ]

  const svgRef = useRef<SVGSVGElement>(null)
  const rowsN = Math.ceil(sorted.length / COLS)
  const W = COLS * CELL
  const H = rowsN * CELL
  const dragTo = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = clamp(((e.clientX - r.left) / r.width) * COLS, 0, COLS - 0.001)
    const cy = clamp(((e.clientY - r.top) / r.height) * rowsN, 0, rowsN - 0.001)
    const i = Math.min(sorted.length - 1, Math.floor(cy) * COLS + Math.floor(cx))
    setCutoff(clamp(Math.floor(sorted[i][key] * 100) / 100, 0, 1))
  }
  const rr = Math.floor(k / COLS)
  const cc = k % COLS
  const line =
    cc === 0 ? `M0,${rr * CELL} H${W}` : `M0,${(rr + 1) * CELL} H${cc * CELL} V${rr * CELL} H${W}`
  const dotColor = (y: number, flagged: boolean) =>
    y === 1 ? (flagged ? C_TP : C_FN) : flagged ? C_FP : C_TN

  return (
    <Page title="Impact model">
      <section className="im-hero">
        <div className="im-hero__head">
          <span className="eyebrow">Weekly scenario</span>
          <Pill tone="amber">Scenario</Pill>
        </div>
        <div className="im-hero__nums">
          <div><b className="mono">{num(avoided, 1)}</b><span>fewer delays / week (target {num(targetN, 0)})</span></div>
          <div><b className="mono">{usd(weeklyNet)}</b><span>net value a week</span></div>
          <div><b className="mono">{usd(weeklyNet * 52)}</b><span>a year (x 52)</span></div>
        </div>
        <div className="im-sens" aria-label="Sensitivity to prevent share">
          <span className="eyebrow">Value if prevent share is</span>
          {[0.1, 0.2, 0.3, 0.5].map((p) => {
            const v = weeklyAt(p)
            return (
              <button key={p} type="button" className={'im-sens__c' + (Math.abs(a.preventRate - p) < 0.005 ? ' is-on' : '')} onClick={() => setAssumption('preventRate', p)}>
                <small>{pct(p)}</small>
                <b className="mono">{usd(v)}</b>
              </button>
            )
          })}
        </div>
        <p className="im-hero__note">Net = delays x recall x prevent share x cost per disruption, minus flags x cost per intervention. Click a share to set it.</p>
      </section>

      <div className="im-top">
        <Card
          eyebrow="Validation"
          title="Sorted by risk, highest first"
          right={
            <Seg<M>
              options={[
                { value: 'lr', label: 'LR' },
                { value: 'rf', label: 'RF' },
                { value: 'hgb', label: 'GB' },
              ]}
              value={model}
              onChange={setModel}
            />
          }
        >
          <svg
            ref={svgRef}
            className="im-grid"
            viewBox={`0 0 ${W} ${H}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              dragTo(e)
            }}
            onPointerMove={(e) => {
              if (e.buttons) dragTo(e)
            }}
            role="img"
            aria-label="Dot grid of validation flight-hours with the cut-off line"
          >
            {sorted.map((r, i) => (
              <circle
                key={r.id}
                cx={(i % COLS) * CELL + CELL / 2}
                cy={Math.floor(i / COLS) * CELL + CELL / 2}
                r={CELL * 0.33}
                fill={dotColor(r.y, i < k)}
              />
            ))}
            <path d={line} fill="none" stroke="#17343d" strokeWidth={2.5} strokeLinejoin="round" />
          </svg>
          <ul className="im-legend">
            <li><i style={{ background: C_TP }} />Disruption, flagged in time <b className="mono">{cm.tp}</b></li>
            <li><i style={{ background: C_FN }} />Disruption, missed <b className="mono">{cm.fn}</b></li>
            <li><i style={{ background: C_FP }} />No disruption, flagged (false alarm) <b className="mono">{cm.fp}</b></li>
            <li><i style={{ background: C_TN }} />No disruption, correctly left alone <b className="mono">{cm.tn}</b></li>
          </ul>
        </Card>

        <div className="im-side">
          <Card eyebrow="Cut-off" title={pct(cutoff)}>
            <Slider
              label="Cut-off"
              value={cutoff}
              min={0}
              max={1}
              step={0.01}
              onChange={(v: number) => setCutoff(v)}
              format={(v: number) => v.toFixed(2)}
            />
            <div className="im-chips">
              {presets.map((p) => (
                <button
                  key={p.label}
                  className={'im-chip' + (Math.abs(cutoff - p.t) < 1e-9 ? ' is-on' : '')}
                  onClick={() => setCutoff(p.t)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="im-model mono">Model: {label(model)}</p>
          </Card>
          <div className="im-stats">
            <Stat label="Flagged" value={String(cm.contacted)} sub={delta(cm.contacted, base.contacted, 0)} />
            <Stat label="Precision" value={pct1(cm.precision)} sub={delta(cm.precision, base.precision, 1, true)} />
            <Stat label="Disruptions caught" value={`${cm.tp} of ${cm.tp + cm.fn}`} sub={delta(cm.tp, base.tp, 0)} tone="green" />
            <Stat label="False alarms" value={String(cm.fp)} sub={delta(cm.fp, base.fp, 0)} tone="coral" />
          </div>
        </div>
      </div>

      <Card eyebrow="Validation" title="Per 100 flight-hours">
        <div className="im-plain">
          <div className="is-good"><b>{num(cm.tp * per100, 1)}</b><span>flagged and a disruption followed</span></div>
          <div className="is-amber"><b>{num(cm.fn * per100, 1)}</b><span>missed: a disruption came with no flag</span></div>
          <div className="is-warn"><b>{num(cm.fp * per100, 1)}</b><span>false alarms: flagged, no disruption</span></div>
          <div><b>{num(cm.tn * per100, 1)}</b><span>correctly left alone</span></div>
        </div>
        <p className="im-per mono">
          Recall {pct1(cm.recall)} · false alarm rate {pct1(1 - cm.specificity)} · balanced accuracy {cm.balancedAccuracy.toFixed(3)} ({delta(cm.balancedAccuracy, base.balancedAccuracy, 3)})
        </p>
      </Card>

      <div className="im-bottom">
        <Card eyebrow="Scenario" title="Assumptions" right={<Pill tone="amber">Assumption · editable</Pill>}>
          <Slider
            label="Cost per intervention"
            value={a.interventionCost}
            min={0}
            max={2000}
            step={25}
            onChange={(v: number) => setAssumption('interventionCost', v)}
            format={(v: number) => usd(v)}
          />
          <Slider
            label="Cost per disruption"
            value={a.disruptionCost}
            min={500}
            max={20000}
            step={100}
            onChange={(v: number) => setAssumption('disruptionCost', v)}
            format={(v: number) => usd(v)}
          />
          <Slider
            label="Share of disruptions an early intervention prevents"
            value={a.preventRate}
            min={0}
            max={1}
            step={0.01}
            onChange={(v: number) => setAssumption('preventRate', v)}
            format={(v: number) => pct(v)}
          />
          <div className="im-value">
            <span className="eyebrow">Value per 100 flight-hours at {pct(cutoff)}</span>
            <b className="mono">{usd(value)}</b>
          </div>
          <ValueCurve curve={curve} cutoff={cutoff} be={be} best={bestVal} cur={value} />
          <Note>
            Break-even cut-off = {Number.isFinite(breakEven(a)) ? breakEven(a).toFixed(2) : 'n/a'}. Prevent share is an assumption; the model predicts risk only.
          </Note>
        </Card>

        <Card eyebrow="From discovery" title="Weekly target check" right={<Pill tone="amber">Scenario</Pill>}>
          <div className="im-stats">
            <Stat label="Delays per week today" value={String(biz.delaysPerWeek)} sub="from discovery" />
            <Stat label="Target reduction" value={pct(biz.targetReduction)} sub={`${num(targetN, 0)} fewer a week, from discovery`} />
            <Stat label="Recall at this cut-off" value={pct1(cm.recall)} sub="validation" />
            <Stat label="Implied reduction" value={pct1(implied)} sub="recall x prevent share" tone={meets ? 'green' : 'coral'} />
          </div>
          <div className={'im-scn ' + (meets ? 'im-scn--ok' : 'im-scn--no')}>
            <span><b className="mono">{num(avoided, 1)}</b> fewer delays a week, against a target of {num(targetN, 0)}.</span>
            <span>
              {meets
                ? 'Target reachable at this cut-off (scenario).'
                : `Target not reached; needs recall x prevent share of at least ${pct(biz.targetReduction)}.`}
            </span>
          </div>
          <Note>
            Scenario: 14 delays / week and the 50% target are from discovery. Only the pilot against a control hub measures it.
          </Note>
        </Card>
      </div>
    </Page>
  )
}

function ValueCurve(props: {
  curve: { t: number; v: number }[]
  cutoff: number
  be: number
  best: { t: number; v: number }
  cur: number
}) {
  const { curve, cutoff, be, best, cur } = props
  const W = 420
  const H = 180
  const L = 48
  const R = 10
  const T = 10
  const B = 24
  const vs = curve.map((p) => p.v)
  const lo = Math.min(0, ...vs)
  const hi = Math.max(0, ...vs)
  const span = hi - lo || 1
  const x = (t: number) => L + t * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B)
  const d = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  return (
    <svg className="im-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scenario value against cut-off">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      <text x={L - 6} y={y(0) + 3} textAnchor="end" className="im-ax">0</text>
      <text x={L - 6} y={y(hi) + 3} textAnchor="end" className="im-ax">{usd(hi)}</text>
      {lo < 0 && <text x={L - 6} y={y(lo) + 3} textAnchor="end" className="im-ax">{usd(lo)}</text>}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="im-ax">{pct(t)}</text>
      ))}
      <path d={d} fill="none" stroke="var(--navy)" strokeWidth={2} />
      <line x1={x(be)} x2={x(be)} y1={T} y2={H - B} stroke="var(--green)" strokeDasharray="4 3" />
      <text x={x(be) + 4} y={T + 9} className="im-ax" fill="var(--green)">break-even</text>
      <circle cx={x(best.t)} cy={y(best.v)} r={3.5} fill="none" stroke="var(--navy)" />
      <line x1={x(cutoff)} x2={x(cutoff)} y1={T} y2={H - B} stroke="var(--coral-deep)" strokeWidth={1.5} />
      <circle cx={x(cutoff)} cy={y(cur)} r={4.5} fill="var(--coral)" stroke="#fff" strokeWidth={1.5} />
    </svg>
  )
}

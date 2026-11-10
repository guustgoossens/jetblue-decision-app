import { useMemo, useState } from 'react'
import { data, champion } from '../lib/data'
import { SCORE_KEYS, MODEL_COLOR, confusion, roc } from '../lib/metrics'
import { useApp, LOGGED_CUTOFF } from '../lib/store'
import { gates } from '../lib/narrative'
import { num, pct1, shortId } from '../lib/format'
import { Page, Card, Pill, Slider, Note } from '../components/ui'
import '../styles/models.css'

const rows = data.validation
const W = 420
const H = 380
const P = 40
const sx = (v: number) => P + v * (W - 2 * P)
const sy = (v: number) => H - P - v * (H - 2 * P)

function Table() {
  return (
    <Card eyebrow="MLflow" title="Four runs, scored on validation only">
      <table className="tbl">
        <thead>
          <tr><th>Model</th><th>Run</th><th>Accuracy</th><th>Balanced accuracy</th><th>AUC</th><th></th></tr>
        </thead>
        <tbody>
          {data.models.map((m) => (
            <tr key={m.key} className={m.key === 'dummy' ? 'md-row--dummy' : m.isChampion ? 'is-on' : ''}>
              <td>{m.label} <span style={{ color: 'var(--faint)', fontSize: 12 }}>{m.algorithm}</span></td>
              <td className="mono">{shortId(m.runId, 8)}</td>
              <td className="mono">{num(m.accuracy, 3)}</td>
              <td className="mono">{num(m.balancedAccuracy, 3)}</td>
              <td className="mono">{num(m.auc, 3)}</td>
              <td>{m.isChampion && <Pill tone="green">Champion</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>All figures are on the 342 validation flight-hours. Blind outcomes are not known and are not shown.</Note>
    </Card>
  )
}

function Roc() {
  const curves = useMemo(() => SCORE_KEYS.map((k) => ({ k, pts: roc(rows, k) })), [])
  const [x, setX] = useState<number | null>(null)
  const readout = x === null ? null : curves.map(({ k, pts }) => {
    let best = 0
    for (const p of pts) if (p.fpr <= x && p.tpr > best) best = p.tpr
    return { k, tpr: best }
  })
  const labelOf = (k: string) => data.models.find((m) => m.key === k)?.label ?? k
  return (
    <Card eyebrow="ROC" title="Catching disruptions versus false alarms">
      <svg
        className="md-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="ROC curves for all models"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const v = ((e.clientX - r.left) / r.width) * W
          setX(Math.min(1, Math.max(0, (v - P) / (W - 2 * P))))
        }}
        onMouseLeave={() => setX(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(g)} y2={sy(g)} stroke="var(--line-soft)" />
            <line y1={sy(0)} y2={sy(1)} x1={sx(g)} x2={sx(g)} stroke="var(--line-soft)" />
            <text x={P - 6} y={sy(g) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">{g}</text>
            <text x={sx(g)} y={H - P + 14} fontSize="9" textAnchor="middle" fill="var(--muted)">{g}</text>
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--faint)" strokeDasharray="4 4" />
        {curves.map(({ k, pts }) => (
          <path
            key={k}
            d={pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.fpr).toFixed(1)} ${sy(p.tpr).toFixed(1)}`).join('')}
            fill="none"
            stroke={MODEL_COLOR[k]}
            strokeWidth={k === champion.key ? 2.6 : 1.6}
            opacity={k === 'dummy' ? 0.7 : 1}
          />
        ))}
        {x !== null && <line x1={sx(x)} x2={sx(x)} y1={sy(0)} y2={sy(1)} stroke="var(--navy)" strokeWidth="1" />}
        <text x={W / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">False alarm rate (flagged, no disruption)</text>
        <text x={12} y={H / 2} fontSize="10" textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 12 ${H / 2})`}>True positive rate (disruptions caught)</text>
      </svg>
      <div className="md-legend">
        {SCORE_KEYS.map((k) => (
          <span key={k}><i style={{ background: MODEL_COLOR[k] }} />{labelOf(k)}</span>
        ))}
      </div>
      <div className="md-read mono">
        {readout
          ? `FPR ${num(x ?? 0, 2)}: ` + readout.map((r) => `${labelOf(r.k)} ${num(r.tpr, 2)}`).join(' · ')
          : 'Hover the chart to read each curve.'}
      </div>
    </Card>
  )
}

function Confusion() {
  const cutoff = useApp((s) => s.cutoff)
  const setCutoff = useApp((s) => s.setCutoff)
  const c = useMemo(() => confusion(rows, champion.key as 'lr', cutoff), [cutoff])
  return (
    <Card eyebrow="Confusion matrix" title={`${champion.label} at a cut-off of ${num(cutoff, 2)}`}>
      <Slider
        label="Cut-off"
        value={cutoff}
        min={0}
        max={1}
        step={0.01}
        onChange={setCutoff}
        format={(v: number) => num(v, 2)}
        hint={`Shared with the Impact view. Logged at ${num(LOGGED_CUTOFF, 2)}.`}
      />
      <div className="md-cm">
        <div />
        <div className="md-cm__h">Disruption</div>
        <div className="md-cm__h">No disruption</div>
        <div className="md-cm__h">Flag</div>
        <div className="md-cm__c md-cm__c--good"><b>{c.tp}</b><small>flagged, disruption</small></div>
        <div className="md-cm__c md-cm__c--bad"><b>{c.fp}</b><small>false alarms</small></div>
        <div className="md-cm__h">Monitor</div>
        <div className="md-cm__c md-cm__c--bad"><b>{c.fn}</b><small>missed</small></div>
        <div className="md-cm__c md-cm__c--good"><b>{c.tn}</b><small>left alone</small></div>
      </div>
      <div className="md-legend mono">
        <span>Precision {pct1(c.precision)}</span>
        <span>Recall {pct1(c.recall)}</span>
        <span>Specificity {pct1(c.specificity)}</span>
        <span>Balanced accuracy {num(c.balancedAccuracy, 3)}</span>
      </div>
    </Card>
  )
}

function Calibration() {
  const key = champion.key as 'lr'
  const bins = useMemo(() => {
    const acc = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }))
    for (const r of rows) {
      const s = r[key] as number
      const b = Math.min(9, Math.max(0, Math.floor(s * 10)))
      acc[b].n++
      acc[b].p += s
      acc[b].y += r.y
    }
    return acc.filter((b) => b.n > 0).map((b) => ({ n: b.n, pred: b.p / b.n, obs: b.y / b.n }))
  }, [key])
  return (
    <Card eyebrow="Calibration" title="Does predicted risk match what happened?">
      <svg className="md-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reliability chart, 10 bins on validation">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(g)} y2={sy(g)} stroke="var(--line-soft)" />
            <text x={P - 6} y={sy(g) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">{g}</text>
            <text x={sx(g)} y={H - P + 14} fontSize="9" textAnchor="middle" fill="var(--muted)">{g}</text>
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--faint)" strokeDasharray="4 4" />
        <path d={bins.map((b, i) => `${i ? 'L' : 'M'}${sx(b.pred).toFixed(1)} ${sy(b.obs).toFixed(1)}`).join('')} fill="none" stroke={MODEL_COLOR.lr} strokeWidth="1.6" />
        {bins.map((b, i) => (
          <circle key={i} cx={sx(b.pred)} cy={sy(b.obs)} r={3 + Math.sqrt(b.n) / 1.5} fill={MODEL_COLOR.lr} fillOpacity=".55">
            <title>{`${b.n} records, predicted ${num(b.pred, 2)}, observed ${num(b.obs, 2)}`}</title>
          </circle>
        ))}
        <text x={W / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">Mean predicted risk</text>
        <text x={12} y={H / 2} fontSize="10" textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 12 ${H / 2})`}>Observed disruption rate</text>
      </svg>
      <Note>Ten equal-width bins on validation. Dot size is the number of flight-hours. Bins with few records are noisy.</Note>
    </Card>
  )
}

function Coefs() {
  const feats = data.meta.features
  const items = champion ? data.champion.coef.map((c, i) => ({ c, f: feats[i] })) : []
  const max = Math.max(...items.map((i) => Math.abs(i.c)), 1e-9)
  return (
    <Card eyebrow="Champion coefficients" title="Which standardised inputs push risk up or down">
      {items.map(({ c, f }) => (
        <div key={f.key} className="md-coef">
          <div>
            <b>{f.label}</b>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{f.name}{f.unit ? ` (${f.unit})` : ''}</div>
          </div>
          <div className="md-coef__axis">
            <div
              className="md-coef__fill"
              style={{
                background: c >= 0 ? 'var(--green)' : 'var(--coral)',
                left: c >= 0 ? '50%' : `${50 - (Math.abs(c) / max) * 50}%`,
                width: `${(Math.abs(c) / max) * 50}%`,
              }}
            />
          </div>
          <span className="mono" style={{ textAlign: 'right' }}>{c >= 0 ? '+' : ''}{num(c, 3)}</span>
        </div>
      ))}
      <Note>
        Coefficients are per standard deviation, in log-odds. x1 is queue depth, x2 weather severity and x3 turnaround buffer. A negative coefficient on the buffer means a shorter buffer raises risk.
      </Note>
    </Card>
  )
}

function Gates() {
  return (
    <Card eyebrow="Gates" title="What is done and what the jury decides">
      {gates.map((g) => (
        <div key={g.label} className="md-gate">
          <span className={'md-gate__tick' + (g.status === 'done' ? ' is-done' : '')}>{g.status === 'done' ? '✓' : ''}</span>
          <div>
            <b>{g.label}</b>
            <small>{g.target}</small>
            <small>{g.note}</small>
          </div>
          <Pill tone={g.status === 'done' ? 'green' : 'neutral'}>{g.status === 'done' ? 'Done' : 'Decided by the jury'}</Pill>
        </div>
      ))}
      <Note>Blind results are hidden and are not part of this app.</Note>
    </Card>
  )
}

function Leakage() {
  const f = data.findings.find((x) => /resolved_outcome_hint/.test(x.issue + x.test + x.resolution))
  return (
    <Card eyebrow="Leakage test" title="Was the outcome hint leaking into the model?">
      <p style={{ fontSize: 13, margin: 0 }}>
        <span className="mono">resolved_outcome_hint</span> was dropped from the features. As a test, a copy of the table
        had that column overwritten, and the model output stayed identical. It matched the label on {data.naive.leakageAgreement} labelled rows, so it is never used.
      </p>
      {f && (
        <p className="md-explain" style={{ marginTop: 8 }}>
          {f.test} {f.resolution}
        </p>
      )}
    </Card>
  )
}

function Sweep() {
  const cutoff = useApp((s) => s.cutoff)
  const setCutoff = useApp((s) => s.setCutoff)
  const key = champion.key as 'lr'
  const pts = useMemo(() => {
    const out: { t: number; p: number; r: number; b: number }[] = []
    for (let i = 0; i <= 100; i++) {
      const c = confusion(rows, key, i / 100)
      out.push({ t: i / 100, p: c.precision, r: c.recall, b: c.balancedAccuracy })
    }
    return out
  }, [key])
  const line = (f: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t).toFixed(1)} ${sy(f(p)).toFixed(1)}`).join('')
  const cur = pts[Math.round(cutoff * 100)]
  const series: { name: string; color: string; f: (p: (typeof pts)[number]) => number }[] = [
    { name: 'Precision', color: '#fc967e', f: (p) => p.p },
    { name: 'Recall', color: '#365d49', f: (p) => p.r },
    { name: 'Balanced accuracy', color: '#17343d', f: (p) => p.b },
  ]
  return (
    <Card eyebrow="Cut-off sweep" title="Precision, recall and balanced accuracy across cut-offs">
      <svg
        className="md-sweep"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Metrics against cut-off, champion, validation"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const r = e.currentTarget.getBoundingClientRect()
          setCutoff(Math.round(Math.min(1, Math.max(0, ((((e.clientX - r.left) / r.width) * W - P) / (W - 2 * P)))) * 100) / 100)
        }}
        onPointerMove={(e) => {
          if (!e.buttons) return
          const r = e.currentTarget.getBoundingClientRect()
          setCutoff(Math.round(Math.min(1, Math.max(0, ((((e.clientX - r.left) / r.width) * W - P) / (W - 2 * P)))) * 100) / 100)
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(g)} y2={sy(g)} stroke="var(--line-soft)" />
            <text x={P - 6} y={sy(g) + 3} className="md-ax" textAnchor="end">{g}</text>
            <text x={sx(g)} y={H - P + 14} className="md-ax" textAnchor="middle">{g}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.name} d={line(s.f)} fill="none" stroke={s.color} strokeWidth={2} />
        ))}
        <line x1={sx(cutoff)} x2={sx(cutoff)} y1={sy(0)} y2={sy(1)} stroke="var(--coral-deep)" strokeWidth={1.5} />
        {series.map((s) => (
          <circle key={s.name} cx={sx(cutoff)} cy={sy(s.f(cur))} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5} />
        ))}
        <text x={W / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">Cut-off (click or drag to set)</text>
      </svg>
      <div className="md-legend">
        {series.map((s) => (
          <span key={s.name}><i style={{ background: s.color }} />{s.name} {num(s.f(cur), 3)}</span>
        ))}
      </div>
    </Card>
  )
}

export default function Models() {
  return (
    <Page
      eyebrow="Evidence · models"
      title="Which model should we trust, and how far?"
      lede="Four MLflow runs are compared on the same validation flight-hours. Move the cut-off to see how the champion trades disruptions caught against false alarms. Shorter turnaround buffers raise risk."
    >
      <Table />
      <div className="grid2">
        <Roc />
        <Calibration />
      </div>
      <div className="grid2">
        <Confusion />
        <Coefs />
      </div>
      <Sweep />
      <div className="grid2">
        <Gates />
        <Leakage />
      </div>
    </Page>
  )
}

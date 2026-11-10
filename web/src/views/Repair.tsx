import { useMemo, useState } from 'react'
import { data } from '../lib/data'
import type { Lineage } from '../lib/types'
import { num, shortId, prettyTs } from '../lib/format'
import { Page, Card, Pill, Seg, Note } from '../components/ui'
import '../styles/repair.css'

type Rec = Lineage['rejected'][number]

const t = (s: string) => Date.parse(s)
const isTrue = (v: unknown) => String(v) === 'true'

function Flow() {
  const f = data.funnel
  const n = data.naive
  const u = n.unitRows
  const W = 960
  const H = 300
  const k = 0.11
  const NW = 14
  const xA = 0
  const xB = 330
  const xC = 660
  const uH = f.eligible * k
  const qH = f.quarantined * k
  const qY = uH + 40
  const curve = (x1: number, y1: number, x2: number, y2: number, h: number, c: string) => {
    const m = (x1 + x2) / 2
    return (
      <path
        d={`M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2} L${x2} ${y2 + h} C${m} ${y2 + h} ${m} ${y1 + h} ${x1} ${y1 + h} Z`}
        fill={c}
        opacity={0.28}
      />
    )
  }
  const reasonColors = ['#c9604a', '#e8795f', '#fc967e']
  let ry = qY - 6
  const reasons = f.reasons.map((r, i) => {
    const h = Math.max(r.count * k, 4)
    const y = ry
    ry += h + 9
    return { ...r, y, h, c: reasonColors[i % 3] }
  })
  let qy0 = qY
  const repairs = [
    { label: 'Late revisions ignored', n: n.lateRows },
    { label: 'Replays collapsed', n: n.replayRows },
    { label: 'Units converted', n: (u.percent ?? 0) + (u.basis_points ?? 0) + n.commaRows },
    { label: 'Values recovered from log', n: n.recoveryRows },
  ]
  const rmax = Math.max(...repairs.map((r) => r.n))
  return (
    <Card eyebrow="Decision process" title="What was kept, and why" right={<Pill tone="neutral">Measured</Pill>}>
      <svg className="rp-flow" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flow from 2,000 expected flight-hours to usable and quarantined, with reasons and repairs">
        {curve(xA + NW, 0, xB, 0, uH, '#365d49')}
        {curve(xA + NW, uH, xB, qY, qH, '#c9604a')}
        <rect x={xA} y={0} width={NW} height={uH + qH} rx="3" fill="var(--navy)" />
        <rect x={xB} y={0} width={NW} height={uH} rx="3" fill="var(--green)" />
        <rect x={xB} y={qY} width={NW} height={qH} rx="3" fill="var(--coral-deep)" />
        <text x={xA + 22} y={uH * 0.35} className="rp-flow__big">{num(f.expected, 0)}</text>
        <text x={xA + 22} y={uH * 0.35 + 18} className="rp-flow__lab">expected flight-hours</text>
        <text x={xB + 24} y={uH * 0.35} className="rp-flow__big">{num(f.eligible, 0)}</text>
        <text x={xB + 24} y={uH * 0.35 + 18} className="rp-flow__lab">usable ({Math.round((f.eligible / f.expected) * 100)}%)</text>
        <text x={xB + 24} y={qY + 14} className="rp-flow__big rp-flow__big--sm">{num(f.quarantined, 0)}</text>
        <text x={xB + 24} y={qY + 32} className="rp-flow__lab">quarantined, kept in the denominator</text>
        {reasons.map((r) => {
          const y0 = qy0
          qy0 += r.count * k
          return (
            <g key={r.key}>
              {curve(xB + NW, y0, xC, r.y, r.h, r.c)}
              <rect x={xC} y={r.y} width={NW} height={r.h} rx="2" fill={r.c} />
              <text x={xC + 24} y={r.y + r.h / 2 + 4} className="rp-flow__lab rp-flow__lab--ink">
                {r.label} <tspan className="mono">{num(r.count, 0)}</tspan>
              </text>
            </g>
          )
        })}
        <text x={xC} y={12} className="rp-flow__cap">Repairs applied inside the usable set</text>
        {repairs.map((r, i) => {
          const y = 28 + i * 34
          return (
            <g key={r.label}>
              <text x={xC} y={y + 9} className="rp-flow__lab rp-flow__lab--ink">{r.label}</text>
              <rect x={xC + 190} y={y} width={90} height={9} rx="4.5" fill="var(--tint)" />
              <rect x={xC + 190} y={y} width={Math.max(3, (r.n / rmax) * 90)} height={9} rx="4.5" fill="var(--green)" />
              <text x={xC + 290} y={y + 9} className="rp-flow__lab mono">{num(r.n, 0)}</text>
            </g>
          )
        })}
        <line x1={xB + NW} x2={xC - 12} y1={uH / 2} y2={uH / 2} stroke="var(--line)" strokeDasharray="3 4" />
      </svg>
    </Card>
  )
}

function Defects() {
  const n = data.naive
  const u = n.unitRows
  const rows: { name: string; naive: string; fix: string; n: number | string; unit: string; status?: 'Pass' | 'Quarantined' | 'Recovered' }[] = [
    { name: 'Station keys', status: 'Recovered', naive: `${n.keyVariants} spellings of the same key. A join on raw keys loses ${num(n.lostOnRawJoin, 0)} of ${num(data.funnel.expected, 0)} expected records.`, fix: 'Lower-case, trim and drop the -legacy suffix. All 2,000 keys resolve.', n: n.lostOnRawJoin, unit: 'lost on raw keys' },
    { name: 'Late revisions', status: 'Recovered', naive: `"Latest revision" picks a row that lands about ${num(n.lateMedianHours, 0)} h after the decision time, so it uses information ops did not have.`, fix: 'Keep rows available at or before the decision time, then rank revisions.', n: n.lateRows, unit: 'revisions after the decision' },
    { name: 'Replays', status: 'Recovered', naive: 'Replayed rows have a different available_at, so a plain dropDuplicates keeps them.', fix: 'One row per flight-hour: highest revision, then latest available, initial before replay.', n: n.replayRows, unit: 'replay rows' },
    { name: 'Weather units', status: 'Recovered', naive: `Weather severity arrives in three units: ${num(u.percent ?? 0, 0)} percent and ${num(u.basis_points ?? 0, 0)} basis points rows; ${num(n.commaRows, 0)} rows use a comma decimal. Casting leaves values up to 100.`, fix: 'Comma to dot, percent / 100, basis points / 10,000. Every x2 ends in 0 to 1.', n: (u.percent ?? 0) + (u.basis_points ?? 0) + n.commaRows, unit: 'rows converted' },
    { name: 'Sentinels and nulls', status: 'Recovered', naive: `${num(n.sentinelRows, 0)} buffers equal -999 and ${num(n.nullX1Rows, 0)} queue depths are null. Dropping loses them; keeping treats -999 as a real buffer.`, fix: 'Recover the latest timely value from the recovery log. Quarantine if none.', n: n.sentinelRows + n.nullX1Rows, unit: 'placeholder rows' },
    { name: 'Unparseable values', status: 'Quarantined', naive: `${num(n.unparseableRows, 0)} queue depths read "unparseable". No repair is permitted.`, fix: 'Quarantine as x1_unparseable. The record stays in the 2,000 denominator.', n: n.unparseableRows, unit: 'rows' },
    { name: 'Purpose policy', status: 'Quarantined', naive: `${num(n.policyRows, 0)} policy rows, including ${num(n.marketingRows, 0)} marketing rows that are not authorisation for model training.`, fix: 'The latest model_training policy in force at the decision time decides. Marketing rows are ignored.', n: data.funnel.reasons.find((r) => r.key === 'policy_not_allowed')?.count ?? 0, unit: 'not permitted' },
    { name: 'Outcome leakage', status: 'Pass', naive: `resolved_outcome_hint equals the label on ${n.leakageAgreement} labelled rows.`, fix: 'Never used as a feature. It appears only as a leakage test.', n: n.leakageAgreement, unit: 'agreement' },
    { name: 'Coverage', status: 'Quarantined', naive: 'Some flight-hours have no observation available by the decision time.', fix: 'Quarantine as no timely observation.', n: data.funnel.reasons.find((r) => r.key === 'no_observation_at_decision_time')?.count ?? 0, unit: 'no timely row' },
  ]
  return (
    <Card eyebrow="Checks" title="Feed checks">
      <div className="rp-defects">
        <div className="rp-dh"><span>Check</span><span>Measured</span><span>Rule applied</span><span>Status</span></div>
        {rows.map((r) => (
          <div className="rp-d" key={r.name}>
            <b>{r.name}</b>
            <span className="rp-d__n">{typeof r.n === 'number' ? num(r.n, 0) : r.n}<small>{r.unit}</small></span>
            <span className="rp-d__fix">{r.fix}</span>
            <span><Pill tone={r.status === 'Pass' ? 'green' : r.status === 'Quarantined' ? 'coral' : 'navy'}>{r.status}</Pill></span>
          </div>
        ))}
      </div>
      <Note>Measured on the lab tables ({num(n.rawRows, 0)} raw rows, {num(n.nonNormalRows, 0)} with non-normal keys).</Note>
    </Card>
  )
}

function GenieCallout() {
  const n = data.naive
  return (
    <Card eyebrow="Known pitfall" title="Genie on raw tables undercounts late rows">
      <div className="rp-vs">
        <div className="rp-vs__box rp-vs__box--bad">
          <div className="eyebrow eyebrow--plain">Raw tables</div>
          <div className="rp-vs__big mono">{num(n.genieNaiveLate, 0)}</div>
        </div>
        <span className="rp-vs__arrow" aria-hidden>→</span>
        <div className="rp-vs__box rp-vs__box--good">
          <div className="eyebrow eyebrow--plain">After key repair</div>
          <div className="rp-vs__big mono">{num(n.lateRows, 0)}</div>
        </div>
      </div>
      <p className="rp-explain" style={{ marginTop: 10 }}>Late revisions, about {num(n.lateMedianHours, 0)} h after decision time. Raw-key join misses most of them. Ask Genie on the repaired tables.</p>
    </Card>
  )
}

type Kind = 'rejected' | 'repaired'
type Item = Rec & { kind: Kind }

function Inspector() {
  const [kind, setKind] = useState<Kind>('rejected')
  const [fil, setFil] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)

  const reasonInfo = (k: string) => data.funnel.reasons.find((r) => r.key === k)
  const list: Item[] = useMemo(
    () => (kind === 'rejected' ? data.lineage.rejected : data.lineage.repaired).map((r) => ({ ...r, kind })),
    [kind],
  )
  const keyOf = (r: Item) => (kind === 'rejected' ? r.reason : r.detail)
  const labelOf = (k: string) => (kind === 'rejected' ? reasonInfo(k)?.label ?? k : k.replace(/ \(.*\)$/, ''))
  const options = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((r) => m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + 1))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((r) => (fil === 'all' || keyOf(r) === fil) && (!s || r.id.toLowerCase().includes(s)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, fil, q])
  const rec = filtered.find((r) => r.id === sel) ?? filtered[0] ?? null

  return (
    <Card
      eyebrow="Inspection"
      title="Quarantined and repaired flight-hours"
      right={
        <Seg
          options={[
            { value: 'rejected' as Kind, label: `Quarantined (${data.lineage.rejected.length})` },
            { value: 'repaired' as Kind, label: `Repaired (${data.lineage.repaired.length})` },
          ]}
          value={kind}
          onChange={(v) => {
            setKind(v)
            setFil('all')
            setSel(null)
          }}
        />
      }
    >
      <div className="rp-md">
        <div className="rp-md__list">
          <input className="rp-find" placeholder="Search flight-hour id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search flight-hour id" />
          <div className="rp-chips" role="group" aria-label="Filter">
            <button className={'rp-chip' + (fil === 'all' ? ' is-on' : '')} onClick={() => setFil('all')}>All<small>{list.length}</small></button>
            {options.map(([k, c]) => (
              <button key={k} className={'rp-chip' + (fil === k ? ' is-on' : '')} onClick={() => setFil(k)}>
                {labelOf(k)}<small>{c}</small>
              </button>
            ))}
          </div>
          <div className="rp-list">
            <table className="tbl">
              <thead>
                <tr><th>Flight-hour</th><th>Split</th><th>{kind === 'rejected' ? 'Reason' : 'Repair'}</th></tr>
              </thead>
              <tbody>
                {filtered.slice(0, 120).map((r) => (
                  <tr key={r.id} className={'is-click' + (rec?.id === r.id ? ' is-on' : '')} onClick={() => setSel(r.id)}>
                    <td className="mono">{shortId(r.id, 14)}</td>
                    <td>{r.split}</td>
                    <td>{labelOf(keyOf(r))}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={3}>No record matches.</td></tr>}
              </tbody>
            </table>
          </div>
          <span className="eyebrow eyebrow--plain">{filtered.length} records</span>
        </div>
        <div className="rp-md__detail">
          {rec ? <Timeline rec={rec} rejected={kind === 'rejected'} reasonInfo={reasonInfo(rec.reason)} /> : <span className="rp-explain">Select a record.</span>}
        </div>
      </div>
    </Card>
  )
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

function AxisView({ rec }: { rec: Rec }) {
  const dec = t(rec.observedAt)
  const H1 = 3.6e6
  const used = rec.observations
    .filter((o) => t(o.available_at) <= dec)
    .sort((a, b) => Number(b.revision) - Number(a.revision) || Number(a.source_batch === 'replay') - Number(b.source_batch === 'replay') || t(b.available_at) - t(a.available_at))[0]
  const rows = [
    ...rec.observations.map((o) => {
      const at = t(o.available_at)
      const st: 'used' | 'late' | 'sup' = at > dec ? 'late' : o === used ? 'used' : 'sup'
      return { k: 'o' as const, at, st, label: `rev ${o.revision} · ${o.source_batch}` }
    }),
    ...rec.recovery.map((r) => {
      const at = t(r.available_at)
      return { k: 'r' as const, at, st: (at > dec ? 'late' : 'used') as 'used' | 'late', label: `recovery · ${r.field}` }
    }),
  ].filter((p) => !Number.isNaN(p.at))
  const hrsArr = rows.map((r) => (r.at - dec) / H1)
  let lo = Math.min(0, ...hrsArr)
  let hi = Math.max(0, ...hrsArr)
  const pad = Math.max((hi - lo) * 0.1, 0.05)
  lo -= pad
  hi += pad
  const step = niceStep((hi - lo) / 5)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v / step) * step)
  const W = 720
  const L = 150
  const R = 28
  const T = 30
  const rowH = 30
  const plotH = Math.max(rows.length, 1) * rowH
  const H = T + plotH + 52
  const x = (h: number) => L + ((h - lo) / (hi - lo)) * (W - L - R)
  const fmt = (h: number) => (Math.abs(step) < 1 ? h.toFixed(2) : h.toFixed(step % 1 ? 1 : 0))
  const col = { used: 'var(--green)', late: 'var(--coral)', sup: '#9aa5a8' }
  return (
    <>
      <div className="rp-legend">
        <span><i style={{ background: col.used }} />Used</span>
        <span><i style={{ background: col.late }} />Ignored: arrived after decision</span>
        <span><i style={{ background: col.sup }} />Superseded</span>
        <span><i style={{ background: 'var(--navy)', borderRadius: 2 }} />Square = recovery value</span>
      </div>
      <svg className="rp-axis" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Availability of each raw row relative to the decision time">
        <rect x={x(0)} y={T - 6} width={Math.max(0, W - R - x(0))} height={plotH + 6} fill="var(--coral-soft)" />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={T - 6} y2={T + plotH} stroke="var(--line-soft)" />
            <text x={x(v)} y={T + plotH + 16} textAnchor="middle">{fmt(v)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = T + i * rowH + rowH / 2
          return (
            <g key={i}>
              <line x1={L} x2={W - R} y1={cy} y2={cy} stroke="var(--line-soft)" />
              <text x={L - 12} y={cy + 3} textAnchor="end">{r.label}</text>
              {r.k === 'o' ? (
                <circle cx={x((r.at - dec) / H1)} cy={cy} r="6" fill={col[r.st]} />
              ) : (
                <rect x={x((r.at - dec) / H1) - 5} y={cy - 5} width="10" height="10" rx="2" fill={r.st === 'late' ? col.late : 'var(--navy)'} />
              )}
            </g>
          )
        })}
        <line x1={x(0)} x2={x(0)} y1={T - 14} y2={T + plotH} stroke="var(--navy)" strokeWidth="1.5" />
        <text x={x(0)} y={T - 18} textAnchor="middle" className="rp-axis__dec">Decision time</text>
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle">hours relative to decision time</text>
      </svg>
    </>
  )
}

function Timeline({ rec, rejected, reasonInfo }: { rec: Rec; rejected: boolean; reasonInfo?: { label: string; explanation: string } }) {
  // A policy is in force at an observation when its effective_at is on or before the decision time; the latest such one wins.
  const inForce = rec.policies
    .filter((p) => t(p.effective_at) <= t(rec.observedAt))
    .sort((a, b) => t(a.effective_at) - t(b.effective_at))
    .pop()
  return (
    <div className="rp-tl">
      <div className="rp-step">
        <span className="rp-step__dot">1</span>
        <h4>Decision time</h4>
        <div className="mono" style={{ fontSize: 13 }}>
          {prettyTs(rec.observedAt)} <span style={{ color: 'var(--muted)' }}>· {rec.split} · flight-hour {shortId(rec.id, 14)}</span>
        </div>
      </div>

      <div className="rp-step">
        <span className="rp-step__dot">2</span>
        <h4>Raw rows against decision time ({rec.observations.length})</h4>
        <AxisView rec={rec} />
        <div className="rp-scroll">
          <table className="rp-mini">
            <thead>
              <tr><th>available_at</th><th>vs decision</th><th>rev</th><th>source_batch</th><th>x1</th><th>x2</th><th>x3</th></tr>
            </thead>
            <tbody>
              {rec.observations.map((o, i) => {
                const late = t(o.available_at) > t(rec.observedAt)
                return (
                  <tr key={i}>
                    <td className={'mono' + (late ? ' rp-late' : '')}>{prettyTs(o.available_at)}</td>
                    <td>{late ? <Pill tone="coral">ignored</Pill> : <Pill tone="green">used</Pill>}</td>
                    <td className="mono">{o.revision}</td>
                    <td className="mono">{o.source_batch}</td>
                    <td className="mono">{String(o.x1)}</td>
                    <td className="mono">{String(o.x2)} {o.x2_unit}{o.decimal_format === 'comma' ? ' (comma)' : ''}</td>
                    <td className="mono">{String(o.x3)}</td>
                  </tr>
                )
              })}
              {rec.observations.length === 0 && <tr><td colSpan={7}>No raw row for this flight-hour.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rp-step">
        <span className="rp-step__dot">3</span>
        <h4>Permission policy rows ({rec.policies.length})</h4>
        <div className="rp-scroll">
          <table className="rp-mini">
            <thead>
              <tr><th>purpose</th><th>allowed</th><th>rev</th><th>effective_at</th><th>at decision time</th></tr>
            </thead>
            <tbody>
              {rec.policies.map((p, i) => (
                <tr key={i}>
                  <td>{p.purpose}</td>
                  <td><Pill tone={isTrue(p.allowed) ? 'green' : 'coral'}>{isTrue(p.allowed) ? 'allowed' : 'not allowed'}</Pill></td>
                  <td className="mono">{p.revision}</td>
                  <td className="mono">{prettyTs(p.effective_at)}</td>
                  <td>{p === inForce ? 'in force' : t(p.effective_at) > t(rec.observedAt) ? 'not yet, ignored' : p.purpose !== 'model_training' ? 'not authorisation' : 'superseded'}</td>
                </tr>
              ))}
              {rec.policies.length === 0 && <tr><td colSpan={5}>No policy row for this flight-hour.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rp-step">
        <span className="rp-step__dot">4</span>
        <h4>Recovery rows ({rec.recovery.length})</h4>
        {rec.recovery.length ? (
          <table className="rp-mini">
            <thead><tr><th>field</th><th>value</th><th>available_at</th></tr></thead>
            <tbody>
              {rec.recovery.map((r, i) => (
                <tr key={i}><td>{r.field}</td><td className="mono">{String(r.value)}</td><td className="mono">{prettyTs(r.available_at)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="rp-explain">None for this flight-hour.</span>
        )}
      </div>

      <div className={'rp-step ' + (rejected ? 'rp-step--verdict' : 'rp-step--ok')}>
        <span className="rp-step__dot">{rejected ? '×' : '✓'}</span>
        <h4>Verdict and output features</h4>
        <div className={'rp-verdict' + (rejected ? '' : ' rp-verdict--ok')}>
          {rejected ? (
            <>
              <b>Quarantined: {reasonInfo?.label ?? rec.reason}.</b>
              <p className="rp-explain" style={{ color: 'var(--ink)' }}>{reasonInfo?.explanation}</p>
            </>
          ) : (
            <>
              <b>Eligible after repair.</b>
              <p className="rp-explain" style={{ color: 'var(--ink)' }}>{rec.detail}</p>
            </>
          )}
          {rec.output ? (
            <div className="mono" style={{ fontSize: 13, marginTop: 6 }}>
              x1 queue depth {String(rec.output.x1)} · x2 weather severity {String(rec.output.x2)} · x3 turnaround buffer {String(rec.output.x3)}
            </div>
          ) : (
            <div className="rp-explain" style={{ marginTop: 6 }}>No output features: this flight-hour is not scored.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Findings() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Card eyebrow="Findings" title="Findings log">
      {data.findings.map((f, i) => (
        <div key={i} className={'rp-fr' + (open === i ? ' is-open' : '')}>
          <button className="rp-fr__head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{f.issue}</span>
            <span className="rp-fr__chev">›</span>
          </button>
          {open === i && (
            <div className="rp-fr__body">
              <div><b>Test.</b> {f.test}</div>
              <div><b>Resolution.</b> {f.resolution}</div>
            </div>
          )}
        </div>
      ))}
    </Card>
  )
}

export default function Repair() {
  return (
    <Page eyebrow="VP of Data" title="Data quality">
      <Flow />
      <Defects />
      <Inspector />
      <div className="grid2">
        <GenieCallout />
        <Findings />
      </div>
    </Page>
  )
}

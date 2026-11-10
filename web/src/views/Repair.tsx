import { useMemo, useState } from 'react'
import { data } from '../lib/data'
import type { Lineage } from '../lib/types'
import { num, shortId, prettyTs } from '../lib/format'
import { Page, Card, Stat, Pill, Seg, Note } from '../components/ui'
import '../styles/repair.css'

type SplitKey = 'all' | 'train' | 'validation' | 'blind'
type Rec = Lineage['rejected'][number]
type Tab = 'rejected' | 'repaired'

const SPLITS: { value: SplitKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'train', label: 'Train' },
  { value: 'validation', label: 'Validation' },
  { value: 'blind', label: 'Blind' },
]

const SHADES = ['#fc967e', '#e8795f', '#c9604a', '#a8503f', '#8a4535', '#6d392c']
const t = (s: string) => Date.parse(s)
const isTrue = (v: unknown) => String(v) === 'true'

function Funnel() {
  const [split, setSplit] = useState<SplitKey>('all')
  const f = data.funnel
  const view = useMemo(() => {
    const src = split === 'all' ? f : f.bySplit[split]
    const expected = src.expected
    const eligible = src.eligible
    const rows = f.reasons.map((r) => ({
      ...r,
      count: split === 'all' ? r.count : (f.bySplit[split].reasons[r.key] ?? 0),
    }))
    return { expected, eligible, rows }
  }, [split, f])
  const w = (n: number) => `${view.expected ? (n / view.expected) * 100 : 0}%`
  return (
    <Card
      eyebrow="Funnel"
      title="From 2,000 expected flight-hours to the ones we can trust"
      right={<Seg options={SPLITS} value={split} onChange={setSplit} />}
    >
      <div className="rp-funnel">
        <div className="rp-frow rp-frow--total">
          <span>Expected</span>
          <div className="rp-frow__bar"><div className="rp-frow__fill" style={{ width: '100%', background: 'var(--navy)' }} /></div>
          <span className="rp-frow__n mono">{num(view.expected, 0)}</span>
        </div>
        {view.rows.map((r, i) => (
          <div key={r.key}>
            <div className={'rp-frow' + (r.count === 0 ? ' rp-frow--zero' : '')}>
              <span>minus {r.label}</span>
              <div className="rp-frow__bar">
                <div className="rp-frow__fill" style={{ width: w(r.count), background: SHADES[i % SHADES.length] }} />
              </div>
              <span className="rp-frow__n mono">-{num(r.count, 0)}</span>
            </div>
            <p className="rp-explain">{r.explanation}</p>
          </div>
        ))}
        <div className="rp-frow rp-frow--total">
          <span>Eligible</span>
          <div className="rp-frow__bar"><div className="rp-frow__fill" style={{ width: w(view.eligible), background: 'var(--green)' }} /></div>
          <span className="rp-frow__n mono">{num(view.eligible, 0)}</span>
        </div>
      </div>
    </Card>
  )
}

function Defects() {
  const n = data.naive
  const u = n.unitRows
  const rows: { name: string; naive: string; fix: string; n: number | string; unit: string }[] = [
    { name: 'Station keys', naive: `${n.keyVariants} spellings of the same key. A join on raw keys loses ${num(n.lostOnRawJoin, 0)} of ${num(data.funnel.expected, 0)} expected records.`, fix: 'Lower-case, trim and drop the -legacy suffix. All 2,000 keys resolve.', n: n.lostOnRawJoin, unit: 'lost on raw keys' },
    { name: 'Late revisions', naive: `"Latest revision" picks a row that lands about ${num(n.lateMedianHours, 0)} h after the decision time, so it uses information ops did not have.`, fix: 'Keep rows available at or before the decision time, then rank revisions.', n: n.lateRows, unit: 'revisions after the decision' },
    { name: 'Replays', naive: 'Replayed rows have a different available_at, so a plain dropDuplicates keeps them.', fix: 'One row per flight-hour: highest revision, then latest available, initial before replay.', n: n.replayRows, unit: 'replay rows' },
    { name: 'Weather units', naive: `Weather severity arrives in three units: ${num(u.percent ?? 0, 0)} percent and ${num(u.basis_points ?? 0, 0)} basis points rows; ${num(n.commaRows, 0)} rows use a comma decimal. Casting leaves values up to 100.`, fix: 'Comma to dot, percent / 100, basis points / 10,000. Every x2 ends in 0 to 1.', n: (u.percent ?? 0) + (u.basis_points ?? 0) + n.commaRows, unit: 'rows converted' },
    { name: 'Sentinels and nulls', naive: `${num(n.sentinelRows, 0)} buffers equal -999 and ${num(n.nullX1Rows, 0)} queue depths are null. Dropping loses them; keeping treats -999 as a real buffer.`, fix: 'Recover the latest timely value from the recovery log. Quarantine if none.', n: n.sentinelRows + n.nullX1Rows, unit: 'placeholder rows' },
    { name: 'Unparseable values', naive: `${num(n.unparseableRows, 0)} queue depths read "unparseable". No repair is permitted.`, fix: 'Quarantine as x1_unparseable. The record stays in the 2,000 denominator.', n: n.unparseableRows, unit: 'rows' },
    { name: 'Purpose policy', naive: `${num(n.policyRows, 0)} policy rows, including ${num(n.marketingRows, 0)} marketing rows that are not authorisation for model training.`, fix: 'The latest model_training policy in force at the decision time decides. Marketing rows are ignored.', n: data.funnel.reasons.find((r) => r.key === 'policy_not_allowed')?.count ?? 0, unit: 'not permitted' },
    { name: 'Outcome leakage', naive: `resolved_outcome_hint equals the label on ${n.leakageAgreement} labelled rows.`, fix: 'Never used as a feature. It appears only as a leakage test.', n: n.leakageAgreement, unit: 'agreement' },
    { name: 'Coverage', naive: 'Some flight-hours have no observation available by the decision time.', fix: 'Quarantine as no timely observation.', n: data.funnel.reasons.find((r) => r.key === 'no_observation_at_decision_time')?.count ?? 0, unit: 'no timely row' },
  ]
  return (
    <Card eyebrow="Naive vs repaired" title="Nine ways the raw feed misleads, measured">
      <div className="rp-defects">
        <div className="rp-dh"><span>Defect</span><span>What a naive pipeline does</span><span>What we do</span><span style={{ textAlign: 'right' }}>Measured</span></div>
        {rows.map((r) => (
          <div className="rp-d" key={r.name}>
            <b>{r.name}</b>
            <span className="rp-d__naive">{r.naive}</span>
            <span className="rp-d__fix">{r.fix}</span>
            <span className="rp-d__n">{typeof r.n === 'number' ? num(r.n, 0) : r.n}<small>{r.unit}</small></span>
          </div>
        ))}
      </div>
      <Note>
        A dashboard on the raw feed shows these errors faster. Counts are measured on the lab tables ({num(n.rawRows, 0)} raw rows,
        {' '}{num(n.nonNormalRows, 0)} with non-normal keys), not estimated.
      </Note>
    </Card>
  )
}

function GenieCallout() {
  const n = data.naive
  return (
    <Card eyebrow="Same question, two answers" title="How many rows arrive after the decision time?">
      <div className="rp-vs">
        <div className="rp-vs__box rp-vs__box--bad">
          <div className="eyebrow eyebrow--plain">Vanilla Genie on raw tables</div>
          <div className="rp-vs__big mono">{num(n.genieNaiveLate, 0)}</div>
          <p className="rp-explain">It joined on raw keys, so it missed most of the late rows.</p>
        </div>
        <span className="rp-vs__arrow" aria-hidden>→</span>
        <div className="rp-vs__box rp-vs__box--good">
          <div className="eyebrow eyebrow--plain">After key repair</div>
          <div className="rp-vs__big mono">{num(n.lateRows, 0)}</div>
          <p className="rp-explain">Late revisions, available about {num(n.lateMedianHours, 0)} h after the decision time.</p>
        </div>
      </div>
      <p className="rp-explain" style={{ marginTop: 10 }}>{data.genieFindings}</p>
      <Note>
        This is a data-trust point, not a model result. The data team asks Genie on the repaired tables instead.
      </Note>
    </Card>
  )
}

function Lineage_() {
  const [tab, setTab] = useState<Tab>('rejected')
  const [fil, setFil] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)

  const list: Rec[] = tab === 'rejected' ? data.lineage.rejected : data.lineage.repaired
  const reasonInfo = (k: string) => data.funnel.reasons.find((r) => r.key === k)
  const keyOf = (r: Rec) => (tab === 'rejected' ? r.reason : r.detail)
  const labelOf = (k: string) => (tab === 'rejected' ? reasonInfo(k)?.label ?? k : k.replace(/ \(.*\)$/, ''))
  const options = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((r) => m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + 1))
    return Array.from(m.entries())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, tab])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((r) => (fil === 'all' || keyOf(r) === fil) && (!s || r.id.toLowerCase().includes(s)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, tab, fil, q])
  const rec = filtered.find((r) => r.id === sel) ?? filtered[0] ?? null
  const random = () => {
    if (filtered.length) setSel(filtered[Math.floor(Math.random() * filtered.length)].id)
  }

  return (
    <Card
      eyebrow="Lineage explorer"
      title="Follow one flight-hour from raw rows to verdict"
      right={
        <Seg
          options={[
            { value: 'rejected' as Tab, label: `Quarantined (${data.lineage.rejected.length})` },
            { value: 'repaired' as Tab, label: `Repaired (${data.lineage.repaired.length})` },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v)
            setFil('all')
            setSel(null)
          }}
        />
      }
    >
      <div className="rp-chips" role="group" aria-label="Filter">
        <button className={'rp-chip' + (fil === 'all' ? ' is-on' : '')} onClick={() => setFil('all')}>All</button>
        {options.map(([k, c]) => (
          <button key={k} className={'rp-chip' + (fil === k ? ' is-on' : '')} onClick={() => setFil(k)}>
            {labelOf(k)}<small>{c}</small>
          </button>
        ))}
      </div>
      <div className="rp-tools">
        <input className="rp-find" placeholder="Search by record id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search record id" />
        <button className="rp-btn" onClick={random}>Random</button>
        <span className="eyebrow eyebrow--plain">{filtered.length} records</span>
      </div>
      <div className="rp-list">
        <table className="tbl">
          <thead>
            <tr><th>Flight-hour</th><th>Split</th><th>{tab === 'rejected' ? 'Reason' : 'Repair'}</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, 80).map((r) => (
              <tr key={r.id} className={'is-click' + (rec?.id === r.id ? ' is-on' : '')} onClick={() => setSel(r.id)}>
                <td className="mono">{shortId(r.id, 14)}</td>
                <td>{r.split}</td>
                <td>{tab === 'rejected' ? reasonInfo(r.reason)?.label ?? r.reason : r.detail}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={3}>No record matches.</td></tr>}
          </tbody>
        </table>
      </div>
      {rec && <Timeline rec={rec} rejected={tab === 'rejected'} reasonInfo={reasonInfo(rec.reason)} />}
    </Card>
  )
}

function AxisView({ rec }: { rec: Rec }) {
  const dec = t(rec.observedAt)
  const pts = [
    ...rec.observations.map((o, i) => ({ k: 'o' as const, at: t(o.available_at), label: `row ${i + 1}` })),
    ...rec.recovery.map((r, i) => ({ k: 'r' as const, at: t(r.available_at), label: `rec ${i + 1}` })),
  ].filter((p) => !Number.isNaN(p.at))
  const all = [dec, ...pts.map((p) => p.at)]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = Math.max(hi - lo, 60_000)
  const W = 640
  const x = (v: number) => 30 + ((v - lo) / span) * (W - 60)
  const hrs = (v: number) => {
    const d = (v - dec) / 3.6e6
    return (d >= 0 ? '+' : '') + (Math.abs(d) < 1 ? Math.round(d * 60) + ' min' : d.toFixed(1) + ' h')
  }
  return (
    <>
      <div className="rp-legend">
        <span><i style={{ background: 'var(--green)' }} />Observation row, used</span>
        <span><i style={{ background: 'var(--coral)' }} />Row after the line, ignored</span>
        <span><i style={{ background: 'var(--navy)', borderRadius: 2 }} />Recovery value</span>
      </div>
      <svg className="rp-axis" viewBox={`0 0 ${W} 86`} role="img" aria-label="Availability of each raw row relative to the decision time">
        <rect x={x(dec)} y="8" width={Math.max(0, W - 30 - x(dec))} height="46" fill="var(--coral-soft)" />
        <line x1="30" x2={W - 30} y1="34" y2="34" stroke="var(--line)" />
        <line x1={x(dec)} x2={x(dec)} y1="4" y2="60" stroke="var(--navy)" strokeWidth="1.5" />
        <text x={x(dec)} y="76" textAnchor="middle">decision time {prettyTs(rec.observedAt)}</text>
        {pts.map((p, i) => {
          const late = p.at > dec
          const cy = p.k === 'o' ? 26 : 42
          return (
            <g key={i}>
              {p.k === 'o' ? (
                <circle cx={x(p.at)} cy={cy} r="6" fill={late ? 'var(--coral)' : 'var(--green)'} />
              ) : (
                <rect x={x(p.at) - 5} y={cy - 5} width="10" height="10" rx="2" fill={late ? 'var(--coral)' : 'var(--navy)'} />
              )}
              <text x={x(p.at)} y={p.k === 'o' ? 16 : 58} textAnchor="middle">{p.label} {hrs(p.at)}</text>
            </g>
          )
        })}
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
        <h4>Raw rows against the decision time ({rec.observations.length})</h4>
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
    <Card eyebrow="Findings" title="Issues found, how we tested them, what we did">
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
  const n = data.naive
  return (
    <Page
      eyebrow="Evidence · signal repair"
      title="Why would a faster dashboard still be wrong?"
      lede={`Because the feed is late, revised and inconsistent at decision time: ${num(n.lateRows, 0)} revisions land about ${num(n.lateMedianHours, 0)} h after the decision and ${num(n.lostOnRawJoin, 0)} records are lost on raw keys. After repair, ${num(data.funnel.eligible, 0)} of ${num(data.funnel.expected, 0)} flight-hours are usable.`}
    >
      <div className="grid4">
        <Stat label="Expected" value={num(data.funnel.expected, 0)} sub="flight-hours" />
        <Stat label="Usable" value={num(data.funnel.eligible, 0)} sub="after point-in-time, unit and permission repair" tone="green" />
        <Stat label="Quarantined" value={num(data.funnel.quarantined, 0)} sub="kept in the denominator" tone="coral" />
        <Stat label="Late revisions" value={num(n.lateRows, 0)} sub={`about ${num(n.lateMedianHours, 0)} h after decision (measured)`} />
      </div>
      <Funnel />
      <Defects />
      <GenieCallout />
      <Lineage_ />
      <Findings />
    </Page>
  )
}

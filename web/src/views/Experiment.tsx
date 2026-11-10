import { useMemo, useState } from 'react'
import { Page, Card, Band, Pill } from '../components/ui'
import { data, champion, dummy } from '../lib/data'
import { confusion } from '../lib/metrics'
import { num, pct, pct1 } from '../lib/format'
import { contract, review } from '../lib/experiment'
import { gates } from '../lib/narrative'
import '../styles/experiment.css'

const HIGHLIGHT: Record<string, 'coral' | 'amber'> = {
  'What would falsify the diagnosis?': 'coral',
  'What can this experiment not establish?': 'amber',
}

export default function Experiment() {
  const [copied, setCopied] = useState(false)

  // Recompute every model figure the text cites, so the copy cannot drift from the bundle.
  const live = useMemo(() => {
    const f = data.funnel
    const v = f.bySplit.validation
    const b = f.bySplit.blind
    const t = f.bySplit.train
    const c = confusion(data.validation, 'lr', 0.5)
    const sorted = [...data.validation].sort((x, y) => y.lr - x.lr)
    const q = Math.max(1, Math.floor(sorted.length / 4))
    const rate = (rows: typeof sorted) => rows.reduce((s, r) => s + r.y, 0) / Math.max(1, rows.length)
    const flagged = data.validation.filter((r) => r.lr >= 0.5)
    const hits = flagged.reduce((s, r) => s + r.y, 0)
    const ra = (key: string) => f.reasons.find((r) => r.key === key)?.count
    const biz = data.business
    const dBa = dummy.balancedAccuracy
    const subs: [string, string][] = [
      ['2,000 expected records: 1,707 usable, 293 quarantined', `${num(f.expected)} expected records: ${num(f.eligible)} usable, ${num(f.quarantined)} quarantined`],
      ['Our champion scores 0.917', `Our champion scores ${num(champion.balancedAccuracy, 3)}`],
      ['the Dummy scores 0.500', `the Dummy scores ${num(dBa, 3)}`],
      ['champion logistic regression scores 0.917 balanced accuracy, against 0.500', `champion logistic regression scores ${num(champion.balancedAccuracy, 3)} balanced accuracy, against ${num(dBa, 3)}`],
      ['Validation: 342 usable flight-hours out of 400', `Validation: ${num(v.eligible)} usable flight-hours out of ${num(v.expected)}`],
      ['Blind: 342 out of 400', `Blind: ${num(b.eligible)} out of ${num(b.expected)}`],
      ['The denominator stays 2,000', `The denominator stays ${num(f.expected)}`],
      ['(1,023 records)', `(${num(t.eligible)} records)`],
      ['171 records are not permitted', `${num(ra('policy_not_allowed') ?? 171)} records are not permitted`],
      ['67 queue-depth values', `${num(ra('x1_unparseable') ?? 67)} queue-depth values`],
      ['55 flight-hours had no observation', `${num(ra('no_observation_at_decision_time') ?? 55)} flight-hours had no observation`],
      ['flags 157 flight-hours, and 144 of those', `flags ${flagged.length} flight-hours, and ${hits} of those`],
      ['saw a 93% disruption rate; the 25% least risky saw 1.2%', `saw a ${pct(rate(sorted.slice(0, q)))} disruption rate; the 25% least risky saw ${pct1(rate(sorted.slice(-q)))}`],
      ['loses 703 of 2,000 records, and 216 revisions', `loses ${num(data.naive.lostOnRawJoin)} of ${num(f.expected)} records, and ${num(data.naive.lateRows)} revisions`],
      ['about 14 delays per week', `about ${biz.delaysPerWeek} delays per week`],
      ['about 7 fewer per week', `about ${num(biz.delaysPerWeek * biz.targetReduction)} fewer per week`],
    ]
    return { subs, c, dBa }
  }, [])

  const fill = (s: string) => live.subs.reduce((acc, [a, z]) => acc.split(a).join(z), s)
  const rows = contract.map((r) => ({ label: r.label, text: fill(r.text) }))
  const rev = {
    observed: fill(review.observed),
    implication: fill(review.implication),
    limitation: fill(review.limitation),
    next: fill(review.next),
  }
  const steps = [
    { n: '01', k: 'Observed result', t: rev.observed },
    { n: '02', k: 'Implication', t: rev.implication },
    { n: '03', k: 'Limitation', t: rev.limitation },
    { n: '04', k: 'Next test', t: rev.next },
  ]

  const copy = async () => {
    const text = [
      'EXPERIMENT CONTRACT',
      ...rows.map((r, i) => `${i + 1}. ${r.label}: ${r.text}`),
      '',
      'REVIEW',
      ...steps.map((s) => `${s.n} ${s.k}: ${s.t}`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Page
      eyebrow="The case · Experiment"
      title="What are we testing, and what would prove us wrong?"
      lede="This is the experiment contract we filled in for the lab: one decision, one metric, one baseline and a target we can fail. Figures cited from the model are recomputed from the data, so they cannot drift from what we logged."
    >
      <div className="ex-bar">
        <span className="ex-bar__note">11 fields · model figures live from the bundle</span>
        <button type="button" className="ex-copy" onClick={copy} aria-live="polite">
          {copied ? 'Copied' : 'Copy as text'}
        </button>
      </div>

      <div className="ex-grid">
        {rows.map((r, i) => {
          const tone = HIGHLIGHT[r.label]
          return (
            <section key={r.label} className={`ex-card ${tone ? `is-${tone}` : ''}`}>
              <div className="ex-card__eyebrow">
                <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                {r.label}
              </div>
              <p>{r.text}</p>
            </section>
          )
        })}
      </div>

      <Band eyebrow="Review" title="Observed result → implication → limitation → next test">
        <ol className="ex-steps">
          {steps.map((s, i) => (
            <li key={s.n} className={`ex-step ${i === 0 ? 'is-active' : ''}`}>
              <span className="ex-step__n">{s.n}</span>
              <div className="ex-step__t">
                <b>{s.k}</b>
                <p>{s.t}</p>
              </div>
            </li>
          ))}
        </ol>
      </Band>

      <Card eyebrow="Pass / fail gates" title="What decides the grade" className="ex-gates">
        <div className="ex-scroll">
          <table className="tbl">
            <thead>
              <tr><th>Gate</th><th>Target</th><th>Status</th><th>Note</th></tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.label}>
                  <td><b>{g.label}</b></td>
                  <td>{g.target}</td>
                  <td><Pill tone={g.status === 'done' ? 'green' : 'amber'}>{g.status === 'done' ? 'Done' : 'Jury'}</Pill></td>
                  <td>{g.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  )
}

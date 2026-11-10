import { useMemo, useState } from 'react'
import { meddpicc, rubric, rubricNote, limits, recommendation, stakeholders } from '../lib/narrative'
import { Page, Card, Pill, Seg, Band } from '../components/ui'
import '../styles/evidence.css'

type Filter = 'all' | 'Confirmed' | 'Supported' | 'Hypothesis'

// Defensive helpers: rubric and limits shapes are not pinned down in the contract.
type Any = Record<string, unknown>
const asList = (x: unknown): unknown[] => {
  if (Array.isArray(x)) return x
  if (x && typeof x === 'object') {
    const arr = Object.values(x as Any).find(Array.isArray)
    if (arr) return arr as unknown[]
    return Object.entries(x as Any).map(([k, v]) => ({ label: k, text: v }))
  }
  return []
}
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const first = (o: Any, keys: string[]) => {
  for (const k of keys) if (str(o[k])) return str(o[k])
  return ''
}

export default function Meddpicc() {
  const [f, setF] = useState<Filter>('all')
  const shown = useMemo(() => meddpicc.filter((m) => f === 'all' || m.status === f), [f])
  const confirmed = meddpicc.filter((m) => m.status === 'Confirmed').length
  const supported = meddpicc.filter((m) => m.status === 'Supported').length
  const hypo = meddpicc.length - confirmed - supported

  const download = () => {
    const out: Record<string, { claim: string; source: string; next_step: string }> = {}
    for (const m of meddpicc) out[m.code] = { claim: m.claim.join('\n'), source: m.source, next_step: m.next }
    const blob = new Blob([JSON.stringify({ meddpicc: out }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'evidence.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Page
      eyebrow="Next gate · MEDDPICC"
      title="Who decides, what do they need, and what is still unknown?"
      lede={`${confirmed} of 8 dimensions are confirmed in discovery, ${supported} are supported by discovery plus our measurement, and ${hypo} are our inference. Each card ends with the next question to ask the customer.`}
    >
      <div className="mc-bar">
        <Seg
          options={[
            { value: 'all' as Filter, label: 'All' },
            { value: 'Confirmed' as Filter, label: 'Confirmed' },
            { value: 'Supported' as Filter, label: 'Supported' },
            { value: 'Hypothesis' as Filter, label: 'Hypothesis' },
          ]}
          value={f}
          onChange={setF}
        />
        <button className="btn" onClick={download}>Download evidence.json</button>
      </div>

      <div className="mc-grid">
        {shown.map((m) => (
          <article key={m.code} className="mc-card">
            <div className="mc-card__top">
              <div>
                <div className="mc-code">{m.code}</div>
                <div className="mc-name">{m.name}</div>
              </div>
              <Pill tone={m.status === 'Confirmed' ? 'green' : m.status === 'Supported' ? 'navy' : 'amber'}>{m.status}</Pill>
            </div>
            <ul>{m.claim.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <div className="mc-src">Source: {m.source}</div>
            <div className="mc-next"><b>Next question</b>{m.next}</div>
          </article>
        ))}
      </div>

      <Card eyebrow="Stakeholders" title="Three user groups, three lanes">
        <div className="mc-stake">
          {stakeholders.map((s) => (
            <div key={s.group} className="mc-stake__i">
              <b>{s.group}</b>
              <span>{s.needs}</span>
              <em>{s.lane}</em>
            </div>
          ))}
        </div>
      </Card>

      <Card eyebrow="Rubric" title="How the lab scores each dimension">
        <div className="mc-rubric">
          {asList(rubric).map((r, i) => {
            const o: Any = typeof r === 'object' && r ? (r as Any) : { label: str(r) }
            return (
              <div key={i} className="mc-rubric__i">
                {first(o, ['score', 'value', 'level', 'points']) && <b>{first(o, ['score', 'value', 'level', 'points'])}</b>}
                {first(o, ['label', 'name', 'title'])}
                {first(o, ['text', 'note', 'description']) && (
                  <div style={{ color: 'var(--muted)' }}>{first(o, ['text', 'note', 'description'])}</div>
                )}
              </div>
            )
          })}
        </div>
        <p className="rp-explain" style={{ marginTop: 10 }}>{rubricNote}</p>
      </Card>

      <Card eyebrow="Limits" title="What this evidence cannot establish">
        <div className="mc-limits">
          {asList(limits).map((l, i) => {
            const o: Any = typeof l === 'object' && l ? (l as Any) : { text: str(l) }
            return (
              <div key={i}>
                <b>{first(o, ['title', 'label', 'name', 'topic', 'key'])}</b>
                {first(o, ['text', 'body', 'claim', 'detail', 'description', 'note'])}
              </div>
            )
          })}
        </div>
      </Card>

      <Band eyebrow="Owner and next decision" title={recommendation.owner}>
        {recommendation.nextDecision}
      </Band>
    </Page>
  )
}

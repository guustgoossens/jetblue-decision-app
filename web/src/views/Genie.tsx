import { useEffect, useRef, useState } from 'react'
import { data } from '../lib/data'
import { Page, Card, Note } from '../components/ui'
import '../styles/genie.css'

const EXAMPLES = [
  'Which region has the highest average blind risk?',
  'How many records were quarantined, by reason?',
  'Show the 10 highest-risk upcoming flight-hours with their features',
  'What is the disruption rate in validation by region?',
]
const TABLES = ['blind_scored', 'validation_scored', 'clean_features', 'quarantine', 'quality_findings', 'model_comparison', 'snapshot_audit']
const GENIE_URL = `https://emerging-emea-hackathons.cloud.databricks.com/genie/rooms/${data.meta.genieSpaceId}`

interface Reply { conversationId?: string; messageId?: string; text: string; sql?: string | null; columns: string[]; rows: unknown[][]; error?: string }
interface Turn { q: string; a?: Reply; failed?: string }

const permissionHint = (e: string) => /scope|permission|forbidden|unauthori|403|401|access/i.test(e)

export default function Genie() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [conv, setConv] = useState<string | undefined>()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [turns, busy])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setBusy(true)
    setTurns((t) => [...t, { q }])
    const set = (patch: Partial<Turn>) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, ...patch } : x)))
    try {
      const r = await fetch('/api/genie', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, conversationId: conv }),
      })
      const j = (await r.json()) as Reply
      if (j.conversationId) setConv(j.conversationId)
      set({ a: { ...j, columns: j.columns ?? [], rows: j.rows ?? [], text: j.text ?? '' } })
    } catch (e) {
      set({ failed: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      eyebrow="Data team · Genie"
      title="Ask Genie"
    >
      <div className="gn-layout">
        <Card eyebrow="Conversation" title={conv ? 'Conversation' : 'New question'}
          right={turns.length > 0 && <button className="btn" onClick={() => { setTurns([]); setConv(undefined) }}>New conversation</button>}>
          {turns.length === 0 && (
            <div className="gn-chips">
              {EXAMPLES.map((e) => <button key={e} className="gn-chip" onClick={() => ask(e)}>{e}</button>)}
            </div>
          )}
          <div className="gn-thread" aria-live="polite">
            {turns.map((t, i) => {
              const err = t.failed ?? t.a?.error
              const noAnswer = !!err && !t.a?.text && !t.a?.sql
              return (
                <div key={i} className="gn-turn">
                  <div className="gn-q">{t.q}</div>
                  {!t.a && !t.failed && <div className="gn-think"><i /><i /><i /><span>Genie is working</span></div>}
                  {t.a && t.a.text && <div className="gn-a">{t.a.text}</div>}
                  {t.a?.sql && <pre className="gn-sql mono">{t.a.sql}</pre>}
                  {t.a && t.a.columns.length > 0 && (
                    <div className="gn-scroll">
                      <table className="tbl">
                        <thead><tr>{t.a.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>{t.a.rows.map((r, ri) => (
                          <tr key={ri}>{r.map((v, ci) => <td key={ci} className="mono">{v == null ? '' : String(v)}</td>)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  {err && (
                    <div className={`gn-err ${noAnswer ? '' : 'gn-err--soft'}`}>
                      <b>{noAnswer ? 'Genie could not answer.' : 'Partial answer.'}</b> {err}
                      {permissionHint(err) && (
                        <p>The viewer must accept the app's Genie permission (user authorization scope) when opening the app. Until then, ask in Databricks directly.</p>
                      )}
                      <a className="btn" href={GENIE_URL} target="_blank" rel="noreferrer">Open in Databricks Genie</a>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
          <form className="gn-form" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
            <input className="gn-input" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={conv ? 'Ask a follow-up' : 'Ask about the repaired data'} aria-label="Question for Genie" disabled={busy} />
            <button className="btn btn--primary" type="submit" disabled={busy || !input.trim()}>Ask</button>
          </form>
          {turns.length > 0 && !busy && (
            <div className="gn-chips gn-chips--small">
              {EXAMPLES.map((e) => <button key={e} className="gn-chip" onClick={() => ask(e)}>{e}</button>)}
            </div>
          )}
        </Card>

        <div className="gn-side">
          <Card eyebrow="Tables" title={data.meta.schema}>
            <ul className="gn-tables">
              {TABLES.map((t) => <li key={t} className="mono">{t}</li>)}
            </ul>
            <Note>Genie reads these tables only. Blind outcomes are unknown.</Note>
          </Card>
          <Card eyebrow="Databricks" title="Open Genie space">
            <a className="btn" href={GENIE_URL} target="_blank" rel="noreferrer">Open in Databricks Genie</a>
          </Card>
        </div>
      </div>
    </Page>
  )
}

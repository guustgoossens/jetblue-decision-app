import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { data } from '../lib/data'
import { useApp, type Tenant } from '../lib/store'
import '../styles/genie.css'

const EXAMPLES: Record<Tenant, string[]> = {
  ops: [
    'Which region has the highest average blind risk?',
    'Show the 10 highest-risk upcoming flight-hours with their features',
    'How many blind flight-hours were rejected and why?',
  ],
  cio: [
    'What is the disruption rate in validation by region?',
    'Show the 10 highest-risk upcoming flight-hours with their features',
    'How does the champion model compare to the baseline?',
  ],
  data: [
    'How many records were quarantined, by reason?',
    'What is the disruption rate in validation by region?',
    'Which quality findings affected the most records?',
  ],
}
export const GENIE_URL = `https://emerging-emea-hackathons.cloud.databricks.com/genie/rooms/${data.meta.genieSpaceId}`
const permissionHint = (e: string) => /scope|permission|forbidden|unauthori|403|401|access/i.test(e)

export function GenieChat({ tenant, compact }: { tenant: Tenant; compact?: boolean }) {
  const turns = useApp((s) => s.genieTurns)
  const conv = useApp((s) => s.genieConv)
  const busy = useApp((s) => s.genieBusy)
  const ask = useApp((s) => s.genieAsk)
  const reset = useApp((s) => s.genieReset)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [turns, busy])
  const examples = EXAMPLES[tenant]
  const send = (q: string) => { setInput(''); void ask(q) }

  return (
    <div className={`gc ${compact ? 'gc--compact' : ''}`}>
      <div className="gc__thread" aria-live="polite">
        {turns.length === 0 && (
          <div className="gc__empty">
            <p className="gn-p">Ask about the repaired data in plain language. Genie reads the pilot tables only; blind outcomes are unknown.</p>
            <div className="gn-chips">{examples.map((e) => <button key={e} className="gn-chip" onClick={() => send(e)}>{e}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => {
          const err = t.failed ?? t.a?.error
          const noAnswer = !!err && !t.a?.text && !t.a?.sql
          return (
            <div key={i} className="gn-turn">
              <div className="gn-q">{t.q}</div>
              {!t.a && !t.failed && <div className="gn-think"><i /><i /><i /><span>Genie is working</span></div>}
              {t.a?.text && <div className="gn-a">{t.a.text}</div>}
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
                  {permissionHint(err) && <p>The viewer must accept the app's Genie permission (user authorization scope) when opening the app. Until then, ask in Databricks directly.</p>}
                  <a className="btn" href={GENIE_URL} target="_blank" rel="noreferrer">Open in Databricks Genie</a>
                </div>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {turns.length > 0 && !busy && (
        <div className="gn-chips gn-chips--small">{examples.map((e) => <button key={e} className="gn-chip" onClick={() => send(e)}>{e}</button>)}</div>
      )}
      <form className="gn-form" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input className="gn-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={conv ? 'Ask a follow-up' : 'Ask about the repaired data'} aria-label="Question for Genie" disabled={busy} />
        <button className="btn btn--primary" type="submit" disabled={busy || !input.trim()}>Ask</button>
      </form>
      {turns.length > 0 && <button type="button" className="gc__reset" onClick={reset}>New conversation</button>}
    </div>
  )
}

export default function GenieDock({ tenant }: { tenant: Tenant }) {
  const open = useApp((s) => s.genieOpen)
  const setOpen = useApp((s) => s.setGenieOpen)
  const { pathname } = useLocation()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])
  if (pathname === '/genie') return null
  return (
    <>
      {!open && (
        <button type="button" className="gdock__fab" onClick={() => setOpen(true)} aria-label="Ask Genie" title="Ask Genie">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 5h14v10H9l-4 4z" /><path d="M9 9.5h6M9 12h4" /></svg>
          <span>Ask Genie</span>
        </button>
      )}
      {open && (
        <aside className="gdock" role="dialog" aria-label="Ask Genie">
          <header className="gdock__head">
            <div><div className="eyebrow">Databricks Genie</div><div className="gdock__title">Ask Genie</div></div>
            <button type="button" className="gdock__x" onClick={() => setOpen(false)} aria-label="Close (Esc)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <GenieChat tenant={tenant} compact />
        </aside>
      )}
    </>
  )
}

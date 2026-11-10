import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { data } from '../lib/data'
import { useApp, LOGGED_CUTOFF, REGIONS, type Tenant } from '../lib/store'
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


interface Chip { label: string; ask?: string; go?: string }
interface Brief { lines: string[]; tag?: string; chips: Chip[] }
const MIN = 60000
const tms = (ts: string) => new Date(ts).getTime()
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

function opsStats() {
  const ts = data.queue.map((r) => tms(r.observedAt))
  const present = Math.max(...ts) - 30 * MIN
  const inWin = data.queue.filter((r) => { const t = tms(r.observedAt); return t >= present && t <= present + 30 * MIN })
  const flagged = inWin.filter((r) => r.risk >= LOGGED_CUTOFF)
  const manual = data.lineage.rejected.filter((x) => x.split === 'blind' && x.observedAt && tms(x.observedAt) >= present && tms(x.observedAt) <= present + 30 * MIN)
  const top = [...inWin].sort((a, b) => b.risk - a.risk)[0]
  return { inWin, flagged, manual, top }
}

function briefing(tenant: Tenant): Brief {
  if (tenant === 'ops') {
    const { inWin, flagged, manual, top } = opsStats()
    const topTxt = top ? ` Highest risk: ${top.id} at ${pct(top.risk)}${top.x2 >= 0.7 ? ', severe weather' : ''}.` : ''
    return {
      lines: [`Good morning. In the next 30 minutes: ${inWin.length} flight-hours due, ${flagged.length} above the ${Math.round(LOGGED_CUTOFF * 100)}% cut-off, ${manual.length} need a manual check.${topTxt}`],
      chips: [{ label: 'Show flagged', ask: 'risk above 50' }, { label: 'Manual checks', ask: 'manual checks' }, { label: 'Severe weather', ask: 'show severe weather' }],
    }
  }
  if (tenant === 'cio') {
    const blind = data.lineage.rejected.filter((x) => x.split === 'blind').length
    const cost = useApp.getState().assumptions.disruptionCost
    const exp = data.queue.reduce((a, r) => a + r.risk, 0) * cost
    return {
      lines: [`Good morning. The blind set holds ${data.queue.length} scored flight-hours, ${blind} more rejected for data quality.`, `Expected disruption cost of the blind set: ${money(exp)} (sum of risk x ${money(cost)} per disruption).`],
      tag: 'Scenario', chips: [{ label: 'Open impact', go: '/impact' }, { label: 'Champion vs baseline', ask: 'How does the champion model compare to the baseline?' }],
    }
  }
  const f = data.funnel
  const reasons = f.reasons.filter((r) => r.count > 0).map((r) => `${r.label} ${r.count}`).join(', ')
  return {
    lines: [`Good morning. ${f.eligible.toLocaleString('en-US')} of ${f.expected.toLocaleString('en-US')} flight-hours are usable.`, `${f.quarantined} quarantined${reasons ? `: ${reasons}` : ''}.`],
    chips: [{ label: 'Quarantine by reason', ask: 'How many records were quarantined, by reason?' }, { label: 'Open data quality', go: '/repair' }],
  }
}

/** Tiny local intent parser: returns a reply when it drives the Ops UI, else null. */
function parseIntent(q: string): string | null {
  const t = q.toLowerCase()
  const st = useApp.getState() as unknown as { setOpsFilters?: (p: Record<string, unknown>) => void; resetOpsFilters?: () => void }
  if (!st.setOpsFilters || !st.resetOpsFilters) return null
  if (/reset (the )?filters|clear filters/.test(t)) { st.resetOpsFilters(); return 'Applied: filters reset.' }
  const p: Record<string, unknown> = {}
  const parts: string[] = []
  const reg = REGIONS.find((r) => new RegExp(`\\b${r}\\b`).test(t))
  if (reg && /(only|show|region|filter|just)/.test(t) && !/\?$/.test(t.trim())) { p.region = reg; parts.push(`Region ${reg}`) }
  const m = t.match(/risk\s*(?:above|over|>=?|at least|higher than)\s*(\d+(?:\.\d+)?)/)
  if (m) { const v = Number(m[1]); p.minRisk = v > 1 ? v / 100 : v; parts.push(`risk >= ${Math.round(v > 1 ? v : v * 100)}%`) }
  if (/severe weather|\bsevere\b/.test(t)) { p.severe = true; parts.push('severe weather') }
  if (/short buffer/.test(t)) { p.shortBuffer = true; parts.push('short buffer') }
  if (/manual check/.test(t)) { p.manual = true; p.flaggedOnly = false; parts.push('manual checks') }
  if (!parts.length) return null
  st.setOpsFilters(p)
  return `Applied: ${parts.join(', ')}.`
}

function BarChart({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  if (columns.length !== 2 || rows.length < 1 || rows.length > 20) return null
  const data2 = rows.map((r) => ({ k: String(r[0] ?? ''), v: Number(r[1]) }))
  if (data2.some((d) => !Number.isFinite(d.v) || r0num(rows))) return null
  const max = Math.max(...data2.map((d) => d.v), 1e-9)
  const H = 22, W = 560, L = 150
  return (
    <svg className="gn-bars" viewBox={`0 0 ${W} ${data2.length * H + 4}`} role="img" aria-label={`${columns[1]} by ${columns[0]}`}>
      {data2.map((d, i) => (
        <g key={i} transform={`translate(0 ${i * H + 2})`}>
          <text x={L - 8} y={14} textAnchor="end" fontSize="11" fill="currentColor">{d.k.length > 22 ? d.k.slice(0, 21) + '…' : d.k}</text>
          <rect x={L} y={3} width={Math.max(1, (d.v / max) * (W - L - 70))} height={14} rx={3} fill="#17343d" />
          <text x={L + Math.max(1, (d.v / max) * (W - L - 70)) + 6} y={14} fontSize="11" className="mono" fill="currentColor">{Number.isInteger(d.v) ? d.v.toLocaleString('en-US') : d.v.toFixed(3)}</text>
        </g>
      ))}
    </svg>
  )
}
const r0num = (rows: unknown[][]) => rows.every((r) => r[0] != null && r[0] !== '' && Number.isFinite(Number(r[0])))

export function GenieChat({ tenant, compact, hideForm }: { tenant: Tenant; compact?: boolean; hideForm?: boolean }) {
  const turns = useApp((s) => s.genieTurns)
  const conv = useApp((s) => s.genieConv)
  const busy = useApp((s) => s.genieBusy)
  const ask = useApp((s) => s.genieAsk)
  const reset = useApp((s) => s.genieReset)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const examples = EXAMPLES[tenant]
  const navigate = useNavigate()
  const [local, setLocal] = useState<{ q: string; a: string }[]>([])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [turns, busy, local])
  const brief = useMemo(() => briefing(tenant), [tenant])
  const send = (q: string) => {
    setInput('')
    const applied = parseIntent(q)
    if (applied) { navigate('/ops'); setLocal((l) => [...l, { q, a: applied }]); return }
    void ask(q)
  }
  const run = (c: Chip) => { if (c.ask) send(c.ask); else if (c.go) { navigate(c.go) } }

  return (
    <div className={`gc ${compact ? 'gc--compact' : ''}`}>
      <div className="gc__thread" aria-live="polite">
        <div className="gn-brief">
          {brief.lines.map((l, i) => <p key={i} className="gn-a">{l}</p>)}
          {brief.tag && <span className="gn-tag">{brief.tag}</span>}
          <div className="gn-chips gn-chips--small">{brief.chips.map((c) => <button key={c.label} className="gn-chip gn-chip--act" onClick={() => run(c)}>{c.label}</button>)}</div>
        </div>
        {turns.length === 0 && local.length === 0 && (
          <div className="gc__empty">
            <p className="gn-p">Ask about the repaired data in plain language. Genie reads the pilot tables only; blind outcomes are unknown.</p>
            <div className="gn-chips">{examples.map((e) => <button key={e} className="gn-chip" onClick={() => send(e)}>{e}</button>)}</div>
          </div>
        )}
        {local.map((t, i) => <div key={'l' + i} className="gn-turn"><div className="gn-q">{t.q}</div><div className="gn-a">{t.a}</div></div>)}
        {turns.map((t, i) => {
          const err = t.failed ?? t.a?.error
          const noAnswer = !!err && !t.a?.text && !t.a?.sql
          return (
            <div key={i} className="gn-turn">
              <div className="gn-q">{t.q}</div>
              {!t.a && !t.failed && <div className="gn-think"><i /><i /><i /><span>Genie is working</span></div>}
              {t.a?.text && <div className="gn-a">{t.a.text}</div>}
              {t.a?.sql && <pre className="gn-sql mono">{t.a.sql}</pre>}
              {tenant === 'data' && t.a && <BarChart columns={t.a.columns} rows={t.a.rows} />}
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
      {!hideForm && <form className="gn-form" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input className="gn-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={conv ? 'Ask a follow-up' : 'Ask about the repaired data'} aria-label="Question for Genie" disabled={busy} />
        <button className="btn btn--primary" type="submit" disabled={busy || !input.trim()}>Ask</button>
      </form>}
      {turns.length > 0 && <button type="button" className="gc__reset" onClick={reset}>New conversation</button>}
    </div>
  )
}

export default function GenieDock({ tenant }: { tenant: Tenant }) {
  const open = useApp((s) => s.genieOpen)
  const setOpen = useApp((s) => s.setGenieOpen)
  const busy = useApp((s) => s.genieBusy)
  const ask = useApp((s) => s.genieAsk)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const [input, setInput] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setDismissed(false); setOpen(!useApp.getState().genieOpen) }
      else if (e.key === 'Escape' && useApp.getState().genieOpen) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  if (pathname === '/genie') return null
  if (dismissed) return (
    <div className="gisle-wrap"><button type="button" className="gisle__tab" onClick={() => setDismissed(false)}>Genie</button></div>
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    const applied = parseIntent(q)
    if (applied) { navigate('/ops'); setReply(applied); setOpen(true); return }
    setReply(null); setOpen(true); void ask(q)
  }
  const placeholder = tenant === 'ops' ? 'Ask Genie about the next 30 minutes' : tenant === 'cio' ? 'Ask Genie about the expected disruption cost' : 'Ask Genie about the repaired data'
  return (
    <div className="gisle-wrap">
      <section className={`gisle ${open ? 'is-open' : ''}`} aria-label="Ask Genie">
        {open && (
          <div className="gisle__body">
            <GenieChat tenant={tenant} compact hideForm />
            {reply && <div className="gn-a gisle__reply">{reply}</div>}
          </div>
        )}
        <form className="gisle__bar" onSubmit={submit}>
          <span className="gisle__mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>
          </span>
          <input className="gisle__input" value={input} onChange={(e) => setInput(e.target.value)} onFocus={() => undefined} placeholder={placeholder} aria-label="Question for Genie" disabled={busy} />
          <button className="gisle__btn gisle__send" type="submit" disabled={busy || !input.trim()} aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>
          <button className="gisle__btn" type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse (Ctrl/Cmd+J)' : 'Expand (Ctrl/Cmd+J)'} aria-expanded={open} title="Ctrl/Cmd+J">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none' }}><path d="m6 15 6-6 6 6" /></svg>
          </button>
          <button className="gisle__btn" type="button" onClick={() => { setOpen(false); setDismissed(true) }} aria-label="Dismiss Genie" title="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </form>
      </section>
    </div>
  )
}

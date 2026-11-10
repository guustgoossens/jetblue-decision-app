import { useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { data } from '../lib/data'
import { useApp, type GenieTurn, type Tenant } from '../lib/store'
import '../styles/genie.css'

export const GENIE_URL = `https://emerging-emea-hackathons.cloud.databricks.com/genie/rooms/${data.meta.genieSpaceId}`
const permissionHint = (e: string) => /scope|permission|forbidden|unauthori|403|401|access/i.test(e)

export const STARTERS: Record<Tenant, { title: string; q: string }[]> = {
  ops: [
    { title: 'Highest-risk region', q: 'Which region has the highest average blind risk?' },
    { title: 'Riskiest flight-hours', q: 'Show the 10 highest-risk upcoming flight-hours with their features' },
    { title: 'Rejected blind hours', q: 'How many blind flight-hours were rejected and why?' },
  ],
  cio: [
    { title: 'Shareholder value', q: 'What is the expected shareholder value of acting on the model flags?' },
    { title: 'Disruption cost by region', q: 'What is the expected disruption cost by region?' },
    { title: 'Value of the top 25', q: 'What is the value of acting on the top 25 riskiest flight-hours?' },
    { title: 'Break-even risk', q: 'At what risk level does an intervention break even?' },
  ],
  data: [
    { title: 'Quarantined by reason', q: 'How many records were quarantined, by reason?' },
    { title: 'Repairs applied', q: 'Which repairs were applied and how many records did each affect?' },
    { title: 'Validation disruption by region', q: 'What is the disruption rate in validation by region?' },
    { title: 'Riskiest upcoming hours', q: 'Show the 10 highest-risk upcoming flight-hours with their features' },
  ],
}

/* ---------- loading ---------- */
export function PlaneLoader() {
  const dots: ReactNode[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 48; c++) {
    const land = Math.sin(c * 0.5 + r * 1.3) + Math.sin(c * 0.23 - r) > 0.2
    if (land) dots.push(<circle key={`${r}-${c}`} cx={c * 10 + 5 + (r % 2) * 3} cy={r * 10 + 8} r={1.7} />)
  }
  return (
    <div className="gl" role="status" aria-label="Genie is checking the tables">
      <div className="gl__stage">
        <svg className="gl__map" viewBox="0 0 960 58" preserveAspectRatio="none" aria-hidden>
          <g className="gl__band">{dots}<g transform="translate(480 0)">{dots}</g></g>
        </svg>
        <svg className="gl__plane" width="30" height="30" viewBox="0 0 24 24" aria-hidden><path fill="#17343d" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" transform="rotate(90 12 12)" /></svg>
      </div>
      <span className="gl__txt">Genie is checking the tables…</span>
    </div>
  )
}

/* ---------- charts ---------- */
const isNum = (v: unknown) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v))
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(2))
const timeLike = (name: string, vals: string[]) => /date|time|hour|day|month|week|year|\bts\b|_at$/i.test(name) || vals.every((v) => /^\d{4}-\d{2}/.test(v))

interface Plot { kind: 'bar' | 'line'; labels: string[]; series: { name: string; vals: number[] }[] }
function plotOf(columns: string[], rows: unknown[][]): Plot | null {
  if (columns.length < 2 || rows.length < 1 || rows.length > 30) return null
  const labels = rows.map((r) => String(r[0] ?? ''))
  if (rows.every((r) => isNum(r[0])) && !timeLike(columns[0], labels)) return null
  const series: Plot['series'] = []
  for (let c = 1; c < columns.length; c++) if (rows.every((r) => isNum(r[c]))) series.push({ name: columns[c], vals: rows.map((r) => Number(r[c])) })
  if (!series.length) return null
  return { kind: timeLike(columns[0], labels) && rows.length > 1 ? 'line' : 'bar', labels, series }
}

function Chart({ plot, big, onOpen }: { plot: Plot; big?: boolean; onOpen?: () => void }) {
  const [si, setSi] = useState(0)
  const [hi, setHi] = useState<number | null>(null)
  const s = plot.series[Math.min(si, plot.series.length - 1)]
  const n = s.vals.length
  const max = Math.max(...s.vals, 1e-9), min = Math.min(...s.vals, 0)
  const W = big ? 880 : 640
  const H = plot.kind === 'bar' ? n * (big ? 30 : 22) + 6 : big ? 360 : 160
  const rowH = (H - 6) / n
  const L = plot.kind === 'bar' ? (big ? 190 : 150) : 40
  const x = (i: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - 20))
  const y = (v: number) => 10 + (1 - (v - min) / (max - min || 1)) * (H - 24)
  return (
    <div className={`gch ${big ? 'gch--big' : ''}`}>
      {plot.series.length > 1 && (
        <div className="gch__tabs">{plot.series.map((x2, i) => <button key={x2.name} type="button" className={i === si ? 'is-on' : ''} onClick={(e) => { e.stopPropagation(); setSi(i) }}>{x2.name}</button>)}</div>
      )}
      <div className="gch__wrap" onClick={onOpen} style={{ cursor: onOpen ? 'zoom-in' : undefined }} title={onOpen ? 'Click to enlarge' : undefined}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.name} by category`} onMouseLeave={() => setHi(null)}>
          {plot.kind === 'bar' ? s.vals.map((v, i) => {
            const bw = Math.max(1, (v / max) * (W - L - 80))
            const lab = plot.labels[i]
            return (
              <g key={i} transform={`translate(0 ${i * rowH + 3})`} onMouseEnter={() => setHi(i)} className={hi === i ? 'is-hi' : ''}>
                <rect x={0} y={0} width={W} height={rowH} fill="transparent" />
                <text x={L - 8} y={rowH / 2 + 4} textAnchor="end" fontSize={big ? 12 : 11} fill="currentColor">{lab.length > 24 ? lab.slice(0, 23) + '…' : lab}</text>
                <rect className="gch__bar" x={L} y={rowH / 2 - 7} width={bw} height={14} rx={3} />
                <text x={L + bw + 6} y={rowH / 2 + 4} fontSize={big ? 12 : 11} className="mono" fill="currentColor">{fmt(v)}</text>
              </g>
            )
          }) : (
            <>
              <path className="gch__line" d={s.vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')} fill="none" />
              <text x={0} y={y(max) + 4} fontSize="10" className="mono" fill="currentColor">{fmt(max)}</text>
              <text x={0} y={y(min) + 4} fontSize="10" className="mono" fill="currentColor">{fmt(min)}</text>
              {s.vals.map((v, i) => (
                <g key={i} onMouseEnter={() => setHi(i)}>
                  <circle cx={x(i)} cy={y(v)} r={12} fill="transparent" />
                  <circle cx={x(i)} cy={y(v)} r={hi === i ? 5 : 2.6} className={hi === i ? 'gch__dot is-hi' : 'gch__dot'} />
                </g>
              ))}
            </>
          )}
        </svg>
        {hi !== null && <div className="gch__tip mono">{plot.labels[hi]}: {fmt(s.vals[hi])}</div>}
      </div>
    </div>
  )
}

function ChartModal({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])
  return (
    <div className="gch-modal" role="dialog" aria-modal="true" aria-label="Chart" onClick={onClose}>
      <div className="gch-modal__card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="gch-modal__x" onClick={onClose} aria-label="Close (Esc)">Esc</button>
        <Chart plot={plot} big />
      </div>
    </div>
  )
}

function ResultTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  return (
    <div className="gn-scroll">
      <table className="tbl">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((v, ci) => <td key={ci} className="mono">{v == null ? '' : String(v)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Result({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(false)
  if (!columns.length) return null
  const plot = plotOf(columns, rows)
  if (!plot) return <ResultTable columns={columns} rows={rows} />
  return (
    <div className="gn-result">
      <Chart plot={plot} onOpen={() => setModal(true)} />
      <button type="button" className="gn-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide table' : `Show table (${rows.length} rows)`}</button>
      {open && <ResultTable columns={columns} rows={rows} />}
      {modal && <ChartModal plot={plot} onClose={() => setModal(false)} />}
    </div>
  )
}

/* ---------- messages ---------- */
export function GenieMark() {
  return <span className="gn-mark" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg></span>
}
export function Markdown({ text }: { text: string }) {
  return <div className="gn-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
}
export function GenieText({ children }: { children: string }) {
  return <div className="gn-msg"><GenieMark /><Markdown text={children} /></div>
}

export function GenieTurnView({ turn, tenant }: { turn: GenieTurn; tenant: Tenant }) {
  const t = turn
  const err = t.failed ?? t.a?.error
  const noAnswer = !!err && !t.a?.text && !t.a?.sql
  return (
    <div className="gn-turn">
      <div className="gn-q">{t.q}</div>
      {!t.a && !t.failed && <PlaneLoader />}
      {t.a?.text && <GenieText>{t.a.text}</GenieText>}
      {t.a && <div className="gn-body"><Result columns={t.a.columns} rows={t.a.rows} /></div>}
      {tenant === 'data' && t.a?.sql && (
        <details className="gn-sqlbox"><summary>View query</summary><pre className="gn-sql mono">{t.a.sql}</pre></details>
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
}

/* ---------- chat ---------- */
export interface GenieChatProps {
  tenant: Tenant
  variant?: 'page' | 'dock'
  header?: ReactNode
  local?: { q: string; a: string }[]
  onSend?: (q: string) => void
  hideForm?: boolean
}

export default function GenieChat({ tenant, variant = 'page', header, local = [], onSend, hideForm }: GenieChatProps) {
  const turns = useApp((s) => s.genieTurns)
  const conv = useApp((s) => s.genieConv)
  const busy = useApp((s) => s.genieBusy)
  const ask = useApp((s) => s.genieAsk)
  const reset = useApp((s) => s.genieReset)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const page = variant === 'page'
  const empty = turns.length === 0 && local.length === 0
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [turns, busy, local.length])
  const send = (q: string) => {
    const v = q.trim()
    if (!v || busy) return
    setInput('')
    if (onSend) onSend(v); else void ask(v)
  }
  const starters = STARTERS[tenant]
  return (
    <div className={`gc ${page ? 'gc--page' : 'gc--compact'}`}>
      <div className="gc__thread" aria-live="polite">
        {header}
        {page && empty && (
          <div className="gc__hero">
            <span className="gc__heroMark"><GenieMark /></span>
            <h2>What would you like to know?</h2>
            <p>Genie reads the pilot tables only. Blind outcomes are unknown.</p>
            <div className="gc__cards">
              {starters.map((s) => <button key={s.title} type="button" className="gc__card" onClick={() => send(s.q)}><b>{s.title}</b><span>{s.q}</span></button>)}
            </div>
          </div>
        )}
        {!page && empty && (
          <div className="gc__empty">
            <div className="gn-chips">{starters.map((s) => <button key={s.title} className="gn-chip" onClick={() => send(s.q)}>{s.q}</button>)}</div>
          </div>
        )}
        {local.map((t, i) => <div key={'l' + i} className="gn-turn"><div className="gn-q">{t.q}</div><GenieText>{t.a}</GenieText></div>)}
        {turns.map((t, i) => <GenieTurnView key={i} turn={t} tenant={tenant} />)}
        <div ref={endRef} />
      </div>
      {!page && turns.length > 0 && !busy && (
        <div className="gn-chips gn-chips--small">{starters.slice(0, 3).map((s) => <button key={s.title} className="gn-chip" onClick={() => send(s.q)}>{s.q}</button>)}</div>
      )}
      {page && !hideForm && (
        <div className="gc__composerWrap">
          <form className="gc__composer" onSubmit={(e) => { e.preventDefault(); send(input) }}>
            <input className="gc__input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={conv ? 'Ask a follow-up' : 'Ask Genie about the repaired data'} aria-label="Question for Genie" disabled={busy} />
            <button className="gc__send" type="submit" disabled={busy || !input.trim()} aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>
          </form>
          {turns.length > 0 && <button type="button" className="gc__reset" onClick={reset}>New conversation</button>}
        </div>
      )}
      {!page && turns.length > 0 && <button type="button" className="gc__reset" onClick={reset}>New conversation</button>}
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store'
import { data } from './lib/data'
import Verdict from './views/Verdict'
import Ops from './views/Ops'
import Impact from './views/Impact'
import Genie from './views/Genie'
import Diagnosis from './views/Diagnosis'
import Meddpicc from './views/Meddpicc'
import Repair from './views/Repair'
import Models from './views/Models'

const ic = (d: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
)
const ICONS = {
  verdict: ic(<><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></>),
  queue: ic(<><path d="M4 6h16M4 12h11M4 18h7" /></>),
  cutoff: ic(<><path d="M4 12h16" /><circle cx="9" cy="12" r="2.4" fill="var(--card)" /><path d="M4 6h16M4 18h16" opacity=".4" /></>),
  diagnosis: ic(<><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>),
  meddpicc: ic(<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  repair: ic(<><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" /></>),
  models: ic(<><path d="M4 20V4M4 20h16" /><path d="m7 15 4-5 3 3 5-7" /></>),
  genie: ic(<><path d="M5 5h14v10H9l-4 4z" /><path d="M9 9.5h6M9 12h4" /></>),
}

const NAV: { heading?: string; items: { to: string; label: string; icon: ReactNode; end?: boolean }[] }[] = [
  { heading: 'Decide', items: [
    { to: '/', label: 'CIO verdict', icon: ICONS.verdict, end: true },
    { to: '/ops', label: 'Ops desk', icon: ICONS.queue },
    { to: '/impact', label: 'Impact & cut-off', icon: ICONS.cutoff },
  ] },
  { heading: 'The case', items: [
    { to: '/diagnosis', label: 'Diagnosis', icon: ICONS.diagnosis },
    { to: '/meddpicc', label: 'MEDDPICC', icon: ICONS.meddpicc },
  ] },
  { heading: 'Trust', items: [
    { to: '/repair', label: 'Signal repair', icon: ICONS.repair },
    { to: '/models', label: 'Model evidence', icon: ICONS.models },
    { to: '/genie', label: 'Ask Genie', icon: ICONS.genie },
  ] },
]
const PAGE_NAMES: Record<string, string> = {
  '/': 'CIO verdict', '/ops': 'Ops desk', '/impact': 'Impact & cut-off', '/diagnosis': 'Diagnosis',
  '/meddpicc': 'MEDDPICC', '/repair': 'Signal repair', '/models': 'Model evidence', '/genie': 'Ask Genie',
}

export default function App() {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const server = useApp((s) => s.server)
  const setServer = useApp((s) => s.setServer)

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    let live = true
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setServer(j && j.status === 'ok' ? 'online' : 'browser') })
      .catch(() => { if (live) setServer('browser') })
    return () => { live = false }
  }, [setServer])

  const validationN = data.validation.length
  const statusText = server === 'online' ? 'Champion model online' : server === 'browser' ? 'Scoring in browser' : 'Checking server'

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="side">
        <div className="side__brand">
          <span className="side__mark" aria-hidden><i /></span>
          <span className="side__name">Decision Lab</span>
        </div>
        <nav className="side__nav">
          {NAV.map((g, gi) => (
            <div className="side__group" key={gi}>
              {g.heading && <div className="side__heading">{g.heading}</div>}
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} title={it.label} className={({ isActive }) => `side__link ${isActive ? 'is-active' : ''}`}>
                  {it.icon}
                  <span className="side__label">{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side__foot">
          <span className="side__team">Databricked · Team 12</span>
          <button type="button" className="side__toggle" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" />
            </svg>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumb"><span>JetBlue Disruption Lab</span><span className="crumb__sep">/</span><strong>{PAGE_NAMES[pathname] ?? ''}</strong></div>
          <div className="topbar__right">
            <span className="topbar__meta">Validation · {validationN} flight-hours</span>
            <span className={`status status--${server}`}><i />{statusText}</span>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Verdict />} />
            <Route path="/ops" element={<Ops />} />
            <Route path="/impact" element={<Impact />} />
            <Route path="/genie" element={<Genie />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/meddpicc" element={<Meddpicc />} />
            <Route path="/repair" element={<Repair />} />
            <Route path="/models" element={<Models />} />
            <Route path="*" element={<Verdict />} />
          </Routes>
        </main>
        <footer className="footer">X-HEC classroom project. Synthetic data on a fictionalized case. Not affiliated with or endorsed by JetBlue.</footer>
      </div>
    </div>
  )
}

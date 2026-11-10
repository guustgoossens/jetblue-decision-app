import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useApp, type Tenant } from './lib/store'
import { data } from './lib/data'
import Verdict from './views/Verdict'
import Ops from './views/Ops'
import Impact from './views/Impact'
import Genie from './views/Genie'
import GenieDock from './components/GenieDock'
import Meddpicc from './views/Meddpicc'
import Repair from './views/Repair'
import Models from './views/Models'
import Experiment from './views/Experiment'
import Welcome, { TENANTS } from './views/Welcome'

const ic = (d: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
)
const ICONS = {
  verdict: ic(<><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></>),
  queue: ic(<><path d="M4 6h16M4 12h11M4 18h7" /></>),
  cutoff: ic(<><path d="M4 12h16" /><circle cx="9" cy="12" r="2.4" fill="var(--card)" /><path d="M4 6h16M4 18h16" opacity=".4" /></>),
  meddpicc: ic(<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  repair: ic(<><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" /></>),
  models: ic(<><path d="M4 20V4M4 20h16" /><path d="m7 15 4-5 3 3 5-7" /></>),
  experiment: ic(<><path d="M9.5 4h5M10.5 4v5.5L5 19a1.2 1.2 0 0 0 1 1.8h12a1.2 1.2 0 0 0 1-1.8l-5.5-9.5V4" /><path d="M7.5 15h9" /></>),
  genie: ic(<><path d="M5 5h14v10H9l-4 4z" /><path d="M9 9.5h6M9 12h4" /></>),
}

const TENANT_ICONS: Record<Tenant, ReactNode> = {
  ops: ICONS.queue,
  cio: ic(<><path d="M12 3v18M16.5 7.5C16 6 14.3 5 12 5S8 6.2 8 8s1.7 2.5 4 3 4 1.2 4 3-1.8 3-4 3-4-1-4.5-2.5" /></>),
  data: ICONS.models,
}
type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean }
const NAV_BY_TENANT: Record<Tenant, NavItem[]> = {
  ops: [{ to: '/ops', label: 'Ops desk', icon: ICONS.queue }],
  cio: [
    { to: '/ask', label: 'Ask Genie', icon: ICONS.genie },
    { to: '/cio', label: 'Summary', icon: ICONS.verdict },
    { to: '/impact', label: 'Impact', icon: ICONS.cutoff },
  ],
  data: [
    { to: '/ask', label: 'Ask Genie', icon: ICONS.genie },
    { to: '/repair', label: 'Data quality', icon: ICONS.repair },
    { to: '/models', label: 'Model evidence', icon: ICONS.models },
  ],
}
const PILOT_FILE: NavItem[] = [
  { to: '/meddpicc', label: 'MEDDPICC', icon: ICONS.meddpicc },
  { to: '/experiment', label: 'Experiment', icon: ICONS.experiment },
]
const PAGE_NAMES: Record<string, string> = {
  '/cio': 'Summary', '/ops': 'Ops desk', '/impact': 'Impact',
  '/meddpicc': 'MEDDPICC', '/experiment': 'Experiment', '/repair': 'Data quality', '/models': 'Model evidence', '/genie': 'Ask Genie', '/ask': 'Ask Genie',
}

export default function App() {
  const tenant = useApp((s) => s.tenant)
  if (!tenant) return <Welcome />
  return <Shell tenant={tenant} />
}

function Shell({ tenant }: { tenant: Tenant }) {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pilotOpen, setPilotOpen] = useState(false)
  const [tenantOpen, setTenantOpen] = useState(false)
  const setTenant = useApp((s) => s.setTenant)
  const navigate = useNavigate()
  const info = TENANTS.find((t) => t.id === tenant)!
  const pilotActive = PILOT_FILE.some((i) => i.to === pathname)
  const server = useApp((s) => s.server)
  const setServer = useApp((s) => s.setServer)

  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false); setTenantOpen(false) }, [pathname])
  useEffect(() => {
    if (!tenantOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTenantOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tenantOpen])
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
    <div className={`shell ${collapsed ? 'is-collapsed' : ''} ${menuOpen ? 'is-menu' : ''}`}>
      <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />
      <aside className="side">
        <div className="side__brand">
          <span className="side__mark" aria-hidden><i /></span>
          <span className="side__name">Disruption Desk</span>
        </div>
        <nav className="side__nav">
          <div className="side__group">
            <div className="side__heading">{info.name}</div>
            {NAV_BY_TENANT[tenant].map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} title={it.label} className={({ isActive }) => `side__link ${isActive ? 'is-active' : ''}`}>
                {it.icon}
                <span className="side__label">{it.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="side__group">
            <button type="button" className="side__heading side__heading--btn" aria-expanded={pilotOpen || pilotActive} onClick={() => setPilotOpen((o) => !o)}>
              <span>Pilot file</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={pilotOpen || pilotActive ? 'is-open' : ''}><path d="m3 2 3 3-3 3" /></svg>
            </button>
            {(pilotOpen || pilotActive) && PILOT_FILE.map((it) => (
              <NavLink key={it.to} to={it.to} title={it.label} className={({ isActive }) => `side__link ${isActive ? 'is-active' : ''}`}>
                {it.icon}
                <span className="side__label">{it.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="side__foot">
          <span className="side__team">Team 12 · X-HEC lab</span>
          <button type="button" className="side__toggle" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand' : 'Collapse'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" />
            </svg>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="crumb"><span>{info.name}</span><span className="crumb__sep">/</span><strong>{PAGE_NAMES[pathname] ?? ''}</strong></div>
          <div className="topbar__right">
            <div className="tenant">
              <button type="button" className="tenant__btn" aria-haspopup="menu" aria-expanded={tenantOpen} onClick={() => setTenantOpen((o) => !o)}>
                <span className="tenant__dot" aria-hidden />{info.name}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2 3.5 3 3 3-3" /></svg>
              </button>
              {tenantOpen && (
                <>
                  <div className="tenant__scrim" onClick={() => setTenantOpen(false)} aria-hidden />
                  <div className="tenant__menu" role="menu">
                    {TENANTS.map((t) => (
                      <button key={t.id} type="button" role="menuitemradio" aria-checked={t.id === tenant} className={`tenant__item ${t.id === tenant ? 'is-on' : ''}`}
                        onClick={() => { setTenant(t.id); setTenantOpen(false); navigate(t.home) }}>
                        <span className="tenant__ico" aria-hidden>{TENANT_ICONS[t.id]}</span>
                        <span className="tenant__txt">{t.name}<small>{t.blurb}</small></span>
                        {t.id === tenant && <svg className="tenant__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7" /></svg>}
                      </button>
                    ))}
                    <div className="tenant__sep" role="separator" />
                    <button type="button" role="menuitem" className="tenant__item tenant__item--out" onClick={() => { setTenant(null); navigate('/') }}>
                      <span className="tenant__ico" aria-hidden>{ic(<><path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" /></>)}</span>
                      <span className="tenant__txt">Sign out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="topbar__meta">Validation · {validationN} flight-hours</span>
            <span className={`status status--${server}`}><i />{statusText}</span>
          </div>
        </header>
        <main className={`content ${pathname === '/ask' ? 'content--chat' : ''}`}>
          <Routes>
            <Route path="/" element={<Navigate to={info.home} replace />} />
            <Route path="/cio" element={<Verdict />} />
            <Route path="/ops" element={<Ops />} />
            <Route path="/impact" element={<Impact />} />
            <Route path="/genie" element={<Navigate to="/ask" replace />} />
            <Route path="/ask" element={<Genie />} />
            <Route path="/meddpicc" element={<Meddpicc />} />
            <Route path="/experiment" element={<Experiment />} />
            <Route path="/repair" element={<Repair />} />
            <Route path="/models" element={<Models />} />
            <Route path="*" element={<Navigate to={info.home} replace />} />
          </Routes>
        </main>
        {tenant === 'ops' && <GenieDock tenant={tenant} />}
        <footer className="footer">X-HEC classroom project. Synthetic data on a fictionalized case. Not affiliated with or endorsed by JetBlue.</footer>
      </div>
    </div>
  )
}

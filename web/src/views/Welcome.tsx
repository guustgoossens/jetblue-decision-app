import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, type Tenant } from '../lib/store'
import '../styles/welcome.css'

export const TENANTS: { id: Tenant; name: string; role: string; blurb: string; home: string }[] = [
  { id: 'ops', name: 'Operations', role: 'Duty manager', blurb: 'Next-30-minute risk queue and interventions.', home: '/ops' },
  { id: 'cio', name: 'CIO', role: 'Leadership', blurb: 'Pilot summary, impact and the go / no-go gate.', home: '/ask' },
  { id: 'data', name: 'VP of Data', role: 'Data leadership', blurb: 'Data quality, quarantined and repaired flight-hours, model registry.', home: '/ask' },
]
const PILOT = [
  { to: '/meddpicc', label: 'MEDDPICC' },
  { to: '/experiment', label: 'Experiment' },
]

export default function Welcome() {
  const setTenant = useApp((s) => s.setTenant)
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const choose = (i: number) => { setTenant(TENANTS[i].id); navigate(TENANTS[i].home, { replace: true }) }
  const openPilot = (to: string) => { setTenant('cio'); navigate(to, { replace: true }) }
  const focus = (i: number) => { const n = (i + TENANTS.length) % TENANTS.length; setIdx(n); refs.current[n]?.focus() }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key >= '1' && e.key <= '3') { e.preventDefault(); choose(Number(e.key) - 1) }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focus(idx + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focus(idx - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <div className="welcome__brand"><span className="side__mark" aria-hidden><i /></span><span>Disruption Desk</span></div>
        <h1 className="welcome__title">Who are you working as?</h1>
        <div className="welcome__cards" role="radiogroup" aria-label="Choose your workspace">
          {TENANTS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el }}
              type="button"
              role="radio"
              aria-checked={idx === i}
              tabIndex={idx === i ? 0 : -1}
              className={`wcard ${idx === i ? 'is-sel' : ''}`}
              onClick={() => choose(i)}
              onFocus={() => setIdx(i)}
              onMouseEnter={() => setIdx(i)}
            >
              <span className="wcard__key mono">{i + 1}</span>
              <span className="wcard__role">{t.role}</span>
              <span className="wcard__name">{t.name}</span>
              <span className="wcard__blurb">{t.blurb}</span>
            </button>
          ))}
        </div>
        <p className="welcome__hint">Press 1, 2 or 3, or use the arrow keys and Enter.</p>
        <div className="welcome__pilot">
          <span>Pilot file:</span>
          {PILOT.map((p, i) => (
            <span key={p.to}>
              <button type="button" className="welcome__link" onClick={() => openPilot(p.to)}>{p.label}</button>
              {i < PILOT.length - 1 && <span className="welcome__dot"> · </span>}
            </span>
          ))}
        </div>
      </div>
      <footer className="welcome__foot">Team 12 · X-HEC lab. Synthetic data on a fictionalized case. Not affiliated with or endorsed by JetBlue.</footer>
    </div>
  )
}

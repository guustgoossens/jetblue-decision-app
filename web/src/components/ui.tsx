import type { CSSProperties, ReactNode } from 'react'

export function Page({ eyebrow, title, lede, children }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page">
      <header className="page__head">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page__title">{title}</h1>
        {lede && <p className="page__lede">{lede}</p>}
      </header>
      {children}
    </div>
  )
}

export function Card({ eyebrow, title, right, children, className = '', flush }: {
  eyebrow?: string; title?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string; flush?: boolean
}) {
  return (
    <section className={`card ${flush ? 'card--flush' : ''} ${className}`}>
      {(eyebrow || title || right) && (
        <div className="card__head">
          <div>
            {eyebrow && <div className="eyebrow eyebrow--plain">{eyebrow}</div>}
            {title && <h3 className="card__title">{title}</h3>}
          </div>
          {right && <div className="card__right">{right}</div>}
        </div>
      )}
      <div className="card__body">{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'coral' | 'green' }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value mono">{value}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  )
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'coral' | 'green' | 'navy' | 'amber'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>
}

export function Seg<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? 'is-on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({ label, value, min, max, step, onChange, format, hint }: {
  label: ReactNode; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format?: (v: number) => string; hint?: ReactNode
}) {
  const p = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <div className="slider">
      <div className="slider__top">
        <label className="slider__label">{label}</label>
        <span className="slider__value mono">{format ? format(value) : value}</span>
      </div>
      <input className="range" type="range" min={min} max={max} step={step} value={value}
        style={{ '--p': `${p}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="slider__hint">{hint}</div>}
    </div>
  )
}

export function Band({ eyebrow, title, children, right }: { eyebrow?: string; title?: ReactNode; children?: ReactNode; right?: ReactNode }) {
  return (
    <section className="band">
      <div className="band__main">
        {eyebrow && <div className="eyebrow eyebrow--onnavy">{eyebrow}</div>}
        {title && <h2 className="band__title">{title}</h2>}
        {children && <div className="band__body">{children}</div>}
      </div>
      {right && <div className="band__right">{right}</div>}
    </section>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>
}

export function Bar({ value, max = 1, color = 'var(--navy)', height = 8 }: { value: number; max?: number; color?: string; height?: number }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="bar" style={{ height }}>
      <div className="bar__fill" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

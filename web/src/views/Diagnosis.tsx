import { useState } from 'react';
import { Card, Page, Pill, Seg } from '../components/ui';
import { diagnosis, recommendation, stakeholders } from '../lib/narrative';
import '../styles/verdict.css';

type Mode = 'initial' | 'revised';
type Loose = Record<string, unknown>;
const text = (v: unknown, ...keys: string[]): string => {
  if (typeof v === 'string') return v;
  const r = (v ?? {}) as Loose;
  for (const k of keys) if (typeof r[k] === 'string') return r[k] as string;
  return '';
};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const clean = (s: string) => s.replace(/\s*\(main\)\s*$/i, '');

// SVG geometry (viewBox 760 x 380)
const PROBLEM_POS = [
  { x: 40, y: 30, w: 300, h: 92 },
  { x: 40, y: 144, w: 300, h: 92 },
  { x: 40, y: 258, w: 300, h: 92 },
];
const ROOT = { x: 30, y: 135, w: 250, h: 110 };
const EFFECT_Y = [18, 108, 198, 288];

const wrap = (s: string, n: number): string[] => {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
};

export default function Diagnosis() {
  const [mode, setMode] = useState<Mode>('initial');
  const rev = mode === 'revised';
  const d = diagnosis as unknown as Loose;
  const initial = (d.initial ?? {}) as Loose;
  const revised = (d.revised ?? {}) as Loose;
  const problems = list(initial.problems);
  const effects = list(revised.effects);
  const changed = (d.changed ?? {}) as Loose;
  const shift = (changed.shift ?? {}) as Loose;
  const sponsors = list(changed.sponsors);
  const rootLabel = text(revised.root);

  return (
    <Page
      eyebrow="Decision"
      title="Is a missing dashboard the real problem?"
      lede="Discovery changed our answer. Switch between what we first read and what the customer told us."
    >
      <Card
        eyebrow="Problem map"
        title={rev ? 'One root cause, four effects' : 'Three separate problems'}
        right={<Seg<Mode> options={[{ value: 'initial', label: 'Initial' }, { value: 'revised', label: 'Revised' }]} value={mode} onChange={setMode} />}
      >
        <div className="diagnosis-map">
          <svg viewBox="0 0 760 380" role="img" aria-label={rev ? 'One root cause feeding four effects' : 'Three disconnected problems'}>
            <defs>
              <marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="#17343d" />
              </marker>
            </defs>

            {/* connectors, drawn in revised mode */}
            {EFFECT_Y.map((y, i) => {
              const x1 = ROOT.x + ROOT.w;
              const y1 = ROOT.y + ROOT.h / 2;
              const x2 = 470;
              const y2 = y + 32;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={i}
                  className={'diagnosis-conn' + (rev ? ' is-on' : '')}
                  style={{ transitionDelay: rev ? `${0.35 + i * 0.09}s` : '0s' }}
                  d={`M${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  pathLength={1}
                  markerEnd="url(#dg-arrow)"
                />
              );
            })}

            {/* problem boxes (initial) */}
            {PROBLEM_POS.map((p, i) => {
              const label = clean(text(problems[i], 'title', 'label', 'name'));
              const main = i === 0;
              const tx = rev ? ROOT.x - p.x + 10 : 0;
              const ty = rev ? ROOT.y + ROOT.h / 2 - p.y - p.h / 2 : 0;
              return (
                <g
                  key={i}
                  className={'diagnosis-prob' + (main ? ' is-main' : '') + (rev ? ' is-gone' : '')}
                  style={{ transform: `translate(${tx}px, ${ty}px) scale(${rev ? 0.6 : 1})`, transformOrigin: `${p.x + p.w / 2}px ${p.y + p.h / 2}px` }}
                >
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={14} />
                  {main && <text className="diagnosis-svg__tag" x={p.x + 20} y={p.y + 26}>MAIN PROBLEM</text>}
                  {wrap(label, 30).map((l, j) => (
                    <text key={j} className="diagnosis-svg__t" x={p.x + 20} y={p.y + (main ? 52 : 40) + j * 22}>{l}</text>
                  ))}
                </g>
              );
            })}

            {/* root */}
            <g className={'diagnosis-root' + (rev ? ' is-on' : '')}>
              <rect x={ROOT.x} y={ROOT.y} width={ROOT.w} height={ROOT.h} rx={16} />
              <text className="diagnosis-svg__tag diagnosis-svg__tag--light" x={ROOT.x + 20} y={ROOT.y + 28}>ROOT CAUSE</text>
              {wrap(rootLabel, 24).map((l, j) => (
                <text key={j} className="diagnosis-svg__t diagnosis-svg__t--light" x={ROOT.x + 20} y={ROOT.y + 56 + j * 21}>{l}</text>
              ))}
            </g>

            {/* effects */}
            {EFFECT_Y.map((y, i) => (
              <g key={i} className={'diagnosis-eff' + (rev ? ' is-on' : '')} style={{ transitionDelay: rev ? `${0.55 + i * 0.09}s` : '0s' }}>
                <rect x={470} y={y} width={270} height={64} rx={12} />
                <text className="diagnosis-svg__tag" x={490} y={y + 22}>EFFECT {i + 1}</text>
                {wrap(text(effects[i], 'title', 'label', 'name'), 36).map((l, j) => (
                  <text key={j} className="diagnosis-svg__t diagnosis-svg__t--sm" x={490} y={y + 40 + j * 15}>{l}</text>
                ))}
              </g>
            ))}
          </svg>
        </div>

        <div className="diagnosis-summary" key={mode}>
          <Pill tone={rev ? 'green' : 'neutral'}>{rev ? 'Revised view' : 'Initial view'}</Pill>
          <p>{text(rev ? revised.summary : initial.summary)}</p>
        </div>
      </Card>

      <Card eyebrow="What changed, and why" title="From a tool question to a signal question">
        <p className="diagnosis-changed">{text(changed.text)}</p>
        <div className="diagnosis-shift">
          <div className="diagnosis-shift__box">
            <span className="eyebrow">From</span>
            <b>{text(shift.from)}</b>
          </div>
          <div className="diagnosis-shift__arrow" aria-hidden>
            <svg viewBox="0 0 60 24"><path d="M2 12 H52 M42 3 L54 12 L42 21" /></svg>
          </div>
          <div className="diagnosis-shift__box is-to">
            <span className="eyebrow">To</span>
            <b>{text(shift.to)}</b>
          </div>
        </div>
      </Card>

      <Card eyebrow="Three sponsors" title="Same root cause, three seats">
        <div className="diagnosis-sponsors">
          {sponsors.map((s, i) => (
            <div key={i} className="diagnosis-sponsor" style={{ ['--i' as string]: i }}>
              <span className="eyebrow">{text(s, 'role', 'name', 'title')}</span>
              <b>{text(s, 'goal', 'need', 'text', 'wants')}</b>
              <span className="diagnosis-sponsor__link"><i />Late, revised signals</span>
            </div>
          ))}
        </div>
      </Card>

      <Card eyebrow="Causal chain" title="Cause, affected decision, business consequence">
        <div className="diagnosis-chain">
          {effects.map((e, i) => {
            const raw = text(e, 'title', 'label', 'name');
            const m = raw.match(/^(.*?)\s*\((.*)\)\s*$/);
            const decision = m ? m[1] : raw;
            const conseq = m ? m[2] : text(e, 'consequence', 'impact');
            return (
              <div key={i} className="diagnosis-chain__row">
                <div className="diagnosis-chain__cell is-cause"><span className="eyebrow">Cause</span>{rootLabel}</div>
                <span className="diagnosis-chain__arrow" aria-hidden>→</span>
                <div className="diagnosis-chain__cell"><span className="eyebrow">Affected decision</span>{decision}</div>
                <span className="diagnosis-chain__arrow" aria-hidden>→</span>
                <div className="diagnosis-chain__cell is-conseq"><span className="eyebrow">Business consequence</span>{conseq || 'Delays compound'}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card eyebrow="Who needs what" title="Three user groups, three lanes">
        <div className="diagnosis-sponsors">
          {stakeholders.map((s, i) => (
            <div key={i} className="diagnosis-sponsor">
              <span className="eyebrow">{text(s, 'group')}</span>
              <b>{text(s, 'needs')}</b>
              <span className="diagnosis-sponsor__link"><i />{text(s, 'lane')}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card eyebrow="Sequence" title="Order of work">
        <div className="diagnosis-seq">
          {[
            { n: '1', t: 'Repair the signal', later: false },
            { n: '2', t: 'Ops desk and CIO view', later: true },
            { n: '3', t: 'Dashboard on top', later: true },
          ].map((s) => (
            <div key={s.n} className={'diagnosis-seq__step' + (s.later ? ' is-later' : '')}>
              <span className="diagnosis-seq__n">{s.n}</span>
              <b>{s.t}</b>
              {s.later && <small>after the signal is fixed</small>}
            </div>
          ))}
        </div>
      </Card>

      <Card eyebrow="Recommendation" title={recommendation.headline}>
        <p className="verdict-rec__body">{recommendation.body}</p>
        <div className="verdict-rec__grid">
          <div><span className="eyebrow">Owner</span><p>{recommendation.owner}</p></div>
          <div><span className="eyebrow">Next decision</span><p>{recommendation.nextDecision}</p></div>
        </div>
      </Card>
    </Page>
  );
}

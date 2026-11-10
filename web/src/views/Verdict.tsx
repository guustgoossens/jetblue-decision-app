import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Card, Pill, Slider } from '../components/ui';
import { data, champion, dummy } from '../lib/data';
import { bestBalanced, confusion } from '../lib/metrics';
import { LOGGED_CUTOFF, useApp } from '../lib/store';
import { num, pct, pct1, usd } from '../lib/format';
import { gates } from '../lib/narrative';
import '../styles/verdict.css';

type Tone = 'neutral' | 'coral' | 'green' | 'navy' | 'amber';
type Choice = 'go' | 'nogo' | null;

export default function Verdict() {
  const cutoff = useApp((s) => s.cutoff);
  const setCutoff = useApp((s) => s.setCutoff);
  const a = useApp((s) => s.assumptions);
  const [choice, setChoice] = useState<Choice>(null);

  const best = useMemo(() => bestBalanced(data.validation, 'lr'), []);
  const c = useMemo(() => confusion(data.validation, 'lr', cutoff), [cutoff]);

  const quarters = useMemo(() => {
    const sorted = [...data.validation].sort((p, q) => q.lr - p.lr);
    const n = sorted.length;
    return [0, 1, 2, 3].map((i) => {
      const part = sorted.slice(Math.floor((i * n) / 4), Math.floor(((i + 1) * n) / 4));
      const hits = part.filter((r) => r.y === 1).length;
      return { label: ['Top quarter', 'Second', 'Third', 'Bottom quarter'][i], n: part.length, rate: part.length ? hits / part.length : 0 };
    });
  }, []);

  const biz = data.business;
  const target = biz.delaysPerWeek * (1 - biz.targetReduction);
  const avoided = biz.delaysPerWeek * c.recall * a.preventRate;
  const flagsPerDisruption = c.tp + c.fn > 0 ? c.contacted / (c.tp + c.fn) : 0;
  const net = avoided * a.disruptionCost - biz.delaysPerWeek * flagsPerDisruption * a.interventionCost;
  const nearly = (x: number, y: number) => Math.abs(x - y) < 0.005;
  const eligible = data.funnel.eligible;
  const expected = data.funnel.expected;

  const gateRows: { label: string; target: string; tone: Tone; status: string }[] = [
    ...gates.map((g) => ({
      label: g.label,
      target: g.target,
      tone: (g.status === 'done' ? 'green' : 'amber') as Tone,
      status: g.status === 'done' ? 'Met' : 'Pending',
    })),
    { label: 'Delays per week, pilot hub vs control hub', target: `About ${biz.delaysPerWeek} baseline, 50% fewer (about ${num(target, 0)})`, tone: 'neutral', status: 'Pilot' },
    { label: 'Interventions started before disruption', target: 'Counted at pilot and control hub', tone: 'neutral', status: 'Pilot' },
    { label: 'False-alarm tolerance', target: 'Duty managers keep trusting alerts (stop condition)', tone: 'neutral', status: 'Pilot' },
  ];

  return (
    <div className="verdict">
      <header className="verdict-head">
        <div>
          <h1>Disruption pilot summary</h1>
          <span className="verdict-asof mono">As of: Validation set, 342 flight-hours</span>
        </div>
        <Pill tone="amber">Pilot proposal · awaiting CIO decision</Pill>
      </header>

      <div className="verdict-strip">
        <div className="verdict-kpi">
          <span className="eyebrow">Delays / week</span>
          <b className="mono">{biz.delaysPerWeek} → {num(target, 0)}</b>
          <small>target <Pill>From discovery</Pill></small>
        </div>
        <div className="verdict-kpi">
          <span className="eyebrow">Model balanced accuracy</span>
          <b className="mono">{num(champion.balancedAccuracy, 3)}</b>
          <small>vs {num(dummy.balancedAccuracy, 3)} baseline <Pill tone="green">Validation</Pill></small>
        </div>
        <div className="verdict-kpi">
          <span className="eyebrow">Feed usable</span>
          <b className="mono">{eligible.toLocaleString('en-US')} / {expected.toLocaleString('en-US')}</b>
          <small>{pct(eligible / expected)} after repair</small>
        </div>
        <div className="verdict-kpi">
          <span className="eyebrow">Data latency</span>
          <b className="mono">{biz.latencyNowMin}+ → &lt;{biz.latencyNeededMin} min</b>
          <small>target <Pill>From discovery</Pill></small>
        </div>
      </div>

      <div className="verdict-cols">
        <Card eyebrow="Weekly scenario" title={`Cut-off ${num(cutoff, 2)}`} right={<Pill tone="amber">Scenario</Pill>}>
          <Slider label="Cut-off" value={cutoff} min={0} max={1} step={0.01} onChange={setCutoff} format={(v: number) => num(v, 2)} />
          <div className="verdict-chips">
            <button type="button" className={'verdict-chip' + (nearly(cutoff, LOGGED_CUTOFF) ? ' is-on' : '')} onClick={() => setCutoff(LOGGED_CUTOFF)}>
              {num(LOGGED_CUTOFF, 2)} logged
            </button>
            <button type="button" className={'verdict-chip' + (nearly(cutoff, best.t) ? ' is-on' : '')} onClick={() => setCutoff(best.t)}>
              {num(best.t, 2)} best balanced
            </button>
          </div>
          <div className="verdict-scn">
            <div><b className="mono">{num(avoided, 1)}</b><span>fewer delays / week (target {num(biz.delaysPerWeek - target, 0)})</span></div>
            <div><b className="mono">{usd(net)}</b><span>net value / week</span></div>
            <div><b className="mono">{pct1(c.recall)}</b><span>recall, validation</span></div>
          </div>
          <NavLink to="/impact" className="verdict-link">Edit assumptions in Impact model ↗</NavLink>
        </Card>

        <Card eyebrow="Ranking quality" title="Disruption rate by risk quartile" right={<Pill tone="green">Validation</Pill>}>
          <div className="verdict-q">
            {quarters.map((q) => (
              <div key={q.label} className="verdict-q__col">
                <span className="mono">{pct1(q.rate)}</span>
                <div className="verdict-q__bar"><i style={{ height: `${Math.max(2, q.rate * 100)}%` }} /></div>
                <small>{q.label}<br />{q.n} flight-hours</small>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card eyebrow="Gate checklist" title="Pilot gates">
        <table className="verdict-tbl">
          <thead><tr><th>Gate</th><th>Target</th><th>Status</th></tr></thead>
          <tbody>
            {gateRows.map((g) => (
              <tr key={g.label}>
                <td><b>{g.label}</b></td>
                <td>{g.target}</td>
                <td><Pill tone={g.tone}>{g.status}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card eyebrow="Decision requested" title="Approve a 6 to 8 week one-hub pilot owned by the Director of Data Science">
        <div className="verdict-dec">
          <button type="button" className={'verdict-chip verdict-chip--lg' + (choice === 'go' ? ' is-on' : '')} onClick={() => setChoice('go')} aria-pressed={choice === 'go'}>Go</button>
          <button type="button" className={'verdict-chip verdict-chip--lg' + (choice === 'nogo' ? ' is-on' : '')} onClick={() => setChoice('nogo')} aria-pressed={choice === 'nogo'}>No-go</button>
          <span className="verdict-dec__alt">Alternative: Aero-Lytics as a display layer later</span>
        </div>
      </Card>
    </div>
  );
}

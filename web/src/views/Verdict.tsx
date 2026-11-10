import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Card, Pill, Slider } from '../components/ui';
import { data, champion, dummy } from '../lib/data';
import { bestBalanced, confusion } from '../lib/metrics';
import { LOGGED_CUTOFF, useApp } from '../lib/store';
import { num, pct, pct1, usd } from '../lib/format';
import { gates } from '../lib/narrative';
import { predict } from '../lib/scoring';
import { breakEven } from '../lib/store';
import '../styles/verdict.css';

type Tone = 'neutral' | 'coral' | 'green' | 'navy' | 'amber';
type Choice = 'go' | 'nogo' | null;

export default function Verdict() {
  const cutoff = useApp((s) => s.cutoff);
  const setCutoff = useApp((s) => s.setCutoff);
  const a = useApp((s) => s.assumptions);
  const capacity = useApp((s) => s.capacity);
  const [choice, setChoice] = useState<Choice>(null);

  const best = useMemo(() => bestBalanced(data.validation, 'lr'), []);
  const c = useMemo(() => confusion(data.validation, 'lr', cutoff), [cutoff]);

  const money = useMemo(() => {
    const ts = (x: string) => new Date(x).getTime();
    const rows = data.queue.map((r) => {
      const risk = predict({ x1: r.x1, x2: r.x2, x3: r.x3 });
      return { id: r.id, region: r.segment, t: ts(r.observedAt), risk, cost: risk * a.disruptionCost, value: risk * a.preventRate * a.disruptionCost - a.interventionCost };
    }).sort((p, q) => q.value - p.value);
    const tEnd = Math.max(...rows.map((r) => r.t));
    const shift = rows.filter((r) => r.t > tEnd - 12 * 3600 * 1000);
    const sum = (xs: typeof rows, f: (r: (typeof rows)[number]) => number) => xs.reduce((t, r) => t + f(r), 0);
    return {
      top: rows.slice(0, 15),
      shiftCost: sum(shift, (r) => r.cost), shiftN: shift.length,
      totalCost: sum(rows, (r) => r.cost), totalN: rows.length,
      captured: sum(rows.slice(0, capacity).filter((r) => r.value > 0), (r) => r.value),
    };
  }, [a, capacity]);
  const be = breakEven(a);

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
          <span className="eyebrow">Expected disruption cost, next shift</span>
          <b className="mono">{usd(money.shiftCost)}</b>
          <small>{money.shiftN} flight-hours, last 12 h <Pill tone="amber">Assumption</Pill></small>
        </div>
        <div className="verdict-kpi">
          <span className="eyebrow">Expected cost, blind set</span>
          <b className="mono">{usd(money.totalCost)}</b>
          <small>{money.totalN} flight-hours <Pill tone="amber">Assumption</Pill></small>
        </div>
        <div className="verdict-kpi">
          <span className="eyebrow">Value if acting on top {capacity}</span>
          <b className="mono">{usd(money.captured)}</b>
          <small>net of intervention cost <Pill tone="amber">Scenario</Pill></small>
        </div>
        <div className="verdict-kpi">
          <span className="eyebrow">Break-even risk</span>
          <b className="mono">{Number.isFinite(be) ? pct1(be) : 'n/a'}</b>
          <small>act above this risk <Pill tone="amber">Assumption</Pill></small>
        </div>
      </div>

      <Card eyebrow="Expected value per flight-hour" title="Top 15 blind flight-hours by value of acting" right={<Pill tone="amber">Scenario</Pill>}>
        <table className="verdict-tbl">
          <thead><tr><th>Flight-hour</th><th>Region</th><th>Risk</th><th>Expected cost</th><th>Value if acted</th><th>Call</th></tr></thead>
          <tbody>
            {money.top.map((r, i) => (
              <tr key={r.id}>
                <td className="mono">{r.id.slice(0, 10)}</td>
                <td>{r.region}</td>
                <td className="mono">{pct1(r.risk)}</td>
                <td className="mono">{usd(r.cost)}</td>
                <td className="mono">{usd(r.value)}</td>
                <td><Pill tone={r.value > 0 && i < capacity ? 'green' : 'neutral'}>{r.value > 0 && i < capacity ? 'Act' : 'Monitor'}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="verdict-note">The model predicts risk, not cause. Costs use editable assumptions: {usd(a.disruptionCost)} per disruption, {usd(a.interventionCost)} per intervention, {pct(a.preventRate)} prevented.</p>
      </Card>

      <div className="verdict-cols verdict-cols--one">
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

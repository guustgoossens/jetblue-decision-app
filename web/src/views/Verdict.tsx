import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Band, Card, Pill, Seg, Slider, Stat } from '../components/ui';
import { data, champion, dummy } from '../lib/data';
import { bestBalanced, confusion } from '../lib/metrics';
import { LOGGED_CUTOFF, useApp } from '../lib/store';
import { num, pct, pct1, usd } from '../lib/format';
import { recommendation, storyline } from '../lib/narrative';
import '../styles/verdict.css';

type Metric = 'balancedAccuracy' | 'accuracy' | 'auc';
type Loose = Record<string, unknown>;
const str = (o: unknown, ...keys: string[]): string => {
  const r = o as Loose;
  for (const k of keys) if (r && r[k] != null && r[k] !== '') return String(r[k]);
  return '';
};

const METRICS: { value: Metric; label: string }[] = [
  { value: 'balancedAccuracy', label: 'Balanced accuracy' },
  { value: 'accuracy', label: 'Accuracy' },
  { value: 'auc', label: 'AUC' },
];
const TIE: Record<Metric, Metric[]> = {
  balancedAccuracy: ['accuracy', 'auc'],
  accuracy: ['balancedAccuracy', 'auc'],
  auc: ['balancedAccuracy', 'accuracy'],
};
const ROW_H = 58;

export default function Verdict() {
  const cutoff = useApp((s) => s.cutoff);
  const setCutoff = useApp((s) => s.setCutoff);
  const a = useApp((s) => s.assumptions);
  const [metric, setMetric] = useState<Metric>('balancedAccuracy');

  const best = useMemo(() => bestBalanced(data.validation, 'lr'), []);

  const ranked = useMemo(() => {
    const keys = [metric, ...TIE[metric]];
    return [...data.models].sort((a, b) => {
      for (const k of keys) {
        const d = (b[k] as number) - (a[k] as number);
        if (Math.abs(d) > 1e-9) return d;
      }
      return 0;
    });
  }, [metric]);
  const rankOf = (key: string) => ranked.findIndex((m) => m.key === key);

  const stats = useMemo(() => {
    const c = confusion(data.validation, 'lr', cutoff);
    const contacted = data.queue.filter((q) => q.risk >= cutoff);
    const seg = new Map<string, number>();
    contacted.forEach((q) => seg.set(q.segment, (seg.get(q.segment) ?? 0) + 1));
    const segments = [...seg.entries()].sort((a, b) => b[1] - a[1]);
    return { c, n: contacted.length, segments };
  }, [cutoff]);

  const quarters = useMemo(() => {
    const sorted = [...data.validation].sort((p, q) => q.lr - p.lr);
    const n = sorted.length;
    return [0, 1, 2, 3].map((i) => {
      const part = sorted.slice(Math.floor((i * n) / 4), Math.floor(((i + 1) * n) / 4));
      const hits = part.filter((r) => r.y === 1).length;
      return { label: ['Top quarter', 'Second', 'Third', 'Bottom quarter'][i], n: part.length, rate: part.length ? hits / part.length : 0 };
    });
  }, []);
  const weeklyAvoided = data.business.delaysPerWeek * stats.c.recall * a.preventRate;
  const weeklyCost = weeklyAvoided * a.disruptionCost;
  const nearly = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const total = data.queue.length;
  const eligible = data.funnel.eligible;
  const expected = data.funnel.expected;
  const biz = data.business;
  const nv = data.naive;

  const lanes = [
    { to: '/ops', tag: 'Ops desk', t: 'Ranked next-hour risk queue', d: `Duty managers act on the top flight-hours, sized to desk capacity, inside a ${biz.decisionWindowMin}-minute window.` },
    { to: '/impact', tag: 'CIO view', t: 'Impact, evidence, next gate', d: 'Cost of the cut-off, scenario on editable assumptions, and the pilot go or no-go.' },
    { to: '/genie', tag: 'Data team', t: 'Genie on the repaired tables', d: 'Quality, lineage and structure in Databricks and Genie. No dashboard needed.' },
  ];

  return (
    <div className="verdict">
      <section className="verdict-hero">
        <div className="verdict-hero__grid" aria-hidden />
        <div className="verdict-hero__copy">
          <div className="verdict-eyebrow">
            <i className="verdict-dot" />
            <span>Team {data.meta.team} · CIO decision</span>
          </div>
          <h1>
            <span>Don't buy a faster screen.</span>
            <span>Fix the signal first,</span>
            <span className="verdict-coral">then act before the disruption.</span>
          </h1>
          <p>
            The dashboard arrives too late: signals are late, revised and inconsistent at decision time. We repaired the feed,
            compared four models, and rank where to act in the next hour.
          </p>
        </div>
        <aside className="verdict-hero__steps" aria-label="The demo">
          <div className="verdict-steps__head">The demo · 01 to 04</div>
          <ol>
            {storyline.map((s, i) => {
              const to = str(s, 'to', 'path', 'href', 'route') || '/';
              return (
                <li key={i} style={{ ['--i' as string]: i }}>
                  <NavLink to={to} className="verdict-step">
                    <span className="verdict-step__n">{str(s, 'n', 'num', 'step', 'id', 'number') || String(i + 1).padStart(2, '0')}</span>
                    <span className="verdict-step__t">
                      <b>{str(s, 'label', 'name', 'stage')}</b>
                      <small>{str(s, 'title', 'headline', 'text')}</small>
                    </span>
                    <span className="verdict-step__go" aria-hidden>↗</span>
                  </NavLink>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>

      <div className="verdict-body">
        <div className="grid4 verdict-kpis">
          <Stat
            label="Champion balanced accuracy"
            value={num(champion.balancedAccuracy, 3)}
            sub={`Dummy ${num(dummy.balancedAccuracy, 3)}, on validation`}
            tone="green"
          />
          <Stat label="Records usable" value={`${eligible.toLocaleString('en-US')} of ${expected.toLocaleString('en-US')}`} sub={`${pct(eligible / expected)} after repair`} />
          <Stat label="Flagged for intervention" value={String(stats.n)} sub={`of ${total} blind flight-hours at cut-off ${num(cutoff, 2)}`} tone="coral" />
          <Stat label="Flagged that were disruptions" value={pct(stats.c.precision)} sub="Precision on validation" />
        </div>

        <Card eyebrow="One page for the C-suite" title="Four lines to take into the room" right={<Pill tone="amber">Scenario</Pill>}>
          <div className="verdict-c">
            <div className="verdict-c__line">
              <b className="mono">{biz.delaysPerWeek} → {num(biz.delaysPerWeek * (1 - biz.targetReduction), 0)}</b>
              <span>delays a week, today against the target, both from discovery.</span>
            </div>
            <div className="verdict-c__line">
              <b className="mono">{pct(stats.c.recall)}</b>
              <span>of disruptions caught at cut-off {num(cutoff, 2)} on validation, {pct(stats.c.precision)} of flags right, {num(stats.c.contactRate * 100, 1)} flags per 100 flight-hours.</span>
            </div>
            <div className="verdict-c__line">
              <b className="mono">{usd(weeklyCost)}</b>
              <span>
                a week of disruption cost avoided before intervention costs, at {pct(a.preventRate)} prevented and {usd(a.disruptionCost)} per disruption. Scenario on editable assumptions, not a result.{' '}
                <NavLink to="/impact">Edit on Impact ↗</NavLink>
              </span>
            </div>
            <div className="verdict-c__line">
              <b className="mono">{biz.latencyNowMin}+ → &lt;{biz.latencyNeededMin} min</b>
              <span>data latency: the upstream fix the pilot must prove.</span>
            </div>
          </div>
        </Card>

        <Card eyebrow="Ranking quality" title="Observed disruption rate by risk quartile, validation">
          <div className="verdict-q">
            {quarters.map((q) => (
              <div key={q.label} className="verdict-q__col">
                <span className="mono">{pct1(q.rate)}</span>
                <div className="verdict-q__bar"><i style={{ height: `${Math.max(2, q.rate * 100)}%` }} /></div>
                <small>{q.label}<br />{q.n} flight-hours</small>
              </div>
            ))}
          </div>
          <p className="verdict-note">Act on the top of the list.</p>
        </Card>

        <Card eyebrow="The dashboard that arrives too late" title="Two measurements, both say the signal is late">
          <div className="verdict-late">
            <div className="verdict-late__col">
              <span className="eyebrow">From discovery · customer answer</span>
              <div className="verdict-late__row">
                <div><span className="mono verdict-late__big">{biz.latencyNowMin}+ min</span><small>freshness latency today</small></div>
                <span className="verdict-late__vs" aria-hidden>vs</span>
                <div><span className="mono verdict-late__big is-need">&lt; {biz.latencyNeededMin} min</span><small>what ops needs to act</small></div>
              </div>
              <div className="verdict-late__track" aria-hidden>
                <i style={{ width: '100%' }} />
                <b style={{ width: `${(biz.latencyNeededMin / biz.latencyNowMin) * 100}%` }} />
              </div>
            </div>
            <div className="verdict-late__col">
              <span className="eyebrow">Measured on the lab data</span>
              <div className="verdict-late__row">
                <div><span className="mono verdict-late__big">{num(nv.lateRows)}</span><small>revisions landing a median {nv.lateMedianHours} h after the decision time</small></div>
                <div><span className="mono verdict-late__big">{num(nv.lostOnRawJoin)}</span><small>of {num(expected)} records lost on raw keys</small></div>
              </div>
            </div>
          </div>
          <p className="verdict-note">
            Different measurements: the 10-minute latency is the customer's, the 24 hours is ours. A dashboard on this feed shows wrong numbers faster.
          </p>
        </Card>

        <Card
          eyebrow="Champion selection"
          title="Four models, one winner"
          right={<Seg options={METRICS} value={metric} onChange={setMetric} />}
        >
          <div className="verdict-rank" style={{ height: ranked.length * ROW_H }}>
            {data.models.map((m) => {
              const r = rankOf(m.key);
              const v = m[metric] as number;
              const win = r === 0;
              return (
                <div
                  key={m.key}
                  className={'verdict-rank__row' + (win ? ' is-win' : '')}
                  style={{ transform: `translateY(${r * ROW_H}px)`, height: ROW_H - 8 }}
                >
                  <span className="verdict-rank__mark">{r + 1}</span>
                  <span className="verdict-rank__name">
                    <b>{m.label}</b>
                    <small>{m.algorithm}{m.isChampion ? ' · champion' : ''}</small>
                  </span>
                  <span className="verdict-rank__bar">
                    <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
                  </span>
                  <span className="mono verdict-rank__score">{num(v, 3)}</span>
                </div>
              );
            })}
          </div>
          <p className="verdict-note">
            Selected on validation balanced accuracy, with ties broken on accuracy. Blind labels were never used.
          </p>
        </Card>

        <Card eyebrow="Cut-off" title="Which flight-hours get flagged">
          <Slider
            label="Flag for intervention if disruption risk is at least"
            value={cutoff}
            min={0}
            max={1}
            step={0.01}
            onChange={setCutoff}
            format={(v: number) => num(v, 2)}
            hint="Lower flags more flight-hours and catches more disruptions, with more false alarms. Higher flags fewer, with fewer false alarms."
          />
          <div className="verdict-chips">
            <button type="button" className={'verdict-chip' + (nearly(cutoff, LOGGED_CUTOFF) ? ' is-on' : '')} onClick={() => setCutoff(LOGGED_CUTOFF)}>
              {num(LOGGED_CUTOFF, 2)} logged
            </button>
            <button type="button" className={'verdict-chip' + (nearly(cutoff, best.t) ? ' is-on' : '')} onClick={() => setCutoff(best.t)}>
              {num(best.t, 2)} best balanced accuracy
            </button>
          </div>
        </Card>

        <Band
          eyebrow="RECOMMENDATION AT THIS CUT-OFF"
          title={`Flag ${stats.n} of ${total} upcoming flight-hours`}
          right={<Pill tone="coral">{num(cutoff, 2)} cut-off</Pill>}
        >
          <p className="verdict-band__text">
            At {num(cutoff, 2)}, flag <b>{stats.n}</b> of {total} blind flight-hours; monitor the rest. On validation, <b>{pct1(stats.c.precision)}</b> of
            flagged flight-hours were followed by a disruption and the cut-off catches <b>{pct1(stats.c.recall)}</b> of all disruptions. The model
            predicts next-hour disruption risk. It does not prove that an intervention prevents one.
          </p>
        </Band>

        <Card eyebrow="Flagged flight-hours" title="By region, at this cut-off">
          {stats.segments.length === 0 ? (
            <p className="verdict-note">No blind flight-hour reaches this cut-off.</p>
          ) : (
            <div className="verdict-seg">
              {stats.segments.map(([name, n]) => (
                <div key={name} className="verdict-seg__row">
                  <span>{name}</span>
                  <span className="verdict-seg__bar">
                    <i style={{ width: `${(n / stats.segments[0][1]) * 100}%` }} />
                  </span>
                  <span className="mono">{n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card eyebrow="Architecture" title="Two lanes on one repaired signal">
          <div className="verdict-lanes">
            {lanes.map((l) => (
              <NavLink key={l.to} to={l.to} className="verdict-lane">
                <span className="eyebrow">{l.tag}</span>
                <b>{l.t}</b>
                <p>{l.d}</p>
                <span className="verdict-lane__go">Open ↗</span>
              </NavLink>
            ))}
          </div>
          <NavLink to="/repair" className="verdict-base">
            <i aria-hidden />
            <span>Repaired signal: point-in-time, keyed, unit-normalised, permitted. {num(eligible)} of {num(expected)} records usable.</span>
            <span aria-hidden>↗</span>
          </NavLink>
        </Card>

        <Card eyebrow="Recommendation" title={recommendation.headline}>
          <p className="verdict-rec__body">{recommendation.body}</p>
          <div className="verdict-rec__grid">
            <div>
              <span className="eyebrow">Owner</span>
              <p>{recommendation.owner}</p>
            </div>
            <div>
              <span className="eyebrow">Next gate</span>
              <p>{recommendation.nextDecision}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

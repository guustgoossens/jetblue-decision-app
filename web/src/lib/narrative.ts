export const storyline = [
  { n: '01', label: 'Decision', title: 'Fix the signal before buying a screen', to: '/diagnosis' },
  { n: '02', label: 'Evidence', title: 'Repaired signals, compared models', to: '/repair' },
  { n: '03', label: 'Action', title: 'Where to act in the next hour', to: '/ops' },
  { n: '04', label: 'Next gate', title: 'One-hub pilot, CIO decides', to: '/meddpicc' },
]

export const recommendation = {
  headline: 'Do not start with the Aero-Lytics dashboard.',
  body: 'Run a 6 to 8 week pilot at one hub: put the repaired, point-in-time event feed in production there, score next-hour disruption risk each cycle, and give duty managers a ranked queue sized to their capacity. A dashboard can sit on top later.',
  owner: 'The Director of Data Science runs the pilot. The CIO decides.',
  nextDecision: 'CIO: go or no-go at the pilot gate, on interventions started before disruption and delays per week against a matched control hub.',
}

export const diagnosis = {
  initial: {
    summary: 'The VP of Customer Experience sees disruption and inconsistent service and asks for a real-time operations dashboard. Aero-Lytics can deploy one quickly. We first read this as a visibility problem: ops cannot see what is happening.',
    problems: [
      { label: 'Disruption hurts customers', main: true },
      { label: 'Inconsistent service across stations', main: false },
      { label: 'Data team overloaded', main: false },
    ],
  },
  revised: {
    summary: 'Ops can see the signals, but too late and not reliably. Freshness latency is 10+ minutes when ops needs under 1 minute, events are revised after the decision, and stations use different keys and units. Any dashboard on this feed shows wrong numbers faster. Fix the signal first, then rank where to act.',
    root: 'Late, revised and inconsistent signals at decision time',
    effects: [
      'Crew and gate decisions arrive too late (delays compound)',
      'Revised events rewrite what ops believed (decisions on wrong numbers)',
      'Stations disagree on keys and units (inconsistent service)',
      'The data team firefights the feed (no capacity for new work)',
    ],
  },
  changed: {
    text: 'Discovery confirmed that the pain is timeliness and trust, not visibility. The customer gave numbers: 10+ minutes of latency against a 1-minute need, and about 14 delays a week with a 50% reduction target. Aero-Lytics was judged insufficient because it does not touch upstream latency. We kept the dashboard idea but moved it to second place, split into two lanes on one repaired signal.',
    shift: {
      from: 'Which dashboard to buy',
      to: 'Fix the signal, then act on a ranked risk queue',
    },
    sponsors: [
      { role: 'VP of Customer Experience', goal: 'Fewer disruptions, consistent service' },
      { role: 'Director of Data Science', goal: 'Less firefighting, a scope the team can carry' },
      { role: 'CIO', goal: 'A credible pilot, cost impact defensible to the C-suite' },
    ],
  },
}

export const stakeholders: { group: string; needs: string; lane: string }[] = [
  { group: 'Operations team', needs: 'Flight status, issues, predictions and decision support inside a 30-minute window', lane: 'Ops desk' },
  { group: 'Data analytics team', needs: 'Data quality, lineage and structure', lane: 'Databricks and Genie, no dashboard' },
  { group: 'CIO', needs: 'Aggregated summary, revenue and cost impact, defensible to the C-suite', lane: 'CIO verdict and impact' },
]

const CONFIRMED = 'Discovery rounds and the case brief.'
const SUPPORTED = 'Discovery rounds plus our measurement on the lab data.'
const HYPOTHESIS = 'Team inference. Not yet confirmed by the customer.'

export const meddpicc: {
  code: string; name: string; status: 'Confirmed' | 'Supported' | 'Hypothesis'; claim: string[]; source: string; next: string
}[] = [
  {
    code: 'M', name: 'Metrics', status: 'Confirmed',
    claim: [
      'About 14 operational delays per week today; target is a 50% reduction.',
      'Data freshness latency is 10+ minutes; ops needs under 1 minute to act.',
      'Model evidence: 0.917 validation balanced accuracy against 0.500 for the Dummy.',
    ],
    source: CONFIRMED,
    next: 'Who owns the delay number, how is a delay defined, and over which window is the 50% measured?',
  },
  {
    code: 'E', name: 'Economic buyer', status: 'Confirmed',
    claim: [
      'The CIO is the ultimate decision maker on solutions.',
      'The CIO needs aggregated impact on revenue and cost, defensible to the C-suite.',
    ],
    source: CONFIRMED,
    next: 'What budget can the CIO approve for a one-hub pilot without further sign-off?',
  },
  {
    code: 'DC', name: 'Decision criteria', status: 'Supported',
    claim: [
      'Must address upstream data latency; a display layer alone was judged insufficient.',
      'Ops needs decision support inside a 30-minute window.',
      'The data team assesses and tests proposed solutions.',
      'Measured: 1,707 of 2,000 records usable after point-in-time, unit and permission repair.',
    ],
    source: SUPPORTED,
    next: 'What false-alarm rate will duty managers accept before they stop trusting alerts?',
  },
  {
    code: 'DP', name: 'Decision process', status: 'Supported',
    claim: [
      'The data team assesses and tests; the CIO decides.',
      'Three user groups must be served: operations, data analytics, CIO.',
    ],
    source: SUPPORTED,
    next: 'What are the steps and dates from pilot result to go or no-go, and who can stop it?',
  },
  {
    code: 'PP', name: 'Paper process', status: 'Hypothesis',
    claim: [
      'Data is governed by purpose: 171 records are not permitted for model training at decision time, so a privacy review is likely.',
      'Security, procurement and signature steps are unknown.',
    ],
    source: HYPOTHESIS,
    next: 'Which reviews and signatures are needed before a pilot contract, and how many weeks do they take?',
  },
  {
    code: 'I', name: 'Implicated pain', status: 'Confirmed',
    claim: [
      'Latency of 10+ minutes means crew and gate decisions arrive too late, and delays compound.',
      'Root cause per the customer: fragmented legacy architecture and an overwhelmed data team.',
      'Measured: 216 revisions land about 24 hours after the decision time, 703 of 2,000 records are lost on raw keys, and weather arrives in three units.',
    ],
    source: CONFIRMED,
    next: 'What does one late intervention cost in rebooking, crew overtime and compensation?',
  },
  {
    code: 'CH', name: 'Champion', status: 'Hypothesis',
    claim: [
      'Candidate: the Director of Data Science, if the scope is one hub and the feed is fixed once upstream.',
      'The data team is overloaded, so commitment is not yet shown.',
    ],
    source: HYPOTHESIS,
    next: 'Will the Director commit team time and present the pilot result to the CIO with us?',
  },
  {
    code: 'CO', name: 'Competition', status: 'Supported',
    claim: [
      'Aero-Lytics dashboard: fast to deploy, judged insufficient because it does not fix upstream latency.',
      'Alternatives: in-house build, or do nothing.',
    ],
    source: SUPPORTED,
    next: 'What does Aero-Lytics do with late or revised events, at what price and timeline?',
  },
]

export const rubric = [
  { score: 0, label: 'Missing' },
  { score: 1, label: 'Plausible' },
  { score: 2, label: 'Supported' },
  { score: 3, label: 'Decision-useful' },
]
export const rubricNote = 'The lab needs at least 2 on all eight.'

export const limits = [
  { label: 'Causal effect', text: 'The model predicts next-hour disruption. It does not show that an intervention prevents one.' },
  { label: 'Latency in production', text: 'The lab data cannot measure production latency; the 10-minute figure is the customer\'s.' },
  { label: 'The real company', text: 'The data is synthetic and the case is fictionalized. Nothing here describes the real JetBlue.' },
  { label: 'Blind performance', text: 'Blind accuracy is hidden until the jury grades. All figures shown are validation.' },
]

export const gates: { label: string; target: string; status: 'done' | 'jury'; note: string }[] = [
  { label: 'Data quality', target: 'At least 98% of eligible rows match the permitted snapshot', status: 'jury', note: 'Graded by the course app.' },
  { label: 'Blind balanced accuracy', target: 'At least 0.70, and at least Dummy + 0.05', status: 'jury', note: 'Hidden until the jury grades.' },
  { label: 'Best validation model retained', target: 'Finished MLflow runs for the Dummy and three models', status: 'done', note: 'Logged in MLflow, champion tagged.' },
  { label: 'Every MEDDPICC dimension', target: 'At least 2 of 3', status: 'jury', note: 'Paper Process and Champion are weakest.' },
  { label: 'Live app demo', target: 'Decision, evidence, action, next gate', status: 'jury', note: 'This app.' },
]

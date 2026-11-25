// Variance Lab: sample paths, distribution of results, downswings, risk of ruin,
// sample size vs certainty, and a central-limit-theorem demo built from real hands.

import { RNG } from '../core/rng.js';
import { normalCdf, normalPdf, histogram, percentileSorted, mean, stdDev, skewness } from '../core/stats.js';
import { Game } from '../game/engine.js';
import { botDecide } from '../game/bots.js';
import { el, $, clear, pct, num, signed, term, mathBlock, statTile } from './dom.js';
import { lineChart, histogramChart, SERIES } from './charts.js';

let root;
const st = { wr: 5, sd: 90, hands: 20000, paths: 1000, bankroll: 1500 };

export function initVarianceLab(container) {
  root = container;
  root.append(
    el(
      'div.lab-intro',
      {},
      el('h2', {}, 'Variance Lab'),
      el(
        'p',
        {},
        'A winning player still loses for long stretches. This lab simulates thousands of players with the same true ',
        term('win rate', 'bb100'),
        ' and ',
        term('standard deviation', 'variance'),
        ' so you can see the ',
        term('law of large numbers', 'lln'),
        ', the ',
        term('central limit theorem', 'clt'),
        ', ',
        term('confidence intervals', 'ci'),
        ' and ',
        term('risk of ruin', 'risk-of-ruin'),
        ' in action.',
      ),
    ),
    el('div#var-controls.panel'),
    el('div#var-out'),
    el('div#var-sample.panel'),
    el('div#var-clt.panel'),
  );
  buildControls();
  buildSampleSize();
  buildClt();
  simulate();
}

function buildControls() {
  const box = $('#var-controls', root);
  const field = (key, label, attrs) => {
    const i = el('input', { type: 'number', value: st[key], ...attrs });
    i.addEventListener('change', () => (st[key] = +i.value));
    return el('label', {}, label, i);
  };
  box.append(
    el('h3', {}, 'Simulate many players with identical skill'),
    el(
      'div.form-grid',
      {},
      field('wr', 'True win rate (bb/100)', { step: 0.5 }),
      field('sd', 'Std deviation (bb/100)', { step: 5, min: 1 }),
      field('hands', 'Hands each', { step: 1000, min: 100, max: 1000000 }),
      field('paths', 'Number of players', { step: 100, min: 10, max: 5000 }),
      field('bankroll', 'Bankroll (bb)', { step: 100, min: 1 }),
    ),
    el('div.row', {}, el('button.btn.primary', { onclick: simulate }, 'Simulate'), el('span.small.muted', {}, 'Typical NLHE: win rate −10 to +10 bb/100, SD 70–120 bb/100.')),
  );
}

function simulate() {
  const out = clear($('#var-out', root));
  const rng = new RNG();
  const blocks = Math.max(1, Math.round(st.hands / 100));
  const N = blocks * 100;
  const P = Math.min(5000, Math.max(10, st.paths));
  const mu = st.wr; // per 100 hands
  const sd = st.sd;
  const finals = new Float64Array(P);
  const drawdowns = new Float64Array(P);
  let ruined = 0;
  const showPaths = [];
  const step = Math.max(1, Math.floor(blocks / 200)); // keep charts light
  for (let p = 0; p < P; p++) {
    let x = 0;
    let peak = 0;
    let dd = 0;
    let hitRuin = false;
    const path = p < 40 ? [0] : null;
    for (let b = 1; b <= blocks; b++) {
      // CLT: the sum of 100 hands is ~ Normal(mu, sd)
      x += mu + sd * rng.normal();
      if (x > peak) peak = x;
      if (peak - x > dd) dd = peak - x;
      if (x <= -st.bankroll) hitRuin = true;
      if (path && b % step === 0) path.push(x);
    }
    finals[p] = x;
    drawdowns[p] = dd;
    if (hitRuin) ruined++;
    if (path) showPaths.push(path);
  }
  const sorted = Float64Array.from(finals).sort();
  const expected = (mu * N) / 100;
  const sdN = sd * Math.sqrt(N / 100);
  const pLossTheory = normalCdf(0, expected, sdN);
  const pLossSim = finals.filter((v) => v < 0).length / P;
  // Brownian motion with drift: exact first-passage probability within horizon T
  const muH = mu / 100;
  const varH = (sd * sd) / 100;
  const B = st.bankroll;
  const T = N;
  const ruinFinite =
    normalCdf((-B - muH * T) / Math.sqrt(varH * T)) + (muH !== 0 ? Math.exp((-2 * muH * B) / varH) * normalCdf((-B + muH * T) / Math.sqrt(varH * T)) : normalCdf((-B) / Math.sqrt(varH * T)));
  const ruinInf = muH > 0 ? Math.exp((-2 * muH * B) / varH) : 1;
  const ddSorted = Float64Array.from(drawdowns).sort();

  out.append(
    el(
      'div.panel',
      {},
      el('h3', {}, `${num(P)} players × ${num(N)} hands at ${signed(mu, 1)} bb/100 (SD ${num(sd)})`),
      el(
        'div.tiles',
        {},
        statTile('Expected result', `${signed(expected, 0)} bb`, `win rate × hands / 100`),
        statTile('SD of the result', `${num(sdN, 0)} bb`, `${num(sd)} × √(${num(N)}/100)`),
        statTile('95% of players end between', `${signed(expected - 1.96 * sdN, 0)} and ${signed(expected + 1.96 * sdN, 0)}`, `simulated: ${signed(percentileSorted(sorted, 0.025), 0)} to ${signed(percentileSorted(sorted, 0.975), 0)}`),
        statTile('P(losing money)', pct(pLossTheory, 1), `simulated: ${pct(pLossSim, 1)}`),
        statTile('P(going broke) in these hands', pct(Math.min(1, ruinFinite), 1), `simulated: ${pct(ruined / P, 1)} · bankroll ${num(B)} bb`),
        statTile(term('Risk of ruin', 'risk-of-ruin'), muH > 0 ? pct(ruinInf, 2) : '100%', 'ever, playing forever: e^(−2μB/σ²)'),
      ),
      mathBlock(
        `<p>Per hand: μ = ${muH.toFixed(3)} bb, σ² = ${num(varH, 1)} bb² (SD per 100 hands = σ × √100).</p>
<p>After n hands: mean = nμ = ${num(expected, 1)}, SD = σ√n = ${num(sdN, 1)} (variances add: Var(ΣX) = nσ²).</p>
<p>P(loss) = Φ((0 − nμ) / (σ√n)) = Φ(${((0 - expected) / sdN).toFixed(3)}) = ${pct(pLossTheory, 2)}.</p>
<p>Ruin within T hands (Brownian motion first passage): Φ((−B − μT)/(σ√T)) + e^(−2μB/σ²)·Φ((−B + μT)/(σ√T)) = ${pct(ruinFinite, 2)}.
The simulation checks only once per 100 hands, so it slightly underestimates.</p>
<p>Risk of ruin forever: e^(−2μB/σ²) = e^(−2 × ${muH.toFixed(3)} × ${B} / ${num(varH, 1)}) = ${muH > 0 ? pct(ruinInf, 3) : '1 (no edge → certain ruin eventually)'}.</p>`,
      ),
    ),
  );

  // Paths
  const c1 = el('div');
  const xs = showPaths[0].map((_, k) => k * step * 100);
  const band = { lo: xs.map((h) => (mu * h) / 100 - 1.96 * sd * Math.sqrt(h / 100)), hi: xs.map((h) => (mu * h) / 100 + 1.96 * sd * Math.sqrt(h / 100)), name: '95% band (±1.96σ√n)', color: 'var(--band)' };
  out.append(el('div.panel', {}, el('h3', {}, '40 of the simulated players'), el('p.small.muted', {}, 'Same skill, wildly different results. The band widens like √n while the expected line grows like n — which is why skill eventually wins.'), c1));
  lineChart(c1, {
    series: [{ name: 'Expected (bb)', values: xs.map((h) => (mu * h) / 100), color: SERIES(1), dash: true }],
    paths: showPaths,
    band,
    xStep: step * 100,
    hlines: [{ y: -B, label: `bankroll −${num(B)} bb` }, { y: 0, label: '' }],
    xName: 'hands',
    xLabel: 'hands played',
    yLabel: 'big blinds',
    height: 300,
    endDots: false,
  });

  // Final distribution
  const h = histogram(Array.from(finals), 40);
  const c2 = el('div');
  out.append(
    el(
      'div.panel',
      {},
      el('h3', {}, 'Distribution of final results'),
      el('p.small.muted', {}, 'Bars: simulated players. Line: the Normal(nμ, σ√n) curve predicted by the central limit theorem.'),
      c2,
    ),
  );
  histogramChart(c2, {
    ...h,
    curve: (x) => normalPdf(x, expected, sdN) * P * h.width,
    xLabel: 'final result (bb)',
    unit: 'players',
    markers: [{ x: 0, label: 'break-even' }],
    colorFor: (x) => (x < 0 ? 'var(--neg-fill)' : SERIES(0)),
    legend: [
      { label: 'Simulated players', color: SERIES(0), kind: 'rect' },
      { label: 'Losing players', color: 'var(--neg-fill)', kind: 'rect' },
      { label: 'Normal curve (CLT)', color: SERIES(1), kind: 'line' },
    ],
  });

  // Drawdowns
  const hd = histogram(Array.from(drawdowns), 40);
  const c3 = el('div');
  out.append(
    el(
      'div.panel',
      {},
      el('h3', {}, 'Biggest downswing (peak-to-trough) during the run'),
      el(
        'p.small.muted',
        {},
        `Median worst downswing: ${num(percentileSorted(ddSorted, 0.5), 0)} bb. 1 in 10 players suffers ${num(percentileSorted(ddSorted, 0.9), 0)} bb or worse — while winning ${signed(mu, 1)} bb/100!`,
      ),
      c3,
    ),
  );
  histogramChart(c3, { ...hd, xLabel: 'largest drawdown (bb)', unit: 'players', color: SERIES(2), markers: [{ x: percentileSorted(ddSorted, 0.5), label: 'median' }] });
}

function buildSampleSize() {
  const box = $('#var-sample', root);
  const rows = [1000, 5000, 10000, 50000, 100000, 500000, 1000000].map((n) => {
    const half = (1.96 * st.sd) / Math.sqrt(n / 100);
    return el('tr', {}, el('td', {}, num(n)), el('td', {}, `± ${num(half, 1)} bb/100`), el('td', {}, `${signed(st.wr - half, 1)} to ${signed(st.wr + half, 1)}`));
  });
  box.append(
    el('h3', {}, 'How many hands until you know your win rate?'),
    el('p.small.muted', {}, `95% confidence interval half-width = 1.96 × SD / √(hands/100), using SD = ${st.sd} bb/100 and a true rate of ${st.wr} bb/100.`),
    el('div.table-scroll', {}, el('table.results-table', {}, el('thead', {}, el('tr', {}, ['Hands', '95% CI half-width', 'Your observed rate would be in']. map((h) => el('th', {}, h)))), el('tbody', {}, rows))),
    el('p.small', {}, 'To halve the uncertainty you need four times the hands (the √n law).'),
  );
}

function buildClt() {
  const box = $('#var-clt', root);
  const out = el('div');
  box.append(
    el('h3', {}, 'Central limit theorem with real poker hands'),
    el(
      'p.small.muted',
      {},
      'Single-hand results are skewed and heavy-tailed. Draw random hands from a real sample (with replacement — the ',
      el('i', {}, 'bootstrap'),
      ') and add them up: the sum of n hands looks more and more like a bell curve.',
    ),
    el('button.btn.primary', { onclick: () => runClt(out) }, 'Generate 3,000 hands of bots playing and run the demo'),
    out,
  );
}

function runClt(out) {
  clear(out).append(el('p.muted', {}, 'Simulating…'));
  setTimeout(() => {
    const g = new Game({ seats: ['tag', 'lag', 'station', 'nit', 'maniac', 'math'].map((p, i) => ({ name: `B${i}`, profile: p })), seed: 7 });
    const rng = new RNG(11);
    const sample = [];
    for (let k = 0; k < 3000; k++) {
      g.startHand();
      while (!g.hand.finished) {
        const p = g.current;
        g.act(botDecide(g.viewFor(p.id), p.profile, rng, { sims: 80 }));
      }
      sample.push(g.hand.result.net[0] / g.bb); // the TAG seat
    }
    clear(out);
    const m = mean(sample);
    const s = stdDev(sample);
    out.append(el('p.small', {}, `Sample: 3,000 hands of the TAG bot. Mean ${signed(m, 3)} bb/hand, SD ${num(s, 2)} bb/hand, skewness ${num(skewness(sample), 2)}.`));
    const grid = el('div.grid-2');
    out.append(grid);
    const brng = new RNG(5);
    for (const n of [1, 5, 25, 100]) {
      const sums = [];
      for (let t = 0; t < 4000; t++) {
        let acc = 0;
        for (let k = 0; k < n; k++) acc += sample[brng.int(sample.length)];
        sums.push(acc);
      }
      const sorted = [...sums].sort((a, b) => a - b);
      const lo = percentileSorted(sorted, 0.005);
      const hi = percentileSorted(sorted, 0.995);
      const inRange = sums.filter((x) => x >= lo && x <= hi);
      const h = histogram(inRange, 36, [lo, hi]);
      const c = el('div');
      grid.append(el('div', {}, el('h4', {}, `Sum of ${n} hand${n > 1 ? 's' : ''}`), el('div.small.muted', {}, `skewness ${num(skewness(sums), 2)} (0 = symmetric)`), c));
      histogramChart(c, {
        ...h,
        height: 170,
        curve: (x) => normalPdf(x, n * m, s * Math.sqrt(n)) * inRange.length * h.width,
        xLabel: 'bb',
        unit: 'samples',
      });
    }
    out.append(
      mathBlock(
        `<p>CLT: if X₁…Xₙ are independent with mean μ and SD σ, then ΣXᵢ ≈ Normal(nμ, σ√n) for large n — whatever the shape of a single Xᵢ.</p>
<p>The orange curve is Normal(n × ${m.toFixed(3)}, ${s.toFixed(2)} × √n). For n = 1 it fits badly (big spike at 0: folded hands); by n = 100 it fits well. Skewness shrinks like 1/√n.</p>`,
      ),
    );
  }, 30);
}

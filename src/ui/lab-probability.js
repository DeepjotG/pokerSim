// Probability Lab: combinatorics, theory vs simulation, chi-square goodness of fit.

import { nCr, chiSquareTest, wilsonInterval } from '../core/stats.js';
import { evaluate, HAND_NAMES } from '../core/evaluator.js';
import { rankOf, suitOf } from '../core/cards.js';
import { RNG } from '../core/rng.js';
import { el, $, clear, pct, num, term, mathBlock } from './dom.js';
import { barChart, SERIES } from './charts.js';

const C = nCr;

// Each event: theory (exact probability), formula (HTML), and a sampler using a shuffled deck.
const EVENTS = [
  {
    name: 'Dealt a pocket pair',
    p: 78 / 1326,
    formula: '13 ranks × C(4,2) / C(52,2) = 78 / 1,326',
    deal: 2,
    test: (h) => rankOf(h[0]) === rankOf(h[1]),
  },
  {
    name: 'Dealt pocket aces',
    p: 6 / 1326,
    formula: 'C(4,2) / C(52,2) = 6 / 1,326',
    deal: 2,
    test: (h) => rankOf(h[0]) === 12 && rankOf(h[1]) === 12,
  },
  {
    name: 'Dealt suited cards',
    p: 312 / 1326,
    formula: '4 suits × C(13,2) / C(52,2) = 312 / 1,326',
    deal: 2,
    test: (h) => suitOf(h[0]) === suitOf(h[1]),
  },
  {
    name: 'Dealt AK (any suits)',
    p: 16 / 1326,
    formula: '4 × 4 / C(52,2) = 16 / 1,326',
    deal: 2,
    test: (h) => (rankOf(h[0]) === 12 && rankOf(h[1]) === 11) || (rankOf(h[0]) === 11 && rankOf(h[1]) === 12),
  },
  {
    name: 'At least one ace',
    p: 1 - C(48, 2) / C(52, 2),
    formula: '1 − C(48,2) / C(52,2) = 1 − 1,128 / 1,326 (complement rule)',
    deal: 2,
    test: (h) => rankOf(h[0]) === 12 || rankOf(h[1]) === 12,
  },
  {
    name: 'Pocket pair flops a set (or quads)',
    p: 1 - C(48, 3) / C(50, 3),
    formula: '1 − C(48,3) / C(50,3) = 1 − 17,296 / 19,600',
    condition: 'given a pocket pair',
    deal: 5,
    given: (h) => rankOf(h[0]) === rankOf(h[1]),
    test: (h) => [h[2], h[3], h[4]].some((c) => rankOf(c) === rankOf(h[0])),
  },
  {
    name: 'Suited hand flops a flush',
    p: C(11, 3) / C(50, 3),
    formula: 'C(11,3) / C(50,3) = 165 / 19,600',
    condition: 'given suited hole cards',
    deal: 5,
    given: (h) => suitOf(h[0]) === suitOf(h[1]),
    test: (h) => [h[2], h[3], h[4]].every((c) => suitOf(c) === suitOf(h[0])),
  },
  {
    name: 'Suited hand flops a flush draw (exactly 2 of suit)',
    p: (C(11, 2) * 39) / C(50, 3),
    formula: 'C(11,2) × 39 / C(50,3) = 2,145 / 19,600',
    condition: 'given suited hole cards',
    deal: 5,
    given: (h) => suitOf(h[0]) === suitOf(h[1]),
    test: (h) => [h[2], h[3], h[4]].filter((c) => suitOf(c) === suitOf(h[0])).length === 2,
  },
  {
    name: 'Unpaired hand pairs at least one hole card on the flop',
    p: 1 - C(44, 3) / C(50, 3),
    formula: '1 − C(44,3) / C(50,3) = 1 − 13,244 / 19,600 (6 cards pair you, 44 don’t)',
    condition: 'given unpaired hole cards',
    deal: 5,
    given: (h) => rankOf(h[0]) !== rankOf(h[1]),
    test: (h) => [h[2], h[3], h[4]].some((c) => rankOf(c) === rankOf(h[0]) || rankOf(c) === rankOf(h[1])),
  },
  {
    name: 'Flop is monotone (all one suit)',
    p: (4 * C(13, 3)) / C(52, 3),
    formula: '4 × C(13,3) / C(52,3) = 1,144 / 22,100',
    deal: 3,
    test: (h) => suitOf(h[0]) === suitOf(h[1]) && suitOf(h[1]) === suitOf(h[2]),
  },
];

const SEVEN = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584];
const SEVEN_TOTAL = 133784560;

let root;
const rng = new RNG();

export function initProbabilityLab(container) {
  root = container;
  root.append(
    el(
      'div.lab-intro',
      {},
      el('h2', {}, 'Probability Lab'),
      el(
        'p',
        {},
        'Poker is applied ',
        term('combinatorics', 'combinatorics'),
        ': every probability is a ratio of counts. Here you can check each formula against a simulation, and test whether the simulated deck is fair with a ',
        term('chi-square test', 'chi-square'),
        '.',
      ),
    ),
    el('div#prob-events.panel'),
    el('div#prob-seven.panel'),
    el('div#prob-ncr.panel'),
  );
  buildEvents();
  buildSeven();
  buildNcr();
}

function buildEvents() {
  const box = $('#prob-events', root);
  const nSel = el('select', {}, [1000, 10000, 100000].map((n) => el('option', { value: n, selected: n === 10000 }, num(n))));
  const tbody = el('tbody');
  const run = () => {
    const N = +nSel.value;
    clear(tbody);
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (const ev of EVENTS) {
      let hits = 0;
      let trials = 0;
      let attempts = 0;
      while (trials < N && attempts < N * 30) {
        attempts++;
        // partial Fisher-Yates: only shuffle the cards we need
        for (let i = 0; i < ev.deal; i++) {
          const j = i + rng.int(52 - i);
          const t = deck[i];
          deck[i] = deck[j];
          deck[j] = t;
        }
        if (ev.given && !ev.given(deck)) continue;
        trials++;
        if (ev.test(deck)) hits++;
      }
      const obs = hits / trials;
      const se = Math.sqrt((ev.p * (1 - ev.p)) / trials);
      const z = (obs - ev.p) / se;
      const ci = wilsonInterval(hits, trials);
      const inside = ev.p >= ci[0] && ev.p <= ci[1];
      tbody.append(
        el(
          'tr',
          {},
          el('td', {}, el('b', {}, ev.name), ev.condition ? el('div.small.muted', {}, ev.condition) : null, el('div.small.formula', {}, ev.formula)),
          el('td', {}, pct(ev.p, 2), el('div.small.muted', {}, `1 in ${num(1 / ev.p, 1)}`)),
          el('td', {}, pct(obs, 2), el('div.small.muted', {}, `${num(hits)} / ${num(trials)}`)),
          el('td', {}, `${pct(ci[0], 2)} – ${pct(ci[1], 2)}`),
          el('td', {}, el(`span.badge.${Math.abs(z) < 1.96 ? 'good' : 'meh'}`, {}, `z = ${z.toFixed(2)}`)),
          el('td', {}, inside ? '✓' : '✗ (happens ~5% of the time)'),
        ),
      );
    }
  };
  box.append(
    el('h3', {}, 'Theory vs simulation'),
    el('div.row', {}, el('label.inline', {}, 'Trials per event ', nSel), el('button.btn.primary', { onclick: run }, 'Simulate'), el('button.btn', { onclick: run }, 'Again (new random sample)')),
    el(
      'div.table-scroll',
      {},
      el(
        'table.results-table',
        {},
        el('thead', {}, el('tr', {}, ['Event', 'Exact probability', 'Simulated', '95% CI (Wilson)', 'z-score', 'Theory in CI?'].map((h) => el('th', {}, h)))),
        tbody,
      ),
    ),
    mathBlock(
      `<p>z = (observed − p) / √(p(1 − p) / n) measures how many standard errors the simulation is from theory.
If the deck is fair, z is approximately standard normal: |z| &lt; 1.96 about 95% of the time.
With 10 events, seeing one ✗ now and then is <b>expected</b> — it's the multiple-comparisons problem.</p>
<p>Conditional events ("given a pocket pair") are simulated by <b>rejection sampling</b>: deal hands, keep only those that satisfy the condition.</p>`,
    ),
  );
  run();
}

function buildSeven() {
  const box = $('#prob-seven', root);
  const nSel = el('select', {}, [10000, 100000, 1000000].map((n) => el('option', { value: n, selected: n === 100000 }, num(n))));
  const out = el('div');
  const run = () => {
    const N = +nSel.value;
    const counts = new Array(9).fill(0);
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const hand = new Array(7);
    for (let t = 0; t < N; t++) {
      for (let i = 0; i < 7; i++) {
        const j = i + rng.int(52 - i);
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
        hand[i] = deck[i];
      }
      counts[evaluate(hand) >> 20]++;
    }
    const probs = SEVEN.map((c) => c / SEVEN_TOTAL);
    const test = chiSquareTest(counts, probs);
    clear(out);
    const tbody = el('tbody');
    for (let i = 8; i >= 0; i--) {
      const contrib = (counts[i] - test.expected[i]) ** 2 / test.expected[i];
      tbody.append(
        el(
          'tr',
          {},
          el('td', {}, HAND_NAMES[i]),
          el('td', {}, num(SEVEN[i])),
          el('td', {}, pct(probs[i], 4)),
          el('td', {}, num(test.expected[i], 1)),
          el('td', {}, num(counts[i])),
          el('td', {}, contrib.toFixed(2)),
        ),
      );
    }
    out.append(
      el(
        'div.table-scroll',
        {},
        el(
          'table.results-table',
          {},
          el('thead', {}, el('tr', {}, ['Hand', 'Combos of 133,784,560', 'Exact probability', 'Expected count', 'Observed', '(O − E)² / E'].map((h) => el('th', {}, h)))),
          tbody,
        ),
      ),
      el(
        `div.verdict.${test.pValue > 0.05 ? 'good' : 'meh'}`,
        {},
        `χ² = ${test.stat.toFixed(2)} with ${test.df} degrees of freedom → p-value = ${test.pValue.toFixed(3)}. `,
        test.pValue > 0.05 ? 'No evidence the dealing is unfair.' : 'p < 0.05 — this will happen ~5% of the time even with a fair deck. Run it again!',
      ),
    );
    const chart = el('div');
    out.append(chart);
    barChart(
      chart,
      HAND_NAMES.map((name, i) => ({ label: name, exp: probs[i], obs: counts[i] / N }))
        .reverse(),
      {
        series: [
          { name: 'Exact probability', key: 'exp', color: SERIES(0) },
          { name: 'Simulated frequency', key: 'obs', color: SERIES(1) },
        ],
        fmt: (v) => pct(v, v < 0.01 ? 3 : 1),
        labelWidth: 118,
        valueWidth: 120,
      },
    );
    out.append(
      mathBlock(
        `<p>χ² = Σ (O − E)² / E sums the squared, scaled gaps between observed (O) and expected (E) counts.</p>
<p>With k = 9 categories there are k − 1 = 8 degrees of freedom (the counts must sum to N). The p-value is P(χ²₈ ≥ ${test.stat.toFixed(2)}).</p>
<p>Exact counts come from enumerating all C(52,7) = 133,784,560 seven-card hands (run <code>npm run verify</code> to reproduce).</p>`,
      ),
    );
  };
  box.append(
    el('h3', {}, 'Seven-card hand frequencies and a chi-square test'),
    el('p.small.muted', {}, 'Deal N random 7-card hands (2 hole cards + 5 board) and compare the hand categories with the exact frequencies.'),
    el('div.row', {}, el('label.inline', {}, 'Hands to deal ', nSel), el('button.btn.primary', { onclick: run }, 'Deal & test')),
    out,
  );
  run();
}

function buildNcr() {
  const box = $('#prob-ncr', root);
  const n = el('input', { type: 'number', value: 52, min: 0, max: 52 });
  const k = el('input', { type: 'number', value: 2, min: 0, max: 52 });
  const out = el('div');
  const update = () => {
    const N = Math.max(0, Math.min(170, +n.value || 0));
    const K = Math.max(0, Math.min(N, +k.value || 0));
    const terms = [];
    for (let i = 0; i < Math.min(K, 6); i++) terms.push(N - i);
    const denom = [];
    for (let i = Math.min(K, 6); i >= 1; i--) denom.push(i);
    clear(out).append(
      el('p', {}, el('b', {}, `C(${N}, ${K}) = ${num(nCr(N, K))}`)),
      el(
        'p.small.formula',
        {},
        K <= 6 && K > 0 ? `= (${terms.join(' × ')}) / (${denom.join(' × ')})` : `= ${N}! / (${K}! × ${N - K}!)`,
      ),
    );
  };
  n.addEventListener('input', update);
  k.addEventListener('input', update);
  const examples = [
    [52, 2, 'starting hands'],
    [50, 3, 'flops you can see'],
    [48, 5, 'boards in a heads-up all-in preflop'],
    [52, 5, '5-card poker hands'],
    [52, 7, '7-card hands'],
    [45, 2, 'turn+river runouts on the flop (heads-up)'],
  ];
  box.append(
    el('h3', {}, 'Combinations calculator'),
    el('div.row', {}, el('label.inline', {}, 'n ', n), el('label.inline', {}, 'k ', k)),
    out,
    el(
      'ul.small',
      {},
      examples.map(([a, b, d]) =>
        el(
          'li',
          {},
          el('a', { href: '#', onclick: (e) => (e.preventDefault(), (n.value = a), (k.value = b), update()) }, `C(${a}, ${b}) = ${num(nCr(a, b))}`),
          ` — ${d}`,
        ),
      ),
    ),
  );
  update();
}

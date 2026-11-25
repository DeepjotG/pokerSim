// Equity Lab: exact enumeration vs Monte Carlo, with a live convergence chart.

import { exactEquityGen, monteCarloGen, exactWork, EXACT_WORK_LIMIT } from '../core/equity.js';
import { parseRange, rangeCombos, rangeComboCount } from '../core/ranges.js';
import { HAND_NAMES } from '../core/evaluator.js';
import { RNG } from '../core/rng.js';
import { el, $, clear, pct, num, cardInput, term, mathBlock, runChunked } from './dom.js';
import { lineChart, barChart, SERIES } from './charts.js';

const PRESETS = [
  { name: 'AA vs KK', players: [['hand', 'AsAh'], ['hand', 'KsKh']], board: '' },
  { name: 'Coin flip: AKo vs QQ', players: [['hand', 'AhKd'], ['hand', 'QsQc']], board: '' },
  { name: 'Domination: AK vs AQ', players: [['hand', 'AsKd'], ['hand', 'AhQc']], board: '' },
  { name: 'Flush draw vs top pair (flop)', players: [['hand', 'Ah5h'], ['hand', 'KsQd']], board: 'Kh9h2c' },
  { name: 'Set vs overpair (flop)', players: [['hand', '7c7d'], ['hand', 'AsAh']], board: '7h2s9c' },
  { name: 'AA vs a random hand', players: [['hand', 'AsAh'], ['random', '']], board: '' },
  { name: '72o vs a random hand', players: [['hand', '7c2d'], ['random', '']], board: '' },
  { name: 'AKs vs range QQ+', players: [['hand', 'AsKs'], ['range', 'QQ+']], board: '' },
  { name: '3-way: AA vs KK vs QQ', players: [['hand', 'AsAh'], ['hand', 'KsKh'], ['hand', 'QsQh']], board: '' },
  { name: 'Pocket 22 vs 5 random hands', players: [['hand', '2c2d'], ['random', ''], ['random', ''], ['random', ''], ['random', ''], ['random', '']], board: '' },
];

let state = { rows: [], job: null };
let root;

export function initEquityLab(container) {
  root = container;
  root.append(
    el(
      'div.lab-intro',
      {},
      el('h2', {}, 'Equity Lab'),
      el(
        'p',
        {},
        term('Equity', 'equity'),
        ' is the share of the pot a hand wins on average. This lab computes it two ways: ',
        term('exact enumeration', 'exact-enumeration'),
        ' (check every possible board: zero error) and ',
        term('Monte Carlo', 'monte-carlo'),
        ' (sample random boards: fast, but with a ',
        term('standard error', 'standard-error'),
        ' that shrinks like 1/√n). Watch the estimate converge inside its ',
        term('95% confidence interval', 'ci'),
        '.',
      ),
    ),
    el('div.preset-row', {}, el('span.muted', {}, 'Presets: '), PRESETS.map((p) => el('button.chip-btn', { onclick: () => loadPreset(p) }, p.name))),
    el(
      'div.panel',
      {},
      el('div#eq-rows'),
      el('button.btn.small', { onclick: () => addRow('random', '') }, '+ Add player'),
      el('div.eq-board', {}, el('label', {}, 'Board (0–5 cards)'), el('div#eq-board'), el('label', {}, 'Dead cards'), el('div#eq-dead')),
      el(
        'div.eq-controls',
        {},
        el('label', {}, 'Method ', el('select#eq-method', {}, el('option', { value: 'auto' }, 'Auto'), el('option', { value: 'exact' }, 'Exact enumeration'), el('option', { value: 'mc' }, 'Monte Carlo'))),
        el(
          'label',
          {},
          'Monte Carlo trials ',
          el('select#eq-trials', {}, [1000, 10000, 50000, 200000, 1000000].map((n) => el('option', { value: n, selected: n === 50000 }, num(n)))),
        ),
        el('label', {}, 'Seed ', el('input#eq-seed', { type: 'text', size: 8, placeholder: 'random' })),
        el('button.btn.primary#eq-run', { onclick: run }, 'Calculate'),
        el('span#eq-work.muted.small'),
      ),
    ),
    el('div#eq-out'),
  );
  state.board = cardInput({ placeholder: 'e.g. Kh9h2c', max: 5, onchange: updateWork });
  state.dead = cardInput({ placeholder: 'optional', max: 10, onchange: updateWork });
  $('#eq-board', root).append(state.board);
  $('#eq-dead', root).append(state.dead);
  loadPreset(PRESETS[3]);
}

function addRow(kind, value) {
  if (state.rows.length >= 6) return;
  const box = $('#eq-rows', root);
  const valueBox = el('div.eq-value');
  const kindSel = el('select', {}, el('option', { value: 'hand' }, 'Specific hand'), el('option', { value: 'range' }, 'Range'), el('option', { value: 'random' }, 'Random hand'));
  kindSel.value = kind;
  const row = { kind, el: null, input: null, rangeInput: null, info: el('span.muted.small') };
  const build = () => {
    clear(valueBox);
    row.kind = kindSel.value;
    if (row.kind === 'hand') {
      row.input = cardInput({ placeholder: 'e.g. AhKd', max: 2, onchange: updateWork });
      valueBox.append(row.input);
      if (value && kind === 'hand') row.input.setValue(value);
    } else if (row.kind === 'range') {
      row.rangeInput = el('input.range-input', { type: 'text', placeholder: 'e.g. TT+, AKs, KQo or 15%', value: kind === 'range' ? value : 'QQ+, AK' });
      row.rangeInput.addEventListener('input', () => {
        updateRangeInfo(row);
        updateWork();
      });
      valueBox.append(row.rangeInput, row.info);
      updateRangeInfo(row);
    } else {
      valueBox.append(el('span.muted', {}, 'Any two cards (all 1,326 combos, minus blockers)'));
    }
    updateWork();
  };
  kindSel.addEventListener('change', () => {
    value = '';
    build();
  });
  const idx = state.rows.length;
  row.el = el(
    'div.eq-row-input',
    {},
    el('span.player-dot', { style: { background: SERIES(idx) } }),
    el('b', {}, `Player ${idx + 1}`),
    kindSel,
    valueBox,
    el(
      'button.btn.small.ghost',
      {
        title: 'Remove',
        onclick: () => {
          if (state.rows.length <= 2) return;
          state.rows.splice(state.rows.indexOf(row), 1);
          row.el.remove();
          relabel();
          updateWork();
        },
      },
      '✕',
    ),
  );
  box.append(row.el);
  state.rows.push(row);
  build();
}

function relabel() {
  state.rows.forEach((r, i) => {
    r.el.querySelector('b').textContent = `Player ${i + 1}`;
    r.el.querySelector('.player-dot').style.background = SERIES(i);
  });
}

function updateRangeInfo(row) {
  try {
    const set = parseRange(row.rangeInput.value);
    const n = rangeComboCount(set);
    row.info.textContent = ` ${set.size} hand classes · ${n} combos · ${pct(n / 1326)} of all hands`;
    row.info.classList.remove('input-error');
  } catch (e) {
    row.info.textContent = ` ${e.message}`;
    row.info.classList.add('input-error');
  }
}

function loadPreset(p) {
  state.rows = [];
  clear($('#eq-rows', root));
  for (const [k, v] of p.players) addRow(k, v);
  state.board.setValue(p.board);
  state.dead.setValue('');
  updateWork();
}

function buildSpec() {
  const players = state.rows.map((r, i) => {
    if (r.kind === 'hand') {
      const c = r.input.getCards();
      if (!c || c.length !== 2) throw new Error(`Player ${i + 1}: enter exactly two cards`);
      return { cards: c };
    }
    if (r.kind === 'range') {
      const set = parseRange(r.rangeInput.value);
      if (!set.size) throw new Error(`Player ${i + 1}: empty range`);
      return { combos: rangeCombos(set) };
    }
    return { random: true };
  });
  const board = state.board.getCards();
  if (!board) throw new Error('Invalid board');
  if (board.length > 5 || (board.length > 0 && board.length < 3)) throw new Error('Board must have 0, 3, 4 or 5 cards');
  const dead = state.dead.getCards() || [];
  return { players, board, dead };
}

function updateWork() {
  const w = $('#eq-work', root);
  if (!w) return;
  try {
    const spec = buildSpec();
    const work = exactWork(spec);
    w.textContent = `Exact enumeration needs ≈ ${work > 1e12 ? work.toExponential(1) : num(work)} hand evaluations ${work <= EXACT_WORK_LIMIT ? '→ feasible' : '→ too many, Monte Carlo will be used in Auto mode'}.`;
  } catch (e) {
    w.textContent = e.message;
  }
}

function run() {
  if (state.job) state.job.cancel();
  const out = clear($('#eq-out', root));
  let spec;
  try {
    spec = buildSpec();
  } catch (e) {
    out.append(el('p.input-error', {}, e.message));
    return;
  }
  const method = $('#eq-method', root).value;
  const trials = +$('#eq-trials', root).value;
  const seedTxt = $('#eq-seed', root).value.trim();
  const rng = new RNG(seedTxt ? Number(seedTxt) || seedTxt.length * 7919 : undefined);
  const work = exactWork(spec);
  const exact = method === 'exact' || (method === 'auto' && work <= EXACT_WORK_LIMIT);
  if (method === 'exact' && work > 60_000_000) {
    out.append(el('p.input-error', {}, `Exact enumeration would need ${work.toExponential(2)} evaluations — that would freeze your browser. Use Monte Carlo.`));
    return;
  }
  const gen = exact ? exactEquityGen(spec, { chunk: 20000 }) : monteCarloGen(spec, { iterations: trials, rng, chunk: Math.max(200, Math.floor(trials / 400)) });
  const resultsBox = el('div');
  const chartBox = el('div');
  const status = el('div.muted.small');
  out.append(el('div.panel', {}, el('h3', {}, 'Results'), status, resultsBox));
  if (!exact) out.append(el('div.panel', {}, el('h3', {}, 'Convergence of Player 1’s equity'), chartBox, el('div#eq-conv-note')));
  const history = [];
  let lastDraw = 0;
  const t0 = performance.now();
  state.job = runChunked(gen, (snap, done) => {
    if (!exact) {
      const p = snap.players[0];
      history.push([snap.trials, p.equity, p.ci[0], p.ci[1]]);
    }
    const now = performance.now();
    if (done || now - lastDraw > 150) {
      lastDraw = now;
      status.textContent = `${exact ? 'Exact enumeration' : 'Monte Carlo'}: ${num(snap.trials)} ${exact ? 'boards' : 'trials'}${done ? '' : '…'} · ${((now - t0) / 1000).toFixed(2)} s`;
      renderResults(resultsBox, snap, spec, exact);
      if (!exact && history.length > 1) renderConvergence(chartBox, history, null);
    }
    if (done && !exact) {
      // Compare with the exact answer when it is cheap enough.
      if (work <= EXACT_WORK_LIMIT) {
        const ex = runAll(exactEquityGen(spec));
        renderConvergence(chartBox, history, ex.players[0].equity);
        const p = snap.players[0];
        const z = (p.equity - ex.players[0].equity) / (p.se || 1);
        $('#eq-conv-note', root).append(
          el(
            'p.small',
            {},
            `Exact answer: ${pct(ex.players[0].equity, 3)}. Monte Carlo: ${pct(p.equity, 3)} ± ${pct(1.96 * p.se, 3)}. Error = ${(z >= 0 ? '+' : '') + z.toFixed(2)} standard errors — `,
            Math.abs(z) < 1.96 ? 'inside the 95% interval, as expected 95% of the time.' : 'outside the 95% interval — this happens 5% of the time by chance!',
          ),
        );
      } else {
        $('#eq-conv-note', root).append(el('p.small.muted', {}, 'Exact enumeration is too expensive here, so the confidence interval is the only measure of accuracy we have.'));
      }
      $('#eq-conv-note', root).append(
        mathBlock(
          `<p>Each trial produces X ∈ {0, 1/k, 1} (lose, k-way tie, win). The estimate is the sample mean p̂ = ΣX / n.</p>
<p>SE = s / √n where s is the sample SD of X. After n = ${num(snap.trials)} trials: SE = ${pct(snap.players[0].se, 3)}.</p>
<p>Going from 10,000 to 1,000,000 trials (100×) shrinks the error only 10× — the √n law.</p>`,
        ),
      );
    }
  });
}

function runAll(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

function describePlayer(spec, i) {
  const p = spec.players[i];
  if (p.cards) return null;
  if (p.combos) return `range (${p.combos.length} combos)`;
  return 'random hand';
}

function renderResults(box, snap, spec, exact) {
  clear(box);
  const tbl = el(
    'table.results-table',
    {},
    el('thead', {}, el('tr', {}, ['Player', 'Equity', 'Win', 'Tie', exact ? 'Error' : '95% CI'].map((h) => el('th', {}, h)))),
    el(
      'tbody',
      {},
      snap.players.map((p, i) => {
        const row = state.rows[i];
        const label = row.kind === 'hand' ? row.input.querySelector('.card-preview').cloneNode(true) : describePlayer(spec, i);
        return el(
          'tr',
          {},
          el('td', {}, el('span.player-dot', { style: { background: SERIES(i) } }), ` P${i + 1} `, label),
          el('td', {}, el('b', {}, pct(p.equity, 2)), el('div.eqbar', {}, el('div', { style: { width: `${p.equity * 100}%`, background: SERIES(i) } }))),
          el('td', {}, pct(p.win, 2)),
          el('td', {}, pct(p.tie, 2)),
          el('td', {}, exact ? 'none (exact)' : `${pct(p.ci[0], 2)} – ${pct(p.ci[1], 2)}`),
        );
      }),
    ),
  );
  box.append(tbl);
  const shown = snap.players.slice(0, 3);
  const items = HAND_NAMES.map((name, c) => {
    const it = { label: name };
    shown.forEach((p, i) => (it[`p${i}`] = p.categories[c]));
    return it;
  }).reverse();
  const cb = el('div');
  box.append(el('h4', {}, `Final hand categories${snap.players.length > 3 ? ' (first 3 players)' : ''}`), cb);
  barChart(cb, items, {
    series: shown.map((_, i) => ({ name: `Player ${i + 1}`, key: `p${i}`, color: SERIES(i) })),
    fmt: (v) => pct(v, v < 0.01 ? 2 : 1),
    max: Math.max(...items.flatMap((it) => shown.map((_, i) => it[`p${i}`]))),
    labelWidth: 118,
    valueWidth: shown.length * 52,
  });
}

function renderConvergence(box, history, exactValue) {
  lineChart(box, {
    series: [{ name: 'Monte Carlo estimate', points: history.map((h) => [h[0], h[1]]), color: SERIES(0) }],
    band: { lo: history.map((h) => h[2]), hi: history.map((h) => h[3]), name: '95% confidence interval', color: 'var(--band)' },
    xStep: history.length > 1 ? history[1][0] - history[0][0] : 1,
    xOffset: history[0][0],
    hlines: exactValue !== null ? [{ y: exactValue, label: `exact ${pct(exactValue, 2)}` }] : [],
    xName: 'trials',
    xLabel: 'trials',
    yLabel: 'equity',
    yFmt: (v) => pct(v, 1),
    xFmt: (v) => num(v),
  });
}

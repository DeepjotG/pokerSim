// Odds & EV Lab: pot-odds/EV calculator, bluff calculator, call-or-fold quiz, outs trainer.

import { potOdds, evCall, impliedOddsNeeded, breakEvenFoldEquity, evBet, hitProbability, ruleOf2And4, findOuts } from '../core/odds.js';
import { calcEquity } from '../core/equity.js';
import { HAND_NAMES, evaluate, describeScore } from '../core/evaluator.js';
import { Deck } from '../core/cards.js';
import { RNG } from '../core/rng.js';
import { wilsonInterval } from '../core/stats.js';
import { el, $, clear, pct, num, signed, sign, term, mathBlock, cardText } from './dom.js';
import { lineChart, SERIES } from './charts.js';

const rng = new RNG();
let root;

export function initOddsLab(container) {
  root = container;
  root.append(
    el(
      'div.lab-intro',
      {},
      el('h2', {}, 'Odds & EV Lab'),
      el(
        'p',
        {},
        'Every poker decision is an ',
        term('expected value', 'ev'),
        ' comparison. Calling needs equity above the ',
        term('pot odds', 'pot-odds'),
        '; bluffing needs enough ',
        term('fold equity', 'fold-equity'),
        '. Drawing hands are measured in ',
        term('outs', 'outs'),
        '.',
      ),
    ),
    el('div.grid-2', {}, el('div#odds-calc.panel'), el('div#bluff-calc.panel')),
    el('div.grid-2', {}, el('div#quiz.panel'), el('div#outs-trainer.panel')),
    el('div#outs-table.panel'),
  );
  buildCallCalc();
  buildBluffCalc();
  buildQuiz();
  buildOutsTrainer();
  buildOutsTable();
}

function numberInput(value, onInput, attrs = {}) {
  const i = el('input', { type: 'number', value, min: 0, step: 1, ...attrs });
  i.addEventListener('input', onInput);
  return i;
}

function slider(value, min, max, step, onInput) {
  const i = el('input', { type: 'range', value, min, max, step });
  i.addEventListener('input', onInput);
  return i;
}

// ------------------------------------------------------------------ call calculator

function buildCallCalc() {
  const box = $('#odds-calc', root);
  const st = { pot: 100, bet: 50, eq: 30 };
  const out = el('div');
  const chart = el('div');
  const eqLabel = el('b');
  const update = () => {
    const pot = st.pot + st.bet; // what you can win
    const po = potOdds(pot, st.bet);
    const eq = st.eq / 100;
    const ev = evCall(eq, pot, st.bet);
    const imp = impliedOddsNeeded(pot, st.bet, eq);
    eqLabel.textContent = `${st.eq}%`;
    clear(out).append(
      el(
        'div.kv',
        {},
        kvr('Pot you can win', `${num(st.pot)} + ${num(st.bet)} = ${num(pot)}`),
        kvr('Pot odds', `${num(pot)} : ${num(st.bet)} = ${po.ratio.toFixed(2)} : 1`),
        kvr('Required equity', el('b', {}, pct(po.requiredEquity))),
        kvr('EV(call)', el(`b.${sign(ev)}`, {}, `${signed(ev, 2)} chips`)),
        kvr('EV(fold)', '0'),
        ev < 0 ? kvr(term('Implied odds', 'implied-odds') , `need ≈ ${num(imp, 0)} more chips later`) : null,
      ),
      el(`div.verdict.${ev > 0 ? 'good' : ev < 0 ? 'bad' : 'meh'}`, {}, ev > 0 ? 'CALL (+EV)' : ev < 0 ? 'FOLD (calling is −EV)' : 'Break-even'),
      mathBlock(
        `<p>Required equity = Call / (Pot + Call) = ${st.bet} / (${pot} + ${st.bet}) = ${pct(po.requiredEquity, 2)}</p>
<p>EV(call) = eq × Pot − (1 − eq) × Call = ${eq.toFixed(2)} × ${pot} − ${(1 - eq).toFixed(2)} × ${st.bet} = ${signed(ev, 2)}</p>
<p>EV is a straight line in your equity; it crosses zero exactly at the required equity.</p>`,
      ),
    );
    const pts = [];
    for (let e = 0; e <= 100; e += 2) pts.push([e, evCall(e / 100, pot, st.bet)]);
    lineChart(chart, {
      series: [{ name: 'EV(call)', points: pts, color: SERIES(0) }],
      hlines: [{ y: 0, label: 'EV(fold) = 0' }],
      xName: 'equity %',
      xLabel: 'your equity (%)',
      yLabel: 'EV (chips)',
      height: 200,
      endDots: false,
      xFmt: (v) => `${v}%`,
    });
  };
  box.append(
    el('h3', {}, 'Call or fold? Pot-odds calculator'),
    el(
      'div.form-grid',
      {},
      el('label', {}, 'Pot before the bet', numberInput(st.pot, (e) => ((st.pot = +e.target.value || 0), update()))),
      el('label', {}, 'Opponent bets (you must call)', numberInput(st.bet, (e) => ((st.bet = Math.max(1, +e.target.value || 1)), update()))),
      el('label', {}, el('span', {}, 'Your equity ', eqLabel), slider(st.eq, 0, 100, 1, (e) => ((st.eq = +e.target.value), update()))),
    ),
    out,
    chart,
  );
  update();
}

function kvr(k, v) {
  return el('div.kv-row', {}, el('span.k', {}, k), el('span.v', {}, v));
}

// ------------------------------------------------------------------ bluff calculator

function buildBluffCalc() {
  const box = $('#bluff-calc', root);
  const st = { pot: 100, bet: 75, eq: 20, fe: 40 };
  const out = el('div');
  const chart = el('div');
  const labels = { eq: el('b'), fe: el('b') };
  const update = () => {
    labels.eq.textContent = `${st.eq}%`;
    labels.fe.textContent = `${st.fe}%`;
    const be = breakEvenFoldEquity(st.pot, st.bet);
    const r = evBet({ pot: st.pot, bet: st.bet, foldEquity: st.fe / 100, equityWhenCalled: st.eq / 100 });
    clear(out).append(
      el(
        'div.kv',
        {},
        kvr('Break-even fold % (pure bluff)', el('b', {}, pct(be))),
        kvr('If they fold you win', `${num(st.pot)}`),
        kvr('If called (EV)', `${signed(r.whenCalled, 1)}`),
        kvr('EV(bet)', el(`b.${sign(r.ev)}`, {}, `${signed(r.ev, 2)} chips`)),
      ),
      mathBlock(
        `<p>Pure bluff: FE·Pot − (1 − FE)·Bet = 0 → FE = Bet / (Pot + Bet) = ${st.bet} / ${st.pot + st.bet} = ${pct(be, 2)}</p>
<p>With equity when called: EV = FE·Pot + (1 − FE)·[eq·(Pot + Bet) − (1 − eq)·Bet]<br>
= ${(st.fe / 100).toFixed(2)}×${st.pot} + ${(1 - st.fe / 100).toFixed(2)}×[${(st.eq / 100).toFixed(2)}×${st.pot + st.bet} − ${(1 - st.eq / 100).toFixed(2)}×${st.bet}] = ${signed(r.ev, 2)}</p>
<p>A semi-bluff (a draw) needs less fold equity than a pure bluff because it can still win when called.</p>`,
      ),
    );
    const pure = [];
    const semi = [];
    for (let f = 0; f <= 100; f += 2) {
      pure.push([f, evBet({ pot: st.pot, bet: st.bet, foldEquity: f / 100, equityWhenCalled: 0 }).ev]);
      semi.push([f, evBet({ pot: st.pot, bet: st.bet, foldEquity: f / 100, equityWhenCalled: st.eq / 100 }).ev]);
    }
    lineChart(chart, {
      series: [
        { name: 'Pure bluff (0% equity)', points: pure, color: SERIES(1) },
        { name: `Semi-bluff (${st.eq}% when called)`, points: semi, color: SERIES(0) },
      ],
      hlines: [{ y: 0, label: 'break-even' }],
      xName: 'fold %',
      xLabel: 'how often they fold (%)',
      yLabel: 'EV (chips)',
      height: 200,
      endDots: false,
      xFmt: (v) => `${v}%`,
    });
  };
  box.append(
    el('h3', {}, 'Bluff & semi-bluff calculator'),
    el(
      'div.form-grid',
      {},
      el('label', {}, 'Pot', numberInput(st.pot, (e) => ((st.pot = +e.target.value || 0), update()))),
      el('label', {}, 'Your bet', numberInput(st.bet, (e) => ((st.bet = Math.max(1, +e.target.value || 1)), update()))),
      el('label', {}, el('span', {}, 'Your equity when called ', labels.eq), slider(st.eq, 0, 100, 1, (e) => ((st.eq = +e.target.value), update()))),
      el('label', {}, el('span', {}, 'They fold ', labels.fe), slider(st.fe, 0, 100, 1, (e) => ((st.fe = +e.target.value), update()))),
    ),
    out,
    chart,
  );
  update();
}

// ------------------------------------------------------------------ quiz

function buildQuiz() {
  const box = $('#quiz', root);
  const score = { right: 0, total: 0, evGained: 0 };
  const body = el('div');
  const scoreEl = el('div.small');
  box.append(el('h3', {}, 'Quiz: call or fold?'), el('p.small.muted', {}, 'A real hand: you hold the cards shown and face a bet. Estimate your equity vs a random hand, compare with the pot odds, decide.'), body, scoreEl);

  const next = () => {
    // random scenario on the flop or turn
    const deck = new Deck(rng).shuffle();
    const hole = deck.deal(2);
    const board = deck.deal(rng.chance(0.5) ? 3 : 4);
    const pot = 10 * (2 + rng.int(19));
    const bet = Math.max(5, Math.round((pot * [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5][rng.int(7)]) / 5) * 5);
    const res = calcEquity({ players: [{ cards: hole }, { random: true }], board }, { mode: 'auto', iterations: 20000, rng, workLimit: 3_000_000 });
    const eq = res.players[0].equity;
    const total = pot + bet;
    const need = bet / (total + bet);
    const ev = evCall(eq, total, bet);
    const made = describeScore(evaluate([...hole, ...board]));
    const outs = findOuts(hole, board);
    clear(body).append(
      el('div.quiz-cards', {}, el('div', {}, 'You: ', cardText(hole)), el('div', {}, 'Board: ', cardText(board))),
      el('p', {}, `Pot is ${pot}. Your opponent (a random hand) bets ${bet}. You have `, el('b', {}, made), `${outs.outs.length ? ` and ${outs.outs.length} improvement outs` : ''}.`),
      el(
        'div.action-buttons',
        {},
        el('button.btn.fold', { onclick: () => answer('fold') }, 'Fold'),
        el('button.btn.call', { onclick: () => answer('call') }, `Call ${bet}`),
      ),
    );
    function answer(choice) {
      const correct = (choice === 'call') === ev > 0;
      score.total++;
      if (correct) score.right++;
      score.evGained += choice === 'call' ? ev : 0;
      const ci = wilsonInterval(score.right, score.total);
      scoreEl.textContent = `Score: ${score.right}/${score.total} = ${pct(score.right / score.total, 0)} (95% CI ${pct(ci[0], 0)}–${pct(ci[1], 0)}; a coin-flipper would score 50%).`;
      clear(body).append(
        el('div.quiz-cards', {}, el('div', {}, 'You: ', cardText(hole)), el('div', {}, 'Board: ', cardText(board))),
        el(`div.verdict.${correct ? 'good' : 'bad'}`, {}, correct ? 'Correct!' : 'Not quite.', ` The right play is to ${ev > 0 ? 'CALL' : 'FOLD'}.`),
        el(
          'div.kv',
          {},
          kvr('Your equity vs a random hand', `${pct(eq)} (${res.method === 'exact' ? `exact, ${num(res.trials)} cases` : 'Monte Carlo'})`),
          kvr('Required equity', `${bet} / (${total} + ${bet}) = ${pct(need)}`),
          kvr('EV(call)', el(`b.${sign(ev)}`, {}, `${eq.toFixed(3)} × ${total} − ${(1 - eq).toFixed(3)} × ${bet} = ${signed(ev, 1)}`)),
        ),
        el('p.small.muted', {}, 'Note: vs a real opponent who bets, their range is stronger than random — your true equity would be lower.'),
        el('button.btn.primary', { onclick: next }, 'Next question'),
      );
    }
  };
  next();
}

// ------------------------------------------------------------------ outs trainer

function buildOutsTrainer() {
  const box = $('#outs-trainer', root);
  const body = el('div');
  box.append(el('h3', {}, 'Outs trainer'), el('p.small.muted', {}, 'Count the cards that improve your hand category (pairs, two pair, straights, flushes…).'), body);
  const next = () => {
    let hole;
    let board;
    let res;
    for (let tries = 0; tries < 200; tries++) {
      const deck = new Deck(rng).shuffle();
      hole = deck.deal(2);
      board = deck.deal(3);
      res = findOuts(hole, board);
      if (res.outs.some((o) => o.category >= 4) || (tries > 50 && res.outs.length >= 4)) break;
    }
    const input = el('input', { type: 'number', min: 0, max: 47, placeholder: '?' });
    clear(body).append(
      el('div.quiz-cards', {}, el('div', {}, 'You: ', cardText(hole)), el('div', {}, 'Flop: ', cardText(board))),
      el('p', {}, 'Currently: ', el('b', {}, describeScore(evaluate([...hole, ...board])))),
      el('div.row', {}, el('label.inline', {}, 'How many outs? ', input), el('button.btn.primary', { onclick: () => reveal(+input.value) }, 'Check')),
    );
    input.focus();
    input.addEventListener('keydown', (e) => e.key === 'Enter' && reveal(+input.value));
    function reveal(guess) {
      const n = res.outs.length;
      const byCat = {};
      for (const o of res.outs) (byCat[o.category] ||= []).push(o.card);
      clear(body).append(
        el('div.quiz-cards', {}, el('div', {}, 'You: ', cardText(hole)), el('div', {}, 'Flop: ', cardText(board))),
        el(`div.verdict.${guess === n ? 'good' : 'bad'}`, {}, guess === n ? `Correct: ${n} outs.` : `You said ${guess}; the answer is ${n}.`),
        el(
          'div.outs',
          {},
          Object.keys(byCat)
            .sort((a, b) => b - a)
            .map((c) => el('div.out-row', {}, el('span.out-cat', {}, `${HAND_NAMES[c]} (${byCat[c].length})`), cardText(byCat[c]))),
        ),
        el(
          'table.mini',
          {},
          el('tr', {}, el('th', {}, ''), el('th', {}, 'Exact'), el('th', {}, 'Rule of 2/4')),
          el('tr', {}, el('td', {}, 'Turn'), el('td', {}, pct(hitProbability(n, 47, 1))), el('td', {}, pct(ruleOf2And4(n, 1), 0))),
          el('tr', {}, el('td', {}, 'Turn or river'), el('td', {}, pct(hitProbability(n, 47, 2))), el('td', {}, pct(ruleOf2And4(n, 2), 0))),
        ),
        el('button.btn.primary', { onclick: next }, 'Next hand'),
      );
    }
  };
  next();
}

function buildOutsTable() {
  const box = $('#outs-table', root);
  const rows = [];
  for (let o = 1; o <= 21; o++) {
    const f2 = hitProbability(o, 47, 2);
    const f1 = hitProbability(o, 46, 1);
    rows.push(
      el(
        'tr',
        {},
        el('td', {}, o),
        el('td', {}, pct(f1)),
        el('td', {}, pct(ruleOf2And4(o, 1), 0)),
        el('td', {}, pct(f2)),
        el('td', {}, pct(ruleOf2And4(o, 2), 0)),
        el('td', {}, `${(1 / f2 - 1).toFixed(2)} : 1`),
        el('td.muted', {}, { 4: 'gutshot', 8: 'open-ended straight draw', 9: 'flush draw', 12: 'flush draw + gutshot', 15: 'flush + open-ended draw' }[o] || ''),
      ),
    );
  }
  const chart = el('div');
  box.append(
    el('h3', {}, 'Outs → probability: exact vs the rule of 2 and 4'),
    el('p.small.muted', {}, 'Exact uses 1 − C(unseen − outs, k) / C(unseen, k) with 47 unseen cards on the flop and 46 on the turn. The rule of 4 overestimates more and more as outs grow, because hitting on the turn and hitting on the river overlap.'),
    chart,
    el(
      'div.table-scroll',
      {},
      el(
        'table.results-table',
        {},
        el('thead', {}, el('tr', {}, ['Outs', 'Turn → river (exact)', 'Rule of 2', 'Flop → river (exact)', 'Rule of 4', 'Odds against (flop)', 'Typical draw'].map((h) => el('th', {}, h)))),
        el('tbody', {}, rows),
      ),
    ),
  );
  const exact = [];
  const rule = [];
  for (let o = 0; o <= 21; o++) {
    exact.push([o, hitProbability(o, 47, 2) * 100]);
    rule.push([o, ruleOf2And4(o, 2) * 100]);
  }
  lineChart(chart, {
    series: [
      { name: 'Exact (flop → river)', points: exact, color: SERIES(0) },
      { name: 'Rule of 4', points: rule, color: SERIES(1), dash: true },
    ],
    xName: 'outs',
    xLabel: 'outs',
    yLabel: 'P(hit) %',
    height: 220,
    yFmt: (v) => `${num(v, 0)}%`,
  });
}

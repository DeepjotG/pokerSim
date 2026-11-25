import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcEquity, exactWork, quickEquity } from '../src/core/equity.js';
import { parseCards } from '../src/core/cards.js';
import { RNG } from '../src/core/rng.js';
import { parseRange, rangeCombos } from '../src/core/ranges.js';
import { hitProbability, findOuts, finalHandDistribution, evCall, potOdds, breakEvenFoldEquity } from '../src/core/odds.js';

const P = (s) => ({ cards: parseCards(s) });

test('AA vs KK preflop by exact enumeration of all 1,712,304 boards', () => {
  const r = calcEquity({ players: [P('AsAh'), P('KsKh')] }, { mode: 'exact' });
  assert.equal(r.method, 'exact');
  assert.equal(r.trials, 1712304);
  // published figures: AhAs wins 82.36% vs KhKs, 81.06% vs KdKc (suits matter!)
  assert.ok(Math.abs(r.players[0].win - 0.8236) < 0.0001, String(r.players[0].win));
  const r2 = calcEquity({ players: [P('AsAh'), P('KdKc')] }, { mode: 'exact' });
  assert.ok(Math.abs(r2.players[0].win - 0.8106) < 0.0001, String(r2.players[0].win));
  const sum = r.players[0].equity + r.players[1].equity;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('Monte Carlo agrees with exact within its confidence interval', () => {
  const spec = { players: [P('AhKh'), P('QsQd')], board: parseCards('2h7h9c') };
  const exact = calcEquity(spec, { mode: 'exact' });
  const mc = calcEquity(spec, { mode: 'mc', iterations: 40000, rng: new RNG(7) });
  const e = exact.players[0].equity;
  const m = mc.players[0];
  assert.ok(Math.abs(m.equity - e) < 4 * m.se, `exact ${e} mc ${m.equity} se ${m.se}`);
  assert.ok(m.se > 0 && exact.players[0].se === 0);
});

test('river is decided with certainty', () => {
  const r = calcEquity({ players: [P('AsAh'), P('KdKc')], board: parseCards('2c7d9hTs3s') });
  assert.equal(r.players[0].equity, 1);
});

test('split pot on board royal flush', () => {
  const r = calcEquity({ players: [P('2c3d'), P('4h5h')], board: parseCards('AsKsQsJsTs') });
  assert.equal(r.players[0].tie, 1);
  assert.equal(r.players[0].equity, 0.5);
});

test('range and random-hand opponents', () => {
  const rng = new RNG(3);
  const aa = calcEquity({ players: [P('AsAh'), { random: true }] }, { mode: 'mc', iterations: 30000, rng });
  assert.ok(Math.abs(aa.players[0].equity - 0.852) < 0.01);
  const vsRange = calcEquity(
    { players: [P('AsKs'), { combos: rangeCombos(parseRange('QQ+')) }] },
    { mode: 'mc', iterations: 30000, rng },
  );
  // AKs vs {QQ,KK,AA} with AK blockers ≈ 33-35%
  assert.ok(vsRange.players[0].equity > 0.3 && vsRange.players[0].equity < 0.38, String(vsRange.players[0].equity));
  assert.ok(exactWork({ players: [P('AsAh'), { random: true }] }) > 1e9);
  const q = quickEquity(parseCards('AsAh'), [], 1, 20000, rng);
  assert.ok(Math.abs(q.equity - 0.852) < 0.015);
});

test('exact flop equity vs a random hand', () => {
  const r = calcEquity({ players: [P('AsAh'), { random: true }], board: parseCards('Kd7c2h') }, { mode: 'exact' });
  assert.equal(r.method, 'exact');
  assert.ok(r.players[0].equity > 0.85);
});

test('range parsing', () => {
  assert.deepEqual([...parseRange('TT+')].sort(), ['AA', 'JJ', 'KK', 'QQ', 'TT']);
  assert.deepEqual([...parseRange('A2s-A4s')].sort(), ['A2s', 'A3s', 'A4s']);
  assert.deepEqual([...parseRange('KTo+')].sort(), ['KJo', 'KQo', 'KTo']);
  assert.equal(parseRange('AK').size, 2);
  assert.equal(parseRange('any').size, 169);
  assert.equal(rangeCombos(parseRange('AA')).length, 6);
  assert.equal(rangeCombos(parseRange('AA'), parseCards('As')).length, 3); // blocker
});

test('odds formulas', () => {
  // flush draw on the flop: 9 outs, 47 unseen, 2 cards to come
  assert.ok(Math.abs(hitProbability(9, 47, 2) - 0.3497) < 1e-3);
  assert.ok(Math.abs(hitProbability(9, 46, 1) - 9 / 46) < 1e-9);
  const po = potOdds(100, 50);
  assert.ok(Math.abs(po.requiredEquity - 1 / 3) < 1e-9);
  assert.ok(Math.abs(evCall(1 / 3, 100, 50)) < 1e-9); // break-even exactly at required equity
  assert.ok(Math.abs(breakEvenFoldEquity(100, 50) - 1 / 3) < 1e-9);
});

test('outs: open-ended straight draw + flush draw', () => {
  const { outs } = findOuts(parseCards('9h8h'), parseCards('Th7h2c'));
  // 9 hearts + 6 non-heart straight cards (J, 6 of other suits) = 15 straight-or-better outs
  assert.equal(outs.filter((o) => o.category >= 4).length, 15);
  // plus 6 cards that pair a hole card (three 9s, three 8s)
  assert.equal(outs.filter((o) => o.category === 1).length, 6);
  const dist = finalHandDistribution(parseCards('9h8h'), parseCards('Th7h2c'));
  assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

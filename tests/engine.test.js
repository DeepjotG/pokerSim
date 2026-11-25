import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine.js';
import { botDecide, BOT_PROFILES } from '../src/game/bots.js';
import { Tracker } from '../src/game/tracker.js';
import { RNG } from '../src/core/rng.js';
import { parseCards } from '../src/core/cards.js';

const seats = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, profile: Object.keys(BOT_PROFILES)[i % 6] }));

test('heads-up blinds and action order', () => {
  const g = new Game({ seats: seats(2), seed: 1 });
  g.startHand();
  const h = g.hand;
  assert.equal(h.sb, h.dealer, 'dealer posts the small blind heads-up');
  assert.equal(h.toAct, h.dealer, 'dealer acts first preflop heads-up');
  g.act({ type: 'call' });
  assert.equal(h.toAct, h.bb, 'big blind gets the option');
  g.act({ type: 'check' });
  assert.equal(h.street, 'flop');
  assert.equal(h.toAct, h.bb, 'big blind acts first postflop');
  assert.equal(g.pot, 4);
});

test('3-handed: first to act preflop is left of the big blind; min-raise rules', () => {
  const g = new Game({ seats: seats(3), seed: 2 });
  g.startHand();
  const h = g.hand;
  assert.equal(h.toAct, h.dealer, 'UTG = dealer when 3-handed');
  let la = g.legalActions();
  assert.equal(la.minRaiseTo, 4);
  g.act({ type: 'raise', amount: 10 }); // raise of 8
  la = g.legalActions();
  assert.equal(la.minRaiseTo, 18, 'next raise must be at least the last raise size (8)');
  assert.throws(() => g.act({ type: 'raise', amount: 15 }));
  g.act({ type: 'fold' });
  g.act({ type: 'call' });
  assert.equal(h.street, 'flop');
  assert.equal(g.pot, 21);
});

test('everyone folds: uncalled bet returned, winner takes blinds', () => {
  const g = new Game({ seats: seats(3), seed: 3 });
  g.startHand();
  const before = g.players.map((p) => p.startStack);
  g.act({ type: 'raise', amount: 50 });
  g.act({ type: 'fold' });
  g.act({ type: 'fold' });
  const r = g.hand.result;
  assert.equal(r.showdown, false);
  const winner = g.hand.dealer;
  assert.equal(r.net[winner], 3, 'wins only the blinds');
  assert.equal(g.players.reduce((s, p) => s + p.stack, 0), before.reduce((a, b) => a + b, 0));
});

test('side pots with three different stack sizes', () => {
  const g = new Game({ seats: seats(3), seed: 4, startingStack: 100 });
  g.startHand();
  g.players[0].contributed = 0;
  // craft contributions directly to test pot math
  g.players.forEach((p, i) => {
    p.contributed = [30, 100, 100][i];
    p.folded = false;
    p.inHand = true;
  });
  const pots = g.computePots();
  assert.deepEqual(pots, [
    { amount: 90, eligible: [0, 1, 2] },
    { amount: 140, eligible: [1, 2] },
  ]);
  g.players[2].folded = true;
  assert.deepEqual(g.computePots(), [
    { amount: 90, eligible: [0, 1] },
    { amount: 140, eligible: [1] },
  ]);
});

test('short all-in raise does not reopen betting', () => {
  const g = new Game({ seats: seats(3), seed: 5, startingStack: 200 });
  g.startHand();
  const h = g.hand;
  const order = [h.toAct];
  // UTG raises to 20 (raise size 18)
  g.act({ type: 'raise', amount: 20 });
  // SB has only 30 total: re-raise all-in to 30 is a short raise (10 < 18)
  const sb = g.players[h.toAct];
  sb.stack = 30 - sb.bet;
  g.act({ type: 'raise', amount: 30 });
  // BB may still raise (has not acted yet)
  assert.equal(g.legalActions().canRaise, true);
  g.act({ type: 'call' });
  // back to UTG who already acted: may only call or fold
  assert.equal(h.toAct, order[0]);
  const la = g.legalActions();
  assert.equal(la.canRaise, false);
  assert.equal(la.toCall, 10);
});

test('all-in EV: equity x pot replaces actual result', () => {
  const g = new Game({ seats: seats(2), seed: 6, startingStack: 100 });
  g.startHand();
  const h = g.hand;
  const sbP = g.players[h.sb];
  const bbP = g.players[h.bb];
  sbP.hole = parseCards('AsAh');
  bbP.hole = parseCards('KsKh');
  g.act({ type: 'raise', amount: 100 });
  g.act({ type: 'call' });
  const r = h.result;
  assert.ok(h.allIn && h.allIn.street === 'preflop');
  assert.equal(r.net[h.sb] + r.net[h.bb], 0);
  // AA's EV ≈ 0.8264 * 200 - 100 ≈ +65
  assert.ok(Math.abs(r.evNet[h.sb] - 65.3) < 2.5, String(r.evNet[h.sb]));
});

test('5000 bot hands: chips are conserved and no stack goes negative', () => {
  const g = new Game({ seats: seats(6), seed: 42, startingStack: 200 });
  const tr = new Tracker(g.players, g.bb);
  const rng = new RNG(99);
  let rebuys = 0;
  for (let k = 0; k < 5000; k++) {
    g.startHand();
    let guard = 0;
    while (!g.hand.finished) {
      const p = g.current;
      g.act(botDecide(g.viewFor(p.id), p.profile, rng, { sims: 60 }));
      if (++guard > 200) throw new Error('hand did not terminate');
    }
    for (const p of g.players) assert.ok(p.stack >= 0);
    const net = g.hand.result.net.reduce((a, b) => a + b, 0);
    assert.equal(net, 0, 'zero-sum: every chip won was lost by someone');
    tr.record(g);
  }
  rebuys = g.players.reduce((s, p) => s + p.rebuys, 0);
  const total = g.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(total, 6 * 200 + rebuys * 200);
  // profiles should separate: the nit plays far fewer hands than the maniac
  const nit = tr.tendencies(3).vpip.p;
  const maniac = tr.tendencies(4).vpip.p;
  assert.ok(nit < 0.2 && maniac > 0.45, `nit ${nit} maniac ${maniac}`);
  const wr = tr.winrate(0);
  assert.equal(wr.hands, 5000);
  assert.ok(Number.isFinite(wr.sd100));
});

test('HUD analysis: pot odds, EV and raise EV follow their formulas', async () => {
  const { analyzeDecision, evRaise, estimateRange } = await import('../src/game/analysis.js');
  const g = new Game({ seats: [{ name: 'You', isHuman: true }, { name: 'B', profile: 'tag' }], seed: 11 });
  const tr = new Tracker(g.players, g.bb);
  g.startHand();
  // make sure it's the hero's turn facing a raise
  if (g.current.id !== 0) g.act({ type: 'raise', amount: 6 });
  else {
    g.act({ type: 'raise', amount: 6 });
    g.act({ type: 'raise', amount: 18 });
  }
  const a = analyzeDecision(g, tr, 0, new RNG(1), { sims: 3000 });
  assert.equal(a.toCall, g.legalActions().toCall);
  assert.ok(Math.abs(a.potOdds.requiredEquity - a.toCall / (a.pot + a.toCall)) < 1e-12);
  const eq = a.eqRange.equity;
  assert.ok(Math.abs(a.evCallRange - (eq * a.pot - (1 - eq) * a.toCall)) < 1e-9);
  assert.ok(a.eqRandom.equity > 0 && a.eqRandom.equity < 1 && a.eqRandom.se > 0);
  // a raiser's range is narrowed with a Bayesian PFR estimate (prior mean 20%)
  const r = estimateRange(g, tr, 1);
  assert.equal(r.kind, 'range');
  assert.ok(Math.abs(r.pct - 0.2) < 0.01);
  // raise EV: pure bluff break-even fold frequency = B / (P + B)
  const re = evRaise(a, g.legalActions().minRaiseTo, 0.5, 0);
  assert.ok(Math.abs(re.breakEvenFE - re.B / (re.P + re.B)) < 1e-12);
  assert.ok(Math.abs(re.ev - (0.5 * re.P + 0.5 * -re.B)) < 1e-9);
});

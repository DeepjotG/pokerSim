// Decision analysis for the human player: the numbers behind every spot.
// Pure functions (no DOM) so they can be tested and reused.

import { evaluate, describeScore } from '../core/evaluator.js';
import { handClass } from '../core/cards.js';
import { calcEquity, quickEquity } from '../core/equity.js';
import { potOdds, evCall, findOuts, hitProbability, ruleOf2And4, finalHandDistribution, breakEvenFoldEquity } from '../core/odds.js';
import { CLASS_PERCENTILE, topPercent, rangeCombos, rangeComboCount } from '../core/ranges.js';
import { betaPosterior } from '../core/stats.js';

// Priors for Bayesian shrinkage of small samples (see Learn → Beta prior)
export const PRIORS = {
  vpip: [3, 7], // prior mean 30%, worth 10 hands
  pfr: [2, 8], // prior mean 20%
  ftb: [3, 3], // prior mean 50%, worth 6 observations
};

/** Estimate an opponent's range from what they did preflop this hand + their tracked stats. */
export function estimateRange(game, tracker, oppId) {
  const evs = game.hand.events.filter((e) => e.type === 'action' && e.street === 'preflop' && e.player === oppId);
  const raised = evs.some((e) => e.action === 'raise' || e.action === 'bet');
  const called = evs.some((e) => e.action === 'call');
  const t = tracker.players[oppId];
  if (!raised && !called) {
    return { kind: 'random', pct: 1, why: 'no voluntary preflop action → any two cards' };
  }
  const stat = raised ? 'pfr' : 'vpip';
  const k = t[stat];
  const n = t.hands;
  const [a, b] = PRIORS[stat];
  const post = betaPosterior(k, n - k, a, b);
  const pct = Math.min(1, Math.max(0.03, post.mean));
  const classes = topPercent(pct);
  return {
    kind: 'range',
    pct,
    classes,
    combos: rangeComboCount(classes),
    stat: stat.toUpperCase(),
    k,
    n,
    prior: [a, b],
    why: `${raised ? 'raised' : 'called'} preflop → top ${(pct * 100).toFixed(0)}% (Bayesian ${stat.toUpperCase()}: (${k}+${a})/(${n}+${a + b}))`,
  };
}

/** Fold-to-bet estimate with a Beta(3,3) prior. */
export function foldEstimate(tracker, id) {
  const t = tracker.players[id];
  const [a, b] = PRIORS.ftb;
  return { ...betaPosterior(t.foldedToBet, t.facedBet - t.foldedToBet, a, b), k: t.foldedToBet, n: t.facedBet };
}

/** Everything the HUD shows for the current decision of player `heroId`. */
export function analyzeDecision(game, tracker, heroId, rng, { sims = 4000 } = {}) {
  const h = game.hand;
  const hero = game.players[heroId];
  const la = game.legalActions();
  const board = [...h.board];
  const pot = game.pot;
  const toCall = la.toCall;
  const opps = game.livePlayers().filter((p) => p.id !== heroId);
  const cls = handClass(hero.hole[0], hero.hole[1]);
  const score = board.length >= 3 ? evaluate([...hero.hole, ...board]) : null;

  const r = quickEquity(hero.hole, board, opps.length, sims, rng);
  const eqRandom = { equity: r.equity, se: r.se, ci: [r.equity - 1.96 * r.se, r.equity + 1.96 * r.se], n: sims };

  const ranges = opps.map((o) => ({ id: o.id, name: o.name, ...estimateRange(game, tracker, o.id) }));
  const rr = calcEquity(
    {
      players: [{ cards: hero.hole }, ...ranges.map((x) => (x.kind === 'range' ? { combos: rangeCombos(x.classes) } : { random: true }))],
      board,
    },
    { mode: 'mc', iterations: sims, rng },
  );
  const hp = rr.players[0];
  const eqRange = { equity: hp.equity, se: hp.se, ci: hp.ci, n: sims };

  const po = potOdds(pot, toCall);
  let outs = null;
  if (board.length === 3 || board.length === 4) {
    const o = findOuts(hero.hole, board);
    const k = 5 - board.length;
    const strong = o.outs.filter((x) => x.category >= 4).length;
    outs = {
      ...o,
      cardsToCome: k,
      exactNext: hitProbability(o.outs.length, o.unseen, 1),
      exactRiver: hitProbability(o.outs.length, o.unseen, k),
      ruleNext: ruleOf2And4(o.outs.length, 1),
      ruleRiver: ruleOf2And4(o.outs.length, k),
      strong,
    };
  }
  const distribution =
    board.length >= 3 ? { probs: finalHandDistribution(hero.hole, board), method: 'exact' } : { probs: hp.categories, method: `Monte Carlo, ${sims} trials` };

  const folds = opps.map((o) => ({ id: o.id, name: o.name, ...foldEstimate(tracker, o.id) }));
  const allFold = folds.reduce((p, f) => p * f.mean, 1);

  return {
    street: h.street,
    hole: hero.hole,
    board,
    handClass: cls,
    preflopPercentile: CLASS_PERCENTILE[cls],
    made: score !== null ? describeScore(score) : null,
    pot,
    toCall,
    stack: hero.stack,
    heroBet: hero.bet,
    currentBet: h.currentBet,
    opponents: opps.length,
    potOdds: po,
    eqRandom,
    eqRange,
    ranges,
    evCallRandom: toCall > 0 ? evCall(eqRandom.equity, pot, toCall) : null,
    evCallRange: toCall > 0 ? evCall(eqRange.equity, pot, toCall) : null,
    outs,
    distribution,
    folds,
    allFold,
    bigBlind: game.bigBlind,
  };
}

/**
 * EV of raising/betting to `raiseTo` (simplified: at most one caller).
 * If everyone folds we win the current pot; if called, final pot = pot + B + C.
 */
export function evRaise(a, raiseTo, foldProb = a.allFold, equityWhenCalled = a.eqRange.equity) {
  const B = raiseTo - a.heroBet; // chips we add
  const C = raiseTo - a.currentBet; // chips a caller adds (they already matched currentBet)
  const P = a.pot;
  const whenCalled = equityWhenCalled * (P + B + C) - B;
  return {
    B,
    C,
    P,
    foldProb,
    equityWhenCalled,
    whenFold: P,
    whenCalled,
    ev: foldProb * P + (1 - foldProb) * whenCalled,
    breakEvenFE: breakEvenFoldEquity(P, B),
  };
}

/** Equity at a past decision against the opponents' ACTUAL cards (hindsight). */
export function hindsightEquity(decision, holesById, rng) {
  const players = [{ cards: decision.hole }, ...decision.oppIds.map((id) => ({ cards: holesById[id] }))];
  const res = calcEquity({ players, board: decision.board }, { mode: 'auto', iterations: 8000, rng, workLimit: 600_000 });
  return { equity: res.players[0].equity, method: res.method, trials: res.trials };
}

/** Judge a completed decision. Returns { verdict, tone, detail }. */
export function judge(d) {
  const eq = d.analysis.eqRange.equity;
  const need = d.analysis.potOdds.requiredEquity;
  const evc = d.analysis.evCallRange;
  const bb = d.analysis.bigBlind;
  const a = d.action.type;
  if (d.analysis.toCall > 0) {
    if (a === 'fold') {
      if (eq > need + 0.03) return { tone: 'bad', verdict: 'Fold gave up EV', detail: `Calling had EV ≈ ${(evc / bb).toFixed(2)} bb (you had ${(eq * 100).toFixed(0)}%, needed ${(need * 100).toFixed(0)}%).` };
      if (eq > need - 0.03) return { tone: 'meh', verdict: 'Close fold', detail: `Equity ${(eq * 100).toFixed(0)}% vs ${(need * 100).toFixed(0)}% needed — nearly break-even.` };
      return { tone: 'good', verdict: 'Good fold', detail: `Needed ${(need * 100).toFixed(0)}%, had only ${(eq * 100).toFixed(0)}%: folding saved ${(-evc / bb).toFixed(2)} bb.` };
    }
    if (a === 'call') {
      if (eq >= need + 0.03) return { tone: 'good', verdict: '+EV call', detail: `Equity ${(eq * 100).toFixed(0)}% > ${(need * 100).toFixed(0)}% needed: EV ≈ +${(evc / bb).toFixed(2)} bb.` };
      if (eq >= need - 0.03) return { tone: 'meh', verdict: 'Marginal call', detail: `Equity ${(eq * 100).toFixed(0)}% ≈ ${(need * 100).toFixed(0)}% needed (implied odds may justify it).` };
      return { tone: 'bad', verdict: '−EV call', detail: `Needed ${(need * 100).toFixed(0)}%, had ${(eq * 100).toFixed(0)}%: EV ≈ ${(evc / bb).toFixed(2)} bb unless you win more later (implied odds).` };
    }
  }
  if (a === 'raise') {
    const fair = 1 / (d.analysis.opponents + 1);
    if (eq >= Math.max(0.5, fair * 1.4)) return { tone: 'good', verdict: 'Value bet/raise', detail: `Equity ${(eq * 100).toFixed(0)}% vs their estimated ranges — you are ahead of hands that call.` };
    const be = d.raiseEV ? d.raiseEV.breakEvenFE : null;
    return {
      tone: d.raiseEV && d.raiseEV.ev > 0 ? 'meh' : 'bad',
      verdict: eq < fair ? 'Bluff / semi-bluff' : 'Thin bet',
      detail: be !== null ? `Needs folds ≥ ${(be * 100).toFixed(0)}% as a pure bluff; estimated fold chance ${(d.raiseEV.foldProb * 100).toFixed(0)}%, EV ≈ ${(d.raiseEV.ev / bb).toFixed(2)} bb.` : '',
    };
  }
  if (a === 'check') return { tone: 'neutral', verdict: 'Check', detail: `Equity ${(eq * 100).toFixed(0)}% — free card / pot control.` };
  return { tone: 'neutral', verdict: a, detail: '' };
}

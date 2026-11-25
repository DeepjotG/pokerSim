// Pot odds, expected value (EV) and outs.

import { evaluate } from './evaluator.js';
import { nCr } from './stats.js';
import { remainingDeck } from './cards.js';

/**
 * Pot odds when facing a bet.
 * pot: total pot INCLUDING the opponent's bet (what you can win); toCall: your price.
 * requiredEquity = toCall / (pot + toCall): the break-even win probability.
 */
export function potOdds(pot, toCall) {
  if (toCall <= 0) return { ratio: Infinity, requiredEquity: 0 };
  return { ratio: pot / toCall, requiredEquity: toCall / (pot + toCall) };
}

/**
 * Immediate EV of calling (assumes no more betting, i.e. you see the showdown):
 *   EV(call) = P(win)·pot − P(lose)·toCall
 * EV(fold) is always 0 — chips already in the pot are no longer yours ("sunk cost").
 */
export function evCall(equity, pot, toCall) {
  return equity * pot - (1 - equity) * toCall;
}

/**
 * EV of betting `bet` into `pot`, heads-up, with a fold probability:
 *   EV = FE·pot + (1−FE)·[eq·(pot + bet) − (1−eq)·bet]
 */
export function evBet({ pot, bet, foldEquity, equityWhenCalled }) {
  const whenFold = pot;
  const whenCalled = equityWhenCalled * (pot + bet) - (1 - equityWhenCalled) * bet;
  return {
    ev: foldEquity * whenFold + (1 - foldEquity) * whenCalled,
    whenFold,
    whenCalled,
  };
}

/** Fold probability a pure bluff (0% equity) needs to break even: bet / (pot + bet). */
export function breakEvenFoldEquity(pot, bet) {
  return bet / (pot + bet);
}

/**
 * Implied odds: how much MORE you must win on later streets (when you hit) to make
 * a call break even. Solves eq·(pot + X) − (1−eq)·toCall = 0 for X.
 */
export function impliedOddsNeeded(pot, toCall, equity) {
  if (equity <= 0) return Infinity;
  return Math.max(0, toCall / equity - toCall - pot);
}

/**
 * Exact probability of hitting at least one of `outs` cards when `cardsToCome`
 * cards are dealt from `unseen` cards:  1 − C(unseen−outs, k) / C(unseen, k)
 */
export function hitProbability(outs, unseen, cardsToCome) {
  if (outs <= 0) return 0;
  return 1 - nCr(unseen - outs, cardsToCome) / nCr(unseen, cardsToCome);
}

/** The "rule of 2 and 4" shortcut: outs × 2% per card to come (×4 for two cards). */
export function ruleOf2And4(outs, cardsToCome) {
  return Math.min(1, (outs * (cardsToCome === 2 ? 4 : 2)) / 100);
}

/**
 * Improvement outs on the flop or turn: unseen cards that raise YOUR hand category
 * to something the board alone does not give everyone.
 * Returns { current, outs: [{ card, category }], unseen }.
 */
export function findOuts(hole, board) {
  if (board.length < 3 || board.length > 4) return { current: null, outs: [], unseen: 0 };
  const cur = evaluate([...hole, ...board]) >> 20;
  const unseen = remainingDeck([...hole, ...board]);
  const outs = [];
  for (const c of unseen) {
    const nb = [...board, c];
    const mine = evaluate([...hole, ...nb]) >> 20;
    const boardOnly = nb.length >= 5 ? evaluate(nb) >> 20 : boardCategory(nb);
    if (mine > cur && mine > boardOnly) outs.push({ card: c, category: mine });
  }
  return { current: cur, outs, unseen: unseen.length };
}

/** Category of a 4-card board (pairs/trips/quads only — no 5-card hands possible). */
function boardCategory(cards) {
  const cnt = new Array(13).fill(0);
  for (const c of cards) cnt[c >> 2]++;
  const m = Math.max(...cnt);
  const pairs = cnt.filter((x) => x === 2).length;
  if (m === 4) return 7;
  if (m === 3) return 3;
  if (pairs === 2) return 2;
  if (pairs === 1) return 1;
  return 0;
}

/**
 * Exact distribution of your FINAL hand category by the river, enumerating every
 * remaining board. Returns an array of 9 probabilities.
 */
export function finalHandDistribution(hole, board) {
  const need = 5 - board.length;
  const rem = remainingDeck([...hole, ...board]);
  const dist = new Array(9).fill(0);
  const cards = [...hole, ...board, 0, 0, 0, 0, 0].slice(0, 7);
  let total = 0;
  const m = rem.length;
  if (need === 0) {
    dist[evaluate(cards) >> 20] = 1;
    return dist;
  }
  const idx = Array.from({ length: need }, (_, i) => i);
  while (true) {
    for (let k = 0; k < need; k++) cards[2 + board.length + k] = rem[idx[k]];
    dist[evaluate(cards) >> 20]++;
    total++;
    let i = need - 1;
    while (i >= 0 && idx[i] === m - need + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < need; j++) idx[j] = idx[j - 1] + 1;
  }
  return dist.map((x) => x / total);
}

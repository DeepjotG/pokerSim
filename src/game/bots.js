// Bot opponents. Each profile is a classic player "type" with a recognizable
// statistical fingerprint (VPIP / PFR / aggression). Watching their numbers converge
// in the HUD is a lesson in sample size: after 20 hands the confidence intervals are
// huge; after 500 they pin down the style.

import { handClass } from '../core/cards.js';
import { CLASS_PERCENTILE } from '../core/ranges.js';
import { quickEquity } from '../core/equity.js';

// play  = fraction of hands entered when unraised   (≈ VPIP target)
// raise = fraction of hands opened with a raise      (≈ PFR target)
// aggression = how often strong hands bet/raise rather than call/check
// bluff = how often weak hands bet when checked to
// callMargin = extra equity demanded above pot odds before calling (negative = calls too much)
export const BOT_PROFILES = {
  tag: {
    label: 'Tight-Aggressive (TAG)',
    short: 'TAG',
    play: 0.2,
    raise: 0.15,
    aggression: 0.75,
    bluff: 0.12,
    callMargin: 0.03,
    desc: 'Plays few hands, but plays them hard. The "textbook solid" style.',
  },
  lag: {
    label: 'Loose-Aggressive (LAG)',
    short: 'LAG',
    play: 0.38,
    raise: 0.27,
    aggression: 0.8,
    bluff: 0.25,
    callMargin: 0,
    desc: 'Plays many hands aggressively. Hard to read, high variance.',
  },
  station: {
    label: 'Calling Station',
    short: 'Station',
    play: 0.55,
    raise: 0.05,
    aggression: 0.15,
    bluff: 0.03,
    callMargin: -0.12,
    desc: 'Calls far too often and rarely raises. Value-bet them; never bluff them.',
  },
  nit: {
    label: 'Rock / Nit',
    short: 'Nit',
    play: 0.1,
    raise: 0.08,
    aggression: 0.55,
    bluff: 0.03,
    callMargin: 0.08,
    desc: 'Only plays premium hands. When they bet big, believe them.',
  },
  maniac: {
    label: 'Maniac',
    short: 'Maniac',
    play: 0.7,
    raise: 0.5,
    aggression: 0.95,
    bluff: 0.45,
    callMargin: -0.06,
    desc: 'Raises almost everything. Huge swings both ways — call down lighter.',
  },
  math: {
    label: 'Pot-Odds Bot',
    short: 'Math',
    play: 0.25,
    raise: 0.16,
    aggression: 0.6,
    bluff: 0.12,
    callMargin: 0,
    desc: 'Calls exactly when its equity (vs random hands) beats the pot odds.',
  },
};

function raiseTo(legal, target) {
  let to = Math.max(legal.minRaiseTo, Math.round(target));
  if (to >= legal.maxRaiseTo * 0.7) to = legal.maxRaiseTo; // mostly committed: just shove
  to = Math.min(to, legal.maxRaiseTo);
  return { type: 'raise', amount: to };
}

function passive(legal) {
  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

/**
 * Decide an action. `view` comes from Game.viewFor(seat).
 * Returns { type, amount?, reason } — `reason` is shown in the hand log so you can
 * see the bot's (simple) statistical reasoning.
 */
export function botDecide(view, profileKey, rng, { sims = 250 } = {}) {
  const P = BOT_PROFILES[profileKey] || BOT_PROFILES.tag;
  const L = view.legal;
  const bb = view.bigBlind;
  const noise = (rng.next() - 0.5) * 0.06;

  if (view.street === 'preflop') {
    const cls = handClass(view.hole[0], view.hole[1]);
    const pct = CLASS_PERCENTILE[cls] + noise; // 0 = best hand, 1 = worst
    const raises = view.raisesThisStreet;
    const price = L.toCall / bb; // in big blinds
    let playT = P.play;
    let raiseT = P.raise;
    if (raises >= 1) {
      // facing a raise: continue with a tighter range, tighter still vs big raises
      const sizeFactor = Math.min(1, 3 / Math.max(price, 1));
      playT = P.play * 0.5 * sizeFactor + 0.02;
      raiseT = P.raise * 0.35;
    }
    if (raises >= 2) {
      playT = P.play * 0.22;
      raiseT = P.raise * 0.12;
    }
    if (raises >= 3) {
      playT = 0.03;
      raiseT = 0.015;
    }
    const why = `${cls} is in the top ${(CLASS_PERCENTILE[cls] * 100).toFixed(0)}% of hands`;
    if (L.canRaise && pct <= raiseT) {
      const target = raises === 0 ? view.currentBet + 2 * bb + bb * view.opponents * 0.25 : view.currentBet * 3;
      return { ...raiseTo(L, target), reason: `${why}; raise range ≈ top ${(raiseT * 100).toFixed(0)}%` };
    }
    if (L.canCheck) return { type: 'check', reason: `${why}; free look` };
    if (pct <= playT) return { type: 'call', reason: `${why}; calling range ≈ top ${(playT * 100).toFixed(0)}%` };
    // tiny price (e.g. small blind completing) — loose players complete
    if (L.toCall <= bb / 2 && pct <= P.play * 1.6) return { type: 'call', reason: `${why}; cheap price` };
    return { type: 'fold', reason: `${why}; outside its ${(playT * 100).toFixed(0)}% range` };
  }

  // ---------------- postflop: Monte Carlo equity vs random hands
  const { equity } = quickEquity(view.hole, view.board, Math.max(1, view.opponents), sims, rng);
  // Opponents who bet/raise usually hold better than random hands: discount equity.
  const eq = Math.max(0, equity - 0.07 * view.raisesThisStreet);
  const n = Math.max(1, view.opponents);
  const strongT = n === 1 ? 0.66 : n === 2 ? 0.56 : 0.48;
  const fair = 1 / (n + 1);
  const pot = view.pot;
  const eqTxt = `equity ≈ ${(equity * 100).toFixed(0)}% vs ${n} random hand${n > 1 ? 's' : ''}`;

  if (L.toCall === 0) {
    if (L.canRaise && eq >= strongT && rng.chance(P.aggression)) {
      return { ...raiseTo(L, pot * (0.55 + rng.next() * 0.25)), reason: `${eqTxt}: value bet` };
    }
    if (L.canRaise && eq > fair * 1.25 && rng.chance(P.aggression * 0.35)) {
      return { ...raiseTo(L, pot * 0.5), reason: `${eqTxt}: thin value / protection bet` };
    }
    if (L.canRaise && rng.chance(P.bluff)) {
      return { ...raiseTo(L, pot * (0.5 + rng.next() * 0.2)), reason: `${eqTxt}: bluff` };
    }
    return { type: 'check', reason: `${eqTxt}: check` };
  }

  const required = L.toCall / (pot + L.toCall);
  const odds = `needs ${(required * 100).toFixed(0)}% to call`;
  if (L.canRaise && eq >= strongT + 0.06 && rng.chance(P.aggression * 0.6)) {
    return { ...raiseTo(L, view.currentBet * 2.5 + pot * 0.3), reason: `${eqTxt}, ${odds}: raise for value` };
  }
  if (eq >= required + P.callMargin) return { type: 'call', reason: `${eqTxt}, ${odds}: call` };
  if (L.canRaise && rng.chance(P.bluff * 0.25)) {
    return { ...raiseTo(L, view.currentBet * 2.5 + pot * 0.3), reason: `${eqTxt}, ${odds}: bluff-raise` };
  }
  return { ...passive(L), reason: `${eqTxt}, ${odds}: fold` };
}


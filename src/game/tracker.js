// Session tracker: turns finished hands into statistics.
//
// Player-tendency stats (the "HUD" numbers real players use):
//   VPIP  – Voluntarily Put money In Pot preflop (call or raise; blinds don't count)
//   PFR   – PreFlop Raise
//   AF    – postflop Aggression Factor = (bets + raises) / calls
//   WTSD  – Went To ShowDown, given the player saw the flop
//   W$SD  – Won money at ShowDown, given they went to showdown
//   FtB   – Fold to a postflop Bet, given they faced one
// Each is a proportion estimated from a sample, so each gets a Wilson 95% interval.

import { wilsonInterval, RunningStats } from '../core/stats.js';

function blankPlayer(name) {
  return {
    name,
    hands: 0,
    vpip: 0,
    pfr: 0,
    sawFlop: 0,
    wtsd: 0,
    wsd: 0,
    aggr: 0,
    calls: 0,
    facedBet: 0,
    foldedToBet: 0,
    net: 0,
    results: [],
    evResults: [],
  };
}

export class Tracker {
  constructor(players, bigBlind) {
    this.bb = bigBlind;
    this.players = players.map((p) => blankPlayer(p.name));
    this.hands = [];
  }

  /** Record a finished hand from Game (call right after the hand ends). */
  record(game) {
    const h = game.hand;
    const r = h.result;
    const n = game.players.length;
    const vp = new Array(n).fill(false);
    const pf = new Array(n).fill(false);
    let reachedFlop = false;
    const foldedBeforeFlop = new Array(n).fill(false);
    for (const e of h.events) {
      if (e.type === 'street' && e.street === 'flop') reachedFlop = true;
      if (e.type !== 'action') continue;
      const s = this.players[e.player];
      if (e.street === 'preflop') {
        if (e.action === 'call' || e.action === 'raise' || e.action === 'bet') vp[e.player] = true;
        if (e.action === 'raise' || e.action === 'bet') pf[e.player] = true;
        if (e.action === 'fold') foldedBeforeFlop[e.player] = true;
      } else {
        if (e.action === 'bet' || e.action === 'raise') s.aggr++;
        if (e.action === 'call') s.calls++;
        if (e.toCall > 0) {
          s.facedBet++;
          if (e.action === 'fold') s.foldedToBet++;
        }
      }
    }
    game.players.forEach((p, i) => {
      if (!p.inHand) return;
      const s = this.players[i];
      s.hands++;
      if (vp[i]) s.vpip++;
      if (pf[i]) s.pfr++;
      const saw = reachedFlop && !foldedBeforeFlop[i];
      if (saw) {
        s.sawFlop++;
        if (r.showdown && !p.folded) {
          s.wtsd++;
          if (r.won[i] > 0) s.wsd++;
        }
      }
      s.net += r.net[i];
      s.results.push(r.net[i]);
      s.evResults.push(r.evNet[i]);
    });
    this.hands.push({ number: h.number, net: r.net.slice(), evNet: r.evNet.slice() });
  }

  /** Tendency stats with 95% Wilson intervals for player i. */
  tendencies(i) {
    const s = this.players[i];
    const prop = (k, n) => ({ k, n, p: n ? k / n : NaN, ci: wilsonInterval(k, n) });
    return {
      name: s.name,
      hands: s.hands,
      vpip: prop(s.vpip, s.hands),
      pfr: prop(s.pfr, s.hands),
      wtsd: prop(s.wtsd, s.sawFlop),
      wsd: prop(s.wsd, s.wtsd),
      ftb: prop(s.foldedToBet, s.facedBet),
      af: s.calls ? s.aggr / s.calls : s.aggr ? Infinity : NaN,
    };
  }

  /** Win-rate statistics for player i, in big blinds. */
  winrate(i) {
    const s = this.players[i];
    const rs = new RunningStats();
    for (const x of s.results) rs.push(x / this.bb);
    const evs = new RunningStats();
    for (const x of s.evResults) evs.push(x / this.bb);
    const n = rs.n;
    const mean = rs.mean; // bb per hand
    const sd = rs.sd; // bb per hand
    const ci = n > 1 ? rs.ci(1.96) : [NaN, NaN];
    const luck = (s.results.reduce((a, b) => a + b, 0) - s.evResults.reduce((a, b) => a + b, 0)) / this.bb;
    return {
      hands: n,
      netBB: s.net / this.bb,
      bbPerHand: mean,
      bb100: mean * 100,
      sdPerHand: sd,
      sd100: sd * 10, // SD scales with sqrt(n): sqrt(100) = 10
      ci100: [ci[0] * 100, ci[1] * 100],
      se100: rs.se * 100,
      evNetBB: s.evResults.reduce((a, b) => a + b, 0) / this.bb,
      evBb100: evs.mean * 100,
      luckBB: luck,
      // hands needed so the 95% CI excludes zero, if the true rate equals the observed one
      handsForSignificance: mean ? Math.ceil(((1.96 * sd) / mean) ** 2) : Infinity,
    };
  }

  /** Cumulative net and EV series (in bb) for player i. */
  series(i) {
    const s = this.players[i];
    let a = 0;
    let b = 0;
    const net = [0];
    const ev = [0];
    for (let k = 0; k < s.results.length; k++) {
      a += s.results[k] / this.bb;
      b += s.evResults[k] / this.bb;
      net.push(a);
      ev.push(b);
    }
    return { net, ev };
  }
}

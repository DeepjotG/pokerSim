// No-Limit Texas Hold'em game engine (2–9 players).
//
// Handles blinds, betting rounds, minimum raises (incl. short all-ins that do not
// reopen the betting), uncalled-bet refunds, side pots, split pots and odd chips.
// It also computes "all-in adjusted EV": when the money goes in before the river,
// each player's equity × pot is what they *deserved* — the gap to what they actually
// won is pure luck (variance).

import { Deck } from '../core/cards.js';
import { evaluate } from '../core/evaluator.js';
import { calcEquity } from '../core/equity.js';
import { RNG } from '../core/rng.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

export class Game {
  /**
   * @param {object} o
   * @param {Array<{name:string,isHuman?:boolean,profile?:string}>} o.seats
   */
  constructor({ seats, smallBlind = 1, bigBlind = 2, startingStack = 200, seed, autoRebuy = true }) {
    if (seats.length < 2 || seats.length > 9) throw new Error('Need 2-9 seats');
    this.rng = new RNG(seed);
    this.evRng = new RNG((this.rng.seed ^ 0x9e3779b9) >>> 0);
    this.seed = this.rng.seed;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.startingStack = startingStack;
    this.autoRebuy = autoRebuy;
    this.players = seats.map((s, i) => ({
      id: i,
      name: s.name,
      isHuman: !!s.isHuman,
      profile: s.profile || null,
      stack: startingStack,
      rebuys: 0,
    }));
    this.dealer = this.rng.int(seats.length) - 1;
    this.handNumber = 0;
    this.hand = null;
    this.deck = new Deck(this.rng);
  }

  get bb() {
    return this.bigBlind;
  }

  // ---------------------------------------------------------------- hand setup

  startHand() {
    const events = [];
    for (const p of this.players) {
      if (p.stack <= 0 && this.autoRebuy) {
        p.stack = this.startingStack;
        p.rebuys++;
        events.push({ type: 'rebuy', player: p.id, amount: this.startingStack });
      }
    }
    const inHand = this.players.filter((p) => p.stack > 0);
    if (inHand.length < 2) throw new Error('Not enough players with chips');
    this.handNumber++;
    for (const p of this.players) {
      Object.assign(p, {
        inHand: p.stack > 0,
        hole: [],
        folded: p.stack <= 0,
        allIn: false,
        bet: 0,
        contributed: 0,
        hasActed: false,
        mayRaise: true,
        startStack: p.stack,
      });
    }
    this.dealer = this._nextInHand(this.dealer);
    const headsUp = inHand.length === 2;
    const sb = headsUp ? this.dealer : this._nextInHand(this.dealer);
    const bb = this._nextInHand(sb);
    this.deck.shuffle();
    for (const p of this.players) if (p.inHand) p.hole = this.deck.deal(2);

    this.hand = {
      number: this.handNumber,
      dealer: this.dealer,
      sb,
      bb,
      board: [],
      street: 'preflop',
      currentBet: 0,
      lastRaiseSize: this.bigBlind,
      raisesThisStreet: 0,
      toAct: -1,
      events,
      finished: false,
      allIn: null,
      result: null,
    };
    this._post(sb, this.smallBlind, 'sb');
    this._post(bb, this.bigBlind, 'bb');
    this.hand.currentBet = this.bigBlind;
    this._maybeAdvance(bb);
    return this.hand;
  }

  _post(i, amount, kind) {
    const p = this.players[i];
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    p.contributed += a;
    if (p.stack === 0) p.allIn = true;
    this.hand.events.push({ type: 'post', player: i, kind, amount: a });
  }

  _nextInHand(from) {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (this.players[i].stack > 0 || this.players[i].inHand) return i;
    }
    return -1;
  }

  /** Next player after `from` who can still act (in hand, not folded, not all-in). */
  _nextActive(from) {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      const p = this.players[i];
      if (p.inHand && !p.folded && !p.allIn) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- queries

  get pot() {
    return this.players.reduce((s, p) => s + p.contributed, 0);
  }

  /** Pot not counting the current street's bets. */
  get potBeforeStreet() {
    return this.players.reduce((s, p) => s + p.contributed - p.bet, 0);
  }

  get current() {
    return this.hand && !this.hand.finished ? this.players[this.hand.toAct] : null;
  }

  livePlayers() {
    return this.players.filter((p) => p.inHand && !p.folded);
  }

  legalActions() {
    const h = this.hand;
    const p = this.current;
    if (!p) return null;
    const toCall = Math.max(0, h.currentBet - p.bet);
    const maxRaiseTo = p.bet + p.stack;
    const othersCanAct = this.players.some((q) => q !== p && q.inHand && !q.folded && !q.allIn);
    const canRaise = p.mayRaise && p.stack > toCall && othersCanAct;
    const minRaiseTo = Math.min(h.currentBet + h.lastRaiseSize, maxRaiseTo);
    return {
      player: p.id,
      toCall,
      canCheck: toCall === 0,
      callAmount: Math.min(toCall, p.stack),
      canRaise,
      minRaiseTo,
      maxRaiseTo,
      isBet: h.currentBet === 0,
      pot: this.pot,
    };
  }

  /** Everything a decision-maker (bot or HUD) may legitimately see. */
  viewFor(i) {
    const h = this.hand;
    const p = this.players[i];
    const la = this.legalActions();
    return {
      seat: i,
      hole: p.hole,
      board: [...h.board],
      street: h.street,
      pot: this.pot,
      stack: p.stack,
      bet: p.bet,
      currentBet: h.currentBet,
      bigBlind: this.bigBlind,
      raisesThisStreet: h.raisesThisStreet,
      opponents: this.livePlayers().filter((q) => q.id !== i).length,
      legal: la,
      isDealer: h.dealer === i,
      events: h.events,
    };
  }

  // ---------------------------------------------------------------- actions

  /** action: { type: 'fold'|'check'|'call'|'raise', amount?: raise-to total } */
  act(action) {
    const h = this.hand;
    const p = this.current;
    if (!p) throw new Error('No player to act');
    const la = this.legalActions();
    const potBefore = this.pot;
    const ev = {
      type: 'action',
      street: h.street,
      player: p.id,
      toCall: la.toCall,
      potBefore,
      action: action.type,
      amount: 0,
      to: p.bet,
      allIn: false,
    };
    switch (action.type) {
      case 'fold':
        p.folded = true;
        break;
      case 'check':
        if (la.toCall > 0) throw new Error('Cannot check facing a bet');
        break;
      case 'call': {
        if (la.toCall === 0) throw new Error('Nothing to call');
        const a = la.callAmount;
        p.stack -= a;
        p.bet += a;
        p.contributed += a;
        ev.amount = a;
        break;
      }
      case 'raise': {
        if (!la.canRaise) throw new Error('Raising is not allowed here');
        let to = Math.round(action.amount);
        if (to > la.maxRaiseTo) to = la.maxRaiseTo;
        if (to < la.minRaiseTo && to !== la.maxRaiseTo) throw new Error(`Minimum raise is to ${la.minRaiseTo}`);
        if (to <= h.currentBet) throw new Error('Raise must exceed the current bet');
        const a = to - p.bet;
        p.stack -= a;
        p.bet = to;
        p.contributed += a;
        const raiseSize = to - h.currentBet;
        ev.action = h.currentBet === 0 ? 'bet' : 'raise';
        ev.amount = a;
        if (raiseSize >= h.lastRaiseSize) {
          // full raise: re-opens the betting for everyone else
          h.lastRaiseSize = raiseSize;
          for (const q of this.players) {
            if (q !== p && q.inHand && !q.folded && !q.allIn) {
              q.hasActed = false;
              q.mayRaise = true;
            }
          }
        } else {
          // short all-in raise: others must respond but may not re-raise if they already acted
          for (const q of this.players) if (q !== p && q.inHand && !q.folded && !q.allIn) q.hasActed = false;
        }
        h.currentBet = to;
        h.raisesThisStreet++;
        break;
      }
      default:
        throw new Error(`Unknown action ${action.type}`);
    }
    p.hasActed = true;
    p.mayRaise = false;
    if (p.stack === 0 && !p.folded) {
      p.allIn = true;
      ev.allIn = true;
    }
    ev.to = p.bet;
    h.events.push(ev);
    this._maybeAdvance(p.id);
    return ev;
  }

  // ---------------------------------------------------------------- flow

  _roundComplete() {
    const h = this.hand;
    const live = this.livePlayers();
    const active = live.filter((p) => !p.allIn);
    const maxBet = Math.max(...live.map((p) => p.bet));
    if (active.length === 0) return true;
    if (active.length === 1) return active[0].bet >= maxBet && (active[0].hasActed || active[0].bet >= h.currentBet);
    return active.every((p) => p.hasActed && p.bet === h.currentBet);
  }

  _maybeAdvance(lastActor = null) {
    const h = this.hand;
    if (this.livePlayers().length === 1) return this._finish(false);
    if (!this._roundComplete()) {
      h.toAct = this._nextActive(lastActor ?? h.toAct);
      return;
    }
    // Betting round over. Will anyone bet again?
    const canBet = this.livePlayers().filter((p) => !p.allIn).length >= 2;
    if (h.street === 'river') return this._finish(true);
    if (!canBet && !h.allIn) {
      h.allIn = { street: h.street, board: [...h.board] };
      h.events.push({ type: 'allin-runout', street: h.street });
    }
    this._nextStreet();
    if (!canBet) {
      while (h.street !== 'river') this._nextStreet();
      return this._finish(true);
    }
    h.toAct = this._nextActive(h.dealer);
  }

  _nextStreet() {
    const h = this.hand;
    for (const p of this.players) {
      p.bet = 0;
      p.hasActed = false;
      p.mayRaise = true;
    }
    h.currentBet = 0;
    h.lastRaiseSize = this.bigBlind;
    h.raisesThisStreet = 0;
    const idx = STREETS.indexOf(h.street) + 1;
    h.street = STREETS[idx];
    h.board.push(...this.deck.deal(idx === 1 ? 3 : 1));
    h.events.push({ type: 'street', street: h.street, board: [...h.board], pot: this.pot });
  }

  // ---------------------------------------------------------------- settlement

  /** Split contributions into main pot + side pots. */
  computePots() {
    const ps = this.players.filter((p) => p.contributed > 0);
    const levels = [...new Set(ps.map((p) => p.contributed))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      let amount = 0;
      for (const p of ps) amount += Math.min(p.contributed, L) - Math.min(p.contributed, prev);
      const eligible = this.players.filter((p) => p.inHand && !p.folded && p.contributed >= L).map((p) => p.id);
      prev = L;
      if (amount === 0) continue;
      const last = pots[pots.length - 1];
      if (!eligible.length && last) last.amount += amount;
      else if (last && last.eligible.join() === eligible.join()) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    return pots;
  }

  _refundUncalled() {
    const sorted = [...this.players].sort((a, b) => b.contributed - a.contributed);
    const [top, second] = sorted;
    if (top.contributed > second.contributed) {
      const refund = top.contributed - second.contributed;
      top.contributed -= refund;
      top.bet = Math.max(0, top.bet - refund);
      top.stack += refund;
      if (top.stack > 0) top.allIn = false;
      this.hand.events.push({ type: 'refund', player: top.id, amount: refund });
    }
  }

  _finish(showdown) {
    const h = this.hand;
    this._refundUncalled();
    const pots = this.computePots();
    const live = this.livePlayers();
    const scores = {};
    if (showdown) for (const p of live) scores[p.id] = evaluate([...p.hole, ...h.board]);
    const won = new Array(this.players.length).fill(0);

    for (const pot of pots) {
      let winners;
      if (!showdown) winners = [live[0].id];
      else {
        const best = Math.max(...pot.eligible.map((i) => scores[i]));
        winners = pot.eligible.filter((i) => scores[i] === best);
        pot.bestScore = best;
      }
      pot.winners = winners;
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      // odd chips go to winners closest to the left of the dealer
      const order = [...winners].sort((a, b) => this._distFromDealer(a) - this._distFromDealer(b));
      for (const w of order) {
        const extra = odd > 0 ? 1 : 0;
        odd -= extra;
        won[w] += share + extra;
        this.players[w].stack += share + extra;
      }
    }

    // All-in adjusted EV
    const evNet = this.players.map((p, i) => won[i] - p.contributed);
    if (showdown && h.allIn) {
      const evWon = new Array(this.players.length).fill(0);
      for (const pot of pots) {
        if (pot.eligible.length === 1) {
          evWon[pot.eligible[0]] += pot.amount;
          continue;
        }
        const res = calcEquity(
          { players: pot.eligible.map((i) => ({ cards: this.players[i].hole })), board: h.allIn.board },
          { mode: 'auto', iterations: 6000, rng: this.evRng, workLimit: 300_000 },
        );
        pot.allInEquity = res.players.map((r) => r.equity);
        pot.eligible.forEach((i, k) => (evWon[i] += res.players[k].equity * pot.amount));
      }
      this.players.forEach((p, i) => (evNet[i] = evWon[i] - p.contributed));
    }

    h.finished = true;
    h.toAct = -1;
    h.result = {
      showdown,
      pots,
      won,
      scores,
      net: this.players.map((p) => (p.inHand ? p.stack - p.startStack : 0)),
      evNet,
    };
    h.events.push({ type: 'end', showdown });
    return h.result;
  }

  _distFromDealer(i) {
    const n = this.players.length;
    return (i - this.hand.dealer + n - 1) % n;
  }

  totalChips() {
    return this.players.reduce((s, p) => s + p.stack + (this.hand && !this.hand.finished ? p.contributed : 0), 0);
  }
}

// Equity calculation: "what share of the pot does each hand win on average?"
//
// Two methods, both taught in the Equity Lab:
//  * EXACT enumeration — visit every possible remaining board (and every possible
//    opponent hand). No sampling error at all, but the work explodes combinatorially.
//  * MONTE CARLO — deal random completions many times and average. Each trial is an
//    independent sample, so the estimate has a standard error SE = SD / sqrt(n), which
//    shrinks with the square root of the number of trials (4x trials => 2x precision).
//
// Player specs:
//   { cards: [c1, c2] }                 a known hand
//   { random: true }                    any two unknown cards
//   { combos: [[c1, c2, weight], ...] } a (weighted) range of hands

import { evaluate, CATEGORY_COUNT } from './evaluator.js';
import { nCr } from './stats.js';

export const EXACT_WORK_LIMIT = 4_000_000; // max hand evaluations for exact mode

function normalize(spec) {
  const board = spec.board ? [...spec.board] : [];
  const dead = spec.dead ? [...spec.dead] : [];
  const used = new Uint8Array(52);
  const mark = (c) => {
    if (used[c]) throw new Error('A card is used twice');
    used[c] = 1;
  };
  board.forEach(mark);
  dead.forEach(mark);
  const players = spec.players.map((p) => {
    if (p.cards && p.cards.length === 2) {
      p.cards.forEach(mark);
      return { kind: 'known', cards: [...p.cards] };
    }
    if (p.combos) return { kind: 'range', combos: p.combos };
    return { kind: 'random' };
  });
  if (board.length > 5) throw new Error('Board has more than 5 cards');
  // Filter range combos that collide with known cards (card removal / "blockers").
  for (const p of players) {
    if (p.kind === 'range') {
      p.combos = p.combos.filter((cb) => !used[cb[0]] && !used[cb[1]] && (cb[2] ?? 1) > 0);
      if (!p.combos.length) throw new Error('A range has no combos left after removing known cards');
      p.totalWeight = p.combos.reduce((s, cb) => s + (cb[2] ?? 1), 0);
      // cumulative weights for sampling
      let acc = 0;
      p.cum = p.combos.map((cb) => (acc += cb[2] ?? 1));
    }
  }
  return { board, dead, used, players };
}

/** Number of hand evaluations exact enumeration would need (upper bound). */
export function exactWork(spec) {
  const n = normalize(spec);
  let free = 52 - n.used.reduce((a, b) => a + b, 0);
  let assignments = 1;
  for (const p of n.players) {
    if (p.kind === 'random') {
      assignments *= nCr(free, 2);
      free -= 2;
    } else if (p.kind === 'range') {
      assignments *= p.combos.length;
      free -= 2;
    }
  }
  const boards = nCr(free, 5 - n.board.length);
  return assignments * boards * n.players.length;
}

function makeAccumulators(nPlayers) {
  return Array.from({ length: nPlayers }, () => ({
    win: 0,
    tie: 0,
    eq: 0,
    eq2: 0,
    cats: new Float64Array(CATEGORY_COUNT),
  }));
}

function snapshot(acc, total, method, trials) {
  const z = 1.96;
  return {
    method,
    trials,
    totalWeight: total,
    players: acc.map((a) => {
      const equity = total ? a.eq / total : 0;
      let se = 0;
      if (method === 'monte-carlo' && trials > 1) {
        const variance = Math.max(0, a.eq2 / total - equity * equity) * (trials / (trials - 1));
        se = Math.sqrt(variance / trials);
      }
      return {
        win: total ? a.win / total : 0,
        tie: total ? a.tie / total : 0,
        equity,
        se,
        ci: [Math.max(0, equity - z * se), Math.min(1, equity + z * se)],
        categories: Array.from(a.cats, (x) => (total ? x / total : 0)),
      };
    }),
  };
}

// Shared scratch space for showdown scoring.
const hand7 = [0, 0, 0, 0, 0, 0, 0];
const scores = new Int32Array(10);
const cats = new Int32Array(10);

/** Score every player's 7-card hand and add the weighted pot shares into `acc`. */
function showdown(holes, board, acc, w) {
  const np = holes.length;
  for (let k = 0; k < 5; k++) hand7[2 + k] = board[k];
  let best = -1;
  let nBest = 0;
  for (let i = 0; i < np; i++) {
    hand7[0] = holes[i][0];
    hand7[1] = holes[i][1];
    const s = evaluate(hand7);
    scores[i] = s;
    cats[i] = s >> 20;
    if (s > best) {
      best = s;
      nBest = 1;
    } else if (s === best) nBest++;
  }
  const share = 1 / nBest;
  for (let i = 0; i < np; i++) {
    const a = acc[i];
    a.cats[cats[i]] += w;
    if (scores[i] === best) {
      if (nBest === 1) a.win += w;
      else a.tie += w;
      a.eq += w * share;
      a.eq2 += w * share * share;
    }
  }
}

/** All 2-card combos from `deck`. */
function allCombos(deck) {
  const out = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) out.push([deck[i], deck[j], 1]);
  return out;
}

/** Generator for exact enumeration; yields progress snapshots every `chunk` boards. */
export function* exactEquityGen(spec, { chunk = 50_000 } = {}) {
  const n = normalize(spec);
  const np = n.players.length;
  const acc = makeAccumulators(np);
  const base = [...n.used];
  const unknownIdx = n.players.map((p, i) => (p.kind === 'known' ? -1 : i)).filter((i) => i >= 0);

  // Build every consistent assignment of hole cards to unknown players.
  const assignments = [];
  const holes = n.players.map((p) => (p.kind === 'known' ? p.cards : null));
  const usedNow = Uint8Array.from(base);
  const rec = (k, w) => {
    if (k === unknownIdx.length) {
      assignments.push({ holes: holes.map((h) => [h[0], h[1]]), w });
      return;
    }
    const pi = unknownIdx[k];
    const p = n.players[pi];
    let list;
    if (p.kind === 'random') {
      const deck = [];
      for (let c = 0; c < 52; c++) if (!usedNow[c]) deck.push(c);
      list = allCombos(deck);
    } else list = p.combos;
    for (const cb of list) {
      if (usedNow[cb[0]] || usedNow[cb[1]]) continue;
      usedNow[cb[0]] = usedNow[cb[1]] = 1;
      holes[pi] = cb;
      rec(k + 1, w * (cb[2] ?? 1));
      usedNow[cb[0]] = usedNow[cb[1]] = 0;
    }
    holes[pi] = null;
  };
  rec(0, 1);

  const need = 5 - n.board.length;
  const board = [...n.board, 0, 0, 0, 0, 0].slice(0, 5);
  let total = 0;
  let boards = 0;
  for (const asg of assignments) {
    const u = Uint8Array.from(base);
    for (const h of asg.holes) u[h[0]] = u[h[1]] = 1;
    const rem = [];
    for (let c = 0; c < 52; c++) if (!u[c]) rem.push(c);
    const m = rem.length;
    if (need === 0) {
      showdown(asg.holes, board, acc, asg.w);
      total += asg.w;
      boards++;
      continue;
    }
    // iterate all k-combinations of rem via an index array
    const idx = Array.from({ length: need }, (_, i) => i);
    while (true) {
      for (let k = 0; k < need; k++) board[n.board.length + k] = rem[idx[k]];
      showdown(asg.holes, board, acc, asg.w);
      total += asg.w;
      boards++;
      if (boards % chunk === 0) yield snapshot(acc, total, 'exact', boards);
      let i = need - 1;
      while (i >= 0 && idx[i] === m - need + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < need; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  const res = snapshot(acc, total, 'exact', boards);
  res.done = true;
  return res;
}

/** Generator for Monte Carlo; yields a snapshot after every `chunk` trials. */
export function* monteCarloGen(spec, { iterations = 20_000, rng, chunk = 1000 } = {}) {
  if (!rng) throw new Error('monteCarloGen needs an rng');
  const n = normalize(spec);
  const np = n.players.length;
  const acc = makeAccumulators(np);
  const holes = n.players.map((p) => (p.kind === 'known' ? p.cards : [0, 0]));
  const used = new Uint8Array(52);
  const deck = new Int32Array(52);
  const board = [0, 0, 0, 0, 0];
  const need = 5 - n.board.length;
  let rejected = 0;

  for (let t = 1; t <= iterations; t++) {
    // 1. sample range players (restart the whole trial on a card collision so the
    //    joint distribution stays correct)
    let ok;
    do {
      ok = true;
      used.set(n.used);
      for (let i = 0; i < np && ok; i++) {
        const p = n.players[i];
        if (p.kind !== 'range') continue;
        const r = rng.next() * p.totalWeight;
        let lo = 0;
        let hi = p.cum.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (p.cum[mid] > r) hi = mid;
          else lo = mid + 1;
        }
        const cb = p.combos[lo];
        if (used[cb[0]] || used[cb[1]]) {
          ok = false;
          rejected++;
        } else {
          used[cb[0]] = used[cb[1]] = 1;
          holes[i] = cb;
        }
      }
    } while (!ok);
    // 2. remaining deck, partially shuffled as needed
    let m = 0;
    for (let c = 0; c < 52; c++) if (!used[c]) deck[m++] = c;
    let pos = 0;
    const draw = () => {
      const j = pos + Math.floor(rng.next() * (m - pos));
      const tmp = deck[pos];
      deck[pos] = deck[j];
      deck[j] = tmp;
      return deck[pos++];
    };
    for (let i = 0; i < np; i++) {
      if (n.players[i].kind === 'random') holes[i] = [draw(), draw()];
    }
    for (let k = 0; k < 5; k++) board[k] = k < n.board.length ? n.board[k] : 0;
    for (let k = 0; k < need; k++) board[n.board.length + k] = draw();
    showdown(holes, board, acc, 1);
    if (t % chunk === 0 && t !== iterations) {
      const s = snapshot(acc, t, 'monte-carlo', t);
      s.rejected = rejected;
      yield s;
    }
  }
  const res = snapshot(acc, iterations, 'monte-carlo', iterations);
  res.rejected = rejected;
  res.done = true;
  return res;
}

/** Run a generator to completion and return its final value. */
export function runToEnd(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

/**
 * Synchronous equity. mode: 'auto' (exact when cheap enough), 'exact' or 'mc'.
 */
export function calcEquity(spec, { mode = 'auto', iterations = 20_000, rng, workLimit = EXACT_WORK_LIMIT } = {}) {
  const work = exactWork(spec);
  const useExact = mode === 'exact' || (mode === 'auto' && work <= workLimit);
  const res = useExact ? runToEnd(exactEquityGen(spec)) : runToEnd(monteCarloGen(spec, { iterations, rng }));
  res.work = work;
  return res;
}

/**
 * Fast path used by the bots and the live HUD: equity of `hole` against `nOpp`
 * random hands. Returns { equity, se }.
 */
export function quickEquity(hole, board, nOpp, iterations, rng) {
  const used = new Uint8Array(52);
  used[hole[0]] = used[hole[1]] = 1;
  for (const c of board) used[c] = 1;
  const base = [];
  for (let c = 0; c < 52; c++) if (!used[c]) base.push(c);
  const deck = new Int32Array(base);
  const m = deck.length;
  const need = 5 - board.length;
  const h = [hole[0], hole[1], ...board, 0, 0, 0, 0, 0].slice(0, 7);
  const o = [0, 0, ...board, 0, 0, 0, 0, 0].slice(0, 7);
  let eq = 0;
  let eq2 = 0;
  for (let t = 0; t < iterations; t++) {
    let pos = 0;
    const draw = () => {
      const j = pos + Math.floor(rng.next() * (m - pos));
      const tmp = deck[pos];
      deck[pos] = deck[j];
      deck[j] = tmp;
      return deck[pos++];
    };
    for (let k = 0; k < need; k++) {
      const c = draw();
      h[2 + board.length + k] = c;
      o[2 + board.length + k] = c;
    }
    const hs = evaluate(h);
    let best = hs;
    let nBest = 1;
    let heroBest = true;
    for (let i = 0; i < nOpp; i++) {
      o[0] = draw();
      o[1] = draw();
      const s = evaluate(o);
      if (s > best) {
        best = s;
        nBest = 1;
        heroBest = false;
      } else if (s === best) nBest++;
    }
    if (heroBest) {
      const share = 1 / nBest;
      eq += share;
      eq2 += share * share;
    }
  }
  const mean = eq / iterations;
  const variance = Math.max(0, eq2 / iterations - mean * mean);
  return { equity: mean, se: Math.sqrt(variance / iterations) };
}

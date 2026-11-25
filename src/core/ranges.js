// Starting-hand ranges.
//
// There are C(52,2) = 1326 two-card combos but only 169 strategically different
// "hand classes":  13 pairs (6 combos each) + 78 suited (4 each) + 78 offsuit (12 each).
//   13*6 + 78*4 + 78*12 = 78 + 312 + 936 = 1326
// The 13x13 grid: pairs on the diagonal, suited hands above it, offsuit below.

import { RANKS, makeCard } from './cards.js';
import { PREFLOP_EQUITY } from '../data/preflop.js';

export const GRID_RANKS = 'AKQJT98765432'; // high to low

/** Label for grid cell (row, col). */
export function gridLabel(row, col) {
  const a = GRID_RANKS[row];
  const b = GRID_RANKS[col];
  if (row === col) return a + b;
  return row < col ? a + b + 's' : b + a + 'o';
}

export const ALL_CLASSES = [];
for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) ALL_CLASSES.push(gridLabel(r, c));

export function comboCount(label) {
  if (label.length === 2) return 6;
  return label[2] === 's' ? 4 : 12;
}

/** All concrete combos [c1, c2] for a class label like "AKs". */
export function combosForClass(label) {
  const r1 = RANKS.indexOf(label[0]);
  const r2 = RANKS.indexOf(label[1]);
  const out = [];
  if (r1 === r2) {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) out.push([makeCard(r1, s1), makeCard(r2, s2)]);
  } else if (label[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([makeCard(r1, s), makeCard(r2, s)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([makeCard(r1, s1), makeCard(r2, s2)]);
  }
  return out;
}

/** Hand classes sorted best-to-worst by all-in equity vs one random hand. */
export const PREFLOP_RANKING = Object.keys(PREFLOP_EQUITY).sort((a, b) => PREFLOP_EQUITY[b][0] - PREFLOP_EQUITY[a][0]);

/** Percentile (0..1) of the combos that are at least as good as this class. Lower = stronger. */
export const CLASS_PERCENTILE = (() => {
  const out = {};
  let acc = 0;
  for (const l of PREFLOP_RANKING) {
    acc += comboCount(l);
    out[l] = acc / 1326;
  }
  return out;
})();

/** The strongest classes covering approximately `pct` (0..1) of all 1326 combos. */
export function topPercent(pct) {
  const out = new Set();
  let acc = 0;
  for (const l of PREFLOP_RANKING) {
    if (acc / 1326 >= pct - 1e-9) break;
    out.add(l);
    acc += comboCount(l);
  }
  return out;
}

const rIdx = (ch) => RANKS.indexOf(ch.toUpperCase());

/**
 * Parse standard range notation into a Set of class labels.
 * Supports: AA, AKs, AKo, AK, TT+, A2s+, KTo+, 22-55, A2s-A5s, "15%", "any"/"random".
 */
export function parseRange(text) {
  const out = new Set();
  const tokens = String(text || '').split(/[\s,;]+/).filter(Boolean);
  for (const raw of tokens) {
    const t = raw.trim();
    if (/^(any|random|all)$/i.test(t)) {
      ALL_CLASSES.forEach((l) => out.add(l));
      continue;
    }
    const pm = t.match(/^(\d+(?:\.\d+)?)%$/);
    if (pm) {
      topPercent(parseFloat(pm[1]) / 100).forEach((l) => out.add(l));
      continue;
    }
    const dash = t.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)-([2-9TJQKA])([2-9TJQKA])([so]?)$/i);
    if (dash) {
      const [, a1, b1, s1, a2, b2] = dash;
      const suf = s1.toLowerCase();
      if (a1.toUpperCase() === b1.toUpperCase()) {
        // pair range 22-55
        const lo = Math.min(rIdx(a1), rIdx(a2));
        const hi = Math.max(rIdx(a1), rIdx(a2));
        for (let r = lo; r <= hi; r++) out.add(RANKS[r] + RANKS[r]);
      } else {
        const hiR = rIdx(a1);
        const lo = Math.min(rIdx(b1), rIdx(b2));
        const hi = Math.max(rIdx(b1), rIdx(b2));
        for (let r = lo; r <= hi; r++) addClass(out, RANKS[hiR], RANKS[r], suf);
      }
      continue;
    }
    const m = t.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)$/i);
    if (!m) throw new Error(`Cannot parse range token "${t}"`);
    const [, a, b, sRaw, plus] = m;
    const suf = sRaw.toLowerCase();
    let ra = rIdx(a);
    let rb = rIdx(b);
    if (ra === rb) {
      if (plus) for (let r = ra; r <= 12; r++) out.add(RANKS[r] + RANKS[r]);
      else out.add(RANKS[ra] + RANKS[ra]);
      continue;
    }
    if (ra < rb) [ra, rb] = [rb, ra];
    if (plus) for (let r = rb; r < ra; r++) addClass(out, RANKS[ra], RANKS[r], suf);
    else addClass(out, RANKS[ra], RANKS[rb], suf);
  }
  return out;
}

function addClass(set, hi, lo, suf) {
  if (suf === 's' || suf === '') set.add(hi + lo + 's');
  if (suf === 'o' || suf === '') set.add(hi + lo + 'o');
}

/** Concrete combos [c1, c2, weight] for a set of classes, minus combos using dead cards. */
export function rangeCombos(classes, dead = [], weights = null) {
  const deadMask = new Uint8Array(52);
  for (const c of dead) deadMask[c] = 1;
  const out = [];
  for (const l of classes) {
    const w = weights ? weights[l] ?? 0 : 1;
    if (w <= 0) continue;
    for (const [a, b] of combosForClass(l)) if (!deadMask[a] && !deadMask[b]) out.push([a, b, w]);
  }
  return out;
}

export function rangeComboCount(classes) {
  let n = 0;
  for (const l of classes) n += comboCount(l);
  return n;
}

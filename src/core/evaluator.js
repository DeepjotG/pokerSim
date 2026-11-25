// Hand evaluator for 5, 6 or 7 cards.
//
// evaluate(cards) returns one integer "score": higher score = better hand.
//   score = category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5
// category is 0 (high card) .. 8 (straight flush); k1..k5 are tie-break ranks.
// Comparing two hands is then a single integer comparison.
//
// Correctness is verified by enumerating every 5-card hand (2,598,960) and every
// 7-card hand (133,784,560) and matching the textbook frequencies
// (see tests/evaluator.test.js and scripts/verify-evaluator.js).

import { RANK_NAMES, RANK_PLURALS } from './cards.js';

export const HAND_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

export const CATEGORY_COUNT = HAND_NAMES.length;

const counts = new Uint8Array(13);

function popcount(x) {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Highest rank of a 5-card straight inside a 13-bit rank mask, or -1. Handles the A-2-3-4-5 wheel. */
export function straightHigh(mask) {
  // Shift left by one and copy the ace into bit 0 so the ace can play low.
  const m = (mask << 1) | ((mask >> 12) & 1);
  const s = m & (m >> 1) & (m >> 2) & (m >> 3) & (m >> 4);
  if (!s) return -1;
  return 31 - Math.clz32(s) + 3;
}

/** Pack the highest `n` ranks set in `mask` into nibbles (for kickers). */
function topRanks(mask, n) {
  let out = 0;
  let taken = 0;
  for (let r = 12; r >= 0 && taken < n; r--) {
    if (mask & (1 << r)) {
      out = (out << 4) | r;
      taken++;
    }
  }
  // left-align so that scores with fewer kickers compare correctly
  return out << (4 * (5 - taken));
}

/** Evaluate 5-7 cards (array of ints 0..51). Returns a comparable integer score. */
export function evaluate(cards) {
  counts.fill(0);
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  let rankMask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = c >> 2;
    const bit = 1 << r;
    counts[r]++;
    rankMask |= bit;
    switch (c & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit;
    }
  }

  // Flush / straight flush
  let flushMask = 0;
  if (popcount(s0) >= 5) flushMask = s0;
  else if (popcount(s1) >= 5) flushMask = s1;
  else if (popcount(s2) >= 5) flushMask = s2;
  else if (popcount(s3) >= 5) flushMask = s3;
  if (flushMask) {
    const sf = straightHigh(flushMask);
    if (sf >= 0) return (8 << 20) | (sf << 16);
  }

  // Multiples (scan high to low so the first found is the highest)
  let quad = -1, trip1 = -1, trip2 = -1, pair1 = -1, pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = counts[r];
    if (n === 4) quad = r;
    else if (n === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (n === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
    }
  }

  if (quad >= 0) {
    const kick = topRanks(rankMask & ~(1 << quad), 1) >> 16;
    return (7 << 20) | (quad << 16) | (kick << 12);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    const p = Math.max(trip2, pair1);
    return (6 << 20) | (trip1 << 16) | (p << 12);
  }
  if (flushMask) return (5 << 20) | topRanks(flushMask, 5);

  const st = straightHigh(rankMask);
  if (st >= 0) return (4 << 20) | (st << 16);

  if (trip1 >= 0) {
    const k = topRanks(rankMask & ~(1 << trip1), 2) >> 4;
    return (3 << 20) | (trip1 << 16) | k;
  }
  if (pair1 >= 0 && pair2 >= 0) {
    const k = topRanks(rankMask & ~(1 << pair1) & ~(1 << pair2), 1) >> 16;
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (k << 8);
  }
  if (pair1 >= 0) {
    const k = topRanks(rankMask & ~(1 << pair1), 3) >> 4;
    return (1 << 20) | (pair1 << 16) | k;
  }
  return topRanks(rankMask, 5);
}

export const categoryOf = (score) => score >> 20;

const nib = (score, i) => (score >> (16 - 4 * i)) & 15;

/** Human-readable description, e.g. "Two Pair, Kings and Sevens". */
export function describeScore(score) {
  const cat = categoryOf(score);
  const a = nib(score, 0);
  const b = nib(score, 1);
  switch (cat) {
    case 8: return a === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[a]} high`;
    case 7: return `Four of a Kind, ${RANK_PLURALS[a]}`;
    case 6: return `Full House, ${RANK_PLURALS[a]} full of ${RANK_PLURALS[b]}`;
    case 5: return `Flush, ${RANK_NAMES[a]} high`;
    case 4: return `Straight, ${RANK_NAMES[a]} high`;
    case 3: return `Three of a Kind, ${RANK_PLURALS[a]}`;
    case 2: return `Two Pair, ${RANK_PLURALS[a]} and ${RANK_PLURALS[b]}`;
    case 1: return `Pair of ${RANK_PLURALS[a]}`;
    default: return `High Card, ${RANK_NAMES[a]}`;
  }
}

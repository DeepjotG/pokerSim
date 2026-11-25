// Seedable pseudo-random number generator (PRNG).
//
// Why seedable? A seed makes every "random" experiment reproducible:
// the same seed always produces the same deck order, so you can replay
// a session or compare two strategies on identical cards.

/** mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296);
}

export class RNG {
  constructor(seed = randomSeed()) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
    this._spare = null;
  }

  /** Uniform float in [0, 1). */
  next() {
    return this._next();
  }

  /** Uniform integer in [0, n). */
  int(n) {
    return Math.floor(this._next() * n);
  }

  /** True with probability p. */
  chance(p) {
    return this._next() < p;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /** In-place Fisher–Yates shuffle: every permutation is equally likely. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Standard normal sample N(0,1) via the Box–Muller transform. */
  normal() {
    if (this._spare !== null) {
      const s = this._spare;
      this._spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this._next();
    const v = this._next();
    const r = Math.sqrt(-2 * Math.log(u));
    this._spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
}

// Statistics toolkit. Every function here is used somewhere in the simulator
// and explained in the "Learn" tab.

/** n choose k, exact for every value used in poker (fits in a double). */
export function nCr(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export function sum(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs) {
  return xs.length ? sum(xs) / xs.length : NaN;
}

/** Sample variance (divides by n-1, "Bessel's correction"). */
export function variance(xs) {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (n - 1);
}

export const stdDev = (xs) => Math.sqrt(variance(xs));

/** Standard error of the mean: SD / sqrt(n). */
export const standardError = (xs) => stdDev(xs) / Math.sqrt(xs.length);

/** Welford's online algorithm: numerically stable running mean & variance. */
export class RunningStats {
  constructor() {
    this.n = 0;
    this.m = 0;
    this.s = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  push(x) {
    this.n++;
    const d = x - this.m;
    this.m += d / this.n;
    this.s += d * (x - this.m);
    if (x < this.min) this.min = x;
    if (x > this.max) this.max = x;
  }

  get mean() {
    return this.n ? this.m : NaN;
  }

  get variance() {
    return this.n > 1 ? this.s / (this.n - 1) : NaN;
  }

  get sd() {
    return Math.sqrt(this.variance);
  }

  get se() {
    return this.sd / Math.sqrt(this.n);
  }

  /** Normal-approximation confidence interval for the mean. */
  ci(z = 1.96) {
    return [this.mean - z * this.se, this.mean + z * this.se];
  }
}

/** Error function, Abramowitz & Stegun 7.1.26 refined (max error ~1.2e-7). */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.5 * x);
  const y =
    1 -
    t *
      Math.exp(
        -x * x -
          1.26551223 +
          t *
            (1.00002368 +
              t *
                (0.37409196 +
                  t *
                    (0.09678418 +
                      t *
                        (-0.18628806 +
                          t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
      );
  return sign * y;
}

export function normalPdf(x, mu = 0, sigma = 1) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export function normalCdf(x, mu = 0, sigma = 1) {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

/** Inverse standard normal CDF (Acklam's algorithm, rel. error < 1.15e-9). */
export function normalInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** z value for a two-sided confidence level, e.g. 0.95 -> 1.96. */
export const zFor = (level) => normalInv(1 - (1 - level) / 2);

/**
 * Wilson score interval for a proportion (successes / n).
 * Much better than the naive p ± z·sqrt(p(1-p)/n) for small n or p near 0/1.
 */
export function wilsonInterval(successes, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function binomialPmf(k, n, p) {
  return nCr(n, k) * p ** k * (1 - p) ** (n - k);
}

// ---------- Gamma / Beta special functions (Numerical Recipes style) ----------

export function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let s = 1 / a;
    let del = s;
    for (let n = 0; n < 500; n++) {
      ap++;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-14) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  return 1 - gammaQcf(a, x);
}

function gammaQcf(a, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Upper-tail probability of a chi-square distribution with `df` degrees of freedom. */
export function chiSquarePValue(stat, df) {
  return 1 - gammaP(df / 2, stat / 2);
}

/**
 * Pearson chi-square goodness-of-fit test.
 * observed: counts; expectedProbs: probabilities summing to 1.
 */
export function chiSquareTest(observed, expectedProbs) {
  const n = sum(observed);
  let stat = 0;
  const expected = expectedProbs.map((p) => p * n);
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] > 0) stat += (observed[i] - expected[i]) ** 2 / expected[i];
  }
  const df = observed.length - 1;
  return { stat, df, pValue: chiSquarePValue(stat, df), expected };
}

function betacf(a, b, x) {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b) = CDF of Beta(a, b) at x. */
export function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Quantile of Beta(a, b) by bisection. */
export function betaInv(p, a, b) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function betaPdf(x, a, b) {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + logGamma(a + b) - logGamma(a) - logGamma(b));
}

/**
 * Bayesian estimate of a frequency with a Beta prior.
 * Prior Beta(a0, b0) + data (successes, failures) => posterior Beta(a0+s, b0+f).
 */
export function betaPosterior(successes, failures, a0 = 1, b0 = 1, level = 0.95) {
  const a = a0 + successes;
  const b = b0 + failures;
  const tail = (1 - level) / 2;
  return { a, b, mean: a / (a + b), ci: [betaInv(tail, a, b), betaInv(1 - tail, a, b)] };
}

// ---------- descriptive helpers ----------

/** Linear-interpolated percentile of a SORTED array (p in [0,1]). */
export function percentileSorted(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function histogram(values, bins = 30, range = null) {
  const lo = range ? range[0] : Math.min(...values);
  const hi = range ? range[1] : Math.max(...values);
  const width = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let i = Math.floor((v - lo) / width);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    counts[i]++;
  }
  return { lo, hi, width, counts, edges: counts.map((_, i) => lo + i * width) };
}

export function skewness(xs) {
  const n = xs.length;
  if (n < 3) return NaN;
  const m = mean(xs);
  const s = stdDev(xs);
  let acc = 0;
  for (const x of xs) acc += ((x - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * acc;
}

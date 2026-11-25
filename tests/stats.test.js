import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/core/stats.js';

const close = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('combinations', () => {
  assert.equal(S.nCr(52, 2), 1326);
  assert.equal(S.nCr(52, 5), 2598960);
  assert.equal(S.nCr(52, 7), 133784560);
  assert.equal(S.nCr(48, 5), 1712304);
});

test('normal distribution', () => {
  close(S.normalCdf(0), 0.5);
  close(S.normalCdf(1.96), 0.975, 1e-4);
  close(S.normalInv(0.975), 1.959964, 1e-5);
  close(S.zFor(0.95), 1.959964, 1e-5);
  close(S.normalInv(0.01), -2.326348, 1e-5);
});

test('mean / variance / Welford agree', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  close(S.mean(xs), 5);
  close(S.variance(xs), 32 / 7);
  const rs = new S.RunningStats();
  xs.forEach((x) => rs.push(x));
  close(rs.mean, 5);
  close(rs.variance, 32 / 7);
});

test('Wilson interval', () => {
  const [lo, hi] = S.wilsonInterval(5, 10);
  close(lo, 0.2366, 1e-3);
  close(hi, 0.7634, 1e-3);
  const [lo0, hi0] = S.wilsonInterval(0, 20);
  assert.equal(lo0, 0);
  assert.ok(hi0 > 0.1 && hi0 < 0.2);
});

test('chi-square p-values', () => {
  close(S.chiSquarePValue(3.841, 1), 0.05, 1e-3);
  close(S.chiSquarePValue(11.07, 5), 0.05, 1e-3);
  close(S.chiSquarePValue(15.507, 8), 0.05, 1e-3);
  const t = S.chiSquareTest([50, 50], [0.5, 0.5]);
  assert.equal(t.stat, 0);
  close(t.pValue, 1);
});

test('beta distribution', () => {
  close(S.betaCdf(0.5, 2, 2), 0.5);
  close(S.betaCdf(0.3, 1, 1), 0.3);
  const post = S.betaPosterior(7, 3, 1, 1);
  close(post.mean, 8 / 12);
  assert.ok(post.ci[0] < post.mean && post.mean < post.ci[1]);
  close(S.betaInv(S.betaCdf(0.42, 3, 5), 3, 5), 0.42, 1e-6);
});

test('dealing is unbiased: chi-square p-values over many seeds look uniform', async () => {
  const { RNG } = await import('../src/core/rng.js');
  const { evaluate } = await import('../src/core/evaluator.js');
  const SEVEN = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584].map((c) => c / 133784560);
  const ps = [];
  for (let s = 1; s <= 30; s++) {
    const rng = new RNG(s * 7919);
    const counts = new Array(9).fill(0);
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const hand = new Array(7);
    for (let t = 0; t < 20000; t++) {
      for (let i = 0; i < 7; i++) {
        const j = i + rng.int(52 - i);
        [deck[i], deck[j]] = [deck[j], deck[i]];
        hand[i] = deck[i];
      }
      counts[evaluate(hand) >> 20]++;
    }
    ps.push(S.chiSquareTest(counts, SEVEN).pValue);
  }
  const meanP = S.mean(ps);
  const small = ps.filter((p) => p < 0.05).length;
  assert.ok(meanP > 0.3 && meanP < 0.7, `mean p ${meanP}`);
  assert.ok(small <= 6, `${small} of 30 tests rejected at 5%`);
});

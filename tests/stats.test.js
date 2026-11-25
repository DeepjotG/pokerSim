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

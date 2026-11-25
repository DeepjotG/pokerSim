import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, categoryOf, describeScore } from '../src/core/evaluator.js';
import { parseCards } from '../src/core/cards.js';

const ev = (s) => evaluate(parseCards(s));

test('all 2,598,960 five-card hands match textbook category counts', () => {
  const counts = new Array(9).fill(0);
  const h = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++)
        for (let d = c + 1; d < 52; d++)
          for (let e = d + 1; e < 52; e++) {
            h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
            counts[categoryOf(evaluate(h))]++;
          }
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
});

test('hand ordering', () => {
  const order = [
    'AhKhQhJhTh', // royal
    '9s8s7s6s5s', // straight flush
    '5d4d3d2dAd', // steel wheel
    'QsQdQhQc2d', // quads
    'JsJdJh2c2d', // full house
    'As9s7s4s2s', // flush
    'AsKdQhJcTs', // broadway
    '5s4d3h2cAs', // wheel
    '8s8d8hKc2d', // trips
    'KsKd5h5c9d', // two pair
    'AsAd9h5c3d', // pair
    'AsQd9h5c3d', // high card
  ];
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(ev(order[i]) > ev(order[i + 1]), `${order[i]} should beat ${order[i + 1]}`);
  }
});

test('kickers and best-5-of-7 selection', () => {
  assert.ok(ev('AsAdKh5c3d') > ev('AsAdQh5c3d'));
  assert.equal(ev('AsAdKhQc3d2h7s'), ev('AhAcKdQs3c2d7d'));
  assert.ok(ev('KsKd7h7c5d') > ev('KsKd6h6cAd')); // second pair beats kicker
  assert.ok(ev('KsKd7h7cAd') > ev('KsKd7h7cQd')); // kicker decides
  assert.equal(describeScore(ev('2c2d2h3s3c3d4h')), 'Full House, Threes full of Twos'); // two trips
  assert.equal(describeScore(ev('AsAdAhKcKd2c3c')), 'Full House, Aces full of Kings');
  assert.equal(describeScore(ev('6h5d4c3s2h7d8c')), 'Straight, Eight high');
  assert.equal(describeScore(ev('2h3h4h5h7h9h8c')), 'Flush, Nine high');
  assert.equal(describeScore(ev('AhKhQhJhTh9h8h')), 'Royal Flush');
  // 7 cards with straight AND flush in different suits: flush wins
  assert.equal(categoryOf(ev('9h8h7h6s5h2hKc')), 5);
});

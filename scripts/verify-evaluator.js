// Proof of evaluator correctness: enumerate all C(52,7) = 133,784,560 seven-card
// hands and compare category counts with the published frequencies.
// Takes ~1 minute. Usage: npm run verify
import { evaluate, HAND_NAMES } from '../src/core/evaluator.js';

const EXPECTED = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584];
const counts = new Array(9).fill(0);
const h = new Array(7);
const t0 = Date.now();
for (let a = 0; a < 46; a++) {
  h[0] = a;
  for (let b = a + 1; b < 47; b++) {
    h[1] = b;
    for (let c = b + 1; c < 48; c++) {
      h[2] = c;
      for (let d = c + 1; d < 49; d++) {
        h[3] = d;
        for (let e = d + 1; e < 50; e++) {
          h[4] = e;
          for (let f = e + 1; f < 51; f++) {
            h[5] = f;
            for (let g = f + 1; g < 52; g++) {
              h[6] = g;
              counts[evaluate(h) >> 20]++;
            }
          }
        }
      }
    }
  }
}
const total = counts.reduce((x, y) => x + y, 0);
let ok = true;
console.log('Category           Count        Expected     Probability');
for (let i = 8; i >= 0; i--) {
  const match = counts[i] === EXPECTED[i];
  ok &&= match;
  console.log(
    `${HAND_NAMES[i].padEnd(18)} ${String(counts[i]).padStart(10)}  ${String(EXPECTED[i]).padStart(10)}  ${((100 * counts[i]) / total).toFixed(4).padStart(8)}%  ${match ? 'OK' : 'MISMATCH'}`,
  );
}
console.log(`Total ${total} hands in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${ok ? 'ALL MATCH' : 'FAILED'}`);
process.exit(ok ? 0 : 1);

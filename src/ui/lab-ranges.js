// Ranges & Bayes Lab: 13x13 range grid, combos & blockers, equity vs range,
// and Bayesian updating of an opponent's range after an action.

import { gridLabel, comboCount, combosForClass, parseRange, CLASS_PERCENTILE, PREFLOP_RANKING, topPercent, rangeCombos } from '../core/ranges.js';
import { calcEquity } from '../core/equity.js';
import { BOT_PROFILES } from '../game/bots.js';
import { RNG } from '../core/rng.js';
import { el, $, clear, pct, num, term, mathBlock, cardInput } from './dom.js';

let root;
const rng = new RNG();
const st = { selected: topPercent(0.15), dragging: null };

export function initRangesLab(container) {
  root = container;
  root.append(
    el(
      'div.lab-intro',
      {},
      el('h2', {}, 'Ranges & Bayes Lab'),
      el(
        'p',
        {},
        'Opponents hold a ',
        term('range', 'range'),
        ' of hands, not one hand. Count ',
        term('combos', 'combos'),
        ', see how your cards act as ',
        term('blockers', 'blockers'),
        ', and use ',
        term("Bayes' theorem", 'bayes'),
        ' to update a range after the opponent acts.',
      ),
    ),
    el('div.grid-2', {}, el('div#range-editor.panel'), el('div.panel', {}, el('div#range-info'), el('div#range-eq'))),
    el('div#bayes.panel'),
  );
  buildEditor();
  buildEquity();
  buildBayes();
}

// ------------------------------------------------------------------ range editor

function buildEditor() {
  const box = $('#range-editor', root);
  const text = el('input.range-input', { type: 'text', placeholder: 'e.g. TT+, AQs+, KQo or 15%' });
  const gridBox = el('div.range-grid');
  st.dead = cardInput({ placeholder: 'your cards / board, e.g. AsKd', max: 7, onchange: () => renderGrid() });
  text.addEventListener('change', () => {
    try {
      st.selected = parseRange(text.value);
      renderGrid();
    } catch (e) {
      alert(e.message);
    }
  });
  const pctSlider = el('input', { type: 'range', min: 1, max: 100, value: 15 });
  const pctLabel = el('b', {}, '15%');
  pctSlider.addEventListener('input', () => {
    pctLabel.textContent = `${pctSlider.value}%`;
    st.selected = topPercent(+pctSlider.value / 100);
    renderGrid();
  });
  st.text = text;
  st.gridBox = gridBox;
  box.append(
    el('h3', {}, 'Range editor'),
    el('p.small.muted', {}, 'Click or drag across cells. Pairs on the diagonal, suited above, offsuit below. Numbers show live combos (after blockers).'),
    el('div.row', {}, el('label.inline', {}, 'Top ', pctLabel, ' of hands ', pctSlider)),
    el('div.row', {}, el('label.inline', {}, 'Range text ', text)),
    el(
      'div.preset-row',
      {},
      [
        ['Premium (QQ+, AK)', 'QQ+, AK'],
        ['Broadways', 'TT+, AT+, KT+, QT+, JT'],
        ['Suited connectors', '54s, 65s, 76s, 87s, 98s, T9s, JTs'],
        ['Any pair', '22+'],
        ['Any ace', 'A2+'],
        ['Clear', ''],
      ].map(([l, r]) => el('button.chip-btn', { onclick: () => ((st.selected = parseRange(r)), renderGrid()) }, l)),
    ),
    gridBox,
    el('div.row', {}, el('label', {}, 'Blockers (known cards): ', st.dead)),
  );
  document.addEventListener('pointerup', () => (st.dragging = null));
  renderGrid();
}

function deadMask() {
  const m = new Uint8Array(52);
  for (const c of st.dead.getCards() || []) m[c] = 1;
  return m;
}

function liveCombos(label, mask) {
  return combosForClass(label).filter(([a, b]) => !mask[a] && !mask[b]).length;
}

function renderGrid() {
  const box = clear(st.gridBox);
  const mask = deadMask();
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const label = gridLabel(r, c);
      const on = st.selected.has(label);
      const live = liveCombos(label, mask);
      const cell = el(
        `div.rcell${on ? '.on' : ''}${r === c ? '.pair' : r < c ? '.suited' : '.offsuit'}`,
        { title: `${label}: ${live}/${comboCount(label)} combos, top ${pct(CLASS_PERCENTILE[label], 0)}`, dataset: { label } },
        el('span.rl', {}, label),
        el('span.rc', {}, `${live}`),
      );
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        st.dragging = on ? 'off' : 'on';
        toggle(label);
      });
      cell.addEventListener('pointerenter', () => {
        if (!st.dragging) return;
        const has = st.selected.has(label);
        if ((st.dragging === 'on') !== has) toggle(label);
      });
      box.append(cell);
    }
  }
  renderInfo();
}

function toggle(label) {
  if (st.selected.has(label)) st.selected.delete(label);
  else st.selected.add(label);
  renderGrid();
}

function compress(set) {
  return PREFLOP_RANKING.filter((l) => set.has(l)).join(', ');
}

function renderInfo() {
  const box = clear($('#range-info', root));
  const mask = deadMask();
  const dead = st.dead.getCards() || [];
  let full = 0;
  let live = 0;
  let pairs = 0;
  let suited = 0;
  let offsuit = 0;
  for (const l of st.selected) {
    const n = comboCount(l);
    const lv = liveCombos(l, mask);
    full += n;
    live += lv;
    if (l.length === 2) pairs += lv;
    else if (l[2] === 's') suited += lv;
    else offsuit += lv;
  }
  const totalLive = (52 - dead.length) * (51 - dead.length) / 2;
  if (st.text) st.text.value = compress(st.selected);
  box.append(
    el('h3', {}, 'Range statistics'),
    el(
      'div.tiles',
      {},
      el('div.tile', {}, el('div.tile-label', {}, 'Classes'), el('div.tile-value', {}, `${st.selected.size} / 169`)),
      el('div.tile', {}, el('div.tile-label', {}, 'Combos'), el('div.tile-value', {}, num(live)), el('div.tile-sub', {}, dead.length ? `${num(full)} before blockers` : 'of 1,326')),
      el('div.tile', {}, el('div.tile-label', {}, 'Share of all hands'), el('div.tile-value', {}, pct(live / totalLive))),
    ),
    el('div.kv', {}, kv('Pairs', `${pairs} combos`), kv('Suited', `${suited} combos`), kv('Offsuit', `${offsuit} combos`)),
    mathBlock(
      `<p>Combos per class: pair C(4,2) = 6, suited 4, offsuit 4 × 3 = 12.</p>
<p>Share = combos / ${num(totalLive)} ${dead.length ? `(= C(${52 - dead.length}, 2) after removing ${dead.length} known cards)` : '(= C(52, 2))'}.</p>
<p>Blockers: each known card removes every combo that contains it — e.g. holding A♠ leaves 3 AA combos instead of 6 (conditional probability).</p>`,
    ),
  );
}

function buildEquity() {
  const box = $('#range-eq', root);
  const heroIn = cardInput({ placeholder: 'your hand, e.g. JhTh', max: 2 });
  const boardIn = cardInput({ placeholder: 'board (optional)', max: 5 });
  const out = el('div');
  box.append(
    el('h4', {}, 'Your equity against this range'),
    el('div.row', {}, heroIn, boardIn),
    el(
      'button.btn.primary',
      {
        onclick: () => {
          const h = heroIn.getCards();
          const b = boardIn.getCards() || [];
          clear(out);
          if (!h || h.length !== 2) return out.append(el('p.input-error', {}, 'Enter your two cards.'));
          if (!st.selected.size) return out.append(el('p.input-error', {}, 'Select a range first.'));
          try {
            const res = calcEquity({ players: [{ cards: h }, { combos: rangeCombos(st.selected) }], board: b }, { mode: 'auto', iterations: 30000, rng, workLimit: 2_000_000 });
            const p = res.players[0];
            out.append(
              el('p', {}, el('b', {}, pct(p.equity, 1)), ` equity (${res.method === 'exact' ? 'exact' : `Monte Carlo ± ${pct(1.96 * p.se, 1)}`}) — win ${pct(p.win)}, tie ${pct(p.tie)}.`),
              el('p.small.muted', {}, 'Your own cards are removed from the range automatically (blockers).'),
            );
          } catch (e) {
            out.append(el('p.input-error', {}, e.message));
          }
        },
      },
      'Calculate equity',
    ),
    out,
  );
}

function kv(k, v) {
  return el('div.kv-row', {}, el('span.k', {}, k), el('span.v', {}, v));
}

// ------------------------------------------------------------------ Bayes

// P(action | hand class) for a bot, derived from its decision rule:
// the bot compares (percentile + U) with thresholds, where U ~ Uniform(-0.03, 0.03).
function probBelow(threshold, pctile) {
  return Math.max(0, Math.min(1, (threshold - pctile + 0.03) / 0.06));
}

const ACTIONS = {
  open: { label: 'Raises first in (open-raise)', like: (P, q) => probBelow(P.raise, q) },
  limp: { label: 'Just calls the big blind (limp)', like: (P, q) => Math.max(0, probBelow(P.play, q) - probBelow(P.raise, q)) },
  threebet: { label: 'Re-raises a raise (3-bet)', like: (P, q) => probBelow(P.raise * 0.35, q) },
  callraise: { label: 'Calls a raise', like: (P, q) => Math.max(0, probBelow(P.play * 0.5 + 0.02, q) - probBelow(P.raise * 0.35, q)) },
};

function buildBayes() {
  const box = $('#bayes', root);
  const profSel = el('select', {}, Object.entries(BOT_PROFILES).map(([k, p]) => el('option', { value: k }, p.label)));
  const actSel = el('select', {}, Object.entries(ACTIONS).map(([k, a]) => el('option', { value: k }, a.label)));
  const heroIn = cardInput({ placeholder: 'your cards (blockers), optional', max: 2, onchange: () => update() });
  const gridBox = el('div.range-grid.heat');
  const out = el('div');
  const detail = el('div.bayes-detail');
  let selectedCell = 'AKo';
  const update = () => {
    const P = BOT_PROFILES[profSel.value];
    const A = ACTIONS[actSel.value];
    const mask = new Uint8Array(52);
    for (const c of heroIn.getCards() || []) mask[c] = 1;
    const rows = [];
    let evidence = 0;
    let priorTotal = 0;
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const label = gridLabel(r, c);
        const prior = liveCombos(label, mask);
        const like = A.like(P, CLASS_PERCENTILE[label]);
        rows.push({ label, prior, like, joint: prior * like });
        evidence += prior * like;
        priorTotal += prior;
      }
    }
    for (const x of rows) {
      x.priorP = x.prior / priorTotal;
      x.post = evidence ? x.joint / evidence : 0;
    }
    const maxPost = Math.max(...rows.map((x) => x.post));
    clear(gridBox);
    for (const x of rows) {
      const intensity = maxPost ? x.post / maxPost : 0;
      const cell = el(
        `div.rcell.heatcell${x.label === selectedCell ? '.sel' : ''}${intensity > 0.55 ? '.hot' : ''}`,
        { title: `${x.label}: posterior ${pct(x.post, 2)}`, style: { '--heat': intensity.toFixed(3) } },
        el('span.rl', {}, x.label),
        el('span.rc', {}, x.post >= 0.0005 ? pct(x.post, 1) : ''),
      );
      cell.addEventListener('click', () => {
        selectedCell = x.label;
        update();
      });
      gridBox.append(cell);
    }
    const pAction = evidence / priorTotal;
    const premium = parseRange('QQ+, AK');
    const pPrem = rows.filter((x) => premium.has(x.label)).reduce((s, x) => s + x.post, 0);
    const priorPrem = rows.filter((x) => premium.has(x.label)).reduce((s, x) => s + x.priorP, 0);
    const top = [...rows].sort((a, b) => b.post - a.post).slice(0, 8);
    clear(out).append(
      el(
        'div.tiles',
        {},
        el('div.tile', {}, el('div.tile-label', {}, 'P(action) overall'), el('div.tile-value', {}, pct(pAction, 1)), el('div.tile-sub', {}, 'the evidence term P(E)')),
        el('div.tile', {}, el('div.tile-label', {}, 'P(QQ+ or AK) before'), el('div.tile-value', {}, pct(priorPrem, 1))),
        el('div.tile', {}, el('div.tile-label', {}, 'P(QQ+ or AK) after'), el('div.tile-value', {}, pct(pPrem, 1)), el('div.tile-sub', {}, `×${(pPrem / priorPrem).toFixed(1)} more likely`)),
      ),
      el('p.small', {}, 'Most likely holdings: ', top.map((x) => `${x.label} ${pct(x.post, 1)}`).join(', ')),
    );
    const s = rows.find((x) => x.label === selectedCell) || rows[0];
    clear(detail).append(
      el('h4', {}, `Bayes for ${s.label} (click any cell)`),
      el(
        'div.math-body',
        {
          html: `<p><b>Prior</b> P(${s.label}) = live combos / all live combos = ${s.prior} / ${priorTotal} = ${pct(s.priorP, 3)}</p>
<p><b>Likelihood</b> P(action | ${s.label}) = ${pct(s.like, 1)} <span class="muted">(${s.label} is in the top ${pct(CLASS_PERCENTILE[s.label], 0)}; this bot's rule + random noise)</span></p>
<p><b>Evidence</b> P(action) = Σ P(action | h) · P(h) = ${pct(pAction, 2)}</p>
<p><b>Posterior</b> P(${s.label} | action) = ${pct(s.like, 1)} × ${pct(s.priorP, 3)} / ${pct(pAction, 2)} = <b>${pct(s.post, 3)}</b></p>`,
        },
      ),
    );
  };
  profSel.addEventListener('change', update);
  actSel.addEventListener('change', update);
  box.append(
    el('h3', {}, "Bayes' theorem: what does the opponent hold after they act?"),
    el(
      'p.small.muted',
      {},
      'Prior = how often each hand is dealt (combos, minus your blockers). Likelihood = how often this bot type takes the action with that hand (read straight from its strategy). Posterior ∝ prior × likelihood. Darker = more likely.',
    ),
    el('div.row', {}, el('label.inline', {}, 'Opponent ', profSel), el('label.inline', {}, 'Action ', actSel), heroIn),
    el('div.grid-2', {}, gridBox, el('div', {}, out, detail)),
  );
  update();
}

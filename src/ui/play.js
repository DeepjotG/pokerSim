// The Play tab: a live No-Limit Hold'em table against bots with a statistics HUD,
// per-decision EV review, and session statistics.

import { Game } from '../game/engine.js';
import { botDecide, BOT_PROFILES } from '../game/bots.js';
import { Tracker } from '../game/tracker.js';
import { analyzeDecision, evRaise, hindsightEquity, judge, PRIORS } from '../game/analysis.js';
import { HAND_NAMES, describeScore } from '../core/evaluator.js';
import { RNG, randomSeed } from '../core/rng.js';
import { normalCdf, histogram, mean, skewness, percentileSorted } from '../core/stats.js';
import { impliedOddsNeeded } from '../core/odds.js';
import { el, $, clear, pct, num, signed, sign, cardEl, cardText, term, mathBlock, statTile, gauge } from './dom.js';
import { lineChart, barChart, histogramChart, SERIES } from './charts.js';

const PROFILE_KEYS = Object.keys(BOT_PROFILES);
const BOT_NAMES = ['Ada', 'Blaise', 'Carl', 'Daphne', 'Emmy', 'Florence', 'Gauss', 'Hedy'];

const S = {
  settings: {
    opponents: 3,
    profile: 'mixed',
    stackBB: 100,
    seed: '',
    showStyles: true,
    showReasons: true,
    sims: 4000,
    speed: 450,
    ffHands: 1000,
    ffProfile: 'tag',
  },
  game: null,
  tracker: null,
  botRng: null,
  hudRng: null,
  decisions: [],
  analysis: null,
  history: [],
  subtab: 'hand',
  statsPlayer: 0,
  timer: null,
  running: false,
  review: null,
};

let root;

// =================================================================== setup

export function initPlay(container) {
  root = container;
  root.append(
    el(
      'div.play-layout',
      {},
      el(
        'div.play-main',
        {},
        el('div#play-settings'),
        el('div.table-wrap', {}, el('div#table.felt')),
        el('div#action-bar.action-bar'),
        el(
          'div.subtabs',
          { role: 'tablist' },
          ...[
            ['hand', 'This hand'],
            ['session', 'Session stats'],
            ['opponents', 'Player stats (HUD)'],
            ['history', 'Hand history'],
          ].map(([k, label]) => el('button.subtab', { 'data-sub': k, onclick: () => setSubtab(k) }, label)),
        ),
        el('div#subtab-content'),
      ),
      el('aside#hud.hud'),
    ),
  );
  renderSettings();
  newSession();
}

function renderSettings() {
  const s = S.settings;
  const box = clear($('#play-settings'));
  const select = (key, options, onchange) =>
    el(
      'select',
      {
        onchange: (e) => {
          s[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value;
          onchange && onchange();
        },
      },
      options.map(([v, l]) => el('option', { value: v, selected: String(s[key]) === String(v) }, l)),
    );
  const check = (key, label, onchange) =>
    el(
      'label.check',
      {},
      el('input', {
        type: 'checkbox',
        checked: s[key],
        onchange: (e) => {
          s[key] = e.target.checked;
          onchange && onchange();
        },
      }),
      label,
    );
  const seedInput = el('input', { type: 'text', placeholder: 'random', value: s.seed, size: 10, oninput: (e) => (s.seed = e.target.value.trim()) });
  box.append(
    el(
      'details.settings',
      {},
      el('summary', {}, 'Table settings', el('span.muted', { id: 'session-meta' })),
      el(
        'div.settings-grid',
        {},
        el('label', {}, 'Opponents', select('opponents', [1, 2, 3, 4, 5].map((n) => [n, `${n}`]))),
        el('label', {}, 'Opponent style', select('profile', [['mixed', 'Mixed (one of each)'], ...PROFILE_KEYS.map((k) => [k, BOT_PROFILES[k].label])])),
        el('label', {}, 'Starting stack', select('stackBB', [[50, '50 bb'], [100, '100 bb'], [200, '200 bb']])),
        el('label', {}, 'Seed', seedInput),
        el('label', {}, 'HUD precision', select('sims', [[1500, 'fast (1,500 trials)'], [4000, 'normal (4,000)'], [12000, 'precise (12,000)']])),
        el('label', {}, 'Bot speed', select('speed', [[900, 'slow'], [450, 'normal'], [120, 'fast'], [0, 'instant']])),
        check('showStyles', 'Reveal bot styles', renderTable),
        check('showReasons', 'Show bot reasoning in log', renderSubtab),
        el('button.btn.primary', { onclick: newSession }, 'Start new session'),
      ),
      el(
        'div.ff-row',
        {},
        el('span', { html: '<b>Fast-forward:</b> let a bot play your seat to see long-run statistics emerge' }),
        select('ffHands', [[100, '100 hands'], [500, '500 hands'], [1000, '1,000 hands'], [5000, '5,000 hands']]),
        el('span', {}, 'as'),
        select('ffProfile', PROFILE_KEYS.map((k) => [k, BOT_PROFILES[k].label])),
        el('button.btn', { id: 'ff-btn', onclick: fastForward }, 'Run'),
        el('span#ff-progress.muted'),
      ),
    ),
  );
}

function newSession() {
  clearTimeout(S.timer);
  const s = S.settings;
  const seed = s.seed ? hashSeed(s.seed) : randomSeed();
  const seats = [{ name: 'You', isHuman: true }];
  for (let i = 0; i < s.opponents; i++) {
    const profile = s.profile === 'mixed' ? PROFILE_KEYS[i % PROFILE_KEYS.length] : s.profile;
    seats.push({ name: BOT_NAMES[i], profile });
  }
  // shuffle which bot gets which mixed profile (deterministically from the seed)
  if (s.profile === 'mixed') {
    const r = new RNG(seed ^ 0x5bd1e995);
    const profs = r.shuffle(PROFILE_KEYS.slice()).slice(0, s.opponents);
    profs.forEach((p, i) => (seats[i + 1].profile = p));
  }
  S.game = new Game({ seats, smallBlind: 1, bigBlind: 2, startingStack: s.stackBB * 2, seed });
  S.tracker = new Tracker(S.game.players, 2);
  S.botRng = new RNG((seed + 1) >>> 0);
  S.hudRng = new RNG((seed + 2) >>> 0);
  S.history = [];
  S.statsPlayer = 0;
  const meta = $('#session-meta');
  if (meta) meta.textContent = ` · seed ${seed} · blinds 1/2`;
  startHand();
}

function hashSeed(str) {
  if (/^\d+$/.test(str)) return Number(str) >>> 0;
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// =================================================================== game loop

function startHand() {
  S.decisions = [];
  S.analysis = null;
  S.review = null;
  S.game.startHand();
  renderAll();
  loop();
}

function loop() {
  const g = S.game;
  clearTimeout(S.timer);
  if (g.hand.finished) return endHand();
  const p = g.current;
  if (p.isHuman) {
    S.analysis = analyzeDecision(g, S.tracker, p.id, S.hudRng, { sims: S.settings.sims });
    renderAll();
    return;
  }
  S.analysis = null;
  renderTable();
  renderActions();
  S.timer = setTimeout(() => {
    const d = botDecide(g.viewFor(p.id), p.profile, S.botRng);
    const ev = g.act(d);
    ev.reason = d.reason;
    renderTable();
    renderSubtab();
    loop();
  }, S.settings.speed);
}

function heroAct(action) {
  const g = S.game;
  if (!g.current || !g.current.isHuman) return;
  const a = S.analysis;
  const d = {
    analysis: a,
    action,
    oppIds: g.livePlayers().filter((p) => !p.isHuman).map((p) => p.id),
    hole: a.hole,
    board: a.board,
  };
  if (action.type === 'raise') d.raiseEV = evRaise(a, action.amount);
  S.decisions.push(d);
  try {
    g.act(action);
  } catch (e) {
    S.decisions.pop();
    alert(e.message);
    return;
  }
  S.analysis = null;
  renderAll();
  loop();
}

function endHand() {
  const g = S.game;
  S.tracker.record(g);
  const holes = Object.fromEntries(g.players.map((p) => [p.id, p.hole]));
  for (const d of S.decisions) {
    d.hindsight = hindsightEquity(d, holes, S.hudRng);
    d.verdict = judge(d);
  }
  const hero = g.players[0];
  const r = g.hand.result;
  S.review = {
    number: g.hand.number,
    decisions: S.decisions,
    result: r,
    board: [...g.hand.board],
    players: g.players.map((p) => ({ id: p.id, name: p.name, hole: p.hole, folded: p.folded, inHand: p.inHand, profile: p.profile })),
    allIn: g.hand.allIn,
    events: g.hand.events,
    dealer: g.hand.dealer,
  };
  S.history.unshift({ number: g.hand.number, net: r.net[0], ev: r.evNet[0], showdown: r.showdown, hole: hero.hole, board: [...g.hand.board], review: S.review });
  if (S.history.length > 200) S.history.pop();
  renderAll();
}

function fastForward() {
  clearTimeout(S.timer);
  S.analysis = null;
  S.decisions = [];
  const g = S.game;
  const total = S.settings.ffHands;
  const prof = S.settings.ffProfile;
  const btn = $('#ff-btn');
  const prog = $('#ff-progress');
  btn.disabled = true;
  let done = 0;
  const step = () => {
    const t0 = performance.now();
    while (done < total && performance.now() - t0 < 40) {
      if (g.hand.finished) g.startHand();
      while (!g.hand.finished) {
        const p = g.current;
        g.act(botDecide(g.viewFor(p.id), p.isHuman ? prof : p.profile, S.botRng, { sims: 120 }));
      }
      S.tracker.record(g);
      const r = g.hand.result;
      S.history.unshift({ number: g.hand.number, net: r.net[0], ev: r.evNet[0], showdown: r.showdown, hole: g.players[0].hole, board: [...g.hand.board], review: null });
      if (S.history.length > 200) S.history.pop();
      done++;
    }
    prog.textContent = ` ${num(done)} / ${num(total)} hands`;
    if (done < total) requestAnimationFrame(step);
    else {
      btn.disabled = false;
      prog.textContent = ` done: ${num(total)} hands played by the ${BOT_PROFILES[prof].short} bot in your seat.`;
      S.review = null;
      S.decisions = [];
      setSubtab('session');
      renderAll();
    }
  };
  requestAnimationFrame(step);
}

// =================================================================== rendering

function renderAll() {
  renderTable();
  renderActions();
  renderHUD();
  renderSubtab();
}

function seatPos(k, n) {
  const ang = Math.PI / 2 + (k * 2 * Math.PI) / n;
  return { left: 50 + 43 * Math.cos(ang), top: 50 + 39 * Math.sin(ang) };
}

function renderTable() {
  const g = S.game;
  const h = g.hand;
  const t = clear($('#table'));
  const n = g.players.length;
  const finished = h.finished;
  const r = h.result;
  let lastAction = {};
  for (const e of h.events) {
    if (e.type === 'street') lastAction = {};
    if (e.type === 'action') lastAction[e.player] = e;
  }

  g.players.forEach((p, k) => {
    const pos = seatPos(k, n);
    const isTurn = !finished && h.toAct === p.id;
    const showCards = p.isHuman || (finished && r.showdown && !p.folded);
    const won = finished && r.won[p.id] > 0;
    const prof = p.profile ? BOT_PROFILES[p.profile] : null;
    const la = lastAction[p.id];
    const seat = el(
      `div.seat${isTurn ? '.turn' : ''}${p.folded ? '.folded' : ''}${won ? '.won' : ''}${p.isHuman ? '.hero' : ''}`,
      { style: { left: `${pos.left}%`, top: `${pos.top}%` } },
      el('div.seat-cards', {}, p.hole.length ? p.hole.map((c) => cardEl(c, { hidden: !showCards, small: !p.isHuman })) : null),
      el(
        'div.seat-info',
        {},
        el('div.seat-name', {}, p.name, h.dealer === p.id ? el('span.dealer-btn', { title: 'Dealer button' }, 'D') : null),
        prof && S.settings.showStyles ? el('div.seat-style', {}, prof.short) : null,
        el('div.seat-stack', {}, `${num(p.stack)} `, el('span.muted', {}, `(${num(p.stack / g.bb, 0)} bb)`)),
      ),
      p.bet > 0 && !finished ? el('div.seat-bet', {}, num(p.bet)) : null,
      la && !finished ? el('div.seat-action', {}, actionLabel(la)) : null,
      finished && r.showdown && !p.folded && r.scores[p.id] !== undefined ? el('div.seat-action', {}, describeScore(r.scores[p.id])) : null,
      finished && r.net[p.id] !== 0 && p.inHand ? el(`div.seat-result.${sign(r.net[p.id])}`, {}, signed(r.net[p.id], 0)) : null,
    );
    t.append(seat);
  });
  const boardEl = el('div.board', {}, ...[0, 1, 2, 3, 4].map((i) => (h.board[i] !== undefined ? cardEl(h.board[i]) : el('span.card.slot'))));
  t.append(
    el(
      'div.table-center',
      {},
      boardEl,
      el('div.pot', {}, `Pot ${num(finished ? r.pots.reduce((s, p) => s + p.amount, 0) : g.pot)}`, el('span.muted', {}, ` · hand #${h.number} · ${h.street}`)),
    ),
  );
}

function actionLabel(e) {
  switch (e.action) {
    case 'fold':
      return 'Fold';
    case 'check':
      return 'Check';
    case 'call':
      return `Call ${num(e.amount)}${e.allIn ? ' (all-in)' : ''}`;
    case 'bet':
      return `Bet ${num(e.to)}${e.allIn ? ' (all-in)' : ''}`;
    case 'raise':
      return `Raise to ${num(e.to)}${e.allIn ? ' (all-in)' : ''}`;
    default:
      return e.action;
  }
}

function renderActions() {
  const g = S.game;
  const bar = clear($('#action-bar'));
  if (g.hand.finished) {
    const r = g.hand.result;
    const net = r.net[0];
    bar.append(
      el('div.result-text', {}, el(`b.${sign(net)}`, {}, net === 0 ? 'Hand over: you broke even.' : `Hand over: you ${net > 0 ? 'won' : 'lost'} ${num(Math.abs(net))} chips (${signed(net / g.bb, 1)} bb).`), g.hand.allIn ? el('span.muted', {}, ` All-in EV: ${signed(r.evNet[0] / g.bb, 2)} bb.`) : null),
      el('button.btn.primary', { onclick: startHand, id: 'next-hand' }, 'Next hand ▸'),
    );
    return;
  }
  const p = g.current;
  if (!p || !p.isHuman) {
    bar.append(el('div.muted', {}, p ? `${p.name} is thinking…` : ''));
    return;
  }
  const la = g.legalActions();
  const pot = g.pot;
  const sizeFor = (frac) => Math.round(g.hand.currentBet + frac * (pot + la.toCall));
  const clamp = (v) => Math.max(la.minRaiseTo, Math.min(la.maxRaiseTo, v));
  let raiseTo = clamp(la.isBet ? Math.round(pot * 0.66) : sizeFor(0.75));
  const amount = el('input.raise-amount', { type: 'number', min: la.minRaiseTo, max: la.maxRaiseTo, step: 1, value: raiseTo });
  const slider = el('input.raise-slider', { type: 'range', min: la.minRaiseTo, max: la.maxRaiseTo, step: 1, value: raiseTo });
  const raiseBtn = el('button.btn.raise', { id: 'act-raise' });
  const setRaise = (v) => {
    raiseTo = clamp(Math.round(v));
    S.raiseTo = raiseTo;
    amount.value = raiseTo;
    slider.value = raiseTo;
    raiseBtn.textContent = `${la.isBet ? 'Bet' : 'Raise to'} ${num(raiseTo)}${raiseTo === la.maxRaiseTo ? ' (all-in)' : ''}`;
    renderWhatIf(raiseTo);
  };
  slider.addEventListener('input', () => setRaise(+slider.value));
  amount.addEventListener('change', () => setRaise(+amount.value));
  raiseBtn.addEventListener('click', () => heroAct({ type: 'raise', amount: raiseTo }));
  const presets = [
    ['Min', la.minRaiseTo],
    ['½ pot', sizeFor(0.5)],
    ['¾ pot', sizeFor(0.75)],
    ['Pot', sizeFor(1)],
    ['All-in', la.maxRaiseTo],
  ];
  bar.append(
    el(
      'div.action-buttons',
      {},
      la.toCall > 0 ? el('button.btn.fold', { id: 'act-fold', onclick: () => heroAct({ type: 'fold' }) }, 'Fold') : null,
      la.canCheck
        ? el('button.btn.call', { id: 'act-check', onclick: () => heroAct({ type: 'check' }) }, 'Check')
        : el('button.btn.call', { id: 'act-call', onclick: () => heroAct({ type: 'call' }) }, `Call ${num(la.callAmount)}${la.callAmount >= p.stack ? ' (all-in)' : ''}`),
      la.canRaise ? raiseBtn : null,
    ),
    la.canRaise
      ? el('div.raise-controls', {}, ...presets.map(([l, v]) => el('button.chip-btn', { onclick: () => setRaise(v) }, l)), slider, amount)
      : null,
  );
  if (la.canRaise) setRaise(raiseTo);
}

// ------------------------------------------------------------------- HUD

function renderHUD() {
  const hud = clear($('#hud'));
  const a = S.analysis;
  const g = S.game;
  if (!a) {
    if (g.hand.finished) {
      hud.append(el('h2', {}, 'Live stats'), el('p.muted', {}, 'Hand finished — see "This hand" below for a full review of every decision you made, with EV and hindsight equity.'));
      renderHudSessionMini(hud);
    } else {
      hud.append(el('h2', {}, 'Live stats'), el('p.muted', {}, 'Waiting for your turn… The HUD computes your equity, pot odds and EV whenever you have a decision.'));
      renderHudSessionMini(hud);
    }
    return;
  }
  const bb = a.bigBlind;
  hud.append(el('h2', {}, 'Live stats ', el('span.muted', {}, `· ${a.street}`)));

  // Your hand
  hud.append(
    el(
      'section.hud-sec',
      {},
      el('h4', {}, 'Your hand'),
      el('div.hud-hand', {}, cardText(a.hole), el('span', {}, ` ${a.handClass}`), a.board.length ? el('span.muted', {}, ' on ') : null, a.board.length ? cardText(a.board) : null),
      el('div', {}, a.made ? el('b', {}, a.made) : el('span', {}, 'Preflop: ', el('b', {}, `top ${pct(a.preflopPercentile, 0)}`), ' of starting hands')),
      a.street === 'preflop'
        ? el('div.muted.small', {}, `Ranking = share of the 1,326 combos with higher all-in equity vs a random hand (`, term('combos', 'combos'), ').')
        : null,
    ),
  );

  // Equity
  const need = a.potOdds.requiredEquity;
  const eqRow = (label, e, extra) =>
    el(
      'div.eq-row',
      {},
      el('div.eq-head', {}, el('span', {}, label), el('b', {}, pct(e.equity)), el('span.muted', {}, ` ± ${pct(1.96 * e.se, 1)}`)),
      gauge(e.equity, { marker: a.toCall > 0 ? need : null, markerLabel: `needed ${pct(need)}` }),
      extra || null,
    );
  hud.append(
    el(
      'section.hud-sec',
      {},
      el('h4', {}, term('Equity', 'equity'), el('span.muted', {}, ` vs ${a.opponents} opponent${a.opponents > 1 ? 's' : ''}`)),
      eqRow('vs random hands', a.eqRandom),
      eqRow(
        'vs estimated ranges',
        a.eqRange,
        el(
          'ul.range-list',
          {},
          a.ranges.map((r) => el('li', {}, el('b', {}, r.name), `: ${r.why}`)),
        ),
      ),
      a.toCall > 0 ? el('div.small.muted', {}, 'The white tick marks the equity you need to call (pot odds).') : null,
      mathBlock(
        `<p>${term('Monte Carlo', 'monte-carlo').outerHTML}: ${num(a.eqRange.n)} random run-outs. Each trial gives your share of the pot (1, 0, or 1/k on a k-way tie).</p>
<p>Standard error: SE = SD / √n ≈ ${pct(a.eqRange.se, 2)}. 95% CI = p̂ ± 1.96·SE = [${pct(a.eqRange.ci[0])}, ${pct(a.eqRange.ci[1])}].</p>
<p>Ranges use Bayesian estimates of each opponent's VPIP/PFR with Beta priors (VPIP ~ Beta(${PRIORS.vpip}), PFR ~ Beta(${PRIORS.pfr})), so a bot seen for only a few hands is assumed to be average.</p>`,
      ),
    ),
  );

  // Pot odds & EV
  if (a.toCall > 0) {
    const evc = a.evCallRange;
    const eq = a.eqRange.equity;
    const implied = impliedOddsNeeded(a.pot, a.toCall, eq);
    hud.append(
      el(
        'section.hud-sec',
        {},
        el('h4', {}, term('Pot odds', 'pot-odds'), ' & ', term('EV', 'ev')),
        el(
          'div.kv',
          {},
          kv('Pot (incl. bets)', num(a.pot)),
          kv('To call', num(a.toCall)),
          kv('Pot odds', `${a.potOdds.ratio.toFixed(2)} : 1`),
          kv('Equity needed', pct(need)),
          kv('EV(call) vs ranges', el(`b.${sign(evc)}`, {}, `${signed(evc, 1)} chips (${signed(evc / bb, 2)} bb)`)),
          kv('EV(call) vs random', `${signed(a.evCallRandom, 1)} chips`),
          kv('EV(fold)', '0 (always)'),
        ),
        el(`div.verdict.${evc > 0 ? 'good' : 'bad'}`, {}, evc > 0 ? `Calling is +EV: ${pct(eq)} equity > ${pct(need)} needed` : `Calling is −EV: ${pct(eq)} equity < ${pct(need)} needed`),
        evc <= 0 && Number.isFinite(implied)
          ? el('div.small', {}, term('Implied odds', 'implied-odds'), `: you'd need to win ≈ ${num(implied)} more chips on later streets when you hit to break even.`)
          : null,
        mathBlock(
          `<p>Required equity = Call / (Pot + Call) = ${num(a.toCall)} / (${num(a.pot)} + ${num(a.toCall)}) = <b>${pct(need, 2)}</b></p>
<p>EV(call) = P(win)·Pot − P(lose)·Call<br>= ${eq.toFixed(3)} × ${num(a.pot)} − ${(1 - eq).toFixed(3)} × ${num(a.toCall)} = <b>${signed(evc, 2)}</b> chips</p>
<p>Chips you already put in are <i>${term('sunk', 'sunk-cost').outerHTML}</i>; EV(fold) = 0 from this point. This is "immediate" EV: it assumes no further betting.</p>`,
        ),
      ),
    );
  } else {
    hud.append(el('section.hud-sec', {}, el('h4', {}, 'No bet to call'), el('p.small', {}, 'Checking is free (EV of checking = your equity × pot if no one bets later). Betting can win the pot right away — see the bet what-if below.')));
  }

  // What-if bet
  hud.append(el('section.hud-sec#whatif'));
  const la = g.legalActions();
  if (la && la.canRaise) renderWhatIf(S.raiseTo ?? la.minRaiseTo);
  else $('#whatif').remove();

  // Outs
  if (a.outs) {
    const o = a.outs;
    const byCat = {};
    for (const x of o.outs) (byCat[x.category] ||= []).push(x.card);
    hud.append(
      el(
        'section.hud-sec',
        {},
        el('h4', {}, term('Outs', 'outs'), ` · ${o.outs.length} of ${o.unseen} unseen cards improve you`),
        o.outs.length
          ? el(
              'div.outs',
              {},
              Object.keys(byCat)
                .sort((x, y) => y - x)
                .map((cat) => el('div.out-row', {}, el('span.out-cat', {}, `${HAND_NAMES[cat]} (${byCat[cat].length})`), cardText(byCat[cat]))),
            )
          : el('p.muted.small', {}, 'No card improves your hand category.'),
        o.outs.length
          ? el(
              'table.mini',
              {},
              el('tr', {}, el('th', {}, ''), el('th', {}, 'Exact'), el('th', {}, term('Rule of 2/4', 'rule-of-2-4'))),
              el('tr', {}, el('td', {}, 'Next card'), el('td', {}, pct(o.exactNext)), el('td', {}, pct(o.ruleNext, 0))),
              o.cardsToCome === 2 ? el('tr', {}, el('td', {}, 'By the river'), el('td', {}, pct(o.exactRiver)), el('td', {}, pct(o.ruleRiver, 0))) : null,
            )
          : null,
        o.outs.length
          ? mathBlock(
              `<p>P(hit on the next card) = outs / unseen = ${o.outs.length} / ${o.unseen} = ${pct(o.exactNext, 2)}</p>` +
                (o.cardsToCome === 2
                  ? `<p>P(hit by river) = 1 − C(${o.unseen - o.outs.length}, 2) / C(${o.unseen}, 2) = ${pct(o.exactRiver, 2)} (${term('complement rule', 'complement-rule').outerHTML})</p>`
                  : '') +
                `<p>Caveat: an "out" improves <i>your</i> hand but might still lose (e.g. your flush card also completes a bigger flush). Equity above already accounts for that.</p>`,
            )
          : null,
      ),
    );
  }

  // Final hand distribution
  const dist = a.distribution;
  const items = HAND_NAMES.map((name, i) => ({ label: name, value: dist.probs[i] }))
    .reverse()
    .filter((x) => x.value > 0.00005 || a.board.length < 3);
  const chartBox = el('div');
  hud.append(el('section.hud-sec', {}, el('h4', {}, 'Your final hand by the river'), el('div.small.muted', {}, `${dist.method} over all remaining boards`), chartBox));
  barChart(chartBox, items, { fmt: (v) => pct(v, v < 0.01 ? 2 : 1), max: 1, labelWidth: 112 });
}

function kv(k, v) {
  return el('div.kv-row', {}, el('span.k', {}, k), el('span.v', {}, v));
}

function renderWhatIf(raiseTo) {
  const box = $('#whatif');
  const a = S.analysis;
  if (!box || !a) return;
  clear(box);
  const r = evRaise(a, raiseTo);
  const bb = a.bigBlind;
  box.append(
    el('h4', {}, `What if you ${a.currentBet === 0 ? 'bet' : 'raise to'} ${num(raiseTo)}?`),
    el(
      'div.kv',
      {},
      kv('Chips you add', num(r.B)),
      kv(el('span', {}, term('Break-even folds', 'fold-equity'), ' (pure bluff)'), pct(r.breakEvenFE)),
      kv(
        'Estimated fold chance',
        el('span', {}, pct(r.foldProb), el('span.muted', {}, ' (all opponents fold)')),
      ),
      kv('Equity when called', pct(r.equityWhenCalled)),
      kv('EV(bet)', el(`b.${sign(r.ev)}`, {}, `${signed(r.ev, 1)} chips (${signed(r.ev / bb, 2)} bb)`)),
    ),
    mathBlock(
      `<p>EV = FE·Pot + (1 − FE)·[eq·(Pot + B + C) − B]</p>
<p>= ${r.foldProb.toFixed(3)} × ${num(r.P)} + ${(1 - r.foldProb).toFixed(3)} × [${r.equityWhenCalled.toFixed(3)} × (${num(r.P)} + ${num(r.B)} + ${num(r.C)}) − ${num(r.B)}]
= <b>${signed(r.ev, 2)}</b></p>
<p>Fold chance per opponent = Bayesian fold-to-bet estimate (Beta(${PRIORS.ftb}) prior):<br>${a.folds
        .map((f) => `${f.name}: (${f.k} + ${PRIORS.ftb[0]}) / (${f.n} + ${PRIORS.ftb[0] + PRIORS.ftb[1]}) = ${pct(f.mean)}`)
        .join('<br>')}<br>P(all fold) = product (assumes independence).</p>
<p>Simplifications: at most one caller, no further betting, equity when called = equity vs estimated ranges (callers are usually stronger, so this is optimistic).</p>`,
    ),
  );
}

function renderHudSessionMini(hud) {
  const w = S.tracker.winrate(0);
  if (!w.hands) return;
  hud.append(
    el(
      'section.hud-sec',
      {},
      el('h4', {}, 'Session so far'),
      el(
        'div.kv',
        {},
        kv('Hands', num(w.hands)),
        kv('Net', el(`b.${sign(w.netBB)}`, {}, `${signed(w.netBB, 1)} bb`)),
        kv(term('Win rate', 'bb100'), `${signed(w.bb100, 1)} bb/100`),
        w.hands > 1 ? kv(term('95% CI', 'ci'), `[${signed(w.ci100[0], 0)}, ${signed(w.ci100[1], 0)}]`) : null,
        kv(term('Luck (actual − EV)', 'all-in-ev'), `${signed(w.luckBB, 1)} bb`),
      ),
    ),
  );
}

// ------------------------------------------------------------------- sub tabs

function setSubtab(k) {
  S.subtab = k;
  renderSubtab();
}

function renderSubtab() {
  document.querySelectorAll('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.sub === S.subtab));
  const box = clear($('#subtab-content'));
  if (S.subtab === 'hand') renderHandPanel(box, S.review || liveReview());
  if (S.subtab === 'session') renderSession(box);
  if (S.subtab === 'opponents') renderOpponents(box);
  if (S.subtab === 'history') renderHistory(box);
}

function liveReview() {
  const g = S.game;
  return {
    live: true,
    number: g.hand.number,
    events: g.hand.events,
    players: g.players.map((p) => ({ id: p.id, name: p.name, hole: p.hole, folded: p.folded, profile: p.profile })),
    decisions: S.decisions,
  };
}

// "You call" vs "Ada calls"
function verb(e, isHero) {
  const base = actionLabel(e).toLowerCase();
  if (isHero) return base;
  return base.replace(/^(fold|check|call|bet|raise)/, (w) => `${w}s`);
}

function eventLine(e, players) {
  const name = (i) => players[i].name;
  const hero = (i) => players[i].id === 0;
  switch (e.type) {
    case 'post':
      return el('div.log-line.muted', {}, `${name(e.player)} post${hero(e.player) ? '' : 's'} the ${e.kind === 'sb' ? 'small' : 'big'} blind (${e.amount})`);
    case 'rebuy':
      return el('div.log-line.muted', {}, `${name(e.player)} rebuy${hero(e.player) ? '' : 's'} for ${e.amount} (auto-rebuy after going broke)`);
    case 'street':
      return el('div.log-street', {}, `${e.street[0].toUpperCase() + e.street.slice(1)}: `, cardText(e.board), el('span.muted', {}, ` · pot ${e.pot}`));
    case 'refund':
      return el('div.log-line.muted', {}, `Uncalled ${e.amount} returned to ${hero(e.player) ? 'you' : name(e.player)}`);
    case 'allin-runout':
      return el('div.log-line', {}, el('b', {}, 'All-in — betting is closed; remaining cards are dealt.'));
    case 'action': {
      const reason = e.reason && S.settings.showReasons ? el('span.reason', {}, ` — ${e.reason}`) : null;
      const pot = e.toCall > 0 ? el('span.muted', {}, ` (faced ${e.toCall} into ${e.potBefore}: needed ${pct(e.toCall / (e.potBefore + e.toCall), 0)})`) : null;
      return el('div.log-line', {}, el('b', {}, name(e.player)), ` ${verb(e, hero(e.player))}`, pot, reason);
    }
    default:
      return null;
  }
}

function renderHandPanel(box, rv) {
  if (!rv) return;
  const g = S.game;
  const bb = g.bb;
  box.append(el('h3', {}, `Hand #${rv.number}${rv.live ? ' (in progress)' : ''}`));
  const cols = el('div.hand-cols');
  const log = el('div.log');
  for (const e of rv.events) {
    const l = eventLine(e, rv.players);
    if (l) log.append(l);
  }
  cols.append(el('div', {}, el('h4', {}, 'Action log'), log));

  if (!rv.live && rv.result) {
    const r = rv.result;
    const res = el('div.results');
    res.append(el('h4', {}, 'Result'));
    r.pots.forEach((p, i) => {
      res.append(
        el(
          'div.pot-line',
          {},
          el('b', {}, `${i === 0 ? 'Main pot' : `Side pot ${i}`} (${num(p.amount)})`),
          ` → ${p.winners.map((w) => rv.players[w].name).join(' & ')}`,
          p.bestScore !== undefined ? el('span.muted', {}, ` with ${describeScore(p.bestScore)}`) : el('span.muted', {}, ' (everyone else folded)'),
          p.allInEquity ? el('div.small.muted', {}, `All-in equity in this pot: ${p.eligible.map((id, k) => `${rv.players[id].name} ${pct(p.allInEquity[k])}`).join(', ')}`) : null,
        ),
      );
    });
    if (r.showdown) {
      res.append(
        el(
          'div.showdown',
          {},
          rv.players
            .filter((p) => !p.folded && p.inHand)
            .map((p) => el('div', {}, el('b', {}, p.name), ': ', cardText(p.hole), el('span.muted', {}, ` ${describeScore(r.scores[p.id])}`))),
        ),
      );
    }
    const net = r.net[0];
    const evn = r.evNet[0];
    res.append(
      el(
        'div.kv',
        {},
        kv('Your result', el(`b.${sign(net)}`, {}, `${signed(net, 0)} chips (${signed(net / bb, 1)} bb)`)),
        rv.allIn ? kv(term('All-in EV result', 'all-in-ev'), el(`b.${sign(evn)}`, {}, `${signed(evn, 1)} chips`)) : null,
        rv.allIn ? kv('Luck this hand', `${signed(net - evn, 1)} chips`) : null,
      ),
    );
    cols.append(res);
  }
  box.append(cols);
  log.scrollTop = log.scrollHeight;

  // Decision review
  const ds = rv.decisions || [];
  if (ds.length) {
    box.append(el('h4', {}, rv.live ? 'Your decisions so far' : 'Decision review'));
    const tbl = el(
      'table.review',
      {},
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ['Street', 'Board', 'Pot / to call', 'Needed', 'Your equity (est.)', 'Equity vs actual cards', 'Action', 'EV(call)', 'Verdict'].map((h) => el('th', {}, h)),
        ),
      ),
    );
    const tb = el('tbody');
    for (const d of ds) {
      const a = d.analysis;
      tb.append(
        el(
          'tr',
          {},
          el('td', {}, a.street),
          el('td', {}, a.board.length ? cardText(a.board) : '—'),
          el('td', {}, `${num(a.pot)} / ${num(a.toCall)}`),
          el('td', {}, a.toCall > 0 ? pct(a.potOdds.requiredEquity, 0) : '—'),
          el('td', {}, `${pct(a.eqRange.equity, 0)} `, el('span.muted', {}, `(random ${pct(a.eqRandom.equity, 0)})`)),
          el('td', {}, d.hindsight ? el('span', { title: `${d.hindsight.method}, ${num(d.hindsight.trials)} boards` }, pct(d.hindsight.equity, 0)) : el('span.muted', {}, 'after hand')),
          el('td', {}, d.action.type === 'raise' ? `${a.currentBet ? 'raise to' : 'bet'} ${num(d.action.amount)}` : d.action.type),
          el('td', {}, a.toCall > 0 ? el(`span.${sign(a.evCallRange)}`, {}, `${signed(a.evCallRange / bb, 2)} bb`) : '—'),
          el('td', {}, d.verdict ? el(`span.badge.${d.verdict.tone}`, { title: d.verdict.detail }, d.verdict.verdict) : '—'),
        ),
      );
      if (d.verdict && d.verdict.detail) tb.append(el('tr.detail', {}, el('td', { colspan: 9 }, d.verdict.detail)));
    }
    tbl.append(tb);
    box.append(el('div.table-scroll', {}, tbl));
    if (!rv.live) {
      box.append(
        el(
          'p.small.muted',
          {},
          '"Your equity (est.)" is what you could know at the time (vs Bayesian range estimates). "Equity vs actual cards" uses the opponents’ real hole cards — the gap between them is information you didn’t have. Judge decisions by the first column, not by the result: a +EV call that loses is still a good call.',
        ),
      );
    }
  } else if (!rv.live) {
    box.append(el('p.muted', {}, 'You made no decisions this hand (everyone folded to you or the hand ended before your turn).'));
  }
}

function renderSession(box) {
  const tr = S.tracker;
  const g = S.game;
  const i = S.statsPlayer;
  const w = tr.winrate(i);
  const playerSel = el(
    'select',
    { onchange: (e) => ((S.statsPlayer = +e.target.value), renderSubtab()) },
    g.players.map((p) => el('option', { value: p.id, selected: p.id === i }, p.isHuman ? 'You' : `${p.name}${S.settings.showStyles ? ` (${BOT_PROFILES[p.profile].short})` : ''}`)),
  );
  box.append(el('div.row', {}, el('h3', {}, 'Session statistics'), el('label.inline', {}, 'Player: ', playerSel)));
  if (w.hands < 2) {
    box.append(el('p.muted', {}, 'Play a few hands (or use Fast-forward in Table settings) to see statistics.'));
    return;
  }
  const z = w.se100 > 0 ? w.bb100 / w.se100 : 0;
  const pWinner = normalCdf(z);
  box.append(
    el(
      'div.tiles',
      {},
      statTile('Hands', num(w.hands)),
      statTile('Net result', el(`span.${sign(w.netBB)}`, {}, `${signed(w.netBB, 1)} bb`), `${signed(w.netBB * g.bb, 0)} chips`),
      statTile(term('Win rate', 'bb100'), `${signed(w.bb100, 1)}`, `bb/100 · 95% CI [${signed(w.ci100[0], 0)}, ${signed(w.ci100[1], 0)}]`),
      statTile(term('Std deviation', 'variance'), num(w.sd100, 0), `bb/100 (${num(w.sdPerHand, 1)} bb per hand)`),
      statTile(term('All-in EV win rate', 'all-in-ev'), `${signed(w.evBb100, 1)}`, `bb/100 · luck ${signed(w.luckBB, 1)} bb`),
      statTile(term('Hands for significance', 'ci'), Number.isFinite(w.handsForSignificance) ? num(w.handsForSignificance) : '∞', 'for the 95% CI to exclude 0 at this rate'),
    ),
  );
  box.append(
    mathBlock(
      `<p>Per hand: mean x̄ = ${w.bbPerHand.toFixed(3)} bb, SD s = ${w.sdPerHand.toFixed(2)} bb, n = ${w.hands}.</p>
<p>Win rate = x̄ × 100 = <b>${w.bb100.toFixed(2)} bb/100</b>. SD per 100 hands = s × √100 = ${w.sd100.toFixed(1)}.</p>
<p>${term('Standard error', 'standard-error').outerHTML} = s / √n × 100 = ${w.sdPerHand.toFixed(2)} / √${w.hands} × 100 = ${w.se100.toFixed(2)} bb/100.</p>
<p>95% CI = ${w.bb100.toFixed(2)} ± 1.96 × ${w.se100.toFixed(2)} = [${w.ci100[0].toFixed(1)}, ${w.ci100[1].toFixed(1)}].</p>
<p>${term('Hypothesis test', 'hypothesis-test').outerHTML}: H₀ "true win rate = 0". z = ${w.bb100.toFixed(2)} / ${w.se100.toFixed(2)} = ${z.toFixed(2)};
one-sided p-value = 1 − Φ(z) = ${(1 - pWinner).toFixed(3)}. ${1 - pWinner < 0.05 ? 'Significant at 5%: strong evidence of a real edge.' : 'Not significant: the result is consistent with pure luck.'}</p>
<p>Hands needed for significance n* = (1.96 · s / x̄)² = (1.96 × ${w.sdPerHand.toFixed(2)} / ${w.bbPerHand.toFixed(3)})² ≈ ${Number.isFinite(w.handsForSignificance) ? num(w.handsForSignificance) : '∞'}.</p>`,
      'Show the math (CI, hypothesis test)',
    ),
  );
  const ser = tr.series(i);
  const sdHand = w.sdPerHand;
  const band = { lo: ser.net.map((_, k) => -1.96 * sdHand * Math.sqrt(k)), hi: ser.net.map((_, k) => 1.96 * sdHand * Math.sqrt(k)), name: '95% range if true win rate = 0', color: 'var(--band)' };
  const c1 = el('div');
  box.append(el('h4', {}, 'Cumulative result vs all-in EV'), el('p.small.muted', {}, 'The EV line removes the luck of all-in run-outs. The shaded cone is where a break-even player lands 95% of the time — it widens like √n.'), c1);
  lineChart(c1, {
    series: [
      { name: 'Actual (bb)', values: ser.net, color: SERIES(0) },
      { name: 'All-in EV (bb)', values: ser.ev, color: SERIES(1), dash: true },
    ],
    band,
    xName: 'hand',
    xLabel: 'hands played',
    yLabel: 'big blinds',
    yFmt: (v) => num(v, Math.abs(v) < 10 ? 1 : 0),
  });
  const res = tr.players[i].results.map((x) => x / g.bb);
  const sorted = [...res].sort((a, b) => a - b);
  const lo = percentileSorted(sorted, 0.005);
  const hi = percentileSorted(sorted, 0.995);
  const hgram = histogram(res.filter((x) => x >= lo && x <= hi), 40, [lo, hi]);
  const c2 = el('div');
  box.append(
    el('h4', {}, 'Distribution of single-hand results'),
    el(
      'p.small.muted',
      {},
      `Mean ${signed(mean(res), 2)} bb, median ${signed(percentileSorted(sorted, 0.5), 2)} bb, skewness ${num(skewness(res), 2)}. Most hands are small losses (blinds, folds); a few big pots decide everything — a heavy-tailed, skewed distribution. The `,
      term('CLT', 'clt'),
      ' is why sums of many such hands still become bell-shaped.',
    ),
    c2,
  );
  histogramChart(c2, { ...hgram, xLabel: 'bb won in a hand (middle 99%)', unit: 'hands', markers: [{ x: mean(res), label: 'mean' }] });
}

function renderOpponents(box) {
  const tr = S.tracker;
  const g = S.game;
  box.append(el('h3', {}, 'Player statistics with 95% confidence intervals'));
  box.append(
    el(
      'p.small.muted',
      {},
      'Each percentage is a proportion estimated from a small sample, shown with its ',
      term('Wilson 95% interval', 'wilson'),
      '. Early on the intervals overlap and you cannot tell styles apart; after a few hundred hands they separate. Bot style targets: ',
      PROFILE_KEYS.map((k) => `${BOT_PROFILES[k].short} ≈ ${Math.round(BOT_PROFILES[k].play * 100)}/${Math.round(BOT_PROFILES[k].raise * 100)}`).join(', '),
      ' (VPIP/PFR when unraised).',
    ),
  );
  const ciCell = (s) =>
    el(
      'td',
      {},
      el('div.ci-cell', {}, el('b', {}, Number.isNaN(s.p) ? '—' : pct(s.p, 0)), el('span.muted', {}, ` ${s.k}/${s.n}`)),
      s.n ? el('div.ci-bar', {}, el('div.ci-range', { style: { left: `${s.ci[0] * 100}%`, width: `${(s.ci[1] - s.ci[0]) * 100}%` } }), el('div.ci-point', { style: { left: `${s.p * 100}%` } })) : null,
    );
  const tbl = el(
    'table.hud-table',
    {},
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', {}, 'Player'),
        el('th', {}, 'Hands'),
        el('th', {}, term('VPIP', 'vpip')),
        el('th', {}, term('PFR', 'pfr')),
        el('th', {}, term('AF', 'af')),
        el('th', {}, term('WTSD', 'wtsd')),
        el('th', {}, 'W$SD'),
        el('th', {}, term('Fold to bet', 'ftb')),
        el('th', {}, 'bb/100'),
      ),
    ),
  );
  const tb = el('tbody');
  g.players.forEach((p, i) => {
    const t = tr.tendencies(i);
    const w = tr.winrate(i);
    tb.append(
      el(
        'tr',
        {},
        el('td', {}, el('b', {}, p.name), p.profile && S.settings.showStyles ? el('div.small.muted', {}, BOT_PROFILES[p.profile].label) : null),
        el('td', {}, num(t.hands)),
        ciCell(t.vpip),
        ciCell(t.pfr),
        el('td', {}, Number.isFinite(t.af) ? t.af.toFixed(2) : t.af === Infinity ? '∞' : '—'),
        ciCell(t.wtsd),
        ciCell(t.wsd),
        ciCell(t.ftb),
        el('td', {}, w.hands ? el(`span.${sign(w.bb100)}`, {}, signed(w.bb100, 1)) : '—', w.hands > 1 ? el('div.small.muted', {}, `± ${num(1.96 * w.se100, 0)}`) : null),
      ),
    );
  });
  tbl.append(tb);
  box.append(el('div.table-scroll', {}, tbl));
  box.append(
    el(
      'p.small',
      {},
      'Rule of thumb: a proportion’s 95% interval is about ±1/√n wide. After 25 hands that’s ±20 points; after 400 hands ±5 points. That’s why real players need large samples before trusting HUD numbers.',
    ),
  );
}

function renderHistory(box) {
  box.append(el('h3', {}, 'Hand history'), el('p.small.muted', {}, 'Latest first. Click a hand you played yourself to reopen its decision review.'));
  if (!S.history.length) {
    box.append(el('p.muted', {}, 'No hands yet.'));
    return;
  }
  const bb = S.game.bb;
  const tbl = el('table.history', {}, el('thead', {}, el('tr', {}, ['#', 'Your cards', 'Board', 'Showdown', 'Result', 'All-in EV'].map((h) => el('th', {}, h)))));
  const tb = el('tbody');
  for (const h of S.history.slice(0, 100)) {
    tb.append(
      el(
        `tr${h.review ? '.clickable' : ''}`,
        {
          onclick: h.review
            ? () => {
                S.review = h.review;
                setSubtab('hand');
              }
            : null,
        },
        el('td', {}, h.number),
        el('td', {}, cardText(h.hole)),
        el('td', {}, h.board.length ? cardText(h.board) : '—'),
        el('td', {}, h.showdown ? 'yes' : ''),
        el('td', {}, el(`span.${sign(h.net)}`, {}, `${signed(h.net / bb, 1)} bb`)),
        el('td', {}, h.ev !== h.net ? `${signed(h.ev / bb, 1)} bb` : ''),
      ),
    );
  }
  tbl.append(tb);
  box.append(el('div.table-scroll', {}, tbl));
}

export function debugState() {
  return S;
}

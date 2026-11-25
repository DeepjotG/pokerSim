// Small DOM + formatting helpers shared by every tab.

import { RANKS, SUIT_SYMBOLS, rankOf, suitOf, parseCards } from '../core/cards.js';
import { GLOSSARY } from './glossary.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div.card.red', { title: 'x', onclick }, child1, 'text', ...) */
export function el(spec, attrs = {}, ...children) {
  const tag = spec.match(/^[a-z0-9]*/i)[0] || 'div';
  const node = document.createElement(tag);
  const classes = [];
  for (const [, kind, name] of spec.slice(tag.length).matchAll(/([#.])([\w-]+)/g)) {
    if (kind === '#') node.id = name;
    else classes.push(name);
  }
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ------------------------------------------------------------------ formatting

export function pct(x, d = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(d)}%`;
}

export function num(x, d = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function signed(x, d = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const s = num(Math.abs(x), d);
  return x > 0.00001 ? `+${s}` : x < -0.00001 ? `−${s}` : s;
}

export const sign = (x) => (x > 0.00001 ? 'pos' : x < -0.00001 ? 'neg' : 'zero');

// ------------------------------------------------------------------ cards

export function cardEl(c, { small = false, hidden = false } = {}) {
  if (hidden || c === null || c === undefined) return el(`span.card.back${small ? '.small' : ''}`, { 'aria-label': 'hidden card' });
  const s = suitOf(c);
  return el(
    `span.card.suit-${'cdhs'[s]}${small ? '.small' : ''}`,
    { 'aria-label': `${RANKS[rankOf(c)]} of ${['clubs', 'diamonds', 'hearts', 'spades'][s]}` },
    el('span.rank', {}, RANKS[rankOf(c)] === 'T' ? '10' : RANKS[rankOf(c)]),
    el('span.suit', {}, SUIT_SYMBOLS[s]),
  );
}

export function cardsEl(cards, opts) {
  return el('span.cards', {}, cards.map((c) => cardEl(c, opts)));
}

/** Inline text version, e.g. "A♥ K♠", with colored suits. */
export function cardText(cards) {
  return el(
    'span.cardtext',
    {},
    cards.map((c) => el(`span.ct.suit-${'cdhs'[suitOf(c)]}`, {}, (RANKS[rankOf(c)] === 'T' ? '10' : RANKS[rankOf(c)]) + SUIT_SYMBOLS[suitOf(c)])),
  );
}

// ------------------------------------------------------------------ teaching widgets

/** A glossary term with hover definition; click jumps to the Learn tab. */
export function term(label, key) {
  const g = GLOSSARY[key];
  return el('span.term', { 'data-term': key, tabindex: 0, title: g ? g.short : '' }, label);
}

/** Collapsible "Show the math" block. `body` is trusted HTML written by us. */
export function mathBlock(body, summary = 'Show the math', open = false) {
  return el('details.math', { open }, el('summary', {}, summary), el('div.math-body', { html: body }));
}

export function statTile(label, value, sub = '', cls = '') {
  return el(`div.tile${cls ? '.' + cls : ''}`, {}, el('div.tile-label', {}, label), el('div.tile-value', {}, value), sub ? el('div.tile-sub', {}, sub) : null);
}

export function section(title, ...children) {
  return el('section.panel', {}, title ? el('h3', {}, title) : null, ...children);
}

/** A horizontal gauge: filled to `value` (0..1) with an optional marker line. */
export function gauge(value, { marker = null, markerLabel = '', cls = '' } = {}) {
  const g = el(`div.gauge${cls ? '.' + cls : ''}`, {}, el('div.gauge-fill', { style: { width: `${Math.max(0, Math.min(1, value)) * 100}%` } }));
  if (marker !== null) {
    g.append(el('div.gauge-marker', { style: { left: `${Math.max(0, Math.min(1, marker)) * 100}%` }, title: markerLabel }));
  }
  return g;
}

/** Card text input with live preview + validation. */
export function cardInput({ placeholder = 'e.g. AhKd', value = '', max = 2, onchange } = {}) {
  const input = el('input.card-input', { type: 'text', placeholder, value, spellcheck: 'false', autocomplete: 'off' });
  const preview = el('span.card-preview');
  const err = el('span.input-error');
  const wrap = el('div.card-input-wrap', {}, input, preview, err);
  const update = () => {
    preview.innerHTML = '';
    err.textContent = '';
    try {
      const cards = parseCards(input.value);
      if (cards.length > max) throw new Error(`At most ${max} cards`);
      preview.append(cardsEl(cards, { small: true }));
      wrap.dataset.valid = '1';
    } catch (e) {
      err.textContent = e.message;
      wrap.dataset.valid = '0';
    }
    onchange && onchange();
  };
  input.addEventListener('input', update);
  wrap.getCards = () => {
    try {
      const c = parseCards(input.value);
      return c.length <= max ? c : null;
    } catch {
      return null;
    }
  };
  wrap.setValue = (v) => {
    input.value = v;
    update();
  };
  wrap.input = input;
  queueMicrotask(update);
  return wrap;
}

/** Run a generator in animation-frame-sized slices so the page stays responsive. */
export function runChunked(gen, onSnapshot, { budgetMs = 30 } = {}) {
  let cancelled = false;
  return {
    promise: new Promise((resolve) => {
      const step = () => {
        if (cancelled) return resolve(null);
        const t0 = performance.now();
        let r;
        do {
          r = gen.next();
          if (!r.done) onSnapshot(r.value, false);
        } while (!r.done && performance.now() - t0 < budgetMs);
        if (r.done) {
          onSnapshot(r.value, true);
          resolve(r.value);
        } else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }),
    cancel: () => (cancelled = true),
  };
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

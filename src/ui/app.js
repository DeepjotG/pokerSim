// App shell: tab routing (with lazy initialisation), theme, glossary links.

import { initPlay } from './play.js';
import { initEquityLab } from './lab-equity.js';
import { initOddsLab } from './lab-odds.js';
import { initProbabilityLab } from './lab-probability.js';
import { initRangesLab } from './lab-ranges.js';
import { initVarianceLab } from './lab-variance.js';
import { initLearn } from './learn.js';
import { GLOSSARY } from './glossary.js';
import { $, $$ } from './dom.js';

const TABS = {
  play: initPlay,
  equity: initEquityLab,
  odds: initOddsLab,
  probability: initProbabilityLab,
  ranges: initRangesLab,
  variance: initVarianceLab,
  learn: (c) => initLearn(c, goTab),
};
const started = new Set();

export function goTab(name, anchor) {
  if (!TABS[name]) name = 'play';
  for (const b of $$('.tab')) b.classList.toggle('active', b.dataset.tab === name);
  for (const s of $$('.tab-panel')) s.hidden = s.id !== `tab-${name}`;
  const panel = $(`#tab-${name}`);
  if (!started.has(name)) {
    started.add(name);
    try {
      TABS[name](panel);
    } catch (e) {
      console.error(e);
      panel.append(Object.assign(document.createElement('pre'), { className: 'input-error', textContent: e.stack }));
    }
  }
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  if (anchor) {
    const t = document.getElementById(anchor);
    if (t) {
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      t.classList.add('flash');
      setTimeout(() => t.classList.remove('flash'), 1600);
    }
  } else window.scrollTo({ top: 0 });
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem('pokersim-theme', t);
  } catch {
    /* storage unavailable */
  }
}

function init() {
  for (const b of $$('.tab')) b.addEventListener('click', () => goTab(b.dataset.tab));
  // glossary terms: click → Learn tab entry
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-term]');
    if (!t || !GLOSSARY[t.dataset.term]) return;
    e.preventDefault();
    goTab('learn', `concept-${t.dataset.term}`);
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('[data-term]');
    if (t && e.key === 'Enter') goTab('learn', `concept-${t.dataset.term}`);
  });
  let theme = 'dark';
  try {
    theme = localStorage.getItem('pokersim-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  } catch {
    /* ignore */
  }
  setTheme(theme);
  $('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#four-color').addEventListener('change', (e) => document.body.classList.toggle('four-color', e.target.checked));
  goTab(location.hash.slice(1) || 'play');
  window.addEventListener('hashchange', () => goTab(location.hash.slice(1)));
}

init();

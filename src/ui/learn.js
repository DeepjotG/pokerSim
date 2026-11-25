// Learn tab: a guided path plus the full concept library.

import { GLOSSARY, GROUPS } from './glossary.js';
import { el } from './dom.js';

const PATH = [
  ['probability', 'Counting & probability', 'How many starting hands are there? How often do you flop a set? Check every formula against simulation.', 'Probability'],
  ['equity', 'Equity: exact vs Monte Carlo', 'Compute who is ahead and by how much; watch a simulation converge inside its confidence interval.', 'Equity Lab'],
  ['odds', 'Pot odds & expected value', 'Turn equity into decisions. Practise call/fold with the quiz and count outs.', 'Odds & EV'],
  ['play', 'Play with the HUD on', 'Every decision shows equity, pot odds, EV, outs and a post-hand review against the actual cards.', 'Play'],
  ['ranges', 'Ranges & Bayes', 'Think in ranges; update them with Bayes’ theorem when an opponent acts.', 'Ranges & Bayes'],
  ['variance', 'Variance & confidence', 'Why winners lose for months, how many hands prove skill, and how big a bankroll you need.', 'Variance'],
];

export function initLearn(container, goTab) {
  container.append(
    el('div.lab-intro', {}, el('h2', {}, 'Learn statistics with poker'), el('p', {}, 'Follow the path in order, or jump to any concept. Underlined terms anywhere in the app link here.')),
    el(
      'ol.path',
      {},
      PATH.map(([tab, title, desc, btn], i) =>
        el('li.path-step', {}, el('div.path-num', {}, i + 1), el('div', {}, el('h3', {}, title), el('p', {}, desc), el('button.btn.small', { onclick: () => goTab(tab) }, `Open ${btn} →`))),
      ),
    ),
  );
  for (const g of GROUPS) {
    const entries = Object.entries(GLOSSARY).filter(([, v]) => v.group === g);
    container.append(
      el(
        'section.panel.learn-group',
        {},
        el('h3', {}, g),
        entries.map(([key, v]) =>
          el(
            'article.concept',
            { id: `concept-${key}` },
            el('h4', {}, v.title),
            el('p.concept-short', {}, v.short),
            el('div.concept-body', { html: v.body }),
            v.tab ? el('button.btn.small.ghost', { onclick: () => goTab(v.tab) }, 'Try it →') : null,
          ),
        ),
      ),
    );
  }
}

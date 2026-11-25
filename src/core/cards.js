// Card representation.
//
// A card is an integer 0..51:  card = rank * 4 + suit
//   rank: 0 = deuce ... 8 = ten, 9 = jack, 10 = queen, 11 = king, 12 = ace
//   suit: 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
// Integers make the hand evaluator and simulations fast.

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANK_NAMES = [
  'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Jack', 'Queen', 'King', 'Ace',
];
export const RANK_PLURALS = [
  'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens',
  'Jacks', 'Queens', 'Kings', 'Aces',
];

export const makeCard = (rank, suit) => rank * 4 + suit;
export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;

export function cardToString(c) {
  return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

export function cardsToString(cards) {
  return cards.map(cardToString).join(' ');
}

/** Parse "Ah", "td", "10s" (case-insensitive rank, suit letters c/d/h/s or symbols). */
export function parseCard(str) {
  let s = String(str).trim();
  if (s.startsWith('10')) s = 'T' + s.slice(2);
  if (s.length !== 2) throw new Error(`Invalid card "${str}"`);
  const r = RANKS.indexOf(s[0].toUpperCase());
  let su = SUITS.indexOf(s[1].toLowerCase());
  if (su < 0) su = SUIT_SYMBOLS.indexOf(s[1]);
  if (r < 0 || su < 0) throw new Error(`Invalid card "${str}"`);
  return makeCard(r, su);
}

/** Parse "AhKd", "Ah Kd", "Ah,Kd" into an array of card ints. Throws on duplicates. */
export function parseCards(str) {
  const s = String(str || '').replace(/[\s,]+/g, '').replace(/10/g, 'T');
  if (s.length % 2 !== 0) throw new Error(`Could not parse cards "${str}"`);
  const out = [];
  for (let i = 0; i < s.length; i += 2) {
    const c = parseCard(s.slice(i, i + 2));
    if (out.includes(c)) throw new Error(`Duplicate card ${cardToString(c)}`);
    out.push(c);
  }
  return out;
}

export function fullDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** Cards not in `used`. */
export function remainingDeck(used) {
  const mask = new Uint8Array(52);
  for (const c of used) mask[c] = 1;
  const out = [];
  for (let c = 0; c < 52; c++) if (!mask[c]) out.push(c);
  return out;
}

export class Deck {
  constructor(rng) {
    this.rng = rng;
    this.cards = fullDeck();
    this.pos = 0;
  }

  shuffle() {
    this.cards = fullDeck();
    this.rng.shuffle(this.cards);
    this.pos = 0;
    return this;
  }

  deal(n = 1) {
    if (this.pos + n > this.cards.length) throw new Error('Deck exhausted');
    const out = this.cards.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  get remaining() {
    return this.cards.length - this.pos;
  }
}

/** Starting-hand class label like "AKs", "T9o", "77" for two hole cards. */
export function handClass(c1, c2) {
  let r1 = rankOf(c1);
  let r2 = rankOf(c2);
  if (r1 < r2) [r1, r2] = [r2, r1];
  if (r1 === r2) return RANKS[r1] + RANKS[r2];
  return RANKS[r1] + RANKS[r2] + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

// Concept library: powers the hover definitions (term()) and the Learn tab.
// Each entry: title, group, short (one line), body (HTML), and optional `tab` to try it.

export const GROUPS = [
  'Probability basics',
  'Expected value & decisions',
  'Variance & inference',
  'Ranges & Bayes',
  'Player statistics',
];

export const GLOSSARY = {
  probability: {
    group: 'Probability basics',
    title: 'Probability',
    short: 'Favourable outcomes ÷ all equally-likely outcomes.',
    body: `<p>When every outcome is equally likely, <b>P(event) = favourable outcomes ÷ total outcomes</b>.</p>
<p>Example: P(being dealt a pocket pair). There are C(52,2) = 1,326 starting hands, and 13 ranks × C(4,2) = 6 ways = 78 pairs.
So P = 78 / 1,326 = <b>5.88%</b>, about once every 17 hands.</p>
<p>Probabilities can also be written as <b>odds</b>: 5.88% = 1,248 : 78 ≈ <b>16 : 1 against</b>.</p>`,
    tab: 'probability',
  },
  combinatorics: {
    group: 'Probability basics',
    title: 'Combinations — C(n, k)',
    short: 'Number of ways to choose k items from n, ignoring order: n! / (k!(n−k)!).',
    body: `<p><b>C(n, k) = n! / (k! · (n − k)!)</b> counts unordered selections. It is the engine of all poker probability.</p>
<ul><li>Starting hands: C(52,2) = 1,326</li><li>Flops: C(50,3) = 19,600 (given your two cards)</li>
<li>5-card hands: C(52,5) = 2,598,960</li><li>7-card hands: C(52,7) = 133,784,560</li></ul>
<p>Example: combos of AK = 4 aces × 4 kings = 16 (4 suited + 12 offsuit). Combos of AA = C(4,2) = 6.</p>`,
    tab: 'probability',
  },
  'complement-rule': {
    group: 'Probability basics',
    title: 'Complement rule',
    short: 'P(at least one) = 1 − P(none).',
    body: `<p>"At least one" questions are easiest via the complement: <b>P(A) = 1 − P(not A)</b>.</p>
<p>Example: you have a flush draw on the flop (9 outs, 47 unseen cards, 2 to come).
P(miss both) = C(38,2) / C(47,2) = 703 / 1,081 = 65.0%, so P(hit) = <b>35.0%</b>.</p>`,
    tab: 'odds',
  },
  'gamblers-fallacy': {
    group: 'Probability basics',
    title: "Gambler's fallacy & independence",
    short: 'Past shuffles do not change the next one: each deal is independent.',
    body: `<p>Each hand is dealt from a freshly shuffled deck, so hands are <b>independent</b>: losing five flips in a row does not make
you "due" to win. The probability of AA is 0.45% every single hand.</p>
<p>What <i>does</i> change probabilities is <b>card removal within a hand</b> — once you see the flop, those cards cannot appear again.</p>`,
    tab: 'probability',
  },
  'pseudo-random': {
    group: 'Probability basics',
    title: 'Pseudo-random numbers & seeds',
    short: 'A deterministic algorithm that produces random-looking numbers; same seed ⇒ same sequence.',
    body: `<p>Computers generate "random" numbers with algorithms (here: <code>mulberry32</code>). Given the same <b>seed</b>, they produce the same
sequence, so experiments are <b>reproducible</b>. Set a seed in the Play settings to replay identical cards against different strategies.</p>
<p>Shuffling uses <b>Fisher–Yates</b>, which makes all 52! ≈ 8×10⁶⁷ deck orders equally likely.</p>`,
    tab: 'probability',
  },
  'chi-square': {
    group: 'Variance & inference',
    title: 'Chi-square goodness-of-fit test',
    short: 'Tests whether observed counts are consistent with expected probabilities.',
    body: `<p><b>χ² = Σ (observed − expected)² / expected</b>. Under the null hypothesis (the deck is fair), χ² follows a chi-square
distribution with (categories − 1) degrees of freedom.</p>
<p>The <b>p-value</b> is the probability of a χ² at least this large if the deck really is fair. A small p (say &lt; 0.05) is evidence
the dealing is biased. With a fair deck you should still see p &lt; 0.05 about 5% of the time — that's what 5% means!</p>`,
    tab: 'probability',
  },
  equity: {
    group: 'Expected value & decisions',
    title: 'Equity',
    short: 'Your share of the pot if all cards were dealt out with no more betting: P(win) + P(tie)/players tied.',
    body: `<p><b>Equity = P(win) + Σ P(k-way tie) / k.</b> It is the fraction of the pot you would win on average if the hand were run out many times.</p>
<p>Example: A♠A♥ vs K♠K♥ preflop wins 82.36%, ties 0.54% → equity = 82.36 + 0.54/2 = <b>82.6%</b> (computed exactly over all 1,712,304 boards).</p>
<p>Equity always depends on an <b>assumption about the opponent's cards</b> — a specific hand, a range, or a random hand.</p>`,
    tab: 'equity',
  },
  'monte-carlo': {
    group: 'Variance & inference',
    title: 'Monte Carlo simulation',
    short: 'Estimate a probability by simulating random trials and averaging.',
    body: `<p>When exact counting is too expensive, deal random boards N times and count how often you win. The estimate p̂ has
<b>standard error SE = √(p̂(1 − p̂) / N)</b>.</p>
<p>Key fact: precision grows with <b>√N</b>. 10,000 trials give SE ≈ 0.5%; to halve it you need 4× the trials (40,000).</p>
<p>Watch the estimate converge in the Equity Lab — the shaded band is the 95% confidence interval.</p>`,
    tab: 'equity',
  },
  'exact-enumeration': {
    group: 'Probability basics',
    title: 'Exact enumeration',
    short: 'Visit every possible outcome: zero sampling error, but cost grows combinatorially.',
    body: `<p>On the flop, heads-up with known hands, only C(45,2) = 990 turn+river combinations remain — the simulator checks all of them, so the
answer has <b>no sampling error</b>. Preflop there are 1,712,304 boards — still feasible. Against a random hand preflop it's
1,712,304 × 1,225 ≈ 2 billion: that's when Monte Carlo wins.</p>`,
    tab: 'equity',
  },
  ev: {
    group: 'Expected value & decisions',
    title: 'Expected value (EV)',
    short: 'Probability-weighted average outcome: Σ P(outcome) × value(outcome).',
    body: `<p><b>EV = Σ pᵢ · xᵢ</b>. It is the long-run average result per decision. Good poker = choosing the action with the highest EV.</p>
<p>Calling a bet: <b>EV(call) = P(win) · Pot − P(lose) · Call</b>, where Pot includes the opponent's bet.</p>
<p>Example: pot is 100 after villain bets, you must call 50, and your equity is 40%.
EV = 0.40 × 100 − 0.60 × 50 = 40 − 30 = <b>+20 chips</b>. Folding is EV 0, so calling is better.</p>
<p>Note: this "immediate EV" ignores future betting (implied odds, getting bluffed off).</p>`,
    tab: 'odds',
  },
  'pot-odds': {
    group: 'Expected value & decisions',
    title: 'Pot odds & required equity',
    short: 'Required equity to call = Call ÷ (Pot + Call).',
    body: `<p>Setting EV(call) = 0 and solving gives the break-even equity:
<b>required equity = Call / (Pot + Call)</b>, where Pot already includes the bet you face.</p>
<p>Example: villain bets 50 into 100. Pot = 150, call = 50 → you need 50 / 200 = <b>25%</b>. As odds: 150 : 50 = 3 : 1.</p>
<p>If your equity exceeds the requirement, calling is +EV (ignoring future streets).</p>`,
    tab: 'odds',
  },
  'implied-odds': {
    group: 'Expected value & decisions',
    title: 'Implied odds',
    short: 'Extra chips you expect to win on later streets when you hit.',
    body: `<p>Drawing hands often lack the direct pot odds but can win more later. The extra amount X needed to break even satisfies
<b>eq · (Pot + X) − (1 − eq) · Call = 0 → X = Call/eq − Call − Pot</b>.</p>
<p>Example: 20% equity, call 50 into 100. X = 250 − 50 − 100 = <b>100 more chips</b> must be won on average when you hit.</p>`,
    tab: 'odds',
  },
  'fold-equity': {
    group: 'Expected value & decisions',
    title: 'Fold equity',
    short: 'Value gained when a bet makes the opponent fold.',
    body: `<p>A bet can win two ways: the opponent folds, or you win at showdown.
<b>EV(bet) = FE · Pot + (1 − FE) · [eq · (Pot + Bet) − (1 − eq) · Bet]</b>.</p>
<p>A pure bluff (eq = 0) breaks even when <b>FE = Bet / (Pot + Bet)</b>. Betting 50 into 100 needs folds 33% of the time; a pot-sized bet needs 50%.</p>`,
    tab: 'odds',
  },
  outs: {
    group: 'Expected value & decisions',
    title: 'Outs',
    short: 'Unseen cards that improve your hand (ideally to the best hand).',
    body: `<p>An open-ended straight draw has 8 outs, a flush draw 9, both together 15 (don't double count the overlap).</p>
<p>Exact chance to hit with k cards to come: <b>1 − C(unseen − outs, k) / C(unseen, k)</b>.</p>`,
    tab: 'odds',
  },
  'rule-of-2-4': {
    group: 'Expected value & decisions',
    title: 'Rule of 2 and 4',
    short: 'Mental shortcut: outs × 4 ≈ % to hit by the river from the flop; outs × 2 for one card.',
    body: `<p>Each unseen card is ~1/46 ≈ 2.2% of the deck, so with one card to come P ≈ outs × 2%. With two cards it's roughly double,
<b>outs × 4%</b>. It overestimates for many outs: 15 outs → rule says 60%, exact is 54.1%.</p>
<p>Only use "×4" if you will see both cards (e.g. you are all-in). Otherwise you usually face another bet on the turn.</p>`,
    tab: 'odds',
  },
  'sunk-cost': {
    group: 'Expected value & decisions',
    title: 'Sunk cost',
    short: 'Chips already in the pot are not yours anymore; only future EV matters.',
    body: `<p>"I've put so much in, I have to call" is the <b>sunk-cost fallacy</b>. Once chips are in the pot they belong to the pot.
EV(fold) is always 0 from the current decision point — compare it with EV(call), not with what you invested.</p>`,
    tab: 'odds',
  },
  variance: {
    group: 'Variance & inference',
    title: 'Variance & standard deviation',
    short: 'Spread of outcomes around the mean. SD = √variance.',
    body: `<p><b>Variance = E[(X − μ)²]</b>, the average squared distance from the mean; <b>SD = √Variance</b> is in the same units as X.
Sample variance divides by n − 1 (Bessel's correction).</p>
<p>No-limit hold'em has a typical SD of 80–120 bb per 100 hands. A winner earning 5 bb/100 can easily be down 30 bb after 1,000 hands — the
SD over 1,000 hands is √10 × 100 ≈ 316 bb, dwarfing the expected +50 bb.</p>`,
    tab: 'variance',
  },
  lln: {
    group: 'Variance & inference',
    title: 'Law of large numbers',
    short: 'The sample average converges to the true mean as n grows.',
    body: `<p>Your average result per hand converges to your true win rate as hands → ∞. But the <b>total</b> deviation from expectation does not
shrink — it grows like √n — it is just small <i>relative</i> to n. That's why short-term results say little about skill.</p>`,
    tab: 'variance',
  },
  clt: {
    group: 'Variance & inference',
    title: 'Central limit theorem',
    short: 'Sums/averages of many independent results are approximately normally distributed.',
    body: `<p>Single-hand results are wildly non-normal (mostly small, occasionally huge). But the <b>sum of n hands</b> is approximately
<b>Normal(n·μ, √n·σ)</b>. This justifies confidence intervals for win rates — see the histogram turn bell-shaped in the Variance Lab.</p>`,
    tab: 'variance',
  },
  'standard-error': {
    group: 'Variance & inference',
    title: 'Standard error',
    short: 'SD of an estimate: SE = SD / √n.',
    body: `<p>The <b>standard error</b> measures how much an estimate (like your observed win rate) would vary between samples:
<b>SE = σ / √n</b>. With σ = 100 bb/100 and 10,000 hands (n = 100 blocks of 100), SE = 100 / √100 = 10 bb/100.</p>`,
    tab: 'variance',
  },
  ci: {
    group: 'Variance & inference',
    title: 'Confidence interval',
    short: 'Estimate ± z × SE. A 95% CI uses z = 1.96.',
    body: `<p><b>CI = estimate ± 1.96 × SE</b> (95%). Interpretation: if you repeated the experiment many times, 95% of intervals built this way
would contain the true value.</p>
<p>To know your win rate within ±δ you need about <b>n = (1.96 · σ / δ)²</b> hands. For σ = 100 bb/100 and δ = 2 bb/100: (1.96 × 100 / 2)²
≈ 9,600 blocks = <b>960,000 hands</b>. Poker is a long game!</p>`,
    tab: 'variance',
  },
  'hypothesis-test': {
    group: 'Variance & inference',
    title: 'Hypothesis tests & p-values',
    short: 'p-value = P(data at least this extreme | null hypothesis is true).',
    body: `<p>To ask "am I really a winner?", take the null hypothesis "true win rate = 0". The z-score is <b>z = observed / SE</b>; the
one-sided p-value is 1 − Φ(z). A p-value is <i>not</i> the probability that you are a loser — it's how surprising your results would be if you were break-even.</p>`,
    tab: 'variance',
  },
  'risk-of-ruin': {
    group: 'Variance & inference',
    title: 'Risk of ruin',
    short: 'Probability of losing your whole bankroll: ≈ exp(−2·μ·B / σ²).',
    body: `<p>Modelling results as Brownian motion with drift μ and SD σ (per hand), the probability of ever losing a bankroll of B is
<b>RoR ≈ exp(−2 μ B / σ²)</b>.</p>
<p>Example: μ = 0.05 bb/hand (5 bb/100), σ = 10 bb/hand (100 bb/100), B = 2,000 bb → RoR = exp(−2·0.05·2000/100) = e⁻² ≈ <b>13.5%</b>.
Double the bankroll and it drops to 1.8%.</p>`,
    tab: 'variance',
  },
  'all-in-ev': {
    group: 'Variance & inference',
    title: 'All-in adjusted EV ("luck")',
    short: 'When money goes in before the river, credit each player equity × pot instead of the actual result.',
    body: `<p>If you get all-in with 80% equity in a 200-chip pot (100 from you), your <b>EV result = 0.80 × 200 − 100 = +60</b>, whether you win
+100 or lose −100. The difference between actual and EV results is pure card luck. Over a session, the EV line is a far less noisy estimate of skill.</p>`,
    tab: 'play',
  },
  bb100: {
    group: 'Player statistics',
    title: 'bb/100 (win rate)',
    short: 'Big blinds won per 100 hands — the standard unit for comparing win rates.',
    body: `<p>Win rate = (net chips / big blind) / hands × 100. Measuring in big blinds makes stakes irrelevant; per 100 hands keeps numbers readable.
SD is also quoted per 100 hands: SD₁₀₀ = SD₁ × √100 = 10 × SD₁.</p>`,
    tab: 'play',
  },
  range: {
    group: 'Ranges & Bayes',
    title: 'Hand range',
    short: 'The set of hands a player could hold, with how likely each is.',
    body: `<p>You rarely know an opponent's exact cards, so think in <b>ranges</b>: e.g. "TT+, AK" = 4×6 + 16 = 40 combos.
Your equity against a range is the combo-weighted average of your equity against each hand in it.</p>`,
    tab: 'ranges',
  },
  combos: {
    group: 'Ranges & Bayes',
    title: 'Combos',
    short: 'Pairs: 6 combos, suited: 4, offsuit: 12 — 1,326 in total.',
    body: `<p>13 pairs × 6 + 78 suited × 4 + 78 offsuit × 12 = 78 + 312 + 936 = <b>1,326</b>. A range's "%" is its share of these 1,326 combos.
So suited hands are only 23.5% of all hands, and any specific suited hand is 4/1,326 = 0.30%.</p>`,
    tab: 'ranges',
  },
  blockers: {
    group: 'Ranges & Bayes',
    title: 'Blockers / card removal',
    short: 'Cards you hold cannot be in the opponent’s hand, which changes their combos.',
    body: `<p>Holding the A♠ removes every combo containing it: AA drops from 6 to 3 combos, AK from 16 to 12. Card removal is conditional probability in action:
P(villain has AA | you hold an ace) = 3/1,225 instead of 6/1,326.</p>`,
    tab: 'ranges',
  },
  bayes: {
    group: 'Ranges & Bayes',
    title: "Bayes' theorem",
    short: 'P(H | E) = P(E | H) · P(H) / P(E): update beliefs with evidence.',
    body: `<p><b>Posterior ∝ Likelihood × Prior.</b> Prior: how often each hand is dealt (its combos). Likelihood: how often the opponent takes the
observed action with that hand. Posterior: what they likely hold now.</p>
<p>Example: a nit raises 100% of AA but only 5% of AJo. AA has 6 combos, AJo 12. Posterior weights: AA 6 × 1.00 = 6, AJo 12 × 0.05 = 0.6 → after the raise
AA is <b>10× more likely</b> than AJo, even though AJo is dealt twice as often.</p>`,
    tab: 'ranges',
  },
  'beta-prior': {
    group: 'Ranges & Bayes',
    title: 'Bayesian estimates with a Beta prior',
    short: 'Shrink small-sample frequencies toward a prior: (k + a) / (n + a + b).',
    body: `<p>Seeing an opponent fold 3 of 3 times doesn't mean they fold 100%. With a <b>Beta(a, b)</b> prior and k successes in n trials the posterior
is Beta(a + k, b + n − k), with mean <b>(a + k) / (a + b + n)</b>. With prior Beta(3, 3) (≈50%, worth 6 observations), 3/3 folds gives (3+3)/(6+3) = 67%.</p>
<p>As n grows, data overwhelms the prior. The HUD uses this to estimate opponents' ranges and fold frequencies.</p>`,
    tab: 'ranges',
  },
  vpip: {
    group: 'Player statistics',
    title: 'VPIP',
    short: 'Voluntarily Put money In Pot: % of hands a player calls or raises preflop.',
    body: `<p>VPIP measures looseness. Tight players: 12–20%. Loose: 30%+. Blinds don't count (they're forced), and a big-blind check doesn't count.
It's a <b>proportion</b>, so after n hands its 95% Wilson interval is roughly ±1/√n wide — after 25 hands, ±20 percentage points!</p>`,
    tab: 'play',
  },
  pfr: {
    group: 'Player statistics',
    title: 'PFR',
    short: 'PreFlop Raise: % of hands a player raises preflop.',
    body: `<p>PFR ≤ VPIP. The gap tells you how passive a player is preflop: VPIP 50 / PFR 5 is a calling station; 22 / 18 is solid-aggressive.</p>`,
    tab: 'play',
  },
  af: {
    group: 'Player statistics',
    title: 'Aggression factor (AF)',
    short: '(Bets + Raises) ÷ Calls postflop.',
    body: `<p>AF &gt; 2 means aggressive, &lt; 1 passive. A ratio of counts, so it is noisy with small samples.</p>`,
    tab: 'play',
  },
  wtsd: {
    group: 'Player statistics',
    title: 'WTSD and W$SD',
    short: 'Went To ShowDown (given saw flop) and Won $ at ShowDown.',
    body: `<p>High WTSD (35%+) = calls down a lot. W$SD tells you whether they show up with the goods. Both are conditional probabilities: the denominators are
"saw flop" and "went to showdown".</p>`,
    tab: 'play',
  },
  ftb: {
    group: 'Player statistics',
    title: 'Fold to bet',
    short: 'How often a player folds when facing a postflop bet — key input for bluffing EV.',
    body: `<p>Compare a player's fold-to-bet frequency with the break-even fold equity of your bluff (Bet / (Pot + Bet)). If they fold more often than that,
a pure bluff is +EV.</p>`,
    tab: 'play',
  },
  wilson: {
    group: 'Variance & inference',
    title: 'Wilson interval for proportions',
    short: 'A confidence interval for a proportion that behaves well for small n.',
    body: `<p>The textbook p̂ ± 1.96√(p̂(1−p̂)/n) fails badly for small n (0 of 5 gives [0, 0]!). The <b>Wilson score interval</b> fixes this and is used for every
HUD percentage here.</p>`,
    tab: 'play',
  },
};

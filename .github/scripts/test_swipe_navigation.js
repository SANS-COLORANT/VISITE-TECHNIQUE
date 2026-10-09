const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'swipeNavigation.js'), 'utf8').replace(/export /g, '');
const S = new Function(src + '; return {shouldStartSwipe, swipeDirection, rubberBand, settleSpring, remplissageOnglet, SWIPE_COMMIT_MIN};')();

// Start: a slightly diagonal thumb swipe is a swipe; vertical scrolling is not.
assert.equal(S.shouldStartSwipe(12, 8), true);
assert.equal(S.shouldStartSwipe(7, 6), true);
assert.equal(S.shouldStartSwipe(5, 0), false, 'below the start distance');
assert.equal(S.shouldStartSwipe(10, 30), false, 'vertical scroll stays with the list');
assert.equal(S.shouldStartSwipe(-14, 10), true);

// Commit: a light gesture is enough on a tablet (about 1075 px wide) and on a phone (400 px).
for (const width of [400, 1075]) {
  assert.equal(S.swipeDirection(-45, 0, width), 1, `${width}: a short slow drag left goes next`);
  assert.equal(S.swipeDirection(45, 0, width), -1, `${width}: a short slow drag right goes back`);
  assert.equal(S.swipeDirection(-10, -0.4, width), 1, `${width}: a tiny quick flick goes next`);
  assert.equal(S.swipeDirection(14, 0.3, width), -1);
  assert.equal(S.swipeDirection(-12, 0, width), 0, `${width}: a tremor does not change page`);
  assert.equal(S.swipeDirection(0, 0, width), 0);
}
// Projection: a slow-looking drag that is still accelerating commits.
assert.equal(S.swipeDirection(-20, -0.2, 1075), 1);
// A finger that comes back cancels the gesture.
assert.equal(S.swipeDirection(-60, 0.5, 400), 0);
assert.equal(S.swipeDirection(60, -0.5, 400), 0);
// The distance is short, never the whole screen.
assert.ok(S.SWIPE_COMMIT_MIN <= 24);
let smallest = Infinity;
for (let dx = 1; dx < 400; dx++) if (S.swipeDirection(-dx, 0, 1075) === 1) { smallest = dx; break; }
assert.ok(smallest <= 40, `a slow drag commits from ${smallest}px on a tablet (3.5 % of the width)`);

// Edge resistance and spring.
assert.equal(S.rubberBand(100, false), 100);
assert.ok(Math.abs(S.rubberBand(100, true) - 24) < 1e-9);
const spring = S.settleSpring(-1.2);
assert.equal(spring.velocity, -1200, 'px/ms -> px/s');
assert.equal(spring.overshootClamping, true, 'no bounce');
assert.equal(S.settleSpring(99).velocity, 3500, 'velocity is clamped');
assert.ok(Math.abs(spring.damping - 2 * Math.sqrt(spring.stiffness * spring.mass)) < 3, 'critically damped');

// Wiring: the visit screen uses these decisions, a native-driven spring, and no longer the old thresholds.
const visit = fs.readFileSync(path.join(root, 'VisiteScreen.js'), 'utf8');
for (const token of ['shouldStartSwipe(g.dx, g.dy)', 'swipeDirection(g.dx, g.vx, w)', 'rubberBand(', 'settleSpring(']) assert.ok(visit.includes(token), `VisiteScreen must use ${token}`);
assert.ok(!visit.includes('Math.max(40, w * 0.07)'), 'old long-swipe threshold removed');
assert.ok(!/Animated\.timing\(pagerX/.test(visit), 'the pager settles with a spring, not a fixed-duration timing');
assert.ok(/useNativeDriver: true/.test(visit));
assert.ok(visit.includes('SWIPE_NEIGHBOUR_OPACITY'), 'neighbour pages fade while dragging');
console.log('Swipe navigation: light gesture, flick, projection, cancel, edge resistance and native spring verified.');

// Barre d'onglets : la bulle suit exactement le geste (valeur animée partagée avec le pager).
const interp = (v) => ({ interpolate: ({ inputRange, outputRange }) => {
  const [a, b, c] = inputRange; const [oa, ob, oc] = outputRange;
  if (v <= a) return oa; if (v >= c) return oc;
  return v <= b ? oa + (ob - oa) * (v - a) / (b - a) : ob + (oc - ob) * (v - b) / (c - b);
} });
const W = 1000; const tabW = 120;
const at = (progress, index) => S.remplissageOnglet(interp(-progress * W), W, index, tabW);
assert.equal(at(2, 2).bulle, 0, 'onglet actif : bulle pleine');
assert.equal(at(2, 3).bulle, -tabW, 'onglet suivant, page au repos : bulle vide');
assert.equal(at(2.5, 2).bulle, tabW / 2, 'mi-chemin vers la droite : l’onglet quitté est à moitié vidé');
assert.equal(at(2.5, 3).bulle, -tabW / 2, 'mi-chemin : l’onglet d’arrivée est à moitié rempli, côté gauche');
assert.equal(at(2.5, 2).texte, -tabW / 2, 'le texte blanc reste fixe (contre-translation)');
assert.equal(at(1.5, 2).bulle, -tabW / 2, 'vers la gauche : l’arrivée se remplit par la droite');
assert.equal(at(0, 5).bulle, -tabW, 'onglet lointain : jamais rempli');
console.log('barre d’onglets synchronisée : OK');

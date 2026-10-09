const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'swipeNavigation.js'), 'utf8').replace(/export /g, '');
const S = new Function(src + '; return {shouldStartSwipe, swipeDirection, rubberBand, settleSpring, echantillonsD, bordBande, profilBande, profilIcone, entreesPager, WAVE_ROWS, WAVE_EDGE, WAVE_AMP, SWIPE_COMMIT_MIN};')();

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

// Barre d'onglets liquide 100 % native : profils d'interpolation.
const W = 120;
const ds = S.echantillonsD();
assert.equal(ds[0], 1); assert.equal(ds[ds.length - 1], -1); assert.ok(ds.every((d, j) => j === 0 || d < ds[j - 1]), 'd décroît strictement');
const entrees = S.entreesPager(2, 1000);
assert.ok(entrees.every((e, j) => j === 0 || e > entrees[j - 1]), 'plage d’entrée du pager strictement croissante (exigence d’interpolate)');
assert.equal(entrees[0], -3000); assert.equal(entrees[entrees.length - 1], -1000);
// Au repos (d = 0) : toutes les bandes couvrent entièrement la bulle.
for (let k = 0; k < S.WAVE_ROWS; k += 1) {
  const gauche = S.bordBande(0, k, W); const droite = gauche + W + 2 * S.WAVE_EDGE;
  assert.ok(gauche <= 0 && droite >= W, `bande ${k} : bulle pleine au repos`);
  // Onglet vide à droite : le liquide est entièrement sorti.
  assert.ok(S.bordBande(1, k, W) >= W - 0.001, `bande ${k} : vide à droite`);
  // Onglet vide à gauche : le bord droit du liquide est à 0.
  assert.ok(S.bordBande(-1, k, W) + W + 2 * S.WAVE_EDGE <= 0.001, `bande ${k} : vide à gauche`);
}
// Couverture continue autour du repos et jamais de trou pendant le mouvement (d entre 0,04 et 0,96).
for (let d = 0.04; d <= 0.96; d += 0.02) for (let k = 0; k < S.WAVE_ROWS; k += 1) {
  const gauche = S.bordBande(d, k, W);
  assert.ok(gauche + W + 2 * S.WAVE_EDGE >= W, `d=${d.toFixed(2)} bande ${k} : liquide jusqu’au bord droit`);
}
for (let d = -0.96; d <= -0.04; d += 0.02) for (let k = 0; k < S.WAVE_ROWS; k += 1) {
  assert.ok(S.bordBande(d, k, W) <= 0, `d=${d.toFixed(2)} bande ${k} : liquide depuis le bord gauche`);
}
// La vague ondule à mi-remplissage, est calme quand la bulle est pleine ou vide.
const bords = (d) => Array.from({ length: S.WAVE_ROWS }, (_, k) => S.bordBande(d, k, W));
const ecart = (d) => Math.max(...bords(d)) - Math.min(...bords(d));
assert.ok(ecart(0.5) > 8, 'bord ondulé à mi-remplissage');
assert.ok(ecart(0.5) <= 2 * S.WAVE_AMP + 0.001);
assert.ok(ecart(0.96) < ecart(0.5) && ecart(0.04) < ecart(0.5), 'vague calme près du plein et du vide');
// Profil complet : une valeur par échantillon et par bande ; icône blanche entre 0 et 1.
assert.equal(S.profilBande(3, W).length, ds.length);
const ic = S.profilIcone(20, W);
assert.equal(ic.length, ds.length); assert.ok(ic.every((v) => v >= 0 && v <= 1));
assert.equal(ic[ds.indexOf(0)], 1, 'icône blanche quand la bulle est pleine');
assert.equal(ic[0], 0, 'icône grise quand la bulle est vide à droite');
assert.equal(ic[ic.length - 1], 0, 'icône grise quand la bulle est vide à gauche');
console.log('barre d’onglets liquide native : OK');

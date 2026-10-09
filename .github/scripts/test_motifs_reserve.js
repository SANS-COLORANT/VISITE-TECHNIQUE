const assert = require('assert');
(async () => {
  const m = await import('../../motifsReserve.js');
  assert.ok(m.motifsPourOnglet('Extincteurs').includes('Pression basse'));
  assert.ok(m.motifsPourOnglet('Ventilation basse').includes('Grille encrassée'));
  assert.ok(m.motifsPourOnglet('Accès & portes').includes('Issue encombrée'));
  assert.ok(m.motifsPourOnglet('Onglet inconnu').length >= 4, 'jamais vide');
  assert.ok(m.motifsPourOnglet(undefined).length >= 4);
  const motifs = m.motifsPourOnglet('Extincteurs');
  let t = m.appliquerMotif('', 'Absent', motifs);
  assert.strictEqual(t, 'Absent : ');
  t = m.appliquerMotif(t + 'au RdC', 'Pression basse', motifs);
  assert.strictEqual(t, 'Pression basse : au RdC', 'un autre motif remplace le précédent et garde la précision');
  assert.strictEqual(m.appliquerMotif(t, 'Pression basse', motifs), t);
  assert.strictEqual(m.appliquerMotif('Texte libre', 'Absent', motifs), 'Absent : Texte libre');
  assert.strictEqual(m.motifActif(t, motifs), 'Pression basse');
  assert.strictEqual(m.motifActif('Texte libre', motifs), null);
  console.log('motifs réserve OK');
})().catch((e) => { console.error(e); process.exit(1); });

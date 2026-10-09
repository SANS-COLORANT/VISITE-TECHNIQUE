/**
 * « Depuis la dernière visite » : synthèse affichée à l'ouverture d'un local
 * (réserves non levées, équipements à surveiller, derniers relevés). Pure.
 */
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2026-04-14 » → « 14 avr. 2026 » (vide si illisible). */
export function dateCourte(texte) {
  const m = String(texte || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const mois = MOIS[Number(m[2]) - 1];
  return mois ? `${Number(m[3])} ${mois} ${m[1]}` : '';
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * @param {object} d
 * @param {{date_visite:string}|null} d.derniere  dernière visite du local
 * @param {Array<{poste:string}>} d.reserves  réserves ouvertes nées dans ce local
 * @param {Array<{designation:string,etat:string}>} d.equipementsSurveilles
 * @param {number} d.equipementsAjoutes
 * @param {number} d.equipementsTotal
 * @param {Array<{label:string,valeur:string,unite:string}>} d.releves
 */
export function resumerDepuisDerniereVisite({ derniere = null, reserves = [], equipementsSurveilles = [], equipementsAjoutes = 0, equipementsTotal = 0, releves = [] } = {}) {
  if (!derniere) return null;
  const aSurveiller = [];
  if (reserves.length) {
    aSurveiller.push({
      niveau: 'alerte', titre: pluriel(reserves.length, 'réserve non levée', 'réserves non levées'),
      detail: reserves.slice(0, 2).map((r) => r.poste || 'Réserve').join(' · ') + (reserves.length > 2 ? ` · +${reserves.length - 2}` : ''),
      cible: 'p-remarques',
    });
  }
  for (const e of equipementsSurveilles.slice(0, 3)) {
    aSurveiller.push({ niveau: /hors/i.test(e.etat) ? 'erreur' : 'alerte', titre: `${e.designation || 'Équipement'} · ${String(e.etat || '').toLowerCase()}`, detail: 'Signalé à la dernière visite', cible: 'p-equip' });
  }
  if (equipementsSurveilles.length > 3) {
    aSurveiller.push({ niveau: 'alerte', titre: `${equipementsSurveilles.length - 3} autre(s) équipement(s) à surveiller`, detail: '', cible: 'p-equip' });
  }
  const inchanges = Math.max(0, equipementsTotal - equipementsSurveilles.length - equipementsAjoutes);
  return {
    date: dateCourte(derniere.date_visite),
    aSurveiller,
    releves: releves.filter((r) => String(r.valeur ?? '').trim() !== '').slice(0, 4),
    equipements: { inchanges, surveilles: equipementsSurveilles.length, ajoutes: equipementsAjoutes, total: equipementsTotal },
    rien: aSurveiller.length === 0,
  };
}

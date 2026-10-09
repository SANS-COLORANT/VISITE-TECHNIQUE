/**
 * Relecture avant envoi : repère ce qui mérite un coup d'œil avant d'envoyer la
 * visite (onglets vides, index suspects, réserves sans photo). Module pur.
 * Une relecture ne bloque jamais l'envoi : « Envoyer quand même » reste possible.
 */
import { controlerIndex, nombreIndex } from './meterDestinations.js';

const MAX_ONGLETS = 4;
const MAX_RESERVES = 3;

const plein = (v) => String(v ?? '').trim() !== '';

/**
 * @param {object} entree
 * @param {Object<string,{state:string,total:number,done:number}>} entree.onglets  état par onglet (visitTabStatusDb)
 * @param {Object<string,string>} entree.labels  libellés des onglets
 * @param {string[]} entree.ordre  ordre d'affichage des onglets
 * @param {Array<{label:string,valeur:string,precedent:string,unite:string}>} entree.compteurs
 * @param {Array<{id:string,titre:string}>} entree.reservesSansPhoto
 */
export function analyserRelecture({ onglets = {}, labels = {}, ordre = [], compteurs = [], reservesSansPhoto = [] } = {}) {
  const points = [];
  const ok = [];
  const nom = (id) => labels[id] || id;
  const ids = ordre.length ? ordre.filter((id) => onglets[id]) : Object.keys(onglets);

  // Compteurs : plus bas que le précédent (erreur), inchangé ou non relevé (à vérifier).
  for (const c of compteurs) {
    const titre = c.label || 'Compteur';
    const unite = c.unite ? ` ${c.unite}` : '';
    const controle = controlerIndex(c.valeur, c.precedent);
    if (controle?.niveau === 'alerte') {
      points.push({ id: `cpt-bas:${titre}`, niveau: 'erreur', titre: `${titre} : index plus bas`, detail: `${c.precedent}${unite} → ${c.valeur}${unite} · remplacé ou remis à zéro ?`, cible: { type: 'onglet', id: 'p-releves' } });
    } else if (controle?.niveau === 'erreur') {
      points.push({ id: `cpt-fmt:${titre}`, niveau: 'erreur', titre: `${titre} : index illisible`, detail: controle.message, cible: { type: 'onglet', id: 'p-releves' } });
    } else if (!plein(c.valeur)) {
      points.push({ id: `cpt-vide:${titre}`, niveau: 'alerte', titre: `${titre} : pas d’index`, detail: 'Aucun relevé saisi.', cible: { type: 'onglet', id: 'p-releves' } });
    } else if (plein(c.precedent) && nombreIndex(c.valeur) === nombreIndex(c.precedent)) {
      points.push({ id: `cpt-egal:${titre}`, niveau: 'alerte', titre: `${titre} : index inchangé`, detail: `${c.valeur}${unite} comme à la dernière visite · à mettre à jour ?`, cible: { type: 'onglet', id: 'p-releves' } });
    }
  }

  // Réserves sans photo.
  const sansPhoto = reservesSansPhoto.slice(0, MAX_RESERVES);
  for (const r of sansPhoto) {
    points.push({ id: `res:${r.id}`, niveau: 'alerte', titre: 'Réserve sans photo', detail: r.titre || 'Réserve', cible: { type: 'onglet', id: 'p-remarques' } });
  }
  if (reservesSansPhoto.length > MAX_RESERVES) {
    points.push({ id: 'res:plus', niveau: 'alerte', titre: `${reservesSansPhoto.length - MAX_RESERVES} autre(s) réserve(s) sans photo`, detail: 'Voir l’onglet Remarques.', cible: { type: 'onglet', id: 'p-remarques' } });
  }

  // Onglets : vides un par un (limités), incomplets en une ligne.
  const vides = ids.filter((id) => onglets[id].state === 'empty');
  const incomplets = ids.filter((id) => onglets[id].state === 'partial');
  for (const id of vides.slice(0, MAX_ONGLETS)) {
    points.push({ id: `vide:${id}`, niveau: 'alerte', titre: `Onglet vide : ${nom(id)}`, detail: `0/${onglets[id].total} renseigné`, cible: { type: 'onglet', id } });
  }
  if (vides.length > MAX_ONGLETS) {
    points.push({ id: 'vide:plus', niveau: 'alerte', titre: `${vides.length - MAX_ONGLETS} autre(s) onglet(s) vide(s)`, detail: vides.slice(MAX_ONGLETS).map(nom).join(', '), cible: { type: 'onglet', id: vides[MAX_ONGLETS] } });
  }
  if (incomplets.length) {
    points.push({ id: 'partiel', niveau: 'info', titre: `${incomplets.length} onglet(s) incomplet(s)`, detail: incomplets.slice(0, 4).map((id) => `${nom(id)} ${onglets[id].done}/${onglets[id].total}`).join(' · '), cible: { type: 'onglet', id: incomplets[0] } });
  }

  // Ce qui est bon.
  if (!vides.length && ids.length) ok.push({ titre: 'Tous les onglets sont entamés', detail: `${ids.length} onglet(s)` });
  if (compteurs.length && !points.some((p) => p.id.startsWith('cpt-'))) ok.push({ titre: 'Index cohérents', detail: `${compteurs.length} compteur(s)` });
  if (!reservesSansPhoto.length) ok.push({ titre: 'Réserves illustrées', detail: 'Chaque réserve a sa photo' });

  const ordreNiveau = { erreur: 0, alerte: 1, info: 2 };
  points.sort((a, b) => ordreNiveau[a.niveau] - ordreNiveau[b.niveau]);
  const aVerifier = points.filter((p) => p.niveau !== 'info').length;
  return { points, ok, aVerifier, propre: aVerifier === 0 };
}

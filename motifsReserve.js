/**
 * Motifs fréquents proposés dans l'ajout rapide d'une anomalie, selon l'onglet
 * ouvert. Ils préremplissent seulement le texte, modifiable : aucune réserve
 * n'est créée sans validation. La dictée passe par le micro du clavier.
 */
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** [mots reconnus dans le libellé de l'onglet, motifs]. Le premier ensemble qui correspond gagne. */
const PAR_ONGLET = [
  [['extincteur', 'incendie', 'secours'], ['Vérification périmée', 'Pression basse', 'Absent', 'Inaccessible', 'Plombage rompu', 'Affichage manquant']],
  [['ventilation', 'vmc', 'caisson', 'extraction', 'bouche'], ['Ouverture obstruée', 'Grille encrassée', 'Débit insuffisant', 'Bruit anormal', 'Moteur à l’arrêt', 'Filtre colmaté']],
  [['issue', 'porte', 'acces', 'evacuation'], ['Porte ne s’ouvre pas', 'Issue encombrée', 'Signalisation absente', 'Barre anti-panique HS', 'Éclairage de sécurité HS']],
  [['gaz', 'detect', 'electrovanne'], ['Détecteur HS', 'Vanne non testée', 'Odeur de gaz', 'Coupure d’urgence inaccessible', 'Report d’alarme absent']],
  [['ecs', 'legionel', 'temperature', 'ballon', 'eau chaude'], ['Température trop basse', 'Absence de purge', 'Calorifuge dégradé', 'Fuite sur ballon', 'Groupe de sécurité à remplacer']],
  [['compteur', 'releve', 'index'], ['Compteur illisible', 'Scellé rompu', 'Compteur inaccessible', 'Fuite en amont', 'Remplacement à prévoir']],
  [['equipement', 'materiel', 'chaudiere', 'pompe', 'bruleur', 'regulation'], ['Fuite', 'Corrosion', 'Bruit ou vibration', 'Isolation dégradée', 'Équipement à remplacer', 'Entretien en retard']],
];
const GENERAUX = ['Fuite', 'Corrosion', 'Équipement HS', 'Accès difficile', 'Affichage manquant', 'Entretien en retard'];

/** Motifs pour l'onglet donné (libellé affiché) ; jamais vide. */
export function motifsPourOnglet(libelleOnglet) {
  const n = norm(libelleOnglet);
  const trouve = PAR_ONGLET.find(([mots]) => mots.some((m) => n.includes(m)));
  return trouve ? trouve[1] : GENERAUX;
}

/** Texte d'une anomalie quand on touche un motif : remplace un motif précédent, garde la suite saisie. */
export function appliquerMotif(texteActuel, motif, motifsConnus = []) {
  const actuel = String(texteActuel || '');
  const precedent = motifsConnus.find((m) => actuel.startsWith(`${m} : `) || actuel === m);
  if (precedent === motif) return actuel; // déjà choisi
  const reste = precedent ? actuel.slice(precedent.length).replace(/^\s*:\s*/, '') : actuel;
  return reste.trim() ? `${motif} : ${reste.trim()}` : `${motif} : `;
}

/** Motif actuellement présent au début du texte, ou null. */
export function motifActif(texte, motifs = []) {
  const t = String(texte || '');
  return motifs.find((m) => t.startsWith(`${m} : `) || t === m) || null;
}

/**
 * Destinations d'export des compteurs (ligne de la trame), côté interface.
 *
 * La destination est la clé du champ de relevé de la trame (« Index compteur
 * énergie (MWh) »…) ou « supplementaire ». Elle est indépendante du nom
 * affiché : renommer un compteur ne change jamais sa ligne Excel ni son
 * critère Intranet (voir excelExport.js et intranetVisitPayload.js).
 */
export const DESTINATION_SUPPLEMENTAIRE = 'supplementaire';

const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Libellé court d'une destination pour l'écran. */
export function libelleDestination(cle) {
  if (!cle || cle === DESTINATION_SUPPLEMENTAIRE) return 'Compteur supplémentaire';
  const t = norm(cle);
  if (/gaz|fioul/.test(t)) return 'Gaz / fioul';
  if (/energie/.test(t)) return 'Énergie';
  if (/appoint/.test(t)) return 'Appoint chauffage';
  if (/ef ecs|eau froide/.test(t)) return 'Eau froide ECS';
  if (/^pression/.test(t) && /ecs/.test(t)) return 'Pression ECS';
  if (/^pression/.test(t)) return 'Pression chauffage';
  return String(cle).replace(/\s*\([^)]*\)\s*$/, '');
}

/** Destinations proposées : les champs de la section compteurs de la trame. */
export function destinationsDisponibles(champsSectionCompteurs = []) {
  return [
    ...champsSectionCompteurs.filter((f) => f?.type === 'champ' && f?.cle).map((f) => ({ cle: f.cle, label: libelleDestination(f.cle) })),
    { cle: DESTINATION_SUPPLEMENTAIRE, label: libelleDestination(DESTINATION_SUPPLEMENTAIRE) },
  ];
}

/**
 * Destination déduite d'un nom (choix du type à l'ajout, ou figement d'un
 * compteur historique au moment où on le renomme). Reprend la règle de
 * libellé historique de l'export ICPE pour que figer ne déplace rien.
 */
export function destinationDepuisLibelle(label, unite, champsSectionCompteurs = []) {
  const txt = norm(`${label || ''} ${unite || ''}`);
  const cles = champsSectionCompteurs.filter((f) => f?.type === 'champ').map((f) => f.cle);
  const trouver = (re) => cles.find((c) => re.test(norm(c))) || null;
  let cible = null;
  if (/gaz|fioul|cuve/.test(txt)) cible = trouver(/gaz|fioul/);
  else if (/energie|calorie|mwh|kwh|elect/.test(txt)) cible = trouver(/^index.*energie/);
  else if (/appoint/.test(txt) && /chauff/.test(txt)) cible = trouver(/appoint/);
  else if (/(eau froide|ef)/.test(txt) && /(ecs|sanitaire)/.test(txt)) cible = trouver(/ef ecs|eau froide/);
  else if (/manom|pression/.test(txt) && /chauff/.test(txt)) cible = trouver(/^pression.*chauffage/);
  else if (/manom|pression/.test(txt) && /(ecs|sanitaire)/.test(txt)) cible = trouver(/^pression.*ecs/);
  else if (/(^|[^a-z])eau([^a-z]|$)|volum/.test(txt)) cible = trouver(/ef ecs|eau froide/);
  return cible || DESTINATION_SUPPLEMENTAIRE;
}

/** Nombre lu dans une saisie libre (« 419 816 », « 2 841,6 »). */
export function nombreIndex(texte) {
  const brut = String(texte ?? '').replace(/[\s\u00a0\u202f]/g, '');
  if (!brut) return null;
  if (!/^\d+([.,]\d+)?$/.test(brut)) return NaN;
  return Number(brut.replace(',', '.'));
}

/** Contrôle d'une saisie d'index : format et cohérence avec le relevé précédent. */
export function controlerIndex(valeur, precedent) {
  const n = nombreIndex(valeur);
  if (n === null) return null;
  if (Number.isNaN(n)) return { niveau: 'erreur', message: 'Chiffres uniquement, virgule pour les décimales.' };
  const p = nombreIndex(precedent);
  if (p !== null && !Number.isNaN(p) && n < p) {
    return { niveau: 'alerte', message: `Plus bas que le relevé précédent (${precedent}) : compteur remplacé ou remis à zéro ?` };
  }
  return null;
}

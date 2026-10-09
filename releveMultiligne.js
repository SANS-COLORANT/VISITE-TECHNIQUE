/**
 * Relevés groupés dans une seule cellule : un relevé par ligne, au format
 * « Nom du compteur : index unité » (voir docs/RELEVES_MULTILIGNES.md).
 *
 * Utilisé par l'import Excel (une cellule multi-lignes crée un compteur par
 * ligne, les lignes vides et doubles sauts sont ignorés) et par les exports
 * Excel / Intranet (les compteurs du même type tiennent dans une cellule).
 * Module pur : aucun accès base ni React Native.
 */
import { pictoTemperature } from './relevePictos.js';

const NOMBRE = /^[-+]?\d[\d\s]*(?:[.,]\d+)?$/;

/** Découpe une cellule en lignes non vides ; l'ancien séparateur « | » reste lu. */
export function lignesReleve(texte) {
  return String(texte ?? '')
    .split(/\r\n|\r|\n|\u2028|\u2029|\s\|\s/)
    .map((ligne) => ligne.replace(/[\u00a0\u202f]/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Lit une ligne : « Compteur gaz : 1 234,5 m³ », « 1234 », « 56,2 °C ».
 * Retourne { label, valeur, unite } ; label vaut null quand la ligne ne porte
 * qu'une valeur. Le nombre garde sa saisie d'origine (virgule comprise).
 */
export function lireLigneReleve(ligne) {
  const brut = String(ligne ?? '').trim();
  if (!brut) return null;
  const separateur = brut.lastIndexOf(':');
  let label = null;
  let reste = brut;
  if (separateur > 0) {
    label = brut.slice(0, separateur).trim() || null;
    reste = brut.slice(separateur + 1).trim();
  }
  const m = /^([-+]?\d[\d\s]*(?:[.,]\d+)?)\s*(.*)$/.exec(reste);
  if (!m) return { label: null, valeur: brut, unite: '' };
  const valeur = m[1].replace(/\s+/g, ' ').trim();
  return { label, valeur: NOMBRE.test(valeur) ? valeur.replace(/\s/g, '') : valeur, unite: m[2].trim() };
}

/** Tous les relevés d'une cellule, dans l'ordre. Cellule vide → []. */
export function decouperReleves(texte) {
  return lignesReleve(texte).map(lireLigneReleve).filter(Boolean);
}

/** « Nom : valeur unité » — sans nom, « valeur unité ». */
export function formaterLigneReleve({ label, valeur, unite }) {
  const v = String(valeur ?? '').trim();
  if (!v) return '';
  const u = String(unite ?? '').trim();
  const corps = u ? `${v} ${u}` : v;
  const nom = String(label ?? '').trim();
  return nom ? `${nom} : ${corps}` : corps;
}

/**
 * Cellule groupée. Un seul relevé : valeur seule (format historique inchangé,
 * `avecNomSeul` pour y ajouter le nom). Plusieurs : une ligne chacune.
 */
export function formaterReleves(items = [], { avecNomSeul = false } = {}) {
  const lignes = items.filter((i) => String(i?.valeur ?? '').trim() !== '');
  if (!lignes.length) return '';
  if (lignes.length === 1 && !avecNomSeul) return formaterLigneReleve({ ...lignes[0], label: null });
  return lignes.map(formaterLigneReleve).join('\n');
}

/** Nom du n-ième relevé d'une cellule quand la ligne ne donne pas de nom. */
export function nomReleveSuivant(base, rang) {
  const nom = String(base || 'Compteur').trim();
  return rang <= 1 ? nom : `${nom} ${rang}`;
}

/**
 * Compteurs d'une cellule d'index importée. Le premier garde le nom et la
 * destination de la ligne de la trame ; les suivants sont d'autres compteurs
 * du même type (même destination), nommés d'après leur ligne ou numérotés.
 */
export function compteursDepuisCellule({ base, destination, unite, texte }) {
  const releves = decouperReleves(texte);
  const vus = new Set();
  return releves.map((r, index) => {
    let label = r.label || nomReleveSuivant(base, index + 1);
    const cle = label.toLowerCase();
    if (vus.has(cle)) label = nomReleveSuivant(label, vus.size + 1);
    vus.add(label.toLowerCase());
    return { label, destination, valeur: r.valeur, unite: r.unite || unite || '' };
  });
}

/**
 * Températures d'une cellule de relevé. La première valeur reste celle du
 * champ de la trame ; les suivantes deviennent des points de mesure du même
 * circuit (« Chauffage · Départ 2 »), comme ceux ajoutés sur le terrain.
 */
export function temperaturesDepuisCellule({ cle, texte }) {
  const releves = decouperReleves(texte);
  if (!releves.length) return { valeur: '', points: [] };
  const t = pictoTemperature(cle);
  const prefixe = t.circuit === 'Chauffage' ? 'Chauffage · ' : t.circuit === 'ECS' ? 'ECS · ' : '';
  const sens = t.sens && t.sens !== 'pH' ? t.sens : 'Mesure';
  const points = releves.slice(1).map((r, i) => ({
    libelle: `${prefixe}${r.label || `${sens} ${i + 2}`}`,
    valeur: r.valeur,
    unite: r.unite || t.unite || '°C',
  }));
  return { valeur: releves[0].valeur, points };
}

function circuitSensPoint(libelle) {
  const t = pictoTemperature(libelle);
  const sens = t.sens || (/ballon/i.test(String(libelle)) ? 'Stockage' : null);
  return { circuit: t.circuit, sens };
}

/** Points de mesure ajoutés qui appartiennent à la même température (même circuit, même sens). */
export function pointsDeLaTemperature(cle, points = []) {
  const champ = circuitSensPoint(cle);
  if (!champ.circuit || !champ.sens) return [];
  return points.filter((p) => {
    const autre = circuitSensPoint(p?.libelle);
    return autre.circuit === champ.circuit && autre.sens === champ.sens && String(p?.valeur ?? '').trim() !== '';
  });
}

/**
 * Cellule d'une température : sans mesure ajoutée, la valeur seule (inchangé) ;
 * sinon une ligne « Nom : valeur unité » pour la mesure de la trame puis chaque
 * mesure ajoutée du même circuit et du même sens.
 */
export function formaterTemperatureGroupee(cle, valeur, points = []) {
  const supplementaires = pointsDeLaTemperature(cle, points);
  if (!supplementaires.length) return valeur;
  const t = pictoTemperature(cle);
  const principale = String(valeur ?? '').trim()
    ? [{ label: t.sens || 'Mesure', valeur: String(valeur).trim(), unite: t.unite || '°C' }] : [];
  const prefixes = /^(Chauffage|ECS) · /;
  return formaterReleves([
    ...principale,
    ...supplementaires.map((p) => ({ label: String(p.libelle).replace(prefixes, ''), valeur: p.valeur, unite: p.unite || '°C' })),
  ], { avecNomSeul: true });
}

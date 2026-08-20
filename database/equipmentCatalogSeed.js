import { createId } from './ids.js';

export const EQUIPMENT_CATEGORIES = [
  ['Pompe', '💧'], ['Circulateur', '🔄'], ['Chaudière', '🔥'], ['Échangeur', '♨️'],
  ['Ballon ECS', '🛢️'], ['Vase d’expansion', '🔴'], ['Adoucisseur', '💎'],
  ['Désemboueur', '🧲'], ['Régulation', '🎛️'], ['Compteur', '🔢'],
  ['Robinetterie', '🔧'], ['Armoire électrique', '⚡'],
];

export const EQUIPMENT_BRANDS = [
  'Grundfos', 'Wilo', 'Lowara', 'KSB', 'Salmson', 'De Dietrich', 'Viessmann',
  'Atlantic', 'Chappée', 'Bosch', 'Vaillant', 'Alfa Laval', 'SWEP', 'Reflex',
  'Zilmet', 'BWT', 'Culligan', 'Fernox', 'Spirotech', 'Siemens',
  'Schneider Electric', 'WIT', 'SOFREL', 'Kamstrup', 'Itron',
];

export const EQUIPMENT_MODELS = [
  ['Circulateur', 'Grundfos', 'MAGNA3', 'Circulateur électronique'],
  ['Circulateur', 'Grundfos', 'ALPHA2', 'Circulateur haut rendement'],
  ['Pompe', 'Grundfos', 'TPE3', 'Pompe en ligne'],
  ['Pompe', 'Grundfos', 'CR', 'Pompe multicellulaire verticale'],
  ['Circulateur', 'Wilo', 'Stratos MAXO', 'Circulateur intelligent'],
  ['Circulateur', 'Wilo', 'Yonos MAXO', 'Circulateur haut rendement'],
  ['Circulateur', 'Wilo', 'TOP-S', 'Circulateur à rotor noyé'],
  ['Pompe', 'Wilo', 'CronoLine IL-E', 'Pompe en ligne électronique'],
  ['Circulateur', 'Lowara', 'ecocirc XL', 'Circulateur électronique'],
  ['Pompe', 'Lowara', 'e-LNE', 'Pompe en ligne'],
  ['Pompe', 'KSB', 'Etaline', 'Pompe en ligne'],
  ['Pompe', 'KSB', 'Etanorm', 'Pompe monocellulaire'],
  ['Circulateur', 'Salmson', 'Priux master', 'Circulateur électronique'],
  ['Chaudière', 'De Dietrich', 'C310 ECO', 'Chaudière gaz condensation'],
  ['Chaudière', 'De Dietrich', 'C230 EVO', 'Chaudière gaz condensation'],
  ['Chaudière', 'Viessmann', 'Vitocrossal 300', 'Chaudière gaz condensation'],
  ['Chaudière', 'Viessmann', 'Vitodens 200-W', 'Chaudière murale condensation'],
  ['Chaudière', 'Atlantic', 'Varfree EVO', 'Chaudière gaz condensation'],
  ['Chaudière', 'Chappée', 'Power HT+', 'Chaudière gaz condensation'],
  ['Chaudière', 'Bosch', 'Condens 7000 F', 'Chaudière gaz condensation'],
  ['Chaudière', 'Vaillant', 'ecoTEC plus', 'Chaudière gaz condensation'],
  ['Échangeur', 'Alfa Laval', 'M6', 'Échangeur à plaques démontables'],
  ['Échangeur', 'Alfa Laval', 'M10', 'Échangeur à plaques démontables'],
  ['Échangeur', 'SWEP', 'B25T', 'Échangeur à plaques brasées'],
  ['Vase d’expansion', 'Reflex', 'N', 'Vase à membrane'],
  ['Vase d’expansion', 'Zilmet', 'Hydro-Pro', 'Vase à membrane'],
  ['Adoucisseur', 'BWT', 'AQA perla', 'Adoucisseur volumétrique'],
  ['Adoucisseur', 'Culligan', 'HE', 'Adoucisseur volumétrique'],
  ['Désemboueur', 'Fernox', 'TF1 Omega', 'Filtre magnétique'],
  ['Désemboueur', 'Spirotech', 'SpiroTrap', 'Séparateur de boues'],
  ['Régulation', 'Siemens', 'RVL480', 'Régulateur de chauffage'],
  ['Régulation', 'Schneider Electric', 'SmartX', 'Automate de régulation'],
  ['Régulation', 'WIT', 'Easy', 'Télégestion'],
  ['Régulation', 'SOFREL', 'S550', 'Télégestion'],
  ['Compteur', 'Kamstrup', 'MULTICAL 603', 'Compteur d’énergie thermique'],
  ['Compteur', 'Itron', 'CF Echo II', 'Compteur d’énergie thermique'],
];

export async function seedEquipmentCatalog(db) {
  const categoryIds = new Map();
  const brandIds = new Map();

  for (let i = 0; i < EQUIPMENT_CATEGORIES.length; i++) {
    const [nom, icone] = EQUIPMENT_CATEGORIES[i];
    const existing = await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom = ? COLLATE NOCASE', [nom]);
    const id = existing?.id || createId('cat');
    if (!existing) await db.runAsync('INSERT INTO categories_equipement (id, nom, icone, ordre) VALUES (?, ?, ?, ?)', [id, nom, icone, i]);
    categoryIds.set(nom, id);
  }

  for (const nom of EQUIPMENT_BRANDS) {
    const existing = await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom = ? COLLATE NOCASE', [nom]);
    const id = existing?.id || createId('brand');
    if (!existing) await db.runAsync('INSERT INTO marques_equipement (id, nom) VALUES (?, ?)', [id, nom]);
    brandIds.set(nom, id);
  }

  for (const [categorie, marque, nom, caracteristiques] of EQUIPMENT_MODELS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO modeles_equipement
       (id, categorie_id, marque_id, nom, caracteristiques, mots_cles)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [createId('model'), categoryIds.get(categorie), brandIds.get(marque), nom, caracteristiques, `${categorie} ${marque} ${nom}`]
    );
  }
}

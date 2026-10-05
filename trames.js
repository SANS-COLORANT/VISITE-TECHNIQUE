import { TRAME_DATA, EXCEL_ROWS } from './data.js';
import {
  TRAME_RESEAU_CHALEUR,
  RESEAU_CHALEUR_SECTION_RANGES,
  RESEAU_CHALEUR_RESEAU_BLOCS_DEBUT,
  RESEAU_CHALEUR_RESUME_ROWS,
} from './reseauChaleurData.js';

const TRAME_CODES = Object.freeze({
  ICPE: 'ICPE',
  RESEAU_CHALEUR: 'RESEAU_CHALEUR',
});

const TRAME_LABELS = Object.freeze({
  [TRAME_CODES.ICPE]: 'ICPE',
  [TRAME_CODES.RESEAU_CHALEUR]: 'Réseau de chaleur',
});

const TAB_ORDER_ICPE = Object.freeze([
  'p-infos', 'p-distrib', 'p-regulation', 'p-releves', 'SEP',
  'p-conf-local', 'p-conf-energie', 'p-conf-chauffage', 'p-conf-ecs', 'p-conf-adouc', 'SEP',
  'p-equip', 'p-remarques', 'p-photos',
]);

const TAB_ORDER_RESEAU_CHALEUR = Object.freeze([
  'p-infos', 'p-distrib', 'p-releves', 'p-regulation', 'SEP',
  'p-conf-chauffage', 'p-conf-ecs', 'p-conf-adouc', 'p-conf-energie', 'p-conf-local', 'SEP',
  'p-equip', 'p-remarques', 'p-photos',
]);

function normalizeTrameCode(code) {
  const value = String(code || '').trim().toUpperCase();
  if (value === TRAME_CODES.RESEAU_CHALEUR || value === 'RÉSEAU DE CHALEUR' || value === 'RESEAU DE CHALEUR') {
    return TRAME_CODES.RESEAU_CHALEUR;
  }
  return TRAME_CODES.ICPE;
}

function getTrameData(code) {
  return normalizeTrameCode(code) === TRAME_CODES.RESEAU_CHALEUR ? TRAME_RESEAU_CHALEUR : TRAME_DATA;
}

function getTrameLabel(code) {
  return TRAME_LABELS[normalizeTrameCode(code)];
}

function getTabOrder(code) {
  return normalizeTrameCode(code) === TRAME_CODES.RESEAU_CHALEUR ? TAB_ORDER_RESEAU_CHALEUR : TAB_ORDER_ICPE;
}

function getExcelLayout(code) {
  if (normalizeTrameCode(code) === TRAME_CODES.RESEAU_CHALEUR) {
    return {
      sheetName: 'TRAME RÉSEAU DE CHALEUR',
      fieldColumn: 'C',
      headerFieldColumn: 'B',
      controlAvisColumn: 'B',
      controlCommentColumn: 'C',
      sectionRanges: RESEAU_CHALEUR_SECTION_RANGES,
      reseauBlocsDebut: RESEAU_CHALEUR_RESEAU_BLOCS_DEBUT,
      resumeRows: RESEAU_CHALEUR_RESUME_ROWS,
    };
  }
  return {
    sheetName: 'TRAME ICPE',
    fieldColumn: 'B',
    headerFieldColumn: 'B',
    controlAvisColumn: 'B',
    controlCommentColumn: 'C',
    excelRows: EXCEL_ROWS,
    reseauBlocsDebut: [66, 76, 86, 96, 106, 116],
    resumeRows: null,
  };
}

function findExcelRow(sheet, trameCode, panelId, section, cle) {
  const layout = getExcelLayout(trameCode);
  if (layout.sectionRanges) {
    const range = layout.sectionRanges?.[panelId]?.[section];
    if (!range) return null;
    const [start, end] = range;
    for (let row = start; row <= end; row++) {
      const value = sheet?.[`A${row}`]?.v;
      if (String(value ?? '').trim() === String(cle ?? '').trim()) return row;
    }
    return null;
  }
  return layout.excelRows?.[`${section}||${cle}`] || null;
}

function defaultPerimetreForControle(trameCode, sectionCode, cle) {
  if (normalizeTrameCode(trameCode) !== TRAME_CODES.RESEAU_CHALEUR) return null;

  const section = String(sectionCode || '').toLowerCase();
  const key = String(cle || '').trim();

  // Règle métier Réseau de chaleur :
  // - production / températures primaires et production ECS => PRIMAIRE ;
  // - distribution, conformité, local, électricité et auxiliaires => SECONDAIRE.
  // Le rapport de référence confirme notamment qu'une réserve de température
  // retour ECS est rangée au primaire, alors que disconnecteur, BAES,
  // extincteurs, signalétique, calorifuge de bouclage ECS, etc. sont au secondaire.
  if (section.startsWith('releves.temperatures')) {
    if (/^PRIMAIRE:/i.test(key) || /^EAU CHAUDE SANITAIRE:/i.test(key)) return 'Primaire';
    return 'Secondaire'; // pH + températures réseau chauffage
  }

  if (
    section.startsWith('conf-chauffage.') ||
    section.startsWith('conf-ecs.') ||
    section.startsWith('conf-adouc.') ||
    section.startsWith('conf-energie.') ||
    section.startsWith('conf-local.')
  ) return 'Secondaire';

  return 'Secondaire';
}

function isAutomaticPerimetreControle(trameCode, sectionCode, cle) {
  return normalizeTrameCode(trameCode) === TRAME_CODES.RESEAU_CHALEUR &&
    Boolean(defaultPerimetreForControle(trameCode, sectionCode, cle));
}

export {
  TRAME_CODES,
  TRAME_LABELS,
  normalizeTrameCode,
  getTrameData,
  getTrameLabel,
  getTabOrder,
  getExcelLayout,
  findExcelRow,
  defaultPerimetreForControle,
  isAutomaticPerimetreControle,
};

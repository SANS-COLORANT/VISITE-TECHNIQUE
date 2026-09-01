/**
 * Registre générique des trames de visite.
 *
 * Une trame décrit à la fois :
 * - l'interface métier à afficher ;
 * - le modèle Excel à utiliser ;
 * - le mapping import/export des champs et contrôles ;
 * - les blocs répétables et feuilles tabulaires.
 */
import { TEMPLATE_EXCEL_BASE64 } from './templateExcel.js';
import { EXCEL_ROWS, TRAME_DATA } from './data.js';
import { exigerDefinitionTrameValide } from './trameValidation.js';
import { VMC_PANELS, VMC_FIELD_MAPPINGS, VMC_TEMPLATE_BASE64 } from './vmcTrame.js';
import { PREALLUMAGE_PANELS, PREALLUMAGE_FIELD_MAPPINGS, PREALLUMAGE_TEMPLATE_BASE64 } from './preAllumageTrame.js';

export const DEFAULT_TRAME_ID = 'icpe_v1';

function normaliserSectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function construireMappingsChamps(uiData, excelRows) {
  const mappings = [];
  for (const [panelId, sections] of Object.entries(uiData || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const sectionCode = normaliserSectionCode(panelId, section);
      for (const field of fields || []) {
        const row = excelRows[`${section}||${field.cle}`];
        if (!row) continue;
        const estControle = field.type === 'controle';
        mappings.push({ panelId, section, sectionCode, cle: field.cle, type: field.type,
          valueCell: `${estControle ? 'B' : 'C'}${row}`,
          commentCell: estControle ? `C${row}` : null });
      }
    }
  }
  return Object.freeze(mappings);
}

const ICPE_FIELD_MAPPINGS = construireMappingsChamps(TRAME_DATA, EXCEL_ROWS);

const TABLES_STANDARD = Object.freeze({
  materiel: {
    sheet: 'MATERIEL', startRow: 4, maxImportRow: 500,
    columns: [['A', 'categorie'], ['B', 'nombre'], ['C', 'designation'], ['D', 'numero'], ['E', 'reseau'], ['F', 'marque'], ['G', 'modele'], ['H', 'caracteristiques'], ['I', 'annee'], ['J', 'etat']],
    exportColumns: [['A', 'categorie'], ['B', 'nombre'], ['C', 'designation'], ['D', 'numero_materiel'], ['E', 'reseau_desservi'], ['F', 'marque'], ['G', 'modele'], ['H', 'caracteristiques'], ['I', 'annee'], ['J', 'etat']],
  },
  remarques: {
    sheet: 'REMARQUES', startRow: 4, maxImportRow: 500,
    columns: [['A', 'poste'], ['B', 'prestation'], ['C', 'date_reserve'], ['D', 'delai'], ['F', 'estimatif']],
    exportColumns: [['A', 'poste'], ['B', 'prestation'], ['C', 'date_reserve'], ['F', 'estimatif']],
  },
  note: { sheet: 'NOTE', cell: 'A2' },
});

const ICPE = Object.freeze({
  id: DEFAULT_TRAME_ID, version: 1, nom: 'ICPE', description: 'Trame historique de visite technique ICPE', actif: true,
  ui: {
    panels: TRAME_DATA,
    specialPanels: ['p-regulation', 'p-releves', 'p-equip', 'p-remarques', 'p-photos'],
    tabOrder: ['p-infos', 'p-distrib', 'p-regulation', 'p-releves', 'SEP', 'p-conf-local', 'p-conf-energie', 'p-conf-chauffage', 'p-conf-ecs', 'p-conf-adouc', 'SEP', 'p-equip', 'p-remarques', 'p-photos'],
    labels: {
      'p-infos': 'Informations', 'p-distrib': 'Distribution', 'p-regulation': 'Régulation', 'p-releves': 'Relevés',
      'p-conf-local': 'Conf. Local', 'p-conf-energie': 'Conf. Énergie', 'p-conf-chauffage': 'Conf. Chauffage',
      'p-conf-ecs': 'Conf. ECS', 'p-conf-adouc': 'Conf. Adoucisseur', 'p-equip': 'Équipements',
      'p-remarques': 'Réserves', 'p-photos': 'Photos',
    },
  },
  excel: {
    templateBase64: TEMPLATE_EXCEL_BASE64,
    requiredSheets: ['TRAME ICPE'], mainSheet: 'TRAME ICPE',
    metadata: { client: 'C1', site: 'C2', adresse: 'C3', type: 'C4', dateVisite: 'C5' },
    signature: { sheet: 'TRAME ICPE', cells: [{ ref: 'C4', values: ['ICPE'] }] },
    fieldMappings: ICPE_FIELD_MAPPINGS,
    networks: {
      mainSheet: 'TRAME ICPE', starts: [66, 76, 86, 96, 106, 116],
      importOffsets: { tExt: 0, tDep: 1, nom: 2, courbe: 3, tnc: 4, programme: 5 },
      exportOffsets: { t_ext_c: 0, t_dep_c: 1, nom_reseau: 2, courbe_de_chauffe: 3, tnc: 4, consigne_programme_horaire: 5 },
      exportColumn: 'C',
      overflow: {
        sheet: 'RESEAUX COMPLEMENTAIRES', startRow: 3,
        columns: [
          { col: 'A', label: 'Nom réseau', importKey: 'nom', exportKey: 'nom_reseau' },
          { col: 'B', label: 'T° extérieure (°C)', importKey: 'tExt', exportKey: 't_ext_c' },
          { col: 'C', label: 'T° départ (°C)', importKey: 'tDep', exportKey: 't_dep_c' },
          { col: 'D', label: 'Courbe de chauffe', importKey: 'courbe', exportKey: 'courbe_de_chauffe' },
          { col: 'E', label: 'TNC', importKey: 'tnc', exportKey: 'tnc' },
          { col: 'F', label: 'Consigne / programme horaire', importKey: 'programme', exportKey: 'consigne_programme_horaire' },
        ],
      },
    },
    tables: {
      ...TABLES_STANDARD,
      remarques: { ...TABLES_STANDARD.remarques, columns: [['A', 'poste'], ['B', 'prestation'], ['D', 'delai'], ['F', 'estimatif']] },
    },
  },
});

const VMC = Object.freeze({
  id: 'vmc', version: 1, nom: 'VMC', description: 'TRAME VMC', actif: true,
  ui: {
    panels: VMC_PANELS, specialPanels: ['p-equip', 'p-remarques', 'p-photos'],
    tabOrder: ['p-vmc-infos', 'p-vmc-c1', 'p-vmc-c2', 'p-vmc-c3', 'p-vmc-c4', 'p-vmc-c5', 'p-vmc-c6', 'SEP', 'p-equip', 'p-remarques', 'p-photos'],
    labels: {
      'p-vmc-infos': 'Informations', 'p-vmc-c1': 'Caisson 1', 'p-vmc-c2': 'Caisson 2', 'p-vmc-c3': 'Caisson 3',
      'p-vmc-c4': 'Caisson 4', 'p-vmc-c5': 'Caisson 5', 'p-vmc-c6': 'Caisson 6', 'p-equip': 'Équipements',
      'p-remarques': 'Réserves', 'p-photos': 'Photos',
    },
  },
  excel: {
    templateBase64: VMC_TEMPLATE_BASE64, requiredSheets: ['TRAME VMC v2'], mainSheet: 'TRAME VMC v2',
    metadata: { client: 'B1', site: 'B2', type: 'B4', dateVisite: 'B5' },
    signature: { sheet: 'TRAME VMC v2', cells: [{ ref: 'B4', values: ['VMC v2', 'VMC', 'TRAME VMC'] }] },
    fieldMappings: VMC_FIELD_MAPPINGS, tables: TABLES_STANDARD,
  },
});

const PRE_ALLUMAGE = Object.freeze({
  id: 'pre_allumage', version: 1, nom: 'Pré-allumage',
  description: 'Visite technique de préparation au lancement de la saison de chauffe', actif: true,
  ui: {
    panels: PREALLUMAGE_PANELS,
    specialPanels: ['p-equip', 'p-remarques', 'p-photos'],
    tabOrder: ['p-pa-infos', 'p-pa-batiments', 'p-pa-compteurs', 'p-pa-regulation', 'SEP', 'p-pa-chaufferie', 'p-pa-sst', 'p-pa-conclusion', 'SEP', 'p-equip', 'p-remarques', 'p-photos'],
    labels: {
      'p-pa-infos': 'Informations', 'p-pa-batiments': 'Locaux / SST', 'p-pa-compteurs': 'Compteurs',
      'p-pa-regulation': 'Régulation', 'p-pa-chaufferie': 'Chaufferie', 'p-pa-sst': 'Sous-stations',
      'p-pa-conclusion': 'Conclusion', 'p-equip': 'Équipements', 'p-remarques': 'Réserves', 'p-photos': 'Photos',
    },
  },
  excel: {
    templateBase64: PREALLUMAGE_TEMPLATE_BASE64,
    requiredSheets: ['TRAME PRE-ALLUMAGE'], mainSheet: 'TRAME PRE-ALLUMAGE',
    metadata: { client: 'B1', site: 'B2', adresse: 'B3', type: 'B4', dateVisite: 'B5' },
    signature: { sheet: 'TRAME PRE-ALLUMAGE', cells: [{ ref: 'B4', values: ['PRE-ALLUMAGE v1', 'PRE-ALLUMAGE', 'Pré-allumage'] }] },
    fieldMappings: PREALLUMAGE_FIELD_MAPPINGS,
    tables: TABLES_STANDARD,
  },
});

const DEFINITIONS = [ICPE, VMC, PRE_ALLUMAGE];
for (const definition of DEFINITIONS) exigerDefinitionTrameValide(definition);

const REGISTRY = Object.freeze(Object.fromEntries(DEFINITIONS.map((definition) => [definition.id, definition])));

export function listerTramesDisponibles() { return Object.values(REGISTRY).filter((t) => t.actif !== false); }
export function obtenirTrame(trameId = DEFAULT_TRAME_ID) {
  const trame = REGISTRY[trameId] || REGISTRY[DEFAULT_TRAME_ID];
  if (!trame) throw new Error(`Trame inconnue : ${trameId}`);
  return trame;
}

export function detecterTrameDepuisClasseur(wb, lireCellule) {
  const disponibles = listerTramesDisponibles();
  for (const trame of disponibles) {
    const cfg = trame.excel;
    if (!cfg?.requiredSheets?.every((nom) => !!wb.Sheets[nom])) continue;
    const signature = cfg.signature;
    if (!signature) return trame;
    const sheet = wb.Sheets[signature.sheet];
    const ok = (signature.cells || []).every(({ ref, values }) => {
      const valeur = String(lireCellule(sheet, ref) || '').trim().toLowerCase();
      return (values || []).some((v) => String(v).trim().toLowerCase() === valeur);
    });
    if (ok) return trame;
  }
  if (wb.Sheets['TRAME ICPE']) return ICPE;
  if (wb.Sheets['TRAME VMC v2']) return VMC;
  if (wb.Sheets['TRAME PRE-ALLUMAGE']) return PRE_ALLUMAGE;
  return null;
}

export { normaliserSectionCode };

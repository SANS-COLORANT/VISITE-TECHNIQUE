/**
 * Registre générique des trames de visite.
 *
 * Une trame décrit à la fois :
 * - l'interface métier à afficher ;
 * - le modèle Excel à utiliser ;
 * - le mapping import/export des champs et contrôles ;
 * - les blocs répétables et feuilles tabulaires.
 *
 * Pour ajouter une nouvelle trame, on ajoute une définition ici (ou dans un
 * fichier dédié) sans modifier le moteur d'import/export.
 */
import { TEMPLATE_EXCEL_BASE64 } from './templateExcel.js';
import { EXCEL_ROWS, TRAME_DATA } from './data.js';

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
        mappings.push({
          panelId,
          section,
          sectionCode,
          cle: field.cle,
          type: field.type,
          valueCell: `B${row}`,
          commentCell: field.type === 'controle' ? `C${row}` : null,
        });
      }
    }
  }
  return Object.freeze(mappings);
}

const ICPE_FIELD_MAPPINGS = construireMappingsChamps(TRAME_DATA, EXCEL_ROWS);

const ICPE = Object.freeze({
  id: DEFAULT_TRAME_ID,
  version: 1,
  nom: 'ICPE',
  description: 'Trame historique de visite technique ICPE',
  actif: true,
  ui: {
    panels: TRAME_DATA,
  },
  excel: {
    templateBase64: TEMPLATE_EXCEL_BASE64,
    requiredSheets: ['TRAME ICPE'],
    mainSheet: 'TRAME ICPE',
    metadata: {
      client: 'B1',
      site: 'B2',
      adresse: 'B3',
      type: 'B4',
      dateVisite: 'B5',
    },
    signature: {
      sheet: 'TRAME ICPE',
      cells: [{ ref: 'B4', values: ['ICPE'] }],
    },
    fieldMappings: ICPE_FIELD_MAPPINGS,
    networks: {
      mainSheet: 'TRAME ICPE',
      starts: [66, 76, 86, 96, 106, 116],
      importOffsets: {
        tExt: 0,
        tDep: 1,
        nom: 2,
        courbe: 3,
        tnc: 4,
        programme: 5,
      },
      exportOffsets: {
        t_ext_c: 0,
        t_dep_c: 1,
        nom_reseau: 2,
        courbe_de_chauffe: 3,
        tnc: 4,
        consigne_programme_horaire: 5,
      },
      overflowSheet: 'RESEAUX COMPLEMENTAIRES',
    },
    tables: {
      materiel: {
        sheet: 'MATERIEL',
        startRow: 4,
        maxImportRow: 500,
        columns: [
          ['A', 'categorie'], ['B', 'nombre'], ['C', 'designation'], ['D', 'numero'],
          ['E', 'reseau'], ['F', 'marque'], ['G', 'modele'], ['H', 'caracteristiques'],
          ['I', 'annee'], ['J', 'etat'],
        ],
        exportColumns: ['categorie', 'nombre', 'designation', 'numero_materiel', 'reseau_desservi', 'marque', 'modele', 'caracteristiques', 'annee', 'etat'],
      },
      remarques: {
        sheet: 'REMARQUES',
        startRow: 4,
        maxImportRow: 500,
        columns: [['A', 'poste'], ['B', 'prestation'], ['D', 'delai'], ['F', 'estimatif']],
      },
      note: { sheet: 'NOTE', cell: 'A2' },
    },
  },
});

const REGISTRY = Object.freeze({
  [ICPE.id]: ICPE,
});

export function listerTramesDisponibles() {
  return Object.values(REGISTRY).filter((t) => t.actif !== false);
}

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

  // Compatibilité avec les anciens fichiers ICPE où B4 pouvait être vide.
  if (wb.Sheets['TRAME ICPE']) return ICPE;
  return null;
}

export { normaliserSectionCode };

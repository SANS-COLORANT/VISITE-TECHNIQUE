import { EXCEL_ROWS, TRAME_DATA } from '../data.js';
import { createId } from './ids.js';

const TEMPLATE_VERSION = 'ICPE-1';

function normalizeCode(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Construit le référentiel depuis la source unique déjà utilisée par l'UI. */
export function buildReferenceCatalog() {
  const entries = [];
  Object.entries(TRAME_DATA).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([sectionLabel, fields]) => {
      const sectionCode = `${panelId.replace('p-', '')}.${normalizeCode(sectionLabel)}`;
      fields.forEach((field, position) => {
        const code = `${sectionCode}.${normalizeCode(field.cle)}.${position + 1}`;
        entries.push({
          code,
          entityType: field.type === 'controle' ? 'controle' : 'attribut_visite',
          label: field.cle,
          valueType: field.type === 'controle' ? 'avis_commentaire' : 'texte',
          sectionCode,
          excelRow: EXCEL_ROWS[`${sectionLabel}||${field.cle}`] ?? null,
          hasComment: field.type === 'controle',
        });
      });
    });
  });
  return entries;
}

export async function syncReferenceCatalog(db) {
  const entries = buildReferenceCatalog();
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await db.runAsync(
        `INSERT INTO referentiel_champs
          (code, entite_type, libelle, type_valeur, section_code, version_referentiel)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(code) DO UPDATE SET
           entite_type = excluded.entite_type,
           libelle = excluded.libelle,
           type_valeur = excluded.type_valeur,
           section_code = excluded.section_code`,
        [entry.code, entry.entityType, entry.label, entry.valueType, entry.sectionCode]
      );

      if (entry.excelRow) {
        await db.runAsync(
          `INSERT OR IGNORE INTO mapping_excel
            (id, definition_code, feuille, cellule_valeur, cellule_commentaire, version_modele)
           VALUES (?, ?, 'TRAME ICPE', ?, ?, ?)`,
          [
            createId('map'),
            entry.code,
            `B${entry.excelRow}`,
            entry.hasComment ? `C${entry.excelRow}` : null,
            TEMPLATE_VERSION,
          ]
        );
      }
    }
  });
  return entries.length;
}

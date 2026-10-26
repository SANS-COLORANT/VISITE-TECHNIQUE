import { getTrameData } from './trames.js';

export function sectionCodeFor(panelId, section) {
  return panelId.replace('p-', '') + '.' + section.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Overrides belong to a visit; removing a point preserves its saved observations. */
export function getVisitTrameData(trameCode, overrides = []) {
  const result = {};
  for (const [panel, sections] of Object.entries(getTrameData(trameCode))) {
    result[panel] = {};
    for (const [section, fields] of Object.entries(sections)) {
      const changes = overrides.filter((r) => r.panel_id === panel && r.section === section);
      result[panel][section] = fields.filter((f) => !changes.some((r) => r.cle === f.cle && r.masque));
      for (const r of changes) {
        if (!r.masque && !fields.some((f) => f.cle === r.cle)) result[panel][section].push({ cle: r.cle, type: r.type });
      }
    }
  }
  return result;
}

export function validateVisitField(trameCode, field) {
  if (!getTrameData(trameCode)[field.panel_id]?.[field.section]) throw new Error('Section de visite inconnue.');
  const cle = String(field.cle || '').trim();
  if (!cle || cle.length > 150 || cle.includes('||')) throw new Error('Saisir un intitulé de 1 à 150 caractères, sans ||.');
  if (!['champ', 'controle'].includes(field.type)) throw new Error('Type de point inconnu.');
  const original = getTrameData(trameCode)[field.panel_id][field.section].find((f) => f.cle === cle);
  if (original && original.type !== field.type) throw new Error('Le type d’un point du modèle ne peut pas être modifié.');
  return { panel_id: field.panel_id, section: field.section, cle, type: field.type, masque: field.masque ? 1 : 0 };
}

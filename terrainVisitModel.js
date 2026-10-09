export const terrainSectionCode = (panel, section) => panel.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
export function etatPointageEquipement(item) {
  if (!item.deja_reference) return 'nouveaux';
  return item.confirme_le ? 'vus' : 'a-voir';
}
export function lignesLecturePlaque(parsed, current = {}) {
  const labels = { marque: 'Marque', modele: 'Modèle', numero_materiel: 'N° de série', annee: 'Année', caracteristiques: 'Caractéristiques' };
  return Object.entries(labels).map(([key, label]) => ({ key, label, value: String(parsed?.[key] || ''), current: String(current?.[key] || '') }));
}

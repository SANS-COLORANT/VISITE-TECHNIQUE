const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const terrainSectionCode = (panel, section) => panel.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
export const utiliseParcoursTerrain = (trameId) => trameId !== 'pre_allumage';
const SPACES = [
  ['site', 'Site et relevés', 'home'], ['local', 'Local chaufferie', 'home'],
  ['securite', 'Sécurité et secours', 'control'], ['energie', 'Gaz et électricité', 'bolt'],
  ['production', 'Production et distribution', 'flame'], ['eau', 'Eau chaude et traitement', 'water'],
];
export function construireEspacesVisite(panels, trameId, labels = {}) {
  const groups = new Map();
  for (const [panelId, sections] of Object.entries(panels || {})) {
    if (['p-equip', 'p-remarques', 'p-photos'].includes(panelId)) continue;
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (!field?.cle || field.hiddenInApp) continue;
        let id = panelId;
        if (['icpe_v1', 'reseau_chaleur_v1'].includes(trameId)) {
          id = ['p-infos', 'p-releves'].includes(panelId) ? 'site'
            : /incendie|baes|coupure exterieure|extincteur|desenfumage|alarme|detection/.test(norm(section)) ? 'securite'
            : panelId === 'p-conf-local' ? 'local' : panelId === 'p-conf-energie' ? 'energie'
            : ['p-conf-ecs', 'p-conf-adouc'].includes(panelId) ? 'eau' : 'production';
        }
        const definition = SPACES.find(([key]) => key === id);
        if (!groups.has(id)) groups.set(id, { id, label: definition?.[1] || labels[panelId] || section, icon: definition?.[2] || 'note', rows: [] });
        const sectionCode = terrainSectionCode(panelId, section);
        groups.get(id).rows.push({ panelId, section, sectionCode, field, key: `${sectionCode}||${field.cle}` });
      }
    }
  }
  return [...groups.values()];
}
export function etatPointageEquipement(item) {
  if (!item.deja_reference) return 'nouveaux';
  return item.confirme_le ? 'vus' : 'a-voir';
}
export function lignesLecturePlaque(parsed, current = {}) {
  const labels = { marque: 'Marque', modele: 'Modèle', numero_materiel: 'N° de série', annee: 'Année', caracteristiques: 'Caractéristiques' };
  return Object.entries(labels).map(([key, label]) => ({ key, label, value: String(parsed?.[key] || ''), current: String(current?.[key] || '') }));
}

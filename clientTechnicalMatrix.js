import { getDb } from './db.js';

export const MATRIX_CATEGORIES = Object.freeze([
  { key: 'access', label: 'Accessibilité', match: /accès|acces|échelle|echelle|skydome/i },
  { key: 'safety', label: 'Sécurité', match: /garde-corps|ligne de vie|chute|sécur|secur/i },
  { key: 'vmc', label: 'VMC', trames: ['vmc'], match: /caisson|ventilation|vmc/i },
  { key: 'sleeves', label: 'Manchettes', trames: ['vmc'], match: /manchette/i },
  { key: 'boiler', label: 'Chaudière', match: /chaudi|brûleur|bruleur/i },
  { key: 'exchanger', label: 'Échangeur', match: /échangeur|echangeur/i },
  { key: 'pumps', label: 'Pompes', match: /pompe|circulateur/i },
  { key: 'regulation', label: 'Régulation', match: /régulation|regulation|pressostat|télégestion|telegestion/i },
]);

function normAvis(value) { const v = String(value || '').trim().toUpperCase().replace(/\s+/g, ''); return v === 'NS' ? 'N.S' : v; }
function stateFor(stats) { if (!stats.total) return 'none'; if (stats.ns > 0) return stats.maxSeverity >= 4 ? 'red' : 'orange'; if (stats.nr > 0 || stats.nv > 0) return 'unknown'; return stats.s > 0 ? 'green' : 'neutral'; }
function categoryFor(row) { const text = `${row.cle || ''} ${row.commentaire || ''} ${row.reference_libelle || ''} ${row.prestation || ''}`; return MATRIX_CATEGORIES.filter((c) => (!c.trames || c.trames.includes(row.trame_id)) && c.match.test(text)); }

export async function getClientTechnicalMatrix(clientId) {
  const db = await getDb();
  const sites = await db.getAllAsync(`SELECT id,nom_site,adresse FROM sites WHERE client_id=? ORDER BY nom_site COLLATE NOCASE`, [clientId]);
  const visits = await db.getAllAsync(`SELECT v.id,v.site_id,v.trame_id,v.date_visite FROM visites v JOIN sites s ON s.id=v.site_id WHERE s.client_id=? ORDER BY COALESCE(v.date_visite,'') DESC,v.rowid DESC`, [clientId]);
  const latest = new Map(); for (const visit of visits) { const key = `${visit.site_id}||${visit.trame_id || 'default'}`; if (!latest.has(key)) latest.set(key, visit); }
  const rows = [];
  for (const visit of latest.values()) {
    const controls = await db.getAllAsync(`SELECT c.section_code,c.cle,c.avis,c.commentaire,r.id remarque_id,r.prestation,r.reference_libelle,COALESCE(r.criticite,2) criticite FROM controles_visite c LEFT JOIN remarques r ON r.visite_id=c.visite_id AND r.controle_key=(c.section_code || '||' || c.cle) WHERE c.visite_id=?`, [visit.id]);
    for (const control of controls) rows.push({ ...control, ...visit });
  }
  const bySite = sites.map((site) => {
    const cells = {}; for (const category of MATRIX_CATEGORIES) cells[category.key] = { s: 0, ns: 0, nr: 0, nv: 0, so: 0, total: 0, maxSeverity: 0, issues: [], state: 'none' };
    for (const row of rows.filter((r) => r.site_id === site.id)) for (const category of categoryFor(row)) { const cell = cells[category.key]; const avis = normAvis(row.avis); if (!avis) continue; cell.total += 1; if (avis === 'S') cell.s += 1; else if (avis === 'N.S') { cell.ns += 1; cell.maxSeverity = Math.max(cell.maxSeverity, Number(row.criticite || 2)); cell.issues.push(row); } else if (avis === 'N.R') cell.nr += 1; else if (avis === 'N.V') cell.nv += 1; else if (avis === 'S.O') cell.so += 1; }
    for (const cell of Object.values(cells)) cell.state = stateFor(cell); return { ...site, cells };
  });
  return { categories: MATRIX_CATEGORIES, sites: bySite };
}

export async function getMatrixCellPhotos(issue) {
  if (!issue?.id) return [];
  const db = await getDb(); const key = issue.remarque_id ? `remarque||${issue.remarque_id}` : ''; const controlKey = issue.section_code && issue.cle ? `${issue.section_code}||${issue.cle}` : '';
  return db.getAllAsync(`SELECT id,uri,label,entite_key FROM photos WHERE visite_id=? AND entite_key IN (?,?) ORDER BY cree_le,id`, [issue.id, key, controlKey]);
}

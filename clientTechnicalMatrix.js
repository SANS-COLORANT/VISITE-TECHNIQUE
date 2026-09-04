import { getDb } from './db.js';

/**
 * Une ligne technique n'appartient qu'à UNE catégorie. L'ordre est volontaire :
 * on classe d'abord la nature du problème (sécurité, accès, fuite...) puis
 * l'équipement. Cela évite par exemple qu'une absence de garde-corps sur un
 * caisson VMC apparaisse à la fois en Sécurité, Accessibilité et VMC.
 */
export const MATRIX_CATEGORIES = Object.freeze([
  { key: 'safety', label: 'Sécurité', match: /garde[- ]?corps|ligne de vie|risque de chute|\bchute\b|danger immediat|electrocution|incendie|monoxyde|mise en securite|securite/i },
  { key: 'access', label: 'Accessibilité', match: /acces|echelle|skydome|trappe|cheminement|passerelle|escabeau|echelle crinoline/i },
  { key: 'sleeves', label: 'Manchettes', trames: ['vmc'], match: /manchette|raccord souple/i },
  { key: 'leaks', label: 'Fuites · étanchéité', match: /fuite|etancheite|non etanche|suintement|infiltration/i },
  { key: 'electrical', label: 'Électricité', match: /electri|armoire electrique|tableau electrique|disjonct|cablage|cable|connexion electrique/i },
  { key: 'regulation', label: 'Régulation', match: /regulation|pressostat|telegestion|automate|sonde|thermostat|programmation/i },
  { key: 'smoke', label: 'Fumisterie', match: /fumisterie|cheminee|conduit de fumee|evacuation des fumees|carneau|tirage/i },
  { key: 'water', label: 'Traitement d’eau', match: /traitement d.?eau|adoucisseur|adoucissement|pot a boue|degazeur|qualite d.?eau/i },
  { key: 'insulation', label: 'Isolation', match: /isolant|isolation|calorifuge|calorifugeage/i },
  { key: 'maintenance', label: 'Entretien · état', match: /encrass|nettoy|proprete|corrosion|rouille|degrad|use|usure|vibration|fixation|supportage/i },
  { key: 'expansion', label: 'Expansion', match: /vase d.?expansion|expansion|maintien de pression|appoint d.?eau/i },
  { key: 'metering', label: 'Comptage', match: /compteur|comptage|index|energie thermique|calorie/i },
  { key: 'ecs', label: 'ECS', match: /\becs\b|eau chaude sanitaire|bouclage ecs|ballon ecs|preparateur ecs/i },
  { key: 'air_network', label: 'Réseau aéraulique', trames: ['vmc'], match: /gaine|reseau aeraul|aeraulique|bouche|entree d.?air|extraction|rejet/i },
  { key: 'boiler', label: 'Chaudière · brûleur', match: /chaudi|bruleur|bruleur|generateur/i },
  { key: 'exchanger', label: 'Échangeur', match: /echangeur/i },
  { key: 'pumps', label: 'Pompes', match: /pompe|circulateur/i },
  { key: 'vmc', label: 'VMC · caisson', trames: ['vmc'], match: /caisson|ventilation|\bvmc\b|extracteur|tourelle/i },
  { key: 'other', label: 'Autres constats', match: /.*/i },
]);

function texteNormalise(value = '') {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase();
}

export function normAvis(value) {
  const v = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return v === 'NS' ? 'N.S' : v;
}

export function matrixStateFor(stats) {
  if (!stats.total) return 'none';
  if (stats.ns > 0) return stats.maxSeverity >= 4 ? 'red' : 'orange';
  if (stats.nr > 0 || stats.nv > 0) return 'unknown';
  return stats.s > 0 ? 'green' : 'neutral';
}

function categoryFor(row) {
  const text = texteNormalise([
    row.cle,
    row.commentaire,
    row.reference_libelle,
    row.prestation,
    row.poste,
    row.origine,
    ...(row.issues || []).flatMap((issue) => [issue.reference_libelle, issue.prestation, issue.poste, issue.origine]),
  ].filter(Boolean).join(' '));

  for (const category of MATRIX_CATEGORIES) {
    if (category.trames && !category.trames.includes(row.trame_id)) continue;
    if (category.match.test(text)) return category;
  }
  return MATRIX_CATEGORIES[MATRIX_CATEGORIES.length - 1];
}

function emptyCell() {
  return { s: 0, ns: 0, nr: 0, nv: 0, so: 0, total: 0, maxSeverity: 0, issues: [], records: [], state: 'none' };
}

export function buildMatrixCells(records = [], categories = MATRIX_CATEGORIES) {
  const cells = {};
  for (const category of categories) cells[category.key] = emptyCell();
  const issueKeys = new Map(categories.map((category) => [category.key, new Set()]));

  for (const record of records || []) {
    const categoryKey = record.category_key || 'other';
    const cell = cells[categoryKey] || cells.other;
    if (!cell) continue;
    const avis = normAvis(record.avis);
    if (!avis) continue;

    cell.total += 1;
    cell.records.push(record);
    if (avis === 'S') cell.s += 1;
    else if (avis === 'N.S') {
      cell.ns += 1;
      cell.maxSeverity = Math.max(cell.maxSeverity, Number(record.criticite || 2));
      const candidates = record.issues?.length ? record.issues : [record];
      for (const issue of candidates) {
        const key = issue.remarque_id || `${issue.visit_id || issue.id}||${issue.section_code || ''}||${issue.cle || ''}`;
        const seen = issueKeys.get(categoryKey) || issueKeys.get('other');
        if (seen?.has(key)) continue;
        seen?.add(key);
        cell.issues.push({ ...record, ...issue, category_key: categoryKey, category_label: record.category_label });
      }
    } else if (avis === 'N.R') cell.nr += 1;
    else if (avis === 'N.V') cell.nv += 1;
    else if (avis === 'S.O') cell.so += 1;
  }

  for (const cell of Object.values(cells)) cell.state = matrixStateFor(cell);
  return cells;
}

function trameLabel(id) {
  if (id === 'vmc') return 'VMC';
  if (id === 'icpe') return 'ICPE';
  if (id === 'pre_allumage') return 'Pré-allumage';
  return id || 'Autre';
}

function sortRemarks(items = []) {
  return [...items].sort((a, b) => Number(b.criticite || 2) - Number(a.criticite || 2) || String(a.cree_le || '').localeCompare(String(b.cree_le || '')));
}

export async function getClientTechnicalMatrix(clientId) {
  const db = await getDb();
  const sites = await db.getAllAsync(`SELECT id,nom_site,adresse FROM sites WHERE client_id=? ORDER BY nom_site COLLATE NOCASE`, [clientId]);
  const visits = await db.getAllAsync(`SELECT v.id,v.site_id,v.trame_id,v.date_visite FROM visites v JOIN sites s ON s.id=v.site_id WHERE s.client_id=? ORDER BY COALESCE(v.date_visite,'') DESC,v.rowid DESC`, [clientId]);
  const latest = new Map();
  for (const visit of visits) {
    const key = `${visit.site_id}||${visit.trame_id || 'default'}`;
    if (!latest.has(key)) latest.set(key, visit);
  }

  const rows = [];
  for (const visit of latest.values()) {
    const [controls, remarks] = await Promise.all([
      db.getAllAsync(`SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=? ORDER BY section_code,cle`, [visit.id]),
      db.getAllAsync(`SELECT id remarque_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle,COALESCE(criticite,2) criticite,COALESCE(criticite_defaut,2) criticite_defaut,COALESCE(criticite_modifiee,0) criticite_modifiee,cree_le FROM remarques WHERE visite_id=? ORDER BY criticite DESC,cree_le,id`, [visit.id]),
    ]);

    const byControl = new Map();
    for (const remark of remarks || []) {
      const key = String(remark.controle_key || '').trim();
      if (!key) continue;
      if (!byControl.has(key)) byControl.set(key, []);
      byControl.get(key).push(remark);
    }
    const usedRemarkIds = new Set();

    for (const control of controls || []) {
      const controlKey = `${control.section_code}||${control.cle}`;
      const linked = sortRemarks(byControl.get(controlKey) || []);
      linked.forEach((remark) => usedRemarkIds.add(remark.remarque_id));
      const dominant = linked[0] || null;
      const issues = linked.map((remark) => ({
        ...remark,
        id: visit.id,
        visit_id: visit.id,
        site_id: visit.site_id,
        trame_id: visit.trame_id,
        date_visite: visit.date_visite,
        section_code: control.section_code,
        cle: control.cle,
        avis: control.avis,
        commentaire: control.commentaire,
      }));
      const row = {
        ...visit,
        visit_id: visit.id,
        ...control,
        remarque_id: dominant?.remarque_id || null,
        poste: dominant?.poste || null,
        prestation: dominant?.prestation || null,
        delai: dominant?.delai ?? null,
        estimatif: dominant?.estimatif ?? null,
        origine: dominant?.origine || null,
        reference_libelle: dominant?.reference_libelle || null,
        criticite: Number(dominant?.criticite ?? 2),
        criticite_defaut: Number(dominant?.criticite_defaut ?? 2),
        criticite_modifiee: Number(dominant?.criticite_modifiee ?? 0),
        issues,
      };
      const category = categoryFor(row);
      rows.push({ ...row, category_key: category.key, category_label: category.label, trame_label: trameLabel(visit.trame_id) });
    }

    // Les remarques manuelles/orphelines doivent aussi apparaître, une seule fois.
    for (const remark of remarks || []) {
      if (usedRemarkIds.has(remark.remarque_id)) continue;
      const row = {
        ...visit,
        visit_id: visit.id,
        section_code: 'remarque',
        cle: remark.reference_libelle || remark.poste || 'Remarque',
        avis: 'N.S',
        commentaire: '',
        ...remark,
        criticite: Number(remark.criticite ?? 2),
        criticite_defaut: Number(remark.criticite_defaut ?? 2),
        criticite_modifiee: Number(remark.criticite_modifiee ?? 0),
        issues: [{ ...remark, id: visit.id, visit_id: visit.id, site_id: visit.site_id, trame_id: visit.trame_id, date_visite: visit.date_visite, section_code: 'remarque', cle: remark.reference_libelle || remark.poste || 'Remarque', avis: 'N.S' }],
      };
      const category = categoryFor(row);
      rows.push({ ...row, category_key: category.key, category_label: category.label, trame_label: trameLabel(visit.trame_id) });
    }
  }

  const usedCategories = new Set(rows.map((row) => row.category_key));
  const categories = MATRIX_CATEGORIES.filter((category) => usedCategories.has(category.key));
  if (!categories.length) categories.push(MATRIX_CATEGORIES[MATRIX_CATEGORIES.length - 1]);

  const bySite = sites.map((site) => {
    const records = rows.filter((row) => row.site_id === site.id);
    return { ...site, records, cells: buildMatrixCells(records, categories) };
  });

  const trameIds = [...new Set(rows.map((row) => row.trame_id).filter(Boolean))];
  return {
    categories,
    sites: bySite,
    trames: trameIds.map((id) => ({ id, label: trameLabel(id) })),
  };
}

export async function getMatrixCellPhotos(issue) {
  const visiteId = issue?.visit_id || issue?.id;
  if (!visiteId) return [];
  const db = await getDb();
  const key = issue.remarque_id ? `remarque||${issue.remarque_id}` : '';
  const controlKey = issue.section_code && issue.cle && issue.section_code !== 'remarque' ? `${issue.section_code}||${issue.cle}` : '';
  return db.getAllAsync(`SELECT id,uri,label,entite_key FROM photos WHERE visite_id=? AND entite_key IN (?,?) ORDER BY cree_le,id`, [visiteId, key, controlKey]);
}

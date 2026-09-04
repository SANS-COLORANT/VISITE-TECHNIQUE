import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { dossierExportsClientMetra, creerFichierSaf, nettoyerSegment } from './metraStorage.js';
import { getMatrixCellPhotos, normAvis } from './clientTechnicalMatrix.js';
import { reserveSeverityLabel } from './reserveSeverity.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const PILOTAGE_EXPORT_COLUMNS = Object.freeze([
  { key: 'site', label: 'Site' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'groupes', label: 'Groupe(s)' },
  { key: 'metier', label: 'Métier' },
  { key: 'date', label: 'Date visite' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'section', label: 'Section' },
  { key: 'point', label: 'Point contrôlé' },
  { key: 'avis', label: 'Avis' },
  { key: 'criticite', label: 'Criticité' },
  { key: 'criticite_libelle', label: 'Niveau criticité' },
  { key: 'constat', label: 'Constat / réserve' },
  { key: 'precision', label: 'Précision terrain' },
  { key: 'origine', label: 'Origine' },
  { key: 'delai', label: 'Délai' },
  { key: 'estimatif', label: 'Estimatif' },
  { key: 'photos', label: 'Photo(s)' },
  { key: 'action', label: 'Action à réaliser' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'entreprise', label: 'Entreprise' },
  { key: 'priorite', label: 'Priorité' },
  { key: 'echeance', label: 'Échéance' },
  { key: 'statut_traitement', label: 'Statut traitement' },
  { key: 'date_traitement', label: 'Date de traitement' },
  { key: 'suivi', label: 'Commentaire de suivi' },
]);

export const PILOTAGE_EXPORT_PRESETS = Object.freeze({
  reserves: {
    label: 'Réserves à traiter',
    statuses: ['N.S'],
    columns: ['site', 'adresse', 'groupes', 'metier', 'date', 'categorie', 'point', 'avis', 'criticite', 'criticite_libelle', 'constat', 'precision', 'photos', 'action', 'responsable', 'entreprise', 'priorite', 'echeance', 'statut_traitement', 'date_traitement', 'suivi'],
  },
  ns: {
    label: 'N.S uniquement',
    statuses: ['N.S'],
    columns: ['site', 'metier', 'date', 'categorie', 'section', 'point', 'avis', 'criticite', 'criticite_libelle', 'constat', 'precision', 'origine'],
  },
  non_releves: {
    label: 'Points non relevés',
    statuses: ['N.R', 'N.V'],
    columns: ['site', 'adresse', 'metier', 'date', 'categorie', 'section', 'point', 'avis', 'precision'],
  },
  photos: {
    label: 'Photos et réserves',
    statuses: ['N.S'],
    columns: ['site', 'metier', 'date', 'categorie', 'point', 'criticite', 'constat', 'precision', 'photos'],
  },
  suivi: {
    label: 'Suivi traitement',
    statuses: ['N.S'],
    columns: ['site', 'adresse', 'groupes', 'metier', 'categorie', 'point', 'criticite', 'criticite_libelle', 'constat', 'action', 'responsable', 'entreprise', 'priorite', 'echeance', 'statut_traitement', 'date_traitement', 'suivi'],
  },
});

export const PILOTAGE_DEFAULT_COLUMNS = Object.freeze(PILOTAGE_EXPORT_PRESETS.reserves.columns);

function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function text(value) { return String(value ?? '').trim(); }
function dateIso(value) { return text(value).slice(0, 10); }

async function photoLabels(record) {
  const issues = record.issues?.length ? record.issues : [record];
  const values = [];
  for (const issue of issues) {
    try {
      const photos = await getMatrixCellPhotos(issue);
      for (const p of photos || []) values.push(text(p.label) || text(p.uri));
    } catch {}
  }
  return unique(values).join(' | ');
}

function valeur(record, key, context, photos = '') {
  const avis = normAvis(record.avis);
  if (key === 'site') return context.siteNames?.get(record.site_id) || record.nom_site || '';
  if (key === 'adresse') return context.siteAddresses?.get(record.site_id) || record.adresse || '';
  if (key === 'groupes') return (context.siteGroups?.get(record.site_id) || []).join(', ');
  if (key === 'metier') return record.trame_label || record.trame_id || '';
  if (key === 'date') return dateIso(record.date_visite);
  if (key === 'categorie') return record.category_label || '';
  if (key === 'section') return record.section_code === 'remarque' ? 'Remarque libre' : record.section_code || '';
  if (key === 'point') return record.reference_libelle || record.cle || '';
  if (key === 'avis') return avis;
  if (key === 'criticite') return avis === 'N.S' ? Number(record.criticite ?? 2) : '';
  if (key === 'criticite_libelle') return avis === 'N.S' ? reserveSeverityLabel(record.criticite) : '';
  if (key === 'constat') return record.prestation || record.commentaire || '';
  if (key === 'precision') return record.prestation && record.commentaire && text(record.prestation) !== text(record.commentaire) ? record.commentaire : '';
  if (key === 'origine') return record.origine || '';
  if (key === 'delai') return record.delai ?? '';
  if (key === 'estimatif') return record.estimatif ?? '';
  if (key === 'photos') return photos;
  return '';
}

function filterPreset(records = [], statuses = []) {
  if (!statuses?.length) return records;
  const set = new Set(statuses.map(normAvis));
  return records.filter((r) => set.has(normAvis(r.avis)));
}

function buildSummary(records, context, viewLabel) {
  const statuses = { S: 0, 'N.S': 0, 'N.R': 0, 'S.O': 0, 'N.V': 0 };
  let prioritaires = 0;
  const byCategory = new Map();
  for (const record of records) {
    const avis = normAvis(record.avis);
    if (Object.prototype.hasOwnProperty.call(statuses, avis)) statuses[avis] += 1;
    if (avis === 'N.S' && Number(record.criticite || 0) >= 4) prioritaires += 1;
    const key = record.category_label || 'Autres constats';
    if (!byCategory.has(key)) byCategory.set(key, { categorie: key, S: 0, NS: 0, NR: 0, SO: 0, NV: 0, total: 0 });
    const row = byCategory.get(key);
    row.total += 1;
    if (avis === 'S') row.S += 1;
    else if (avis === 'N.S') row.NS += 1;
    else if (avis === 'N.R') row.NR += 1;
    else if (avis === 'S.O') row.SO += 1;
    else if (avis === 'N.V') row.NV += 1;
  }
  const top = [
    ['Pilotage METRA', context.clientNom || 'Client'],
    ['Vue exportée', viewLabel || 'Vue courante'],
    ['Généré le', new Date().toLocaleString('fr-FR')],
    ['Lignes', records.length],
    ['Satisfaisants', statuses.S],
    ['Non satisfaisants', statuses['N.S']],
    ['N.R', statuses['N.R']],
    ['S.O', statuses['S.O']],
    ['N.V', statuses['N.V']],
    ['Criticité 4–5', prioritaires],
    [],
    ['Catégorie', 'S', 'N.S', 'N.R', 'S.O', 'N.V', 'Total'],
  ];
  return top.concat([...byCategory.values()].sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr')).map((r) => [r.categorie, r.S, r.NS, r.NR, r.SO, r.NV, r.total]));
}

export async function exporterPilotageExcel({
  clientNom,
  records = [],
  siteNames = new Map(),
  siteAddresses = new Map(),
  siteGroups = new Map(),
  columns = PILOTAGE_DEFAULT_COLUMNS,
  presetStatuses = [],
  viewLabel = 'Vue courante',
  partager = true,
} = {}) {
  const selectedColumns = PILOTAGE_EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  if (!selectedColumns.length) throw new Error('Sélectionnez au moins une colonne à exporter.');
  const exportedRecords = filterPreset(records, presetStatuses);
  if (!exportedRecords.length) throw new Error('Aucune ligne ne correspond à cette extraction.');

  const context = { clientNom, siteNames, siteAddresses, siteGroups };
  const needPhotos = selectedColumns.some((c) => c.key === 'photos');
  const detailRows = [];
  for (const record of exportedRecords) {
    const photos = needPhotos ? await photoLabels(record) : '';
    const row = {};
    for (const column of selectedColumns) row[column.label] = valeur(record, column.key, context, photos);
    detailRows.push(row);
  }

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(buildSummary(exportedRecords, context, viewLabel));
  const wsDetail = XLSX.utils.json_to_sheet(detailRows, { header: selectedColumns.map((c) => c.label) });
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  wsDetail['!cols'] = selectedColumns.map((c) => ({ wch: ['constat', 'precision', 'suivi', 'action'].includes(c.key) ? 42 : ['site', 'adresse', 'point', 'photos'].includes(c.key) ? 28 : 16 }));
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Synthèse');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Détail');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const nomFichier = `Pilotage_${nettoyerSegment(clientNom || 'Client')}_${stamp}.xlsx`;
  const dossier = await dossierExportsClientMetra(clientNom || 'Client');
  if (!dossier) throw new Error("Le dossier d'exports METRA n'est pas disponible.");
  const uri = await creerFichierSaf(dossier, nomFichier, XLSX_MIME, base64);

  let partageLance = false;
  if (partager) {
    try {
      const disponible = await Sharing.isAvailableAsync();
      if (disponible) {
        const tmp = `${FileSystem.cacheDirectory}${nomFichier}`;
        await FileSystem.writeAsStringAsync(tmp, base64, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(tmp, { mimeType: XLSX_MIME, dialogTitle: 'Partager l’extraction METRA' });
        partageLance = true;
      }
    } catch {}
  }
  return { uri, nomFichier, lignes: exportedRecords.length, partageLance };
}

import * as FileSystem from 'expo-file-system';
import { getVisite, getChampsVisite, getControlesVisite, listerCompteurs, listerMateriel, listerPhotos, listerReseaux } from './db.js';
import { openAppDatabase } from './database/index.js';
import { listerRemarquesVisite } from './remarkDb.js';
import { TRAME_DATA } from './data.js';
import { ajouterPhoto } from './db.js';
import { preparerPhotoNommee } from './PhotoButton.js';

const MODULES = Object.freeze([
  { id: 'equipment', label: 'Équipements', icon: 'tools' },
  { id: 'meters', label: 'Compteurs', icon: 'meter' },
  { id: 'temperatures', label: 'Températures', icon: 'temperature' },
  { id: 'locals', label: 'Locaux', icon: 'local' },
  { id: 'distribution', label: 'Distribution', icon: 'distribution' },
  { id: 'regulation', label: 'Régulation', icon: 'regulation' },
  { id: 'remarks', label: 'Remarques', icon: 'remark' },
  { id: 'controls', label: 'Contrôles', icon: 'control' },
  { id: 'photos', label: 'Photos', icon: 'photo' },
]);

const clean = (v) => String(v == null ? '' : v).trim();
const norm = (v) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function uniqueTargets(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.targetKey || item?.id || item?.label || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function target(id, label, targetKey, extra = {}) {
  return { id: String(id || targetKey || label), label: clean(label) || 'Élément', targetKey: targetKey || null, ...extra };
}

async function buildCompanionVisitSnapshot(visiteId) {
  const db = await openAppDatabase();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const [equipements, compteurs, reseaux, remarques, photos, champs, controles, installations] = await Promise.all([
    listerMateriel(visiteId),
    listerCompteurs(visiteId),
    listerReseaux(visiteId),
    listerRemarquesVisite(visiteId),
    listerPhotos(visiteId),
    getChampsVisite(visiteId),
    getControlesVisite(visiteId),
    db.getAllAsync(`SELECT id,nom,type_code FROM installations WHERE site_id=? AND actif=1 ORDER BY nom`, [visite.site_id]),
  ]);

  const equipTargets = uniqueTargets((equipements || []).map((e) => target(
    e.equipement_id || e.id,
    [e.designation || e.categorie || 'Équipement', e.marque, e.modele].filter(Boolean).join(' · '),
    e.equipement_id ? `equipement||${e.equipement_id}` : `materiel||${e.id}`,
    { subtitle: clean(e.reseau_desservi) }
  )));

  const meterTargets = uniqueTargets((compteurs || []).map((c) => target(
    c.compteur_site_id || c.id,
    c.label || 'Compteur',
    c.compteur_site_id ? `compteur_site||${c.compteur_site_id}` : `compteur||${c.id}`,
    { value: clean(c.valeur), unit: clean(c.unite) }
  )));

  const networkTargets = uniqueTargets((reseaux || []).map((r) => target(
    r.reseau_site_id || r.id,
    r.nom_reseau || 'Réseau',
    r.reseau_site_id ? `reseau_site||${r.reseau_site_id}` : `reseau||${r.id}`
  )));

  const remarkTargets = uniqueTargets((remarques || []).map((r) => target(
    r.id,
    r.reference_libelle || r.prestation || r.poste || 'Remarque',
    `remarque||${r.id}`,
    { subtitle: clean(r.poste), severity: Number(r.criticite || 0) }
  )));

  const localTargets = uniqueTargets((installations || []).map((i) => target(
    i.id,
    i.nom || i.type_code || 'Local technique',
    `installation||${i.id}`,
    { subtitle: clean(i.type_code) }
  )));

  const tempFromDb = (champs || []).filter((row) => {
    const txt = norm(`${row.section_code} ${row.cle}`);
    return txt.includes('temp') || txt.includes('ph');
  }).map((row) => target(
    `${row.section_code}||${row.cle}`,
    row.cle,
    `${row.section_code}||${row.cle}`,
    { value: clean(row.valeur) }
  ));

  const tempTemplate = ((TRAME_DATA?.['p-releves'] || {})['Températures et pH'] || []).map((field) => target(
    `releves.temperatures||${field.cle}`,
    field.cle,
    `releves.temperatures||${field.cle}`
  ));
  const temperatureTargets = uniqueTargets([...tempFromDb, ...tempTemplate]);

  const regulationTargets = uniqueTargets((champs || []).filter((row) => {
    const txt = norm(`${row.section_code} ${row.cle}`);
    return txt.includes('regul') || txt.includes('consigne') || txt.includes('sonde') || txt.includes('automate');
  }).map((row) => target(
    `${row.section_code}||${row.cle}`,
    row.cle,
    `${row.section_code}||${row.cle}`,
    { value: clean(row.valeur) }
  )));

  const controlTargets = uniqueTargets((controles || []).map((c) => target(
    `${c.section_code}||${c.cle}`,
    c.cle,
    `${c.section_code}||${c.cle}`,
    { value: clean(c.avis), subtitle: clean(c.commentaire) }
  )));

  const modules = MODULES.map((module) => {
    let targets = [];
    if (module.id === 'equipment') targets = equipTargets;
    else if (module.id === 'meters') targets = meterTargets;
    else if (module.id === 'temperatures') targets = temperatureTargets;
    else if (module.id === 'locals') targets = localTargets;
    else if (module.id === 'distribution') targets = networkTargets;
    else if (module.id === 'regulation') targets = regulationTargets;
    else if (module.id === 'remarks') targets = remarkTargets;
    else if (module.id === 'controls') targets = controlTargets;
    return {
      ...module,
      count: module.id === 'photos' ? (photos || []).length : targets.length,
      targets,
    };
  });

  return {
    version: 1,
    type: 'visitSnapshot',
    visit: {
      id: visite.id,
      siteId: visite.site_id,
      installationId: visite.installation_id || null,
      client: clean(visite.nom_client),
      site: clean(visite.nom_site),
      date: clean(visite.date_visite),
      template: clean(visite.trame_id || 'icpe_v1'),
    },
    modules,
    generatedAt: new Date().toISOString(),
  };
}

async function importCompanionPhoto({ visiteId, uri, meta = {} }) {
  if (!visiteId || !uri) throw new Error('Photo compagnon incomplète');
  const db = await openAppDatabase();
  const transferId = clean(meta?.transferId);
  if (transferId) {
    const existing = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [`companion_transfer_${transferId}`]);
    if (existing?.value) {
      const photo = await db.getFirstAsync(`SELECT * FROM photos WHERE id=? LIMIT 1`, [existing.value]);
      if (String(uri).startsWith(FileSystem.cacheDirectory || '')) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (photo?.id) return { id: photo.id, uri: photo.uri, entiteKey: photo.entite_key, label: clean(photo.label).split('||')[0] || clean(meta?.label) || 'Photo téléphone', duplicate: true };
    }
  }

  const entiteKey = meta?.targetKey || null;
  const label = clean(meta?.label) || 'Photo téléphone';
  const prepared = await preparerPhotoNommee({ visiteId, entiteKey, label, uri });
  if (!prepared?.uri) throw new Error('Impossible de préparer la photo reçue');
  const labelDb = prepared.nom ? `${prepared.label || label}||${prepared.nom}` : (prepared.label || label);
  const photoId = await ajouterPhoto(visiteId, prepared.entiteKey || entiteKey, prepared.uri, labelDb);
  if (transferId) {
    await db.runAsync(
      `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [`companion_transfer_${transferId}`, photoId]
    );
  }
  if (String(uri).startsWith(FileSystem.cacheDirectory || '')) {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
  return { id: photoId, uri: prepared.uri, entiteKey: prepared.entiteKey || entiteKey, label: prepared.label || label };
}

export { MODULES as COMPANION_MODULES, buildCompanionVisitSnapshot, importCompanionPhoto };

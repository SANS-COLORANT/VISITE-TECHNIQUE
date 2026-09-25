import * as FileSystem from 'expo-file-system';
import { getVisite, getChampsVisite, getControlesVisite, listerCompteurs, listerMateriel, listerPhotos, listerReseaux, listerSitesClient, toucherVisite, upsertChamp, upsertCompteurChamp, upsertMaterielChamp, upsertReseauChamp } from './db.js';
import { openAppDatabase } from './database/index.js';
import { listerRemarquesVisite, modifierRemarqueVisite } from './remarkDb.js';
import { upsertControlePartiel } from './controlDb.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { ajouterPhoto } from './db.js';
import { preparerPhotoNommee } from './PhotoButton.js';
import { confirmerPhotoJournalisee, journaliserPhotoEnAttente } from './photoPersistenceJournal.js';

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

function companionField(id, label, value, edit, extra = {}) {
  return {
    id: String(id),
    label: clean(label) || 'Valeur',
    value: value == null ? '' : String(value),
    input: extra.input || 'text',
    unit: clean(extra.unit),
    multiline: Boolean(extra.multiline),
    options: Array.isArray(extra.options) ? extra.options.map(String) : null,
    edit,
  };
}

function inferInput(label) {
  const txt = norm(label);
  return /(temperature|t°|ph|pression|index|puissance|debit|débit|volume|annee|année|nombre|\bnb\b)/.test(txt)
    ? 'numeric'
    : 'text';
}

function champEditField(sectionCode, cle, value, extra = {}) {
  return companionField(
    `${sectionCode}||${cle}`,
    cle,
    value,
    { kind: 'champ', sectionCode, cle },
    { input: extra.input || inferInput(cle), unit: extra.unit || '' }
  );
}


async function buildCompanionClientSnapshot(clientId) {
  const db = await openAppDatabase();
  const id = clean(clientId);
  if (!id) throw new Error('Client compagnon invalide');

  const [client, sites, installations, visites] = await Promise.all([
    db.getFirstAsync('SELECT id,nom,code_exploitant,adresse FROM clients WHERE id=? LIMIT 1', [id]),
    listerSitesClient(id),
    db.getAllAsync(
      `SELECT i.id,i.site_id,i.nom,i.type_code
         FROM installations i
         JOIN sites s ON s.id=i.site_id
        WHERE s.client_id=? AND i.actif=1
        ORDER BY s.nom_site COLLATE NOCASE,i.nom COLLATE NOCASE`,
      [id]
    ),
    db.getAllAsync(
      `SELECT v.id,v.site_id,v.installation_id,v.date_visite,v.statut,v.trame_id,v.progression_pct,v.modifie_le
         FROM visites v
         JOIN sites s ON s.id=v.site_id
        WHERE s.client_id=?
        ORDER BY CASE WHEN v.statut='en_cours' THEN 0 ELSE 1 END,
                 COALESCE(v.modifie_le,v.date_visite,'') DESC`,
      [id]
    ),
  ]);

  if (!client?.id) throw new Error('Client introuvable');

  const localBySite = new Map();
  for (const local of installations || []) {
    const siteId = String(local.site_id || '');
    if (!localBySite.has(siteId)) localBySite.set(siteId, []);
    localBySite.get(siteId).push({
      id: String(local.id),
      name: clean(local.nom) || clean(local.type_code) || 'Local technique',
      type: clean(local.type_code),
    });
  }

  const visitsBySite = new Map();
  for (const visite of visites || []) {
    const siteId = String(visite.site_id || '');
    if (!visitsBySite.has(siteId)) visitsBySite.set(siteId, []);
    visitsBySite.get(siteId).push({
      id: String(visite.id),
      installationId: visite.installation_id ? String(visite.installation_id) : null,
      date: clean(visite.date_visite),
      status: clean(visite.statut),
      template: clean(visite.trame_id || 'icpe_v1'),
      progress: Number(visite.progression_pct || 0),
    });
  }

  const resultSites = (sites || []).map((site) => {
    const siteId = String(site.id || '');
    const locals = localBySite.get(siteId) || [];
    const localNameById = new Map(locals.map((local) => [String(local.id), local.name]));
    const siteVisits = (visitsBySite.get(siteId) || []).map((visite) => ({
      ...visite,
      local: visite.installationId ? (localNameById.get(String(visite.installationId)) || 'Local technique') : 'Visite site',
    }));
    return {
      id: siteId,
      name: clean(site.nom_site) || 'Site',
      address: clean(site.adresse),
      locals,
      visits: siteVisits,
      visitCount: siteVisits.length,
      activeVisitCount: siteVisits.filter((visite) => visite.status === 'en_cours').length,
    };
  });

  return {
    version: 2,
    type: 'clientSnapshot',
    scope: 'client',
    client: {
      id: String(client.id),
      name: clean(client.nom) || 'Client',
      code: clean(client.code_exploitant),
      address: clean(client.adresse),
    },
    sites: resultSites,
    counts: {
      sites: resultSites.length,
      locals: resultSites.reduce((sum, site) => sum + site.locals.length, 0),
      visits: resultSites.reduce((sum, site) => sum + site.visits.length, 0),
      activeVisits: resultSites.reduce((sum, site) => sum + site.activeVisitCount, 0),
    },
    generatedAt: new Date().toISOString(),
  };
}

async function assertVisitBelongsToCompanionClient(clientId, visiteId) {
  const db = await openAppDatabase();
  const row = await db.getFirstAsync(
    `SELECT v.id
       FROM visites v
       JOIN sites s ON s.id=v.site_id
      WHERE v.id=? AND s.client_id=?
      LIMIT 1`,
    [String(visiteId || ''), String(clientId || '')]
  );
  if (!row?.id) throw new Error('Cette visite ne fait pas partie du client associé au QR code.');
  return true;
}

async function buildCompanionVisitSnapshot(visiteId) {
  const db = await openAppDatabase();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
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
    {
      subtitle: clean(e.reseau_desservi),
      fields: [
        companionField('designation', 'Désignation', e.designation, { kind: 'equipment', id: e.id, key: 'designation' }),
        companionField('marque', 'Marque', e.marque, { kind: 'equipment', id: e.id, key: 'marque' }),
        companionField('modele', 'Modèle / référence', e.modele, { kind: 'equipment', id: e.id, key: 'modele' }),
        companionField('nombre', 'Nombre', e.nombre, { kind: 'equipment', id: e.id, key: 'nombre' }, { input: 'numeric' }),
        companionField('annee', 'Année', e.annee, { kind: 'equipment', id: e.id, key: 'annee' }, { input: 'numeric' }),
        companionField('numero_materiel', 'N° matériel', e.numero_materiel, { kind: 'equipment', id: e.id, key: 'numero_materiel' }),
        companionField('reseau_desservi', 'Réseau desservi', e.reseau_desservi, { kind: 'equipment', id: e.id, key: 'reseau_desservi' }),
        companionField('caracteristiques', 'Caractéristiques', e.caracteristiques, { kind: 'equipment', id: e.id, key: 'caracteristiques' }, { multiline: true }),
      ],
    }
  )));

  const meterTargets = uniqueTargets((compteurs || []).map((c) => target(
    c.compteur_site_id || c.id,
    c.label || 'Compteur',
    c.compteur_site_id ? `compteur_site||${c.compteur_site_id}` : `compteur||${c.id}`,
    {
      value: clean(c.valeur),
      unit: clean(c.unite),
      fields: [
        companionField('valeur', 'Valeur relevée', c.valeur, { kind: 'counter', id: c.id, key: 'valeur' }, { input: 'numeric', unit: c.unite }),
        companionField('label', 'Nom du compteur', c.label, { kind: 'counter', id: c.id, key: 'label' }),
        companionField('unite', 'Unité', c.unite, { kind: 'counter', id: c.id, key: 'unite' }),
      ],
    }
  )));

  const networkTargets = uniqueTargets((reseaux || []).map((r) => target(
    r.reseau_site_id || r.id,
    r.nom_reseau || 'Réseau',
    r.reseau_site_id ? `reseau_site||${r.reseau_site_id}` : `reseau||${r.id}`,
    {
      fields: [
        companionField('nom_reseau', 'Nom du réseau', r.nom_reseau, { kind: 'network', id: r.id, key: 'nom_reseau' }),
      ],
    }
  )));

  const remarkTargets = uniqueTargets((remarques || []).map((r) => target(
    r.id,
    r.reference_libelle || r.prestation || r.poste || 'Remarque',
    `remarque||${r.id}`,
    {
      subtitle: clean(r.poste),
      severity: Number(r.criticite || 0),
      fields: [
        companionField('prestation', 'Observation / prestation', r.prestation, { kind: 'remark', id: r.id, key: 'prestation' }, { multiline: true }),
        companionField('poste', 'Poste', r.poste, { kind: 'remark', id: r.id, key: 'poste' }),
        companionField('criticite', 'Criticité', r.criticite, { kind: 'remark', id: r.id, key: 'criticite' }, { options: ['1', '2', '3', '4', '5'] }),
      ],
    }
  )));

  const localTargets = uniqueTargets((installations || []).map((i) => target(
    i.id,
    i.nom || i.type_code || 'Local technique',
    `installation||${i.id}`,
    { subtitle: clean(i.type_code) }
  )));

  const codeSection = (panelId, section) => panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const templateRows = Object.entries(trame?.ui?.panels || {}).flatMap(([panelId, sections]) =>
    Object.entries(sections || {}).flatMap(([section, fields]) =>
      (fields || []).filter((field) => field?.hiddenInApp !== true).map((field) => ({
        panelId,
        section,
        sectionCode: codeSection(panelId, section),
        field,
      }))
    )
  );

  const valuesByKey = new Map((champs || []).map((row) => [`${row.section_code}||${row.cle}`, row.valeur]));
  const controlsByKey = new Map((controles || []).map((row) => [`${row.section_code}||${row.cle}`, row]));

  const tempFromDb = (champs || []).filter((row) => {
    const txt = norm(`${row.section_code} ${row.cle}`);
    return txt.includes('temp') || txt.includes('ph');
  }).map((row) => target(
    `${row.section_code}||${row.cle}`,
    row.cle,
    `${row.section_code}||${row.cle}`,
    { value: clean(row.valeur), fields: [champEditField(row.section_code, row.cle, row.valeur)] }
  ));
  const tempFromTemplate = templateRows.filter(({ section, field }) => {
    const txt = norm(`${section} ${field?.cle}`);
    return field?.type === 'champ' && (txt.includes('temp') || txt.includes('ph'));
  }).map(({ sectionCode, field }) => {
    const key = `${sectionCode}||${field.cle}`;
    return target(key, field.cle, key, { value: clean(valuesByKey.get(key)), fields: [champEditField(sectionCode, field.cle, valuesByKey.get(key))] });
  });
  const temperatureTargets = uniqueTargets([...tempFromDb, ...tempFromTemplate]);

  const regulationFromDb = (champs || []).filter((row) => {
    const txt = norm(`${row.section_code} ${row.cle}`);
    return txt.includes('regul') || txt.includes('consigne') || txt.includes('sonde') || txt.includes('automate');
  }).map((row) => target(
    `${row.section_code}||${row.cle}`,
    row.cle,
    `${row.section_code}||${row.cle}`,
    { value: clean(row.valeur) }
  ));
  const regulationFromTemplate = templateRows.filter(({ section, field }) => {
    const txt = norm(`${section} ${field?.cle}`);
    return field?.type === 'champ' && (txt.includes('regul') || txt.includes('consigne') || txt.includes('sonde') || txt.includes('automate'));
  }).map(({ sectionCode, field }) => {
    const key = `${sectionCode}||${field.cle}`;
    return target(key, field.cle, key, { value: clean(valuesByKey.get(key)) });
  });
  const regulationTargets = uniqueTargets([...regulationFromDb, ...regulationFromTemplate]);

  const controlTargets = uniqueTargets([
    ...(controles || []).map((control) => target(
      `${control.section_code}||${control.cle}`,
      control.cle,
      `${control.section_code}||${control.cle}`,
      {
        value: clean(control.avis),
        subtitle: clean(control.commentaire),
        fields: [
          companionField('avis', 'Avis', control.avis, { kind: 'control', sectionCode: control.section_code, cle: control.cle, key: 'avis' }, { options: ['S', 'N.S', 'N.R', 'S.O', 'N.V'] }),
          companionField('commentaire', 'Commentaire', control.commentaire, { kind: 'control', sectionCode: control.section_code, cle: control.cle, key: 'commentaire' }, { multiline: true }),
        ],
      }
    )),
    ...templateRows.filter(({ field }) => field?.type !== 'champ').map(({ sectionCode, field }) => {
      const key = `${sectionCode}||${field.cle}`;
      const current = controlsByKey.get(key);
      return target(key, field.cle, key, {
        value: clean(current?.avis),
        subtitle: clean(current?.commentaire),
        fields: [
          companionField('avis', 'Avis', current?.avis, { kind: 'control', sectionCode, cle: field.cle, key: 'avis' }, { options: ['S', 'N.S', 'N.R', 'S.O', 'N.V'] }),
          companionField('commentaire', 'Commentaire', current?.commentaire, { kind: 'control', sectionCode, cle: field.cle, key: 'commentaire' }, { multiline: true }),
        ],
      });
    }),
  ]);

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

async function assertRowBelongsToVisit(table, id, visiteId) {
  const allowed = new Set(['compteurs', 'materiel', 'reseaux', 'remarques']);
  if (!allowed.has(table)) throw new Error('Cible Compagnon non autorisée');
  const db = await openAppDatabase();
  const row = await db.getFirstAsync(`SELECT id FROM ${table} WHERE id=? AND visite_id=? LIMIT 1`, [String(id || ''), String(visiteId || '')]);
  if (!row?.id) throw new Error('Cet élément ne fait pas partie de la visite ouverte.');
}

async function applyCompanionTargetUpdate({ visiteId, edit, value }) {
  const id = String(visiteId || '').trim();
  if (!id || !edit?.kind) throw new Error('Modification Compagnon incomplète');

  const nextValue = value == null ? '' : String(value);
  switch (edit.kind) {
    case 'champ':
      if (!edit.sectionCode || !edit.cle) throw new Error('Champ visite invalide');
      await upsertChamp(id, edit.sectionCode, edit.cle, nextValue);
      break;

    case 'control':
      if (!edit.sectionCode || !edit.cle || !['avis', 'commentaire'].includes(edit.key)) throw new Error('Contrôle visite invalide');
      await upsertControlePartiel(id, edit.sectionCode, edit.cle, { [edit.key]: nextValue });
      break;

    case 'counter':
      if (!['valeur', 'label', 'unite'].includes(edit.key)) throw new Error('Champ compteur non autorisé');
      await assertRowBelongsToVisit('compteurs', edit.id, id);
      await upsertCompteurChamp(edit.id, edit.key, nextValue);
      break;

    case 'equipment':
      if (!['designation', 'marque', 'modele', 'nombre', 'annee', 'numero_materiel', 'reseau_desservi', 'caracteristiques'].includes(edit.key)) {
        throw new Error('Champ équipement non autorisé');
      }
      await assertRowBelongsToVisit('materiel', edit.id, id);
      await upsertMaterielChamp(edit.id, edit.key, nextValue);
      break;

    case 'network':
      if (edit.key !== 'nom_reseau') throw new Error('Champ réseau non autorisé');
      await assertRowBelongsToVisit('reseaux', edit.id, id);
      await upsertReseauChamp(edit.id, edit.key, nextValue);
      break;

    case 'remark':
      if (!['prestation', 'poste', 'criticite'].includes(edit.key)) throw new Error('Champ remarque non autorisé');
      await assertRowBelongsToVisit('remarques', edit.id, id);
      await modifierRemarqueVisite(edit.id, { [edit.key]: edit.key === 'criticite' ? Number(nextValue || 0) : nextValue });
      break;

    default:
      throw new Error('Type de modification Compagnon inconnu');
  }

  await toucherVisite(id).catch(() => {});
  return buildCompanionVisitSnapshot(id);
}

async function importCompanionPhoto({ visiteId, uri, meta = {} }) {
  if (!visiteId || !uri) throw new Error('Photo compagnon incomplète');
  const db = await openAppDatabase();
  const transferId = clean(meta?.transferId);
  if (transferId) {
    const existing = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [`companion_transfer_${transferId}`]);
    if (existing?.value) {
      const photo = await db.getFirstAsync(`SELECT * FROM photos WHERE id=? LIMIT 1`, [existing.value]);
      if (Boolean(FileSystem.cacheDirectory) && String(uri).startsWith(FileSystem.cacheDirectory)) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (photo?.id) return { id: photo.id, uri: photo.uri, entiteKey: photo.entite_key, label: clean(photo.label).split('||')[0] || clean(meta?.label) || 'Photo téléphone', duplicate: true };
    }
  }

  const entiteKey = meta?.targetKey || null;
  const label = clean(meta?.label) || 'Photo téléphone';
  const prepared = await preparerPhotoNommee({ visiteId, entiteKey, label, uri });
  if (!prepared?.uri) throw new Error('Impossible de préparer la photo reçue');
  const labelDb = prepared.nom ? `${prepared.label || label}||${prepared.nom}` : (prepared.label || label);
  const cibleKey = prepared.entiteKey || entiteKey;
  const journalKey = await journaliserPhotoEnAttente({ visiteId, entiteKey: cibleKey, uri: prepared.uri, labelDb });
  const photoId = await ajouterPhoto(visiteId, cibleKey, prepared.uri, labelDb);
  await confirmerPhotoJournalisee(journalKey).catch(() => {});
  if (transferId) {
    await db.runAsync(
      `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [`companion_transfer_${transferId}`, photoId]
    );
  }
  if (Boolean(FileSystem.cacheDirectory) && String(uri).startsWith(FileSystem.cacheDirectory)) {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
  return { id: photoId, uri: prepared.uri, entiteKey: cibleKey, label: prepared.label || label };
}

export { MODULES as COMPANION_MODULES, applyCompanionTargetUpdate, buildCompanionClientSnapshot, buildCompanionVisitSnapshot, assertVisitBelongsToCompanionClient, importCompanionPhoto };

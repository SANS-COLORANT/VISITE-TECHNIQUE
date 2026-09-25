const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../apiLatestVisitImportDb.js'), 'utf8');
const start = source.indexOf('function materialFallbackReference');
const end = source.indexOf('async function findImportedVisit', start);
assert.ok(start >= 0 && end > start, 'equipment import helper source is available');

const clean = (value) => (value == null ? '' : String(value).trim());
const text = (value) => clean(value) || null;
const normalize = (value) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const remoteId = (value) => clean(value) || null;
let idSeq = 0;
const createId = () => `id-${++idSeq}`;

function fakeDb() {
  const state = {
    brands: [{ id: 'brand-grundfos', nom: 'Grundfos', logo_uri: 'logo://grundfos' }],
    equipments: [],
    provenances: [],
    attributes: [],
    materialRows: [],
    trames: []
  };

  return {
    state,
    async getAllAsync(sql) {
      if (sql.includes('SELECT id,nom,logo_uri FROM marques_equipement')) return state.brands;
      throw new Error(`Unhandled getAllAsync: ${sql}`);
    },
    async getFirstAsync(sql, params = []) {
      if (sql.includes("SELECT id FROM attributs_libres WHERE entite_type='equipement'")) {
        const [equipmentId, key] = params;
        return state.attributes.find((row) => row.equipement_id === equipmentId && row.cle === key) || null;
      }
      if (sql.includes('SELECT e.id FROM provenances p') && sql.includes("p.entite_type='equipement'")) {
        const [reference, installationId] = params;
        const p = state.provenances.find((row) => row.reference_externe === reference);
        const e = p && state.equipments.find((row) => row.id === p.entite_id && row.installation_id === installationId);
        return e ? { id: e.id } : null;
      }
      if (sql.includes('SELECT id FROM equipements') && sql.includes("installation_id=? AND statut='actif'")) {
        const [installationId, designation, brand, model] = params;
        const e = state.equipments.find(
          (row) =>
            row.installation_id === installationId &&
            normalize(row.designation) === normalize(designation) &&
            normalize(row.marque) === normalize(brand) &&
            normalize(row.modele) === normalize(model)
        );
        return e ? { id: e.id } : null;
      }
      if (sql.includes('SELECT id FROM materiel WHERE visite_id=? AND equipement_id=?')) {
        const [visiteId, equipementId] = params;
        const row = state.materialRows.find(
          (item) => item.visite_id === visiteId && item.equipement_id === equipementId
        );
        return row ? { id: row.id } : null;
      }
      throw new Error(`Unhandled getFirstAsync: ${sql}`);
    },
    async runAsync(sql, params = []) {
      if (sql.includes('INSERT INTO attributs_libres')) {
        const [id, equipmentId, key, value] = params;
        state.attributes.push({ id, equipement_id: equipmentId, cle: key, valeur: value });
        return;
      }
      if (sql.includes('UPDATE attributs_libres SET valeur=')) {
        const [value, id] = params;
        const row = state.attributes.find((item) => item.id === id);
        row.valeur = value;
        return;
      }
      if (sql.includes('UPDATE equipements') && sql.includes("statut='actif'")) {
        const [installationId, typeCode, designation, brand, model, year, id] = params;
        const row = state.equipments.find((item) => item.id === id);
        Object.assign(row, {
          installation_id: installationId,
          type_code: typeCode,
          designation,
          marque: brand,
          modele: model,
          annee: year,
          statut: 'actif'
        });
        return;
      }
      if (sql.includes('INSERT INTO equipements')) {
        const [id, installationId, typeCode, designation, brand, model, year] = params;
        state.equipments.push({
          id,
          installation_id: installationId,
          type_code: typeCode,
          designation,
          marque: brand,
          modele: model,
          annee: year,
          statut: 'actif'
        });
        return;
      }
      if (sql.includes('INSERT INTO equipement_trames')) {
        const [equipmentId, trameId] = params;
        if (!state.trames.some((row) => row.equipement_id === equipmentId && row.trame_id === trameId))
          state.trames.push({ equipement_id: equipmentId, trame_id: trameId });
        return;
      }
      if (sql.includes('UPDATE materiel SET categorie=')) {
        const [categorie, nombre, designation, numero, reseau, marque, modele, caracteristiques, annee, id] = params;
        const row = state.materialRows.find((item) => item.id === id);
        Object.assign(row, {
          categorie,
          nombre,
          designation,
          numero_materiel: numero,
          reseau_desservi: reseau,
          marque,
          modele,
          caracteristiques,
          annee,
          etat: null
        });
        return;
      }
      if (sql.includes('INSERT INTO materiel')) {
        const [
          id,
          visiteId,
          categorie,
          nombre,
          designation,
          numero,
          reseau,
          marque,
          modele,
          caracteristiques,
          annee,
          equipmentId
        ] = params;
        state.materialRows.push({
          id,
          visite_id: visiteId,
          categorie,
          nombre,
          designation,
          numero_materiel: numero,
          reseau_desservi: reseau,
          marque,
          modele,
          caracteristiques,
          annee,
          etat: null,
          equipement_id: equipmentId
        });
        return;
      }
      throw new Error(`Unhandled runAsync: ${sql}`);
    }
  };
}

async function main() {
  const db = fakeDb();
  const upsertProvenance = async (_db, type, entityId, reference, details) => {
    const existing = db.state.provenances.find(
      (row) => row.entite_type === type && row.entite_id === entityId && row.reference_externe === reference
    );
    if (existing) existing.details = details;
    else db.state.provenances.push({ entite_type: type, entite_id: entityId, reference_externe: reference, details });
  };

  const importer = new Function(
    'clean',
    'normalize',
    'text',
    'remoteId',
    'createId',
    'upsertProvenance',
    `${source.slice(start, end)}\nreturn importCurrentMaterialsForLocal;`
  )(clean, normalize, text, remoteId, createId, upsertProvenance);

  const ref = {
    derniereVisite: { id: 'visit-remote-9' },
    materiels: [
      {
        id: 'material-777',
        categorie: 'Circulateur',
        nombre: '2',
        designation: 'Pompe primaire',
        numeroMateriel: 'P1',
        reseauDesservi: 'Chauffage',
        marque: 'GRUNDFOS',
        modele: 'MAGNA3',
        caracteristiques: 'DN50',
        annee: '2022',
        etat: 'Bon'
      }
    ]
  };

  const first = await importer(db, {
    ref,
    remoteLocalId: 'local-33',
    installationId: 'inst-1',
    visiteId: 'visit-local-1',
    trameId: 'icpe_v1'
  });
  assert.equal(first.importedMaterials, 1);
  assert.equal(first.matchedCatalogBrands, 1);
  assert.equal(db.state.equipments.length, 1);
  assert.equal(db.state.equipments[0].marque, 'Grundfos', 'remote brand is canonicalized from local catalog');
  assert.equal(db.state.equipments[0].modele, 'MAGNA3');
  assert.equal(db.state.materialRows.length, 1);
  assert.equal(db.state.materialRows[0].nombre, '2');
  assert.equal(db.state.materialRows[0].numero_materiel, 'P1');
  assert.equal(db.state.materialRows[0].reseau_desservi, 'Chauffage');
  assert.equal(db.state.trames.length, 1);
  assert.equal(db.state.attributes.find((row) => row.cle === 'catalogue.marque_logo_uri')?.valeur, 'logo://grundfos');
  assert.equal(db.state.provenances[0].reference_externe, 'material-777');

  ref.materiels[0].modele = 'MAGNA3 50-100 F';
  const second = await importer(db, {
    ref,
    remoteLocalId: 'local-33',
    installationId: 'inst-1',
    visiteId: 'visit-local-1',
    trameId: 'icpe_v1'
  });
  assert.equal(second.importedMaterials, 1);
  assert.equal(db.state.equipments.length, 1, 're-import updates the existing remote equipment');
  assert.equal(db.state.materialRows.length, 1, 're-import does not duplicate the visit material row');
  assert.equal(db.state.equipments[0].modele, 'MAGNA3 50-100 F');

  const noVisitDb = fakeDb();
  const noVisitProvenance = async (_db, type, entityId, reference, details) => {
    noVisitDb.state.provenances.push({ entite_type: type, entite_id: entityId, reference_externe: reference, details });
  };
  const importNoVisit = new Function(
    'clean',
    'normalize',
    'text',
    'remoteId',
    'createId',
    'upsertProvenance',
    `${source.slice(start, end)}\nreturn importCurrentMaterialsForLocal;`
  )(clean, normalize, text, remoteId, createId, noVisitProvenance);
  await importNoVisit(noVisitDb, {
    ref,
    remoteLocalId: 'local-33',
    installationId: 'inst-1',
    visiteId: null,
    trameId: 'icpe_v1'
  });
  assert.equal(noVisitDb.state.equipments.length, 1, 'equipment is permanent even without visit history');
  assert.equal(noVisitDb.state.materialRows.length, 0, 'no fake visit material row is created without a visit');

  console.log('Intranet equipment import executable regression: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { createId } from './database/ids.js';

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function txt(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function indexedValues(values = {}) {
  return Object.entries(values).map(([key, value]) => ({ key, normalized: normalizeKey(key), value }));
}

function pick(values, aliases) {
  const entries = indexedValues(values);
  for (const alias of aliases) {
    const exact = entries.find((item) => item.normalized === alias);
    if (exact && txt(exact.value) !== null) return { key: exact.key, value: exact.value };
  }
  return null;
}

const ALIASES = Object.freeze({
  site: ['site', 'nom du site', 'etablissement', 'etablissement scolaire', 'residence', 'college'],
  siteCode: ['code site', 'reference site', 'n site', 'numero site'],
  building: ['batiment', 'nom batiment', 'bloc'],
  floor: ['etage', 'niveau'],
  local: ['local', 'nom du local', 'localisation', 'piece', 'zone'],
  category: ['categorie', 'famille', 'type equipement', 'type dequipement'],
  designation: ['designation', 'equipement', 'materiel', 'nom equipement', 'intitule materiel'],
  quantity: ['nombre', 'quantite', 'qte', 'nb'],
  network: ['reseau desservi', 'reseau', 'circuit'],
  brand: ['marque', 'constructeur'],
  model: ['modele', 'reference constructeur', 'ref constructeur'],
  year: ['annee', 'annee de fabrication', 'mise en service'],
  state: ['etat', 'etat equipement', 'etat du materiel'],
  action: ['action', 'action demandee', 'prestation', 'travaux a realiser'],
  responsible: ['responsable', 'entreprise', 'acteur'],
  due: ['echeance', 'delai', 'date echeance'],
  priority: ['priorite', 'criticite'],
  cost: ['cout', 'estimatif', 'budget', 'montant'],
  allocation: ['imputation', 'lot', 'qualification'],
  status: ['statut', 'etat avancement', 'etat davancement'],
});

async function issue(db, batchId, severity, entityType, sourceRef, message, suggestion = null) {
  await db.runAsync(
    `INSERT INTO mission_import_issues(id,batch_id,severity,entity_type,source_ref,message,suggestion)
     VALUES(?,?,?,?,?,?,?)`,
    [createId('mimpi'), batchId, severity, entityType, sourceRef, message, suggestion]
  );
}

async function provenance(db, missionId, entityType, entityId, sheetName, rowIndex, sourceValue) {
  await db.runAsync(
    `INSERT INTO mission_provenance(id,mission_id,entity_type,entity_id,source_kind,source_sheet,source_cell,source_value,confidence)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [createId('mprov'), missionId, entityType, entityId, 'excel_import', sheetName, `row:${rowIndex}`, JSON.stringify(sourceValue || {}), 'auto_mapped']
  );
}

async function getLinkedSites(db, missionId) {
  return db.getAllAsync(
    `SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name`,
    [missionId]
  );
}

async function findOrCreateSite(db, missionId, name, code = null) {
  const normalizedName = txt(name);
  if (!normalizedName) return null;
  const existing = await db.getFirstAsync(
    `SELECT s.id FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id
     WHERE l.mission_id=? AND LOWER(TRIM(s.name))=LOWER(TRIM(?)) LIMIT 1`,
    [missionId, normalizedName]
  );
  if (existing?.id) return existing.id;
  const id = createId('msite');
  await db.runAsync(`INSERT INTO mission_sites(id,code,name) VALUES(?,?,?)`, [id, txt(code), normalizedName]);
  await db.runAsync(`INSERT INTO mission_site_links(mission_id,site_id) VALUES(?,?)`, [missionId, id]);
  return id;
}

async function findOrCreateLocation(db, siteId, kind, label, parentId = null) {
  const clean = txt(label);
  if (!siteId || !clean) return parentId;
  const existing = await db.getFirstAsync(
    `SELECT id FROM mission_locations
     WHERE site_id=? AND COALESCE(parent_location_id,'')=COALESCE(?, '') AND LOWER(TRIM(label))=LOWER(TRIM(?)) LIMIT 1`,
    [siteId, parentId, clean]
  );
  if (existing?.id) return existing.id;
  const id = createId('mloc');
  await db.runAsync(
    `INSERT INTO mission_locations(id,site_id,parent_location_id,kind,label) VALUES(?,?,?,?,?)`,
    [id, siteId, parentId, kind, clean]
  );
  return id;
}

async function resolveLocation(db, siteId, values) {
  let parent = null;
  const building = pick(values, ALIASES.building)?.value;
  const floor = pick(values, ALIASES.floor)?.value;
  const local = pick(values, ALIASES.local)?.value;
  if (building) parent = await findOrCreateLocation(db, siteId, 'building', building, null);
  if (floor) parent = await findOrCreateLocation(db, siteId, 'floor', floor, parent);
  if (local) parent = await findOrCreateLocation(db, siteId, 'room', local, parent);
  return parent;
}

function equipmentCandidate(values) {
  const designation = pick(values, ALIASES.designation)?.value;
  const category = pick(values, ALIASES.category)?.value;
  const brand = pick(values, ALIASES.brand)?.value;
  const model = pick(values, ALIASES.model)?.value;
  return Boolean(txt(designation) || (txt(category) && (txt(brand) || txt(model))));
}

async function mapEquipment(db, missionId, siteId, locationId, values, sheetName, rowIndex) {
  if (!siteId || !equipmentCandidate(values)) return null;
  const designation = txt(pick(values, ALIASES.designation)?.value);
  const category = txt(pick(values, ALIASES.category)?.value);
  const brand = txt(pick(values, ALIASES.brand)?.value);
  const model = txt(pick(values, ALIASES.model)?.value);
  const year = txt(pick(values, ALIASES.year)?.value);
  const state = txt(pick(values, ALIASES.state)?.value);
  const quantity = numberOrNull(pick(values, ALIASES.quantity)?.value);
  const network = txt(pick(values, ALIASES.network)?.value);
  const id = createId('meq');
  await db.runAsync(
    `INSERT INTO mission_equipment(id,site_id,location_id,type,brand,model,installation_year,state,properties_json,source_type,source_id)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, siteId, locationId, designation || category || 'Équipement', brand, model, year, state,
      JSON.stringify({ sourceCategory: category, designation, quantity: quantity ?? 1, network }),
      'excel_import', `${sheetName}!${rowIndex}`,
    ]
  );
  await provenance(db, missionId, 'equipment', id, sheetName, rowIndex, values);
  return id;
}

async function mapAction(db, missionId, siteId, locationId, values, sheetName, rowIndex) {
  const action = txt(pick(values, ALIASES.action)?.value);
  if (!action) return null;
  const responsibleLabel = txt(pick(values, ALIASES.responsible)?.value);
  let actorId = null;
  if (responsibleLabel) {
    const existing = await db.getFirstAsync(
      `SELECT id FROM mission_actors WHERE mission_id=? AND LOWER(COALESCE(company,name,''))=LOWER(?) LIMIT 1`,
      [missionId, responsibleLabel]
    );
    actorId = existing?.id || createId('mactor');
    if (!existing?.id) {
      await db.runAsync(
        `INSERT INTO mission_actors(id,mission_id,site_id,company,role,actor_type) VALUES(?,?,?,?,?,?)`,
        [actorId, missionId, siteId, responsibleLabel, 'Responsable action', 'responsible']
      );
    }
  }
  const id = createId('mact');
  await db.runAsync(
    `INSERT INTO mission_actions(
      id,mission_id,site_id,location_id,label,status,priority,responsible_actor_id,due_text,cost_estimate,allocation
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, missionId, siteId, locationId, action,
      txt(pick(values, ALIASES.status)?.value) || 'open',
      txt(pick(values, ALIASES.priority)?.value),
      actorId,
      txt(pick(values, ALIASES.due)?.value),
      numberOrNull(pick(values, ALIASES.cost)?.value),
      txt(pick(values, ALIASES.allocation)?.value),
    ]
  );
  await provenance(db, missionId, 'action', id, sheetName, rowIndex, values);
  return id;
}

export async function autoMapperClasseurMission({ db, missionId, batchId, workbook, safeSheetRows } = {}) {
  if (!db || !missionId || !batchId || !workbook || !safeSheetRows) return { sites: 0, equipment: 0, actions: 0, unresolvedRows: 0 };
  const linkedBefore = await getLinkedSites(db, missionId);
  const aliasesByNormalizedName = new Map();
  const summary = { sites: 0, equipment: 0, actions: 0, unresolvedRows: 0 };

  for (const sheetName of workbook.SheetNames || []) {
    const rows = safeSheetRows(workbook.Sheets?.[sheetName]);
    for (const row of rows) {
      const values = row.values || {};
      const siteHit = pick(values, ALIASES.site);
      let siteId = null;
      if (siteHit?.value) {
        const normalized = normalizeKey(siteHit.value);
        const previous = aliasesByNormalizedName.get(normalized);
        if (previous && previous !== String(siteHit.value).trim()) {
          await issue(
            db, batchId, 'warning', 'site', `${sheetName}!${row.rowIndex}`,
            `Doublon probable de site : « ${previous} » / « ${String(siteHit.value).trim()} ».`,
            'Vérifier si les deux libellés doivent être fusionnés.'
          );
        } else aliasesByNormalizedName.set(normalized, String(siteHit.value).trim());
        const existed = await db.getFirstAsync(
          `SELECT s.id FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? AND LOWER(TRIM(s.name))=LOWER(TRIM(?)) LIMIT 1`,
          [missionId, String(siteHit.value).trim()]
        );
        siteId = existed?.id || await findOrCreateSite(db, missionId, siteHit.value, pick(values, ALIASES.siteCode)?.value);
        if (!existed?.id) {
          summary.sites += 1;
          await provenance(db, missionId, 'site', siteId, sheetName, row.rowIndex, values);
        }
      } else if (linkedBefore.length === 1) {
        siteId = linkedBefore[0].id;
      }

      const locationId = siteId ? await resolveLocation(db, siteId, values) : null;
      const equipmentId = await mapEquipment(db, missionId, siteId, locationId, values, sheetName, row.rowIndex);
      const actionId = await mapAction(db, missionId, siteId, locationId, values, sheetName, row.rowIndex);
      if (equipmentId) summary.equipment += 1;
      if (actionId) summary.actions += 1;
      if (!siteId && (equipmentCandidate(values) || txt(pick(values, ALIASES.action)?.value))) {
        summary.unresolvedRows += 1;
        await issue(
          db, batchId, 'warning', equipmentCandidate(values) ? 'equipment' : 'action', `${sheetName}!${row.rowIndex}`,
          'Ligne structurée détectée mais aucun Site ne permet un rattachement fiable.',
          'Associer la feuille ou la ligne à un Site depuis le mapping d’import.'
        );
      }
    }
  }
  return summary;
}

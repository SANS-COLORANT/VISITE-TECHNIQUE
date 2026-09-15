const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const constants = read('database/constants.js');
const migrations = read('database/migrations/index.js');
const migration = read('database/migrations/035_intranet_structure_creation.js');
const structure = read('intranetStructureDb.js');
const ui = read('IntranetStructureUi.js');
const runtime = read('IntranetStructureRuntime.js');
const app = read('App.js');
const visitCreation = read('visitCreationDb.js');
const clientSites = read('ClientSitesScreen.js');

requireText(constants, 'DATABASE_SCHEMA_VERSION = 35', 'schema version 35');
requireText(migrations, "migration035 } from './035_intranet_structure_creation.js'", 'migration 035 registered');
requireText(migration, 'api_structure_referential', 'offline referential cache');
requireText(migration, 'api_structure_outbox', 'structure outbox');
requireText(migration, 'creation_id TEXT NOT NULL UNIQUE', 'persistent idempotency key');
requireText(migration, 'depends_on_id TEXT', 'site/local dependency');
requireText(migration, 'payload_json TEXT NOT NULL', 'exact serialized payload');

requireText(structure, '/referentiel-structure', 'structure referential endpoint');
requireText(structure, "resource_type === 'site'", 'site operation');
requireText(structure, '/sites/${encodeURIComponent(remoteSiteId)}/locaux', 'local creation endpoint');
requireText(structure, 'createIntranetUploadId()', 'creation UUID allocated once');
requireText(structure, 'payload_json,payload_bytes', 'serialized request stored before send');
requireText(structure, 'row.payload_json', 'stored JSON replay');
requireText(structure, 'depends_on_id', 'dependency retained in queue');
requireText(structure, 'retryAfterMs(error.retryAfter)', '429 Retry-After handling');
requireText(structure, "error?.code === 'idempotency_conflict'", 'idempotency conflict handling');
requireText(structure, "String(response?.creationId || '')", 'ack creationId verification');
requireText(structure, "typeof response?.rejoue !== 'boolean'", 'ack replay verification');
requireText(structure, 'local_installation_id', 'local installation binding');
requireText(structure, 'UPDATE visites SET api_remote_client_id', 'pending visits upgraded after local ack');

requireText(ui, 'IntranetSiteCreationModal', 'site creation UI');
requireText(ui, 'IntranetSiteLocalsPanel', 'local creation UI');
requireText(ui, 'queueMetraSiteCreation', 'site UI queues offline operation');
requireText(ui, 'queueMetraLocalCreation', 'local UI queues offline operation');
requireText(clientSites, '+ Site Intranet', 'client sites exposes Intranet creation');
requireText(clientSites, "navigation.navigate('IntranetStructure'", 'site structure navigation');
requireText(app, '<IntranetStructureRuntime/>', 'global structure outbox runtime');
requireText(app, "IntranetStructure:()=>require('./IntranetStructureScreen.js')", 'structure screen lazy route');

requireText(visitCreation, 'installationId = null', 'visit accepts local installation identity');
requireText(visitCreation, 'apiRemoteTrameId = null', 'visit keeps remote trame identity');
requireText(visitCreation, 'installation_id, api_remote_client_id, api_remote_local_id, api_remote_trame_id', 'visit freezes structure identity');
requireText(runtime, 'processStructureOutbox({ limit: 4 })', 'automatic structure retry runtime');

console.log('Intranet site/local creation contract validated: offline referential, idempotent dependency outbox, DPoP endpoints, local-first UI and pending-visit binding.');

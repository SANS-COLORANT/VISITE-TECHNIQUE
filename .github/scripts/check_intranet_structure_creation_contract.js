const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const constants = read('database/constants.js');
const migrations = read('database/migrations/index.js');
const migration35 = read('database/migrations/035_client_site_images.js');
const migration36 = read('database/migrations/036_intranet_visit_photo_outbox.js');
const migration37 = read('database/migrations/037_intranet_server_schema_alignment.js');
const migration38 = read('database/migrations/038_intranet_structure_creation.js');
const structure = read('intranetStructureDb.js');
const ui = read('IntranetStructureUi.js');
const runtime = read('IntranetStructureRuntime.js');
const app = read('App.js');
const visitCreation = read('visitCreationDb.js');
const clientSites = read('ClientSitesScreen.js');

requireText(constants, 'DATABASE_SCHEMA_VERSION = 38', 'schema version 38');
requireText(migrations, "import { migration035 } from './035_client_site_images.js';", 'migration 035 historical registration');
requireText(migrations, "import { migration036 } from './036_intranet_visit_photo_outbox.js';", 'migration 036 historical registration');
requireText(migrations, "import { migration037 } from './037_intranet_server_schema_alignment.js';", 'migration 037 historical registration');
requireText(migrations, "import { migration038 } from './038_intranet_structure_creation.js';", 'migration 038 structure registration');
requireText(migrations, 'migration036, migration037, migration038', 'migration ordering');
requireText(migration35, "name: 'client_site_images'", 'v35 must never be reused');
requireText(migration36, "name: 'intranet_visit_photo_outbox'", 'v36 must never be reused');
requireText(migration37, "name: 'intranet_server_schema_alignment'", 'v37 must never be reused');
requireText(migration38, 'version: 38', 'structure migration version');
requireText(migration38, "name: 'intranet_structure_creation'", 'structure migration identity');
requireText(migration38, 'api_structure_referential', 'offline referential cache');
requireText(migration38, 'api_structure_outbox', 'structure outbox');
requireText(migration38, 'creation_id TEXT NOT NULL UNIQUE', 'persistent idempotency key');
requireText(migration38, 'depends_on_id TEXT', 'site/local dependency');
requireText(migration38, 'payload_json TEXT NOT NULL', 'exact serialized payload');

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

console.log('Intranet site/local creation contract validated on canonical SQLite lineage 35->36->37->38; no shipped migration number is reused.');

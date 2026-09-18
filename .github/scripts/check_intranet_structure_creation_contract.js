const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function requireRegex(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`${label}: pattern missing ${pattern}`);
}

const constants = read('database/constants.js');
const migrations = read('database/migrations/index.js');
const migrator = read('database/migrate.js');
const migration35 = read('database/migrations/035_client_site_images.js');
const migration36 = read('database/migrations/036_intranet_visit_photo_outbox.js');
const migration37 = read('database/migrations/037_intranet_server_schema_alignment.js');
const migration38 = read('database/migrations/038_intranet_structure_creation.js');
const migration39 = read('database/migrations/039_intranet_structure_outbox_alignment.js');
const structure = read('intranetStructureDb.js');
const ui = read('IntranetStructureUi.js');
const runtime = read('IntranetStructureRuntime.js');
const app = read('App.js');
const visitCreation = read('visitCreationDb.js');
const clientSites = read('ClientSitesScreen.js');

// La migration Intranet reste figée en v39. Le schéma global peut avancer
// (Missions utilise désormais v40-v41) sans réutiliser ni modifier 35 -> 39.
requireText(constants, 'DATABASE_SCHEMA_VERSION = 41', 'current global schema version 41');
requireText(migrations, "import { migration035 } from './035_client_site_images.js';", 'migration 035 historical registration');
requireText(migrations, "import { migration036 } from './036_intranet_visit_photo_outbox.js';", 'migration 036 historical registration');
requireText(migrations, "import { migration037 } from './037_intranet_server_schema_alignment.js';", 'migration 037 historical registration');
requireText(migrations, "import { migration038 } from './038_intranet_structure_creation.js';", 'migration 038 historical registration');
requireText(migrations, "import { migration039 } from './039_intranet_structure_outbox_alignment.js';", 'migration 039 repair registration');
requireText(migrations, "import { migration040 } from './040_missions_core.js';", 'migration 040 registration after Intranet lineage');
requireText(migrations, "import { migration041 } from './041_missions_architecture.js';", 'migration 041 additive Missions architecture');
requireRegex(migrations, /migration037\s*,\s*migration038\s*,\s*migration039\s*,\s*migration040[\s\S]*migration041/, 'migration ordering 37 -> 38 -> 39 -> 40 -> 41');
requireText(migration35, "name: 'client_site_images'", 'v35 must never be reused');
requireText(migration36, "name: 'intranet_visit_photo_outbox'", 'v36 must never be reused');
requireText(migration37, "name: 'intranet_server_schema_alignment'", 'v37 must never be reused');
requireText(migration38, 'version: 38', 'v38 historical version');
requireText(migration38, "name: 'intranet_structure_creation'", 'v38 historical structure migration identity');
requireText(migration39, 'version: 39', 'v39 historical version');
requireText(migration39, "name: 'intranet_structure_outbox_alignment'", 'v39 repair migration identity');
requireText(migrator, 'db.execAsync(migration.sql)', 'SQLite migration runner contract');
requireText(migration39, 'ALTER TABLE api_structure_outbox RENAME TO api_structure_outbox_v38', 'v38 table preservation before rebuild');
requireText(migration39, 'status TEXT NOT NULL DEFAULT', 'runtime status column');
requireText(migration39, 'http_status INTEGER', 'runtime http status column');
requireText(migration39, 'error_code TEXT', 'runtime error code column');
requireText(migration39, 'error_message TEXT', 'runtime error message column');
requireText(migration39, 'violations_json TEXT', 'runtime violations column');
requireText(migration39, 'queued_at TEXT NOT NULL DEFAULT', 'runtime queue timestamp column');
requireText(migration39, "WHEN state IN ('pending','sending','retry','synced','conflict','validation_error','rejected','auth_error') THEN state", 'v38 state migration');
requireText(migration39, 'last_http_status,last_error_code', 'v38 error metadata migration');
requireText(migration39, 'DROP TABLE api_structure_outbox_v38', 'legacy table cleanup');

requireText(structure, '/referentiel-structure', 'structure referential endpoint');
requireText(structure, "resource_type === 'site'", 'site operation');
requireText(structure, '/sites/${encodeURIComponent(remoteSiteId)}/locaux', 'local creation endpoint');
requireText(structure, 'createIntranetUploadId()', 'creation UUID allocated once');
requireText(structure, 'payload_json,payload_bytes,status', 'runtime insert uses aligned status column');
requireText(structure, "status='sending'", 'runtime sending status');
requireText(structure, 'http_status=?', 'runtime http status');
requireText(structure, 'error_code=?', 'runtime error code');
requireText(structure, 'error_message=?', 'runtime error message');
requireText(structure, 'violations_json=?', 'runtime violations metadata');
requireText(structure, 'ORDER BY queued_at', 'runtime queue ordering');
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
requireRegex(app, /<IntranetStructureRuntime\s*\/>/, 'global structure outbox runtime');
requireRegex(app, /\bIntranetStructure\s*:\s*\(\s*\)\s*=>\s*require\(['"]\.\/IntranetStructureScreen\.js['"]\)/, 'structure screen lazy route');

requireText(visitCreation, 'installationId = null', 'visit accepts local installation identity');
requireText(visitCreation, 'apiRemoteTrameId = null', 'visit keeps remote trame identity');
requireText(visitCreation, 'installation_id, api_remote_client_id, api_remote_local_id, api_remote_trame_id', 'visit freezes structure identity');
requireText(runtime, 'processStructureOutbox({ limit: 4 })', 'automatic structure retry runtime');

console.log('Intranet site/local creation contract validated: immutable SQLite lineage 35->36->37->38->39 is preserved, while the global application schema advances additively to v41 for Missions.');

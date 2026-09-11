const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const constants = read('database/constants.js');
const migrations = read('database/migrations/index.js');
const migration = read('database/migrations/034_intranet_local_name_sync.js');
const cache = read('symfonyApiCacheDb.js');

const schemaMatch = constants.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/);
const schemaVersion = Number(schemaMatch?.[1] || 0);
if (!Number.isInteger(schemaVersion) || schemaVersion < 34) throw new Error(`schema version: expected >= 34, got ${schemaVersion}`);
requireText(migrations, "import { migration034 } from './034_intranet_local_name_sync.js';", 'migration registration');
requireText(migrations, 'migration031, migration032, migration033, migration034', 'migration ordering');
requireText(cache, 'designation: nullableString(entry.local.designation)', 'remote LOCAL designation normalization');
requireText(cache, 'designation=excluded.designation', 'remote LOCAL designation refresh');

requireText(migration, 'UPDATE installations', 'existing linked installation synchronization');
requireText(migration, 'l.local_installation_id = installations.id', 'existing local link targeting');
requireText(migration, "trim(COALESCE(l.designation, '')) <> ''", 'empty remote name protection');
requireText(migration, 'trg_api_local_insert_sync_installation_name', 'insert trigger');
requireText(migration, 'trg_api_local_update_sync_installation_name', 'update trigger');
requireText(migration, 'AFTER UPDATE OF local_installation_id, designation ON api_local_links', 'link/designation refresh trigger');
requireText(migration, 'SET nom = NEW.designation', 'Intranet name propagation');

console.log(`Intranet LOCAL name sync contract validated at schema v${schemaVersion}: imported LOCAL designation is persisted, existing mappings are aligned by v34, and future link/name refreshes update the METRA installation without replacing it with an empty name.`);

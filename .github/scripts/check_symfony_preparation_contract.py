from pathlib import Path
import re
import sqlite3


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise SystemExit(f'{label}: invariant missing: {needle}')


def migration_sql(path: str) -> str:
    text = Path(path).read_text(encoding='utf-8')
    match = re.search(r"sql:\s*`(.*)`\s*,?\s*\n?\};?", text, re.S)
    if not match:
        raise SystemExit(f'Unable to read SQL from {path}')
    return match.group(1)


# 1) Additive migration rehearsal from the v27 API-cache shape.
conn = sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys=ON')
conn.executescript('''
CREATE TABLE clients (id TEXT PRIMARY KEY);
CREATE TABLE sites (id TEXT PRIMARY KEY, client_id TEXT);
CREATE TABLE installations (id TEXT PRIMARY KEY, site_id TEXT NOT NULL);
CREATE TABLE visites (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  date_visite TEXT,
  modifie_le TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE api_client_links (
  remote_client_id TEXT PRIMARY KEY,
  local_client_id TEXT,
  nom TEXT NOT NULL,
  categorie TEXT,
  code_everwin TEXT,
  adresse_postale TEXT,
  ville TEXT,
  agence_id TEXT,
  agence_libelle TEXT,
  autorise INTEGER NOT NULL DEFAULT 1,
  cree_localement INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE api_site_links (
  remote_site_id TEXT PRIMARY KEY,
  remote_client_id TEXT NOT NULL,
  local_site_id TEXT,
  nom TEXT NOT NULL,
  cree_localement INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE api_local_links (
  remote_local_id TEXT PRIMARY KEY,
  remote_site_id TEXT NOT NULL,
  designation TEXT,
  remote_trame_id TEXT,
  remote_trame_nom TEXT,
  derniere_visite_id TEXT,
  derniere_visite_date TEXT,
  derniere_visite_statut TEXT,
  reference_json TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO api_client_links(remote_client_id,nom,payload_json) VALUES('c1','Client 1','{}');
INSERT INTO api_site_links(remote_site_id,remote_client_id,nom,payload_json) VALUES('s1','c1','Site 1','{}');
INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json) VALUES('l1','s1','Chaufferie','{}');
''')
conn.executescript(migration_sql('database/migrations/028_symfony_preparation_integrity.js'))
conn.executescript(migration_sql('database/migrations/029_symfony_client_site_relations.js'))

columns = lambda table: {row[1] for row in conn.execute(f'PRAGMA table_info({table})')}
for column in {'installation_id', 'api_remote_local_id'}:
    if column not in columns('visites'):
        raise SystemExit(f'migration contract: visites.{column} missing')
for column in {'local_installation_id', 'remote_present', 'criteria_count', 'historical_criteria_count', 'remark_count', 'material_count'}:
    if column not in columns('api_local_links'):
        raise SystemExit(f'migration contract: api_local_links.{column} missing')
relation = conn.execute("SELECT remote_client_id,remote_site_id,remote_present FROM api_client_site_links WHERE remote_client_id='c1' AND remote_site_id='s1'").fetchone()
if relation != ('c1', 's1', 1):
    raise SystemExit(f'migration contract: v27 client/site relation not backfilled: {relation!r}')

# A site may be related to more than one client without replacing its physical
# identity. The client/site association is many-to-many, the METRA patrimoine
# linked to the remote SITE remains unique.
conn.execute("INSERT INTO api_client_links(remote_client_id,nom,payload_json) VALUES('c2','Client 2','{}')")
conn.execute("INSERT INTO api_client_site_links(remote_client_id,remote_site_id,remote_present) VALUES('c2','s1',1)")
count = conn.execute("SELECT COUNT(*) FROM api_client_site_links WHERE remote_site_id='s1'").fetchone()[0]
if count != 2:
    raise SystemExit('migration contract: client/site many-to-many relation not preserved')

# 2) Static semantic guards derived from the Symfony preparation contract.
cache = Path('symfonyApiCacheDb.js').read_text(encoding='utf-8')
prep = Path('apiVisitPreparationDb.js').read_text(encoding='utf-8')
persistent = Path('persistentEquipmentDb.js').read_text(encoding='utf-8')
prefill = Path('visitPrefillDb.js').read_text(encoding='utf-8')
directory = Path('MetraDirectoryScreen.js').read_text(encoding='utf-8')

require(cache, 'referencePath:', 'reused criterion branch identity')
require(cache, 'visiteSourceId', 'criterion source visit')
require(cache, 'criteriaAreReferenceOnly: true', 'criterion reference semantics')
require(cache, 'remarksAreLatestVisitReferenceOnly: true', 'latest-visit remark semantics')
require(cache, 'materialsAreCurrentLocalPatrimoine: true', 'local material semantics')
require(cache, 'api_client_site_links', 'client/site relation cache')
require(cache, 'UPDATE api_local_links SET remote_present=0 WHERE remote_site_id=?', 'site-scoped local refresh')
require(cache, 'if (remote.local_site_id)', 'one remote SITE / one METRA patrimoine')
require(cache, 'UPDATE api_client_site_links SET local_site_id=? WHERE remote_site_id=?', 'shared site link propagation')

require(prep, 'previousCriteriaMustNotSeedCurrentVisit: true', 'criteria isolation')
require(prep, 'previousRemarksMustNotSeedCurrentVisit: true', 'remark isolation')
require(prep, 'previousMaterialStateMustNotSeedCurrentVisit: true', 'material-state isolation')
require(prep, "'api_symfony.numero_materiel'", 'material number provenance')
require(prep, 'text(material?.annee), null, equipmentId', 'no API material state prefill')
require(prep, 'UPDATE visites SET installation_id=?,api_remote_local_id=?', 'visit LOCAL binding')
if 'numero_serie=COALESCE' in prep or 'text(material?.numeroMateriel), yearAsInteger' in prep:
    raise SystemExit('material contract: numero_materiel must not be silently treated as numero_serie')

require(persistent, 'const apiPrepared = Boolean(contexte.api_remote_local_id)', 'prepared visit detection')
require(persistent, 'if (!referenceOnly) await upsertObservation', 'no automatic observation from preparation')
require(prefill, 'contexte.installation_id', 'LOCAL-scoped stable prefill')
require(prefill, 'AND (? IS NULL OR installation_id=?)', 'same-LOCAL carry forward')
require(directory, 'materializeCachedSite(selectedSite.remote_site_id, remoteClientId)', 'selected client context')

print('Symfony preparation contract validated: CLIENT/SITE/LOCAL, trame branches, unique site patrimoine, history isolation and current material listing.')

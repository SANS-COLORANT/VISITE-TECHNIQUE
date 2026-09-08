const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`${label}: anchor not found`);
  return text.replace(from, to);
}

function patchCacheDb() {
  const path = 'symfonyApiCacheDb.js';
  let text = read(path);

  const cacheMarker = 'let directorySnapshot = null;';
  if (!text.includes(cacheMarker)) {
    text = replaceOnce(
      text,
      'async function db() { return openAppDatabase(); }',
      `async function db() { return openAppDatabase(); }\n\nlet directorySnapshot = null;\nfunction invalidateDirectorySnapshot() { directorySnapshot = null; }`,
      'directory cache state'
    );
  }

  if (!text.includes('invalidateDirectorySnapshot();\n  await updateApiSyncState({ last_clients_sync_at:')) {
    text = replaceOnce(
      text,
      "  await updateApiSyncState({ last_clients_sync_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null });",
      "  invalidateDirectorySnapshot();\n  await updateApiSyncState({ last_clients_sync_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null });",
      'authorized clients cache invalidation'
    );
  }
  if (!text.includes('invalidateDirectorySnapshot();\n  await updateApiSyncState({ last_success_at:')) {
    text = replaceOnce(
      text,
      "  await updateApiSyncState({ last_success_at: new Date().toISOString(), last_error: null });",
      "  invalidateDirectorySnapshot();\n  await updateApiSyncState({ last_success_at: new Date().toISOString(), last_error: null });",
      'preparation cache invalidation'
    );
  }

  const start = text.indexOf("export async function searchCachedDirectory(query = '') {");
  const end = text.indexOf('\nexport async function getCachedClient', start);
  if (start < 0 || end < 0) throw new Error('searchCachedDirectory function anchor not found');
  const current = text.slice(start, end);
  if (!current.includes('directorySnapshot ||')) {
    const replacement = `export async function searchCachedDirectory(query = '') {\n  const q = normalize(query);\n  const snapshot = directorySnapshot || await (async () => {\n    const database = await db();\n    const [clients, sites] = await Promise.all([\n      database.getAllAsync(\`SELECT * FROM api_client_links WHERE autorise=1 ORDER BY nom\`),\n      database.getAllAsync(\`\n        SELECT s.remote_site_id, cs.remote_client_id, COALESCE(s.local_site_id,cs.local_site_id) AS local_site_id,\n          s.cree_localement, s.nom, s.payload_json, s.synced_at,\n          c.nom AS client_nom, c.ville AS client_ville, c.code_everwin AS client_code_everwin,\n          COUNT(l.remote_local_id) AS local_count,\n          MAX(l.derniere_visite_date) AS derniere_visite_date,\n          GROUP_CONCAT(DISTINCT l.remote_trame_nom) AS trames,\n          GROUP_CONCAT(l.designation, ' ') AS local_designations,\n          COALESCE(SUM(l.material_count),0) AS material_count,\n          COALESCE(SUM(l.remark_count),0) AS remark_count\n        FROM api_client_site_links cs\n        JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id\n        JOIN api_client_links c ON c.remote_client_id=cs.remote_client_id\n        LEFT JOIN api_local_links l ON l.remote_site_id=s.remote_site_id AND l.remote_present=1\n        WHERE c.autorise=1 AND cs.remote_present=1\n        GROUP BY cs.remote_client_id,s.remote_site_id\n        ORDER BY c.nom,s.nom\`),\n    ]);\n    directorySnapshot = { clients, sites };\n    return directorySnapshot;\n  })();\n  if (!q) return snapshot;\n  return {\n    clients: snapshot.clients.filter((c) => normalize([c.nom,c.categorie,c.code_everwin,c.ville,c.agence_libelle,c.adresse_postale].join(' ')).includes(q)),\n    sites: snapshot.sites.filter((s) => normalize([s.nom,s.client_nom,s.client_ville,s.client_code_everwin,s.trames,s.local_designations].join(' ')).includes(q)),\n  };\n}`;
    text = text.slice(0, start) + replacement + text.slice(end);
  }
  write(path, text);
}

function patchDirectoryScreen() {
  const path = 'MetraDirectoryScreen.js';
  let text = read(path);
  const marker = 'const METRA_DIRECTORY_FAST_CACHE = { clients: [], sites: [] };';
  if (!text.includes(marker)) {
    const anchor = "const SUCCESS = '#16794B';\n";
    if (!text.includes(anchor)) throw new Error('MetraDirectory fast cache anchor not found');
    text = text.replace(anchor, `${anchor}\n${marker}\n`);
  }
  text = replaceOnce(
    text,
    '  const [directory, setDirectory] = useState({ clients: [], sites: [] });',
    '  const [directory, setDirectory] = useState(() => METRA_DIRECTORY_FAST_CACHE);',
    'MetraDirectory cached initial state'
  );
  const oldSearch = `  const search = useCallback(async (text = query) => {\n    setDirectory(await searchCachedDirectory(text));\n  }, [query]);`;
  const newSearch = `  const search = useCallback(async (text = query) => {\n    const next = await searchCachedDirectory(text);\n    METRA_DIRECTORY_FAST_CACHE = next;\n    setDirectory(next);\n  }, [query]);`;
  // The cache needs reassignment, so change its declaration once before wiring search.
  text = text.replace('const METRA_DIRECTORY_FAST_CACHE = { clients: [], sites: [] };', 'let METRA_DIRECTORY_FAST_CACHE = { clients: [], sites: [] };');
  if (!text.includes('METRA_DIRECTORY_FAST_CACHE = next;')) {
    if (!text.includes(oldSearch)) throw new Error('MetraDirectory search cache anchor not found');
    text = text.replace(oldSearch, newSearch);
  }
  write(path, text);
}

patchCacheDb();
patchDirectoryScreen();
console.log('Directory fast cache applied: instant return rendering and in-memory filtering between syncs.');

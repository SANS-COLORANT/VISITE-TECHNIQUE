import * as FileSystem from 'expo-file-system';
import { getDb } from './db.js';
import { verifyDatabaseIntegrity } from './database/index.js';
import { DATABASE_SCHEMA_VERSION } from './database/constants.js';

export async function diagnostiquerStockageLocal() {
  const db = await getDb();
  const [integrite, schema, photos, stats] = await Promise.all([
    verifyDatabaseIntegrity(db),
    db.getFirstAsync('SELECT MAX(version) version FROM schema_migrations'),
    db.getAllAsync('SELECT id,uri FROM photos ORDER BY cree_le DESC'),
    Promise.all([
      db.getFirstAsync('SELECT COUNT(*) n FROM clients'),
      db.getFirstAsync('SELECT COUNT(*) n FROM sites'),
      db.getFirstAsync('SELECT COUNT(*) n FROM visites'),
      db.getFirstAsync('SELECT COUNT(*) n FROM remarques'),
    ]),
  ]);

  let photosManquantes = 0;
  let photosGerees = 0;
  for (const photo of photos) {
    const uri = String(photo.uri || '');
    const geree = !!FileSystem.documentDirectory && uri.startsWith(`${FileSystem.documentDirectory}visite-technique/photos/`);
    if (!geree) continue;
    photosGerees += 1;
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: false });
      if (!info.exists) photosManquantes += 1;
    } catch {
      photosManquantes += 1;
    }
  }

  const versionSchema = Number(schema?.version || 0);
  const [clients, sites, visites, remarques] = stats.map((r) => Number(r?.n || 0));
  const ok = integrite.integrityOk && integrite.foreignKeysOk && versionSchema === DATABASE_SCHEMA_VERSION && photosManquantes === 0;

  return {
    ok,
    integrityOk: integrite.integrityOk,
    foreignKeysOk: integrite.foreignKeysOk,
    foreignKeyErrors: integrite.foreignKeyErrors || [],
    versionSchema,
    versionAttendue: DATABASE_SCHEMA_VERSION,
    photosTotal: photos.length,
    photosGerees,
    photosManquantes,
    clients,
    sites,
    visites,
    remarques,
  };
}

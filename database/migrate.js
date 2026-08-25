import { DATABASE_SCHEMA_VERSION } from './constants.js';
import { MIGRATIONS } from './migrations/index.js';

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    appliquee_le TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

async function ensureLegacyTimestampColumn(db, tableName) {
  const columns = await db.getAllAsync(`PRAGMA table_info(${tableName});`);
  if (!columns.some((column) => column.name === 'cree_le')) {
    // Certaines bases installées avant le système de migrations possèdent déjà
    // la table, mais pas la colonne ajoutée par le schéma actuel. CREATE TABLE
    // IF NOT EXISTS ne peut pas réparer ce cas.
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN cree_le TEXT;`);
  }

  // ALTER TABLE n'accepte pas CURRENT_TIMESTAMP comme DEFAULT sur toutes les
  // versions SQLite Android. Un trigger garantit donc la date pour les futurs
  // enregistrements sans inventer de date pour l'historique existant.
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS ${tableName}_set_cree_le
    AFTER INSERT ON ${tableName}
    WHEN NEW.cree_le IS NULL
    BEGIN
      UPDATE ${tableName}
      SET cree_le = datetime('now')
      WHERE rowid = NEW.rowid;
    END;
  `);
}

async function repairLegacyReportSchema(db) {
  await ensureLegacyTimestampColumn(db, 'remarques');
  await ensureLegacyTimestampColumn(db, 'photos');
}

export async function migrateDatabase(db) {
  await db.execAsync(MIGRATIONS_TABLE_SQL);
  const applied = await db.getAllAsync('SELECT version FROM schema_migrations ORDER BY version');
  const appliedVersions = new Set(applied.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, nom) VALUES (?, ?)',
        [migration.version, migration.name]
      );
    });
  }

  await repairLegacyReportSchema(db);

  const current = await db.getFirstAsync('SELECT MAX(version) AS version FROM schema_migrations');
  if ((current?.version ?? 0) !== DATABASE_SCHEMA_VERSION) {
    throw new Error(`Version SQLite inattendue: ${current?.version ?? 0}/${DATABASE_SCHEMA_VERSION}`);
  }
}

export async function verifyDatabaseIntegrity(db) {
  const integrity = await db.getFirstAsync('PRAGMA integrity_check;');
  const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check;');
  return {
    integrityOk: Object.values(integrity || {})[0] === 'ok',
    foreignKeysOk: foreignKeys.length === 0,
    foreignKeyErrors: foreignKeys,
  };
}

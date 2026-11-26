/**
 * Missions à la carte (additif) :
 * - missions.modules_json : briques ajoutées / retirées par rapport au type ;
 * - mission_models : modèles de Mission enregistrés par l'utilisateur
 *   (famille, type, briques, disposition de la fiche).
 * Aucune donnée existante n'est modifiée ; une Mission sans modules_json
 * garde exactement les outils de son type.
 */
export const migration052 = {
  version: 52,
  name: 'mission_modules_models',
  sql: `
    ALTER TABLE missions ADD COLUMN modules_json TEXT;

    CREATE TABLE IF NOT EXISTS mission_models (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      family TEXT,
      type TEXT,
      modules_json TEXT,
      layout_json TEXT,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mission_models_used ON mission_models(last_used_at);
  `,
};

/**
 * Trames et formulaires Missions (additif) :
 * - mission_forms : trames créées par l'utilisateur (champs, conditions, calculs) ;
 * - mission_form_links : trames rattachées à une Mission ;
 * - mission_form_entries : fiches remplies (brouillon repris sans perte, règle 10) ;
 * - mission_ref_lists : listes de référence (marques, états…) importées d'Excel ;
 * - mission_report_templates : modèles Word à balises fournis par l'utilisateur ;
 * - mission_models.forms_json : trames d'un modèle de Mission.
 * Aucune donnée existante n'est modifiée.
 */
export const migration053 = {
  version: 53,
  name: 'mission_forms',
  sql: `
    CREATE TABLE IF NOT EXISTS mission_forms (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      target_type TEXT NOT NULL DEFAULT 'mission',
      fields_json TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mission_form_links (
      mission_id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(mission_id, form_id),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(form_id) REFERENCES mission_forms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_form_entries (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      form_version INTEGER,
      target_type TEXT,
      target_id TEXT,
      target_label TEXT,
      visit_id TEXT,
      values_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(form_id) REFERENCES mission_forms(id)
    );

    CREATE TABLE IF NOT EXISTS mission_ref_lists (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      source_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mission_report_templates (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      original_name TEXT,
      tags_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    ALTER TABLE mission_models ADD COLUMN forms_json TEXT;

    CREATE INDEX IF NOT EXISTS idx_mission_form_entries_mission ON mission_form_entries(mission_id, form_id, status);
    CREATE INDEX IF NOT EXISTS idx_mission_form_links_form ON mission_form_links(form_id);
  `,
};

export const migration040 = {
  version: 40,
  name: 'missions_core',
  sql: `
    -- Le module Missions est volontairement isole du referentiel Intranet.
    -- Aucun identifiant distant / api_* n'est stocke dans ces tables.

    CREATE TABLE IF NOT EXISTS mission_clients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mission_sites (
      id TEXT PRIMARY KEY NOT NULL,
      client_id TEXT,
      code TEXT,
      name TEXT NOT NULL,
      city TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(client_id) REFERENCES mission_clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY NOT NULL,
      client_id TEXT,
      family TEXT,
      type TEXT,
      label TEXT,
      reference TEXT,
      description TEXT,
      responsible_name TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      start_date TEXT,
      end_date TEXT,
      due_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY(client_id) REFERENCES mission_clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_site_links (
      mission_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(mission_id, site_id),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_locations (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL,
      parent_location_id TEXT,
      kind TEXT,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_location_id) REFERENCES mission_locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_phases (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      type TEXT,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      sort_order INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_visits (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      phase_id TEXT,
      visit_type TEXT,
      visit_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(phase_id) REFERENCES mission_phases(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_actors (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      name TEXT,
      company TEXT,
      role TEXT,
      phone TEXT,
      email TEXT,
      actor_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_equipment (
      id TEXT PRIMARY KEY NOT NULL,
      site_id TEXT NOT NULL,
      location_id TEXT,
      type TEXT,
      brand TEXT,
      model TEXT,
      installation_year TEXT,
      state TEXT,
      properties_json TEXT,
      source_type TEXT,
      source_id TEXT,
      source_date TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE CASCADE,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_points (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      visit_origin_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      type TEXT,
      label TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      qualification TEXT,
      responsible_actor_id TEXT,
      due_date TEXT,
      due_text TEXT,
      priority TEXT,
      visibility TEXT NOT NULL DEFAULT 'internal',
      source_type TEXT,
      source_id TEXT,
      source_date TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(visit_origin_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(responsible_actor_id) REFERENCES mission_actors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_point_history (
      id TEXT PRIMARY KEY NOT NULL,
      point_id TEXT NOT NULL,
      visit_id TEXT,
      status_before TEXT,
      status_after TEXT,
      comment TEXT,
      actor_label TEXT,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_point_actors (
      point_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      relation_role TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(point_id, actor_id),
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_id) REFERENCES mission_actors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_measures (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      site_id TEXT,
      point_id TEXT,
      equipment_id TEXT,
      type TEXT,
      value_number REAL,
      value_text TEXT,
      unit TEXT,
      target_value TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_notes (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      visit_id TEXT,
      point_id TEXT,
      type TEXT,
      content TEXT,
      visibility TEXT NOT NULL DEFAULT 'internal',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_documents (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      visit_id TEXT,
      point_id TEXT,
      type TEXT,
      name TEXT,
      status TEXT,
      source TEXT,
      file_uri TEXT,
      document_date TEXT,
      visibility TEXT NOT NULL DEFAULT 'internal',
      offline_state TEXT NOT NULL DEFAULT 'metadata_only',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_photos (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      visit_id TEXT,
      point_id TEXT,
      equipment_id TEXT,
      label TEXT,
      type TEXT,
      file_uri TEXT NOT NULL,
      preview_uri TEXT,
      thumbnail_uri TEXT,
      visibility TEXT NOT NULL DEFAULT 'internal',
      taken_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_template_values (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      site_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      template_id TEXT,
      field_code TEXT NOT NULL,
      field_label TEXT,
      value_type TEXT,
      value_text TEXT,
      value_number REAL,
      value_boolean INTEGER,
      value_date TEXT,
      unit TEXT,
      source_type TEXT,
      source_id TEXT,
      source_date TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_template_values_unique
      ON mission_template_values(mission_id, COALESCE(visit_id,''), COALESCE(site_id,''), COALESCE(location_id,''), COALESCE(equipment_id,''), COALESCE(template_id,''), field_code);
    CREATE INDEX IF NOT EXISTS idx_missions_status_updated ON missions(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_sites_client ON mission_sites(client_id, name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_mission_site_links_site ON mission_site_links(site_id, mission_id);
    CREATE INDEX IF NOT EXISTS idx_mission_locations_site_parent ON mission_locations(site_id, parent_location_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_mission_phases_order ON mission_phases(mission_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_mission_visits_recent ON mission_visits(mission_id, visit_date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_points_status ON mission_points(mission_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_point_history_point ON mission_point_history(point_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_documents_context ON mission_documents(mission_id, site_id, point_id);
    CREATE INDEX IF NOT EXISTS idx_mission_photos_context ON mission_photos(mission_id, visit_id, point_id);
    CREATE INDEX IF NOT EXISTS idx_mission_template_visit ON mission_template_values(visit_id, field_code);
  `
};

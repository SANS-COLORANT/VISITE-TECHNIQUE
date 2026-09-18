export const migration042 = {
  version: 42,
  name: 'missions_complete_tooling',
  sql: `
    -- Compléments Missions : hiérarchie technique, plans/PDF/SIG, OCR local,
    -- vocal, formules, mapping Excel et contrôles de fin de visite.
    -- Toujours strictement isolé du référentiel Intranet / Visites techniques.

    CREATE TABLE IF NOT EXISTS mission_installations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      location_id TEXT,
      type TEXT,
      label TEXT NOT NULL,
      status TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_systems (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      installation_id TEXT,
      type TEXT,
      label TEXT NOT NULL,
      status TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(installation_id) REFERENCES mission_installations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_networks (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      location_id TEXT,
      installation_id TEXT,
      system_id TEXT,
      type TEXT,
      label TEXT NOT NULL,
      status TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(installation_id) REFERENCES mission_installations(id) ON DELETE SET NULL,
      FOREIGN KEY(system_id) REFERENCES mission_systems(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_components (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      type TEXT,
      label TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      state TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE CASCADE
    );

    ALTER TABLE mission_equipment ADD COLUMN installation_id TEXT REFERENCES mission_installations(id) ON DELETE SET NULL;
    ALTER TABLE mission_equipment ADD COLUMN system_id TEXT REFERENCES mission_systems(id) ON DELETE SET NULL;
    ALTER TABLE mission_equipment ADD COLUMN network_id TEXT REFERENCES mission_networks(id) ON DELETE SET NULL;
    ALTER TABLE mission_equipment ADD COLUMN verification_status TEXT;
    ALTER TABLE mission_equipment ADD COLUMN lifecycle_status TEXT;
    ALTER TABLE mission_equipment ADD COLUMN expected_lifetime_years REAL;
    ALTER TABLE mission_equipment ADD COLUMN replacement_cost REAL;
    ALTER TABLE mission_equipment ADD COLUMN replacement_year INTEGER;
    ALTER TABLE mission_equipment ADD COLUMN criticality_json TEXT;

    ALTER TABLE mission_geometries ADD COLUMN measure_id TEXT REFERENCES mission_measures(id) ON DELETE SET NULL;
    ALTER TABLE mission_geometries ADD COLUMN photo_id TEXT REFERENCES mission_photos(id) ON DELETE SET NULL;
    ALTER TABLE mission_geometries ADD COLUMN action_id TEXT REFERENCES mission_actions(id) ON DELETE SET NULL;
    ALTER TABLE mission_geometries ADD COLUMN installation_id TEXT REFERENCES mission_installations(id) ON DELETE SET NULL;
    ALTER TABLE mission_geometries ADD COLUMN system_id TEXT REFERENCES mission_systems(id) ON DELETE SET NULL;
    ALTER TABLE mission_geometries ADD COLUMN network_id TEXT REFERENCES mission_networks(id) ON DELETE SET NULL;
    ALTER TABLE mission_geometries ADD COLUMN plan_page INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE mission_geometries ADD COLUMN properties_json TEXT;

    -- Contexte automatique commun : une photo/mesure/document hérite de ce que METRA connaît déjà.
    ALTER TABLE mission_photos ADD COLUMN location_id TEXT REFERENCES mission_locations(id) ON DELETE SET NULL;
    ALTER TABLE mission_photos ADD COLUMN geometry_id TEXT REFERENCES mission_geometries(id) ON DELETE SET NULL;
    ALTER TABLE mission_photos ADD COLUMN action_id TEXT REFERENCES mission_actions(id) ON DELETE SET NULL;
    ALTER TABLE mission_photos ADD COLUMN phase_role TEXT;

    ALTER TABLE mission_documents ADD COLUMN location_id TEXT REFERENCES mission_locations(id) ON DELETE SET NULL;
    ALTER TABLE mission_documents ADD COLUMN equipment_id TEXT REFERENCES mission_equipment(id) ON DELETE SET NULL;

    ALTER TABLE mission_measures ADD COLUMN location_id TEXT REFERENCES mission_locations(id) ON DELETE SET NULL;
    ALTER TABLE mission_measure_series ADD COLUMN location_id TEXT REFERENCES mission_locations(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS mission_plan_layers (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      document_id TEXT,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'annotation',
      visible INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      style_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_plan_calibrations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL DEFAULT 1,
      point_a_json TEXT NOT NULL,
      point_b_json TEXT NOT NULL,
      pixel_distance REAL NOT NULL,
      real_distance REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'm',
      scale_ratio REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_plan_annotations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      layer_id TEXT,
      page_number INTEGER NOT NULL DEFAULT 1,
      annotation_type TEXT NOT NULL,
      geometry_json TEXT,
      text TEXT,
      symbol_key TEXT,
      style_json TEXT,
      linked_entity_type TEXT,
      linked_entity_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE CASCADE,
      FOREIGN KEY(layer_id) REFERENCES mission_plan_layers(id) ON DELETE SET NULL
    );

    ALTER TABLE mission_plan_annotations ADD COLUMN geometry_id TEXT REFERENCES mission_geometries(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS mission_map_layers (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'geojson',
      source_uri TEXT,
      data_json TEXT,
      visible INTEGER NOT NULL DEFAULT 1,
      offline_available INTEGER NOT NULL DEFAULT 1,
      style_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_import_mappings (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT,
      name TEXT NOT NULL,
      source_signature TEXT,
      mapping_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_formula_library (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT,
      scope TEXT NOT NULL DEFAULT 'global',
      family TEXT,
      mission_type TEXT,
      label TEXT NOT NULL,
      formula TEXT NOT NULL,
      unit TEXT,
      input_schema_json TEXT,
      assumptions_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_measurement_instruments (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      label TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serial_number TEXT,
      calibration_date TEXT,
      calibration_due_date TEXT,
      document_id TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_custom_measure_types (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT,
      family TEXT,
      mission_type TEXT,
      label TEXT NOT NULL,
      unit TEXT,
      data_type TEXT NOT NULL DEFAULT 'number',
      expected_min REAL,
      expected_max REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_ocr_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      photo_id TEXT NOT NULL,
      equipment_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      engine TEXT NOT NULL DEFAULT 'android_mlkit',
      raw_text TEXT,
      detected_json TEXT,
      confirmed_json TEXT,
      error_text TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(photo_id) REFERENCES mission_photos(id) ON DELETE CASCADE,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_voice_notes (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      site_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      point_id TEXT,
      transcript TEXT,
      locale TEXT DEFAULT 'fr-FR',
      status TEXT NOT NULL DEFAULT 'final',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_document_extractions (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      page_number INTEGER,
      source_part TEXT,
      engine TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      raw_text TEXT,
      structured_json TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_document_review_items (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      extraction_id TEXT,
      item_type TEXT NOT NULL DEFAULT 'information',
      label TEXT,
      value_text TEXT,
      status TEXT NOT NULL DEFAULT 'to_review',
      target_entity_type TEXT,
      target_entity_id TEXT,
      source_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE CASCADE,
      FOREIGN KEY(extraction_id) REFERENCES mission_document_extractions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_visit_checks (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT NOT NULL,
      check_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      severity TEXT NOT NULL DEFAULT 'info',
      entity_type TEXT,
      entity_id TEXT,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mission_installations_context ON mission_installations(mission_id,site_id,location_id);
    CREATE INDEX IF NOT EXISTS idx_mission_systems_installation ON mission_systems(mission_id,installation_id);
    CREATE INDEX IF NOT EXISTS idx_mission_networks_context ON mission_networks(mission_id,installation_id,system_id);
    CREATE INDEX IF NOT EXISTS idx_mission_components_equipment ON mission_components(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_mission_plan_layers_doc ON mission_plan_layers(mission_id,document_id,sort_order);
    CREATE INDEX IF NOT EXISTS idx_mission_plan_calibrations_doc ON mission_plan_calibrations(mission_id,document_id,page_number);
    CREATE INDEX IF NOT EXISTS idx_mission_plan_annotations_doc ON mission_plan_annotations(mission_id,document_id,page_number,layer_id);
    CREATE INDEX IF NOT EXISTS idx_mission_plan_annotations_geometry ON mission_plan_annotations(geometry_id);
    CREATE INDEX IF NOT EXISTS idx_mission_geometry_plan_page ON mission_geometries(mission_id,plan_document_id,plan_page);
    CREATE INDEX IF NOT EXISTS idx_mission_geometry_technical ON mission_geometries(mission_id,installation_id,system_id,network_id);
    CREATE INDEX IF NOT EXISTS idx_mission_map_layers_mission ON mission_map_layers(mission_id,visible);
    CREATE INDEX IF NOT EXISTS idx_mission_import_mappings_sig ON mission_import_mappings(mission_id,source_signature);
    CREATE INDEX IF NOT EXISTS idx_mission_formula_library_scope ON mission_formula_library(scope,family,mission_type,enabled);
    CREATE INDEX IF NOT EXISTS idx_mission_instruments_mission ON mission_measurement_instruments(mission_id);
    CREATE INDEX IF NOT EXISTS idx_mission_ocr_jobs_photo ON mission_ocr_jobs(mission_id,photo_id,status);
    CREATE INDEX IF NOT EXISTS idx_mission_voice_notes_context ON mission_voice_notes(mission_id,visit_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_mission_photo_context ON mission_photos(mission_id,site_id,location_id,equipment_id,point_id,action_id,phase_role);
    CREATE INDEX IF NOT EXISTS idx_mission_measure_context ON mission_measures(mission_id,site_id,location_id,equipment_id,point_id);
    CREATE INDEX IF NOT EXISTS idx_mission_document_context ON mission_documents(mission_id,site_id,location_id,equipment_id,point_id);
    CREATE INDEX IF NOT EXISTS idx_mission_document_extractions_doc ON mission_document_extractions(mission_id,document_id,page_number);
    CREATE INDEX IF NOT EXISTS idx_mission_document_review_status ON mission_document_review_items(mission_id,status,document_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_visit_checks_unique ON mission_visit_checks(visit_id,check_key,COALESCE(entity_type,''),COALESCE(entity_id,''));
  `,
};

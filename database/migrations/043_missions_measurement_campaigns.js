export const migration043 = {
  version: 43,
  name: 'missions_measurement_campaigns',
  sql: `
    -- Campagnes terrain ultra-rapides : préparation PC, saisie "valeur -> suivant"
    -- sur tablette, sans dépendance au référentiel Intranet.

    CREATE TABLE IF NOT EXISTS mission_measure_campaigns (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      label TEXT NOT NULL,
      measure_type TEXT NOT NULL,
      unit TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      reference_source_type TEXT,
      reference_source_label TEXT,
      default_expected_value REAL,
      default_expected_text TEXT,
      tolerance_abs REAL,
      tolerance_pct REAL,
      comparison_group TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_measure_campaign_points (
      id TEXT PRIMARY KEY NOT NULL,
      campaign_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      external_ref TEXT,
      label TEXT NOT NULL,
      point_type TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned',
      expected_value REAL,
      expected_text TEXT,
      measured_value REAL,
      measured_text TEXT,
      measure_id TEXT,
      comment TEXT,
      measured_at TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(campaign_id) REFERENCES mission_measure_campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(measure_id) REFERENCES mission_measures(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mission_measure_campaigns
      ON mission_measure_campaigns(mission_id,site_id,status,created_at);

    CREATE INDEX IF NOT EXISTS idx_mission_measure_campaign_points_order
      ON mission_measure_campaign_points(campaign_id,sort_order,label);

    CREATE INDEX IF NOT EXISTS idx_mission_measure_campaign_points_context
      ON mission_measure_campaign_points(mission_id,site_id,location_id,equipment_id,status);

    CREATE INDEX IF NOT EXISTS idx_mission_measure_campaign_points_external
      ON mission_measure_campaign_points(campaign_id,external_ref);
  `,
};

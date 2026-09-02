export const migration022 = {
  version: 22,
  name: 'lab_3d_site',
  sql: `
    CREATE TABLE IF NOT EXISTS lab3d_scenes (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL DEFAULT 'Maquette technique',
      grid_step REAL NOT NULL DEFAULT 0.25,
      camera_json TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lab3d_objects (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      equipment_id TEXT,
      kind TEXT NOT NULL,
      subtype TEXT,
      label TEXT,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      z REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 1,
      depth REAL NOT NULL DEFAULT 0.6,
      height REAL NOT NULL DEFAULT 1,
      rotation_deg REAL NOT NULL DEFAULT 0,
      anchor_type TEXT NOT NULL DEFAULT 'floor',
      params_json TEXT,
      locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scene_id) REFERENCES lab3d_scenes(id) ON DELETE CASCADE,
      FOREIGN KEY (equipment_id) REFERENCES equipements(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lab3d_networks (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      label TEXT,
      diameter_mm INTEGER,
      section_width_mm INTEGER,
      section_height_mm INTEGER,
      points_json TEXT NOT NULL,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scene_id) REFERENCES lab3d_scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lab3d_openings (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      wall_id TEXT,
      kind TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      z REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 0.9,
      height REAL NOT NULL DEFAULT 2.05,
      rotation_deg REAL NOT NULL DEFAULT 0,
      params_json TEXT,
      FOREIGN KEY (scene_id) REFERENCES lab3d_scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lab3d_views (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      nom TEXT NOT NULL,
      view_json TEXT NOT NULL,
      ordre INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (scene_id) REFERENCES lab3d_scenes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_lab3d_objects_scene ON lab3d_objects(scene_id);
    CREATE INDEX IF NOT EXISTS idx_lab3d_objects_equipment ON lab3d_objects(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_lab3d_networks_scene ON lab3d_networks(scene_id);
    CREATE INDEX IF NOT EXISTS idx_lab3d_views_scene ON lab3d_views(scene_id);
  `,
};

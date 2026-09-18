export const migration041 = {
  version: 41,
  name: 'missions_architecture_v2',
  sql: `
    -- Architecture Missions V2 : additive, locale et totalement indépendante de l'Intranet.
    -- Aucun point/trame de METRA Visites techniques n'est recopié ici.

    CREATE TABLE IF NOT EXISTS mission_workstreams (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      parent_id TEXT,
      kind TEXT,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES mission_workstreams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_subjects (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      workstream_id TEXT,
      site_id TEXT,
      location_id TEXT,
      label TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(workstream_id) REFERENCES mission_workstreams(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_observations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      subject_id TEXT,
      site_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      kind TEXT NOT NULL DEFAULT 'fact',
      content TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      confidence TEXT,
      observed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_hypotheses (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      subject_id TEXT,
      observation_id TEXT,
      label TEXT NOT NULL,
      rationale TEXT,
      status TEXT NOT NULL DEFAULT 'untested',
      confidence REAL,
      conclusion TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL,
      FOREIGN KEY(observation_id) REFERENCES mission_observations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_decisions (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      subject_id TEXT,
      label TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'decided',
      decided_by_actor_id TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL,
      FOREIGN KEY(decided_by_actor_id) REFERENCES mission_actors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_actions (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      source_point_id TEXT,
      subject_id TEXT,
      site_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      label TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT,
      responsible_actor_id TEXT,
      due_date TEXT,
      due_text TEXT,
      cost_estimate REAL,
      cost_currency TEXT DEFAULT 'EUR',
      allocation TEXT,
      progress REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(source_point_id) REFERENCES mission_points(id) ON DELETE SET NULL,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(responsible_actor_id) REFERENCES mission_actors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_references (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      equipment_id TEXT,
      point_id TEXT,
      measure_type TEXT NOT NULL,
      value_number REAL,
      value_text TEXT,
      unit TEXT,
      source_type TEXT,
      source_id TEXT,
      source_label TEXT,
      tolerance_abs REAL,
      tolerance_pct REAL,
      valid_from TEXT,
      valid_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_measure_series (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      site_id TEXT,
      equipment_id TEXT,
      type TEXT NOT NULL,
      unit TEXT,
      started_at TEXT,
      ended_at TEXT,
      sample_count INTEGER NOT NULL DEFAULT 0,
      min_value REAL,
      max_value REAL,
      avg_value REAL,
      source_file_uri TEXT,
      summary_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_test_protocols (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      type TEXT,
      label TEXT NOT NULL,
      version_label TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_test_steps (
      id TEXT PRIMARY KEY NOT NULL,
      protocol_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL,
      expected_text TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(protocol_id) REFERENCES mission_test_protocols(id) ON DELETE CASCADE,
      FOREIGN KEY(reference_id) REFERENCES mission_references(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_test_runs (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      protocol_id TEXT NOT NULL,
      site_id TEXT,
      equipment_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      started_at TEXT,
      completed_at TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(protocol_id) REFERENCES mission_test_protocols(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_test_results (
      id TEXT PRIMARY KEY NOT NULL,
      test_run_id TEXT NOT NULL,
      test_step_id TEXT,
      status TEXT NOT NULL DEFAULT 'not_tested',
      value_number REAL,
      value_text TEXT,
      unit TEXT,
      comment TEXT,
      point_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(test_run_id) REFERENCES mission_test_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(test_step_id) REFERENCES mission_test_steps(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_expected_documents (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      phase_id TEXT,
      site_id TEXT,
      type TEXT,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'expected',
      responsible_actor_id TEXT,
      due_date TEXT,
      due_text TEXT,
      document_id TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(phase_id) REFERENCES mission_phases(id) ON DELETE SET NULL,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(responsible_actor_id) REFERENCES mission_actors(id) ON DELETE SET NULL,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_validations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      document_id TEXT,
      subject_id TEXT,
      validation_type TEXT,
      version_label TEXT,
      status TEXT NOT NULL DEFAULT 'to_review',
      reviewer_actor_id TEXT,
      comment TEXT,
      validated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE SET NULL,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL,
      FOREIGN KEY(reviewer_actor_id) REFERENCES mission_actors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_scenarios (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      description TEXT,
      investment REAL,
      annual_saving REAL,
      energy_saving_kwh REAL,
      co2_saving_kg REAL,
      payback_years REAL,
      constraints_text TEXT,
      benefits_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_scenario_actions (
      scenario_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      included INTEGER NOT NULL DEFAULT 1,
      investment_override REAL,
      annual_saving_override REAL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(scenario_id, action_id),
      FOREIGN KEY(scenario_id) REFERENCES mission_scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY(action_id) REFERENCES mission_actions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_geometries (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      location_id TEXT,
      equipment_id TEXT,
      point_id TEXT,
      subject_id TEXT,
      geometry_type TEXT NOT NULL,
      geojson TEXT NOT NULL,
      coordinate_space TEXT NOT NULL DEFAULT 'plan',
      plan_document_id TEXT,
      label TEXT,
      style_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(location_id) REFERENCES mission_locations(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE SET NULL,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL,
      FOREIGN KEY(plan_document_id) REFERENCES mission_documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_equipment_relations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      source_equipment_id TEXT NOT NULL,
      target_equipment_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      label TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(source_equipment_id) REFERENCES mission_equipment(id) ON DELETE CASCADE,
      FOREIGN KEY(target_equipment_id) REFERENCES mission_equipment(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_calculations (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      site_id TEXT,
      equipment_id TEXT,
      subject_id TEXT,
      label TEXT NOT NULL,
      formula TEXT NOT NULL,
      unit TEXT,
      result_number REAL,
      result_text TEXT,
      inputs_json TEXT,
      assumptions_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      source_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(site_id) REFERENCES mission_sites(id) ON DELETE SET NULL,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE SET NULL,
      FOREIGN KEY(subject_id) REFERENCES mission_subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_photo_annotations (
      id TEXT PRIMARY KEY NOT NULL,
      photo_id TEXT NOT NULL,
      annotation_type TEXT NOT NULL,
      geometry_json TEXT,
      text TEXT,
      style_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(photo_id) REFERENCES mission_photos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_signatures (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      visit_id TEXT,
      document_id TEXT,
      actor_id TEXT,
      role_label TEXT,
      signer_label TEXT,
      file_uri TEXT,
      signed_at TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(visit_id) REFERENCES mission_visits(id) ON DELETE SET NULL,
      FOREIGN KEY(document_id) REFERENCES mission_documents(id) ON DELETE SET NULL,
      FOREIGN KEY(actor_id) REFERENCES mission_actors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_equipment_lifecycle (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      scenario_id TEXT,
      action_id TEXT,
      from_state TEXT,
      to_state TEXT NOT NULL,
      effective_date TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(equipment_id) REFERENCES mission_equipment(id) ON DELETE CASCADE,
      FOREIGN KEY(scenario_id) REFERENCES mission_scenarios(id) ON DELETE SET NULL,
      FOREIGN KEY(action_id) REFERENCES mission_actions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_import_batches (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      source_name TEXT,
      source_uri TEXT,
      source_type TEXT NOT NULL DEFAULT 'excel',
      mode TEXT NOT NULL DEFAULT 'merge',
      status TEXT NOT NULL DEFAULT 'running',
      summary_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_import_issues (
      id TEXT PRIMARY KEY NOT NULL,
      batch_id TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      entity_type TEXT,
      source_ref TEXT,
      message TEXT NOT NULL,
      suggestion TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(batch_id) REFERENCES mission_import_batches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_provenance (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_name TEXT,
      source_kind TEXT,
      source_document_id TEXT,
      source_sheet TEXT,
      source_cell TEXT,
      source_value TEXT,
      confidence TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(source_document_id) REFERENCES mission_documents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_report_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT,
      type TEXT,
      label TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'mission',
      config_json TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_report_outputs (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      profile_id TEXT,
      scope_type TEXT NOT NULL DEFAULT 'mission',
      scope_id TEXT,
      format TEXT NOT NULL,
      file_uri TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      metadata_json TEXT,
      generated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(profile_id) REFERENCES mission_report_profiles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_import_rows (
      id TEXT PRIMARY KEY NOT NULL,
      batch_id TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      row_json TEXT NOT NULL,
      mapped_entity_type TEXT,
      mapped_entity_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(batch_id) REFERENCES mission_import_batches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mission_point_details (
      point_id TEXT PRIMARY KEY NOT NULL,
      scope_type TEXT,
      scope_id TEXT,
      cost_estimate REAL,
      cost_currency TEXT DEFAULT 'EUR',
      allocation TEXT,
      criticality_json TEXT,
      requested_action TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(point_id) REFERENCES mission_points(id) ON DELETE CASCADE,
      FOREIGN KEY(reference_id) REFERENCES mission_references(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_measure_details (
      measure_id TEXT PRIMARY KEY NOT NULL,
      reference_id TEXT,
      series_id TEXT,
      source_type TEXT,
      source_id TEXT,
      source_label TEXT,
      quality TEXT,
      measured_at TEXT,
      instrument_label TEXT,
      delta_number REAL,
      delta_percent REAL,
      anomaly_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(measure_id) REFERENCES mission_measures(id) ON DELETE CASCADE,
      FOREIGN KEY(reference_id) REFERENCES mission_references(id) ON DELETE SET NULL,
      FOREIGN KEY(series_id) REFERENCES mission_measure_series(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mission_report_sections (
      id TEXT PRIMARY KEY NOT NULL,
      mission_id TEXT NOT NULL,
      profile_id TEXT,
      scope_type TEXT NOT NULL DEFAULT 'mission',
      scope_id TEXT,
      section_key TEXT,
      title TEXT NOT NULL,
      content_text TEXT,
      content_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      source_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
      FOREIGN KEY(profile_id) REFERENCES mission_report_profiles(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mission_import_rows_batch ON mission_import_rows(batch_id, sheet_name, row_index);
    CREATE INDEX IF NOT EXISTS idx_mission_report_sections_scope ON mission_report_sections(mission_id, scope_type, scope_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_mission_workstreams_mission ON mission_workstreams(mission_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_mission_subjects_mission_status ON mission_subjects(mission_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_observations_mission ON mission_observations(mission_id, subject_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_hypotheses_subject ON mission_hypotheses(mission_id, subject_id, status);
    CREATE INDEX IF NOT EXISTS idx_mission_actions_status_due ON mission_actions(mission_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_mission_references_context ON mission_references(mission_id, measure_type, equipment_id);
    CREATE INDEX IF NOT EXISTS idx_mission_series_context ON mission_measure_series(mission_id, type, started_at);
    CREATE INDEX IF NOT EXISTS idx_mission_test_protocols_mission ON mission_test_protocols(mission_id, type);
    CREATE INDEX IF NOT EXISTS idx_mission_test_runs_context ON mission_test_runs(mission_id, visit_id, status);
    CREATE INDEX IF NOT EXISTS idx_mission_expected_docs_status ON mission_expected_documents(mission_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_mission_validations_status ON mission_validations(mission_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_scenarios_mission ON mission_scenarios(mission_id, status);
    CREATE INDEX IF NOT EXISTS idx_mission_geometries_context ON mission_geometries(mission_id, site_id, geometry_type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_equipment_relations_unique ON mission_equipment_relations(mission_id,source_equipment_id,target_equipment_id,relation_type);
    CREATE INDEX IF NOT EXISTS idx_mission_calculations_context ON mission_calculations(mission_id, site_id, equipment_id);
    CREATE INDEX IF NOT EXISTS idx_mission_lifecycle_equipment ON mission_equipment_lifecycle(equipment_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mission_import_batches_mission ON mission_import_batches(mission_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mission_provenance_entity ON mission_provenance(mission_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_mission_report_outputs_mission ON mission_report_outputs(mission_id, generated_at DESC);
  `,
};

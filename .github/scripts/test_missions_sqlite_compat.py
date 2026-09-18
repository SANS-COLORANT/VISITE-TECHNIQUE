#!/usr/bin/env python3
"""Executable SQLite validation for METRA Missions schema v40 -> v41."""

from __future__ import annotations

import re
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = [
    (40, "missions_core", ROOT / "database" / "migrations" / "040_missions_core.js"),
    (41, "missions_architecture_v2", ROOT / "database" / "migrations" / "041_missions_architecture.js"),
]


def read_sql(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    match = re.search(r"sql:\s*\`(?P<sql>[\s\S]*?)\`\s*,\s*\n?};\s*$", source)
    if not match:
        raise AssertionError(f"Impossible d'extraire le SQL de {path.name}.")
    sql = match.group("sql")
    if "${" in sql:
        raise AssertionError(f"{path.name}: interpolation JavaScript interdite.")
    return sql


def assert_integrity(conn: sqlite3.Connection, label: str) -> None:
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise AssertionError(f"{label}: integrity_check={integrity!r}")
    fk = conn.execute("PRAGMA foreign_key_check").fetchall()
    if fk:
        raise AssertionError(f"{label}: erreurs de cle etrangere: {fk!r}")


def count(conn: sqlite3.Connection, table: str) -> int:
    return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def apply_migrations(conn: sqlite3.Connection, from_version: int) -> None:
    for version, name, path in MIGRATIONS:
        if version <= from_version:
            continue
        sql = read_sql(path)
        conn.executescript(sql)
        conn.execute("INSERT OR IGNORE INTO schema_migrations(version,nom) VALUES(?,?)", (version, name))
        conn.commit()
        assert_integrity(conn, f"migration {version}")


def seed_core(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO mission_clients(id,name) VALUES('c1','Client test')")
    conn.execute("INSERT INTO mission_sites(id,client_id,name) VALUES('s1','c1','Site test')")
    conn.execute("INSERT INTO missions(id,client_id,status,family,type) VALUES('m1','c1','draft','etude_audit','diagnostic_ecs')")
    conn.execute("INSERT INTO mission_site_links(mission_id,site_id) VALUES('m1','s1')")
    conn.execute("INSERT INTO mission_locations(id,site_id,label) VALUES('loc1','s1','Local ECS')")
    conn.execute("INSERT INTO mission_phases(id,mission_id,label) VALUES('ph1','m1','Terrain')")
    conn.execute("INSERT INTO mission_visits(id,mission_id,site_id,phase_id,status) VALUES('v1','m1','s1','ph1','draft')")
    conn.execute("INSERT INTO mission_actors(id,mission_id,site_id,name,role) VALUES('a1','m1','s1','Entreprise A','Entreprise')")
    conn.execute("INSERT INTO mission_equipment(id,site_id,location_id,type) VALUES('e1','s1','loc1','Pompe bouclage')")
    conn.execute("INSERT INTO mission_points(id,mission_id,site_id,visit_origin_id,location_id,equipment_id,status,responsible_actor_id) VALUES('p1','m1','s1','v1','loc1','e1','open','a1')")
    conn.execute("INSERT INTO mission_point_history(id,point_id,visit_id,status_after,source) VALUES('h1','p1','v1','open','test')")
    conn.execute("INSERT INTO mission_point_actors(point_id,actor_id) VALUES('p1','a1')")
    conn.execute("INSERT INTO mission_measures(id,mission_id,visit_id,site_id,point_id,equipment_id,type,value_number,unit) VALUES('me1','m1','v1','s1','p1','e1','temperature',62.5,'C')")
    conn.execute("INSERT INTO mission_notes(id,mission_id,site_id,visit_id,point_id,content) VALUES('n1','m1','s1','v1','p1','Note test')")
    conn.execute("INSERT INTO mission_documents(id,mission_id,site_id,visit_id,point_id,name) VALUES('d1','m1','s1','v1','p1','Plan source')")
    conn.execute("INSERT INTO mission_photos(id,mission_id,site_id,visit_id,point_id,equipment_id,file_uri) VALUES('photo1','m1','s1','v1','p1','e1','file:///tmp/photo.jpg')")
    conn.execute("INSERT INTO mission_template_values(id,mission_id,visit_id,site_id,location_id,equipment_id,template_id,field_code,value_type,value_text) VALUES('tv1','m1','v1','s1','loc1','e1','audit','ecs.production','text','Ballon 650L')")
    conn.commit()


def seed_v41(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO mission_workstreams(id,mission_id,label) VALUES('w1','m1','Diagnostic')")
    conn.execute("INSERT INTO mission_subjects(id,mission_id,workstream_id,label) VALUES('sub1','m1','w1','Bouclage ECS')")
    conn.execute("INSERT INTO mission_observations(id,mission_id,visit_id,subject_id,content) VALUES('o1','m1','v1','sub1','Delta T eleve')")
    conn.execute("INSERT INTO mission_hypotheses(id,mission_id,subject_id,observation_id,label) VALUES('hy1','m1','sub1','o1','Desequilibrage')")
    conn.execute("INSERT INTO mission_decisions(id,mission_id,visit_id,subject_id,label) VALUES('dec1','m1','v1','sub1','Mesurer pression pompe')")
    conn.execute("INSERT INTO mission_references(id,mission_id,equipment_id,measure_type,value_number,unit,source_type) VALUES('ref1','m1','e1','temperature',55,'C','document')")
    conn.execute("INSERT INTO mission_measure_series(id,mission_id,visit_id,equipment_id,type,unit,sample_count,min_value,max_value,avg_value) VALUES('ser1','m1','v1','e1','temperature','C',3,50,62,56)")
    conn.execute("INSERT INTO mission_actions(id,mission_id,source_point_id,subject_id,equipment_id,label,responsible_actor_id,cost_estimate,allocation) VALUES('act1','m1','p1','sub1','e1','Equilibrer reseau','a1',1600,'P5')")
    conn.execute("INSERT INTO mission_test_protocols(id,mission_id,label) VALUES('tp1','m1','Essai pompe')")
    conn.execute("INSERT INTO mission_test_steps(id,protocol_id,label,reference_id) VALUES('ts1','tp1','Verifier pression','ref1')")
    conn.execute("INSERT INTO mission_test_runs(id,mission_id,visit_id,protocol_id,equipment_id) VALUES('tr1','m1','v1','tp1','e1')")
    conn.execute("INSERT INTO mission_test_results(id,test_run_id,test_step_id,status,value_number,unit,point_id) VALUES('tres1','tr1','ts1','to_check',52,'C','p1')")
    conn.execute("INSERT INTO mission_expected_documents(id,mission_id,phase_id,label,document_id) VALUES('ed1','m1','ph1','Schema hydraulique','d1')")
    conn.execute("INSERT INTO mission_validations(id,mission_id,document_id,subject_id,status) VALUES('val1','m1','d1','sub1','to_review')")
    conn.execute("INSERT INTO mission_scenarios(id,mission_id,label,investment,annual_saving) VALUES('sc1','m1','Equilibrage',1600,300)")
    conn.execute("INSERT INTO mission_scenario_actions(scenario_id,action_id) VALUES('sc1','act1')")
    conn.execute(
        "INSERT INTO mission_geometries(id,mission_id,site_id,point_id,geometry_type,geojson,plan_document_id) VALUES(?,?,?,?,?,?,?)",
        ("g1", "m1", "s1", "p1", "point", '{"type":"Point","coordinates":[1,2]}', "d1"),
    )
    conn.execute("INSERT INTO mission_equipment_relations(id,mission_id,source_equipment_id,target_equipment_id,relation_type) VALUES('er1','m1','e1','e1','self_test')")
    conn.execute("INSERT INTO mission_calculations(id,mission_id,equipment_id,label,formula,result_number,unit) VALUES('calc1','m1','e1','Delta T','depart-retour',10,'K')")
    conn.execute("INSERT INTO mission_photo_annotations(id,photo_id,annotation_type,text) VALUES('pa1','photo1','text','Fuite')")
    conn.execute("INSERT INTO mission_signatures(id,mission_id,visit_id,actor_id,signer_label) VALUES('sig1','m1','v1','a1','Exploitant')")
    conn.execute("INSERT INTO mission_equipment_lifecycle(id,mission_id,equipment_id,scenario_id,action_id,to_state) VALUES('lc1','m1','e1','sc1','act1','a_remplacer')")
    conn.execute("INSERT INTO mission_provenance(id,mission_id,entity_type,entity_id,field_name,source_sheet,source_cell,source_value) VALUES('prov1','m1','equipment','e1','model','Equipements','G2','Pompe X')")
    conn.execute("INSERT INTO mission_report_profiles(id,mission_id,label) VALUES('rp1','m1','Rapport audit ECS')")
    conn.execute("INSERT INTO mission_report_sections(id,mission_id,profile_id,title,content_text) VALUES('rs1','m1','rp1','Synthese','Texte modifiable')")
    conn.execute("INSERT INTO mission_report_outputs(id,mission_id,profile_id,format,status) VALUES('ro1','m1','rp1','docx','draft')")
    conn.execute("INSERT INTO mission_point_details(point_id,cost_estimate,allocation,requested_action,reference_id) VALUES('p1',450,'P5','Mesurer pression','ref1')")
    conn.execute("INSERT INTO mission_measure_details(measure_id,reference_id,series_id,source_type,delta_number,anomaly_status) VALUES('me1','ref1','ser1','terrain',7.5,'to_check')")
    conn.execute("INSERT INTO mission_import_batches(id,mission_id,source_name,status) VALUES('ib1','m1','source.xlsx','completed')")
    conn.execute("INSERT INTO mission_import_issues(id,batch_id,message) VALUES('ii1','ib1','Doublon probable')")
    conn.execute(
        "INSERT INTO mission_import_rows(id,batch_id,sheet_name,row_index,row_json) VALUES(?,?,?,?,?)",
        ("ir1", "ib1", "Feuil1", 2, '{"A":"B"}'),
    )
    conn.commit()
    assert_integrity(conn, "donnees v41")


def exercise(conn: sqlite3.Connection) -> None:
    seed_core(conn)
    seed_v41(conn)
    conn.execute("UPDATE mission_visits SET status='completed', completed_at=datetime('now') WHERE id='v1'")
    conn.commit()
    assert_integrity(conn, "visite incomplete terminee")

    conn.execute("DELETE FROM missions WHERE id='m1'")
    conn.commit()
    mission_tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'mission_%'")]
    for table in mission_tables:
        # Client, Site, Localisation et Equipement appartiennent au référentiel local Missions
        # et peuvent être réutilisés par une autre Mission. Ils ne sont donc pas supprimés
        # lors de la clôture/suppression d'un dossier.
        if table in ("mission_clients", "mission_sites", "mission_locations", "mission_equipment"):
            continue
        if count(conn, table) != 0:
            raise AssertionError(f"Cascade incomplete dans {table}.")
    if (
        count(conn, "mission_clients") != 1
        or count(conn, "mission_sites") != 1
        or count(conn, "mission_locations") != 1
        or count(conn, "mission_equipment") != 1
    ):
        raise AssertionError("Le référentiel local Client/Site/Localisation/Equipement Missions doit survivre a la suppression d'une Mission.")
    assert_integrity(conn, "apres suppression cascade")


def run_case(start_version: int) -> None:
    with tempfile.TemporaryDirectory(prefix="metra-missions-sqlite-") as tmp:
        conn = sqlite3.connect(Path(tmp) / f"upgrade_v{start_version}.db")
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, nom TEXT NOT NULL, appliquee_le TEXT NOT NULL DEFAULT (datetime('now')))")
            if start_version >= 39:
                conn.execute("INSERT INTO schema_migrations(version,nom) VALUES(39,'legacy_39')")
            if start_version >= 40:
                conn.executescript(read_sql(MIGRATIONS[0][2]))
                conn.execute("INSERT OR IGNORE INTO schema_migrations(version,nom) VALUES(40,'missions_core')")
            conn.execute("CREATE TABLE IF NOT EXISTS legacy_user_data(id TEXT PRIMARY KEY, payload TEXT)")
            conn.execute("INSERT INTO legacy_user_data VALUES('keep-me','preserve')")
            conn.commit()

            apply_migrations(conn, start_version)
            if conn.execute("SELECT payload FROM legacy_user_data WHERE id='keep-me'").fetchone() != ("preserve",):
                raise AssertionError("Une migration Missions a altere une donnee legacy.")
            exercise(conn)
        finally:
            conn.close()


def main() -> None:
    run_case(39)
    run_case(40)
    print(f"SQLite {sqlite3.sqlite_version}: Missions v40-v41 valides sur upgrade v39 et v40.")


if __name__ == "__main__":
    main()

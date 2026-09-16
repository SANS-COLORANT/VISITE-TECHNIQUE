#!/usr/bin/env python3
"""Validation executable de la migration SQLite du module Missions.

Ce test utilise uniquement sqlite3 de la bibliotheque standard afin de verifier
la compatibilite SQL sans dependre d'Expo/Android ni modifier la base METRA.
"""

from __future__ import annotations

import re
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database" / "migrations" / "040_missions_core.js"


def read_migration_sql() -> str:
    source = MIGRATION.read_text(encoding="utf-8")
    match = re.search(r"sql:\s*`(?P<sql>[\s\S]*?)`\s*,\s*\n?};\s*$", source)
    if not match:
        raise AssertionError("Impossible d'extraire le SQL de la migration 040.")
    sql = match.group("sql")
    if "${" in sql:
        raise AssertionError("La migration 040 ne doit pas contenir d'interpolation JavaScript.")
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


def seed_and_exercise(conn: sqlite3.Connection) -> None:
    # Mission et visite volontairement tres incompletes : ce scenario doit rester valide.
    conn.execute("INSERT INTO mission_clients(id,name) VALUES('c1','Client test')")
    conn.execute("INSERT INTO mission_sites(id,client_id,name) VALUES('s1','c1','Site test')")
    conn.execute("INSERT INTO missions(id,client_id,status) VALUES('m1','c1','draft')")
    conn.execute("INSERT INTO mission_site_links(mission_id,site_id) VALUES('m1','s1')")
    conn.execute("INSERT INTO mission_locations(id,site_id,label) VALUES('loc1','s1','Chaufferie')")
    conn.execute("INSERT INTO mission_phases(id,mission_id,label) VALUES('ph1','m1','Terrain')")
    conn.execute(
        "INSERT INTO mission_visits(id,mission_id,site_id,phase_id,status) "
        "VALUES('v1','m1','s1','ph1','draft')"
    )
    conn.execute(
        "INSERT INTO mission_actors(id,mission_id,site_id,name,role) "
        "VALUES('a1','m1','s1','Entreprise A','Entreprise')"
    )
    conn.execute(
        "INSERT INTO mission_equipment(id,site_id,location_id,type) "
        "VALUES('e1','s1','loc1','Chaudiere')"
    )
    conn.execute(
        "INSERT INTO mission_points(id,mission_id,site_id,visit_origin_id,location_id,equipment_id,status,responsible_actor_id) "
        "VALUES('p1','m1','s1','v1','loc1','e1','open','a1')"
    )
    conn.execute(
        "INSERT INTO mission_point_history(id,point_id,visit_id,status_after,source) "
        "VALUES('h1','p1','v1','open','test')"
    )
    conn.execute("INSERT INTO mission_point_actors(point_id,actor_id) VALUES('p1','a1')")
    conn.execute(
        "INSERT INTO mission_measures(id,mission_id,visit_id,site_id,point_id,equipment_id,type,value_number,unit) "
        "VALUES('me1','m1','v1','s1','p1','e1','temperature',62.5,'C')"
    )
    conn.execute(
        "INSERT INTO mission_notes(id,mission_id,site_id,visit_id,point_id,content) "
        "VALUES('n1','m1','s1','v1','p1','Note test')"
    )
    conn.execute(
        "INSERT INTO mission_documents(id,mission_id,site_id,visit_id,point_id,name) "
        "VALUES('d1','m1','s1','v1','p1','Document test')"
    )
    conn.execute(
        "INSERT INTO mission_photos(id,mission_id,site_id,visit_id,point_id,equipment_id,file_uri) "
        "VALUES('photo1','m1','s1','v1','p1','e1','file:///tmp/photo.jpg')"
    )
    conn.execute(
        "INSERT INTO mission_template_values(" 
        "id,mission_id,visit_id,site_id,location_id,equipment_id,template_id,field_code,value_type,value_text" 
        ") VALUES('tv1','m1','v1','s1','loc1','e1','audit','existant.production','text','2 chaudieres')"
    )
    conn.commit()

    assert_integrity(conn, "apres insertions")

    # L'index d'identite de champ doit empecher un doublon du meme contexte.
    try:
        conn.execute(
            "INSERT INTO mission_template_values(" 
            "id,mission_id,visit_id,site_id,location_id,equipment_id,template_id,field_code,value_type,value_text" 
            ") VALUES('tv2','m1','v1','s1','loc1','e1','audit','existant.production','text','doublon')"
        )
    except sqlite3.IntegrityError:
        conn.rollback()
    else:
        raise AssertionError("L'index unique des valeurs de trame n'a pas bloque un doublon.")

    # Une visite peut etre terminee sans aucune valeur supplementaire.
    conn.execute("UPDATE mission_visits SET status='completed', completed_at=datetime('now') WHERE id='v1'")
    conn.commit()
    assert_integrity(conn, "visite incomplete terminee")

    # La suppression d'une Mission doit nettoyer son graphe sans supprimer le client/site local.
    conn.execute("DELETE FROM missions WHERE id='m1'")
    conn.commit()
    for table in (
        "mission_site_links",
        "mission_phases",
        "mission_visits",
        "mission_actors",
        "mission_points",
        "mission_point_history",
        "mission_point_actors",
        "mission_measures",
        "mission_notes",
        "mission_documents",
        "mission_photos",
        "mission_template_values",
    ):
        if count(conn, table) != 0:
            raise AssertionError(f"Cascade incomplete dans {table}.")
    if count(conn, "mission_clients") != 1 or count(conn, "mission_sites") != 1:
        raise AssertionError("La suppression d'une Mission ne doit pas supprimer son referentiel Client/Site Missions.")
    assert_integrity(conn, "apres suppression cascade")


def run_case(sql: str, existing_v39: bool) -> None:
    with tempfile.TemporaryDirectory(prefix="metra-missions-sqlite-") as tmp:
        db_path = Path(tmp) / ("upgrade_v39.db" if existing_v39 else "fresh.db")
        conn = sqlite3.connect(db_path)
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations(" 
                "version INTEGER PRIMARY KEY, nom TEXT NOT NULL, appliquee_le TEXT NOT NULL DEFAULT (datetime('now')))"
            )
            if existing_v39:
                # Le test represente une base deja migree jusqu'a 39 sans recreer
                # tout l'ancien domaine : v40 ne doit dependre d'aucune table legacy.
                conn.execute("INSERT INTO schema_migrations(version,nom) VALUES(39,'intranet_structure_outbox_alignment')")
                conn.execute("CREATE TABLE legacy_user_data(id TEXT PRIMARY KEY, payload TEXT)")
                conn.execute("INSERT INTO legacy_user_data VALUES('keep-me','preserve')")
                conn.commit()

            conn.executescript(sql)
            conn.execute("INSERT OR IGNORE INTO schema_migrations(version,nom) VALUES(40,'missions_core')")
            conn.commit()
            assert_integrity(conn, "migration 040")

            # Rejouer le SQL CREATE IF NOT EXISTS doit rester sans effet destructif.
            conn.executescript(sql)
            conn.commit()
            assert_integrity(conn, "rejeu defensif migration 040")

            if existing_v39:
                preserved = conn.execute("SELECT payload FROM legacy_user_data WHERE id='keep-me'").fetchone()
                if preserved != ("preserve",):
                    raise AssertionError("La migration 040 a altere une donnee legacy simulée.")

            seed_and_exercise(conn)
        finally:
            conn.close()


def main() -> None:
    sql = read_migration_sql()
    run_case(sql, existing_v39=False)
    run_case(sql, existing_v39=True)
    print(f"SQLite {sqlite3.sqlite_version}: migration Missions v40 validee sur base neuve et upgrade v39 -> v40.")


if __name__ == "__main__":
    main()

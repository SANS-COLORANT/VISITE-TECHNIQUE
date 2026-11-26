#!/usr/bin/env python3
"""Native smoke of new Mission screens on the exact AAB-derived APK.
Only disposable synthetic fixtures; no real Intranet, no production account.
The fixture enables LAB in SQLite (activation UI is covered by source contracts,
not by this test). Native camera and Office sharing require separate scenarios.
"""
import json
import re
import sqlite3
import sys
import time
import android_aab_restore_retention as qa

MID = "qa-missions-native"
FORM = "qa-missions-native-form"
LABEL = "QA MISSION MODULABLE"
TITLE = "QA TRAME TERRAIN"
NOTE = "QAterrain123"

def await_label(label, seconds=40):
    assert qa.ui.await_label([label], seconds=seconds), f"Label not visible: {label}"

def tap(label):
    assert qa.ui.tap([label], seconds=25), f"Control not tappable: {label}"

def scroll_tap(label, max_scrolls=10):
    for _ in range(max_scrolls + 1):
        node = qa.ui.find(qa.ui.verify_alive(), [label])
        if node:
            qa.tap_raw(node)
            qa.ui.verify_alive()
            return
        qa.adb("shell", "input", "swipe", "600", "1500", "600", "570", "420")
        time.sleep(0.7)
    raise AssertionError(f"Control not reachable: {label}")

def type_text(label, value):
    nodes = qa.ui.verify_alive()
    node = qa.ui.find([n for n in nodes if "EditText" in n.get("class", "")], [label])
    assert node, f"Editable field not found: {label}"
    qa.tap_raw(node)
    qa.adb("shell", "input", "text", value)
    # Dismiss the keyboard only if it is actually visible; BACK can navigate.
    state = qa.adb("shell", "dumpsys", "input_method", check=False)
    if re.search(r"mInputShown=true|mIsInputViewShown=true", state):
        qa.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.5)

def seed():
    path = qa.db_snapshot("missions-native-fixture")
    with sqlite3.connect(path) as c:
        c.execute("PRAGMA foreign_keys=ON")
        assert "modules_json" in {row[1] for row in c.execute("PRAGMA table_info(missions)")}
        assert "forms_json" in {row[1] for row in c.execute("PRAGMA table_info(mission_models)")}
        for key in ("lab_missions_unlocked", "lab_feature_missions"):
            if key == "lab_feature_missions":
                row = c.execute("SELECT value FROM _meta WHERE key=?", (key,)).fetchone()
                assert not row or row[0] != "1", "LAB active on a fresh install"
            c.execute("INSERT INTO _meta(key,value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value='1'", (key,))
        c.execute("INSERT INTO missions(id,family,type,label,status) VALUES(?,?,?,?,?)",
                  (MID, "etude_audit", "diagnostic_chaufferie_ss", LABEL, "active"))
        fields = [{"key":"note","type":"text","label":"QA Constat","required":True},
                  {"key":"avis","type":"verdict","label":"QA Avis","reserveOnNok":True}]
        c.execute("INSERT INTO mission_forms(id,label,target_type,fields_json) VALUES(?,?,?,?)",
                  (FORM, TITLE, "mission", json.dumps(fields)))
        c.execute("INSERT INTO mission_form_links(mission_id,form_id) VALUES(?,?)", (MID, FORM))
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
    qa.replace_db(path)

def open_mission():
    tap("Missions")
    await_label("Piloter les dossiers ponctuels")
    scroll_tap(LABEL)
    await_label("Dossier Mission")
    await_label("Personnaliser la fiche Mission")

def open_form(resume=False):
    scroll_tap(("Reprendre la fiche " if resume else "Nouvelle fiche ") + TITLE)
    await_label("QA Constat")
    await_label("QA Avis")

def check_saved(tag, done):
    path = qa.db_snapshot(tag)
    with sqlite3.connect(path) as c:
        rows = c.execute("SELECT id,status,values_json FROM mission_form_entries WHERE mission_id=? AND form_id=?", (MID, FORM)).fetchall()
        assert len(rows) == 1, f"Expected exactly one form entry, got {len(rows)}"
        eid, status, values = rows[0]
        values = json.loads(values)
        assert values.get("note") == NOTE and values.get("avis") == "nok", (status, values)
        assert status == ("done" if done else "draft"), status
        count = c.execute("SELECT count(*) FROM mission_points WHERE mission_id=? AND source_type='form_entry' AND source_id=?", (MID, eid)).fetchone()[0]
        assert count == (1 if done else 0), f"Unexpected reserve count: {count}"
        assert not c.execute("PRAGMA foreign_key_check").fetchall()

def main():
    assert len(sys.argv) == 2
    qa.root_emulator()
    qa.adb("shell", "svc", "wifi", "disable", check=False)
    qa.adb("shell", "svc", "data", "disable", check=False)
    qa.adb("shell", "wm", "size", "1200x1920")
    qa.adb("shell", "wm", "density", "240")
    qa.adb("logcat", "-c", check=False)
    qa.adb("install", sys.argv[1], timeout=180)
    qa.launch()
    seed()
    qa.mark("fresh schema 52/53 present, LAB off by default, synthetic fixture")
    qa.launch()
    open_mission()
    qa.ui.snapshot("missions-native-dashboard")
    open_form()
    type_text("QA Constat", NOTE)
    scroll_tap("Non conforme")
    await_label("Une réserve sera créée")
    await_label("Enregistré")
    qa.ui.snapshot("missions-native-draft")
    check_saved("missions-native-draft", False)
    qa.mark("native entry autosave persists text and verdict")
    qa.launch()
    open_mission()
    open_form(resume=True)
    await_label(NOTE)
    await_label("Une réserve sera créée")
    scroll_tap("Terminer la fiche")
    # The app returns to the dossier/forms list only after successful completion.
    await_label("Trames")
    time.sleep(1)
    check_saved("missions-native-done", True)
    qa.mark("process restart, draft reopening, exactly one linked reserve")
    qa.launch()
    open_mission()
    tap("Personnaliser la fiche Mission")
    await_label("Terminer la personnalisation")
    tap("Ajouter")
    scroll_tap("Appliquer la disposition Minimal")
    tap("Terminer la personnalisation")
    tap("Cette Mission uniquement")
    await_label("Disposition propre")
    qa.ui.snapshot("missions-native-customized")
    qa.stop()
    qa.launch()
    open_mission()
    await_label("Disposition propre")
    qa.mark("native personalization persisted after process restart")
    assert not qa.ui.fatal_logs(), "fatal Android/React logs"

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        qa.report["error"] = str(exc)
        try:
            qa.ui.snapshot("missions-native-failed")
            qa.ui.fatal_logs()
        except Exception:
            pass
        raise
    finally:
        (qa.OUT / "missions-native.json").write_text(json.dumps(qa.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

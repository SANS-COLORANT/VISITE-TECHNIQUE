#!/usr/bin/env python3
"""Android emulator UI smoke test for an isolated METRA QA installation.
This is not a certification of real-phone stability or online Intranet access.
"""
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = "com.visitetechnique.tablet"
OUT = Path("audit-results")
OUT.mkdir(exist_ok=True)
RESULT = {"device": "Android emulator", "package": PKG, "steps": [], "warnings": [], "errors": [], "scope": "fresh install, offline navigation and local visit"}
STAMP = time.time()

def adb(*args, timeout=35, check=True):
    proc = subprocess.run(["adb", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if check and proc.returncode:
        raise RuntimeError("adb " + " ".join(args) + ": " + (proc.stderr or proc.stdout)[-600:])
    return proc.stdout

def folded(s):
    t = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(c for c in t if not unicodedata.combining(c)).casefold()

def app_running():
    return bool(adb("shell", "pidof", PKG, check=False).strip())

def dump():
    adb("shell", "uiautomator", "dump", "--compressed", "/sdcard/metra_ui.xml", timeout=45, check=False)
    data = adb("exec-out", "cat", "/sdcard/metra_ui.xml", timeout=30, check=False)
    index = data.find("<?xml")
    if index < 0:
        return []
    try:
        root = ET.fromstring(data[index:])
    except ET.ParseError:
        return []
    return [node.attrib for node in root.iter("node")]

def describe(node):
    return (node.get("text") or "") + " " + (node.get("content-desc") or "")

def find(nodes, labels):
    for label in labels:
        wanted = folded(label)
        exact = [n for n in nodes if wanted == folded(n.get("text")) or wanted == folded(n.get("content-desc"))]
        partial = [n for n in nodes if wanted in folded(describe(n))]
        for n in exact + partial:
            coords = re.findall(r"\d+", n.get("bounds", ""))
            if len(coords) == 4 and int(coords[2]) > int(coords[0]) and int(coords[3]) > int(coords[1]):
                return n
    return None

def snapshot(label):
    path = OUT / ("emulator-" + label + ".png")
    with open(path, "wb") as f:
        p = subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, stderr=subprocess.PIPE, timeout=30)
    return str(path) if p.returncode == 0 else ""

def record(step, ok, detail=""):
    RESULT["steps"].append({"step": step, "pass": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + step + ((": " + detail) if detail else ""), flush=True)
    if not ok:
        RESULT["errors"].append(step + ": " + detail)

def verify_alive():
    if not app_running():
        raise RuntimeError("METRA process disappeared (possible native crash)")
    nodes = dump()
    visible = " ".join(describe(n) for n in nodes)
    if "Réglages temporairement indisponibles" in visible or "L’écran a rencontré un problème" in visible:
        raise RuntimeError("React error boundary displayed: " + visible[-700:])
    return nodes

def await_label(labels, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        nodes = verify_alive()
        match = find(nodes, labels)
        if match:
            return match
        time.sleep(2)
    return None

def tap(labels, seconds=20):
    node = await_label(labels, seconds)
    if not node:
        return False
    x1,y1,x2,y2 = map(int,re.findall(r"\d+",node["bounds"]))
    adb("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(2)
    verify_alive()
    return True

def await_modal_dismissed(modal_title, return_label, seconds=12):
    # uiautomator peut servir un ancien XML pendant l'animation de fermeture.
    # Attendre que l'ecran principal soit de nouveau visible au lieu de faire
    # un seul dump immediat qui donne un faux echec.
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        nodes = dump()
        if nodes and not find(nodes, [modal_title]) and find(nodes, [return_label]):
            return True
        time.sleep(1)
    return False

def fatal_logs():
    log = adb("logcat","-d","-v","brief","AndroidRuntime:E","ReactNativeJS:E","*:S",timeout=30,check=False)
    (OUT/"emulator-logcat-errors.txt").write_text(log[-180000:],encoding="utf-8")
    return "\n".join(line for line in log.splitlines() if "FATAL EXCEPTION" in line or ("ReactNativeJS" in line and any(t in line for t in ["TypeError", "ReferenceError", "Invariant Violation"])))

def main():
    try:
        adb("wait-for-device", timeout=90)
        adb("shell", "pm", "path", PKG)
        adb("logcat", "-c", check=False)
        launch = adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1", timeout=45)
        print("LAUNCHER: " + launch[-500:], flush=True)
        deadline = time.monotonic() + 65
        while time.monotonic() < deadline and not app_running():
            time.sleep(1)
        if not app_running():
            raise RuntimeError("METRA did not create a process 65 seconds after launch. " + launch[-300:])
        home = await_label(["Accueil","Réglages","Nouvelle visite"], 85)
        record("application opens without closing", bool(home), "main tab visible" if home else "home navigation inaccessible")
        snapshot("home")
        if not home: return 1

        settings = tap(["Réglages"], seconds=35)
        record("navigate to Réglages", settings)
        if not settings: return 1
        panel = await_label(["Équipements", "Equipements"], seconds=25)
        record("settings tabs rendered", bool(panel))
        snapshot("settings")
        if not panel:return 1

        clicked = tap(["Équipements", "Equipements"], seconds=25)
        record("open Équipements tab", clicked)
        if not clicked:return 1
        catalogue = await_label(["Catalogue matériel"], seconds=100)
        if not catalogue:
            names = " | ".join(describe(n) for n in dump() if describe(n).strip())[:800]
            record("equipment catalog becomes usable", False, names)
            snapshot("catalog-error")
            return 1
        record("equipment catalog becomes usable", True)
        snapshot("catalogue")
        for tab in ["Modèles","Catégories","Marques"]:
            ok=tap([tab],seconds=20)
            record("catalog tab " + tab,ok)
            if not ok:break
        snapshot("catalog-tabs")
        if fatal_logs():
            record("no fatal ReactNativeJS or AndroidRuntime errors", False, fatal_logs()[-500:])
            return 1
        record("no fatal ReactNativeJS or AndroidRuntime errors", True)

        # Supplemental navigation tests; not treated as a full field-device acceptance.
        if tap(["Accueil"], seconds=20):
            record("return to Accueil from catalogue", True)
            if tap(["Nouvelle visite"], seconds=18):
                record("open quick visit sheet", bool(await_label(["Démarrer la visite"],seconds=22)))
                snapshot("quick-visit")
                if tap(["Démarrer la visite"], seconds=10):
                    note = tap(["Note"], seconds=35)
                    record("visit Note shortcut", note)
                    if note:
                        snapshot("note")
                        note_tap = tap(["Fermer"], seconds=12)
                        note_closed = note_tap and await_modal_dismissed("Note libre — ICPE", "Anomalie")
                        record("Note: close action is clickable and modal dismisses", note_closed)
                    anomaly = tap(["Anomalie"], seconds=15)
                    record("visit Anomalie shortcut", anomaly)
                    if anomaly:
                        snapshot("anomalie")
                        anomaly_tap = tap(["Annuler"], seconds=12)
                        anomaly_closed = anomaly_tap and await_modal_dismissed("Ajouter une anomalie", "Anomalie")
                        if not anomaly_closed:
                            snapshot("anomalie-after-cancel")
                            print("ANOMALIE CLOSE UNCONFIRMED, cancel_tap=" + str(anomaly_tap), flush=True)
                        record("Anomalie: cancel action is clickable and modal dismisses", anomaly_closed)
                else:
                    RESULT["warnings"].append("Quick visit creation not reachable on this emulator")
            else:
                RESULT["warnings"].append("Quick visit button was not exposed in the emulator accessibility tree")
        else:
            RESULT["warnings"].append("Could not navigate to Accueil from the catalogue UI")
        return 1 if RESULT["errors"] else 0
    except Exception as exc:
        record("emulator instrumentation", False, repr(exc))
        snapshot("failure")
        return 1
    finally:
        try:
            errs=fatal_logs()
            if errs:
                RESULT["errors"].append("Android logs: " + errs[-1500:])
            rawlog=adb("logcat", "-d", "-v", "brief", timeout=35, check=False)
            filtered=[line for line in rawlog.splitlines() if any(k in line for k in
                [PKG, "AndroidRuntime", "FATAL EXCEPTION", "libc", "crash_dump", "ReactNativeJS", "ActivityTaskManager", "am_crash"])]
            (OUT/"emulator-app-activity.txt").write_text("\n".join(filtered[-1200:]),encoding="utf-8")
            (OUT/"emulator-activity-dumpsys.txt").write_text(adb("shell","dumpsys","activity","activities",timeout=30,check=False)[-12000:],encoding="utf-8")
        except Exception as exc:
            RESULT["warnings"].append("Could not collect logcat: " + repr(exc))
        RESULT["elapsed_seconds"]=round(time.time()-STAMP,1)
        (OUT/"metra-emulator-smoke.json").write_text(json.dumps(RESULT,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("SMOKE SUMMARY "+json.dumps({"checks":len(RESULT["steps"]),"errors":len(RESULT["errors"]),"warnings":len(RESULT["warnings"])}),flush=True)

if __name__=="__main__":
    sys.exit(main())

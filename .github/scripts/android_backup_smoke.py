#!/usr/bin/env python3
"""Native METRA Google Play AES ZIP smoke on a disposable Android 16 emulator.

Creates only a synthetic fresh installation. NEVER run on a real user's device.
Tests the actual Android ZIP implementation, protected archive format,
password authentication and returned manifest, not just JS static contracts.
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import android_emulator_smoke as ui

PKG = "com.visitetechnique.tablet"
PASSWORD = "QA-Only-Backup-2026-Strong"
OUT = Path("audit-results/native-encrypted-backup")
OUT.mkdir(parents=True, exist_ok=True)
RESULT = {"checks": [], "errors": [], "warnings": [], "device": "Android 16 emulator", "data": "fresh disposable"}
def record(key, ok, detail=""):
    RESULT["checks"].append({"step": key, "pass": bool(ok), "detail": detail})
    if not ok:
        RESULT["errors"].append(key + ": " + detail)
    print(("PASS " if ok else "FAIL ") + key + ": " + detail, flush=True)
def adb(*argv, check=True, timeout=40):
    return subprocess.run(["adb", *argv], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
        check=check).stdout
def input_password(label):
    node = ui.await_label([label], seconds=18)
    if not node:
        return False
    a = list(map(int, re.findall(r"\d+", node["bounds"])))
    adb("shell", "input", "tap", str((a[0]+a[2])//2), str((a[1]+a[3])//2))
    adb("shell", "input", "text", PASSWORD)
    return True
def tap_scrolling(label, max_scrolls=5):
    for attempt in range(max_scrolls):
        if ui.tap([label], seconds=4):
            return True
        adb("shell","input","swipe","550","1500","550","520","320")
        time.sleep(0.8)
    return False
def private_archive_path():
    # The final build keeps a durable private copy. The early #39 candidate
    # had a temporary cache copy while Android's Sharesheet was open.
    for root in [f"/data/user/0/{PKG}/files/metra-encrypted-backups",
                 f"/data/user/0/{PKG}/cache"]:
        out = adb("shell","find",root,"-maxdepth","1","-name","METRA_Chiffre_*.zip",
            check=False,timeout=15)
        found = next((line.strip() for line in out.splitlines() if line.strip().endswith(".zip")),None)
        if found:
            return found
    return None
def export_test():
    adb("wait-for-device")
    adb("root",check=False)
    adb("wait-for-device")
    adb("shell","monkey","-p",PKG,"-c","android.intent.category.LAUNCHER","1")
    assert ui.await_label(["Réglages"],seconds=80), "Home not available"
    record("home visible",True)
    assert ui.tap(["Réglages"],seconds=24), "Cannot reach settings"
    record("settings opens",True)
    assert tap_scrolling("Données"), "Cannot reach data tab"
    record("data tab opens",True)
    assert tap_scrolling("Exporter une sauvegarde chiffrée"), "No encrypted backup button"
    record("encrypted backup dialog opens",True)
    ui.snapshot("backup-form")
    assert input_password("Mot de passe sauvegarde"), "Password field missing"
    assert input_password("Confirmer mot de passe sauvegarde"), "Confirmation field missing"
    adb("shell","input","keyevent","KEYCODE_BACK",check=False)
    assert tap_scrolling("Créer le ZIP chiffré"), "Cannot confirm encrypted ZIP"
    record("AES ZIP creation requested",True)
    archive=None
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        archive=private_archive_path()
        if archive:
            size = adb("shell","stat","-c","%s",archive,check=False).strip()
            if size.isdigit() and int(size)>1024:
                break
        time.sleep(2)
    assert archive, "ZIP not present in private encrypted-backups directory"
    ui.snapshot("android-share-sheet")
    record("encrypted ZIP retained in private storage",True)
    result=subprocess.run(["adb","exec-out","cat",archive],capture_output=True,timeout=50)
    assert result.returncode==0 and result.stdout, "Cannot read synthetic QA archive"
    out=OUT/"metra-qa-encrypted.zip"
    out.write_bytes(result.stdout)
    try:
        import pyzipper
        with pyzipper.AESZipFile(out) as z:
            names=z.namelist()
            assert "manifest.json" in names, "Missing manifest.json"
            assert "database/visite_technique.db" in names, "Missing SQLite database"
            assert all(item.flag_bits & 0x01 for item in z.infolist() if not item.is_dir()), "A plaintext ZIP member"
            z.setpassword(PASSWORD.encode())
            manifest=json.loads(z.read("manifest.json").decode("utf-8"))
            assert manifest.get("formatVersion")==2, manifest
            assert manifest.get("encryption")=="AES-256", manifest
            assert manifest.get("counts",{}).get("visites",0)>=0, manifest
            assert "data/visite-technique/" in manifest.get("dataRoots",[]), manifest
            assert "data/metra-missions/" in manifest.get("dataRoots",[]), manifest
            record("native AES-256 ZIP decrypts with correct password",True, str(manifest.get("counts")))
            try:
                with pyzipper.AESZipFile(out) as bad:
                    bad.setpassword(b"bad-password")
                    bad.read("manifest.json")
            except Exception:
                record("wrong password rejected",True)
            else:
                record("wrong password rejected",False,"Bad passphrase extracted manifest!")
    finally:
        # QA archive contains a disposable synthetic database only.
        out.unlink(missing_ok=True)

def main():
    try:
        export_test()
        return int(bool(RESULT["errors"]))
    except Exception as e:
        record("native backup smoke",False,str(e))
        try: ui.snapshot("backup-smoke-failure")
        except Exception: pass
        return 1
    finally:
        try:
            log=adb("logcat","-d","-v","brief",check=False,timeout=30)
            lines=[x for x in log.splitlines() if "FATAL EXCEPTION" in x or "ReactNativeJS" in x]
            (OUT/"android-errors.txt").write_text("\n".join(lines[-120:]),encoding="utf-8")
        except Exception: pass
        (OUT/"result.json").write_text(json.dumps(RESULT,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("BACKUP_SMOKE "+json.dumps({"checks":len(RESULT["checks"]),"errors":len(RESULT["errors"])}),flush=True)
if __name__=="__main__":
    sys.exit(main())

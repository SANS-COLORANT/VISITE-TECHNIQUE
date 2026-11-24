#!/usr/bin/env python3
"""Synthetic-only AAB acceptance: same QA signer, real bundletool APKs,
old -> new in-place update, native ZIP export/import and legacy v1 import.
No real clients, no production Intranet, no production signing key.
"""
import hashlib
import json
import os
import re
import shlex
import sqlite3
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from PIL import Image
import pyzipper
import android_emulator_smoke as ui
import android_backup_smoke as aes

PKG = ui.PKG
ROOT = "/data/user/0/" + PKG + "/files/"
DB = ROOT + "SQLite/visite_technique.db"
OUT = Path("audit-results/aab-retention")
OUT.mkdir(parents=True, exist_ok=True)
PASS = aes.PASSWORD
WRONG = "QA-Wrong-Password-2026"
ID = "metra-qa-retention-"
PHOTO = "visite-technique/photos/qa-retention.png"
DOC = "metra-missions/qa-retention.txt"
HISTORY = "visite-technique/qa-history/qa-retention.png"
report = {"scope":"disposable synthetic Android 16; signed input AABs converted using one disposable QA signer","steps":[]}
tmp = Path(tempfile.mkdtemp(prefix="metra-aab-qa-"))

def run(*args, check=True, timeout=100):
    p = subprocess.run(args, capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError("Command failed: " + str(args[:4]) + " " + p.stderr.decode(errors="replace")[-800:])
    return p

def adb(*args, check=True, timeout=100):
    return run("adb",*args,check=check,timeout=timeout).stdout.decode(errors="replace")

def root_emulator():
    # ADB can reconnect during adbd restart. Retry infrastructure readiness,
    # not application assertions or failed restore operations.
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        try:
            adb('wait-for-device',timeout=20)
            assert adb('shell','getprop','ro.kernel.qemu').strip()=='1','physical device refused'
            if adb('shell','id','-u').strip()=='0':return
            adb('root',timeout=20,check=False)
        except (RuntimeError,subprocess.TimeoutExpired):pass
        time.sleep(3)
    raise RuntimeError('Disposable emulator root connection unavailable')

def shell(command, check=True):
    return adb("shell",command,check=check).strip()

def mark(name, detail=""):
    report["steps"].append({"name":name,"status":"PASS","detail":detail})
    print("PASS "+name+" "+detail,flush=True)

def stop():
    adb("shell","am","force-stop",PKG)
    time.sleep(1)

def launch():
    adb("shell","monkey","-p",PKG,"-c","android.intent.category.LAUNCHER","1")
    deadline=time.monotonic()+90
    while time.monotonic()<deadline and not ui.app_running():
        time.sleep(1)
    if not ui.app_running():
        (OUT/'startup-logcat.txt').write_text(adb('logcat','-d','-t','3000',check=False),encoding='utf-8')
        raise AssertionError('app process missing; startup-logcat.txt preserved')
    assert ui.await_label(["Réglages"],seconds=100),"home unavailable"

def pull(remote, local):
    run("adb","pull",remote,str(local))

def db_snapshot(tag):
    stop()
    folder=tmp/tag
    folder.mkdir(exist_ok=True)
    path=folder/"visite_technique.db"
    pull(DB,path)
    for s in ("-wal","-shm"):
        p=run("adb","shell","test","-f",DB+s,check=False)
        if p.returncode==0: pull(DB+s,Path(str(path)+s))
    con=sqlite3.connect(path)
    assert con.execute("PRAGMA integrity_check").fetchone()[0]=="ok","SQLite integrity"
    assert not con.execute("PRAGMA foreign_key_check").fetchall(),"SQLite foreign keys"
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.execute("PRAGMA journal_mode=DELETE")
    con.close()
    return path

def owner():
    value=shell("stat -c %u:%g "+shlex.quote(DB))
    assert re.fullmatch(r"\d+:\d+",value),value
    return value

def put_private(local, remote):
    uid=owner()
    parent=remote.rsplit("/",1)[0]
    shell("mkdir -p "+shlex.quote(parent))
    run("adb","push",str(local),remote)
    shell("chown "+uid+" "+shlex.quote(remote)+"; chmod 600 "+shlex.quote(remote))
    if remote!=DB:
        top=ROOT+remote[len(ROOT):].split("/")[0]
        shell("chown -R "+uid+" "+shlex.quote(top))
        shell("find "+shlex.quote(top)+" -type d -exec chmod 700 {} \\;")
        shell("restorecon -RF "+shlex.quote(top),check=False)
    else:
        shell("restorecon "+shlex.quote(DB),check=False)

def replace_db(path):
    stop()
    shell("rm -f "+ " ".join(shlex.quote(DB+s) for s in ("-wal","-shm","-journal")))
    put_private(path,DB)

def media(tag):
    photo=tmp/("photo-"+tag+".png")
    Image.new("RGB",(32,32),(20,80,160) if tag=="A" else (180,50,30)).save(photo)
    doc=tmp/("doc-"+tag+".txt")
    doc.write_text("SYNTHETIC QA "+tag+"\n",encoding="utf-8")
    return {PHOTO:photo,DOC:doc,HISTORY:photo}

def install_fixture():
    path=db_snapshot("before-seed")
    c=sqlite3.connect(path)
    c.execute("PRAGMA foreign_keys=ON")
    def ins(table,**values):
        cols=",".join('"'+k+'"' for k in values)
        c.execute("INSERT INTO "+table+"("+cols+") VALUES("+",".join("?" for _ in values)+")",tuple(values.values()))
    client,site,visit,mission=[ID+x for x in ("client","site","visit","mission")]
    ins("clients",id=client,nom="SYNTHETIC QA CLIENT")
    ins("sites",id=site,client_id=client,nom_site="SYNTHETIC QA SITE")
    ins("visites",id=visit,site_id=site,date_visite="2026-11-23",technicien="QA")
    ins("notes",visite_id=visit,contenu="QA-A")
    ins("champs_visite",visite_id=visit,section_code="qa",cle="qa",valeur="QA-A")
    ins("controles_visite",visite_id=visit,section_code="qa",cle="qa",avis="S",commentaire="QA-A")
    ins("reseaux",id=ID+"reseau",visite_id=visit,ordre=1,nom_reseau="QA-A")
    ins("compteurs",id=ID+"compteur",visite_id=visit,label="QA-A",valeur="123",unite="MWh")
    ins("materiel",id=ID+"materiel",visite_id=visit,designation="QA-A")
    ins("remarques",id=ID+"remarque",visite_id=visit,prestation="QA-A")
    ins("photos",id=ID+"photo",visite_id=visit,uri="file://"+ROOT+PHOTO,label="QA-A")
    ins("missions",id=mission,label="QA-A")
    ins("mission_documents",id=ID+"doc",mission_id=mission,name="QA-A",file_uri="file://"+ROOT+DOC)
    c.commit()
    assert not c.execute("PRAGMA foreign_key_check").fetchall()
    c.close()
    replace_db(path)
    for rel,f in media("A").items(): put_private(f,ROOT+rel)

def digest(f):
    return hashlib.sha256(Path(f).read_bytes()).hexdigest()

def snapshot(tag):
    path=db_snapshot(tag)
    c=sqlite3.connect(path)
    selectors={
      "clients":("id","nom"),"sites":("id","client_id","nom_site"),
      "visites":("id","site_id","date_visite","technicien"),
      "notes":("visite_id","contenu"),"champs_visite":("visite_id","section_code","cle","valeur"),
      "controles_visite":("visite_id","section_code","cle","avis","commentaire"),
      "reseaux":("id","visite_id","nom_reseau"),"compteurs":("id","visite_id","label","valeur","unite"),
      "materiel":("id","visite_id","designation"),"remarques":("id","visite_id","prestation"),
      "photos":("id","visite_id","uri","label"),"missions":("id","label"),
      "mission_documents":("id","mission_id","name","file_uri")}
    rows={}
    for table,cols in selectors.items():
        key=cols[0]
        rows[table]=c.execute("SELECT "+",".join(cols)+" FROM "+table+" WHERE "+key+" LIKE ? ORDER BY "+key,(ID+"%",)).fetchall()
        assert len(rows[table])==1,table+" missing/duplicated"
    c.close()
    hashes={}
    for rel in (PHOTO,DOC,HISTORY):
        p=path.parent/(rel.replace("/","_"))
        pull(ROOT+rel,p)
        hashes[rel]=digest(p)
    result={"rows":rows,"media_sha256":hashes}
    (OUT/(tag+".json")).write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return result,path

def change_to_B():
    path=db_snapshot("before-mutation")
    c=sqlite3.connect(path)
    c.execute("UPDATE notes SET contenu='QA-B' WHERE visite_id=?",(ID+"visit",))
    c.execute("UPDATE photos SET label='QA-B' WHERE id=?",(ID+"photo",))
    c.execute("UPDATE mission_documents SET name='QA-B' WHERE id=?",(ID+"doc",))
    c.commit();c.close()
    replace_db(path)
    for rel,f in media("B").items(): put_private(f,ROOT+rel)

def external_file(path):
    run("adb","push",str(path),"/sdcard/Download/"+path.name)
    adb("shell","am","broadcast","-a","android.intent.action.MEDIA_SCANNER_SCAN_FILE","-d","file:///sdcard/Download/"+path.name,check=False)
    return path.name

def tap_raw(node):
    x1,y1,x2,y2=map(int,re.findall(r"\d+",node["bounds"]))
    adb("shell","input","tap",str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(1.2)

def wait_node(labels, seconds=45):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        n=ui.find(ui.dump(),labels)
        if n:return n
        time.sleep(1)
    return None

def select_document(name):
    deadline=time.monotonic()+90
    opened=False
    while time.monotonic()<deadline:
        nodes=ui.dump()
        node=ui.find(nodes,[name,name.removesuffix(".zip")])
        if node:
            tap_raw(node)
            return
        if not opened:
            nav=ui.find(nodes,["Show roots","Open from","Afficher les racines","Ouvrir depuis","Afficher les dossiers"])
            if nav: tap_raw(nav);opened=True;continue
        d=ui.find(nodes,["Downloads","Téléchargements","Download"])
        if d:tap_raw(d);opened=True;continue
        time.sleep(2)
    ui.snapshot("restore-document-picker-failure")
    raise AssertionError("Document picker could not select "+name)

def restore(name, password=None, legacy=False, expect_ok=True, partial=False):
    stop();launch()
    assert ui.tap(["Réglages"],seconds=35)
    assert aes.tap_scrolling("Données")
    assert aes.tap_scrolling("Restaurer une sauvegarde ZIP")
    if legacy:
        assert ui.tap(["Importer une ancienne sauvegarde ZIP non chiffrée"],seconds=20)
    else:
        assert password is not None
        node=next((n for n in ui.dump() if "EditText" in n.get("class","")),None)
        assert node,"restore password EditText not visible"
        tap_raw(node)
        adb("shell","input","text",password)
        adb("shell","input","keyevent","KEYCODE_BACK",check=False)
        time.sleep(1.2)
    if partial:
        assert aes.tap_scrolling("Autoriser la restauration partielle")
    assert aes.tap_scrolling("Choisir le ZIP")
    assert ui.tap(["Choisir une sauvegarde"],seconds=25)
    select_document(name)
    label=("Restauration partielle terminée" if partial else "Restauration terminée") if expect_ok else "Restauration impossible"
    other="Restauration impossible" if expect_ok else "Restauration terminée"
    deadline=time.monotonic()+150
    while time.monotonic()<deadline:
        nodes=ui.dump()
        if ui.find(nodes,[other]):
            ui.snapshot("restore-unexpected-"+name)
            raise AssertionError("Unexpected restore result: "+" | ".join(ui.describe(n) for n in nodes if ui.describe(n).strip())[-1200:])
        if ui.find(nodes,[label]):
            ui.snapshot("restore-result-"+name)
            stop();return
        if not ui.app_running():raise AssertionError("METRA disappeared during restore")
        time.sleep(2)
    raise AssertionError("Restore result not shown: "+name)

def make_v1(path, name, broken=False):
    # Faithful format from historical databaseBackup.js; synthetic, not a claim
    # of having exported from a physical old APK. Only visit photos were in v1.
    legacydb=tmp/(name+".db")
    legacydb.write_bytes(path.read_bytes())
    if not broken:
        c=sqlite3.connect(legacydb)
        c.execute("UPDATE photos SET uri=? WHERE id=?",("file:///data/user/10/"+PKG+"/files/"+PHOTO,ID+"photo"))
        c.commit();c.close()
    else:
        legacydb.write_bytes(b"not-a-sqlite-database"*200)
    out=tmp/name
    manifest={"format":"visite-technique-backup","formatVersion":1,"schemaVersion":51,
        "database":"database/visite_technique.db","photosRoot":"photos/","counts":{"visites":1,"photos":1}}
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json",json.dumps(manifest))
        z.write(legacydb,"database/visite_technique.db")
        z.write(media("A")[PHOTO],"photos/qa-retention.png")
    return out

def main():
    assert len(sys.argv)==3,"Usage: script OLD_APK NEW_APK"
    assert adb("get-state").strip()=="device"
    assert adb("shell","getprop","ro.kernel.qemu").strip()=="1","refuse any physical device"
    root_emulator()
    assert adb("shell","id","-u").strip()=="0","root only on disposable emulator"
    adb("shell","svc","wifi","disable",check=False)
    adb("shell","svc","data","disable",check=False)
    adb("install",sys.argv[1]);launch()
    install_fixture();launch()
    a0,_=snapshot("01-old-AAB")
    mark("Previous AAB fixture SQLite and three media files")
    adb("install","-r",sys.argv[2]);launch()
    a,apath=snapshot("02-new-AAB-after-update")
    assert a==a0,"update changed synthetic rows or media"
    mark("Previous to new AAB in-place update, no uninstall, equality of 13 tables and 3 SHA256")
    aes.export_test()
    arc=aes.private_archive_path()
    assert arc,"native encrypted archive absent"
    encrypted=tmp/"qa-encrypted-A.zip";pull(arc,encrypted)
    with pyzipper.AESZipFile(encrypted) as z:
        z.setpassword(PASS.encode())
        for rel,expected in a["media_sha256"].items():
            assert hashlib.sha256(z.read("data/"+rel)).hexdigest()==expected,rel
    mark("New AAB native AES archive contains all three exact media")
    v1=make_v1(apath,"qa-legacy-A.zip")
    corrupt=make_v1(apath,"qa-corrupt-v1.zip",broken=True)
    names=[external_file(f) for f in (encrypted,v1,corrupt)]
    change_to_B();launch()
    b,_=snapshot("03-current-B")
    assert b!=a,"fixture mutation did not take effect"
    restore(names[0],WRONG,expect_ok=False);launch()
    got,_=snapshot("04-wrong-password")
    assert got==b,"wrong password changed existing data"
    mark("wrong password rejected without data changes")
    restore(names[0],PASS);launch()
    got,_=snapshot("05-AES-restored")
    assert got==a,"AES restore differs from source"
    mark("native AES restore recovers exact SQLite fixture and media SHA256")
    change_to_B();launch()
    b,_=snapshot("06-before-corrupt")
    restore(names[2],legacy=True,expect_ok=False);launch()
    got,_=snapshot("07-corrupt-rejected")
    assert got==b,"corrupt ZIP damaged original data / rollback"
    mark("corrupt SQLite in legacy ZIP rejected; existing data preserved")
    restore(names[1],legacy=True);launch()
    got,_=snapshot("08-legacy-restored")
    assert got["rows"]==a["rows"],"v1 restored rows differ"
    assert got["media_sha256"][PHOTO]==a["media_sha256"][PHOTO],"legacy photo hash differs"
    for rel in (DOC,HISTORY):
        assert got["media_sha256"][rel]==b["media_sha256"][rel],"legacy import overwrote non-archived media"
    mark("legacy v1 import restores visit rows/photo and rebases old Android URI; preserves non-archived files")
    fatal=ui.fatal_logs()
    assert not fatal,"fatal native/React log: "+fatal[-1000:]
    mark("no fatal Android/React errors")

if __name__=="__main__":
    try:
        main()
    except Exception as e:
        report["error"]=str(e)
        try:ui.snapshot("aab-retention-failure")
        except Exception:pass
        raise
    finally:
        (OUT/"result.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        try:ui.fatal_logs()
        except Exception:pass

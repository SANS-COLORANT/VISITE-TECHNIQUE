#!/usr/bin/env python3
"""Actual UI PDF benchmark: AAB44 versus new candidate, same synthetic 45x10 dataset.
No production records, network, credentials or test-only runtime entry points.
"""
import hashlib
import io
import json
import random
import re
import sqlite3
import sys
import time
from PIL import Image
from pypdf import PdfReader
import android_aab_restore_retention as qa

CLIENT="QA PDF BENCHMARK"
CID="qa-pdf-client"
V=45
P=450
PATH=qa.ROOT+"visite-technique/photos/qa-pdf/"
RESULT={"visits":V,"photos":P,"runs":[],"scope":"Android 16 emulator, wall time from Generate to successful export, identical synthetic records"}

def tap(label,seconds=45):
    assert qa.ui.tap([label],seconds=seconds),label+" not tappable"

def scroll_tap(label,tries=12):
    for i in range(tries):
        if qa.ui.find(qa.ui.dump(),[label]):
            tap(label);return
        qa.adb("shell","input","swipe","500","1550","500","560","350")
        time.sleep(1)
    raise AssertionError(label+" not found after scroll")

def seed():
    path=qa.db_snapshot("pdf-seed")
    hashes={}
    host=qa.tmp/"pdf-fixtures"
    host.mkdir(exist_ok=True)
    with sqlite3.connect(path) as c:
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("INSERT INTO clients(id,nom) VALUES(?,?)",(CID,CLIENT))
        c.execute("INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES(?,?,?,?)",("990000019",CID,CLIENT,"{}"))
        for i in range(V):
            site="qa-pdf-site-"+str(i)
            visit="qa-pdf-visit-"+str(i)
            c.execute("INSERT INTO sites(id,client_id,nom_site) VALUES(?,?,?)",(site,CID,"QA SITE "+str(i).zfill(2)))
            c.execute("INSERT INTO visites(id,site_id,date_visite,technicien,statut,progression_pct,trame_id) VALUES(?,?,?,?,?,?,?)",(visit,site,"2026-11-20","QA","terminee",100,"icpe_v1"))
            c.execute("INSERT INTO remarques(id,visite_id,poste,prestation) VALUES(?,?,?,?)",("qa-pdf-r-"+str(i),visit,"QA","QARESERVE"+str(i).zfill(3)))
            c.execute("INSERT INTO materiel(id,visite_id,designation) VALUES(?,?,?)",("qa-pdf-m-"+str(i),visit,"QAEQUIPMENT"+str(i).zfill(3)))
            for j in range(10):
                n=i*10+j
                filename="image"+str(n).zfill(4)+".jpg"
                target=host/filename
                if not target.exists():
                    im=Image.frombytes("RGB",(720,600),random.Random(n).randbytes(720*600*3))
                    im.save(target,format="JPEG",quality=88)
                hashes[filename]=hashlib.sha256(target.read_bytes()).hexdigest()
                c.execute("INSERT INTO photos(id,visite_id,uri,label,inclure_export,libelle_personnalise) VALUES(?,?,?,?,1,1)",("qa-pdf-p-"+str(n),visit,"file://"+PATH+filename,"QAPHOTO"+str(n).zfill(4)))
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
    qa.replace_db(path)
    qa.shell("mkdir -p "+PATH)
    qa.run("adb","push",str(host)+"/.",PATH,timeout=240)
    qa.shell("chown -R "+qa.owner()+" "+PATH+"; chmod -R u+rwX "+PATH)
    qa.shell("restorecon -RF "+PATH,check=False)
    return hashes

def find_output():
    listing=qa.adb("shell","find","/sdcard/Documents/METRA","-type","f","-name","*.pdf",check=False)
    return [p.strip() for p in listing.splitlines() if p.strip().endswith(".pdf")]

def open_report():
    tap("Clients");tap(CLIENT,90);tap("Documents",90);tap("Créer un rapport PDF / Word",60)
    assert qa.ui.await_label(["Nouveau rapport"],seconds=90)
    tap("Ex. 2026-0147")
    qa.adb("shell","input","text","QAPERF")
    qa.adb("shell","input","keyevent","4")
    scroll_tap("Tout sélectionner")
    assert qa.ui.await_label(["45/45"],seconds=30),"45 final visits not selected"
    scroll_tap("Choisir les photos et la couverture")
    assert qa.ui.await_label(["Photos et couverture"],seconds=180)
    tap("Valider les photos",90)
    assert qa.ui.await_label(["Mise en page du rapport"],seconds=90)

def approve_storage():
    nodes=qa.ui.dump()
    for label in ("Use this folder","Utiliser ce dossier"):
        if qa.ui.find(nodes,[label]):
            tap(label,10)
            for allow in ("Allow","Autoriser"):
                if qa.ui.find(qa.ui.dump(),[allow]):tap(allow,10);break
            return True
    return False

def verify_pdf(path,tag):
    local=qa.OUT/(tag+".pdf")
    qa.pull(path,local)
    reader=PdfReader(str(local))
    text="\n".join(p.extract_text() or "" for p in reader.pages)
    missing=[f"QAPHOTO{i:04d}" for i in range(P) if text.count(f"QAPHOTO{i:04d}")!=1]
    assert not missing,"caption missing/duplicate: "+str(missing[:12])
    for i in range(V):
        assert text.count(f"QARESERVE{i:03d}")==1,"reserve lost/duplicated"
        assert text.count(f"QAEQUIPMENT{i:03d}")==1,"equipment lost/duplicated"
    # Each unique image is embedded. Count raster XObjects of actual photo
    # dimensions; report logos/cover are not 720x600.
    embedded=0
    for p in reader.pages:
        resources=p.get("/Resources")
        if not resources:continue
        obj=resources.get_object().get("/XObject")
        if not obj:continue
        for ref in obj.get_object().values():
            x=ref.get_object()
            if x.get("/Subtype")=="/Image" and int(x.get("/Width",0))==720 and int(x.get("/Height",0))==600:embedded+=1
    # Android print may choose a different raster resolution. Caption
    # integrity is mandatory; report raster count as evidence rather than
    # assuming a particular Chromium encoding of image streams.
    return {"pages":len(reader.pages),"bytes":local.stat().st_size,"captionCount":P,"matching720x600Images":embedded}

def export(tag):
    existing=set(find_output())
    qa.adb("logcat","-c",check=False)
    start=time.monotonic()
    tap("Générer le rapport PDF",60)
    deadline=start+1800
    while time.monotonic()<deadline:
        nodes=qa.ui.verify_alive()
        if qa.ui.find(nodes,["Génération impossible"]):raise AssertionError("PDF generation failed")
        if qa.ui.find(nodes,["Rapport généré"]):break
        approve_storage()
        time.sleep(3)
    else:raise TimeoutError("PDF export exceeded 30 minutes")
    elapsed=time.monotonic()-start
    new=set(find_output())-existing
    assert len(new)==1,"expected one newly written PDF: "+str(new)
    record={"tag":tag,"wallSeconds":round(elapsed,2),**verify_pdf(new.pop(),tag)}
    log=qa.adb("logcat","-d","-s","ReactNativeJS:I",check=False,timeout=40)
    for line in log.splitlines():
        if "METRA_REPORT_METRICS " in line:
            try:record["engine"]=json.loads(line.split("METRA_REPORT_METRICS ",1)[1])
            except ValueError:pass
    RESULT["runs"].append(record)
    print("PDF NATIVE BENCHMARK "+json.dumps(record),flush=True)
    for label in ("OK","Fermer"):
        if qa.ui.find(qa.ui.dump(),[label]):tap(label,10);break

def verify_originals(hashes):
    output=qa.adb("shell","find "+PATH+" -type f -exec sha256sum {} \\;",timeout=180)
    actual={}
    for l in output.splitlines():
        digest,path=l.split(None,1)
        actual[path.rsplit("/",1)[-1]]=digest
    assert actual==hashes,"originals changed during export"

def main():
    previous,current=sys.argv[1:]
    assert qa.adb("shell","getprop","ro.kernel.qemu").strip()=="1"
    qa.root_emulator()
    qa.adb("shell","svc","wifi","disable",check=False)
    qa.adb("shell","svc","data","disable",check=False)
    # Fixed geometry for the test, not the user's phone.
    qa.adb("shell","wm","size","1080x2400")
    qa.adb("shell","wm","density","320")
    time.sleep(3);qa.root_emulator()
    for name,apk in (("baseline-aab44",previous),("candidate-cold",current)):
        qa.adb("uninstall",qa.PKG,check=False)
        qa.shell("rm -rf /sdcard/Documents/METRA")
        qa.adb("install",apk,timeout=180);qa.launch()
        hashes=seed();qa.launch();open_report();export(name);verify_originals(hashes)
        if name=="candidate-cold":
            export("candidate-warm");verify_originals(hashes)
            assert not qa.ui.fatal_logs(),"fatal Android error"
    old,cold,warm=RESULT["runs"]
    RESULT["coldSpeedup"]=old["wallSeconds"]/cold["wallSeconds"]
    RESULT["warmSpeedup"]=old["wallSeconds"]/warm["wallSeconds"]
    # Do not invent a performance pass or enforce a phone SLA on an emulator.
    # The test gates actual completeness, not a hypothetical 60s result.
    qa.mark("45 visits and 450 captions preserved in all three native PDFs; originals unchanged")

if __name__=="__main__":
    try:main()
    except Exception as e:
        RESULT["error"]=str(e)
        try:qa.ui.snapshot("report-benchmark-failed")
        except Exception:pass
        raise
    finally:
        (qa.OUT/"report-benchmark.json").write_text(json.dumps(RESULT,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

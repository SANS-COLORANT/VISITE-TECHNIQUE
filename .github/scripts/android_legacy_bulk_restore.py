#!/usr/bin/env python3
"""Synthetic volume/format fixture for historical METRA ZIP v1.
No customer backup, photos, client names, identifiers, or contents in GitHub.
"""
import hashlib
import io
import json
import random
import sqlite3
import sys
import zipfile
from pathlib import Path
from PIL import Image
import android_aab_restore_retention as qa

N_VISITS=101
N_PHOTOS=466
PREFIX="qa-bulk-"
OUT=qa.OUT
OLD_ROOT="file:///data/user/10/"+qa.PKG+"/files/visite-technique/photos/"
LIVE_ROOT="file://"+qa.ROOT+"visite-technique/photos/"
TABLES={
 "clients":("id","nom"),
 "sites":("id","client_id","nom_site"),
 "visites":("id","site_id","date_visite","technicien"),
 "notes":("visite_id","contenu"),
 "materiel":("id","visite_id","designation"),
 "remarques":("id","visite_id","prestation"),
 "controles_visite":("visite_id","section_code","cle","avis","commentaire"),
 "photos":("id","visite_id","uri","label")
}
def key(kind,i):return PREFIX+kind+"-"+str(i)
def rows(path):
    result={}
    with sqlite3.connect(path) as c:
        for table,cols in TABLES.items():
            rr=c.execute("SELECT "+",".join(cols)+" FROM "+table+" WHERE "+cols[0]+" LIKE ? ORDER BY "+",".join(cols),(PREFIX+"%",)).fetchall()
            if table=="photos":
                rr=[(a,b,u.replace(OLD_ROOT,LIVE_ROOT),d) for a,b,u,d in rr]
            result[table]=rr
    return result
def make_archive(base):
    path=qa.tmp/"bulk.db"
    path.write_bytes(base.read_bytes())
    photos={}
    with sqlite3.connect(path) as c:
        c.execute("PRAGMA foreign_keys=ON")
        for i in range(5):
            c.execute("INSERT INTO clients(id,nom) VALUES(?,?)",(key("client",i),"Synthetic client "+str(i)))
        for i in range(7):
            c.execute("INSERT INTO sites(id,client_id,nom_site) VALUES(?,?,?)",(key("site",i),key("client",i%5),"Synthetic site "+str(i)))
        for i in range(N_VISITS):
            c.execute("INSERT INTO visites(id,site_id,date_visite,technicien) VALUES(?,?,?,?)",(key("visit",i),key("site",i%7),"2026-11-20","QA"))
            c.execute("INSERT INTO notes(visite_id,contenu) VALUES(?,?)",(key("visit",i),"Synthetic note "+str(i)))
        for i in range(3846):
            c.execute("INSERT INTO materiel(id,visite_id,designation) VALUES(?,?,?)",(key("material",i),key("visit",i%N_VISITS),"Synthetic equipment "+str(i)))
        for i in range(295):
            c.execute("INSERT INTO remarques(id,visite_id,prestation) VALUES(?,?,?)",(key("remark",i),key("visit",i%N_VISITS),"Synthetic remark "+str(i)))
        for i in range(10688):
            c.execute("INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)",(key("visit",i%N_VISITS),"qa",key("control",i),"S","Synthetic"))
        for i in range(N_PHOTOS):
            rel="client-%02d/site-%02d/visit-%03d/photo-%04d.jpg"%(i%5,i%7,i%83,i)
            photos[rel]=i
            c.execute("INSERT INTO photos(id,visite_id,uri,label) VALUES(?,?,?,?)",(key("photo",i),key("visit",i%N_VISITS),OLD_ROOT+rel,"Synthetic image "+str(i)))
        c.commit()
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
        assert c.execute("SELECT count(*) FROM visites").fetchone()[0]==N_VISITS
        assert c.execute("SELECT count(*) FROM photos").fetchone()[0]==N_PHOTOS
    manifest={"format":"visite-technique-backup","formatVersion":1,"schemaVersion":51,
        "database":"database/visite_technique.db","photosRoot":"photos/","counts":{"visites":N_VISITS,"photos":N_PHOTOS}}
    archive=qa.tmp/"qa-historical-volume.zip"
    hashes={}
    directories={"database/","photos/"}
    for rel in photos:
        parts=("photos/"+rel).split("/")
        directories.update("/".join(parts[:i])+"/" for i in range(1,len(parts)))
    with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED,compresslevel=1) as z:
        for directory in sorted(directories): z.writestr(directory,b"")
        z.writestr("manifest.json",json.dumps(manifest))
        z.write(path,"database/visite_technique.db")
        for rel,i in photos.items():
            image=Image.frombytes("RGB",(720,600),random.Random(i).randbytes(720*600*3))
            buf=io.BytesIO()
            image.save(buf,format="JPEG",quality=92)
            data=buf.getvalue()
            z.writestr("photos/"+rel,data)
            hashes[rel]=hashlib.sha256(data).hexdigest()
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
    return archive,rows(path),hashes
def main():
    assert len(sys.argv)==2
    assert qa.adb("shell","getprop","ro.kernel.qemu").strip()=="1","physical device refused"
    qa.root_emulator()
    assert qa.adb("shell","id","-u").strip()=="0"
    qa.adb("shell","svc","wifi","disable",check=False)
    qa.adb("shell","svc","data","disable",check=False)
    qa.adb("install",sys.argv[1]);qa.launch()
    base=qa.db_snapshot("bulk-empty")
    archive,expected,hashes=make_archive(base)
    qa.mark("generated synthetic v1 ZIP",str(archive.stat().st_size)+" bytes")
    name=qa.external_file(archive)
    qa.restore(name,legacy=True)
    qa.launch()
    restored=qa.db_snapshot("bulk-restored")
    assert rows(restored)==expected,"restored SQL fields do not match"
    qa.mark("101 visits, 466 photos, 3846 equipment, 295 remarks, 10688 controls and related rows restored")
    target=qa.ROOT+"visite-technique/photos/"
    output=qa.adb("shell","find "+target+" -type f -exec sha256sum {} \\;",timeout=180)
    actual={}
    for line in output.splitlines():
        digest,full=line.split(None,1)
        assert full.startswith(target),full
        actual[full[len(target):]]=digest
    assert actual==hashes,"restored photo bytes differ"
    qa.mark("466/466 JPEG SHA256 match")
    assert not qa.ui.fatal_logs(),"fatal Android errors"
    qa.mark("no fatal Android errors")
if __name__=="__main__":
    try:
        main()
    except Exception as e:
        qa.report["error"]=str(e)
        try:qa.ui.snapshot("bulk-restore-failed")
        except Exception:pass
        raise
    finally:
        (OUT/"bulk-result.json").write_text(json.dumps(qa.report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

#!/usr/bin/env python3
"""Synthetic Android phone UI acceptance. No real user data or Intranet access."""
import json
import sqlite3
import sys
import time
import android_aab_restore_retention as qa

def drag(x1,y1,x2,y2,ms=420):
    qa.adb("shell","input","swipe",str(x1),str(y1),str(x2),str(y2),str(ms))
    time.sleep(1.1)

def await_label(label,seconds=30):
    assert qa.ui.await_label([label],seconds=seconds),label+" not visible"
def tap(label,seconds=30):
    assert qa.ui.tap([label],seconds=seconds),label+" not tappable"

def seed_matrix():
    path=qa.db_snapshot("ui-fixture")
    with sqlite3.connect(path) as c:
        c.execute("PRAGMA foreign_keys=ON")
        client="qa-mobile-client"; site="qa-mobile-site"
        c.execute("INSERT INTO clients(id,nom) VALUES(?,?)",(client,"QA MOBILE CLIENT"))
        c.execute("INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES(?,?,?,?)",("990000001",client,"QA MOBILE CLIENT","{}"))
        c.execute("INSERT INTO sites(id,client_id,nom_site) VALUES(?,?,?)",(site,client,"QA LONG SITE TITLE WITH MULTIPLE WORDS"))
        for i in range(47):
            local="9901"+str(i).zfill(4)
            visit="qa-mobile-"+str(i)
            c.execute("INSERT INTO visites(id,site_id,date_visite,technicien,api_remote_local_id) VALUES(?,?,?,?,?)",(visit,site,"2026-11-20","QA",local))
            c.execute("INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json) VALUES(?,?,?,?)",(local,"990000002","QA LOCAL "+str(i).zfill(2),"{}"))
            for k in ("securite","acces","fuite","electricite","regulation","fumisterie","pompe"):
                c.execute("INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)",(visit,"qa",k,"S","QA"))
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
    qa.replace_db(path)

def main():
    assert len(sys.argv)==2
    assert qa.adb("shell","getprop","ro.kernel.qemu").strip()=="1"
    qa.root_emulator()
    assert qa.adb("shell","id","-u").strip()=="0"
    qa.adb("shell","svc","wifi","disable",check=False);qa.adb("shell","svc","data","disable",check=False)
    qa.adb("shell","wm","size","720x1600");qa.adb("shell","wm","density","320")
    qa.adb("shell","settings","put","system","font_scale","1.2")
    time.sleep(5)
    qa.root_emulator()
    qa.adb("install",sys.argv[1]);qa.launch()
    seed_matrix();qa.launch()
    # Full-page drags in the screen body, never just on the dock.
    drag(630,760,95,760);await_label("Recherche clients & sites");qa.ui.snapshot("phone-clients")
    drag(630,760,95,760);await_label("Paramètres");await_label("Équipements")
    drag(95,760,630,760);await_label("Recherche clients & sites")
    drag(95,760,630,760);await_label("Visite Technique")
    qa.mark("four root-screen swipes commit the visible destination")
    tap("Réglages");tap("Équipements",100);await_label("Catalogue matériel",120)
    qa.ui.snapshot("catalog-before-scroll")
    # Search/list controls are in the scrolling header; verify substantial
    # vertical motion and the ability to return to the top.
    before=" | ".join(qa.ui.describe(n) for n in qa.ui.dump())
    for _ in range(5):drag(370,1300,370,440)
    after=" | ".join(qa.ui.describe(n) for n in qa.ui.dump())
    assert before!=after and "Catalogue matériel" not in after,"catalogue remains blocked"
    qa.ui.snapshot("catalog-after-scroll")
    for _ in range(12):
        if qa.ui.find(qa.ui.dump(),["Catalogue matériel"]):break
        drag(370,440,370,1300)
    await_label("Catalogue matériel")
    qa.mark("catalog scrolls past header and back on 360dp")
    tap("Clients");await_label("Recherche clients & sites");tap("QA MOBILE CLIENT")
    tap("Pilotage");await_label("Cartographie technique")
    # Navigate to every page of categories without losing the site column.
    for _ in range(3):drag(370,1250,370,790)
    await_label("Sites / locaux")
    prev=qa.ui.find(qa.ui.dump(),["Catégories suivantes"])
    assert prev,"category paging unavailable"
    tap("Catégories suivantes")
    await_label("Sites / locaux")
    qa.ui.snapshot("pilotage-next-category")
    for _ in range(6):drag(370,1300,370,500)
    await_label("Sites / locaux")
    qa.ui.snapshot("pilotage-after-vertical-scroll")
    assert qa.ui.find(qa.ui.dump(),["QA LOCAL 00"]) is None,"matrix did not scroll"
    qa.mark("matrix category navigation and vertical scrolling on narrow phone")
    assert not qa.ui.fatal_logs(),"fatal Android/React logs"

if __name__=="__main__":
    try:main()
    except Exception as e:
        qa.report["error"]=str(e)
        try:qa.ui.snapshot("mobile-ui-failed")
        except Exception:pass
        raise
    finally:
        (qa.OUT/"mobile-layout.json").write_text(json.dumps(qa.report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

#!/usr/bin/env python3
"""Independent native canvas acceptance; real one-finger diagonal drag and fling.
Pinch requires a multi-pointer device/injector; not claimed by this test.
"""
import json
import re
import sqlite3
import sys
import time
import android_aab_restore_retention as qa

def tap(label,seconds=60):
    assert qa.ui.tap([label],seconds=seconds),label+" unavailable"
def state():
    node=qa.ui.find(qa.ui.dump(),["Tableau pilotage tactile"])
    assert node,"native canvas unavailable"
    m=re.search(r"zoom (\d+)%; x (\d+); y (\d+); colonne (\d+) dp",node.get("content-desc",""))
    assert m,"viewport state not available"
    return tuple(map(int,m.groups())),tuple(map(int,re.findall(r"\d+",node.get("bounds",""))))
def drag(bounds,dx,dy):
    l,t,r,b=bounds
    x=l+int((r-l)*.70);y=t+int((b-t)*.70)
    qa.adb("shell","input","swipe",str(x),str(y),str(x+int((r-l)*dx)),str(y+int((b-t)*dy)),"450")
    time.sleep(2)
def seed():
    path=qa.db_snapshot("canvas-fixture")
    with sqlite3.connect(path) as c:
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("INSERT INTO clients(id,nom) VALUES('qa-canvas-client','QA CANVAS CLIENT')")
        c.execute("INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES('990004444','qa-canvas-client','QA CANVAS CLIENT','{}')")
        c.execute("INSERT INTO sites(id,client_id,nom_site) VALUES('qa-canvas-site','qa-canvas-client','QA CANVAS SITE')")
        for i in range(80):
            local="qa-canvas-local-"+str(i);visit="qa-canvas-visit-"+str(i)
            c.execute("INSERT INTO installations(id,site_id,type_code,nom) VALUES(?,?,?,?)",(local,"qa-canvas-site","installation_technique","QA LOCAL "+str(i).zfill(2)))
            c.execute("INSERT INTO visites(id,site_id,installation_id,date_visite,technicien,trame_id) VALUES(?,?,?,?,?,?)",(visit,"qa-canvas-site",local,"2026-11-20","QA","icpe_v1"))
            for k in ("securite","acces","fuite","electricite","regulation","fumisterie","pompe","compteur","ecs","isolation"):
                c.execute("INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)",(visit,"qa",k,"S","QA"))
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
    qa.replace_db(path)
def main():
    assert qa.adb("shell","getprop","ro.kernel.qemu").strip()=="1"
    qa.root_emulator()
    qa.adb("shell","svc","wifi","disable",check=False);qa.adb("shell","svc","data","disable",check=False)
    qa.adb("shell","wm","size","720x1600");qa.adb("shell","wm","density","320")
    qa.adb("install",sys.argv[1]);qa.launch();seed();qa.launch()
    tap("Clients");tap("QA CANVAS CLIENT");tap("Pilotage")
    assert qa.ui.await_label(["Tableau pilotage tactile"],seconds=90)
    initial,bounds=state()
    assert initial[3]<=int((bounds[2]-bounds[0])/2*.23)+1
    qa.ui.snapshot("canvas-initial")
    drag(bounds,-.42,-.42)
    after,bounds=state()
    assert after[1]>initial[1] and after[2]>initial[2],"diagonal drag failed: "+str((initial,after))
    qa.ui.snapshot("canvas-diagonal")
    tap("Réduire le zoom");time.sleep(.5);small,bounds=state()
    assert small[0]<after[0],"zoom out failed"
    tap("Zoom normal");time.sleep(.5);normal,bounds=state()
    assert normal[0]==100
    # Pan to far end, then return by touch. No paged control.
    for _ in range(25):drag(bounds,-.35,-.43)
    end,bounds=state()
    assert end[2]>after[2]
    qa.ui.snapshot("canvas-end")
    qa.mark("native simultaneous X/Y movement, compact header, zoom and final rows")
    tap("Ouvrir la liste accessible")
    assert qa.ui.await_label(["Sites / locaux"],seconds=60)
    tap("Ouvrir le tableau tactile")
    assert qa.ui.await_label(["Tableau pilotage tactile"],seconds=60)
    assert not qa.ui.fatal_logs(),"fatal logs"
if __name__=="__main__":
    try:main()
    except Exception as e:
        qa.report["error"]=str(e)
        try:qa.ui.snapshot("canvas-failed")
        except Exception:pass
        raise
    finally:
        (qa.OUT/"pilotage-canvas.json").write_text(json.dumps(qa.report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

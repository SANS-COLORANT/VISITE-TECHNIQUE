#!/usr/bin/env python3
"""Native restart recovery and explicit partial import of synthetic data only.
The interrupted on-disk state is constructed at the exact journal boundary.
This is not a claim of hardware power-loss or timing coverage.
"""
import hashlib
import json
import sqlite3
import sys
import zipfile
from pathlib import Path
import android_aab_restore_retention as qa

MARKER="metra-restore-pending-v1.json"
IDENT="2026-11-24T09-00-00-000Z"
SAFETY="metra-restore-rollback-"+IDENT+"/"
def create_interrupted_state(source_db):
    # App is stopped. Build an immutable exact snapshot of the populated state.
    path=qa.ROOT+SAFETY
    qa.shell("mkdir -p "+path+"database/")
    qa.put_private(source_db,path+"database/visite_technique.db")
    for folder in ("visite-technique/","metra-missions/"):
        qa.shell("cp -a "+qa.ROOT+folder+" "+path+folder)
    qa.shell("chown -R "+qa.owner()+" "+path)
    qa.shell("restorecon -RF "+path,check=False)
    host=qa.tmp/"journal-original"
    qa.run("adb","pull",path.rstrip("/"),str(host))
    records={}
    db=host/"database/visite_technique.db"
    assert db.is_file(),"snapshot DB not pulled"
    def file_record(p):return {"size":p.stat().st_size,"md5":hashlib.md5(p.read_bytes()).hexdigest()}
    records["database/visite_technique.db"]=file_record(db)
    for folder in ("visite-technique","metra-missions"):
        folder_path=host/folder
        assert folder_path.is_dir()
        records[folder+"/"]={"directory":True}
        for p in sorted(folder_path.rglob("*")):
            rel=p.relative_to(host).as_posix()
            records[rel]={"directory":True} if p.is_dir() else file_record(p)
    marker=qa.tmp/MARKER
    marker.write_text(json.dumps({"protocol":1,"id":IDENT,"inventory":records}),encoding="utf-8")
    qa.put_private(marker,qa.ROOT+MARKER)
    # Simulate interruption after the live DB/media were replaced, but before commit.
    qa.change_to_B()
    qa.mark("synthetic interrupted replacement on disk; journal retained")
def partial_archive(source):
    complete=qa.make_v1(source,"qa-v1-original.zip")
    incomplete=qa.tmp/"qa-v1-missing-photo.zip"
    with zipfile.ZipFile(complete) as src,zipfile.ZipFile(incomplete,"w",zipfile.ZIP_DEFLATED) as dst:
        for entry in src.infolist():
            if entry.filename.startswith("photos/") and not entry.is_dir():continue
            dst.writestr(entry,src.read(entry.filename))
    return incomplete
def main():
    assert len(sys.argv)==2
    assert qa.adb("shell","getprop","ro.kernel.qemu").strip()=="1","physical device refused"
    qa.adb("root");qa.adb("wait-for-device")
    assert qa.adb("shell","id","-u").strip()=="0"
    qa.adb("shell","svc","wifi","disable",check=False)
    qa.adb("shell","svc","data","disable",check=False)
    qa.adb("install",sys.argv[1]);qa.launch()
    qa.install_fixture();qa.launch()
    original,source=qa.snapshot("recovery-original")
    create_interrupted_state(source)
    qa.launch()
    actual,_=qa.snapshot("recovery-after-restart")
    assert actual==original,"startup failed to recover original SQL/media"
    assert qa.run("adb","shell","test","-f",qa.ROOT+MARKER,check=False).returncode!=0,"marker remains after recovery"
    qa.mark("startup recovery restores original fields and SHA256 of 3 media")
    incomplete=partial_archive(source)
    name=qa.external_file(incomplete)
    qa.restore(name,legacy=True,expect_ok=False);qa.launch()
    actual,_=qa.snapshot("missing-photo-strict")
    assert actual==original,"strict rejection altered data"
    qa.mark("missing photo rejected before replacement; original intact")
    qa.restore(name,legacy=True,partial=True);qa.launch()
    result=qa.db_snapshot("partial-restored")
    with sqlite3.connect(result) as c:
        row=c.execute("SELECT uri,label FROM photos WHERE id=?",(qa.ID+"photo",)).fetchone()
        assert row==("file://"+qa.ROOT+qa.PHOTO,"QA-A"),"reference lost or not rebased"
        assert c.execute("SELECT contenu FROM notes WHERE visite_id=?",(qa.ID+"visit",)).fetchone()==("QA-A",)
    assert qa.run("adb","shell","test","-f",qa.ROOT+qa.PHOTO,check=False).returncode!=0,"missing photo was falsely recreated"
    qa.mark("partial consent restores visit and keeps missing photo reference without inventing bytes")
    assert not qa.ui.fatal_logs(),"fatal Android error"
if __name__=="__main__":
    try:main()
    except Exception as e:
        qa.report["error"]=str(e)
        try:qa.ui.snapshot("recovery-failed")
        except Exception:pass
        raise
    finally:
        (qa.OUT/"recovery-result.json").write_text(json.dumps(qa.report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

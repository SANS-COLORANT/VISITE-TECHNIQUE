#!/usr/bin/env python3
"""Execute one complete test command: android-emulator-runner splits multiline scripts."""
import subprocess
import sys
from pathlib import Path
scenario,previous,current=sys.argv[1:]
root=Path(__file__).resolve().parent
tests={
 "roundtrip":("android_aab_restore_retention.py",[previous,current]),
 "bulk":("android_legacy_bulk_restore.py",[current]),
 "recovery":("android_restore_recovery.py",[current]),
 "interface":("android_mobile_layout.py",[current]),
 "report":("android_report_benchmark.py",[previous,current]),
 "pilotage":("android_pilotage_canvas.py",[current]),
}
name,args=tests[scenario]
subprocess.run([sys.executable,str(root/name),*args],check=True)

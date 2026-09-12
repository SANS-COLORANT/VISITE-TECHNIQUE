"""Isolated Preview identity: never overwrite the field application or its saved pack."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess

source_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
serial = int((datetime.now(timezone.utc) - datetime(2026, 1, 1, tzinfo=timezone.utc)).total_seconds()) + 100000
if not 1 <= serial < 2100000000:
    raise ValueError('Invalid Android Preview version code')
app = Path('app.json')
data = json.loads(app.read_text())
expo = data['expo']
expo['name'] = 'Visite Preview'
expo['android']['package'] = 'com.visitetechnique.tablet.preview'
expo['android']['versionCode'] = serial
app.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
version = Path('appVersion.js')
source = version.read_text()
needle = "export const APK_BUILD = 'DEV';"
if source.count(needle) != 1:
    raise ValueError('Unrecognized build version marker')
label = f"PREMIUM-{os.environ['GITHUB_RUN_NUMBER']}-a{os.environ['GITHUB_RUN_ATTEMPT']}-{source_sha[:7]}"
version.write_text(source.replace(needle, f"export const APK_BUILD = '{label}';"))
Path('previewBuild.generated.js').write_text('// Generated in the isolated Preview build only.\nexport const PREMIUM_PREVIEW_BUILD = true;\n')
with open(os.environ['GITHUB_ENV'], 'a') as env:
    env.write(f'PREVIEW_SOURCE_SHA={source_sha}\n')
print('Isolated preview:', label, 'versionCode', serial)

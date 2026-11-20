#!/usr/bin/env python3
"""Conservative release-blocking checks; NOT a substitute for an independent audit."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
app = json.loads((ROOT / 'app.json').read_text())['expo']
assert app['android']['package'] == 'com.visitetechnique.tablet', 'Android package changed'
assert app.get('newArchEnabled') is False, 'SDK 54 requires explicit old-architecture opt-out'
blocked = set(app['android'].get('blockedPermissions', []))
for permission in ('android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO', 'android.permission.ACCESS_FINE_LOCATION'):
    assert permission in blocked, 'Dangerous permission not blocked: ' + permission
config = (ROOT / 'app.config.js').read_text()
assert 'withMetraPlaySecurity' in config
assert 'METRA_PLAY_SECURE_BUILD' in config
assert 'GOOGLE_MAPS_API_KEY' in config
assert 'https://' in (ROOT / 'symfonyApi.js').read_text(), 'API HTTPS required'
assert (ROOT / 'playSecurityRuntime.generated.js').read_text().strip().endswith('false;'), 'Committed secure runtime default must be false'

tracked = subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).splitlines()
dangerous_extension = re.compile(r'(?i)(?:^|/)(?:\.env(?:\.|$)|[^/]+\.(?:jks|p12|pfx|pem|keystore|key)$)')
# ASTRA M07: regression test on deliberately fictitious paths.
for candidate in ('.env', 'config/.env.production', 'a/upload.jks', 'k.p12', 'tls.pem', 'key.keystore', 'nested/private.key'):
    assert dangerous_extension.search(candidate), 'Sensitive file detector missed ' + candidate
for candidate in ('src/view.js', 'docs/guide.md', 'nested/archive.jpg'):
    assert not dangerous_extension.search(candidate), 'Overblocking safe file ' + candidate

bad_files = [p for p in tracked if dangerous_extension.search(p) and not p.endswith('.env.example')]
if bad_files:
    raise SystemExit('Private material committed to repository: ' + ', '.join(bad_files))

rules = [
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'AIza[0-9A-Za-z_-]{35}'),
    re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'),
    re.compile(r'sk_(?:live|test)_[A-Za-z0-9]{20,}'),
]
for filename in tracked:
    if not filename.endswith(('.js', '.jsx', '.json', '.ts', '.tsx')) or filename.endswith(('package-lock.json',)):
        continue
    if filename.startswith(('.github/', 'docs/', 'tests/')):
        continue
    source = (ROOT / filename).read_text(encoding='utf-8', errors='replace')
    for rule in rules:
        if rule.search(source):
            raise SystemExit('Possible embedded credential in ' + filename)
print('METRA release source baseline: PASS (not an exhaustive secret scan)')

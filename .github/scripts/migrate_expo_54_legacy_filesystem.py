#!/usr/bin/env python3
"""Versioned migration for legacy Expo FileSystem imports (SDK 51 -> 54).
Only run on the dedicated release migration branch; commit changes before reuse.
"""
from pathlib import Path
import subprocess

files = subprocess.check_output(
    ['git', 'ls-files', '--', '*.js', '*.jsx', '*.ts', '*.tsx'],
    text=True,
).splitlines()
changed = []
for name in files:
    if name.startswith(('.github/', 'node_modules/', 'dist/', 'android/', 'ios/')):
        continue
    path = Path(name)
    if not path.is_file():
        continue
    before = path.read_text(encoding='utf-8')
    after = before.replace("'expo-file-system'", "'expo-file-system/legacy'")
    after = after.replace('"expo-file-system"', '"expo-file-system/legacy"')
    if after != before:
        path.write_text(after, encoding='utf-8')
        changed.append(name)

print('Expo SDK 54 legacy file-system imports migrated:', len(changed))
for name in changed:
    print(' -', name)

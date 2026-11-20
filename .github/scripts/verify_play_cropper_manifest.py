#!/usr/bin/env python3
"""Verify exported cropper is explicitly private in generated main Android manifest."""
from pathlib import Path
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[2]
plugin=(root / 'plugins/withMetraPlaySecurity.js').read_text(encoding='utf-8')
for expected in ("com.canhub.cropper.CropImageActivity", "'android:exported'] = 'false'", "'tools:replace'] = 'android:exported'"):
    assert expected in plugin, 'Cropper override missing'
filename = root / 'android/app/src/main/AndroidManifest.xml'
assert filename.exists(), 'Android manifest not generated'
tree=ET.parse(filename)
ns='{http://schemas.android.com/apk/res/android}'
activity=[
    a for a in tree.getroot().find('application').findall('activity')
    if a.attrib.get(ns+'name')=='com.canhub.cropper.CropImageActivity'
]
assert len(activity)==1, 'Expected exactly one explicit cropper override in main manifest'
assert activity[0].attrib.get(ns+'exported')=='false', 'Cropper exported in main manifest'
print('ASTRA M05: generated main Android cropper exported=false PASS')

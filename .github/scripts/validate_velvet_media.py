"""Verify every supplied movie frame and byte, plus exact native assets inside the APK."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile
from import_approved_premium_assets import validate_payload, sha, PREFIX


def verify(root, apk=None):
    approval = json.loads((root / '.github/premium-assets-approved.json').read_text())
    payload = {}
    for name, record in approval['files'].items():
        p = root / name
        if p.stat().st_size != record['bytes']:
            raise ValueError('Media size mismatch: ' + name)
        data = p.read_bytes()
        if sha(data) != record['sha256']:
            raise ValueError('Media fingerprint mismatch: ' + name)
        payload[name] = data
    validate_payload(payload)
    if apk:
        names = ['METRA_Spirale_Intro_V4.webp', 'spiral-dock.png', 'spiral-final-canvas.png']
        with ZipFile(apk) as archive:
            for name in names:
                expected = payload[PREFIX + 'startup-media/' + name]
                info = archive.getinfo('assets/metra/velvet/' + name)
                if info.file_size != len(expected) or sha(archive.read(info)) != sha(expected):
                    raise ValueError('Incorrect native velvet asset in APK: ' + name)
    print('Velvet: 147 original frames, complete source-frame dock, and native APK bytes verified.' if apk
          else 'Velvet: every original frame and the derived complete dock verified. Android visual acceptance remains required.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--apk', type=Path)
    args = parser.parse_args()
    verify(args.root, args.apk)

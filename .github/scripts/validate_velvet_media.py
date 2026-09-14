"""Verify the approved Velvet startup media and the exact native APK assets.

The architectural home scene has its own validators/provenance.  This gate is
intentionally limited to startup-media so replacing the home artwork does not
invalidate the independently approved 147-frame spiral animation.
"""
import argparse
import io
import json
from pathlib import Path
from zipfile import ZipFile
from PIL import Image
from import_approved_premium_assets import check_webp, require, sha, PREFIX

STARTUP_PREFIX = PREFIX + 'startup-media/'
NATIVE_NAMES = ['METRA_Spirale_Intro_V4.webp', 'spiral-dock.png', 'spiral-final-canvas.png']


def approved_startup_payload(root):
    approval = json.loads((root / '.github/premium-assets-approved.json').read_text(encoding='utf-8'))
    payload = {}
    approved = {name: record for name, record in approval['files'].items() if name.startswith(STARTUP_PREFIX)}
    require(len(approved) == 4, 'Expected four approved startup-media files')
    for name, record in approved.items():
        path = root / name
        require(path.is_file(), 'Missing startup media: ' + name)
        data = path.read_bytes()
        require(len(data) == record['bytes'], 'Media size mismatch: ' + name)
        require(sha(data) == record['sha256'], 'Media fingerprint mismatch: ' + name)
        payload[name] = data
    return payload


def validate_startup_payload(root, payload):
    manifest = json.loads((root / PREFIX / 'manifest.json').read_text(encoding='utf-8'))
    meta = json.loads(payload[STARTUP_PREFIX + 'animation-provenance.json'])
    source_name = meta['source']
    data = payload[STARTUP_PREFIX + source_name]
    require(sha(data) == meta['sha256'], 'Animation hash mismatch')
    check_webp(data)

    with Image.open(io.BytesIO(data)) as image:
        require(image.size == (2048, 1024), 'Wrong animation dimensions')
        require(image.n_frames == 147, 'Wrong animation frame count')
        require(image.info.get('loop') == 1, 'Wrong animation loop count')
        require(len(meta['frames']) == image.n_frames, 'Wrong frame audit count')
        duration = 0
        last_pixels = None
        for index, record in enumerate(meta['frames']):
            image.seek(index)
            image.load()
            pixels = image.convert('RGBA')
            require(record['index'] == index, 'Animation frame index mismatch')
            require(sha(pixels.tobytes()) == record['pixelSha256'], 'Animation frame mismatch')
            require(image.info['duration'] == record['durationMs'], 'Animation timing mismatch')
            duration += image.info['duration']
            if index == image.n_frames - 1:
                last_pixels = pixels.tobytes()
        require(duration == meta['durationMs'] == 4900, 'Wrong animation duration')
        image.seek(75)
        image.load()
        dock_pixels = image.convert('RGBA').crop((860, 390, 1164, 694)).tobytes()

    final_data = payload[STARTUP_PREFIX + 'spiral-final-canvas.png']
    with Image.open(io.BytesIO(final_data)) as image:
        image.load()
        require(image.convert('RGBA').tobytes() == last_pixels, 'Last-frame reference mismatch')

    require(meta['status'] == 'NATIVE_PLAYER_WIRED_PENDING_ANDROID_VISUAL_ACCEPTANCE', 'Wrong runtime readiness status')
    require(manifest['startup']['durationMs'] == 4900, 'Wrong native intro metadata duration')
    require(manifest['startup']['completion'] == 'native-event', 'Intro must use the native completion callback')
    require(meta['dock']['sourceFrame'] == 75 and meta['dock']['crop'] == [860, 390, 1164, 694], 'Wrong complete spiral source')

    dock_data = payload[STARTUP_PREFIX + 'spiral-dock.png']
    require(sha(dock_data) == meta['dock']['sha256'], 'Dock file mismatch')
    with Image.open(io.BytesIO(dock_data)) as image:
        image.load()
        require(image.size == (304, 304), 'Wrong dock dimensions')
        require(image.convert('RGBA').tobytes() == dock_pixels, 'Dock pixels differ from original full frame')
    require(sha(final_data) == meta['finalCanvas']['sha256'], 'Final canvas hash mismatch')


def verify(root, apk=None):
    payload = approved_startup_payload(root)
    validate_startup_payload(root, payload)
    if apk:
        with ZipFile(apk) as archive:
            for name in NATIVE_NAMES:
                expected = payload[STARTUP_PREFIX + name]
                info = archive.getinfo('assets/metra/velvet/' + name)
                actual = archive.read(info)
                require(info.file_size == len(expected) and sha(actual) == sha(expected),
                        'Incorrect native velvet asset in APK: ' + name)
    print('Velvet: 147 original frames, complete source-frame dock, and native APK bytes verified.' if apk
          else 'Velvet: every original startup frame and the derived complete dock verified. Android visual acceptance remains required.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--apk', type=Path)
    args = parser.parse_args()
    verify(args.root, args.apk)

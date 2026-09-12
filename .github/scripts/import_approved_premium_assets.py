"""Import only the exact reviewed ZIP. No network, guessed artwork, or permissive decoding."""
import argparse
import hashlib
import io
import json
import stat
import struct
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False
PREFIX = 'visual-packs/spiral-active/'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def check_webp(data):
    require(data[:4] == b'RIFF' and data[8:12] == b'WEBP', 'Invalid WebP header')
    require(len(data) >= 12 and struct.unpack_from('<I', data, 4)[0] + 8 == len(data), 'RIFF length mismatch')
    offset = 12
    while offset < len(data):
        require(offset + 8 <= len(data), 'Truncated chunk header')
        size = struct.unpack_from('<I', data, offset + 4)[0]
        offset += 8 + size + (size & 1)
        require(offset <= len(data), 'Truncated chunk payload')
    require(offset == len(data), 'Invalid chunk boundary')


def read_payload(archive, approval):
    require(archive.stat().st_size == approval['archiveBytes'], 'ZIP size does not match approval')
    data = archive.read_bytes()
    require(sha(data) == approval['archiveSha256'], 'ZIP hash does not match approval')
    files = approval['files']
    require(len(files) == 10, 'Expected exactly ten approved media files')
    payload = {}
    with ZipFile(io.BytesIO(data)) as zip_:
        names = zip_.namelist()
        require(len(names) == len(set(names)) and set(names) == set(files), 'ZIP members do not match approval')
        for info in zip_.infolist():
            name = info.filename
            path = PurePosixPath(name)
            require(name.startswith(PREFIX) and not path.is_absolute() and '..' not in path.parts and '\\' not in name, 'Unsafe member path')
            require(not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16), 'Non-regular member')
            require(not info.flag_bits & 1, 'Encrypted member')
            record = files[name]
            require(0 < info.file_size == record['bytes'] <= 20_000_000, 'Member size mismatch')
            content = zip_.read(info)
            require(sha(content) == record['sha256'], 'Member hash mismatch: ' + name)
            payload[name] = content
    return payload


def validate_payload(payload):
    provenance = json.loads(payload[PREFIX + 'home-scene/asset-provenance.json'])
    config = json.loads(payload[PREFIX + 'manifest.json'])
    require(config['homeScene']['canvas'] == provenance['canvas'] == [2048, 1080], 'Wrong building canvas')
    require(len(provenance['files']) == 4, 'Wrong layer count')
    images = []
    for record, layer in zip(provenance['files'], config['homeScene']['layers']):
        require(record['id'] == layer['id'] and record['asset'] == layer['asset'], 'Layer identity mismatch')
        data = payload[PREFIX + record['asset'].removeprefix('./')]
        require(sha(data) == record['sha256'], 'Building provenance mismatch')
        check_webp(data)
        with Image.open(io.BytesIO(data)) as im:
            require(im.size == (2048, 1080) and getattr(im, 'n_frames', 1) == 1 and 'A' in im.getbands(), 'Wrong building image')
            im.load()
            pixels = im.convert('RGBA')
            require(sha(pixels.tobytes()) == record['pixel_sha256'], 'Building pixel mismatch')
            require(pixels.getchannel('A').getextrema() == (0, 255), 'Invalid building transparency')
            images.append(pixels)
    require(len({sha(im.tobytes()) for im in images}) == 4, 'Duplicate buildings')
    from PIL import ImageChops
    transmission = Image.new('L', images[0].size, 255)
    for im in reversed(images):
        alpha = im.getchannel('A')
        total = sum(i * n for i, n in enumerate(alpha.histogram()))
        visible = ImageChops.multiply(alpha, transmission)
        kept = sum(i * n for i, n in enumerate(visible.histogram()))
        require(total > 0 and kept / total >= 0.02, 'Building hidden by other layers')
        transmission = ImageChops.multiply(transmission, ImageChops.invert(alpha))

    meta = json.loads(payload[PREFIX + 'startup-media/animation-provenance.json'])
    data = payload[PREFIX + 'startup-media/' + meta['source']]
    require(sha(data) == meta['sha256'], 'Animation hash mismatch')
    check_webp(data)
    with Image.open(io.BytesIO(data)) as im:
        require(im.size == (2048, 1024) and im.n_frames == 147 and im.info.get('loop') == 1, 'Wrong animation metadata')
        require(len(meta['frames']) == im.n_frames, 'Wrong frame audit count')
        duration = 0
        for i, record in enumerate(meta['frames']):
            im.seek(i)
            im.load()
            pixels = im.convert('RGBA')
            require(record['index'] == i and sha(pixels.tobytes()) == record['pixelSha256'], 'Animation frame mismatch')
            require(im.info['duration'] == record['durationMs'], 'Animation timing mismatch')
            duration += im.info['duration']
        require(duration == meta['durationMs'] == 4900, 'Wrong animation duration')
        last_pixels = pixels.tobytes()
        im.seek(75)
        im.load()
        dock_pixels = im.convert('RGBA').crop((860, 390, 1164, 694)).tobytes()
    with Image.open(io.BytesIO(payload[PREFIX + 'startup-media/spiral-final-canvas.png'])) as im:
        im.load()
        require(im.convert('RGBA').tobytes() == last_pixels, 'Last-frame reference mismatch')
    require(meta['status'] == 'NATIVE_PLAYER_WIRED_PENDING_ANDROID_VISUAL_ACCEPTANCE', 'Wrong runtime readiness status')
    require(config['startup']['durationMs'] == 4900, 'Wrong native intro metadata duration')
    require(config['startup']['completion'] == 'native-event', 'Intro must use the native completion callback')
    require(meta['dock']['sourceFrame'] == 75 and meta['dock']['crop'] == [860, 390, 1164, 694], 'Wrong complete spiral source')
    dock_data = payload[PREFIX + 'startup-media/spiral-dock.png']
    require(sha(dock_data) == meta['dock']['sha256'], 'Dock file mismatch')
    with Image.open(io.BytesIO(dock_data)) as im:
        im.load()
        require(im.size == (304, 304) and im.convert('RGBA').tobytes() == dock_pixels, 'Dock pixels differ from original full frame')
    require(sha(payload[PREFIX + 'startup-media/spiral-final-canvas.png']) == meta['finalCanvas']['sha256'], 'Final canvas hash mismatch')


def install(root, archive, approval_file, check_only=False):
    root = root.resolve()
    approval = json.loads(approval_file.read_text(encoding='utf-8'))
    payload = read_payload(archive, approval)
    validate_payload(payload)
    # All hashes, pixels, animation frames and targets are checked before any repository write.
    targets = []
    for name in payload:
        target = root / name
        require(target.resolve().is_relative_to(root), 'Target escapes repository')
        require(not target.is_symlink(), 'Target is a symbolic link')
        targets.append(target)
    existing_manifest = root / PREFIX / 'manifest.json'
    if existing_manifest.exists():
        current = json.loads(existing_manifest.read_text(encoding='utf-8'))
        incoming = json.loads(payload[PREFIX + 'manifest.json'])
        for value in (current, incoming):
            value.pop('version', None)
            value['homeScene'].pop('canvas', None)
        require(current == incoming, 'Manifest changed since review; rebase manually instead of overwriting it')
    if not check_only:
        for name, target in zip(payload, targets):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload[name])
            require(sha(target.read_bytes()) == approval['files'][name]['sha256'], 'Post-write hash mismatch')
    print('Verified: four distinct buildings; 147 animation frames; exact provenance. Native visual acceptance remains required.')
    print('Check only.' if check_only else 'Approved media installed. Native player wired; APK and Android visual validation still required.')
    return sorted(payload)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--approval', type=Path)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    approval = args.approval or args.root / '.github/premium-assets-approved.json'
    install(args.root, args.archive, approval, args.check_only)

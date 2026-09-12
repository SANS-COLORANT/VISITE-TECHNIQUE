"""Read actual pixels and optionally verify the exact packaged bytes; never repair files."""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageChops, ImageFile, features

ImageFile.LOAD_TRUNCATED_IMAGES = False
MAX_BYTES = 20_000_000


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_rgba(rgba):
    hist = rgba.getchannel('A').histogram()
    count = sum(hist)
    if hist[0] < count * 0.05:
        raise ValueError('Less than 5% fully transparent pixels: likely a background rectangle')
    if sum(hist[16:]) < count * 0.01:
        raise ValueError('Less than 1% visible pixels: empty/almost-empty layer')
    return rgba


def decode_layer(data, canvas):
    if len(data) > MAX_BYTES:
        raise ValueError('Layer exceeds 20 MB')
    if data[:4] != b'RIFF' or len(data) < 12 or data[8:12] != b'WEBP':
        raise ValueError('Invalid WebP signature')
    if struct.unpack_from('<I', data, 4)[0] + 8 != len(data):
        raise ValueError('RIFF length mismatch')
    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'WEBP' or image.size != tuple(canvas):
            raise ValueError(f'Unexpected format/size: {image.format} {image.size}')
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Expected a static image')
        image.load()
        if 'A' not in image.getbands():
            raise ValueError('No alpha channel')
        rgba = image.convert('RGBA')
    return validate_rgba(rgba)


def visible_contributions(images):
    transmission = Image.new('L', images[0].size, 255)
    fractions = []
    for image in reversed(images):
        alpha = image.getchannel('A')
        total = sum(i * n for i, n in enumerate(alpha.histogram()))
        visible = ImageChops.multiply(alpha, transmission)
        kept = sum(i * n for i, n in enumerate(visible.histogram()))
        fractions.append(kept / total if total else 0)
        transmission = ImageChops.multiply(transmission, ImageChops.invert(alpha))
    return list(reversed(fractions))


def find_apk_images(apk, expected):
    matches, scanned = {}, 0
    with ZipFile(apk) as archive:
        for info in archive.infolist():
            if info.filename.lower().endswith('.webp'):
                scanned += info.file_size
                if info.file_size > MAX_BYTES or scanned > 256_000_000:
                    raise ValueError('APK image audit resource limit exceeded')
                data = archive.read(info)  # CRC checked by ZipFile; nothing is extracted to disk.
                sha = digest(data)
                if sha in expected:
                    matches.setdefault(sha, []).append(info.filename)
                    decode_layer(data, expected[sha])
    return matches


def audit(root, apk=None, output=None, require_provenance=False):
    pack = root / 'visual-packs/spiral-active'
    results, decoded, errors, seen, pixel_hashes = [], [], [], set(), set()
    canvas = None
    try:
        config = json.loads((pack / 'manifest.json').read_text(encoding='utf-8'))['homeScene']
        canvas, layers = config['canvas'], config['layers']
        if len(canvas) != 2 or any(type(n) is not int or n <= 0 for n in canvas) or canvas[0] * canvas[1] > 20_000_000:
            raise ValueError('Invalid canvas dimensions')
        if len(layers) != 4 or len({layer['id'] for layer in layers}) != 4:
            raise ValueError('Expected four distinct layers')
        if not features.check('webp'):
            raise RuntimeError('Pillow has no WebP support')
        provenance = None
        if require_provenance:
            provenance = json.loads((pack / 'home-scene/asset-provenance.json').read_text(encoding='utf-8'))
            if provenance.get('schemaVersion') != 1 or provenance.get('canvas') != canvas:
                raise ValueError('Invalid provenance/canvas')
            if len(provenance.get('files', [])) != 4 or len({r['id'] for r in provenance['files']}) != 4:
                raise ValueError('Invalid provenance layer count')
        for layer in layers:
            record = {'id': layer['id'], 'asset': layer['asset'], 'errors': []}
            try:
                source = (pack / layer['asset']).resolve()
                if not source.is_relative_to(pack.resolve()):
                    raise ValueError('Asset path escapes pack')
                if source.stat().st_size > MAX_BYTES:
                    raise ValueError('Layer exceeds 20 MB')
                data = source.read_bytes()
                sha = digest(data)
                record.update(bytes=len(data), sha256=sha)
                if sha in seen:
                    raise ValueError('Duplicate bytes')
                seen.add(sha)
                image = decode_layer(data, canvas)
                pixel_sha = digest(image.tobytes())
                if pixel_sha in pixel_hashes:
                    raise ValueError('Duplicate decoded pixels')
                pixel_hashes.add(pixel_sha)
                if provenance:
                    entry = next((r for r in provenance['files'] if r['id'] == layer['id']), None)
                    if not entry or entry['sha256'] != sha or entry['pixel_sha256'] != pixel_sha or entry['asset'] != layer['asset']:
                        raise ValueError('Bytes/pixels do not match approved import provenance')
                record.update(decode='OK', pixel_sha256=pixel_sha, alpha_bbox=image.getchannel('A').getbbox())
                decoded.append(image)
            except Exception as exc:
                record['decode'] = 'ERROR'
                record['errors'].append(f'{type(exc).__name__}: {exc}')
            errors.extend(f"{layer['id']}: {e}" for e in record['errors'])
            results.append(record)
        if len(decoded) == 4 and not errors:
            for record, fraction in zip(results, visible_contributions(decoded)):
                record['visible_alpha_fraction'] = round(fraction, 6)
                if fraction < 0.02:
                    errors.append(f"{record['id']}: hidden by other layers ({fraction:.4f})")
        if apk and not errors:
            matches = find_apk_images(apk, {r['sha256']: canvas for r in results})
            for record in results:
                record['apk_entries'] = matches.get(record['sha256'], [])
                if not record['apk_entries']:
                    errors.append(f"{record['id']}: exact source bytes missing from APK")
    except Exception as exc:
        errors.append(f'{type(exc).__name__}: {exc}')
    report = {'apk': str(apk) if apk else None, 'layers': results, 'errors': errors,
              'status': 'BLOCKED' if errors else 'PIXELS_OK_VISUAL_ACCEPTANCE_REQUIRED'}
    if output:
        output.mkdir(parents=True, exist_ok=True)
        (output / 'asset-audit.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        if not errors:
            composite = Image.new('RGBA', tuple(canvas), '#F4F1E8')
            for image in decoded:
                composite.alpha_composite(image)
            composite.save(output / 'four-layer-composition.png')
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--apk', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--require-provenance', action='store_true')
    args = parser.parse_args()
    raise SystemExit(audit(args.repo_root, args.apk, args.output, args.require_provenance))

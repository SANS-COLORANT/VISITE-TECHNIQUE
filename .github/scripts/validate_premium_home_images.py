"""Decode actual pixels; optionally prove that the same bytes are in an APK.
CI only: python -m pip install Pillow==12.3.0
Does not modify assets. Returns nonzero on any failure; never accepts truncated files.
"""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageChops, ImageFile, features

ImageFile.LOAD_TRUNCATED_IMAGES = False


def decode_layer(data, canvas):
    if len(data) > 20_000_000:
        raise ValueError('Layer exceeds the 20 MB audit limit')
    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'WEBP' or image.size != tuple(canvas):
            raise ValueError(f'Unexpected format/size: {image.format} {image.size}')
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Expected a static image')
        image.load()  # Full decode is essential; headers and verify() are insufficient.
        if 'A' not in image.getbands():
            raise ValueError('No alpha channel')
        rgba = image.convert('RGBA')
    hist = rgba.getchannel('A').histogram()
    count = sum(hist)
    if hist[0] < count * 0.05:
        raise ValueError('Less than 5% fully transparent pixels: likely a background rectangle')
    if sum(hist[16:]) < count * 0.01:
        raise ValueError('Less than 1% visible pixels: empty/almost-empty layer')
    return rgba


def visible_contributions(images):
    """Alpha contribution after the layers above it, not just file presence."""
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


def audit(root, apk=None, output=None):
    pack = root / 'visual-packs' / 'spiral-active'
    config = json.loads((pack / 'manifest.json').read_text(encoding='utf-8'))['homeScene']
    canvas = config['canvas']
    if len(canvas) != 2 or any(not isinstance(n, int) or n <= 0 for n in canvas) or canvas[0] * canvas[1] > 20_000_000:
        raise ValueError('Invalid canvas dimensions')
    layers = config['layers']
    if len(layers) != 4 or len({layer['id'] for layer in layers}) != 4:
        raise ValueError('Expected exactly four distinct layers')
    if not features.check('webp'):
        raise RuntimeError('Pillow was installed without WebP support')
    apk_images = {}
    if apk:
        with ZipFile(apk) as archive:
            for info in archive.infolist():
                if info.filename.lower().endswith('.webp'):
                    if info.file_size > 20_000_000:
                        raise ValueError(f'APK WebP too large: {info.filename}')
                    data = archive.read(info)
                    apk_images.setdefault(hashlib.sha256(data).hexdigest(), []).append((info.filename, data))
    results, decoded, errors, seen = [], [], [], set()
    for layer in layers:
        record = {'id': layer['id'], 'asset': layer['asset'], 'errors': []}
        try:
            source = (pack / layer['asset']).resolve()
            if not source.is_relative_to(pack.resolve()):
                raise ValueError('Asset path escapes the pack')
            data = source.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            record.update(bytes=len(data), sha256=digest,
                          git_blob_sha=hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest())
            if len(data) >= 12 and data[:4] == b'RIFF':
                declared = struct.unpack_from('<I', data, 4)[0] + 8
                record['riff_declared_bytes'] = declared
                if declared != len(data):
                    record['errors'].append(f'RIFF length mismatch: {declared} declared, {len(data)} actual')
            if digest in seen:
                record['errors'].append('Duplicate bytes across two layers')
            seen.add(digest)
            if apk:
                matches = apk_images.get(digest, [])
                record['apk_entries'] = [name for name, _ in matches]
                if not matches:
                    record['errors'].append('Exact source bytes are not present in APK')
                else:
                    data = matches[0][1]  # Decode what was packaged, not an unrelated file.
            try:
                image = decode_layer(data, canvas)
                record.update(decode='OK', alpha_bbox=image.getchannel('A').getbbox())
                decoded.append(image)
            except Exception as exc:
                record.update(decode='ERROR')
                record['errors'].append(f'{type(exc).__name__}: {exc}')
        except Exception as exc:
            record['errors'].append(f'{type(exc).__name__}: {exc}')
        errors.extend(f"{layer['id']}: {error}" for error in record['errors'])
        results.append(record)
    if len(decoded) == 4 and not errors:
        for result, fraction in zip(results, visible_contributions(decoded)):
            result['visible_alpha_fraction'] = round(fraction, 6)
            if fraction < 0.02:
                errors.append(f"{result['id']}: hidden by the layers above (visible fraction {fraction:.4f})")
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
    args = parser.parse_args()
    raise SystemExit(audit(args.repo_root, args.apk, args.output))

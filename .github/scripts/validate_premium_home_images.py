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


def decode_asset(data, expected_size, alpha_required=True):
    if len(data) > MAX_BYTES:
        raise ValueError('Layer exceeds 20 MB')
    if data[:4] != b'RIFF' or len(data) < 12 or data[8:12] != b'WEBP':
        raise ValueError('Invalid WebP signature')
    if struct.unpack_from('<I', data, 4)[0] + 8 != len(data):
        raise ValueError('RIFF length mismatch')
    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'WEBP' or image.size != tuple(expected_size):
            raise ValueError(f'Unexpected format/size: {image.format} {image.size}, expected {tuple(expected_size)}')
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Expected a static image')
        image.load()
        if alpha_required and 'A' not in image.getbands():
            raise ValueError('No alpha channel')
        rgba = image.convert('RGBA')
    return validate_rgba(rgba) if alpha_required else rgba


def decode_layer(data, canvas):
    """Backward-compatible helper used by the synthetic four-layer intake tests."""
    return decode_asset(data, canvas, alpha_required=True)


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


def scene_entries(config):
    """Return (entry, expected_size, alpha_required) for legacy or layered scenes."""
    canvas = config['canvas']
    if config.get('background') and config.get('foliage') is not None:
        if len(config.get('layers', [])) != 4 or len(config.get('foliage', [])) != 3:
            raise ValueError('Expected four buildings and three foliage layers')
        entries = [(config['background'], canvas, False)]
        entries.extend((layer, canvas, True) for layer in config['layers'])
        foliage_size = [canvas[0] // 2, canvas[1] // 2]
        entries.extend((layer, foliage_size, True) for layer in config['foliage'])
        if len({entry['id'] for entry, _, _ in entries}) != 8:
            raise ValueError('Expected eight distinct scene ids')
        return entries, True
    layers = config['layers']
    if len(layers) != 4 or len({layer['id'] for layer in layers}) != 4:
        raise ValueError('Expected four distinct layers')
    return [(layer, canvas, True) for layer in layers], False


def find_apk_images(apk, expected):
    """expected maps sha256 -> (expected_size, alpha_required)."""
    matches, scanned = {}, 0
    with ZipFile(apk) as archive:
        for info in archive.infolist():
            if info.filename.lower().endswith('.webp'):
                scanned += info.file_size
                if info.file_size > MAX_BYTES or scanned > 256_000_000:
                    raise ValueError('APK image audit resource limit exceeded')
                data = archive.read(info)
                sha = digest(data)
                if sha in expected:
                    matches.setdefault(sha, []).append(info.filename)
                    expected_size, alpha_required = expected[sha]
                    decode_asset(data, expected_size, alpha_required)
    return matches


def provenance_entry(provenance, scene_id, asset_path):
    if provenance.get('schemaVersion') == 1:
        return next((r for r in provenance.get('files', []) if r.get('id') == scene_id), None)
    if provenance.get('schemaVersion') == 2:
        return provenance.get('assets', {}).get(Path(asset_path).name)
    return None


def audit(root, apk=None, output=None, require_provenance=False):
    pack = root / 'visual-packs/spiral-active'
    results, errors, seen, pixel_hashes = [], [], set(), set()
    decoded_for_composite = []
    canvas = None
    try:
        config = json.loads((pack / 'manifest.json').read_text(encoding='utf-8'))['homeScene']
        canvas = config['canvas']
        if len(canvas) != 2 or any(type(n) is not int or n <= 0 for n in canvas) or canvas[0] * canvas[1] > 20_000_000:
            raise ValueError('Invalid canvas dimensions')
        entries, layered = scene_entries(config)
        if not features.check('webp'):
            raise RuntimeError('Pillow has no WebP support')

        provenance = None
        if require_provenance:
            provenance = json.loads((pack / 'home-scene/asset-provenance.json').read_text(encoding='utf-8'))
            if provenance.get('schemaVersion') not in (1, 2) or provenance.get('canvas') != canvas:
                raise ValueError('Invalid provenance/canvas')
            if layered:
                if provenance.get('schemaVersion') != 2 or len(provenance.get('assets', {})) != 8:
                    raise ValueError('Invalid layered provenance asset count')
            elif provenance.get('schemaVersion') != 1 or len(provenance.get('files', [])) != 4:
                raise ValueError('Invalid provenance layer count')

        decoded_alpha = []
        for entry, expected_size, alpha_required in entries:
            record = {'id': entry['id'], 'asset': entry['asset'], 'errors': []}
            try:
                source = (pack / entry['asset']).resolve()
                if not source.is_relative_to(pack.resolve()):
                    raise ValueError('Asset path escapes pack')
                data = source.read_bytes()
                if len(data) > MAX_BYTES:
                    raise ValueError('Layer exceeds 20 MB')
                sha = digest(data)
                record.update(bytes=len(data), sha256=sha)
                if sha in seen:
                    raise ValueError('Duplicate bytes')
                seen.add(sha)
                image = decode_asset(data, expected_size, alpha_required)
                pixel_sha = digest(image.tobytes())
                if pixel_sha in pixel_hashes:
                    raise ValueError('Duplicate decoded pixels')
                pixel_hashes.add(pixel_sha)

                if provenance:
                    approved = provenance_entry(provenance, entry['id'], entry['asset'])
                    if not approved or approved.get('sha256') != sha:
                        raise ValueError('Bytes do not match approved import provenance')
                    if approved.get('bytes') is not None and approved.get('bytes') != len(data):
                        raise ValueError('Byte count does not match approved import provenance')
                    if provenance.get('schemaVersion') == 1:
                        if approved.get('pixel_sha256') != pixel_sha or approved.get('asset') != entry['asset']:
                            raise ValueError('Pixels/path do not match approved import provenance')
                    elif approved.get('pixel_sha256') and approved.get('pixel_sha256') != pixel_sha:
                        raise ValueError('Pixels do not match approved import provenance')

                record.update(decode='OK', pixel_sha256=pixel_sha,
                              size=list(expected_size), alpha_required=alpha_required,
                              alpha_bbox=image.getchannel('A').getbbox())
                decoded_for_composite.append((image, expected_size, alpha_required))
                if alpha_required and expected_size == canvas:
                    decoded_alpha.append((record, image))
            except Exception as exc:
                record['decode'] = 'ERROR'
                record['errors'].append(f'{type(exc).__name__}: {exc}')
            errors.extend(f"{entry['id']}: {e}" for e in record['errors'])
            results.append(record)

        # Preserve the stricter occlusion check for the legacy four-layer intake path.
        if not layered and len(decoded_alpha) == 4 and not errors:
            for (record, _), fraction in zip(decoded_alpha, visible_contributions([x[1] for x in decoded_alpha])):
                record['visible_alpha_fraction'] = round(fraction, 6)
                if fraction < 0.02:
                    errors.append(f"{record['id']}: hidden by other layers ({fraction:.4f})")

        if apk and not errors:
            expected = {r['sha256']: (r['size'], r['alpha_required']) for r in results}
            matches = find_apk_images(apk, expected)
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
        if not errors and canvas:
            composite = Image.new('RGBA', tuple(canvas), (244, 241, 232, 255))
            for image, expected_size, alpha_required in decoded_for_composite:
                layer = image if list(expected_size) == canvas else image.resize(tuple(canvas), Image.Resampling.LANCZOS)
                if alpha_required:
                    composite.alpha_composite(layer)
                else:
                    composite = layer.copy()
            composite.save(output / ('layered-composition.png' if len(results) == 8 else 'four-layer-composition.png'))
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

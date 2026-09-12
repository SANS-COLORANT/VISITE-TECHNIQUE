"""Stage four original aligned layers, without overwriting originals or repository assets.
This script does not create artwork or guess the positions of independently cropped images.
"""
import argparse
import io
import json
import shutil
import tempfile
from pathlib import Path
from PIL import Image, ImageFile
from validate_premium_home_images import decode_layer, digest, validate_rgba, visible_contributions, MAX_BYTES

ImageFile.LOAD_TRUNCATED_IMAGES = False
EXPECTED = [
    ('haussmann', '01_haussmann_left_far.webp'), ('collectif', '02_collectif_left_mid.webp'),
    ('poste-municipal', '03_poste_municipal_right_mid.webp'), ('building', '04_building_right_near.webp'),
]


def read_original(path):
    data = path.read_bytes() if path.stat().st_size <= MAX_BYTES else b''
    if not data:
        raise ValueError(f'Empty or oversized original: {path.name}')
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in ('PNG', 'WEBP') or image.width * image.height > 20_000_000:
            raise ValueError(f'Unsupported original: {path.name}')
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Animated originals are not supported')
        size, fmt = image.size, image.format
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if 'A' not in image.getbands() and 'transparency' not in image.info:
            raise ValueError(f'No transparency in {path.name}')
        rgba = validate_rgba(image.convert('RGBA'))
    if fmt == 'WEBP':
        decode_layer(data, size)  # Also reject permissively decoded RIFF length errors.
    return rgba, data


def prepare(paths, destination, max_width=1024):
    if len(paths) != 4 or destination.exists():
        raise ValueError('Supply four paths and a NEW staging directory')
    if not 128 <= max_width <= 4096:
        raise ValueError('max-width must be in 128..4096')
    images, originals = zip(*(read_original(path) for path in paths))
    if len({image.size for image in images}) != 1:
        raise ValueError('Original canvases differ: explicit common placement is required; never auto-crop/stretch')
    if len({digest(image.tobytes()) for image in images}) != 4:
        raise ValueError('Duplicate original pixels')
    scale = min(1, max_width / images[0].width)
    canvas = [max(1, round(images[0].width * scale)), max(1, round(images[0].height * scale))]
    normalized = [validate_rgba(image.resize(tuple(canvas), Image.Resampling.LANCZOS)) for image in images]
    if min(visible_contributions(normalized)) < 0.02:
        raise ValueError('A building is almost entirely hidden by other layers')
    destination.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='.premium-stage-', dir=destination.parent))
    try:
        records = []
        for (id_, name), image, source, original in zip(EXPECTED, normalized, paths, originals):
            buffer = io.BytesIO()
            image.save(buffer, 'WEBP', lossless=True, exact=True, method=6)
            encoded = buffer.getvalue()
            decoded = decode_layer(encoded, canvas)
            if decoded.tobytes() != image.tobytes():
                raise ValueError('Lossless round-trip pixel mismatch')
            (work / name).write_bytes(encoded)
            records.append({'id': id_, 'asset': f'./home-scene/{name}', 'source_name': source.name,
                            'source_sha256': digest(original), 'sha256': digest(encoded),
                            'pixel_sha256': digest(decoded.tobytes()), 'bytes': len(encoded)})
        report = {'schemaVersion': 1, 'canvas': canvas, 'files': records,
                  'note': 'Staged original layers. Human composition and Android validation remain required.'}
        (work / 'asset-provenance.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        preview = Image.new('RGBA', tuple(canvas), '#F4F1E8')
        for image in normalized:
            preview.alpha_composite(image)
        preview.save(work / 'composition-for-review.png')
        # Same filesystem rename; refuse overwriting a staging directory from an earlier import.
        if destination.exists():
            raise ValueError('Staging destination appeared during import')
        work.rename(destination)
    finally:
        if work.exists():
            shutil.rmtree(work)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for id_, _ in EXPECTED:
        parser.add_argument('--' + id_, type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-width', type=int, default=1024)
    args = parser.parse_args()
    result = prepare([getattr(args, id_.replace('-', '_')) for id_, _ in EXPECTED], args.output, args.max_width)
    print(json.dumps(result, indent=2))

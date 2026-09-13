"""Import only the reviewed V3 bundle; do not activate partial media or source."""
import argparse
import hashlib
import io
import json
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

ALLOWED = set([
    ".github/garden-assets-approved.json",
    ".github/scripts/import_approved_premium_assets.py",
    ".github/scripts/test_garden_images.py",
    ".github/scripts/test_garden_scene.js",
    ".github/scripts/test_garden_v3_images.py",
    ".github/scripts/test_garden_v3_scene.js",
    ".github/scripts/validate_garden_assets.py",
    ".github/scripts/validate_premium_home_images.py",
    ".github/scripts/validate_premium_home_scene.js",
    ".github/scripts/validate_velvet_media.py",
    "docs/PREMIUM_GARDEN_V3.md",
    "visual-packs/spiral-active/HomeBuildingScene.js",
    "visual-packs/spiral-active/SpiralActiveHome.js",
    "visual-packs/spiral-active/home-scene/01_haussmann_left_far.webp",
    "visual-packs/spiral-active/home-scene/02_collectif_left_mid.webp",
    "visual-packs/spiral-active/home-scene/03_poste_municipal_right_mid.webp",
    "visual-packs/spiral-active/home-scene/04_building_right_near.webp",
    "visual-packs/spiral-active/home-scene/05_trees_rear.webp",
    "visual-packs/spiral-active/home-scene/06_trees_left.webp",
    "visual-packs/spiral-active/home-scene/07_trees_right.webp",
    "visual-packs/spiral-active/home-scene/08_trees_front.webp",
    "visual-packs/spiral-active/home-scene/asset-provenance.json",
    "visual-packs/spiral-active/homeSceneModel.js",
    "visual-packs/spiral-active/manifest.json"
])


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_bundle(root, archive):
    approval = json.loads((root / '.github/garden-bundle-approved.json').read_text())
    if archive.name != approval['archive']:
        raise ValueError('Use the unchanged METRA_DECOR_V3.zip, not the obsolete V2 archive')
    if archive.stat().st_size != approval['bytes'] or archive.stat().st_size > 10_000_000:
        raise ValueError('Unapproved ZIP size')
    data = archive.read_bytes()
    if digest(data) != approval['sha256']:
        raise ValueError('Unapproved ZIP hash')
    with ZipFile(io.BytesIO(data)) as z:
        if len(z.namelist()) != len(ALLOWED) + 1 or set(z.namelist()) != ALLOWED | {'BUNDLE_MANIFEST.json'}:
            raise ValueError('Unexpected or duplicate members')
        if z.getinfo('BUNDLE_MANIFEST.json').file_size > 50000:
            raise ValueError('Oversized bundle manifest')
        metadata = json.loads(z.read('BUNDLE_MANIFEST.json'))
        records = metadata['files']
        if metadata.get('schemaVersion') != 1 or set(records) != ALLOWED or approval['payloadCount'] != len(ALLOWED):
            raise ValueError('Wrong member manifest')
        payload = {}
        for name in sorted(ALLOWED):
            info = z.getinfo(name)
            record = records[name]
            p = PurePosixPath(name)
            if p.is_absolute() or '..' in p.parts or '\\' in name or info.is_dir() or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1:
                raise ValueError('Unsafe member')
            if not 0 < info.file_size == record['bytes'] <= 10_000_000:
                raise ValueError('Member size mismatch: ' + name)
            content = z.read(info)
            if digest(content) != record['sha256']:
                raise ValueError('Member hash mismatch: ' + name)
            target = root / name
            if target.is_symlink() or not target.resolve().is_relative_to(root):
                raise ValueError('Unsafe target: ' + name)
            baseline = record['base_sha256']
            if baseline is None:
                if target.exists():
                    raise ValueError('New file already exists: ' + name)
            elif not target.is_file() or digest(target.read_bytes()) != baseline:
                raise ValueError('Source changed since review; refuse overwrite: ' + name)
            payload[name] = content
    return payload


def install(root, archive, check_only=False):
    root = root.resolve()
    payload = read_bundle(root, archive)
    with tempfile.TemporaryDirectory(prefix='metra-garden-v3-stage-') as temporary:
        stage = Path(temporary) / 'repo'
        shutil.copytree(root, stage, symlinks=True,
                        ignore=shutil.ignore_patterns('.git', 'node_modules', 'android', '*.zip', '__pycache__'))
        for name, data in payload.items():
            p = stage / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        commands = [
            ['node', '--test', '.github/scripts/test_premium_home_model.js', '.github/scripts/test_velvet_integration.js', '.github/scripts/test_garden_scene.js', '.github/scripts/test_garden_v3_scene.js'],
            ['python', '.github/scripts/test_premium_home_images.py'],
            ['python', '.github/scripts/test_garden_images.py'],
            ['python', '.github/scripts/test_garden_v3_images.py'],
            ['node', '.github/scripts/validate_premium_home_scene.js'],
            ['python', '.github/scripts/validate_garden_assets.py'],
            ['python', '.github/scripts/validate_velvet_media.py'],
        ]
        for command in commands:
            subprocess.run(command, cwd=stage, check=True, timeout=120)
    if not check_only:
        for name, data in payload.items():
            p = root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=p.parent, delete=False) as f:
                f.write(data)
                temporary = Path(f.name)
            temporary.replace(p)
            if digest(p.read_bytes()) != digest(data):
                raise ValueError('Post-write mismatch')
    print('Reviewed V3 bundle validated: four buildings + four trees. Android visual acceptance remains required.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    install(args.root, args.archive, args.check_only)

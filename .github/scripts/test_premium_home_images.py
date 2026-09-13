"""Synthetic test shapes test the pipeline only; they never replace production artwork."""
import io
import json
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageDraw
from validate_premium_home_images import audit, decode_layer, visible_contributions
from prepare_premium_home_images import prepare, EXPECTED


def sample(index=0, full=False, empty=False, fmt='WEBP', size=(128, 64)):
    image = Image.new('RGBA', size, (0, 0, 0, 0))
    if not empty:
        w, h = size
        rect = (0, 0, w - 1, h - 1) if full else (index * w // 4, h // 5, index * w // 4 + w // 5, h - 1)
        ImageDraw.Draw(image).rectangle(rect, fill=(60 + index * 35, 100, 140, 255))
    data = io.BytesIO()
    image.save(data, fmt, lossless=True, exact=True)
    return data.getvalue()


class ImageValidationTests(unittest.TestCase):
    def test_valid_pixels(self):
        self.assertEqual(decode_layer(sample(), [128, 64]).size, (128, 64))

    def test_truncated_payload(self):
        with self.assertRaises((OSError, ValueError)):
            decode_layer(sample()[:-8], [128, 64])

    def test_wrong_dimensions(self):
        with self.assertRaises(ValueError):
            decode_layer(sample(), [1024, 540])

    def test_opaque_background(self):
        with self.assertRaises(ValueError):
            decode_layer(sample(full=True), [128, 64])

    def test_empty_layer(self):
        with self.assertRaises(ValueError):
            decode_layer(sample(empty=True), [128, 64])

    def test_four_visible_layers(self):
        images = [decode_layer(sample(i), [128, 64]) for i in range(4)]
        self.assertEqual(visible_contributions(images), [1, 1, 1, 1])

    def test_alpha_can_still_hide_other_buildings(self):
        image = decode_layer(sample(), [128, 64])
        self.assertEqual(visible_contributions([image, image, image, image]), [0, 0, 0, 1])

    def test_apk_round_trip_and_missing_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = root / 'visual-packs/spiral-active'
            pack.mkdir(parents=True)
            layers = []
            for i in range(4):
                name = f'{i}.webp'
                (pack / name).write_bytes(sample(i))
                layers.append({'id': str(i), 'asset': name})
            (pack / 'manifest.json').write_text(json.dumps({'homeScene': {'canvas': [128, 64], 'layers': layers}}))
            for number, expected in [(4, 0), (3, 1)]:
                apk = root / f'{number}.apk'
                with ZipFile(apk, 'w') as archive:
                    for i in range(number):
                        archive.writestr(f'res/obfuscated-{i}.webp', sample(i))
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(audit(root, apk=apk), expected)

    def test_trailing_data_is_rejected(self):
        with self.assertRaises(ValueError):
            decode_layer(sample() + b'corruption', [128, 64])

    def test_valid_lossless_vp8l_also_passes_javascript_container_inspector(self):
        script = Path(__file__).with_name('validate_premium_home_scene.js')
        command = "const b=Buffer.from(process.argv[1],'hex'); console.log(JSON.stringify(require(process.argv[2]).inspectWebp(b)));"
        for data in [sample(), sample() + b'bad']:
            result = subprocess.run(['node', '-e', command, data.hex(), str(script)], capture_output=True, text=True)
            if data.endswith(b'bad'):
                self.assertNotEqual(result.returncode, 0)
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)['width'], 128)


class ImageIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.paths = []
        for i in range(4):
            path = self.root / f'original-{i}.png'
            path.write_bytes(sample(i, fmt='PNG', size=(256, 128)))
            self.paths.append(path)

    def test_lossless_staging_preserves_originals_and_common_ratio(self):
        before = [p.read_bytes() for p in self.paths]
        report = prepare(self.paths, self.root / 'staged', 128)
        self.assertEqual(report['canvas'], [128, 64])
        self.assertEqual(before, [p.read_bytes() for p in self.paths])
        self.assertEqual(len(report['files']), 4)
        for record in report['files']:
            self.assertEqual(len(record['sha256']), 64)

    def test_no_overwrite_of_existing_stage(self):
        target = self.root / 'staged'
        target.mkdir()
        with self.assertRaises(ValueError):
            prepare(self.paths, target)
        self.assertEqual(list(target.iterdir()), [])

    def test_cropped_originals_require_explicit_placement(self):
        self.paths[1].write_bytes(sample(1, fmt='PNG', size=(200, 128)))
        with self.assertRaises(ValueError):
            prepare(self.paths, self.root / 'staged')
        self.assertFalse((self.root / 'staged').exists())

    def test_duplicate_originals_rejected(self):
        self.paths[1].write_bytes(self.paths[0].read_bytes())
        with self.assertRaises(ValueError):
            prepare(self.paths, self.root / 'staged')

    def test_opaque_and_corrupt_originals_rejected(self):
        for data in [sample(full=True, fmt='PNG', size=(256, 128)), b'invalid image']:
            self.paths[0].write_bytes(data)
            with self.assertRaises((ValueError, OSError)):
                prepare(self.paths, self.root / 'staged')

    def test_provenance_and_apk_gate_roundtrip_and_tamper(self):
        stage = self.root / 'visual-packs/spiral-active/home-scene'
        report = prepare(self.paths, stage, 128)
        pack = stage.parent
        (pack / 'manifest.json').write_text(json.dumps({'homeScene': {'canvas': report['canvas'], 'layers': report['files']}}))
        apk = self.root / 'test.apk'
        with ZipFile(apk, 'w') as archive:
            for _, name in EXPECTED:
                archive.writestr('res/' + name, (stage / name).read_bytes())
        with redirect_stdout(io.StringIO()):
            self.assertEqual(audit(self.root, apk, require_provenance=True), 0)
            record = report['files'][0]
            record['sha256'] = '0' * 64
            (stage / 'asset-provenance.json').write_text(json.dumps(report))
            self.assertEqual(audit(self.root, apk, require_provenance=True), 1)

    def test_missing_provenance_fails_closed_with_report(self):
        stage = self.root / 'visual-packs/spiral-active/home-scene'
        report = prepare(self.paths, stage, 128)
        (stage.parent / 'manifest.json').write_text(json.dumps({'homeScene': {'canvas': report['canvas'], 'layers': report['files']}}))
        (stage / 'asset-provenance.json').unlink()
        output = self.root / 'report'
        with redirect_stdout(io.StringIO()):
            self.assertEqual(audit(self.root, output=output, require_provenance=True), 1)
        self.assertEqual(json.loads((output / 'asset-audit.json').read_text())['status'], 'BLOCKED')

    def test_staged_originals_pass_whole_structural_gate(self):
        stage = self.root / 'visual-packs/spiral-active/home-scene'
        report = prepare(self.paths, stage, 128)
        pack = stage.parent
        layers = [{**r, 'side': 'left' if i < 2 else 'right', 'depth': i + 1,
                   'introStart': i * .1, 'introEnd': .55 + i * .15}
                  for i, r in enumerate(report['files'])]
        config = {'version': 4, 'homeScene': {'mode': 'four-independent-buildings',
                  'canvas': report['canvas'], 'entryDurationMs': 900,
                  'motion': {'type': 'converge', 'travelFactor': .46, 'verticalOffsetPx': 14}, 'layers': layers}}
        (pack / 'manifest.json').write_text(json.dumps(config))
        source_root = Path(__file__).resolve().parents[2]
        (pack / 'HomeBuildingScene.js').write_bytes((source_root / 'visual-packs/spiral-active/HomeBuildingScene.js').read_bytes())
        script = Path(__file__).with_name('validate_premium_home_scene.js')
        result = subprocess.run(['node', '-e', 'require(process.argv[1]).validate(process.argv[2]);', str(script), str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(audit(self.root, require_provenance=True), 0)

    def test_static_webp_originals_are_supported(self):
        for i, path in enumerate(self.paths):
            path.write_bytes(sample(i, size=(256, 128)))
        self.assertEqual(len(prepare(self.paths, self.root / 'staged')['files']), 4)


if __name__ == '__main__':
    unittest.main()

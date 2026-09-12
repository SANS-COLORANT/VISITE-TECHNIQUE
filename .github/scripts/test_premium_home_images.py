"""Regression tests of the image validator, independent of production assets."""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageDraw
from validate_premium_home_images import audit, decode_layer, visible_contributions


def sample(index=0, full=False, empty=False):
    image = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    if not empty:
        rect = (0, 0, 127, 63) if full else (index * 30, 10, index * 30 + 25, 63)
        ImageDraw.Draw(image).rectangle(rect, fill=(60 + index * 35, 100, 140, 255))
    data = io.BytesIO()
    image.save(data, 'WEBP', lossless=True)
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


if __name__ == '__main__':
    unittest.main()

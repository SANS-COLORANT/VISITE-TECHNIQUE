from pathlib import Path
import base64

# Never alter files in assets/report. We read their exact bytes at build time
# and generate a temporary JS module that Metro bundles into the standalone APK.
assets = {
    'COVER': ('assets/report/cover-building.png', 'png'),
    'LOGO': ('assets/report/brand-logo.png', 'png'),
    'MARK': ('assets/report/spiral-multicolor.png', 'png'),
    'SPIRAL_1': ('assets/report/spiral-red-orange.jpg', 'jpg'),
    'SPIRAL_2': ('assets/report/spiral-yellow-green.jpg', 'jpg'),
    'SPIRAL_3': ('assets/report/spiral-green-red.jpg', 'jpg'),
    'SPIRAL_4': ('assets/report/spiral-multicolor-alt.jpg', 'jpg'),
}

lines = [
    '// Generated during Android build from the exact files in assets/report.',
    '// Do not edit manually.',
]
for name, (path, fmt) in assets.items():
    raw = Path(path).read_bytes()
    b64 = base64.b64encode(raw).decode('ascii')
    lines.append(f"export const EXACT_{name} = '{b64}';")
Path('reportExactAssets.generated.js').write_text('\n'.join(lines) + '\n', encoding='utf-8')

p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')

import_line = "import { EXACT_COVER, EXACT_LOGO, EXACT_MARK, EXACT_SPIRAL_1, EXACT_SPIRAL_2, EXACT_SPIRAL_3, EXACT_SPIRAL_4 } from './reportExactAssets.generated.js';\n"
if import_line not in s:
    marker = "import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';\n"
    if marker not in s:
        raise SystemExit('reportBrandAssets import not found')
    s = s.replace(marker, marker + import_line, 1)

start = s.find('  const embedBundledSafe = async (moduleId, format) => {')
end = s.find('\n\n  const [coverVisualImage', start)
if start < 0 or end < 0:
    # Allow re-running if a previous build already patched the source tree.
    start = s.find('  const embedExactSafe = async (base64Value, format) => {')
    end = s.find('\n\n  const [coverVisualImage', start)
    if start < 0 or end < 0:
        raise SystemExit('PDF image embedding block not found')

embed_block = """  const embedExactSafe = async (base64Value, format) => {
    try {
      if (!base64Value) return null;
      return format === 'png'
        ? await pdf.embedPng(base64Value)
        : await pdf.embedJpg(base64Value);
    } catch (error) {
      console.warn('Impossible d\'integrer un visuel PDF exact', error);
      return null;
    }
  };"""
s = s[:start] + embed_block + s[end:]

cover_start = s.find('  const [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([')
if cover_start < 0:
    cover_start = s.find('  let [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([')
cover_end = s.find('  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));', cover_start)
if cover_start < 0 or cover_end < 0:
    raise SystemExit('Cover image loading block not found')
cover_end += len('  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));')

cover_block = """  const [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([
    embedExactSafe(EXACT_COVER, 'png'),
    embedExactSafe(EXACT_LOGO, 'png'),
    embedExactSafe(EXACT_MARK, 'png'),
    embedExactSafe(EXACT_SPIRAL_1, 'jpg'),
    embedExactSafe(EXACT_SPIRAL_2, 'jpg'),
    embedExactSafe(EXACT_SPIRAL_3, 'jpg'),
    embedExactSafe(EXACT_SPIRAL_4, 'jpg'),
  ]);
  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));"""
s = s[:cover_start] + cover_block + s[cover_end:]

p.write_text(s, encoding='utf-8')

# Sanity checks: originals are still there and generated payloads are non-empty.
for name, (path, _) in assets.items():
    if not Path(path).is_file() or Path(path).stat().st_size == 0:
        raise SystemExit(f'Missing original asset: {path}')
print('Exact PDF assets generated from untouched assets/report files.')

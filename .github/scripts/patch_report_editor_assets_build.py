from pathlib import Path

# reportExactAssets.generated.js is created just before this script by
# patch_pdf_cover_fallback_build.py. Reuse those exact bytes for the editable
# report exporter so the Android release never depends on APK resource URIs for
# the cover, logo, footer certificate or page markers.
p = Path('reportEditorExporter.js')
s = p.read_text(encoding='utf-8')

import_line = "import { EXACT_COVER, EXACT_LOGO, EXACT_MARK, EXACT_SPIRAL_1, EXACT_SPIRAL_2, EXACT_SPIRAL_3, EXACT_SPIRAL_4, EXACT_FOOTER_CERT } from './reportExactAssets.generated.js';\n"
if import_line not in s:
    marker = "import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';\n"
    if marker not in s:
        raise SystemExit('report editor brand import not found')
    s = s.replace(marker, marker + import_line, 1)

jpg_marker = "  const embedJpgSafe = async (base64) => { try { return base64 ? await pdf.embedJpg(base64) : null; } catch { return null; } };\n"
exact_block = """  const embedExactSafe = async (base64Value, format) => {
    try {
      if (!base64Value) return null;
      return format === 'png' ? await pdf.embedPng(base64Value) : await pdf.embedJpg(base64Value);
    } catch (error) {
      console.warn("Impossible d'integrer un visuel exact de l'editeur PDF", error);
      return null;
    }
  };
"""
if 'const embedExactSafe = async (base64Value, format)' not in s:
    if jpg_marker not in s:
        raise SystemExit('report editor PDF embedding marker not found')
    s = s.replace(jpg_marker, jpg_marker + exact_block, 1)

old = """  const [coverExact, logoExact, certExact, pageMarkImage, ...businessSpiralImages] = await Promise.all([
    embedBundledSafe(REPORT_ASSETS.cover, 'png'),
    embedBundledSafe(REPORT_ASSETS.logo, 'png'),
    embedBundledSafe(REPORT_ASSETS.cert, 'png'),
    embedBundledSafe(REPORT_ASSETS.pageMark, 'png'),
    ...REPORT_ASSETS.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),
  ]);"""
new = """  const [coverExact, logoExact, certExact, pageMarkImage, ...businessSpiralImages] = await Promise.all([
    embedExactSafe(EXACT_COVER, 'png'),
    embedExactSafe(EXACT_LOGO, 'png'),
    embedExactSafe(EXACT_FOOTER_CERT, 'png'),
    embedExactSafe(EXACT_MARK, 'png'),
    embedExactSafe(EXACT_SPIRAL_1, 'jpg'),
    embedExactSafe(EXACT_SPIRAL_2, 'jpg'),
    embedExactSafe(EXACT_SPIRAL_3, 'jpg'),
    embedExactSafe(EXACT_SPIRAL_4, 'jpg'),
  ]);"""
if old in s:
    s = s.replace(old, new, 1)
elif "embedExactSafe(EXACT_COVER, 'png')" not in s:
    raise SystemExit('report editor asset loading block not found')

p.write_text(s, encoding='utf-8')
print('Exact assets enabled for editable PDF reports.')

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
      console.warn("Impossible d'integrer un visuel PDF exact", error);
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

# Page 1 layout corrections only. Keep every source image untouched.
layout_replacements = {
    "fit(coverLogoImage, mm(93), mm(22))": "fit(coverLogoImage, mm(86), mm(21))",
    "x: mm(15),\n          y: height - mm(11) - sLogo.height,": "x: mm(16.5),\n          y: height - mm(12) - sLogo.height,",
    "const boxX = mm(28);": "const boxX = mm(30);",
    "const boxY = height - mm(82);": "const boxY = height - mm(80);",
    "const boxW = mm(153);": "const boxW = mm(150);",
    "const boxH = mm(20);": "const boxH = mm(18);",
    "fit(coverVisualImage, mm(159), mm(99))": "fit(coverVisualImage, mm(148), mm(92))",
    "y: height - mm(94) - sCover.height,": "y: height - mm(96) - sCover.height,",
    "y: height - mm(190),": "y: height - mm(194),",
    "const businessY = height - mm(205);": "const businessY = height - mm(207);",
    "const iconSize = mm(6);": "const iconSize = mm(5.2);",
    "const gap = mm(1.1);": "const gap = mm(0.9);",
    "const itemGap = mm(3.4);": "const itemGap = mm(3.0);",
}
for old, new in layout_replacements.items():
    if old not in s:
        raise SystemExit(f'Page 1 layout target not found: {old}')
    s = s.replace(old, new, 1)

# Regulation pages: do not print placeholder networks that contain only blanks
# or '/' values. These empty records were creating the stray '/' section titles
# and whole blank tables visible on pages 4 and 5 of exported reports.
old_regulation = """    if (panelId === 'p-regulation') {
      reseaux.forEach((r, i) => groups.push({
        title: r.nom_reseau || `Réseau n°${i + 1}`,
        rows: [
          { label: 'T°ext(°C)', type: 'champ', avis: '', comment: r.t_ext_c || '' },
          { label: 'T°dép(°C)', type: 'champ', avis: '', comment: r.t_dep_c || '' },
          { label: 'Nom réseau', type: 'champ', avis: '', comment: r.nom_reseau || '' },
          { label: 'Courbe de chauffe', type: 'champ', avis: '', comment: r.courbe_de_chauffe || '' },
          { label: 'TNC', type: 'champ', avis: '', comment: r.tnc || '' },
          { label: 'Consigne et Programme horaire', type: 'champ', avis: '', comment: r.consigne_programme_horaire || '' },
        ],
      }));
    }"""
new_regulation = """    if (panelId === 'p-regulation') {
      const valeurReseauUtile = (value) => {
        const text = String(value ?? '').trim();
        return text !== '' && text !== '/';
      };
      const reseauxUtiles = reseaux.filter((r) => [
        r.nom_reseau,
        r.t_ext_c,
        r.t_dep_c,
        r.courbe_de_chauffe,
        r.tnc,
        r.consigne_programme_horaire,
      ].some(valeurReseauUtile));

      reseauxUtiles.forEach((r, i) => groups.push({
        title: valeurReseauUtile(r.nom_reseau) ? r.nom_reseau : `Réseau n°${i + 1}`,
        rows: [
          { label: 'T°ext(°C)', type: 'champ', avis: '', comment: valeurReseauUtile(r.t_ext_c) ? r.t_ext_c : '' },
          { label: 'T°dép(°C)', type: 'champ', avis: '', comment: valeurReseauUtile(r.t_dep_c) ? r.t_dep_c : '' },
          { label: 'Nom réseau', type: 'champ', avis: '', comment: valeurReseauUtile(r.nom_reseau) ? r.nom_reseau : '' },
          { label: 'Courbe de chauffe', type: 'champ', avis: '', comment: valeurReseauUtile(r.courbe_de_chauffe) ? r.courbe_de_chauffe : '' },
          { label: 'TNC', type: 'champ', avis: '', comment: valeurReseauUtile(r.tnc) ? r.tnc : '' },
          { label: 'Consigne et Programme horaire', type: 'champ', avis: '', comment: valeurReseauUtile(r.consigne_programme_horaire) ? r.consigne_programme_horaire : '' },
        ],
      }));
    }"""
if old_regulation not in s:
    raise SystemExit('Regulation network block not found')
s = s.replace(old_regulation, new_regulation, 1)

p.write_text(s, encoding='utf-8')

for name, (path, _) in assets.items():
    if not Path(path).is_file() or Path(path).stat().st_size == 0:
        raise SystemExit(f'Missing original asset: {path}')
print('Exact PDF assets generated, page 1 adjusted, and empty regulation networks removed.')

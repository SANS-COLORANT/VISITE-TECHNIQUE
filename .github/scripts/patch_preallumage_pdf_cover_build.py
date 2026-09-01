from pathlib import Path

p = Path('preAllumageReportExporter.js')
s = p.read_text(encoding='utf-8')

exact_import = "import { EXACT_COVER, EXACT_LOGO, EXACT_FOOTER_CERT } from './reportExactAssets.generated.js';\n"
marker = "import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';\n"
if exact_import not in s:
    if marker not in s:
        raise SystemExit('preAllumageReportExporter brand assets import not found')
    s = s.replace(marker, marker + exact_import, 1)

constants_marker = "const GREY = '#595959';\n"
constants_block = """const GREY = '#595959';
const PREALLUMAGE_LOGO = `data:image/png;base64,${EXACT_LOGO}`;
const PREALLUMAGE_COVER = `data:image/png;base64,${EXACT_COVER}`;
const PREALLUMAGE_FOOTER_CERT = `data:image/png;base64,${EXACT_FOOTER_CERT}`;
"""
if 'const PREALLUMAGE_LOGO =' not in s:
    if constants_marker not in s:
        raise SystemExit('preAllumageReportExporter constants marker not found')
    s = s.replace(constants_marker, constants_block, 1)

s = s.replace('src="${REPORT_LOGO}" alt="Energie & Service"', 'src="${PREALLUMAGE_LOGO}" alt="Energie & Service"')
s = s.replace('src="${REPORT_COVER}" alt="Couverture"', 'src="${PREALLUMAGE_COVER}" alt="Couverture"')
s = s.replace('src="${REPORT_OPQIBI}" alt="OPQIBI"', 'src="${PREALLUMAGE_FOOTER_CERT}" alt="OPQIBI"')

old_embed = """  const [logo, visual, opqibi] = await Promise.all([
    pdf.embedJpg(base64DepuisDataUri(REPORT_LOGO)),
    pdf.embedJpg(base64DepuisDataUri(REPORT_COVER)),
    pdf.embedJpg(base64DepuisDataUri(REPORT_OPQIBI)),
  ]);"""
new_embed = """  const [logo, visual, opqibi] = await Promise.all([
    pdf.embedPng(EXACT_LOGO),
    pdf.embedPng(EXACT_COVER),
    pdf.embedPng(EXACT_FOOTER_CERT),
  ]);"""
if old_embed in s:
    s = s.replace(old_embed, new_embed, 1)
elif new_embed not in s:
    raise SystemExit('preAllumageReportExporter PDF cover embedding block not found')

old_comment = """  // Méthode historique stable : les trois visuels sont déjà embarqués en
  // Base64 et sont injectés directement avec pdf-lib. Aucun chemin de ressource
  // Android n'est confié à expo-file-system."""
new_comment = """  // Même méthode robuste que le rapport principal : les PNG originaux de
  // assets/report sont transformés en Base64 au build puis injectés directement
  // avec pdf-lib. expo-print n'est donc jamais responsable des images finales."""
s = s.replace(old_comment, new_comment)

p.write_text(s, encoding='utf-8')
print('Pre-allumage PDF cover patched to use exact bundled PNG assets.')

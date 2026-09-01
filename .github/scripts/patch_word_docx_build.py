from pathlib import Path


def insert_import(path: Path, marker: str, line: str):
    text = path.read_text(encoding='utf-8')
    if line not in text:
        if marker not in text:
            raise SystemExit(f'import marker not found in {path}')
        text = text.replace(marker, marker + line, 1)
        path.write_text(text, encoding='utf-8')


# Standard reports.
report = Path('reportBuilder.js')
insert_import(
    report,
    "import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';\n",
    "import { exporterRapportDocx } from './wordDocxExporter.js';\n",
)
s = report.read_text(encoding='utf-8')
old = """  if (format === 'word') {
    const html = await construireHtmlRapport(datas, config, photosConfig, 'word');
    const nom = `${base}.doc`;
    return { format, uri: await ecrireWordHtml(dossier, nom, html), nom };
  }
"""
new = """  if (format === 'word') {
    const nom = `${base}.docx`;
    return { format, uri: await exporterRapportDocx({ datas, config, photosConfig, dossier, nom }), nom };
  }
"""
if old not in s:
    if "exporterRapportDocx({ datas, config, photosConfig, dossier, nom })" not in s:
        raise SystemExit('standard Word export block not found')
else:
    s = s.replace(old, new, 1)
report.write_text(s, encoding='utf-8')


# Editable reports. Keep the editor's selected/ordered sections through preparedDatas.
editor = Path('reportEditorExporter.js')
insert_import(
    editor,
    "import { construireHtmlRapport } from './reportBuilder.js';\n",
    "import { exporterRapportDocx } from './wordDocxExporter.js';\n",
)
s = editor.read_text(encoding='utf-8')
old = """  if (format === 'word') {
    const nom = `${base}.doc`;
    return { format, uri: await ecrireWordHtml(dossier, nom, rendered.html), nom };
  }
"""
new = """  if (format === 'word') {
    const nom = `${base}.docx`;
    return { format, uri: await exporterRapportDocx({ datas: rendered.preparedDatas, config, photosConfig, dossier, nom }), nom };
  }
"""
if old not in s:
    if "datas: rendered.preparedDatas" not in s:
        raise SystemExit('editable Word export block not found')
else:
    s = s.replace(old, new, 1)
editor.write_text(s, encoding='utf-8')


# Pre-allumage reports.
pre = Path('preAllumageReportExporter.js')
insert_import(
    pre,
    "import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';\n",
    "import { exporterRapportDocx } from './wordDocxExporter.js';\n",
)
s = pre.read_text(encoding='utf-8')
old_destructure = "  const { data, html } = await construireHtml(visiteId);\n"
new_destructure = "  const { data, config, html } = await construireHtml(visiteId);\n"
if old_destructure in s:
    s = s.replace(old_destructure, new_destructure, 1)
elif new_destructure not in s:
    raise SystemExit('pre-allumage build destructuring block not found')
old = """  if (format === 'word') {
    const nom = `${base}.doc`;
    return { annule: false, format, nom, uri: await ecrireWord(dossier, nom, html) };
  }
"""
new = """  if (format === 'word') {
    const nom = `${base}.docx`;
    return { annule: false, format, nom, uri: await exporterRapportDocx({ datas: [data], config, photosConfig: [], dossier, nom, title: 'Rapport Pré-allumage' }) };
  }
"""
if old not in s:
    if "title: 'Rapport Pré-allumage'" not in s:
        raise SystemExit('pre-allumage Word export block not found')
else:
    s = s.replace(old, new, 1)
pre.write_text(s, encoding='utf-8')

print('Real DOCX exporters installed for standard, editable and Pre-allumage reports.')

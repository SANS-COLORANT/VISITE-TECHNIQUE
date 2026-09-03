from pathlib import Path
import re


def ensure_import(path: Path, anchor: str):
    s = path.read_text(encoding='utf-8')
    imp = "import { dossierRapportMetra } from './metraStorage.js';\n"
    if imp not in s:
        if anchor not in s:
            raise SystemExit(f'{path.name}: storage import anchor not found')
        s = s.replace(anchor, anchor + imp, 1)
    path.write_text(s, encoding='utf-8')


def patch_exporter(path: Path, anchor: str, edited: bool):
    ensure_import(path, anchor)
    s = path.read_text(encoding='utf-8')

    # Replace the Android folder picker with METRA's single persisted root and
    # automatic Client/Site/Visit hierarchy. Match until the next helper so the
    # patch is independent of whitespace inside the old picker implementation.
    choose_pattern = re.compile(
        r"async function choisirDossier\(\)\s*\{[\s\S]*?\n\}\n\nasync function copierPdfVersDossier",
        re.MULTILINE,
    )
    replacement = "async function choisirDossier(datas = []) {\n  return dossierRapportMetra(datas);\n}\n\nasync function copierPdfVersDossier"
    if choose_pattern.search(s):
        s = choose_pattern.sub(replacement, s, count=1)
    elif "async function choisirDossier(datas = [])" not in s:
        raise SystemExit(f'{path.name}: report folder picker target not found')

    s = s.replace("dossierUri || await choisirDossier();", "dossierUri || await choisirDossier(datas);")

    if edited:
        # Per-site reports must be filed in each site's own visit folder rather
        # than all being forced into one common folder.
        s = s.replace(
            "export async function exporterRapportsParSiteEdites({ datas, config, photosConfig, format = 'pdf' }) {\n  const dossier = await choisirDossier();\n  if (!dossier) return { annule: true, resultats: [] };",
            "export async function exporterRapportsParSiteEdites({ datas, config, photosConfig, format = 'pdf' }) {",
        )
        s = s.replace(
            "resultats.push(await exporterRapportEdite({ datas: siteDatas, config: siteConfig, photosConfig, format, dossierUri: dossier }));",
            "resultats.push(await exporterRapportEdite({ datas: siteDatas, config: siteConfig, photosConfig, format }));",
        )
    else:
        s = s.replace(
            "export async function exporterRapportsParSite({ datas, config, photosConfig, format = 'pdf' }) {\n  const dossier = await choisirDossier();\n  if (!dossier) return { annule: true, resultats: [] };",
            "export async function exporterRapportsParSite({ datas, config, photosConfig, format = 'pdf' }) {",
        )
        s = s.replace(
            "resultats.push(await exporterRapport({ datas: siteDatas, config, photosConfig, format, dossierUri: dossier }));",
            "resultats.push(await exporterRapport({ datas: siteDatas, config, photosConfig, format }));",
        )

    if "requestDirectoryPermissionsAsync" in s and "async function choisirDossier(datas = [])" not in s:
        raise SystemExit(f'{path.name}: old report picker still active')
    if "dossierUri || await choisirDossier(datas);" not in s:
        raise SystemExit(f'{path.name}: automatic report folder missing')

    path.write_text(s, encoding='utf-8')


patch_exporter(
    Path('reportEditorExporter.js'),
    "import { construireHtmlRapport } from './reportBuilder.js';\n",
    edited=True,
)
patch_exporter(
    Path('reportBuilder.js'),
    "import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';\n",
    edited=False,
)

# User-facing confirmation must describe the automatic destination accurately.
p = Path('ReportScreen.js')
s = p.read_text(encoding='utf-8')
s = s.replace('rapport(s) enregistré(s) dans le dossier choisi.', 'rapport(s) classé(s) automatiquement dans Documents/METRA.')
s = s.replace('a été enregistré dans le dossier choisi.', 'a été classé automatiquement dans Documents/METRA.')
p.write_text(s, encoding='utf-8')

print('METRA automatic report storage patched safely.')

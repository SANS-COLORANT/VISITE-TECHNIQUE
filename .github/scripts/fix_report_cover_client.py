from pathlib import Path

p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')

s = s.replace(
    'async function habillerPdf(uriSource, config, siteFooter) {',
    'async function habillerPdf(uriSource, config, siteFooter, clientCover) {',
    1,
)

old = """      const client = String(config.client || config.nomClient || config.clientNom || '').trim();
      const coverClient = client || String(config.titreClient || '').trim();
      const clientLabel = coverClient || String(config.site || '').trim() || 'Rapport de visite technique';
"""
new = """      const clientLabel = String(clientCover || '').trim() || 'Rapport de visite technique';
"""
if old not in s:
    raise SystemExit('cover client block not found')
s = s.replace(old, new, 1)

old = """  const sites = [...new Set(datas.map((d) => d.visite.nom_site).filter(Boolean))];
  const siteFooter = sites.length === 1 ? sites[0] : `${sites.length} sites sélectionnés`;
"""
new = """  const sites = [...new Set(datas.map((d) => d.visite.nom_site).filter(Boolean))];
  const siteFooter = sites.length === 1 ? sites[0] : `${sites.length} sites sélectionnés`;
  const clientCover = datas[0]?.visite?.nom_client || 'Rapport';
"""
if old not in s:
    raise SystemExit('export client anchor not found')
s = s.replace(old, new, 1)

old = '    habille = await habillerPdf(printed.uri, config, siteFooter);'
new = '    habille = await habillerPdf(printed.uri, config, siteFooter, clientCover);'
if old not in s:
    raise SystemExit('habillerPdf call not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('PDF cover client binding fixed.')

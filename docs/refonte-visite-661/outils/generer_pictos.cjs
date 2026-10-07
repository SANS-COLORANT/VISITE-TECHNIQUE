// Exporte chaque pictogramme de maquettes/pictogrammes.html en SVG autonome (+ index.json et INDEX.md).
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '..'); const OUT = path.join(ROOT, 'pictos');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  await p.goto('file://' + path.join(ROOT, 'maquettes', 'pictogrammes.html')); await p.waitForTimeout(500);
  const data = await p.evaluate(() => S.map(([id, titre, sub, items]) => ({ id, titre, sub, items: items.map(([nom, usage, tags, svg, eau, badge]) => ({ nom, usage, tags, svg, eau: !!eau, badge: badge || null })) })));
  const idx = []; let md = '# Index des pictogrammes\n\n';
  for (const fam of data) {
    fs.mkdirSync(path.join(OUT, fam.id), { recursive: true });
    md += `## ${fam.titre} (${fam.items.length})\n\n${fam.sub}\n\n| Fichier | Nom | Usage | Trames |\n|---|---|---|---|\n`;
    const seen = {};
    for (const it of fam.items) {
      const acc = it.eau ? '#0F7C8C' : '#F26426';
      let inner = it.svg
        .replace(/class="k"/g, 'stroke="#1A1A18" fill="none" vector-effect="non-scaling-stroke"')
        .replace(/class="a"/g, `stroke="${acc}" fill="none" vector-effect="non-scaling-stroke"`)
        .replace(/class="fa"/g, `stroke="${acc}" fill="${acc}" fill-opacity=".16" vector-effect="non-scaling-stroke"`)
        .replace(/class="d"/g, `fill="${acc}" stroke="none"`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;
      let f = slug(it.nom + (it.badge ? '-' + it.badge : '') + (it.usage && seen[slug(it.nom)] ? '-' + slug(it.usage).slice(0, 18) : ''));
      seen[slug(it.nom)] = (seen[slug(it.nom)] || 0) + 1; if (fs.existsSync(path.join(OUT, fam.id, f + '.svg'))) f += '-' + seen[slug(it.nom)];
      fs.writeFileSync(path.join(OUT, fam.id, f + '.svg'), svg);
      idx.push({ famille: fam.id, fichier: `${fam.id}/${f}.svg`, nom: it.nom, usage: it.usage, trames: it.tags, eau: it.eau });
      md += `| ![](${fam.id}/${f}.svg) | ${it.nom} | ${it.usage || ''} | ${it.tags.length === 4 ? 'Toutes' : it.tags.join(', ')} |\n`;
    }
    md += '\n';
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx, null, 1)); fs.writeFileSync(path.join(OUT, 'INDEX.md'), md);
  await p.addStyleTag({ content: '.nav{position:static!important}' });
  await p.screenshot({ path: path.join(ROOT, 'captures', '09-pictogrammes-planche.jpg'), type: 'jpeg', quality: 82, fullPage: true });
  console.log(idx.length, 'pictogrammes'); await b.close();
})();

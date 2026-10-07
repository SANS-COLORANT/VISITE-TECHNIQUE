// Régénère les captures de docs/refonte-visite-661/captures à partir des maquettes HTML.
// Usage : NODE_PATH=$(npm root -g) node generer_captures.cjs   (Chromium Playwright requis)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'captures');
const URL = 'file://' + path.join(ROOT, 'maquettes', 'maquettes-visite.html');
const FULL = '.phone{height:auto!important;min-height:600px}.body{overflow:visible!important;flex:none!important}.fch,.ocr,.pv,.pop,.toast{display:none!important}.nav{position:static!important}';
const OPEN = "document.querySelectorAll('#bd-b .banner').forEach(b=>{COL[b.dataset.k||b.querySelector('.t b').textContent]=false});applyDOM();mesure()";
const SCREENS = [
  ['00-coque', 'coque'], ['01-informations', 'infos'], ['02-distribution', 'd'], ['03-regulation', 'r'],
  ['04-releves', 'rel'], ['06-equipements', 'e'], ['07-reserves', 'res'], ['08-photos', 'p'],
];
const CONF = ['Local', 'Energie', 'Chauffage', 'ECS', 'Adoucisseur'];
const STATES = [
  ['04-releves-lecture-photo-cadrage', 'rel', ["document.querySelector('#bd-b [data-a=ocr][data-c=\"3\"]').click()"]],
  ['04-releves-lecture-photo-verification', 'rel', ["document.querySelector('#bd-b [data-a=ocr][data-c=\"3\"]').click()", "document.querySelector('#ocr-b [data-a=ocrshot]').click()"]],
  ['04-releves-unites', 'rel', [OPEN, "document.querySelector('#bd-b [data-a=cunit][data-c=\"2\"]').click()"]],
  ['03-regulation-menu-reseau', 'r', [OPEN, "document.querySelector('#bd-b [data-a=nmenu][data-n=\"1\"]').click()"]],
  ['05-conformite-fiche-ns', 'c', [OPEN, "document.querySelector('#bd-b .bt.NS').click()"]],
  ['05-conformite-commentaire', 'c', [OPEN, "document.querySelector('#bd-b .cmi').click()"]],
  ['06-equipements-groupe-ouvert', 'e', [OPEN]],
  ['06-equipements-fiche', 'e', [OPEN, "document.querySelector('#bd-b [data-a=efi]').click()"]],
  ['06-equipements-ajout', 'e', ["document.querySelector('#bd-b [data-a=eadd]').click()"]],
  ['07-reserves-fiche', 'res', [OPEN, "document.querySelector('#bd-b [data-a=rfi]').click()"]],
  ['07-reserves-ajout', 'res', ["document.querySelector('#bd-b [data-a=radd]').click()"]],
  ['08-photos-visionneuse', 'p', [OPEN, "document.querySelector('#bd-b [data-a=pview]').click()"]],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 760, height: 1000 }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  const go = async (hash) => { await p.goto(URL + '#' + hash); await p.reload(); await p.waitForTimeout(700); };
  const shot = async (sel, name) => (await p.locator(sel).first().screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 82 }), console.log(name));
  for (const [name, id] of SCREENS) {
    await go(id); await shot('.row', name + '-defaut');
    await p.addStyleTag({ content: FULL }); await p.evaluate(OPEN); await p.waitForTimeout(250); await shot('.row', name + '-complet');
  }
  for (let i = 0; i < CONF.length; i++) {
    await go('c'); await p.evaluate((i) => document.querySelectorAll('#ctabs button')[i].click(), i); await p.waitForTimeout(300);
    await shot('.row', '05-conformite-' + CONF[i].toLowerCase() + '-defaut');
    await p.addStyleTag({ content: FULL }); await p.evaluate(OPEN); await p.waitForTimeout(250); await shot('.row', '05-conformite-' + CONF[i].toLowerCase() + '-complet');
  }
  for (const [name, id, steps] of STATES) {
    await go(id);
    for (const s of steps) { await p.evaluate(s); await p.waitForTimeout(150); }
    await shot('#ph-b', name);
  }
  await go('coque'); await shot('#ph-b', '00-coque-fenetre-avancement');
  await b.close();
})();

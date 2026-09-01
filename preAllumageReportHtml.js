import { libelleSection } from './preAllumageAliases.js';

const ORANGE = '#F07E31';
const BLUE = '#5B9BD5';
const PEACH = '#F8CBAD';
const GREY = '#7F7F7F';

function esc(v = '') {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateFr(v) {
  if (!v) return '';
  const m = String(v).slice(0, 10).split('-');
  return m.length === 3 ? `${m[2]}/${m[1]}/${m[0]}` : String(v);
}

function section(data, panelId) {
  return (data.sections || []).find((s) => s.panelId === panelId) || { groups: [] };
}

function rowValue(g, label) {
  const row = (g?.rows || []).find((r) => r.label === label || r.storageKey === label);
  return String(row?.comment || '').trim();
}

function titreGroupe(data, panelId, g) {
  return libelleSection(panelId, g?.title || '', data.aliases || {});
}

function infoValue(data, label) {
  const s = section(data, 'p-pa-infos');
  for (const g of s.groups || []) {
    const v = rowValue(g, label);
    if (v) return v;
  }
  return '';
}

function visibleRows(rows = [], afficherLignesVides = false) {
  return rows.filter((r) => afficherLignesVides || String(r?.avis || r?.comment || '').trim());
}

function resultClass(avis) {
  const v = String(avis || '').trim().toUpperCase();
  if (v === 'S') return 'paResultOk';
  if (v === 'N.S' || v === 'NS') return 'paResultKo';
  if (v) return 'paResultWarn';
  return '';
}

function actionChaufferie(label) {
  const l = String(label || '');
  const map = {
    'Test allumage': 'Test allumage',
    'Présence des flammes': 'Vérification de la présence des flammes',
    'Augmentation de la température de l’eau en sortie de chaudière': 'Vérification de l’augmentation de la température de l’eau en sortie de chaudière via le thermomètre installé',
    'Fonctionnement de la pompe de charge': 'Vérification du fonctionnement de la pompe de charge',
    'Ouverture de l’électrovanne gaz / alimentation gaz': 'Vérification du fonctionnement de l’ouverture de l’électrovanne gaz pour alimentation en gaz',
    'Fonctionnement de l’électrode d’allumage': 'Vérification du fonctionnement de l’électrode d’allumage',
    'Fonctionnement pompe n°1': 'Vérification du fonctionnement de la pompe n°1',
    'Fonctionnement pompe n°2': 'Vérification du fonctionnement de la pompe n°2',
    'Ouverture / fermeture vanne trois voies': 'Vérification du fonctionnement de la vanne trois voies',
    'Fonctionnement servomoteur': 'Vérification du fonctionnement du servomoteur',
    'Fonctionnement de la régulation': 'Vérification du fonctionnement de la régulation',
  };
  return map[l] || l;
}

function sstMeta(label) {
  const l = String(label || '');
  if (/^Pompe chauffage n°1$/i.test(l)) return ['Pompes chauffage', 'Vérification du fonctionnement de la pompe n°1'];
  if (/^Pompe chauffage n°2$/i.test(l)) return ['Pompes chauffage', 'Vérification du fonctionnement de la pompe n°2'];
  if (l.startsWith('Vanne trois voies chauffage')) return ['Vanne trois voies avec servomoteur', 'Vérification du fonctionnement de la vanne trois voies'];
  if (/^Servomoteur chauffage$/i.test(l)) return ['Vanne trois voies avec servomoteur', 'Vérification du fonctionnement du servomoteur'];
  if (/^Régulation chauffage$/i.test(l)) return ['Régulation', 'Vérification du fonctionnement de la régulation'];
  if (/^Pompe bouclage ECS n°1$/i.test(l)) return ['Pompes bouclage ECS', 'Vérification du fonctionnement de la pompe n°1'];
  if (/^Pompe bouclage ECS n°2$/i.test(l)) return ['Pompes bouclage ECS', 'Vérification du fonctionnement de la pompe n°2'];
  if (/^Pompe primaire ECS n°1$/i.test(l)) return ['Pompes primaires ECS', 'Vérification du fonctionnement de la pompe n°1'];
  if (/^Pompe primaire ECS n°2$/i.test(l)) return ['Pompes primaires ECS', 'Vérification du fonctionnement de la pompe n°2'];
  if (l.startsWith('Vanne trois voies ECS')) return ['Vanne trois voies avec servomoteur ECS', 'Vérification du fonctionnement de la vanne trois voies'];
  if (/^Servomoteur ECS$/i.test(l)) return ['Vanne trois voies avec servomoteur ECS', 'Vérification du fonctionnement du servomoteur'];
  if (/^Régulation ECS$/i.test(l)) return ['Régulation ECS', 'Vérification du fonctionnement de la régulation'];
  if (l.startsWith('Traitement d’eau')) return ['Traitement d’eau', 'Vérification du fonctionnement des pompes doseuses'];
  return [l, l];
}

function tableEssaisGroup(title, rows, config, mode = 'sst') {
  const visibles = visibleRows(rows, config.afficherLignesVides);
  if (!visibles.length) return '';
  return `<div class="paTestGroup"><div class="paSubTitle">${esc(title)}</div><table class="paTestTable"><thead><tr><th class="paEquip">Equipement</th><th>Action</th><th class="paComment">Commentaire</th></tr></thead><tbody>${visibles.map((r) => {
    const meta = mode === 'chaufferie' ? [title, actionChaufferie(r.label)] : sstMeta(r.label);
    const resultat = String(r.comment || '').trim() || (r.avis ? r.avis : '/');
    return `<tr><td>${esc(meta[0])}</td><td>${esc(meta[1])}</td><td class="${resultClass(r.avis)}">${esc(resultat)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function tableBatiments(data, config) {
  const groups = section(data, 'p-pa-batiments').groups || [];
  const rows = groups.map((g, i) => {
    const nb = rowValue(g, 'Nombre de logements desservis');
    const bat = rowValue(g, 'Bâtiments desservis');
    const sit = rowValue(g, 'Situation / localisation');
    const connus = new Set(['Nombre de logements desservis', 'Bâtiments desservis', 'Situation / localisation']);
    const extras = (g.rows || []).filter((r) => !connus.has(r.storageKey || r.label) && (config.afficherLignesVides || String(r.comment || '').trim()));
    if (!config.afficherLignesVides && !nb && !bat && !sit && !extras.length) return '';
    return `<tr><td>${esc(titreGroupe(data, 'p-pa-batiments', g))}</td><td>${esc(nb || '-')}</td><td>${esc(bat || '')}</td><td>${esc(sit || '')}</td></tr>${extras.map((r) => `<tr><td></td><td colspan="3"><b>${esc(r.label)} :</b> ${esc(r.comment || '')}</td></tr>`).join('')}`;
  }).join('');
  return `<table class="paBuildingTable"><thead><tr><th>Local / SST</th><th>Nombre de logements desservis</th><th>Bâtiments desservis</th><th>Situation</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function tableCompteurs(data, config) {
  const s = section(data, 'p-pa-compteurs');
  const rows = (s.groups || []).flatMap((g) => (g.rows || []).map((r) => ({ groupe: g, row: r })))
    .filter(({ row }) => config.afficherLignesVides || String(row.comment || '').trim())
    .map(({ groupe, row }) => `<tr><td>${esc(titreGroupe(data, 'p-pa-compteurs', groupe))}</td><td>${esc(row.label)}</td><td>${esc(String(row.comment || '').trim())}</td></tr>`).join('');
  return `<table class="paMeterTable"><tbody><tr><td class="paLabel">Date de la visite</td><td colspan="2">${esc(dateFr(data.visite.date_visite))}</td></tr><tr><th>Local / groupe</th><th>Compteur</th><th>Index relevé</th></tr>${rows}</tbody></table>`;
}

function courtReg(label) {
  return String(label || '').replace('Courbe de chauffe — ', '').replace(/ \(°C\)$/,'').replace('Température de non chauffe (°C)','Température de Non Chauffe').replace('Température extérieure (°C)','Température Extérieure').replace('Départ chauffage (°C)','Départ chauffage').replace('Retour chauffage (°C)','Retour chauffage').replace('Départ ECS (°C)','Départ ECS').replace('Retour ECS (°C)','Retour ECS').replace('Arrivée primaire ECS (°C)','Arrivée primaire ECS').replace('Retour primaire ECS (°C)','Retour primaire ECS');
}

function tableRegulation(data) {
  const groups = section(data, 'p-pa-regulation').groups || [];
  const labels = [];
  groups.forEach((g) => (g.rows || []).forEach((r) => { if (!labels.includes(r.label)) labels.push(r.label); }));
  const morceaux = [];
  for (let i = 0; i < groups.length; i += 6) morceaux.push(groups.slice(i, i + 6));
  return morceaux.map((part, partIndex) => `<div class="paRegChunk${partIndex ? ' paRegBreak' : ''}"><table class="paRegTable"><thead><tr><th>Paramètre</th>${part.map((g) => `<th>${esc(titreGroupe(data, 'p-pa-regulation', g))}</th>`).join('')}</tr></thead><tbody>${labels.map((label) => `<tr><td class="paRegLabel">${esc(courtReg(label))}</td>${part.map((g) => {
    const v = rowValue(g, label);
    return `<td class="${/ecs|primaire/i.test(label) && v ? 'paTempValue' : ''}">${esc(v)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
}

function conclusionHtml(data) {
  const groups = section(data, 'p-pa-conclusion').groups || [];
  const lignes = groups.flatMap((g) => (g.rows || []).filter((r) => String(r.comment || r.avis || '').trim()).map((r) => ({ groupe: g.title, ...r })));
  if (!lignes.length) return '<p class="paConclusionLead">La conclusion de la visite de pré-allumage reste à compléter.</p>';
  return lignes.map((r) => `<div class="paConclusionItem"><b>${esc(r.label)}</b><p>${esc(r.comment || r.avis)}</p></div>`).join('');
}

function page(titre, numero, body, extraClass = '') {
  return `<section class="paPage ${extraClass}"><div class="paPageTitle"><span>${numero}</span> ${esc(titre)}</div>${body}</section>`;
}

export const PREALLUMAGE_REPORT_CSS = `
  .paPage{page-break-before:always;min-height:235mm;padding-top:2mm}
  .paPageTitle{font-size:12pt;font-weight:800;color:${ORANGE};margin:2mm 0 5mm}.paPageTitle span{margin-right:2mm}
  .paContacts{display:grid;grid-template-columns:1fr 1fr;gap:8mm 10mm;margin-top:12mm}.paContactCard{border:1.2px solid #111;padding:0 4mm 4mm;min-height:42mm}.paContactCard h3{margin:0 -4mm 3mm;padding:2mm 3mm;color:#fff;font-size:9pt}.paContactClient h3{background:#F1C40F}.paContactOperator h3{background:#8DBE45}.paContactAmo h3{background:${ORANGE}}.paContactAmo{grid-column:2}.paContactClient{grid-column:1 / span 2;width:58%;justify-self:center}.paContactCard p{margin:1mm 0;font-size:8.5pt;line-height:1.25}
  .paPlanWrap{height:92mm;display:flex;align-items:center;justify-content:center;margin:0 8mm 5mm;overflow:hidden}.paPlanWrap img{max-width:100%;max-height:100%;object-fit:contain}.paPlanMissing{width:100%;height:100%;border:1px dashed #aaa;display:flex;align-items:center;justify-content:center;color:#777;font-style:italic}
  .paBuildingTable,.paMeterTable,.paTestTable,.paRegTable{width:100%;border-collapse:collapse;table-layout:fixed}.paBuildingTable th,.paMeterTable th,.paTestTable th{background:${PEACH};font-weight:800;text-align:center}.paBuildingTable td,.paBuildingTable th,.paMeterTable td,.paMeterTable th,.paTestTable td,.paTestTable th{border:.8px solid #111;padding:1.1mm 1.2mm;font-size:7.3pt;vertical-align:middle}.paBuildingTable th:nth-child(1){width:10%}.paBuildingTable th:nth-child(2){width:26%}.paBuildingTable th:nth-child(3){width:31%}.paBuildingTable th:nth-child(4){width:33%}.paBuildingTable td:nth-child(1),.paBuildingTable td:nth-child(2){text-align:center}
  .paMeterTable{width:92%;margin:0 auto}.paMeterTable td,.paMeterTable th{font-size:8pt;padding:1.35mm}.paMeterTable .paLabel,.paMeterTable tr:nth-child(n+4) td:first-child{background:${PEACH};font-weight:700}.paMeterTable td:not(:first-child){text-align:center}
  .paRegTable{font-size:5.1pt}.paRegTable th,.paRegTable td{border:.65px solid #111;padding:.7mm .45mm;text-align:center;vertical-align:middle;overflow-wrap:anywhere}.paRegTable th{background:${BLUE};color:#fff;font-weight:800}.paRegTable th:first-child{width:24mm}.paRegLabel{font-weight:700;background:#E7E6E6;text-align:left!important}.paTempValue{color:#00A651;font-weight:700}
  .paRegBreak{page-break-before:always;padding-top:8mm}.paConclusionItem{border-bottom:1px solid #ddd;padding:2mm 0}.paConclusionItem p{margin:1mm 0}
  .paPreamble{font-size:8.7pt;line-height:1.35;margin:0 10mm 4mm}.paTestGroup{break-inside:avoid-page;margin-bottom:3.4mm}.paSubTitle{font-size:8.6pt;font-weight:800;margin:2mm 0 1.5mm}.paTestTable .paEquip{width:20%}.paTestTable .paComment{width:34%}.paTestTable td{font-size:6.8pt;padding:.75mm 1mm;line-height:1.12}.paResultOk{color:#00A651;font-weight:700}.paResultKo{color:#D71920;font-weight:700}.paResultWarn{color:#E49B0F;font-weight:700}
  .paConclusionLead{font-weight:700;font-size:10pt;line-height:1.45}.paPage ul{font-size:9.2pt;line-height:1.45}.paPage p{font-size:9.2pt;line-height:1.45}
`;

export function construireSitePreAllumageHtml(data, config, planSrc = null) {
  const saison = infoValue(data, 'Saison de chauffe') || '';
  const exploitant = infoValue(data, 'Exploitant') || 'Non renseigné';
  const redacteur = infoValue(data, 'Chargé d’affaires / rédacteur') || '';
  const reference = config.chrono || infoValue(data, 'N° / référence du rapport') || '';
  const plan = planSrc ? `<img src="${planSrc}" alt="Plan du site"/>` : '<div class="paPlanMissing">Aucun plan du site sélectionné dans METRA</div>';

  const contacts = `<div class="paContacts"><div class="paContactCard paContactClient"><h3>Copropriété / Client</h3><p><b>${esc(data.visite.nom_client || '')}</b></p><p>${esc(data.visite.nom_site || '')}</p><p>${esc(data.visite.adresse || '')}</p></div><div class="paContactCard paContactOperator"><h3>Exploitant</h3><p><b>${esc(exploitant)}</b></p><p>Installations suivies dans le cadre de la visite de pré-allumage.</p></div><div class="paContactCard paContactAmo"><h3>Assistant à Maîtrise d’Ouvrage</h3><p><b>ENERGIE ET SERVICE</b></p>${redacteur ? `<p>${esc(redacteur)}</p>` : ''}<p>Réf. : ${esc(reference)}</p></div></div>`;

  const planPage = `<div class="paPlanWrap">${plan}</div>${tableBatiments(data, config)}`;
  const compteurPage = tableCompteurs(data, config);
  const regulationPage = tableRegulation(data);

  const chaufferie = (section(data, 'p-pa-chaufferie').groups || []).map((g) => ({ ...g, panelId: 'p-pa-chaufferie', mode: 'chaufferie' }));
  const preambule = `<div class="paPreamble"><b>Préambule</b><br/>Dans le cadre de sa mission, ENERGIE ET SERVICE s’est rendu sur site le ${esc(dateFr(data.visite.date_visite))} afin de réaliser des tests de pré-allumage des différents équipements présents en chaufferie et en sous-station. L’objectif est de statuer sur les capacités de l’installation à débuter la saison de chauffe${saison ? ` ${esc(saison)}` : ''}.</div>`;

  const sst = (section(data, 'p-pa-sst').groups || []).map((g) => ({ ...g, panelId: 'p-pa-sst', mode: 'sst' }));
  const tests = [...chaufferie, ...sst].filter((g) => visibleRows(g.rows, config.afficherLignesVides).length > 0);
  const pagesTests = [];
  for (let i = 0; i < tests.length; i += 4) {
    const part = tests.slice(i, i + 4);
    const body = part.map((g) => tableEssaisGroup(titreGroupe(data, g.panelId, g), g.rows, config, g.mode)).join('');
    pagesTests.push(page(i === 0 ? 'Préambule et tests réalisés' : 'Tests réalisés — suite', i === 0 ? '4 / 5' : '5', `${i === 0 ? preambule : ''}${body}`));
  }

  return `<article class="paReport">
    ${page('Contacts et intervenants', '', contacts)}
    ${page('Plan et informations bâtiments', '1', planPage)}
    ${page('Relevé des compteurs', '2', compteurPage)}
    ${page('Paramètres de régulation et températures relevées', '3', regulationPage)}
    ${pagesTests.length ? pagesTests.join('') : page('Préambule et tests réalisés', '4 / 5', preambule)}
    ${page('Observations et conclusions', '6', conclusionHtml(data))}
  </article>`;
}

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

function group(data, panelId, title) {
  return (section(data, panelId).groups || []).find((g) => g.title === title) || { rows: [] };
}

function rowValue(g, label) {
  const row = (g?.rows || []).find((r) => r.label === label);
  return String(row?.comment || '').trim();
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
    if (!config.afficherLignesVides && !nb && !bat && !sit) return '';
    const no = /^SST\s+(\d+)/i.exec(g.title)?.[1] || (g.title === 'Centre commercial' ? '11' : g.title === 'Église' ? '12' : String(i + 1));
    return `<tr><td>${esc(no)}</td><td>${esc(nb || '-')}</td><td>${esc(bat || '')}</td><td>${esc(sit || '')}</td></tr>`;
  }).join('');
  return `<table class="paBuildingTable"><thead><tr><th>SST N°</th><th>Nombre de logements desservis</th><th>Bâtiments desservis</th><th>Situation</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function tableCompteurs(data, config) {
  const s = section(data, 'p-pa-compteurs');
  const general = group(data, 'p-pa-compteurs', 'Compteurs généraux');
  const gaz = rowValue(general, 'Index compteur gaz général (m³)');
  const energie = rowValue(general, 'Index compteur énergie général (MWh)');
  const rows = (s.groups || []).filter((g) => g.title !== 'Compteurs généraux').map((g) => {
    const values = (g.rows || []).map((r) => String(r.comment || '').trim());
    if (!config.afficherLignesVides && !values.some(Boolean)) return '';
    return `<tr><td>${esc(g.title.replace(' / ', '/'))}</td><td>${esc(values[0] || '')}</td><td>${esc(values[1] || '')}</td></tr>`;
  }).join('');
  return `<table class="paMeterTable"><tbody><tr><td class="paLabel">Date de la visite</td><td colspan="2">${esc(dateFr(data.visite.date_visite))}</td></tr><tr><td class="paLabel">Index compteur gaz général (m³)</td><td colspan="2">${esc(gaz)}</td></tr><tr><td class="paLabel">Index compteur énergie (MWh)</td><td colspan="2">${esc(energie)}</td></tr><tr><th>Compteur</th><th>Energie (MWh)</th><th>ECS (m³)</th></tr>${rows}</tbody></table>`;
}

const REG_ROWS = [
  'Courbe de chauffe — Pour -7°C (°C)', 'Courbe de chauffe — Pour 12°C (°C)', 'Courbe de chauffe — Pour 19°C (°C)',
  'Température de non chauffe (°C)', 'Réduit de jour (°C d’eau)', 'Horaires', 'Température extérieure (°C)',
  'Départ chauffage (°C)', 'Retour chauffage (°C)', 'Départ ECS (°C)', 'Retour ECS (°C)', 'Arrivée primaire ECS (°C)', 'Retour primaire ECS (°C)',
];

function courtReg(label) {
  return String(label || '').replace('Courbe de chauffe — ', '').replace(/ \(°C\)$/,'').replace('Température de non chauffe (°C)','Température de Non Chauffe').replace('Température extérieure (°C)','Température Extérieure').replace('Départ chauffage (°C)','Départ chauffage').replace('Retour chauffage (°C)','Retour chauffage').replace('Départ ECS (°C)','Départ ECS').replace('Retour ECS (°C)','Retour ECS').replace('Arrivée primaire ECS (°C)','Arrivée primaire ECS').replace('Retour primaire ECS (°C)','Retour primaire ECS');
}

function tableRegulation(data) {
  const groups = section(data, 'p-pa-regulation').groups || [];
  const wanted = ['SST 1','SST 2','SST 3','SST 4','SST 5','SST 6','SST 7','SST 8','SST 9','SST 10','Commerces','Bureaux','Église'];
  const byName = new Map(groups.map((g) => [g.title, g]));
  return `<table class="paRegTable"><thead><tr><th>Sous-station</th>${wanted.map((n) => `<th>${esc(n.replace('SST ',''))}</th>`).join('')}</tr></thead><tbody>${REG_ROWS.map((label, idx) => `<tr><td class="paRegLabel">${esc(courtReg(label))}</td>${wanted.map((n) => {
    const v = rowValue(byName.get(n), label);
    const cls = idx >= 9 && idx <= 11 && v ? ' paTempValue' : '';
    return `<td class="${cls.trim()}">${esc(v)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

function conclusionHtml(data) {
  const g = group(data, 'p-pa-conclusion', 'Conclusion de pré-allumage');
  const controles = rowValue(g, 'Contrôles supplémentaires nécessaires');
  const equipements = rowValue(g, 'Équipements à remplacer / contrôler');
  const conclusion = rowValue(g, 'Conclusion libre du chargé d’affaires');
  const pret = rowValue(g, 'Installations prêtes pour le début de la saison de chauffe');
  const textePrincipal = conclusion || pret || 'La conclusion de la visite de pré-allumage reste à compléter.';
  const extra = [controles, equipements].filter(Boolean);
  return `<p class="paConclusionLead">${esc(textePrincipal)}</p>${extra.length ? `<p>Cependant, quelques contrôles supplémentaires ou actions restent nécessaires :</p><ul>${extra.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
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

  const chaufferie = section(data, 'p-pa-chaufferie').groups || [];
  const chaufferieMain = chaufferie.slice(0, 6).map((g) => tableEssaisGroup(g.title, g.rows, config, 'chaufferie')).join('');
  const chaufferieSuite = chaufferie.slice(6).map((g) => tableEssaisGroup(g.title, g.rows, config, 'chaufferie')).join('');
  const preambule = `<div class="paPreamble"><b>Préambule</b><br/>Dans le cadre de sa mission, ENERGIE ET SERVICE s’est rendu sur site le ${esc(dateFr(data.visite.date_visite))} afin de réaliser des tests de pré-allumage des différents équipements présents en chaufferie et en sous-station. L’objectif est de statuer sur les capacités de l’installation à débuter la saison de chauffe${saison ? ` ${esc(saison)}` : ''}.</div>`;

  const sst = section(data, 'p-pa-sst').groups || [];
  const bySst = (name) => sst.filter((g) => g.title.startsWith(`${name} —`)).map((g) => tableEssaisGroup(g.title.replace(` — `, ' — '), g.rows, config, 'sst')).join('');
  const pageSst = (a, b) => `${bySst(a)}${b ? bySst(b) : ''}`;

  return `<article class="paReport">
    ${page('Contacts et intervenants', '', contacts)}
    ${page('Plan et informations bâtiments', '1', planPage)}
    ${page('Relevé des compteurs', '2', compteurPage)}
    ${page('Paramètres de régulation et températures relevées', '3', regulationPage)}
    ${page('Préambule et tests réalisés — Chaufferie', '4 / 5', `${preambule}${chaufferieMain}`)}
    ${page('Tests réalisés — Chaufferie et sous-stations 1 à 2', '5', `${chaufferieSuite}${pageSst('SST 1','SST 2')}`)}
    ${page('Tests réalisés — Sous-stations 3 à 4', '5', pageSst('SST 3','SST 4'))}
    ${page('Tests réalisés — Sous-stations 5 à 6', '5', pageSst('SST 5','SST 6'))}
    ${page('Tests réalisés — Sous-stations 7 à 8', '5', pageSst('SST 7','SST 8'))}
    ${page('Tests réalisés — Sous-stations 9 à 10', '5', pageSst('SST 9','SST 10'))}
    ${page('Tests réalisés — Centre commercial et Église', '5', pageSst('Centre commercial','Église'))}
    ${page('Observations et conclusions', '6', conclusionHtml(data))}
  </article>`;
}

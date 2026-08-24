/** Validation structurelle des définitions de trame. */

function estCelluleExcel(ref) {
  return typeof ref === 'string' && /^[A-Z]{1,3}[1-9][0-9]*$/i.test(ref.trim());
}

function erreur(trame, message) {
  return `Trame ${trame?.id || trame?.nom || 'inconnue'} : ${message}`;
}

export function validerDefinitionTrame(trame) {
  const erreurs = [];
  const avertissements = [];
  if (!trame || typeof trame !== 'object') return { ok: false, erreurs: ['Définition de trame absente'], avertissements };
  if (!String(trame.id || '').trim()) erreurs.push(erreur(trame, 'id requis'));
  if (!String(trame.nom || '').trim()) erreurs.push(erreur(trame, 'nom requis'));
  if (!Number.isInteger(Number(trame.version)) || Number(trame.version) < 1) erreurs.push(erreur(trame, 'version entière >= 1 requise'));

  const ui = trame.ui || {};
  const panels = ui.panels || {};
  const specials = new Set(ui.specialPanels || []);
  const tabs = (ui.tabOrder || []).filter((id) => id !== 'SEP');
  if (!tabs.length) erreurs.push(erreur(trame, 'ui.tabOrder doit contenir au moins un onglet'));
  for (const id of tabs) {
    if (!panels[id] && !specials.has(id)) erreurs.push(erreur(trame, `onglet « ${id} » absent de ui.panels et ui.specialPanels`));
    if (!String(ui.labels?.[id] || '').trim()) erreurs.push(erreur(trame, `libellé manquant pour l’onglet « ${id} »`));
  }

  const cfg = trame.excel || {};
  if (!String(cfg.templateBase64 || '').trim()) erreurs.push(erreur(trame, 'modèle Excel absent'));
  if (!String(cfg.mainSheet || '').trim()) erreurs.push(erreur(trame, 'excel.mainSheet requis'));
  if (!(cfg.requiredSheets || []).includes(cfg.mainSheet)) erreurs.push(erreur(trame, 'la feuille principale doit être incluse dans requiredSheets'));

  const metadata = cfg.metadata || {};
  for (const cle of ['client', 'site', 'dateVisite']) {
    if (!estCelluleExcel(metadata[cle])) erreurs.push(erreur(trame, `cellule metadata.${cle} invalide`));
  }

  const identites = new Set();
  const cellules = new Map();
  for (const mapping of cfg.fieldMappings || []) {
    const identite = `${mapping.sectionCode || ''}||${mapping.cle || ''}`;
    if (!mapping.sectionCode || !mapping.cle) erreurs.push(erreur(trame, 'mapping de champ sans sectionCode/cle'));
    if (identites.has(identite)) erreurs.push(erreur(trame, `mapping métier dupliqué « ${identite} »`));
    identites.add(identite);
    if (!['champ', 'controle'].includes(mapping.type)) erreurs.push(erreur(trame, `type invalide pour « ${identite} »`));
    if (!estCelluleExcel(mapping.valueCell)) erreurs.push(erreur(trame, `valueCell invalide pour « ${identite} »`));
    const cellKey = `${cfg.mainSheet}!${mapping.valueCell}`;
    if (cellules.has(cellKey)) avertissements.push(erreur(trame, `cellule Excel partagée « ${cellKey} » entre « ${cellules.get(cellKey)} » et « ${identite} »`));
    else cellules.set(cellKey, identite);
    if (mapping.type === 'controle' && !estCelluleExcel(mapping.commentCell)) erreurs.push(erreur(trame, `commentCell invalide pour le contrôle « ${identite} »`));
  }

  for (const [nom, table] of Object.entries(cfg.tables || {})) {
    if (!String(table.sheet || '').trim()) erreurs.push(erreur(trame, `feuille absente pour la table « ${nom} »`));
    if (nom !== 'note' && !(table.columns || []).length) erreurs.push(erreur(trame, `colonnes d’import absentes pour la table « ${nom} »`));
    if (nom === 'note' && !estCelluleExcel(table.cell)) erreurs.push(erreur(trame, 'cellule de note invalide'));
  }

  const overflow = cfg.networks?.overflow;
  if (overflow) {
    if (!String(overflow.sheet || '').trim()) erreurs.push(erreur(trame, 'feuille overflow réseaux absente'));
    for (const c of overflow.columns || []) {
      if (!/^[A-Z]{1,3}$/i.test(String(c.col || ''))) erreurs.push(erreur(trame, 'colonne overflow réseaux invalide'));
      if (!c.importKey || !c.exportKey) erreurs.push(erreur(trame, 'mapping import/export incomplet dans overflow réseaux'));
    }
  }

  return { ok: erreurs.length === 0, erreurs, avertissements };
}

export function exigerDefinitionTrameValide(trame) {
  const resultat = validerDefinitionTrame(trame);
  if (!resultat.ok) throw new Error(resultat.erreurs.join('\n'));
  return trame;
}

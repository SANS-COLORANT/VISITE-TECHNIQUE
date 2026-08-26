from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: expected source block not found')
    return text.replace(old, new, 1)


# 1) Import: do not interpret "Date de la visite" as "date" + "de la visite".
p = Path('excelImport.js')
s = p.read_text(encoding='utf-8')
old = '''function valeurApresLibelleInline(texte, labels) {
  const brut = String(texte || '').trim();
  const n = normaliserTexte(brut);
  for (const label of labels) {
    const nl = normaliserTexte(label);
    if (!n.startsWith(nl)) continue;
    const reste = brut.slice(label.length).replace(/^\\s*[:\\-–—]\\s*/, '').trim();
    if (reste && normaliserTexte(reste) !== nl) return reste;
  }
  return '';
}
'''
new = '''function valeurApresLibelleInline(texte, labels) {
  const brut = String(texte || '').trim();
  for (const label of labels) {
    // Une valeur inline n'est admise qu'avec un séparateur explicite.
    // Ainsi "Date de la visite" reste un libellé complet et ne devient jamais
    // la fausse date "de la visite" à cause du libellé court "date".
    const escaped = String(label).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const match = brut.match(new RegExp(`^\\\\s*${escaped}\\\\s*[:\\\\-–—]\\\\s*(.+?)\\\\s*$`, 'i'));
    if (!match) continue;
    const reste = String(match[1] || '').trim();
    if (reste && normaliserTexte(reste) !== normaliserTexte(label)) return reste;
  }
  return '';
}
'''
s = replace_once(s, old, new, 'excelImport valeurApresLibelleInline')
p.write_text(s, encoding='utf-8')


# 2) Registry: disambiguate identical section/field labels between Chauffage and ECS.
p = Path('trameRegistry.js')
s = p.read_text(encoding='utf-8')
anchor = '''function construireMappingsChamps(uiData, excelRows) {
  const mappings = [];
'''
insert = '''const ICPE_ROW_OVERRIDES = Object.freeze({
  'p-conf-chauffage||Disconnection et alimentation eau froide||Type de disconnection': 289,
  "p-conf-chauffage||Disconnection et alimentation eau froide||Compteur d'eau: Présence": 290,
  "p-conf-chauffage||Disconnection et alimentation eau froide||Compteur d'eau: Emplacement": 291,
  'p-conf-ecs||Disconnection et alimentation eau froide||Type de disconnection': 321,
  "p-conf-ecs||Disconnection et alimentation eau froide||Compteur d'eau: Présence": 322,
  "p-conf-ecs||Disconnection et alimentation eau froide||Compteur d'eau: Emplacement": 323,
});

function construireMappingsChamps(uiData, excelRows) {
  const mappings = [];
'''
s = replace_once(s, anchor, insert, 'trameRegistry override declaration')
old = '''        const row = excelRows[`${section}||${field.cle}`];
        if (!row) continue;
'''
new = '''        const overrideKey = `${panelId}||${section}||${field.cle}`;
        const row = ICPE_ROW_OVERRIDES[overrideKey] || excelRows[`${section}||${field.cle}`];
        if (!row) continue;
'''
s = replace_once(s, old, new, 'trameRegistry row resolution')
p.write_text(s, encoding='utf-8')


# 3) Export: preserve source workbook data, styles and original filename.
p = Path('excelExport.js')
s = p.read_text(encoding='utf-8')
old = '''function ajouterPatchSiChange(patches, sheetName, sheet, address, value, cle = '', options = {}) {
  if (!address) return false;
  const valueType = options.valueType || typePourEcriture(sheet, address, value, cle);
  const original = valeurSource(sheet, address);
  if (equivalents(original, value, valueType)) return false;
'''
new = '''function ajouterPatchSiChange(patches, sheetName, sheet, address, value, cle = '', options = {}) {
  if (!address) return false;
  // Une absence de donnée côté application ne doit jamais effacer une valeur historique
  // présente dans le classeur importé. Les suppressions implicites sont interdites.
  if (options.allowEmpty !== true && String(value ?? '').trim() === '') return false;
  const valueType = options.valueType || typePourEcriture(sheet, address, value, cle);
  const original = valeurSource(sheet, address);
  if (equivalents(original, value, valueType)) return false;
'''
s = replace_once(s, old, new, 'excelExport empty protection')

old = '''  if (!cfg?.templateBase64) throw new Error('Aucune trame Excel source disponible pour cette visite.');
  return { sourceUri: null, sourceBase64: cfg.templateBase64, details, sourcePreservee: false };
'''
new = '''  // Une visite issue d'un import Excel doit toujours repartir de SON fichier original.
  // On ne reconstruit jamais silencieusement une trame neuve si cette copie a disparu.
  if (details?.fichier || details?.sourceUri) {
    throw new Error('Le fichier Excel original importé est introuvable. Réimporte ce fichier pour garantir un export strictement fidèle.');
  }
  if (!cfg?.templateBase64) throw new Error('Aucune trame Excel source disponible pour cette visite.');
  return { sourceUri: null, sourceBase64: cfg.templateBase64, details, sourcePreservee: false };
'''
s = replace_once(s, old, new, 'excelExport source fallback')

old = '''      // Une absence en SQLite ne doit jamais vider une cellule historique du fichier source.
      if (valeur === undefined) continue;
      ajouterPatchSiChange(patches, tableConfig.sheet, sheet, `${col}${excelRow}`, valeur ?? '', cle);
'''
new = '''      // Une absence / valeur vide en SQLite ne doit jamais vider une cellule historique.
      if (valeur === undefined || valeur === null || String(valeur).trim() === '') continue;
      ajouterPatchSiChange(patches, tableConfig.sheet, sheet, `${col}${excelRow}`, valeur, cle);
'''
s = replace_once(s, old, new, 'excelExport table empty protection')

old = '''  // Métadonnées de la vraie trame ICPE : B1/B2/B3 et aucune date forcée en B5.
  ajouterPatchSiChange(patches, main, principale, 'B1', visite.nom_client || '', 'client');
  ajouterPatchSiChange(patches, main, principale, 'B2', visite.nom_site || '', 'site');
  const localCible = nomLocalDepuisChamps(champs) || String(valeurSource(principale, 'B3') || '');
  ajouterPatchSiChange(patches, main, principale, 'B3', localCible, 'local');
  if (String(valeurSource(principale, 'B5') ?? '').trim() !== '') ajouterPatchSiChange(patches, main, principale, 'B5', '', 'date');
'''
new = '''  // Métadonnées : conserver la date et toute valeur historique du fichier importé.
  ajouterPatchSiChange(patches, main, principale, 'B1', visite.nom_client || '', 'client');
  ajouterPatchSiChange(patches, main, principale, 'B2', visite.nom_site || '', 'site');
  const localCible = nomLocalDepuisChamps(champs) || String(valeurSource(principale, 'B3') || '');
  ajouterPatchSiChange(patches, main, principale, 'B3', localCible, 'local');
  // B5 n'est volontairement pas réécrite : la date du classeur source reste intacte.
'''
s = replace_once(s, old, new, 'excelExport metadata date')

old = '''      ajouterPatchSiChange(patches, main, principale, mapping.valueCell, controle.avis ?? '', `${mapping.cle}:avis`);
      if (mapping.commentCell) ajouterPatchSiChange(patches, main, principale, mapping.commentCell, controle.commentaire ?? '', `${mapping.cle}:commentaire`);
'''
new = '''      ajouterPatchSiChange(patches, main, principale, mapping.valueCell, controle.avis, `${mapping.cle}:avis`);
      if (mapping.commentCell) ajouterPatchSiChange(patches, main, principale, mapping.commentCell, controle.commentaire, `${mapping.cle}:commentaire`);
'''
s = replace_once(s, old, new, 'excelExport control preservation')

old = '''    sourcePreservee: source.sourcePreservee,
    stats: { champs: champs.length, controles: controles.length, reseaux: reseaux.length, compteurs: compteurs.length, materiel: materiel.length, remarques: remarques.length, cellulesModifiees: patches.length },
'''
new = '''    sourcePreservee: source.sourcePreservee,
    sourceDetails: source.details || {},
    stats: { champs: champs.length, controles: controles.length, reseaux: reseaux.length, compteurs: compteurs.length, materiel: materiel.length, remarques: remarques.length, cellulesModifiees: patches.length },
'''
s = replace_once(s, old, new, 'excelExport source details return')

old = '''async function preparerExport(visiteId) {
  const construit = await construireExport(visiteId);
  const nomFichier = `Visite_${slugFichier(construit.trame.nom)}_${slugFichier(construit.visite.nom_site)}_${construit.visite.date_visite || 'sans_date'}.xlsx`;
  return { ...construit, base64: construit.resultat.base64, nomFichier };
}
'''
new = '''async function preparerExport(visiteId) {
  const construit = await construireExport(visiteId);
  const nomOriginal = String(construit.sourceDetails?.fichier || '').trim();
  // Pour une visite importée, conserver le nom du fichier d'origine au lieu de le
  // reconstruire depuis la trame / le site / la date.
  const nomFichier = /\\.xlsx$/i.test(nomOriginal)
    ? nomOriginal
    : `Visite_${slugFichier(construit.trame.nom)}_${slugFichier(construit.visite.nom_site)}_${construit.visite.date_visite || 'sans_date'}.xlsx`;
  return { ...construit, base64: construit.resultat.base64, nomFichier };
}
'''
s = replace_once(s, old, new, 'excelExport filename')

p.write_text(s, encoding='utf-8')

print('Excel fidelity fixes applied successfully')

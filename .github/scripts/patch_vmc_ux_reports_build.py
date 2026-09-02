from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# VMC controls: photos are documentation, not a synonym for a reserve.
# Keep the photo button available for S / N.S / N.R / S.O / N.V.
# ---------------------------------------------------------------------------
p = 'VmcControleGenerique.js'
s = read(p)
s = replace_once(
    s,
    "      {avis === 'N.S' ? <PhotoButton visiteId={visiteId} entiteKey={controleKey} label={field.cle} style={styles.photoRequiredBox} /> : null}",
    "      <PhotoButton visiteId={visiteId} entiteKey={controleKey} label={field.cle} style={avis === 'N.S' ? styles.photoRequiredBox : undefined} />",
    'VMC photo button',
)
write(p, s)

# ---------------------------------------------------------------------------
# General VMC information: numeric steppers and quick-select lists + Other.
# ---------------------------------------------------------------------------
p = 'GenericFields.js'
s = read(p)
needle = "  'Type de LT': ['Chaufferie gaz', 'Chaufferie fioul', 'Sous-station', 'Chaufferie bois'],\n"
insert = needle + "  'Type de ventilation': ['VMC simple flux autoréglable', 'VMC simple flux hygroréglable', 'VMC double flux', 'VMC gaz', 'Ventilation naturelle', 'Ventilation hybride', 'Extraction mécanique'],\n  'Type de bouche': ['Autoréglable', 'Hygroréglable', 'Bouche gaz', 'Extraction sanitaire', 'Insufflation', 'Mixte'],\n"
if "'Type de ventilation':" not in s:
    if needle not in s:
        raise SystemExit('VMC FIELD_OPTIONS insertion target not found')
    s = s.replace(needle, insert, 1)
old = "  if (/Nb /.test(cle) || cle === 'Nb') return { min: 0, max: 50, step: 1, unit: '' };"
new = "  if (['Nombre de logements', 'Nombre de bâtiments / entrées', \"Nombre d'étages\", 'Nombre de caissons'].includes(cle)) return { min: 0, max: cle === 'Nombre de logements' ? 5000 : cle === 'Nombre de caissons' ? 12 : 200, step: 1, unit: '' };\n  if (/Nb /.test(cle) || cle === 'Nb') return { min: 0, max: 50, step: 1, unit: '' };"
if "cle === 'Nombre de logements' ? 5000" not in s:
    if old not in s:
        raise SystemExit('VMC numeric config target not found')
    s = s.replace(old, new, 1)
write(p, s)

# ---------------------------------------------------------------------------
# VMC visit creation: current date is prefilled in the correct VMC panel.
# ---------------------------------------------------------------------------
p = 'visitPrefillDb.js'
s = read(p)
old = "  } else {\n    const fixes = [\n      ['p-infos','Général','Nom du client',contexte.nom_client],"
new = "  } else if (trame.id === 'vmc') {\n    const fixesVmc = [\n      ['p-vmc-infos','Informations générales','Date de visite',dateVisite],\n      ['p-vmc-infos','Informations générales','N° de site',contexte.site_id],\n      ['p-vmc-infos','Informations générales','Référence du site',contexte.nom_site],\n      ['p-vmc-infos','Informations générales','Exploitant',contexte.code_exploitant],\n    ];\n    for (const [p,s,c,v] of fixesVmc) await insertIfEmpty(db, visiteId, p, s, c, v);\n  } else {\n    const fixes = [\n      ['p-infos','Général','Nom du client',contexte.nom_client],"
if "const fixesVmc = [" not in s:
    if old not in s:
        raise SystemExit('VMC prefill target not found')
    s = s.replace(old, new, 1)
write(p, s)

# ---------------------------------------------------------------------------
# Stable caisson identity in reserves: Caisson n°X or Caisson n°X - custom.
# ---------------------------------------------------------------------------
p = 'remarkDb.js'
s = read(p)
s = s.replace("match(/^vmc-c([1-6])\\./)", "match(/^vmc-c(\\d+)\\./)")
old = "  const nom = String(row?.valeur || `Caisson ${index}`).trim() || `Caisson ${index}`;\n  return `${nom} · ${cle}`;"
new = "  const brut = String(row?.valeur || '').trim();\n  const defaut = `Caisson n°${index}`;\n  const nom = !brut || new RegExp(`^Caisson(?: n°)? ${index}$`, 'i').test(brut) ? defaut : `${defaut} - ${brut}`;\n  return `${nom} · ${cle}`;"
if "const defaut = `Caisson n°${index}`;" not in s:
    if old not in s:
        raise SystemExit('reserve caisson label target not found')
    s = s.replace(old, new, 1)
write(p, s)

# ---------------------------------------------------------------------------
# Caisson manager: 12 caissons, stable display labels and duplication of
# fields + controls + reserves, deliberately excluding photos.
# ---------------------------------------------------------------------------
p = 'VmcCaissonManager.js'
s = read(p)
s = s.replace('const MAX_CAISSONS = 6;', 'const MAX_CAISSONS = 12;')
s = s.replace("match(/^vmc-c([1-6])\\./)", "match(/^vmc-c(\\d+)\\./)")
if 'function libelleCaisson(index, nom)' not in s:
    marker = "function cleNom(index) { return `caisson_${index}_nom`; }\n"
    helper = marker + "function libelleCaisson(index, nom) {\n  const brut = String(nom || '').trim();\n  const base = `Caisson n°${index}`;\n  return !brut || new RegExp(`^Caisson(?: n°)? ${index}$`, 'i').test(brut) ? base : `${base} - ${brut}`;\n}\n"
    if marker not in s:
        raise SystemExit('caisson helper marker not found')
    s = s.replace(marker, helper, 1)
# Default stored name should be neutral; display adds the stable number.
s = s.replace("`Caisson ${i}`", "`Caisson ${i}`")
if 'export async function dupliquerCaissonVmc' not in s:
    marker = "export async function retirerCaissonVmc(visiteId, index) {"
    duplicate = r'''export async function dupliquerCaissonVmc(visiteId, sourceIndex) {
  const db = await getDb();
  const caissons = await chargerCaissonsVmc(visiteId);
  const source = caissons.find((c) => c.index === sourceIndex && c.actif);
  const cible = caissons.find((c) => !c.actif);
  if (!source) throw new Error('Caisson source introuvable.');
  if (!cible) throw new Error(`La visite contient déjà ${MAX_CAISSONS} caissons.`);

  const targetIndex = cible.index;
  const sourcePrefix = `vmc-c${sourceIndex}.`;
  const targetPrefix = `vmc-c${targetIndex}.`;
  const customBase = String(source.nom || '').trim();
  const targetName = customBase && !new RegExp(`^Caisson(?: n°)? ${sourceIndex}$`, 'i').test(customBase)
    ? `${customBase} - copie`
    : `Caisson ${targetIndex}`;

  const champs = await db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=? AND section_code LIKE ?`, [visiteId, `${sourcePrefix}%`]);
  for (const row of champs || []) {
    const section = String(row.section_code).replace(sourcePrefix, targetPrefix);
    const cle = String(row.cle || '').replace(`n°${sourceIndex}`, `n°${targetIndex}`);
    const valeur = row.cle === cleIdentification(sourceIndex) ? targetName : row.valeur;
    await db.runAsync(`INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`, [visiteId, section, cle, valeur]);
  }

  const controles = await db.getAllAsync(`SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=? AND section_code LIKE ?`, [visiteId, `${sourcePrefix}%`]);
  for (const row of controles || []) {
    const section = String(row.section_code).replace(sourcePrefix, targetPrefix);
    await db.runAsync(`INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET avis=excluded.avis,commentaire=excluded.commentaire`, [visiteId, section, row.cle, row.avis, row.commentaire]);
  }

  const remarques = await db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? AND controle_key LIKE ?`, [visiteId, `${sourcePrefix}%`]);
  for (const row of remarques || []) {
    const controleKey = String(row.controle_key).replace(sourcePrefix, targetPrefix);
    const field = controleKey.includes('||') ? controleKey.split('||').slice(1).join('||') : 'Élément technique';
    const ref = `${libelleCaisson(targetIndex, targetName)} · ${field}`;
    await db.runAsync(`INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,reference_onglet,reference_type,reference_id,reference_libelle) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [
      `${Date.now()}_${Math.random().toString(36).slice(2)}`, visiteId, controleKey, row.poste, row.prestation, row.delai, row.estimatif,
      row.origine ? `${row.origine} · duplication` : 'Duplication caisson', row.reference_onglet, 'controle', controleKey, ref,
    ]);
  }

  // Photos are intentionally NOT duplicated: every caisson must keep its own field evidence.
  await upsertConfig(db, visiteId, cleActif(targetIndex), '1');
  await upsertConfig(db, visiteId, cleNom(targetIndex), targetName);
  await upsertIdentification(db, visiteId, targetIndex, targetName);
  await synchroniserLibellesRemarquesCaisson(db, visiteId, targetIndex, libelleCaisson(targetIndex, targetName));
  await synchroniserNombreCaissons(db, visiteId, caissons.filter((c) => c.actif).length + 1);
  return { ...cible, actif: true, nom: targetName };
}

'''
    if marker not in s:
        raise SystemExit('duplicate caisson insertion target not found')
    s = s.replace(marker, duplicate + marker, 1)
# Make remark synchronisation use stable display label.
s = s.replace("await synchroniserLibellesRemarquesCaisson(db, visiteId, i, nom);", "await synchroniserLibellesRemarquesCaisson(db, visiteId, i, libelleCaisson(i, nom));")
s = s.replace("await synchroniserLibellesRemarquesCaisson(db, visiteId, index, nom);", "await synchroniserLibellesRemarquesCaisson(db, visiteId, index, libelleCaisson(index, nom));")
# UI display label and duplicate button.
old_ui = "<Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.ink }}>N°{c.index} · {c.nom}</Text>"
new_ui = "<Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.ink }}>{libelleCaisson(c.index, c.nom)}</Text>"
if old_ui in s:
    s = s.replace(old_ui, new_ui, 1)
if "onPress={() => dupliquer(c)}" not in s:
    old = "          <TouchableOpacity onPress={() => setEdition(c.index)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: COLORS.orangeDark, fontWeight: '800' }}>✎</Text></TouchableOpacity>"
    new = "          <TouchableOpacity onPress={() => dupliquer(c)} style={{ paddingHorizontal: 7, paddingVertical: 6 }}><Text style={{ color: COLORS.orangeDark, fontWeight: '800' }}>⧉</Text></TouchableOpacity>\n" + old
    if old not in s:
        raise SystemExit('duplicate caisson UI target not found')
    s = s.replace(old, new, 1)
    marker = "  const demanderRetrait = (caisson) => {"
    handler = "  const dupliquer = async (caisson) => {\n    try {\n      const cree = await dupliquerCaissonVmc(visiteId, caisson.index);\n      await recharger();\n      onNavigate?.(cree.panelId);\n    } catch (e) { Alert.alert('Duplication VMC', String(e?.message || e)); }\n  };\n\n"
    if marker not in s:
        raise SystemExit('duplicate handler target not found')
    s = s.replace(marker, handler + marker, 1)
write(p, s)

# ---------------------------------------------------------------------------
# Expose 12 VMC caisson panels in the application. First 6 retain the original
# Excel mappings; extra caissons remain available in app/report and are listed
# through reserves/equipment exports without silently overwriting the template.
# ---------------------------------------------------------------------------
p = 'vmcTrame.js'
s = read(p)
old = "  'p-vmc-c1': panelCaisson(1), 'p-vmc-c2': panelCaisson(2), 'p-vmc-c3': panelCaisson(3),\n  'p-vmc-c4': panelCaisson(4), 'p-vmc-c5': panelCaisson(5), 'p-vmc-c6': panelCaisson(6),"
new = "  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p-vmc-c${i + 1}`, panelCaisson(i + 1)])),"
if new not in s:
    if old not in s:
        raise SystemExit('VMC panels 1-6 target not found')
    s = s.replace(old, new, 1)
write(p, s)

p = 'trameRegistry.js'
s = read(p)
old = "    tabOrder: ['p-vmc-infos', 'p-vmc-c1', 'p-vmc-c2', 'p-vmc-c3', 'p-vmc-c4', 'p-vmc-c5', 'p-vmc-c6', 'SEP', 'p-equip', 'p-remarques', 'p-photos'],"
new = "    tabOrder: ['p-vmc-infos', ...Array.from({ length: 12 }, (_, i) => `p-vmc-c${i + 1}`), 'SEP', 'p-equip', 'p-remarques', 'p-photos'],"
if new not in s:
    if old not in s:
        raise SystemExit('VMC tabOrder target not found')
    s = s.replace(old, new, 1)
old = "      'p-vmc-infos': 'Informations', 'p-vmc-c1': 'Caisson 1', 'p-vmc-c2': 'Caisson 2', 'p-vmc-c3': 'Caisson 3',\n      'p-vmc-c4': 'Caisson 4', 'p-vmc-c5': 'Caisson 5', 'p-vmc-c6': 'Caisson 6', 'p-equip': 'Équipements',"
new = "      'p-vmc-infos': 'Informations', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p-vmc-c${i + 1}`, `Caisson n°${i + 1}`])), 'p-equip': 'Équipements',"
if new not in s:
    if old not in s:
        raise SystemExit('VMC labels target not found')
    s = s.replace(old, new, 1)
write(p, s)

p = 'VisiteScreen.js'
s = read(p)
s = s.replace("!/^p-vmc-c[1-6]$/.test(pid)", "!/^p-vmc-c\\d+$/.test(pid)")
s = s.replace("[c.panelId, `N°${c.index} · ${c.nom}`]", "[c.panelId, (!c.nom || new RegExp(`^Caisson(?: n°)? ${c.index}$`, 'i').test(c.nom)) ? `Caisson n°${c.index}` : `Caisson n°${c.index} - ${c.nom}`]")
write(p, s)

# ---------------------------------------------------------------------------
# Report editor: editable subtitle and automatic defaults per visit family.
# ---------------------------------------------------------------------------
p = 'ReportScreen.js'
s = read(p)
old = " const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique');"
new = " const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique'),[sousTitre,setSousTitre]=useState('Présentation de la trame de visite technique');"
if new not in s:
    if old not in s:
        raise SystemExit('report subtitle state target not found')
    s = s.replace(old, new, 1)
marker = " const groupeInterdit=selected.size<=1;\n"
if 'const vmcOnly=selectedRows.length>0' not in s:
    insert = marker + " const vmcOnly=selectedRows.length>0&&selectedRows.every(v=>(v.trame_id||'')==='vmc');\n useEffect(()=>{if(vmcOnly){setObjet(v=>v==='Compte rendu de visite technique'? 'Compte rendu de visite technique VMC':v);setSousTitre(v=>v==='Présentation de la trame de visite technique'?'Présentation de la trame de visite technique VMC':v)}},[vmcOnly]);\n"
    if marker not in s:
        raise SystemExit('report defaults insertion target not found')
    s = s.replace(marker, insert, 1)
s = replace_once(s, " const config={chrono,objet,dateRapport,", " const config={chrono,objet,sousTitre,dateRapport,", 'report config subtitle')
old = "<Text style={[styles.fieldLabel,{marginTop:10}]}>Date du rapport</Text><TextInput style={styles.input} value={dateRapport}"
new = "<Text style={[styles.fieldLabel,{marginTop:10}]}>Sous-titre / présentation</Text><TextInput style={styles.input} value={sousTitre} onChangeText={setSousTitre}/><Text style={[styles.fieldLabel,{marginTop:10}]}>Date du rapport</Text><TextInput style={styles.input} value={dateRapport}"
if "Sous-titre / présentation" not in s:
    if old not in s:
        raise SystemExit('report subtitle input target not found')
    s = s.replace(old, new, 1)
write(p, s)

# ---------------------------------------------------------------------------
# PDF/Word report: dynamic VMC presentation + caisson identity in table titles
# and reserve summary.
# ---------------------------------------------------------------------------
p = 'reportBuilder.js'
s = read(p)
if 'function libelleCaissonRapport' not in s:
    marker = "function typeLocalDepuisChamps(champs) {\n  return court(valeurChamp(champs, 'Type de LT') || '', 80);\n}\n"
    helper = marker + "\nfunction libelleCaissonRapport(champs, panelId) {\n  const m = String(panelId || '').match(/^p-vmc-c(\\d+)$/);\n  if (!m) return '';\n  const index = Number(m[1]);\n  const row = (champs || []).find((r) => r.section_code === 'vmc.config' && r.cle === `caisson_${index}_nom`);\n  const brut = String(row?.valeur || '').trim();\n  const base = `Caisson n°${index}`;\n  return !brut || new RegExp(`^Caisson(?: n°)? ${index}$`, 'i').test(brut) ? base : `${base} - ${brut}`;\n}\n"
    if marker not in s:
        raise SystemExit('report caisson helper target not found')
    s = s.replace(marker, helper, 1)
old = "        title: section,\n        sectionCode: code,"
new = "        title: trame.id === 'vmc' && /^p-vmc-c\\d+$/.test(panelId) ? `${libelleCaissonRapport(champs, panelId)} — ${section}` : section,\n        sectionCode: code,"
if new not in s:
    if old not in s:
        raise SystemExit('report group title target not found')
    s = s.replace(old, new, 1)
# Reserve table gets an explicit equipment/point column.
s = s.replace("<thead><tr><th>Poste</th><th>Prestation</th><th>Date de la réserve</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.poste || 'Remarques particulières')}</td><td>${esc(r.prestation || '/')}</td><td class=\"reserveDateCell\">",
              "<thead><tr><th>Caisson / point</th><th>Poste</th><th>Prestation</th><th>Date de la réserve</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(libelleReserveCourt(r))}</td><td>${esc(r.poste || 'Remarques particulières')}</td><td>${esc(r.prestation || '/')}</td><td class=\"reserveDateCell\">")
old = "      <div class=\"introTitle\">Présentation de la trame de visite des installations</div>\n      <p>Pour chaque chaufferie, sous-station chauffage et sous-station ECS, une fiche de conformité a été remplie.</p>\n      <p>Dans ce compte rendu nous vous présentons un résumé par sous-station et chaufferie de chaque fiche.</p>"
new = "      <div class=\"introTitle\">${esc(config.sousTitre || (datas.every((d) => d.trame?.id === 'vmc') ? 'Présentation de la trame de visite technique VMC' : 'Présentation de la trame de visite des installations'))}</div>\n      ${datas.every((d) => d.trame?.id === 'vmc') ? '<p>Pour chaque caisson VMC et partie de distribution contrôlée, les informations techniques, avis, commentaires, photographies et réserves ont été relevés.</p><p>Dans ce compte rendu nous présentons la synthèse de la visite VMC, caisson par caisson.</p>' : '<p>Pour chaque chaufferie, sous-station chauffage et sous-station ECS, une fiche de conformité a été remplie.</p><p>Dans ce compte rendu nous vous présentons un résumé par sous-station et chaufferie de chaque fiche.</p>'}"
if new not in s:
    if old not in s:
        raise SystemExit('report intro target not found')
    s = s.replace(old, new, 1)
write(p, s)

# ---------------------------------------------------------------------------
# Excel reserves: expose the caisson/point instead of losing the attachment.
# This keeps the existing template columns stable.
# ---------------------------------------------------------------------------
p = 'excelExport.js'
s = read(p)
old = "function normaliserRemarquesPourExport(remarques = []) {\n  return remarques.map((r) => ({\n    ...r,\n    date_reserve: formaterDateReserve(r.cree_le),\n  }));\n}"
new = "function normaliserRemarquesPourExport(remarques = [], trameId = '') {\n  return remarques.map((r) => ({\n    ...r,\n    poste: trameId === 'vmc' && String(r.reference_libelle || '').trim() ? String(r.reference_libelle).trim() : r.poste,\n    date_reserve: formaterDateReserve(r.cree_le),\n  }));\n}"
if new not in s:
    if old not in s:
        raise SystemExit('Excel remark normalizer target not found')
    s = s.replace(old, new, 1)
s = s.replace("const remarques = normaliserRemarquesPourExport(remarquesBrutes);", "const remarques = normaliserRemarquesPourExport(remarquesBrutes, trame.id);")
write(p, s)

print('VMC UX, reports and exports patched successfully.')

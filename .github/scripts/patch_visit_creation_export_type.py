from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Création d'une visite : la création du dossier Documents/METRA ne doit
#    jamais bloquer l'ouverture de la visite. Le dossier est préparé en fond.
# ---------------------------------------------------------------------------
p = Path('visitCreationDb.js')
s = p.read_text(encoding='utf-8')
old = """  // Si l'utilisateur a déjà accordé une fois l'accès Documents/METRA, la
  // structure Client/Site/Visite est créée immédiatement sans nouvelle boîte
  // de dialogue. Le refus ou l'absence d'autorisation ne bloque jamais la visite.
  try {
    if (await obtenirRacineMetra()) await dossierVisiteMetra(id);
  } catch {}

  return id;
"""
new = """  // Le stockage Android SAF peut être lent (lecture/création de plusieurs
  // dossiers). Il ne doit jamais retarder l'ouverture de la visite : la base
  // locale est déjà créée, le classement Documents/METRA est préparé en fond.
  void (async () => {
    try {
      if (await obtenirRacineMetra()) await dossierVisiteMetra(id);
    } catch (e) {
      console.warn('Dossier METRA de la nouvelle visite non préparé immédiatement', e);
    }
  })();

  return id;
"""
s = replace_once(s, old, new, 'non-blocking visit storage')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Préremplissage :
#    - aucun SELECT équipements inutile pour Pré-allumage ;
#    - les 6 champs stables ICPE/VMC sont relus en une seule requête ;
#    - la structure physique Pré-allumage est matérialisée à l'ouverture de
#      l'onglet Installations (ou avant un export), pas pendant la création.
# ---------------------------------------------------------------------------
p = Path('visitPrefillDb.js')
s = p.read_text(encoding='utf-8')
s = s.replace("import { assurerStructureSitePreAllumage } from './preAllumageSiteBootstrap.js';\n", '')
old = """  const equipements = await db.getAllAsync(`SELECT e.* FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id]);
  if (trame.id !== 'pre_allumage' && equipements.length) {
    await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', \"Nb d'équipements\", equipements.length);
    const types = [...new Set(equipements.map((e)=>String(e.type_code||'').trim()).filter(Boolean))];
    if (types.length === 1) await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', 'Production primaire', types[0]);
  }
"""
new = """  if (trame.id !== 'pre_allumage') {
    const equipements = await db.getAllAsync(`SELECT e.* FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id]);
    if (equipements.length) {
      await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', \"Nb d'équipements\", equipements.length);
      const types = [...new Set(equipements.map((e)=>String(e.type_code||'').trim()).filter(Boolean))];
      if (types.length === 1) await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', 'Production primaire', types[0]);
    }
  }
"""
s = replace_once(s, old, new, 'skip unused PRE equipment query')
old = """    } else {
      const clesStables = [['p-infos','Informations générales','Nbr de bât / lgt'],['p-infos','Informations générales','Exploitant - marché'],['p-infos','Informations générales','Type de LT'],['p-infos','Description des principaux équipements','Production primaire'],['p-infos','Description des principaux équipements','Type de régulation'],['p-infos','Description des principaux équipements','Production ECS']];
      for (const [p,s,c] of clesStables) {
        const ancien = await db.getFirstAsync(`SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [precedente.id, sectionCode(p,s), c]);
        if (ancien?.valeur) await insertIfEmpty(db, visiteId, p, s, c, ancien.valeur);
      }
    }
"""
new = """    } else {
      const clesStables = [['p-infos','Informations générales','Nbr de bât / lgt'],['p-infos','Informations générales','Exploitant - marché'],['p-infos','Informations générales','Type de LT'],['p-infos','Description des principaux équipements','Production primaire'],['p-infos','Description des principaux équipements','Type de régulation'],['p-infos','Description des principaux équipements','Production ECS']];
      const anciens = await db.getAllAsync(
        `SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
        [precedente.id]
      );
      const anciensMap = new Map((anciens || []).map((row) => [`${row.section_code}||${row.cle}`, row.valeur]));
      for (const [p,s,c] of clesStables) {
        const valeur = anciensMap.get(`${sectionCode(p,s)}||${c}`);
        if (valeur) await insertIfEmpty(db, visiteId, p, s, c, valeur);
      }
    }
"""
s = replace_once(s, old, new, 'batch standard stable fields')
old = """
  if (trame.id === 'pre_allumage') {
    await assurerStructureSitePreAllumage(visiteId);
  }
"""
s = replace_once(s, old, '', 'defer PRE physical bootstrap')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Écran Site : une nouvelle visite navigue dès que les 2 lignes SQLite sont
#    créées. VisiteScreen effectue le préremplissage une seule fois.
#    L'export Excel multiple impose d'abord un type de visite.
# ---------------------------------------------------------------------------
p = Path('SiteVisitesScreen.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, Linking, ScrollView } from 'react-native';",
    "import { View, Text, FlatList, TouchableOpacity, Modal, Pressable, TextInput, Alert, Linking, ScrollView } from 'react-native';",
    'site Pressable import',
)
s = replace_once(s, "import { listerVisitesSite, getDb } from './db.js';", "import { listerVisitesSite } from './db.js';", 'site lightweight db import')
s = s.replace("import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';\n", '')
state_marker = "  const [exportLotEnCours, setExportLotEnCours] = useState(false);\n"
state_add = "  const [choixTrameExportVisible, setChoixTrameExportVisible] = useState(false);\n  const [trameExportId, setTrameExportId] = useState(null);\n  const [creationEnCours, setCreationEnCours] = useState(false);\n"
if state_add not in s:
    s = replace_once(s, state_marker, state_marker + state_add, 'site export/creation states')
trames_marker = "  const tramesDisponibles = listerTramesDisponibles();\n"
trames_add = """  const tramesExportDisponibles = tramesDisponibles.map((trame) => ({
    ...trame,
    nb: visites.filter((visite) => (visite.trame_id || DEFAULT_TRAME_ID) === trame.id).length,
  })).filter((trame) => trame.nb > 0);
  const visitesExportables = selectionExport && trameExportId
    ? visites.filter((visite) => (visite.trame_id || DEFAULT_TRAME_ID) === trameExportId)
    : visites;
"""
if 'const tramesExportDisponibles' not in s:
    s = replace_once(s, trames_marker, trames_marker + trames_add, 'site export type derivation')
old = """  const nouvelleVisite = async (mode) => {
    if (mode === 'express' && visites.length === 0) return;
    const trameId = mode === 'express'
      ? (visites[0]?.trame_id || trameChoisie || DEFAULT_TRAME_ID)
      : (trameChoisie || DEFAULT_TRAME_ID);
    setChoixModeVisible(false);
    const visiteId = await creerVisiteProduction({ siteId, mode, trameId });
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    navigation.navigate('Visite', { visiteId });
  };
"""
new = """  const nouvelleVisite = async (mode) => {
    if (creationEnCours || (mode === 'express' && visites.length === 0)) return;
    const trameId = mode === 'express'
      ? (visites[0]?.trame_id || trameChoisie || DEFAULT_TRAME_ID)
      : (trameChoisie || DEFAULT_TRAME_ID);
    setChoixModeVisible(false);
    setCreationEnCours(true);
    try {
      const visiteId = await creerVisiteProduction({ siteId, mode, trameId });
      navigation.navigate('Visite', { visiteId });
    } catch (e) {
      Alert.alert('Création impossible', String(e?.message || e));
    } finally {
      setCreationEnCours(false);
    }
  };
"""
s = replace_once(s, old, new, 'navigate immediately after visit creation')
old = """  const ouvrirSelectionExport = () => {
    setVisitesSelectionnees(new Set());
    setSelectionExport(true);
  };

  const annulerSelectionExport = () => {
    if (exportLotEnCours) return;
    setSelectionExport(false);
    setVisitesSelectionnees(new Set());
  };

  const toutSelectionner = () => {
    setVisitesSelectionnees((actuelles) => actuelles.size === visites.length ? new Set() : new Set(visites.map((v) => v.id)));
  };
"""
new = """  const ouvrirSelectionExport = () => {
    if (!tramesExportDisponibles.length) {
      Alert.alert('Export Excel', 'Aucune visite n’est disponible pour ce site.');
      return;
    }
    setVisitesSelectionnees(new Set());
    setTrameExportId(null);
    setChoixTrameExportVisible(true);
  };

  const choisirTrameExport = (trameId) => {
    setTrameExportId(trameId);
    setVisitesSelectionnees(new Set());
    setChoixTrameExportVisible(false);
    setSelectionExport(true);
  };

  const annulerSelectionExport = () => {
    if (exportLotEnCours) return;
    setSelectionExport(false);
    setChoixTrameExportVisible(false);
    setTrameExportId(null);
    setVisitesSelectionnees(new Set());
  };

  const toutSelectionner = () => {
    setVisitesSelectionnees((actuelles) => actuelles.size === visitesExportables.length ? new Set() : new Set(visitesExportables.map((v) => v.id)));
  };
"""
s = replace_once(s, old, new, 'site type-first multi export')
old = """  const exporterSelection = async () => {
    if (!visitesSelectionnees.size || exportLotEnCours) return;
    setExportLotEnCours(true);
    try {
      const resultat = await exporterVisitesExcelEnLot([...visitesSelectionnees]);
"""
new = """  const exporterSelection = async () => {
    if (!trameExportId) return Alert.alert('Export Excel', 'Choisis d’abord le type de visite à exporter.');
    if (!visitesSelectionnees.size || exportLotEnCours) return;
    const autorisees = new Set(visitesExportables.map((visite) => visite.id));
    const ids = [...visitesSelectionnees].filter((id) => autorisees.has(id));
    if (!ids.length) return Alert.alert('Export Excel', 'Aucune visite de ce type n’est sélectionnée.');
    setExportLotEnCours(true);
    try {
      const resultat = await exporterVisitesExcelEnLot(ids);
"""
s = replace_once(s, old, new, 'guard homogeneous site Excel export')
s = replace_once(s, "        data={siteTab === 'visites' ? visites : []}", "        data={siteTab === 'visites' ? visitesExportables : []}", 'site filtered export list')
s = replace_once(s, "{visitesSelectionnees.size === visites.length ? 'Tout désélectionner' : 'Tout sélectionner'}", "{visitesSelectionnees.size === visitesExportables.length ? 'Tout désélectionner' : 'Tout sélectionner'}", 'site filtered select all label')
modal_marker = """      <Modal visible={gpsVisible} transparent animationType=\"fade\" onRequestClose={() => setGpsVisible(false)}>
"""
modal_add = """      <Modal visible={choixTrameExportVisible} transparent animationType=\"fade\" onRequestClose={() => setChoixTrameExportVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setChoixTrameExportVisible(false)}><Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Type de visite à exporter</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>Choisis d’abord la trame. Seules les visites de ce type seront ensuite sélectionnables.</Text>
          {tramesExportDisponibles.map((trame) => <TouchableOpacity key={trame.id} style={styles.visitModeCard} onPress={() => choisirTrameExport(trame.id)}><Text style={styles.visitModeIcon}>📄</Text><View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>{trame.nom}</Text><Text style={styles.visitModeText}>{trame.nb} visite(s) disponible(s)</Text></View></TouchableOpacity>)}
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => setChoixTrameExportVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
        </Pressable></Pressable>
      </Modal>

"""
if 'Type de visite à exporter' not in s:
    s = replace_once(s, modal_marker, modal_add + modal_marker, 'site export type modal')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 4. Exports client Excel : le type est obligatoire, et la « dernière visite »
#    est calculée par site DANS ce type (jamais dernière visite tous types).
# ---------------------------------------------------------------------------
p = Path('clientBatchExport.js')
s = p.read_text(encoding='utf-8')
old = """export async function listerDernieresVisitesClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT s.id AS site_id, s.nom_site, v.id AS visite_id, v.date_visite
     FROM sites s
     JOIN visites v ON v.id = (
       SELECT v2.id
       FROM visites v2
       WHERE v2.site_id = s.id
       ORDER BY COALESCE(v2.date_visite, '') DESC, v2.rowid DESC
       LIMIT 1
     )
     WHERE s.client_id = ?
     ORDER BY s.nom_site COLLATE NOCASE`,
    [clientId]
  );
}

export async function exporterDernieresVisitesClient(clientId) {
  const visites = await listerDernieresVisitesClient(clientId);
  if (!visites.length) throw new Error(\"Aucune visite n'est disponible pour les sites de ce client.\");
  const resultat = await exporterVisitesExcelEnLot(visites.map((v) => v.visite_id));
  return { ...resultat, visites };
}
"""
new = """export async function listerTypesVisitesClient(clientId) {
  if (!clientId) return [];
  const db = await getDb();
  return db.getAllAsync(
    `SELECT COALESCE(v.trame_id,'icpe_v1') AS trame_id, COUNT(*) AS nb
     FROM visites v
     JOIN sites s ON s.id=v.site_id
     WHERE s.client_id=?
     GROUP BY COALESCE(v.trame_id,'icpe_v1')
     ORDER BY trame_id`,
    [clientId]
  );
}

export async function listerDernieresVisitesClient(clientId, trameId) {
  if (!clientId || !trameId) return [];
  const db = await getDb();
  return db.getAllAsync(
    `SELECT s.id AS site_id, s.nom_site, v.id AS visite_id, v.date_visite, COALESCE(v.trame_id,'icpe_v1') AS trame_id
     FROM sites s
     JOIN visites v ON v.id = (
       SELECT v2.id
       FROM visites v2
       WHERE v2.site_id = s.id AND COALESCE(v2.trame_id,'icpe_v1') = ?
       ORDER BY COALESCE(v2.date_visite, '') DESC, v2.rowid DESC
       LIMIT 1
     )
     WHERE s.client_id = ?
     ORDER BY s.nom_site COLLATE NOCASE`,
    [trameId, clientId]
  );
}

export async function exporterDernieresVisitesClient(clientId, trameId) {
  if (!trameId) throw new Error('Choisis d’abord le type de visite à exporter.');
  const visites = await listerDernieresVisitesClient(clientId, trameId);
  if (!visites.length) throw new Error(\"Aucune visite de ce type n'est disponible pour les sites de ce client.\");
  const resultat = await exporterVisitesExcelEnLot(visites.map((v) => v.visite_id));
  return { ...resultat, visites, trameId };
}
"""
s = replace_once(s, old, new, 'typed client Excel export')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 5. Documents client : PDF/Word ET Excel commencent par un sélecteur de type
#    sans valeur par défaut. Seuls les types réellement présents sont proposés.
# ---------------------------------------------------------------------------
p = Path('ClientDocumentsScreen.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { Alert, ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';",
    "import { Alert, ActivityIndicator, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';",
    'client documents modal imports',
)
s = replace_once(
    s,
    "import { exporterDernieresVisitesClient } from './clientBatchExport.js';",
    "import { exporterDernieresVisitesClient, listerTypesVisitesClient } from './clientBatchExport.js';\nimport { obtenirTrame } from './trameRegistry.js';",
    'client typed export imports',
)
state_marker = "  const [racine, setRacine] = useState(null);\n"
state_add = "  const [typesVisites, setTypesVisites] = useState([]);\n  const [choixTrameVisible, setChoixTrameVisible] = useState(false);\n  const [actionExport, setActionExport] = useState(null);\n"
if state_add not in s:
    s = replace_once(s, state_marker, state_marker + state_add, 'client type picker state')
effect_marker = """  const chargerStockage = useCallback(async () => setRacine(await obtenirRacineMetra()), []);
  useEffect(() => { chargerStockage(); }, [chargerStockage]);
"""
effect_new = """  const chargerStockage = useCallback(async () => setRacine(await obtenirRacineMetra()), []);
  const chargerTypes = useCallback(async () => {
    try { setTypesVisites(await listerTypesVisitesClient(clientId)); }
    catch (e) { console.warn('Types de visites client non chargés', e); setTypesVisites([]); }
  }, [clientId]);
  useEffect(() => { chargerStockage(); chargerTypes(); }, [chargerStockage, chargerTypes]);
"""
s = replace_once(s, effect_marker, effect_new, 'client load available visit types')
old = """  const ouvrirRapports = async () => {
    const uri = await garantirStockageClient();
    if (!uri) return;
    navigation.navigate('Report', { clientId });
  };

  const exporterExcel = async () => {
    const uri = await garantirStockageClient();
    if (!uri) return;
    setBusy(true);
    try {
      const resultat = await exporterDernieresVisitesClient(clientId);
      if (resultat?.annule) return;
      const ok = resultat?.enregistres?.length || 0;
      const erreurs = resultat?.erreurs?.length || 0;
      Alert.alert('Export terminé', `${ok} fichier(s) Excel classé(s) automatiquement dans METRA${erreurs ? ` · ${erreurs} erreur(s)` : ''}.`);
    } catch (e) {
      Alert.alert('Export impossible', String(e?.message || e));
    } finally { setBusy(false); }
  };
"""
new = """  const demanderTypeExport = (action) => {
    if (!typesVisites.length) {
      Alert.alert('Aucune visite', 'Aucune visite n’est disponible pour ce client : aucun export n’est proposé.');
      return;
    }
    setActionExport(action);
    setChoixTrameVisible(true);
  };

  const lancerExportPourTrame = async (trameId) => {
    if (!trameId) return;
    const action = actionExport;
    setChoixTrameVisible(false);
    setActionExport(null);
    const uri = await garantirStockageClient();
    if (!uri) return;
    if (action === 'rapport') {
      navigation.navigate('Report', { clientId, trameId });
      return;
    }
    if (action !== 'excel') return;
    setBusy(true);
    try {
      const resultat = await exporterDernieresVisitesClient(clientId, trameId);
      if (resultat?.annule) return;
      const ok = resultat?.enregistres?.length || 0;
      const erreurs = resultat?.erreurs?.length || 0;
      Alert.alert('Export terminé', `${ok} fichier(s) Excel classé(s) automatiquement dans METRA${erreurs ? ` · ${erreurs} erreur(s)` : ''}.`);
    } catch (e) {
      Alert.alert('Export impossible', String(e?.message || e));
    } finally { setBusy(false); }
  };

  const ouvrirRapports = () => demanderTypeExport('rapport');
  const exporterExcel = () => demanderTypeExport('excel');
"""
s = replace_once(s, old, new, 'client type-first export flow')
render_marker = """    <ActionCard disabled={busy} secondary title=\"Exporter les dernières visites en Excel\" text=\"Un fichier Excel par dernière visite, classé automatiquement par client, site et visite pour transmission ou traitement.\" action={exporterExcel} />

    {busy ?"""
render_new = """    <ActionCard disabled={busy} secondary title=\"Exporter les dernières visites en Excel\" text=\"Un fichier Excel par dernière visite, classé automatiquement par client, site et visite pour transmission ou traitement.\" action={exporterExcel} />

    <Modal visible={choixTrameVisible} transparent animationType=\"fade\" onRequestClose={() => setChoixTrameVisible(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setChoixTrameVisible(false)}><Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
        <Text style={styles.modalTitle}>Choisir le type de visite</Text>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>Aucun type n’est sélectionné automatiquement. Seules les trames réellement présentes chez ce client sont proposées.</Text>
        {typesVisites.map((row) => {
          const trame = obtenirTrame(row.trame_id);
          return <TouchableOpacity key={row.trame_id} style={styles.visitModeCard} onPress={() => lancerExportPourTrame(row.trame_id)}><Text style={styles.visitModeIcon}>📄</Text><View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>{trame.nom}</Text><Text style={styles.visitModeText}>{row.nb} visite(s) disponible(s)</Text></View></TouchableOpacity>;
        })}
        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => setChoixTrameVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
      </Pressable></Pressable>
    </Modal>

    {busy ?"""
s = replace_once(s, render_marker, render_new, 'client type picker modal')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 6. ReportScreen client : le type passé par Documents est une barrière dure.
#    Sans trameId, la liste reste vide ; avec trameId, on prend la dernière
#    visite de CE type par site.
# ---------------------------------------------------------------------------
p = Path('ReportScreen.js')
s = p.read_text(encoding='utf-8')
import_marker = "import{exporterRapportEdite,exporterRapportsParSiteEdites}from'./reportEditorExporter.js';\n"
registry_import = "import{obtenirTrame,DEFAULT_TRAME_ID}from'./trameRegistry.js';\n"
if registry_import not in s:
    s = replace_once(s, import_marker, import_marker + registry_import, 'report trame import')
s = replace_once(
    s,
    "if(p.clientId){const all=await listerVisitesRapportClient(p.clientId);const latest=garderDerniereVisiteParSite(all);",
    "if(p.clientId){if(!p.trameId){setVisites([]);setSelected(new Set());return;}const all=await listerVisitesRapportClient(p.clientId);const sameType=all.filter(v=>(v.trame_id||DEFAULT_TRAME_ID)===p.trameId);const latest=garderDerniereVisiteParSite(sameType);",
    'report typed client list',
)
s = replace_once(
    s,
    "},[p.clientId,JSON.stringify(p.visiteIds||[])]);",
    "},[p.clientId,p.trameId,JSON.stringify(p.visiteIds||[])]);",
    'report trame dependency',
)
ui_marker = "<Text style={styles.sectionTitle}>Paramètres du rapport</Text>"
ui_add = ui_marker + "{p.trameId?<Text style={[styles.importHint,{marginBottom:10}]}>Type de visite : {obtenirTrame(p.trameId).nom}</Text>:null}"
s = replace_once(s, ui_marker, ui_add, 'report selected trame label')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 7. En différant le bootstrap physique PRE, garantir sa présence à tous les
#    points qui en ont réellement besoin : écran Installations (déjà le cas),
#    PDF/Word génériques/dédiés et Excel.
# ---------------------------------------------------------------------------
p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')
import_marker = "import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';\n"
bootstrap_import = "import { assurerStructureSitePreAllumage } from './preAllumageSiteBootstrap.js';\n"
if bootstrap_import not in s:
    s = replace_once(s, import_marker, import_marker + bootstrap_import, 'report PRE bootstrap import')
old = """  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const modelePreAllumage = trame.id === 'pre_allumage' ? await chargerPreAllumageModulaire(visiteId) : null;
"""
new = """  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  if (trame.id === 'pre_allumage') await assurerStructureSitePreAllumage(visiteId);
  const modelePreAllumage = trame.id === 'pre_allumage' ? await chargerPreAllumageModulaire(visiteId) : null;
"""
s = replace_once(s, old, new, 'report ensure deferred PRE structure')
p.write_text(s, encoding='utf-8')

p = Path('excelExport.js')
s = p.read_text(encoding='utf-8')
import_marker = "import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';\n"
if bootstrap_import not in s:
    s = replace_once(s, import_marker, import_marker + bootstrap_import, 'Excel PRE bootstrap import')
marker = """  const cfg = trame.excel;
  if (!cfg?.templateBase64) throw new Error(`Aucun modèle Excel configuré pour la trame ${trame.nom}.`);

  const [champs, controles, reseaux, compteurs, materielBrut, remarquesBrutes, note, aliases, modelePreAllumage] = await Promise.all([
"""
replacement = """  const cfg = trame.excel;
  if (!cfg?.templateBase64) throw new Error(`Aucun modèle Excel configuré pour la trame ${trame.nom}.`);
  if (trame.id === 'pre_allumage') await assurerStructureSitePreAllumage(visiteId);

  const [champs, controles, reseaux, compteurs, materielBrut, remarquesBrutes, note, aliases, modelePreAllumage] = await Promise.all([
"""
s = replace_once(s, marker, replacement, 'Excel ensure deferred PRE structure')
p.write_text(s, encoding='utf-8')

print('Visit creation performance and explicit export type selection applied.')

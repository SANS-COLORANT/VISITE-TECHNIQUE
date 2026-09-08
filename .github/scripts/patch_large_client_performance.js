const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`${label}: anchor not found`);
  return text.replace(from, to);
}

function patchClientDocuments() {
  const path = 'ClientDocumentsScreen.js';
  let text = read(path);
  text = replaceOnce(
    text,
    "import { garantirRacineMetra, initialiserArborescenceClient, obtenirRacineMetra } from './metraStorage.js';",
    "import { garantirRacineMetra, obtenirRacineMetra } from './metraStorage.js';",
    'ClientDocuments import'
  );

  const eagerTree = `      // Matérialise immédiatement l'arborescence des clients/sites/visites\n      // existants. Les prochaines visites créeront leur dossier à la création.\n      await initialiserArborescenceClient(clientId);\n`;
  if (text.includes(eagerTree)) text = text.replace(eagerTree, '');

  const oldEnsure = `  const garantirStockageClient = async () => {\n    if (!racine) return preparerStockage();\n    try {\n      setBusy(true);\n      await initialiserArborescenceClient(clientId);\n      return racine;\n    } catch (e) {\n      // Une autorisation SAF peut avoir été révoquée par Android. Le service\n      // central la redemandera proprement au prochain passage si nécessaire.\n      return preparerStockage();\n    } finally { setBusy(false); }\n  };`;
  const newEnsure = `  const garantirStockageClient = async () => {\n    // Ne jamais matérialiser ici les centaines de dossiers du client :\n    // les chemins Site/Visite sont créés paresseusement au moment de l'export.\n    try {\n      setBusy(true);\n      const uri = await garantirRacineMetra();\n      setRacine(uri);\n      return uri;\n    } catch {\n      return preparerStockage();\n    } finally { setBusy(false); }\n  };`;
  text = replaceOnce(text, oldEnsure, newEnsure, 'ClientDocuments lazy storage');
  text = text.replace("Android demandera une seule fois l'accès au dossier Documents. Ensuite METRA crée et utilise automatiquement toute l'arborescence.", "Android demandera une seule fois l'accès au dossier Documents. Ensuite METRA crée uniquement les dossiers nécessaires au moment de l'export.");
  write(path, text);
}

function patchHome() {
  const path = 'HomeScreen.js';
  let text = read(path);
  const marker = "const HOME_FAST_CACHE = { clients: null, visitesEnCours: null, stats: null };";
  if (!text.includes(marker)) {
    const anchor = "import { choisirEtAnalyserExcels, importerAnalysesExcel } from './batchExcel.js';\n";
    if (!text.includes(anchor)) throw new Error('Home cache import anchor not found');
    text = text.replace(anchor, `${anchor}\n${marker}\n`);
  }
  text = replaceOnce(text,
    "  const [clients, setClients] = useState([]);\n  const [visitesEnCours, setVisitesEnCours] = useState([]);\n  const [stats, setStats] = useState({ enCours: 0, terminees: 0 });",
    "  const [clients, setClients] = useState(() => HOME_FAST_CACHE.clients || []);\n  const [visitesEnCours, setVisitesEnCours] = useState(() => HOME_FAST_CACHE.visitesEnCours || []);\n  const [stats, setStats] = useState(() => HOME_FAST_CACHE.stats || { enCours: 0, terminees: 0 });",
    'Home cached state'
  );
  const oldLoad = `  const charger = useCallback(async () => {\n    const [c, v, s] = await Promise.all([listerClients(), listerVisitesEnCours(), compterVisites()]);\n    setClients(c);\n    setVisitesEnCours(v);\n    setStats(s);\n  }, []);`;
  const newLoad = `  const charger = useCallback(async () => {\n    // Stale-while-revalidate : au retour Accueil on conserve le dernier rendu\n    // et chaque bloc se rafraîchit dès que sa requête SQLite est terminée.\n    const clientsPromise = listerClients().then((rows) => { HOME_FAST_CACHE.clients = rows || []; setClients(rows || []); });\n    const visitsPromise = listerVisitesEnCours().then((rows) => { HOME_FAST_CACHE.visitesEnCours = rows || []; setVisitesEnCours(rows || []); });\n    const statsPromise = compterVisites().then((value) => { HOME_FAST_CACHE.stats = value || { enCours: 0, terminees: 0 }; setStats(HOME_FAST_CACHE.stats); });\n    await Promise.all([clientsPromise, visitsPromise, statsPromise]);\n  }, []);`;
  text = replaceOnce(text, oldLoad, newLoad, 'Home stale while revalidate');
  write(path, text);
}

function patchClientSites() {
  const path = 'ClientSitesScreen.js';
  let text = read(path);
  const marker = 'const CLIENT_SITES_FAST_CACHE = new Map();';
  if (!text.includes(marker)) {
    const anchor = "const adresseVide = () => ({ numero: '', voie: '', complement: '', codePostal: '', ville: '' });\n";
    if (!text.includes(anchor)) throw new Error('ClientSites cache anchor not found');
    text = text.replace(anchor, `${anchor}\n${marker}\n`);
  }
  text = replaceOnce(text,
    '  const [sites, setSites] = useState([]);',
    "  const [sites, setSites] = useState(() => CLIENT_SITES_FAST_CACHE.get(String(clientId || '')) || []);",
    'ClientSites cached state'
  );
  text = replaceOnce(text,
    `    const liste = await listerSitesClient(clientId);\n    setSites(Array.isArray(liste) ? liste : []);\n    return liste;`,
    `    const liste = await listerSitesClient(clientId);\n    const normalisee = Array.isArray(liste) ? liste : [];\n    CLIENT_SITES_FAST_CACHE.set(String(clientId), normalisee);\n    setSites(normalisee);\n    return normalisee;`,
    'ClientSites cached load'
  );
  const listAnchor = `    <FlatList\n      contentContainerStyle={styles.content}\n      data={sites}`;
  const listNew = `    <FlatList\n      style={{ flex: 1 }}\n      contentContainerStyle={[styles.content, { paddingBottom: 34 }]}\n      data={sites}\n      initialNumToRender={16}\n      maxToRenderPerBatch={12}\n      updateCellsBatchingPeriod={24}\n      windowSize={7}\n      removeClippedSubviews={false}\n      keyboardShouldPersistTaps="handled"`;
  text = replaceOnce(text, listAnchor, listNew, 'ClientSites FlatList tuning');
  write(path, text);
}

function patchSiteGroups() {
  const path = 'SiteGroupsManager.js';
  let text = read(path);
  text = replaceOnce(
    text,
    "import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';",
    "import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';",
    'SiteGroups FlatList import'
  );

  const componentMarker = 'function SiteGroupVirtualList({ groupes, sites, membershipSet, onToggle, onDelete }) {';
  if (!text.includes(componentMarker)) {
    const anchor = "function texte(value = '') { return String(value || '').trim(); }\n";
    if (!text.includes(anchor)) throw new Error('SiteGroups component anchor not found');
    const component = `\nfunction SiteGroupVirtualList({ groupes, sites, membershipSet, onToggle, onDelete }) {\n  return <FlatList\n    style={{ flex: 1 }}\n    data={sites}\n    keyExtractor={(site) => String(site.id)}\n    initialNumToRender={12}\n    maxToRenderPerBatch={10}\n    updateCellsBatchingPeriod={24}\n    windowSize={7}\n    removeClippedSubviews={false}\n    keyboardShouldPersistTaps="handled"\n    contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}\n    ListHeaderComponent={groupes.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>{groupes.map((g) => <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff' }}><Text style={{ paddingHorizontal: 10, paddingVertical: 8, fontSize: 11, fontWeight: '800' }}>{g.nom} · {g.nb_sites || 0}</Text><TouchableOpacity onPress={() => onDelete(g)} style={{ minWidth: 34, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.red || '#B42318', fontWeight: '900', fontSize: 17 }}>×</Text></TouchableOpacity></View>)}</View> : <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 14 }}>Créez un groupe puis touchez-le sur les sites concernés.</Text>}\n    renderItem={({ item: site }) => <View style={{ borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', borderRadius: 12, padding: 11, marginBottom: 8 }}>\n      <Text style={{ fontWeight: '900', color: COLORS.ink }}>{site.nom_site}</Text>\n      {groupes.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{groupes.map((g) => {\n        const active = membershipSet.has(\`\${site.id}||\${g.id}\`);\n        return <TouchableOpacity key={g.id} onPress={() => onToggle(site, g)} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? COLORS.orange : COLORS.line, backgroundColor: active ? '#FFF3E8' : '#fff', justifyContent: 'center' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: active ? COLORS.orange : COLORS.inkSoft }}>{active ? '✓ ' : ''}{g.nom}</Text></TouchableOpacity>;\n      })}</View> : null}\n    </View>}\n  />;\n}\n`;
    text = text.replace(anchor, anchor + component);
  }

  const oldToggle = `  const basculer = async (site, groupe) => {\n    const actif = membershipSet.has(\`${'${site.id}'}||${'${groupe.id}'}\`);\n    try {\n      await definirSiteDansGroupe(site.id, groupe.id, !actif);\n      await charger();\n      await onChanged?.();\n    } catch (e) { Alert.alert('Groupe', String(e?.message || e)); }\n  };`;
  const newToggle = `  const basculer = async (site, groupe) => {\n    const key = \`${'${site.id}'}||${'${groupe.id}'}\`;\n    const actif = membershipSet.has(key);\n    const avantMemberships = memberships;\n    const avantGroupes = groupes;\n    setMemberships((prev) => actif ? prev.filter((m) => !(m.site_id === site.id && m.groupe_id === groupe.id)) : [...prev, { site_id: site.id, groupe_id: groupe.id, groupe_nom: groupe.nom }]);\n    setGroupes((prev) => prev.map((g) => g.id === groupe.id ? { ...g, nb_sites: Math.max(0, Number(g.nb_sites || 0) + (actif ? -1 : 1)) } : g));\n    try {\n      await definirSiteDansGroupe(site.id, groupe.id, !actif);\n    } catch (e) {\n      setMemberships(avantMemberships);\n      setGroupes(avantGroupes);\n      Alert.alert('Groupe', String(e?.message || e));\n    }\n  };`;
  text = replaceOnce(text, oldToggle, newToggle, 'SiteGroups optimistic membership');

  // Les groupes ne modifient pas la liste des sites : éviter un rechargement parent complet.
  text = text.replace(/\n\s*await onChanged\?\.\(\);/g, '');

  if (!text.includes('<SiteGroupVirtualList groupes={groupes}')) {
    const re = /        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle=\{\{ paddingTop: 12, paddingBottom: 8 \}\}>[\s\S]*?        <\/ScrollView>/;
    if (!re.test(text)) throw new Error('SiteGroups ScrollView list anchor not found');
    text = text.replace(re, '        <SiteGroupVirtualList groupes={groupes} sites={sites} membershipSet={membershipSet} onToggle={basculer} onDelete={supprimer}/>');
  }
  write(path, text);
}

function patchReport() {
  const path = 'ReportScreen.js';
  let text = read(path);
  const helperMarker = 'async function chargerDonneesRapportParLots(ids, limite=4) {';
  if (!text.includes(helperMarker)) {
    const anchor = "function libelleTrame(data){return data?.trame?.nom||data?.visite?.trame_id||'Visite technique';}\n";
    if (!text.includes(anchor)) throw new Error('Report batch helper anchor not found');
    const helper = `\nasync function chargerDonneesRapportParLots(ids, limite=4) {\n const resultats=new Array(ids.length);let curseur=0;\n const workers=Array.from({length:Math.min(Math.max(1,limite),ids.length)},async()=>{while(true){const index=curseur++;if(index>=ids.length)return;resultats[index]=await chargerDonneesVisiteRapport(ids[index]);}});\n await Promise.all(workers);return resultats;\n}\n`;
    text = text.replace(anchor, anchor + helper);
  }

  const selectMarker = ' const selectableIds=useMemo(()=>visites.filter(v=>v.statut===\'terminee\').map(v=>v.id),[visites]);';
  if (!text.includes(selectMarker)) {
    const anchor = ' const groupeInterdit=selected.size<=1;\n';
    if (!text.includes(anchor)) throw new Error('Report select all anchor not found');
    text = text.replace(anchor, anchor + " const selectableIds=useMemo(()=>visites.filter(v=>v.statut==='terminee').map(v=>v.id),[visites]);\n const toutSelectionner=()=>setSelected(new Set(selectableIds));\n const toutDeselectionner=()=>setSelected(new Set());\n");
  }

  if (!text.includes('chargerDonneesRapportParLots(ids,4)')) {
    const re = /try\{const ds=\[\];let ph=\[\];for\(const id of ids\)\{const d=await chargerDonneesVisiteRapport\(id\);ds\.push\(d\);ph=\[\.\.\.ph,\.\.\.preparerPhotosRapport\(d,ph\)\.map\(x=>\(\{\.\.\.x,size:x\.size\|\|'medium',captionSize:x\.captionSize\|\|'normal'\}\)\)\]\}setDatas\(ds\);/;
    if (!re.test(text)) throw new Error('Report sequential preparation anchor not found');
    text = text.replace(re, "try{const ds=await chargerDonneesRapportParLots(ids,4);const ph=ds.flatMap(d=>preparerPhotosRapport(d,[]).map(x=>({...x,size:x.size||'medium',captionSize:x.captionSize||'normal'})));setDatas(ds);");
  }

  const hint = '<Text style={[styles.importHint,{marginBottom:10}]}>Pour chaque site, seule la visite la plus récente peut entrer dans le rapport. Les visites précédentes restent dans l’historique.</Text>';
  const topMarker = 'Tout désélectionner';
  if (!text.includes(topMarker)) {
    const target = `${hint}{visites.map`;
    if (!text.includes(target)) throw new Error('Report top action anchor not found');
    const toolbar = `${hint}<View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10}}><Text style={{color:COLORS.inkSoft,fontSize:11.5,fontWeight:'800',marginRight:4}}>{selected.size}/{selectableIds.length} sélectionnée{selected.size>1?'s':''}</Text><SmallButton label="Tout sélectionner" disabled={!selectableIds.length||busy} onPress={toutSelectionner}/><SmallButton label="Tout désélectionner" disabled={!selected.size||busy} onPress={toutDeselectionner}/></View><TouchableOpacity style={[styles.btnPrimary,{marginBottom:14,opacity:busy||!selected.size?0.55:1}]} disabled={busy||!selected.size} onPress={preparer}><Text style={styles.btnPrimaryText}>{busy?'Préparation…':'Choisir les photos et la couverture'}</Text></TouchableOpacity>{visites.map`;
    text = text.replace(target, toolbar);
  }

  // Supprime uniquement l'ancien bouton placé après toute la liste.
  const bottomButton = `<TouchableOpacity style={[styles.btnPrimary,{marginTop:18,opacity:busy?0.55:1}]} disabled={busy} onPress={preparer}><Text style={styles.btnPrimaryText}>{busy?'Préparation…':'Choisir les photos et la couverture'}</Text></TouchableOpacity>`;
  const occurrences = text.split(bottomButton).length - 1;
  if (occurrences > 0) text = text.replace(bottomButton, '');

  const oldPhotoSections = " const photoSections=useMemo(()=>datas.map((d,siteIndex)=>{const items=photos.filter(x=>x.visiteId===d.visite.id).sort((a,b)=>a.ordre-b.ordre);return{key:d.visite.id,data:items,visiteData:d,siteIndex}}),[datas,photos]);";
  const newPhotoSections = " const photoSections=useMemo(()=>{const byVisit=new Map();for(const photo of photos){if(!byVisit.has(photo.visiteId))byVisit.set(photo.visiteId,[]);byVisit.get(photo.visiteId).push(photo)}return datas.map((d,siteIndex)=>{const items=[...(byVisit.get(d.visite.id)||[])].sort((a,b)=>a.ordre-b.ordre);return{key:d.visite.id,data:items,visiteData:d,siteIndex}})},[datas,photos]);";
  text = replaceOnce(text, oldPhotoSections, newPhotoSections, 'Report photo grouping');
  write(path, text);
}

function patchPilotage() {
  const path = 'ClientPilotageScreen.js';
  let text = read(path);
  const helperMarker = 'async function mapAvecConcurrence(items, limite, worker) {';
  if (!text.includes(helperMarker)) {
    const anchor = "function normalize(value = '') { return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }\n";
    if (!text.includes(anchor)) throw new Error('Pilotage concurrency anchor not found');
    const helper = `\nasync function mapAvecConcurrence(items, limite, worker) {\n  const resultats = new Array(items.length); let curseur = 0;\n  const workers = Array.from({ length: Math.min(Math.max(1, limite), items.length) }, async () => {\n    while (true) { const index = curseur++; if (index >= items.length) return; resultats[index] = await worker(items[index], index); }\n  });\n  await Promise.all(workers); return resultats;\n}\n`;
    text = text.replace(anchor, anchor + helper);
  }
  text = replaceOnce(text,
    `      const nextStats = new Map();\n      for (const site of m?.sites || []) nextStats.set(site.id, await getStatsSitePatrimoine(site.id));`,
    `      const statsEntries = await mapAvecConcurrence(m?.sites || [], 6, async (site) => [site.id, await getStatsSitePatrimoine(site.id)]);\n      const nextStats = new Map(statsEntries);`,
    'Pilotage bounded stats'
  );
  write(path, text);
}

function patchMetraDirectory() {
  const path = 'MetraDirectoryScreen.js';
  let text = read(path);
  const mainAnchor = `    <FlatList\n      contentContainerStyle={[styles.content, { paddingBottom: 34 }]}\n      keyboardShouldPersistTaps="handled"\n      data={rows}`;
  const mainNew = `    <FlatList\n      style={{ flex: 1 }}\n      contentContainerStyle={[styles.content, { paddingBottom: 34 }]}\n      keyboardShouldPersistTaps="handled"\n      data={rows}\n      initialNumToRender={16}\n      maxToRenderPerBatch={12}\n      updateCellsBatchingPeriod={24}\n      windowSize={7}\n      removeClippedSubviews={false}`;
  text = replaceOnce(text, mainAnchor, mainNew, 'MetraDirectory main list tuning');

  const clientAnchor = `        <FlatList\n          data={sites}\n          keyExtractor=`;
  const clientNew = `        <FlatList\n          style={{ flex: 1 }}\n          data={sites}\n          initialNumToRender={14}\n          maxToRenderPerBatch={10}\n          updateCellsBatchingPeriod={24}\n          windowSize={7}\n          removeClippedSubviews={false}\n          keyExtractor=`;
  text = replaceOnce(text, clientAnchor, clientNew, 'MetraDirectory client list tuning');
  write(path, text);
}

patchClientDocuments();
patchHome();
patchClientSites();
patchSiteGroups();
patchReport();
patchPilotage();
patchMetraDirectory();
console.log('Large-client performance UX patch applied: lazy storage, cached navigation, virtualized lists, report bulk controls and bounded loading.');

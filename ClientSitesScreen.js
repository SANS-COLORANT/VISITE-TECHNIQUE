/** Écran Sites d'un client + accès pilotage, carte et documents. */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerSitesClient, creerSite } from './db.js';
import { getResumeSuppressionSite, supprimerSiteComplet } from './entityManagementDb.js';
import { synchroniserCoordonneesSite } from './siteGeoDb.js';
import { modifierSiteRapide } from './siteBulkDb.js';
import { dupliquerSite } from './siteOrganizationDb.js';
import { SiteAddressManager, composerAdresse } from './SiteAddressManager.js';
import { SiteRadialActionMenu } from './SiteRadialActionMenu.js';

const adresseVide = () => ({ numero: '', voie: '', complement: '', codePostal: '', ville: '' });

function ClientSitesScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [sites, setSites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupesVisible, setGroupesVisible] = useState(false);
  const [radialMenu, setRadialMenu] = useState(null);
  const [renameSite, setRenameSite] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvelleAdresse, setNouvelleAdresse] = useState(adresseVide);

  const charger = useCallback(async () => {
    if (!clientId) { setSites([]); return []; }
    const liste = await listerSitesClient(clientId);
    setSites(Array.isArray(liste) ? liste : []);
    return liste;
  }, [clientId]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try { if (actif) await charger(); }
      catch (e) { if (actif) Alert.alert('Sites', String(e?.message || e)); }
    })();
    return () => { actif = false; };
  }, [charger]);

  const sansAdresse = sites.filter((s) => !String(s.adresse || '').trim()).length;
  const avecAdresse = sites.length - sansAdresse;
  const patchNouvelleAdresse = (patch) => setNouvelleAdresse((prev) => ({ ...prev, ...patch }));

  const ajouterSiteFn = async () => {
    if (!nouveauNom.trim()) return Alert.alert('Nom requis', 'Merci de saisir le nom du site.');
    const adresse = composerAdresse(nouvelleAdresse);
    try {
      const siteId = await creerSite({ clientId, nomSite: nouveauNom.trim(), adresse: adresse || null });
      setNouveauNom(''); setNouvelleAdresse(adresseVide()); setModalVisible(false);
      await charger();
      if (adresse) synchroniserCoordonneesSite(siteId, adresse).then(charger).catch(() => {});
    } catch (e) { Alert.alert('Création impossible', String(e?.message || e)); }
  };

  const ouvrirSite = (site) => navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site });

  const confirmerSuppressionSite = async (site) => {
    try {
      const resume = await getResumeSuppressionSite(site.id);
      if (!resume) return;
      Alert.alert('Supprimer ce site ?', `« ${resume.nom_site} » contient ${resume.visites} visite(s) et ${resume.equipements} équipement(s) permanent(s). Tout sera définitivement supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer tout', style: 'destructive', onPress: async () => { try { await supprimerSiteComplet(site.id); await charger(); } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); } } },
      ]);
    } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
  };

  const demanderDuplication = (site) => Alert.alert(
    'Dupliquer ce site ?',
    `METRA va créer « ${site.nom_site} - copie » avec son patrimoine et sa maquette LAB 3D. Les anciennes visites, réserves, mesures et photos ne seront pas copiées.`,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Dupliquer', onPress: async () => {
        try {
          await dupliquerSite(site.id, { copierPatrimoine: true, copierLab3d: true });
          await charger();
        } catch (e) { Alert.alert('Duplication impossible', String(e?.message || e)); }
      } },
    ]
  );

  const ouvrirMenuSite = (event, site) => {
    event?.stopPropagation?.();
    const native = event?.nativeEvent || {};
    setRadialMenu({ site, x: native.pageX, y: native.pageY });
  };

  const actionMenuSite = (action, site) => {
    setRadialMenu(null);
    if (!site) return;
    if (action === 'delete') confirmerSuppressionSite(site);
    else if (action === 'duplicate') demanderDuplication(site);
    else if (action === 'rename') { setRenameSite(site); setRenameValue(site.nom_site || ''); }
  };

  const enregistrerRenommage = async () => {
    const nom = String(renameValue || '').trim();
    if (!renameSite) return;
    if (!nom) return Alert.alert('Nom requis', 'Merci de saisir le nom du site.');
    try {
      await modifierSiteRapide(renameSite.id, { nomSite: nom });
      setRenameSite(null); setRenameValue('');
      await charger();
    } catch (e) { Alert.alert('Renommage impossible', String(e?.message || e)); }
  };

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <FlatList
      contentContainerStyle={styles.content}
      data={sites}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<View>
        <Text style={styles.sectionLabel}>Patrimoine client</Text>
        <View style={{ marginTop: 8, marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E5E8' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{sites.length}</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>sites</Text></View><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{avecAdresse}</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>adresses renseignées</Text></View><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{sansAdresse}</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>à compléter</Text></View></View>
        </View>

        <TouchableOpacity style={[styles.btnPrimary, { marginBottom: 8 }]} onPress={() => navigation.navigate('ClientPilotage', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnPrimaryText}>▦ Pilotage patrimoine</Text></TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => navigation.navigate('ClientMap', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnSecondaryText}>🗺 Carte</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setGroupesVisible(true)} disabled={!sites.length}><Text style={styles.btnSecondaryText}>▦ Groupes</Text></TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => setModalVisible(true)}><Text style={styles.btnPrimaryText}>+ Ajouter</Text></TouchableOpacity><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => navigation.navigate('ClientDocuments', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnPrimaryText}>📄 Documents</Text></TouchableOpacity></View>

        {sansAdresse > 0 ? <View style={{ backgroundColor: '#FFF8E7', borderWidth: 1, borderColor: '#F0D99B', borderRadius: 12, padding: 10, marginBottom: 14 }}><Text style={{ color: '#7A5700', fontSize: 12, fontWeight: '700' }}>{sansAdresse} site(s) sans adresse complète</Text></View> : null}
        <View style={styles.sectionHeaderRow}><Text style={styles.sectionLabel}>Sites</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>{sites.length}</Text></View>
      </View>}
      renderItem={({ item }) => <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirSite(item)}>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom_site}</Text>{item.adresse ? <Text style={styles.cardSub}>{item.adresse}</Text> : <Text style={{ color: '#A26A00', fontSize: 12 }}>Adresse à renseigner</Text>}{item.localisation_note ? <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>{item.localisation_note}</Text> : null}</View>
        <View style={[styles.badge, item.statut === 'Actif' ? styles.badgeActif : styles.badgeInactif]}><Text style={[styles.badgeText, item.statut === 'Actif' ? styles.badgeTextActif : styles.badgeTextInactif]}>{item.statut || 'Actif'}</Text></View>
        <TouchableOpacity onPress={(e) => ouvrirMenuSite(e, item)} style={{ minWidth: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}><Text style={{ color: COLORS.inkSoft, fontSize: 22, fontWeight: '900' }}>⋯</Text></TouchableOpacity>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
    />

    <Modal visible={modalVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Nouveau site</Text><TextInput style={styles.input} placeholder="Nom du site" value={nouveauNom} onChangeText={setNouveauNom}/><View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><TextInput style={[styles.input, { width: 84 }]} placeholder="N°" value={nouvelleAdresse.numero} keyboardType="numbers-and-punctuation" onChangeText={(v) => patchNouvelleAdresse({ numero: v })}/><TextInput style={[styles.input, { flex: 1 }]} placeholder="Rue / avenue / voie" value={nouvelleAdresse.voie} onChangeText={(v) => patchNouvelleAdresse({ voie: v })}/></View><TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Complément : bâtiment, entrée…" value={nouvelleAdresse.complement} onChangeText={(v) => patchNouvelleAdresse({ complement: v })}/><View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><TextInput style={[styles.input, { width: 120 }]} placeholder="Code postal" value={nouvelleAdresse.codePostal} keyboardType="number-pad" maxLength={5} onChangeText={(v) => patchNouvelleAdresse({ codePostal: v.replace(/\D/g, '').slice(0, 5) })}/><TextInput style={[styles.input, { flex: 1 }]} placeholder="Ville" value={nouvelleAdresse.ville} onChangeText={(v) => patchNouvelleAdresse({ ville: v })}/></View><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={ajouterSiteFn}><Text style={styles.btnPrimaryText}>Créer</Text></TouchableOpacity></View></View></View></Modal>

    <Modal visible={!!renameSite} transparent animationType="fade" onRequestClose={() => setRenameSite(null)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Renommer le site</Text><TextInput autoFocus style={styles.input} value={renameValue} onChangeText={setRenameValue} selectTextOnFocus/><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setRenameSite(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrerRenommage}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View></View></View></Modal>

    <SiteAddressManager visible={groupesVisible} mode="groups" clientId={clientId} sites={sites} onClose={() => setGroupesVisible(false)} onChanged={charger}/>
    <SiteRadialActionMenu menu={radialMenu} onClose={() => setRadialMenu(null)} onAction={actionMenuSite}/>
  </View>;
}

export { ClientSitesScreen };

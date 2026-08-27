/** Écran d'un site : visites, équipements, remarques + localisation par adresse. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, Linking, ScrollView } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerVisitesSite, getDb } from './db.js';
import { creerVisiteProduction } from './visitCreationDb.js';
import { supprimerVisiteComplete } from './entityManagementDb.js';
import { getSiteLocalisation } from './siteGeoDb.js';
import { modifierSiteRapide } from './siteBulkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { listerTramesDisponibles, obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { SiteOverviewPanel } from './SiteOverviewPanel.js';
import { exporterVisitesExcelEnLot } from './batchExcel.js';

const STATUT_LABELS = { en_cours: 'En cours', terminee: 'Terminée', a_completer: 'À compléter', exportee: 'Exportée' };
const SITE_TABS = [
  { id: 'visites', label: 'Visites' },
  { id: 'equipements', label: 'Équipements' },
  { id: 'remarques', label: 'Remarques' },
];

function decomposerAdresse(adresseComplete) {
  const lignes = String(adresseComplete || '').split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  if (lignes.length >= 3) return { rue: lignes[0], ville: lignes[1], codePostal: lignes[2] };
  if (lignes.length === 2) {
    const cpVille = lignes[1].match(/^(\d{5})\s+(.+)$/);
    if (cpVille) return { rue: lignes[0], ville: cpVille[2], codePostal: cpVille[1] };
    return { rue: lignes[0], ville: lignes[1], codePostal: '' };
  }
  return { rue: lignes[0] || '', ville: '', codePostal: '' };
}

function composerAdresse(rue, ville, codePostal) {
  return [String(rue || '').trim(), String(ville || '').trim(), String(codePostal || '').trim()].filter(Boolean).join('\n');
}

function SiteVisitesScreen({ route, navigation }) {
  const { siteId, nomSite } = route.params;
  const [visites, setVisites] = useState([]);
  const [site, setSite] = useState(null);
  const [siteTab, setSiteTab] = useState('visites');
  const [choixModeVisible, setChoixModeVisible] = useState(false);
  const [trameChoisie, setTrameChoisie] = useState(DEFAULT_TRAME_ID);
  const [gpsVisible, setGpsVisible] = useState(false);
  const [adresseRue, setAdresseRue] = useState('');
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [note, setNote] = useState('');
  const [localisationEnCours, setLocalisationEnCours] = useState(false);
  const [selectionExport, setSelectionExport] = useState(false);
  const [visitesSelectionnees, setVisitesSelectionnees] = useState(() => new Set());
  const [exportLotEnCours, setExportLotEnCours] = useState(false);
  const tramesDisponibles = listerTramesDisponibles();

  const charger = useCallback(async () => {
    const [v, s] = await Promise.all([listerVisitesSite(siteId), getSiteLocalisation(siteId)]);
    setVisites(v);
    setSite(s);
    if (s) {
      const morceaux = decomposerAdresse(s.adresse || '');
      setAdresseRue(morceaux.rue);
      setVille(morceaux.ville);
      setCodePostal(morceaux.codePostal);
      setNote(s.localisation_note || '');
    }
  }, [siteId]);

  useEffect(() => { charger(); }, [charger]);

  const ouvrirNouvelleVisite = () => {
    const derniereTrame = visites[0]?.trame_id;
    setTrameChoisie(derniereTrame || DEFAULT_TRAME_ID);
    setChoixModeVisible(true);
  };

  const nouvelleVisite = async (mode) => {
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

  const confirmerSuppressionVisite = (visite) => {
    Alert.alert(
      'Supprimer cette visite ?',
      `La visite du ${visite.date_visite || 'date non renseignée'} et toutes ses photos, réserves, relevés et observations propres seront définitivement supprimées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          try { await supprimerVisiteComplete(visite.id); await charger(); }
          catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
        } },
      ]
    );
  };

  const basculerSelection = useCallback((id) => {
    setVisitesSelectionnees((actuelles) => {
      const next = new Set(actuelles);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const ouvrirSelectionExport = () => {
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

  const exporterSelection = async () => {
    if (!visitesSelectionnees.size || exportLotEnCours) return;
    setExportLotEnCours(true);
    try {
      const resultat = await exporterVisitesExcelEnLot([...visitesSelectionnees]);
      if (resultat.annule) return;
      const lignes = [`${resultat.enregistres.length} fichier(s) Excel enregistré(s).`];
      if (resultat.erreurs.length) lignes.push(`${resultat.erreurs.length} export(s) en échec.`);
      Alert.alert('Export multiple terminé', lignes.join('\n'));
      if (resultat.enregistres.length) {
        setSelectionExport(false);
        setVisitesSelectionnees(new Set());
      }
    } catch (e) {
      Alert.alert('Export multiple impossible', String(e?.message || e));
    } finally {
      setExportLotEnCours(false);
    }
  };

  const adresseSaisie = composerAdresse(adresseRue, ville, codePostal);

  const enregistrerAdresse = async () => {
    if (!adresseRue.trim() || !ville.trim() || !/^\d{5}$/.test(codePostal.trim())) {
      Alert.alert('Adresse incomplète', 'Renseigne le numéro et la rue, la ville et un code postal à 5 chiffres.');
      return;
    }
    try {
      setLocalisationEnCours(true);
      await modifierSiteRapide(siteId, { adresse: adresseSaisie, note });
      setGpsVisible(false);
      await charger();
    } catch (e) {
      Alert.alert('Enregistrement impossible', String(e.message || e));
    } finally {
      setLocalisationEnCours(false);
    }
  };

  const ouvrirGoogleMaps = async (adresseForcee = null) => {
    const query = String(adresseForcee || site?.adresse || '').trim();
    if (!query) {
      Alert.alert('Google Maps', "Renseigne d'abord l'adresse du site.");
      return;
    }
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
    } catch {
      Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps. Vérifie la connexion Internet.");
    }
  };

  const enregistrerEtOuvrirMaps = async () => {
    if (!adresseRue.trim() || !ville.trim() || !/^\d{5}$/.test(codePostal.trim())) {
      Alert.alert('Adresse incomplète', 'Renseigne le numéro et la rue, la ville et un code postal à 5 chiffres.');
      return;
    }
    try {
      setLocalisationEnCours(true);
      await modifierSiteRapide(siteId, { adresse: adresseSaisie, note });
      await charger();
      setGpsVisible(false);
      await ouvrirGoogleMaps(adresseSaisie);
    } catch (e) {
      Alert.alert('Localisation impossible', String(e.message || e));
    } finally {
      setLocalisationEnCours(false);
    }
  };

  const LocalisationHeader = () => (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>Localisation du site</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{site?.adresse || 'Adresse à renseigner'}</Text>
        </View>
        <TouchableOpacity onPress={() => setGpsVisible(true)} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{site?.adresse ? 'Modifier' : '+ Adresse'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E5E8' }}>
        {site?.adresse ? (
          <>
            <Text style={{ fontWeight: '800' }}>📍 {site.adresse}</Text>
            {site.localisation_note ? <Text style={{ marginTop: 7, color: '#555' }}>{site.localisation_note}</Text> : null}
            <TouchableOpacity onPress={() => ouvrirGoogleMaps()} style={{ marginTop: 10, paddingVertical: 8 }}>
              <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Ouvrir dans Google Maps ↗</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontWeight: '700' }}>📍 Adresse non renseignée</Text>
            <Text style={{ color: COLORS.muted, marginTop: 5, fontSize: 12 }}>Ajoute le numéro et la rue, la ville et le code postal. L'adresse reste disponible hors connexion.</Text>
          </>
        )}
      </View>
    </View>
  );

  const SiteTabs = () => (
    <View style={{ flexDirection: 'row', gap: 7, marginBottom: 16 }}>
      {SITE_TABS.map((tab) => {
        const actif = siteTab === tab.id;
        return (
          <TouchableOpacity key={tab.id} onPress={() => { setSiteTab(tab.id); if (tab.id !== 'visites') annulerSelectionExport(); }} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: actif ? COLORS.orange : COLORS.line, backgroundColor: actif ? COLORS.orangeLight : COLORS.white }}>
            <Text style={{ color: actif ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: actif ? '800' : '600', fontSize: 12.5 }}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const VisitesHeader = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <Text style={[styles.sectionLabel, { flex: 1, marginBottom: 0 }]}>Historique des visites — {nomSite}</Text>
      {visites.length > 0 && !selectionExport ? <TouchableOpacity onPress={ouvrirSelectionExport} style={{ paddingHorizontal: 10, paddingVertical: 8 }}><Text style={{ color: COLORS.primary, fontWeight: '800' }}>Exporter plusieurs</Text></TouchableOpacity> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        key={`${siteTab}-${selectionExport ? 'selection' : 'normal'}`}
        contentContainerStyle={styles.content}
        data={siteTab === 'visites' ? visites : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<View><LocalisationHeader /><SiteTabs />{siteTab === 'visites' ? <VisitesHeader /> : null}</View>}
        renderItem={({ item }) => {
          const trame = obtenirTrame(item.trame_id || DEFAULT_TRAME_ID);
          const selectionnee = visitesSelectionnees.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.card, selectionExport && selectionnee ? { borderWidth: 2, borderColor: COLORS.primary } : null]}
              activeOpacity={0.7}
              onPress={() => selectionExport ? basculerSelection(item.id) : navigation.navigate('Visite', { visiteId: item.id })}
            >
              {selectionExport ? <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: selectionnee ? COLORS.primary : COLORS.line, backgroundColor: selectionnee ? COLORS.primary : '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}><Text style={{ color: '#fff', fontWeight: '900' }}>{selectionnee ? '✓' : ''}</Text></View> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.date_visite || 'Sans date'}</Text>
                <Text style={styles.cardSub}>{trame.nom}{item.technicien ? ` · ${item.technicien}` : ''}</Text>
              </View>
              <View style={styles.badge}><Text style={styles.badgeText}>{STATUT_LABELS[item.statut] || item.statut} · {item.progression_pct}%</Text></View>
              {!selectionExport ? <TouchableOpacity onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionVisite(item); }} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }} accessibilityLabel={`Supprimer la visite du ${item.date_visite || ''}`}>
                <Text style={{ color: COLORS.red || '#B42318', fontSize: 18, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={siteTab === 'visites'
          ? <View style={styles.empty}><Text style={styles.emptyText}>Aucune visite pour ce site pour l'instant.</Text><Text style={styles.emptySub}>Lance la première avec le bouton ci-dessous.</Text></View>
          : <SiteOverviewPanel siteId={siteId} mode={siteTab} />}
      />

      {siteTab === 'visites' && selectionExport ? <View style={[styles.fabBar, { flexDirection: 'row', gap: 8 }]}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={annulerSelectionExport} disabled={exportLotEnCours}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={toutSelectionner} disabled={exportLotEnCours}><Text style={styles.btnSecondaryText}>{visitesSelectionnees.size === visites.length ? 'Tout désélectionner' : 'Tout sélectionner'}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnPrimary, { flex: 1.2 }]} onPress={exporterSelection} disabled={!visitesSelectionnees.size || exportLotEnCours}><Text style={styles.btnPrimaryText}>{exportLotEnCours ? 'Export…' : `Exporter ${visitesSelectionnees.size}`}</Text></TouchableOpacity>
      </View> : siteTab === 'visites' ? <View style={styles.fabBar}>
        <TouchableOpacity style={[styles.btnPrimary, styles.fabButton]} onPress={ouvrirNouvelleVisite}><Text style={styles.btnPrimaryText}>+ Nouvelle visite</Text></TouchableOpacity>
      </View> : null}

      <Modal visible={gpsVisible} transparent animationType="fade" onRequestClose={() => setGpsVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Adresse du site</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>L'adresse est enregistrée dans l'application et reste disponible hors connexion. Avec Internet, Google Maps peut la rechercher directement.</Text>
          <TextInput style={styles.input} placeholder="Numéro + rue" value={adresseRue} onChangeText={setAdresseRue} autoCapitalize="words" />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Ville" value={ville} onChangeText={setVille} autoCapitalize="words" />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Code postal" value={codePostal} onChangeText={(v) => setCodePostal(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" maxLength={5} />
          <TextInput style={[styles.input, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]} placeholder="Note d'accès : parking P2, porte chaufferie, sous-sol…" multiline value={note} onChangeText={setNote} />
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 12 }]} disabled={localisationEnCours || !adresseRue.trim() || !ville.trim() || codePostal.length !== 5} onPress={enregistrerEtOuvrirMaps}><Text style={styles.btnSecondaryText}>{localisationEnCours ? 'Ouverture…' : '🗺️ Enregistrer et ouvrir dans Google Maps'}</Text></TouchableOpacity>
          <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setGpsVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} disabled={localisationEnCours} onPress={enregistrerAdresse}><Text style={styles.btnPrimaryText}>{localisationEnCours ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={choixModeVisible} transparent animationType="fade" onRequestClose={() => setChoixModeVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.modalTitle}>Nouvelle visite</Text>
          <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Trame de visite</Text>
          {tramesDisponibles.map((trame) => {
            const selected = trameChoisie === trame.id;
            return <TouchableOpacity key={trame.id} style={[styles.visitModeCard, selected && { borderColor: COLORS.primary, backgroundColor: '#FFF7EF' }]} onPress={() => setTrameChoisie(trame.id)}><Text style={styles.visitModeIcon}>{selected ? '✓' : '📄'}</Text><View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>{trame.nom}</Text><Text style={styles.visitModeText}>{trame.description || `Trame ${trame.nom}`}</Text></View></TouchableOpacity>;
          })}
          <Text style={[styles.fieldLabel, { marginTop: 14, marginBottom: 8 }]}>Mode</Text>
          <TouchableOpacity style={[styles.visitModeCard, visites.length === 0 && { opacity: 0.45 }]} disabled={visites.length === 0} onPress={() => nouvelleVisite('express')}><Text style={styles.visitModeIcon}>⚡</Text><View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>Visite Express</Text><Text style={styles.visitModeText}>{visites.length === 0 ? 'Disponible après une première visite complète.' : 'Reprend automatiquement la trame de la dernière visite et les informations stables.'}</Text></View></TouchableOpacity>
          <TouchableOpacity style={styles.visitModeCard} onPress={() => nouvelleVisite('complete')}><Text style={styles.visitModeIcon}>📋</Text><View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>Visite complète</Text><Text style={styles.visitModeText}>Parcourt toute la trame sélectionnée pour une première visite ou un audit détaillé.</Text></View></TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => setChoixModeVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
        </ScrollView></View></View>
      </Modal>
    </View>
  );
}

export { SiteVisitesScreen };

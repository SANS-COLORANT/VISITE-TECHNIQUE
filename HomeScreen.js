/** Écran Accueil. */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  PanResponder
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, styles } from './styles.js';
import { listerClients, creerClient, listerVisitesEnCours, compterVisites } from './db.js';
import { SpiralActiveHome } from './visual-packs/spiral-active/SpiralActiveHome.js';
import { PatrimoineThumbnail } from './PatrimoineImageCard.js';
import { onPatrimoineImageChanged } from './patrimoineImageDb.js';
import { MISSION_COLORS } from './missionTheme.js';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';
import { prewarmClientSites } from './navigationPrewarm.js';
import { prewarmVisitInBackground } from './visitPrewarm.js';
import { forgetVisitRuntime, markVisitHot } from './visitRuntimeCache.js';

const HOME_FAST_CACHE = { clients: null, visitesEnCours: null, stats: null };
function chargerBatchExcelModule() {
  return require('./batchExcel.js');
}
function chargerEntityManagementModule() {
  return require('./entityManagementDb.js');
}

function HomeScreen({ navigation, onR1LongPress, spiralPreview = false, missionsEnabled = false }) {
  const listRef = useRef(null);
  const scrollKey = 'home:clients';
  const [clients, setClients] = useState(() => HOME_FAST_CACHE.clients || []);
  const [visitesEnCours, setVisitesEnCours] = useState(() => HOME_FAST_CACHE.visitesEnCours || []);
  const [stats, setStats] = useState(() => HOME_FAST_CACHE.stats || { enCours: 0, terminees: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauCode, setNouveauCode] = useState('');
  const [creationClient, setCreationClient] = useState(false);
  const [importBatch, setImportBatch] = useState(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const charger = useCallback(async () => {
    // Stale-while-revalidate : au retour Accueil on conserve le dernier rendu
    // et chaque bloc se rafraîchit dès que sa requête SQLite est terminée.
    const clientsPromise = listerClients().then((rows) => {
      HOME_FAST_CACHE.clients = rows || [];
      setClients(rows || []);
    });
    const visitsPromise = listerVisitesEnCours().then((rows) => {
      HOME_FAST_CACHE.visitesEnCours = rows || [];
      setVisitesEnCours(rows || []);
    });
    const statsPromise = compterVisites().then((value) => {
      HOME_FAST_CACHE.stats = value || { enCours: 0, terminees: 0 };
      setStats(HOME_FAST_CACHE.stats);
    });
    await Promise.all([clientsPromise, visitsPromise, statsPromise]);
  }, []);

  useEffect(() => {
    charger().catch((e) => console.warn('Chargement accueil impossible', e));
  }, [charger]);
  useEffect(() => {
    let alive = true;
    hydrateNavigationState(scrollKey)
      .then((state) => {
        if (!alive) return;
        const offset = Number(state?.scrollY || 0);
        if (offset) setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const offset = getNavigationScrollOffset(scrollKey);
    if (!offset || !clients.length) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    return () => clearTimeout(timer);
  }, [clients.length]);
  useEffect(
    () =>
      onPatrimoineImageChanged((change) => {
        if (change?.type === 'client') charger().catch(() => {});
      }),
    [charger]
  );

  const missionsSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          missionsEnabled && gesture.dx > 22 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.45,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (missionsEnabled && gesture.dx > 85) navigation.navigate('Missions', { enteredBySwipe: true });
        }
      }),
    [missionsEnabled, navigation]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await charger();
    setRefreshing(false);
  };
  const openDirectory = () => navigation.navigate('MetraDirectory', { query: quickSearch.trim() });

  const confirmerSuppressionVisite = (v) =>
    Alert.alert(
      'Supprimer cette visite ?',
      `« ${v.nom_client} — ${v.nom_site} » et toutes les données propres à cette visite seront définitivement supprimées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await chargerEntityManagementModule().supprimerVisiteComplete(v.id);
            forgetVisitRuntime(v.id);
            await charger();
          }
        }
      ]
    );

  const confirmerSuppressionClient = async (client) => {
    try {
      const r = await chargerEntityManagementModule().getResumeSuppressionClient(client.id);
      if (!r) return;
      Alert.alert(
        'Supprimer ce client ?',
        `« ${r.nom} » contient ${r.sites} site(s) et ${r.visites} visite(s). Tout le contenu associé sera définitivement supprimé.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer tout',
            style: 'destructive',
            onPress: async () => {
              try {
                await chargerEntityManagementModule().supprimerClientComplet(client.id);
                await charger();
              } catch (e) {
                Alert.alert('Suppression impossible', String(e.message || e));
              }
            }
          }
        ]
      );
    } catch (e) {
      Alert.alert('Suppression impossible', String(e.message || e));
    }
  };

  const ajouterClient = async () => {
    const nom = nouveauNom.trim();
    const codeExploitant = nouveauCode.trim() || null;
    if (!nom) {
      Alert.alert('Nom requis', 'Merci de saisir le nom du client.');
      return;
    }
    if (creationClient) return;
    setCreationClient(true);
    try {
      const id = await creerClient({ nom, codeExploitant });
      setClients((c) =>
        [...c, { id, nom, code_exploitant: codeExploitant, adresse: null, image_uri: null }].sort((a, b) =>
          String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' })
        )
      );
      setNouveauNom('');
      setNouveauCode('');
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Création impossible', String(e.message || e));
    } finally {
      setCreationClient(false);
    }
  };

  const choisirExcel = async () => {
    try {
      const lot = await chargerBatchExcelModule().choisirEtAnalyserExcels();
      if (!lot) return;
      if (!lot.analyses.length) {
        Alert.alert(
          'Aucun fichier importable',
          lot.erreurs.map((e) => `${e.nomFichier} : ${e.message}`).join('\n') || 'Aucune trame Excel reconnue.'
        );
        return;
      }
      setImportBatch(lot);
    } catch (e) {
      Alert.alert('Import impossible', String(e.message || e));
    }
  };

  const confirmerImport = async () => {
    if (!importBatch?.analyses?.length || importEnCours) return;
    setImportEnCours(true);
    try {
      const resultats = await chargerBatchExcelModule().importerAnalysesExcel(importBatch.analyses);
      const reussis = resultats.filter((r) => r.ok && !r.dejaImporte);
      const deja = resultats.filter((r) => r.ok && r.dejaImporte);
      const echecs = resultats.filter((r) => !r.ok);
      setImportBatch(null);
      await charger();
      if (resultats.length === 1 && reussis.length === 1)
        navigation.navigate('Visite', { visiteId: reussis[0].visiteId });
      else
        Alert.alert(
          'Import Excel terminé',
          [
            `${reussis.length} visite(s) importée(s).`,
            deja.length ? `${deja.length} fichier(s) déjà importé(s).` : null,
            echecs.length ? `${echecs.length} échec(s).` : null
          ]
            .filter(Boolean)
            .join('\n')
        );
    } catch (e) {
      Alert.alert('Erreur pendant l’import', String(e.message || e));
    } finally {
      setImportEnCours(false);
    }
  };

  if (spiralPreview) {
    return (
      <SpiralActiveHome
        clients={clients}
        visitesEnCours={visitesEnCours}
        stats={stats}
        refreshing={refreshing}
        onRefresh={onRefresh}
        quickSearch={quickSearch}
        setQuickSearch={setQuickSearch}
        openDirectory={openDirectory}
        navigation={navigation}
        choisirExcel={choisirExcel}
        confirmerSuppressionVisite={confirmerSuppressionVisite}
        confirmerSuppressionClient={confirmerSuppressionClient}
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        nouveauNom={nouveauNom}
        setNouveauNom={setNouveauNom}
        nouveauCode={nouveauCode}
        setNouveauCode={setNouveauCode}
        ajouterClient={ajouterClient}
        creationClient={creationClient}
        importBatch={importBatch}
        setImportBatch={setImportBatch}
        confirmerImport={confirmerImport}
        importEnCours={importEnCours}
        onR1LongPress={onR1LongPress}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }} {...missionsSwipeResponder.panHandlers}>
      <View style={styles.homeTopRow}>
        <TouchableOpacity style={styles.importExcelBtn} onPress={choisirExcel}>
          <Text style={styles.importExcelBtnText}>⇧ Importer Excel(s)</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.parametresBtn} onPress={() => navigation.navigate('Parametres')}>
          <Text style={styles.parametresBtnText}>⚙ Paramètres</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        onScroll={(event) => setNavigationScrollOffset(scrollKey, event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={80}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.orange} />}
        data={clients}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={
          <>
            {missionsEnabled ? (
              <View
                style={{
                  alignSelf: 'flex-end',
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 12,
                  backgroundColor: MISSION_COLORS.accentSoft
                }}
              >
                <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, fontWeight: '800' }}>
                  Glisser vers la droite → Missions
                </Text>
              </View>
            ) : null}
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#E6E8EC',
                padding: 13,
                marginBottom: 16
              }}
            >
              <Text style={{ color: COLORS.ink || '#17212B', fontSize: 13.5, fontWeight: '900', marginBottom: 9 }}>
                Accès rapide au patrimoine
              </Text>
              <View
                style={{
                  minHeight: 50,
                  borderRadius: 14,
                  backgroundColor: '#F7F8FA',
                  borderWidth: 1,
                  borderColor: '#ECEEF1',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingLeft: 13
                }}
              >
                <Text style={{ fontSize: 21, color: '#98A2B3', marginRight: 9 }}>⌕</Text>
                <TextInput
                  value={quickSearch}
                  onChangeText={setQuickSearch}
                  onSubmitEditing={openDirectory}
                  placeholder="Client, site, ville, adresse, équipement…"
                  placeholderTextColor="#98A2B3"
                  style={{ flex: 1, color: COLORS.ink || '#17212B', fontSize: 14.5, paddingVertical: 12 }}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                <TouchableOpacity
                  onPress={openDirectory}
                  style={{ minWidth: 50, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: COLORS.orange || '#E86F2D', fontWeight: '900', fontSize: 18 }}>→</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: COLORS.muted || '#667085', fontSize: 11.5, marginTop: 8 }}>
                Recherche METRA + données Intranet déjà synchronisées · utilisable hors connexion.
              </Text>
            </View>

            <View style={{ position: 'relative' }}>
              <View
                style={{
                  position: 'absolute',
                  top: -34,
                  left: -18,
                  width: 130,
                  height: 130,
                  borderRadius: 65,
                  backgroundColor: COLORS.orangeLight,
                  opacity: 0.9
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: -14,
                  right: -28,
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: COLORS.orange,
                  opacity: 0.16
                }}
              />
              <View style={styles.statRow}>
                <StatCard num={stats.enCours} label="En cours" />
                <StatCard num={stats.terminees} label="Terminées" />
              </View>
            </View>

            {visitesEnCours.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Visites en cours</Text>
                {visitesEnCours.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.card}
                    onPressIn={() => prewarmVisitInBackground(v, { preview: v })}
                    onPress={() => {
                      markVisitHot(v.id, { preview: v });
                      navigation.navigate('Visite', { visiteId: v.id, visitePreview: v });
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{v.nom_client}</Text>
                      <Text style={styles.cardSub}>{v.nom_site}</Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{v.progression_pct}%</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteVisiteBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        confirmerSuppressionVisite(v);
                      }}
                    >
                      <Text style={styles.deleteVisiteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <View style={styles.sectionHeaderRow}>
              <TouchableOpacity activeOpacity={1} delayLongPress={4000} onLongPress={onR1LongPress}>
                <Text style={styles.sectionLabel}>Clients locaux</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(true)}>
                <Text style={styles.addLink}>+ Ajouter</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPressIn={() => prewarmClientSites(item.id).catch(() => {})}
            onPress={() => navigation.navigate('ClientSites', { clientId: item.id, nomClient: item.nom })}
          >
            <PatrimoineThumbnail uri={item.image_uri} size={54} radius={10} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.nom}</Text>
              {item.code_exploitant ? <Text style={styles.cardSub}>{item.code_exploitant}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e?.stopPropagation?.();
                confirmerSuppressionClient(item);
              }}
              style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: COLORS.red || '#B42318', fontSize: 18, fontWeight: '800' }}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun client local</Text>
            <Text style={styles.emptySub}>
              Utilise la recherche ci-dessus pour retrouver un client ou un site synchronisé, ou crée un client
              manuellement.
            </Text>
          </View>
        }
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nouveau client</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom du client"
              value={nouveauNom}
              onChangeText={setNouveauNom}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Code exploitant (optionnel)"
              value={nouveauCode}
              onChangeText={setNouveauCode}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={ajouterClient}>
                <Text style={styles.btnPrimaryText}>{creationClient ? 'Création…' : 'Créer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={() => setImportBatch(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Import Excel en lot</Text>
            {importBatch ? (
              <ScrollView style={{ maxHeight: 430 }}>
                {importBatch.analyses.map((a, index) => (
                  <View
                    key={`${a.sourceId || a.nomFichier}-${index}`}
                    style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line }}
                  >
                    <Text style={styles.importFileName}>{a.nomFichier}</Text>
                    <Text style={styles.importSiteTitle}>
                      {a.client} · {a.site}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setImportBatch(null)}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={confirmerImport}>
                <Text style={styles.btnPrimaryText}>
                  {importEnCours ? 'Import…' : `Importer ${importBatch?.analyses?.length || 0}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ num, label }) {
  return (
    <View
      style={[
        styles.statCard,
        { overflow: 'hidden', backgroundColor: 'transparent', borderColor: 'rgba(234,232,226,0.6)' }
      ]}
    >
      <BlurView intensity={35} tint="light" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.45)'
        }}
      />
      <Text style={styles.statNum}>{num}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export { HomeScreen };

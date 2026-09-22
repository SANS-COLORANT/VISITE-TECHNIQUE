/** Niveau Site -> Locaux : un local ouvre uniquement son historique de visites. */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getDb, uuidv4 } from './db.js';
import { materializeCachedLocalForSite } from './apiLatestVisitImportDb.js';

function SiteLocalsScreen({ route, navigation }) {
  const { siteId, nomSite, clientId, nomClient } = route?.params || {};
  const [locaux, setLocaux] = useState([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creationVisible, setCreationVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [creationEnCours, setCreationEnCours] = useState(false);

  const materialiserLocauxIntranetManquants = useCallback(async (db) => {
    const manquants = await db.getAllAsync(
      `SELECT l.remote_local_id
       FROM api_local_links l
       JOIN api_site_links s ON s.remote_site_id=l.remote_site_id
       WHERE s.local_site_id=? AND l.remote_present=1
         AND (l.local_installation_id IS NULL OR trim(l.local_installation_id)='')`,
      [String(siteId)]
    );
    for (const row of manquants) {
      await materializeCachedLocalForSite(siteId, row.remote_local_id);
    }
  }, [siteId]);

  const charger = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const db = await getDb();
      await materialiserLocauxIntranetManquants(db);
      const [rows, legacy] = await Promise.all([
        db.getAllAsync(
          `SELECT
             i.id AS installation_id,
             i.nom,
             i.description,
             i.type_code,
             (SELECT l.remote_local_id FROM api_local_links l
               WHERE l.local_installation_id=i.id AND l.remote_present=1
               ORDER BY l.synced_at DESC LIMIT 1) AS remote_local_id,
             (SELECT l.remote_site_id FROM api_local_links l
               WHERE l.local_installation_id=i.id AND l.remote_present=1
               ORDER BY l.synced_at DESC LIMIT 1) AS remote_site_id,
             (SELECT l.designation FROM api_local_links l
               WHERE l.local_installation_id=i.id AND l.remote_present=1
               ORDER BY l.synced_at DESC LIMIT 1) AS remote_designation,
             (SELECT l.remote_trame_id FROM api_local_links l
               WHERE l.local_installation_id=i.id AND l.remote_present=1
               ORDER BY l.synced_at DESC LIMIT 1) AS remote_trame_id,
             (SELECT l.remote_trame_nom FROM api_local_links l
               WHERE l.local_installation_id=i.id AND l.remote_present=1
               ORDER BY l.synced_at DESC LIMIT 1) AS remote_trame_nom,
             (SELECT COUNT(*) FROM visites v WHERE v.installation_id=i.id) AS visit_count,
             (SELECT v.date_visite FROM visites v
               WHERE v.installation_id=i.id
               ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC LIMIT 1) AS latest_visit_date,
             (SELECT v.trame_id FROM visites v
               WHERE v.installation_id=i.id
               ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC LIMIT 1) AS latest_trame_id
           FROM installations i
           WHERE i.site_id=? AND i.actif=1
           ORDER BY COALESCE(i.nom,'') COLLATE NOCASE,i.cree_le`,
          [String(siteId)]
        ),
        db.getFirstAsync(
          `SELECT COUNT(*) AS n FROM visites WHERE site_id=? AND installation_id IS NULL`,
          [String(siteId)]
        ),
      ]);
      setLocaux(rows || []);
      setLegacyCount(Number(legacy?.n || 0));
    } catch (error) {
      Alert.alert('Locaux', String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }, [siteId, materialiserLocauxIntranetManquants]);

  useEffect(() => { charger(); }, [charger]);

  const remoteClientPourLocal = async (local) => {
    if (!local?.remote_site_id) return null;
    const db = await getDb();
    const row = await db.getFirstAsync(
      `SELECT cs.remote_client_id
       FROM api_client_site_links cs
       JOIN api_client_links c ON c.remote_client_id=cs.remote_client_id
       WHERE cs.remote_site_id=? AND cs.remote_present=1
         AND (? IS NULL OR c.local_client_id=?)
       ORDER BY cs.synced_at DESC LIMIT 1`,
      [String(local.remote_site_id), clientId || null, clientId || null]
    );
    return row?.remote_client_id ? String(row.remote_client_id) : null;
  };

  const ouvrirLocal = async (local) => {
    const remoteClientId = await remoteClientPourLocal(local);
    navigation.navigate('SiteVisites', {
      siteId,
      nomSite,
      clientId,
      nomClient,
      installationId: local.installation_id,
      nomLocal: local.nom || local.remote_designation || 'Local technique',
      apiRemoteLocalId: local.remote_local_id ? String(local.remote_local_id) : null,
      apiRemoteClientId: remoteClientId,
      apiRemoteLocalDesignation: local.remote_designation || local.nom || 'Local technique',
      apiRemoteTrameId: local.remote_trame_id || null,
      apiRemoteTrameNom: local.remote_trame_nom || null,
    });
  };

  const creerLocal = async () => {
    const nom = String(nouveauNom || '').trim();
    if (!nom || creationEnCours) return;
    setCreationEnCours(true);
    try {
      const db = await getDb();
      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO installations(id,site_id,type_code,nom,actif)
         VALUES(?,?,'installation_technique',?,1)`,
        [id, String(siteId), nom]
      );
      setNouveauNom('');
      setCreationVisible(false);
      await charger();
    } catch (error) {
      Alert.alert('Création impossible', String(error?.message || error));
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirVisitesNonRattachees = () => navigation.navigate('SiteVisites', {
    siteId,
    nomSite,
    clientId,
    nomClient,
    nomLocal: 'Visites non rattachées',
    legacyOnly: true,
  });

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: 96 }]}
      data={locaux}
      keyExtractor={(item) => item.installation_id}
      initialNumToRender={14}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={24}
      windowSize={7}
      removeClippedSubviews={false}
      ListHeaderComponent={<View>
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionLabel}>Site</Text>
          <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 18 }}>{nomSite || 'Site'}</Text>
          {nomClient ? <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 3 }}>{nomClient}</Text> : null}
        </View>

        <View style={{ padding: 13, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', marginBottom: 15 }}>
          <Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 13 }}>Choisis un local</Text>
          <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>Chaque local possède son propre historique. Une nouvelle visite créée ensuite reste rattachée uniquement à ce local.</Text>
        </View>

        {legacyCount > 0 ? <TouchableOpacity onPress={ouvrirVisitesNonRattachees} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E7C77A', backgroundColor: '#FFF8E7', marginBottom: 14 }}>
          <Text style={{ color: '#7A5700', fontWeight: '900', fontSize: 12 }}>{legacyCount} ancienne{legacyCount > 1 ? 's' : ''} visite{legacyCount > 1 ? 's' : ''} sans local</Text>
          <Text style={{ color: '#7A5700', fontSize: 11, marginTop: 3 }}>Elles restent accessibles sans être attribuées automatiquement à un mauvais local. ›</Text>
        </TouchableOpacity> : null}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Locaux</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12 }}>{locaux.length}</Text>
        </View>
      </View>}
      renderItem={({ item }) => {
        const label = item.nom || item.remote_designation || 'Local technique';
        const visitCount = Number(item.visit_count || 0);
        return <TouchableOpacity style={styles.card} activeOpacity={0.72} onPress={() => ouvrirLocal(item)}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
            <Text style={{ fontSize: 20 }}>▣</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{label}</Text>
            <Text style={styles.cardSub}>
              {visitCount ? `${visitCount} visite${visitCount > 1 ? 's' : ''}${item.latest_visit_date ? ` · dernière ${String(item.latest_visit_date).slice(0, 10)}` : ''}` : 'Aucune visite'}
            </Text>
            {item.remote_trame_nom ? <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>Trame Intranet · {item.remote_trame_nom}</Text> : null}
          </View>
          {item.remote_local_id ? <View style={[styles.badge, styles.badgeActif]}><Text style={[styles.badgeText, styles.badgeTextActif]}>Intranet</Text></View> : null}
          <Text style={{ color: '#98A2B3', fontSize: 24, marginLeft: 8 }}>›</Text>
        </TouchableOpacity>;
      }}
      ListEmptyComponent={loading
        ? <View style={{ paddingVertical: 36 }}><ActivityIndicator color={COLORS.orange} /></View>
        : <View style={styles.empty}><Text style={styles.emptyText}>Aucun local sur ce site.</Text><Text style={styles.emptySub}>Crée un local METRA ou utilise « Locaux Intranet » depuis la fiche du site.</Text></View>}
    />

    <View style={styles.fabBar}>
      <TouchableOpacity style={[styles.btnPrimary, styles.fabButton]} onPress={() => setCreationVisible(true)}>
        <Text style={styles.btnPrimaryText}>+ Nouveau local</Text>
      </TouchableOpacity>
    </View>

    <Modal visible={creationVisible} transparent animationType="fade" onRequestClose={() => !creationEnCours && setCreationVisible(false)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Nouveau local METRA</Text>
        <Text style={{ color: COLORS.muted, fontSize: 11.5, marginBottom: 11 }}>Le local est créé uniquement dans METRA. La création d'un local Intranet reste gérée par l'écran « Locaux Intranet » existant.</Text>
        <TextInput autoFocus style={styles.input} placeholder="Ex. Chaufferie, SST 1, Local VMC…" value={nouveauNom} onChangeText={setNouveauNom} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} disabled={creationEnCours} onPress={() => setCreationVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} disabled={!nouveauNom.trim() || creationEnCours} onPress={creerLocal}><Text style={styles.btnPrimaryText}>{creationEnCours ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

export { SiteLocalsScreen };

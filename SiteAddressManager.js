/** Gestion rapide des adresses de sites : édition, géocodage et import Excel. */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import * as XLSX from 'xlsx';
import { COLORS, styles } from './styles.js';
import { coordonneeValide } from './siteGeoDb.js';
import { modifierSiteRapide, preparerImportSites, appliquerImportSites } from './siteBulkDb.js';

function normaliserCle(v = '') {
  return String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function valeurColonne(row, alias) {
  const entries = Object.entries(row || {});
  for (const a of alias) {
    const trouve = entries.find(([k]) => normaliserCle(k) === normaliserCle(a));
    if (trouve) return trouve[1];
  }
  return '';
}
function texte(v) { return String(v ?? '').trim(); }
function adresseComposee(row) {
  const adresse = texte(valeurColonne(row, ['Adresse', 'Adresse site', 'Rue', 'Address']));
  const cp = texte(valeurColonne(row, ['Code postal', 'CP', 'Postal code']));
  const ville = texte(valeurColonne(row, ['Ville', 'Commune', 'City']));
  if (adresse && (cp || ville)) return [adresse, cp, ville].filter(Boolean).join(', ');
  return adresse || [cp, ville].filter(Boolean).join(' ');
}
function convertirLigne(row) {
  return {
    nomSite: texte(valeurColonne(row, ['Site', 'Nom site', 'Nom du site', 'Site name', 'Nom'])),
    adresse: adresseComposee(row),
    latitude: valeurColonne(row, ['Latitude', 'Lat']),
    longitude: valeurColonne(row, ['Longitude', 'Lng', 'Lon', 'Long']),
    note: texte(valeurColonne(row, ['Note acces', 'Note accès', 'Acces', 'Accès', 'Localisation', 'Localisation note', 'Note'])),
  };
}
async function autoriserGeocodage() {
  const p = await Location.requestForegroundPermissionsAsync();
  if (!p.granted) throw new Error('Autorisation de localisation refusée');
}
async function geocoderAdresse(adresse) {
  if (!texte(adresse)) throw new Error('Adresse manquante');
  const resultats = await Location.geocodeAsync(texte(adresse));
  const p = resultats?.[0];
  if (!p || !coordonneeValide(p.latitude, p.longitude)) throw new Error('Adresse non localisée');
  return { latitude: p.latitude, longitude: p.longitude };
}
const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function SiteAddressManager({ visible, clientId, sites = [], onClose, onChanged }) {
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [apercu, setApercu] = useState([]);

  const stats = useMemo(() => ({
    sansAdresse: sites.filter((s) => !texte(s.adresse)).length,
    sansGps: sites.filter((s) => !coordonneeValide(s.latitude, s.longitude)).length,
  }), [sites]);

  const draft = (site) => edits[site.id] || { adresse: site.adresse || '', note: site.localisation_note || '' };
  const changer = (site, patch) => setEdits((prev) => ({ ...prev, [site.id]: { ...draft(site), ...patch } }));

  const sauver = async (site) => {
    try {
      setBusy(true);
      const d = draft(site);
      await modifierSiteRapide(site.id, { adresse: d.adresse, note: d.note });
      setEdits((prev) => { const n = { ...prev }; delete n[site.id]; return n; });
      await onChanged?.();
      setMessage(`${site.nom_site} enregistré`);
    } catch (e) { Alert.alert('Erreur', e.message || 'Impossible de modifier le site.'); }
    finally { setBusy(false); }
  };

  const geocoderUn = async (site) => {
    try {
      setBusy(true);
      await autoriserGeocodage();
      const d = draft(site);
      if (d.adresse !== (site.adresse || '')) await modifierSiteRapide(site.id, { adresse: d.adresse, note: d.note });
      const gps = await geocoderAdresse(d.adresse);
      await modifierSiteRapide(site.id, gps);
      setEdits((prev) => { const n = { ...prev }; delete n[site.id]; return n; });
      await onChanged?.();
      setMessage(`${site.nom_site} positionné`);
    } catch (e) { Alert.alert('Géocodage impossible', e.message || 'Adresse non localisée.'); }
    finally { setBusy(false); }
  };

  const geocoderTous = async () => {
    const cibles = sites.filter((s) => !coordonneeValide(s.latitude, s.longitude) && texte((edits[s.id]?.adresse ?? s.adresse)));
    if (!cibles.length) { Alert.alert('Rien à faire', 'Tous les sites ayant une adresse possèdent déjà un point GPS.'); return; }
    try {
      setBusy(true); setMessage(`Géocodage 0/${cibles.length}`);
      await autoriserGeocodage();
      let ok = 0, erreurs = 0;
      for (let i = 0; i < cibles.length; i += 1) {
        const site = cibles[i];
        const d = draft(site);
        try {
          if (d.adresse !== (site.adresse || '')) await modifierSiteRapide(site.id, { adresse: d.adresse, note: d.note });
          const gps = await geocoderAdresse(d.adresse);
          await modifierSiteRapide(site.id, gps);
          ok += 1;
        } catch { erreurs += 1; }
        setMessage(`Géocodage ${i + 1}/${cibles.length}`);
        if (i < cibles.length - 1) await attendre(180);
      }
      setEdits({});
      await onChanged?.();
      setMessage(`${ok} site${ok > 1 ? 's' : ''} positionné${ok > 1 ? 's' : ''}${erreurs ? ` · ${erreurs} à vérifier` : ''}`);
    } catch (e) { Alert.alert('Erreur', e.message || 'Géocodage interrompu.'); }
    finally { setBusy(false); }
  };

  const importerExcel = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pick.canceled) return;
      setBusy(true); setMessage('Lecture du fichier…');
      const uri = pick.assets?.[0]?.uri;
      if (!uri) throw new Error('Fichier inaccessible');
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(base64, { type: 'base64' });
      const nomFeuille = wb.SheetNames?.[0];
      if (!nomFeuille) throw new Error('Aucune feuille trouvée');
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { defval: '', raw: false });
      if (!rows.length) throw new Error('La première feuille est vide');
      const lignes = rows.map(convertirLigne).filter((l) => l.nomSite || l.adresse || l.latitude || l.longitude);
      const preview = await preparerImportSites(clientId, lignes);
      setApercu(preview);
      const nbCreate = preview.filter((x) => x.action === 'creer').length;
      const nbUpdate = preview.filter((x) => x.action === 'modifier').length;
      const nbErr = preview.filter((x) => x.action === 'erreur').length;
      setMessage(`${preview.length} lignes · ${nbCreate} nouveaux · ${nbUpdate} modifications${nbErr ? ` · ${nbErr} erreurs` : ''}`);
    } catch (e) { Alert.alert('Import impossible', e.message || 'Le fichier Excel ne peut pas être lu.'); }
    finally { setBusy(false); }
  };

  const appliquer = async () => {
    if (!apercu.length) return;
    try {
      setBusy(true);
      const r = await appliquerImportSites(clientId, apercu);
      setApercu([]); setEdits({});
      await onChanged?.();
      setMessage(`${r.crees} créé${r.crees > 1 ? 's' : ''} · ${r.modifies} modifié${r.modifies > 1 ? 's' : ''}`);
    } catch (e) { Alert.alert('Import impossible', e.message || "Les changements n'ont pas pu être appliqués."); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E3E5E8' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800' }}>Gérer les sites</Text>
              <Text style={{ color: COLORS.muted, marginTop: 3 }}>{sites.length} sites · {stats.sansAdresse} sans adresse · {stats.sansGps} sans GPS</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 10 }}><Text style={{ fontSize: 18 }}>✕</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={styles.btnSecondary} disabled={busy} onPress={importerExcel}><Text style={styles.btnSecondaryText}>📄 Importer Excel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} disabled={busy} onPress={geocoderTous}><Text style={styles.btnSecondaryText}>📍 Localiser sans GPS</Text></TouchableOpacity>
          </View>
          {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><ActivityIndicator /><Text style={{ color: COLORS.muted }}>{message || 'Traitement…'}</Text></View> : message ? <Text style={{ color: COLORS.muted, marginTop: 10 }}>{message}</Text> : null}
        </View>

        {apercu.length ? (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.sectionLabel}>Aperçu avant import</Text>
            {apercu.map((x, i) => (
              <View key={`${x.nomSite || 'ligne'}-${i}`} style={[styles.card, { marginBottom: 8, alignItems: 'flex-start' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{x.nomSite || `Ligne ${i + 1}`}</Text>
                  {x.adresse ? <Text style={styles.cardSub}>{x.adresse}</Text> : null}
                  <Text style={{ marginTop: 5, fontSize: 12, fontWeight: '700', color: x.action === 'erreur' ? '#B42318' : x.action === 'creer' ? '#18794E' : COLORS.primary }}>
                    {x.action === 'creer' ? 'NOUVEAU SITE' : x.action === 'modifier' ? `MODIFIER ${x.changements?.join(', ') || ''}` : x.action === 'identique' ? 'AUCUN CHANGEMENT' : `ERREUR · ${x.erreur}`}
                  </Text>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} disabled={busy} onPress={() => setApercu([])}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} disabled={busy} onPress={appliquer}><Text style={styles.btnPrimaryText}>Appliquer</Text></TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.sectionLabel}>Modification rapide</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 12 }}>Modifie une adresse, enregistre-la ou utilise 📍 pour calculer son point GPS.</Text>
            {sites.map((site) => {
              const d = draft(site);
              const hasGps = coordonneeValide(site.latitude, site.longitude);
              return (
                <View key={site.id} style={[styles.card, { marginBottom: 10, alignItems: 'stretch', flexDirection: 'column' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{site.nom_site}</Text></View>
                    <Text style={{ fontSize: 11, color: hasGps ? '#18794E' : '#A26A00', fontWeight: '700' }}>{hasGps ? '● GPS' : '○ SANS GPS'}</Text>
                  </View>
                  <TextInput style={[styles.input, { marginTop: 10 }]} value={d.adresse} placeholder="Adresse complète" onChangeText={(v) => changer(site, { adresse: v })} />
                  <TextInput style={[styles.input, { marginTop: 8 }]} value={d.note} placeholder="Note d'accès / localisation technique" onChangeText={(v) => changer(site, { note: v })} />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} disabled={busy || !texte(d.adresse)} onPress={() => geocoderUn(site)}><Text style={styles.btnSecondaryText}>📍 Localiser</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} disabled={busy} onPress={() => sauver(site)}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export { SiteAddressManager };

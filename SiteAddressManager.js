/** Gestion des adresses de sites : saisie postale, import Excel et positionnement silencieux. */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { COLORS, styles } from './styles.js';
import { synchroniserCoordonneesClient, synchroniserCoordonneesSite } from './siteGeoDb.js';
import { modifierSiteRapide, preparerImportSites, appliquerImportSites } from './siteBulkDb.js';

function texte(v) { return String(v ?? '').trim(); }
function normaliserCle(v = '') {
  return texte(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function valeurColonne(row, alias) {
  const entries = Object.entries(row || {});
  for (const a of alias) {
    const trouve = entries.find(([k]) => normaliserCle(k) === normaliserCle(a));
    if (trouve) return trouve[1];
  }
  return '';
}

function decomposerAdresse(adresse = '') {
  const brut = texte(adresse);
  if (!brut) return { numero: '', voie: '', complement: '', codePostal: '', ville: '', ancienne: '' };
  const parts = brut.split(',').map(texte).filter(Boolean);
  const rue = parts.shift() || '';
  const fin = parts.length ? parts.pop() : '';
  const mRue = rue.match(/^([0-9]+(?:\s*(?:bis|ter|quater|[A-Za-z]))?)\s+(.+)$/i);
  const mVille = fin.match(/^(\d{5})\s+(.+)$/);
  return {
    numero: mRue ? mRue[1] : '',
    voie: mRue ? mRue[2] : rue,
    complement: parts.join(', '),
    codePostal: mVille ? mVille[1] : '',
    ville: mVille ? mVille[2] : (parts.length || !fin ? '' : fin),
    ancienne: brut,
  };
}

function composerAdresse(d = {}) {
  const rue = [texte(d.numero), texte(d.voie)].filter(Boolean).join(' ');
  const cpVille = [texte(d.codePostal), texte(d.ville)].filter(Boolean).join(' ');
  return [rue, texte(d.complement), cpVille].filter(Boolean).join(', ');
}

function adresseDepuisLigne(row) {
  const adresseComplete = texte(valeurColonne(row, ['Adresse', 'Adresse site', 'Address']));
  if (adresseComplete) return adresseComplete;
  return composerAdresse({
    numero: valeurColonne(row, ['Numero', 'Numéro', 'N°', 'No']),
    voie: valeurColonne(row, ['Rue', 'Voie', 'Nom de voie']),
    complement: valeurColonne(row, ['Complement', 'Complément', 'Batiment', 'Bâtiment', 'Entrée']),
    codePostal: valeurColonne(row, ['Code postal', 'CP', 'Postal code']),
    ville: valeurColonne(row, ['Ville', 'Commune', 'City']),
  });
}

function convertirLigne(row) {
  return {
    nomSite: texte(valeurColonne(row, ['Site', 'Nom site', 'Nom du site', 'Site name', 'Nom'])),
    adresse: adresseDepuisLigne(row),
    note: texte(valeurColonne(row, ['Note acces', 'Note accès', 'Acces', 'Accès', 'Localisation', 'Note'])),
  };
}

/** Lecture compatible Snack/Expo Go : évite expo-file-system. */
async function lireFichierTableur(uri) {
  if (!uri) throw new Error('Fichier inaccessible');
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Impossible de lire le fichier sélectionné');
  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) throw new Error('Le fichier sélectionné est vide');
  return XLSX.read(buffer, { type: 'array' });
}

function SiteAddressManager({ visible, clientId, sites = [], onClose, onChanged }) {
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [apercu, setApercu] = useState([]);

  const stats = useMemo(() => ({
    avecAdresse: sites.filter((s) => texte(s.adresse)).length,
    sansAdresse: sites.filter((s) => !texte(s.adresse)).length,
  }), [sites]);

  const draft = (site) => edits[site.id] || { ...decomposerAdresse(site.adresse), note: site.localisation_note || '' };
  const changer = (site, patch) => setEdits((prev) => ({ ...prev, [site.id]: { ...draft(site), ...patch } }));

  const sauver = async (site) => {
    try {
      setBusy(true);
      const d = draft(site);
      const adresse = composerAdresse(d);
      const adresseChangee = adresse !== texte(site.adresse);
      const patch = { note: d.note };
      if (adresseChangee) patch.adresse = adresse;
      await modifierSiteRapide(site.id, patch);
      setEdits((prev) => { const n = { ...prev }; delete n[site.id]; return n; });
      await onChanged?.();
      setMessage(`${site.nom_site} enregistré`);
      // Best effort : ne bloque jamais la saisie terrain si la tablette est hors connexion.
      // Si seule la note change, on conserve la position déjà mise en cache.
      if (adresseChangee && adresse) synchroniserCoordonneesSite(site.id, adresse).then(() => onChanged?.()).catch(() => {});
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de modifier le site.');
    } finally {
      setBusy(false);
    }
  };

  const importerExcel = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pick.canceled) return;
      setBusy(true);
      setMessage('Lecture du fichier…');
      const wb = await lireFichierTableur(pick.assets?.[0]?.uri);
      const nomFeuille = wb.SheetNames?.[0];
      if (!nomFeuille) throw new Error('Aucune feuille trouvée');
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { defval: '', raw: false });
      if (!rows.length) throw new Error('La première feuille est vide');
      const lignes = rows.map(convertirLigne).filter((l) => l.nomSite || l.adresse);
      const preview = await preparerImportSites(clientId, lignes);
      setApercu(preview);
      const nbCreate = preview.filter((x) => x.action === 'creer').length;
      const nbUpdate = preview.filter((x) => x.action === 'modifier').length;
      const nbErr = preview.filter((x) => x.action === 'erreur').length;
      setMessage(`${preview.length} lignes · ${nbCreate} nouveaux · ${nbUpdate} modifications${nbErr ? ` · ${nbErr} erreurs` : ''}`);
    } catch (e) {
      Alert.alert('Import impossible', e.message || 'Le fichier Excel ne peut pas être lu.');
    } finally {
      setBusy(false);
    }
  };

  const appliquer = async () => {
    if (!apercu.length) return;
    try {
      setBusy(true);
      const r = await appliquerImportSites(clientId, apercu);
      setApercu([]);
      setEdits({});
      await onChanged?.();
      setMessage(`${r.crees} créé${r.crees > 1 ? 's' : ''} · ${r.modifies} modifié${r.modifies > 1 ? 's' : ''}`);
      synchroniserCoordonneesClient(clientId).then(() => onChanged?.()).catch(() => {});
    } catch (e) {
      Alert.alert('Import impossible', e.message || "Les changements n'ont pas pu être appliqués.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E3E5E8' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800' }}>Adresses des sites</Text>
              <Text style={{ color: COLORS.muted, marginTop: 3 }}>{sites.length} sites · {stats.avecAdresse} renseignés · {stats.sansAdresse} à compléter</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 10 }}><Text style={{ fontSize: 18 }}>✕</Text></TouchableOpacity>
          </View>
          <Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 8 }}>
            METRA calcule la position à partir de l’adresse quand une connexion est disponible. Aucune position de la tablette n’est demandée.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={styles.btnSecondary} disabled={busy} onPress={importerExcel}><Text style={styles.btnSecondaryText}>📄 Importer Excel</Text></TouchableOpacity>
          </View>
          {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><ActivityIndicator /><Text style={{ color: COLORS.muted }}>{message || 'Traitement…'}</Text></View> : message ? <Text style={{ color: COLORS.muted, marginTop: 10 }}>{message}</Text> : null}
        </View>

        {apercu.length ? (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.sectionLabel}>Aperçu avant import</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11.5, marginBottom: 10 }}>Colonnes reconnues : Site, Numéro, Rue/Voie, Complément, Code postal, Ville, Note d’accès — ou une colonne Adresse complète.</Text>
            {apercu.map((x, i) => (
              <View key={`${x.nomSite || 'ligne'}-${i}`} style={[styles.card, { marginBottom: 8, alignItems: 'flex-start' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{x.nomSite || `Ligne ${i + 1}`}</Text>
                  {x.adresse ? <Text style={styles.cardSub}>{x.adresse}</Text> : <Text style={{ color: '#A26A00', fontSize: 12 }}>Adresse manquante</Text>}
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
            {sites.map((site) => {
              const d = draft(site);
              return (
                <View key={site.id} style={[styles.card, { marginBottom: 10, alignItems: 'stretch', flexDirection: 'column' }]}>
                  <Text style={styles.cardTitle}>{site.nom_site}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TextInput style={[styles.input, { width: 84 }]} value={d.numero} placeholder="N°" keyboardType="numbers-and-punctuation" onChangeText={(v) => changer(site, { numero: v })} />
                    <TextInput style={[styles.input, { flex: 1 }]} value={d.voie} placeholder="Rue / avenue / voie" onChangeText={(v) => changer(site, { voie: v })} />
                  </View>
                  <TextInput style={[styles.input, { marginTop: 8 }]} value={d.complement} placeholder="Complément : bâtiment, entrée…" onChangeText={(v) => changer(site, { complement: v })} />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput style={[styles.input, { width: 120 }]} value={d.codePostal} placeholder="Code postal" keyboardType="number-pad" maxLength={5} onChangeText={(v) => changer(site, { codePostal: v.replace(/\D/g, '').slice(0, 5) })} />
                    <TextInput style={[styles.input, { flex: 1 }]} value={d.ville} placeholder="Ville" onChangeText={(v) => changer(site, { ville: v })} />
                  </View>
                  <TextInput style={[styles.input, { marginTop: 8 }]} value={d.note} placeholder="Note d’accès / bâtiment / digicode…" onChangeText={(v) => changer(site, { note: v })} />
                  <TouchableOpacity style={[styles.btnPrimary, { marginTop: 10 }]} disabled={busy} onPress={() => sauver(site)}><Text style={styles.btnPrimaryText}>Enregistrer l’adresse</Text></TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export { SiteAddressManager, composerAdresse, decomposerAdresse };

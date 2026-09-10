from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def write(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')
    print('wrote', rel)

def replace(rel, old, new):
    p = ROOT / rel
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing replacement in {rel}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')
    print('patched', rel)

binding = r'''import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function parseJson(value) { try { return JSON.parse(value || 'null'); } catch { return null; } }
function unique(rows) { return rows.length === 1 ? rows[0] : null; }

async function loadVisit(db, visiteId) {
  return db.getFirstAsync(`SELECT v.*,s.client_id,s.nom_site,c.nom AS nom_client,c.code_exploitant AS client_code
    FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.id=?`, [String(visiteId)]);
}

function compatibleLocal(local, trameId) {
  const mapped = mapRemoteTrameToLocal({ id: local.remote_trame_id, nom: local.remote_trame_nom });
  return !mapped || mapped === trameId;
}

export async function getVisitIntranetBindingOptions(visiteId, { remoteClientId = null, remoteSiteId = null } = {}) {
  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');

  const clients = await db.getAllAsync(`SELECT remote_client_id,local_client_id,nom,code_everwin,ville,agence_libelle
    FROM api_client_links WHERE autorise=1 ORDER BY nom,remote_client_id`);
  const requestedClient = clean(remoteClientId);
  const visitClient = clean(visite.api_remote_client_id);
  let selectedClientId = clients.some((row) => clean(row.remote_client_id) === requestedClient) ? requestedClient : null;
  if (!selectedClientId && clients.some((row) => clean(row.remote_client_id) === visitClient)) selectedClientId = visitClient;
  if (!selectedClientId) {
    const linked = clients.filter((row) => clean(row.local_client_id) === clean(visite.client_id));
    selectedClientId = clean(unique(linked)?.remote_client_id) || null;
  }
  if (!selectedClientId && clean(visite.client_code)) {
    const byCode = clients.filter((row) => normalize(row.code_everwin) === normalize(visite.client_code));
    selectedClientId = clean(unique(byCode)?.remote_client_id) || null;
  }
  if (!selectedClientId) {
    const byName = clients.filter((row) => normalize(row.nom) === normalize(visite.nom_client));
    selectedClientId = clean(unique(byName)?.remote_client_id) || null;
  }
  if (!selectedClientId && clients.length === 1) selectedClientId = clean(clients[0].remote_client_id);

  let sites = [];
  let selectedSiteId = null;
  if (selectedClientId) {
    sites = await db.getAllAsync(`SELECT s.remote_site_id,cs.remote_client_id,COALESCE(s.local_site_id,cs.local_site_id) AS local_site_id,s.nom,s.synced_at
      FROM api_client_site_links cs JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
      WHERE cs.remote_client_id=? AND cs.remote_present=1 AND s.remote_present=1 ORDER BY s.nom,s.remote_site_id`, [selectedClientId]);
    const requestedSite = clean(remoteSiteId);
    if (sites.some((row) => clean(row.remote_site_id) === requestedSite)) selectedSiteId = requestedSite;
    if (!selectedSiteId) {
      const linkedSites = sites.filter((row) => clean(row.local_site_id) === clean(visite.site_id));
      selectedSiteId = clean(unique(linkedSites)?.remote_site_id) || null;
    }
    if (!selectedSiteId) {
      const byName = sites.filter((row) => normalize(row.nom) === normalize(visite.nom_site));
      selectedSiteId = clean(unique(byName)?.remote_site_id) || null;
    }
    if (!selectedSiteId && sites.length === 1) selectedSiteId = clean(sites[0].remote_site_id);
  }

  let locals = [];
  let suggestedLocalId = null;
  if (selectedSiteId) {
    locals = await db.getAllAsync(`SELECT remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,
        derniere_visite_id,derniere_visite_date,criteria_count,material_count,reference_json
      FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation,remote_local_id`, [selectedSiteId]);
    const visitLocal = clean(visite.api_remote_local_id);
    if (locals.some((row) => clean(row.remote_local_id) === visitLocal)) suggestedLocalId = visitLocal;
    if (!suggestedLocalId && clean(visite.installation_id)) {
      const linkedLocals = locals.filter((row) => clean(row.local_installation_id) === clean(visite.installation_id));
      suggestedLocalId = clean(unique(linkedLocals)?.remote_local_id) || null;
    }
    if (!suggestedLocalId) {
      const compatible = locals.filter((row) => compatibleLocal(row, visite.trame_id));
      suggestedLocalId = clean(unique(compatible)?.remote_local_id) || null;
    }
    if (!suggestedLocalId && locals.length === 1) suggestedLocalId = clean(locals[0].remote_local_id);
  }

  return {
    visite: {
      id: visite.id,
      trameId: visite.trame_id,
      nomClient: visite.nom_client,
      nomSite: visite.nom_site,
      clientCode: visite.client_code || null,
      apiRemoteClientId: visite.api_remote_client_id || null,
      apiRemoteLocalId: visite.api_remote_local_id || null,
    },
    clients,
    sites,
    locals: locals.map((row) => ({ ...row, compatible: compatibleLocal(row, visite.trame_id) })),
    selectedClientId,
    selectedSiteId,
    suggestedLocalId,
  };
}

export async function bindVisitToIntranetTarget(visiteId, { remoteClientId, remoteSiteId, remoteLocalId } = {}) {
  const clientId = clean(remoteClientId);
  const siteId = clean(remoteSiteId);
  const localId = clean(remoteLocalId);
  if (!clientId || !siteId || !localId) throw new Error('Choisis le client, le site et le local Intranet avant de continuer.');

  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');
  const queued = await db.getFirstAsync(`SELECT status FROM api_visit_outbox WHERE visite_id=?`, [String(visiteId)]);
  if (queued) throw new Error('Cette visite possède déjà un envoi Intranet. La destination ne peut plus être changée pour cet envoi.');

  const client = await db.getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=? AND autorise=1`, [clientId]);
  if (!client) throw new Error('Client introuvable dans les clients Intranet autorisés sur cette tablette. Actualise la connexion Intranet.');
  const site = await db.getFirstAsync(`SELECT s.*,cs.local_site_id AS relation_local_site_id FROM api_client_site_links cs
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    WHERE cs.remote_client_id=? AND cs.remote_site_id=? AND cs.remote_present=1 AND s.remote_present=1`, [clientId, siteId]);
  if (!site) throw new Error('Site introuvable pour ce client dans la préparation Intranet. Actualise le client ou choisis un autre site.');
  const local = await db.getFirstAsync(`SELECT * FROM api_local_links WHERE remote_local_id=? AND remote_site_id=? AND remote_present=1`, [localId, siteId]);
  if (!local) throw new Error('Local introuvable sur ce site dans la préparation Intranet. Actualise les données du client.');

  const reference = parseJson(local.reference_json);
  if (!reference?.local?.id || !reference?.site?.id || !reference?.trame?.id) {
    throw new Error('Référence de préparation Intranet incomplète pour ce local. Actualise les données avant l’envoi.');
  }
  if (clean(reference.site.id) !== siteId || clean(reference.local.id) !== localId) {
    throw new Error('La référence Intranet du local ne correspond plus au site sélectionné. Actualise la préparation.');
  }
  const mappedTrame = mapRemoteTrameToLocal(reference.trame);
  if (mappedTrame && mappedTrame !== visite.trame_id) {
    throw new Error(`Trame incompatible : la visite METRA utilise « ${visite.trame_id} » et le local Intranet utilise « ${reference.trame.nom || reference.trame.id} ».`);
  }
  const categories = Array.isArray(reference?.trame?.categories) ? reference.trame.categories : [];
  if (!categories.length) throw new Error('La trame Intranet de ce local ne contient aucun critère de préparation. Actualise les données du client.');

  const existingProvenances = await db.getAllAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [String(visiteId)]);
  for (const row of existingProvenances) {
    const details = parseJson(row.details_json);
    if (details?.sourceType === 'imported_latest_visit') throw new Error('Une visite historique Intranet ne peut pas être réutilisée comme nouvelle visite.');
  }

  const details = {
    ...reference,
    schemaVersion: 4,
    sourceType: 'upload_binding',
    remoteLocalId: localId,
    binding: { remoteClientId: clientId, remoteSiteId: siteId, remoteLocalId: localId, boundAt: new Date().toISOString() },
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE visites SET api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?`,
      [clientId, localId, clean(reference.trame.id), clean(reference?.derniereVisite?.id) || null, String(visiteId)]);
    await db.runAsync(`UPDATE api_client_links SET local_client_id=COALESCE(local_client_id,?) WHERE remote_client_id=?`, [visite.client_id, clientId]);
    await db.runAsync(`UPDATE api_site_links SET local_site_id=COALESCE(local_site_id,?) WHERE remote_site_id=?`, [visite.site_id, siteId]);
    await db.runAsync(`UPDATE api_client_site_links SET local_site_id=COALESCE(local_site_id,?) WHERE remote_client_id=? AND remote_site_id=?`, [visite.site_id, clientId, siteId]);
    if (clean(visite.installation_id)) {
      await db.runAsync(`UPDATE api_local_links SET local_installation_id=COALESCE(local_installation_id,?) WHERE remote_local_id=?`, [visite.installation_id, localId]);
    }
    await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)`,
      [createId(), 'visite', String(visiteId), 'api_symfony', localId, JSON.stringify(details)]);
  });

  return {
    remoteClientId: clientId,
    remoteSiteId: siteId,
    remoteLocalId: localId,
    clientName: client.nom,
    siteName: site.nom,
    localName: local.designation || reference?.local?.designation || `Local ${localId}`,
    trameName: reference?.trame?.nom || null,
  };
}
'''
write('intranetVisitBindingDb.js', binding)

picker = r'''import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { bindVisitToIntranetTarget, getVisitIntranetBindingOptions } from './intranetVisitBindingDb.js';
import { syncAuthorizedClients, syncClientPreparation } from './symfonyApi.js';

function OptionRow({ selected, disabled = false, title, subtitle, onPress }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={{
    minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: selected ? COLORS.primary : COLORS.line,
    backgroundColor: selected ? '#FFF3E8' : '#FFFFFF', paddingHorizontal: 11, paddingVertical: 9, marginBottom: 7, opacity: disabled ? 0.45 : 1,
  }}>
    <Text style={{ color: selected ? COLORS.primary : COLORS.ink, fontSize: 12.5, fontWeight: '900' }}>{selected ? '✓ ' : ''}{title}</Text>
    {subtitle ? <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 2 }}>{subtitle}</Text> : null}
  </TouchableOpacity>;
}

export function IntranetVisitDestinationPicker({ visible, visiteId, onClose, onBound }) {
  const [options, setOptions] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [localId, setLocalId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const apply = (data, requestedClient = null, requestedSite = null) => {
    const nextClient = requestedClient || data.selectedClientId || null;
    const nextSite = requestedSite || data.selectedSiteId || null;
    setOptions(data);
    setClientId(nextClient);
    setSiteId(nextSite);
    setLocalId(data.suggestedLocalId || null);
  };

  const load = async (requestedClient = null, requestedSite = null) => {
    setBusy(true);
    setError(null);
    try {
      const data = await getVisitIntranetBindingOptions(visiteId, { remoteClientId: requestedClient, remoteSiteId: requestedSite });
      apply(data, requestedClient, requestedSite);
      return data;
    } catch (e) {
      setError(String(e?.message || e));
      return null;
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!visible) return;
    setOptions(null); setClientId(null); setSiteId(null); setLocalId(null); setError(null);
    load().catch(() => {});
  }, [visible, visiteId]);

  const chooseClient = async (id) => {
    const value = String(id);
    setClientId(value); setSiteId(null); setLocalId(null);
    await load(value, null);
  };
  const chooseSite = async (id) => {
    const value = String(id);
    setSiteId(value); setLocalId(null);
    await load(clientId, value);
  };

  const refreshRemote = async () => {
    if (refreshing) return;
    setRefreshing(true); setError(null);
    try {
      await syncAuthorizedClients();
      if (clientId) await syncClientPreparation(clientId);
      await load(clientId, siteId);
    } catch (e) {
      setError(`Réponse Intranet : ${String(e?.message || e)}`);
    } finally { setRefreshing(false); }
  };

  const bind = async () => {
    if (busy || !clientId || !siteId || !localId) return;
    setBusy(true); setError(null);
    try {
      const target = await bindVisitToIntranetTarget(visiteId, { remoteClientId: clientId, remoteSiteId: siteId, remoteLocalId: localId });
      Alert.alert('Destination Intranet associée', `${target.clientName} · ${target.siteName} · ${target.localName}\n\nLa visite peut maintenant être envoyée. L’Intranet confirmera ensuite le succès ou renverra son erreur.`);
      await onBound?.(target);
    } catch (e) {
      setError(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const clients = options?.clients || [];
  const sites = options?.sites || [];
  const locals = options?.locals || [];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '90%', maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }}>DESTINATION INTRANET</Text>
          <Text style={[styles.modalTitle, { marginTop: 4 }]}>Associer cette visite avant l’envoi</Text>
          <Text style={[styles.cardSub, { lineHeight: 17 }]}>La visite peut avoir été créée normalement dans METRA. Elle n’a pas besoin d’avoir été ouverte depuis « Préparer ».</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.muted, fontSize: 19 }}>✕</Text></TouchableOpacity>
      </View>

      <TouchableOpacity accessibilityRole="button" disabled={refreshing || busy} onPress={refreshRemote} style={[styles.btnSecondary, { minHeight: 44, marginTop: 11, marginBottom: 8 }]}>
        <Text style={styles.btnSecondaryText}>{refreshing ? 'Actualisation Intranet…' : clientId ? '↻ Actualiser clients, sites et locaux' : '↻ Actualiser les clients Intranet'}</Text>
      </TouchableOpacity>
      {error ? <View style={{ backgroundColor: '#FFF1F0', borderWidth: 1, borderColor: '#F7C7C3', borderRadius: 10, padding: 9, marginBottom: 8 }}><Text style={{ color: '#B42318', fontSize: 11.5, lineHeight: 16, fontWeight: '700' }}>{error}</Text></View> : null}
      {busy && !options ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.primary} /><Text style={{ color: COLORS.muted, marginTop: 8 }}>Lecture des correspondances Intranet…</Text></View> : <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 6, marginBottom: 6 }}>1 · Client Intranet</Text>
        {clients.length ? clients.map((row) => <OptionRow key={row.remote_client_id} selected={String(row.remote_client_id) === String(clientId)} title={row.nom || `Client ${row.remote_client_id}`} subtitle={[row.code_everwin, row.ville, `ID ${row.remote_client_id}`].filter(Boolean).join(' · ')} onPress={() => chooseClient(row.remote_client_id)} />) : <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>Aucun client autorisé en cache. Actualise l’Intranet ou vérifie l’activation de la tablette.</Text>}

        {clientId ? <><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 6 }}>2 · Site Intranet</Text>
          {sites.length ? sites.map((row) => <OptionRow key={row.remote_site_id} selected={String(row.remote_site_id) === String(siteId)} title={row.nom || `Site ${row.remote_site_id}`} subtitle={`ID ${row.remote_site_id}${row.local_site_id ? ' · déjà relié à METRA' : ''}`} onPress={() => chooseSite(row.remote_site_id)} />) : <Text style={{ color: '#B42318', fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>Aucun site trouvé pour ce client. Utilise « Actualiser » : si l’Intranet ne renvoie toujours aucun site, l’envoi ne peut pas être construit avec l’API actuelle.</Text>}
        </> : null}

        {siteId ? <><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 6 }}>3 · Local / installation Intranet</Text>
          {locals.length ? locals.map((row) => <OptionRow key={row.remote_local_id} selected={String(row.remote_local_id) === String(localId)} disabled={!row.compatible} title={row.designation || `Local ${row.remote_local_id}`} subtitle={[row.remote_trame_nom, row.derniere_visite_date ? `dernière visite ${String(row.derniere_visite_date).slice(0,10)}` : null, `ID ${row.remote_local_id}`, row.compatible ? null : 'trame incompatible'].filter(Boolean).join(' · ')} onPress={() => setLocalId(String(row.remote_local_id))} />) : <Text style={{ color: '#B42318', fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>Aucun local trouvé sur ce site. Actualise les données du client. Le POST Intranet exige un localId : METRA ne peut pas inventer ce rattachement.</Text>}
        </> : null}
      </ScrollView>}

      <View style={{ borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 }}>
        <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginBottom: 8 }}>L’association ne crée aucune visite sur le serveur. Après cette étape, le bouton d’envoi utilise les identifiants Intranet sélectionnés et affiche la réponse réelle du serveur.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy || !clientId || !siteId || !localId} onPress={bind} style={[styles.btnPrimary, { minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy || !clientId || !siteId || !localId ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryText}>Associer cette visite à l’Intranet</Text>}
        </TouchableOpacity>
      </View>
    </View></View>
  </Modal>;
}
'''
write('IntranetVisitDestinationPicker.js', picker)

check = r'''const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function need(text, value, label) { if (!text.includes(value)) throw new Error(`${label}: missing ${value}`); }
function forbid(text, value, label) { if (text.includes(value)) throw new Error(`${label}: forbidden ${value}`); }
const binding = read('intranetVisitBindingDb.js');
need(binding, "FROM api_client_links WHERE autorise=1", 'authorized client chooser');
need(binding, 'api_client_site_links', 'client/site relationship validation');
need(binding, 'remote_site_id=? AND remote_present=1', 'local/site relationship validation');
need(binding, "sourceType: 'upload_binding'", 'non-prefill send binding provenance');
need(binding, 'api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?', 'visit remote identity freeze');
need(binding, 'COALESCE(local_client_id,?)', 'future local-client association reuse');
need(binding, 'COALESCE(local_site_id,?)', 'future local-site association reuse');
const picker = read('IntranetVisitDestinationPicker.js');
need(picker, 'La visite peut avoir été créée normalement dans METRA', 'any-visit UX disclosure');
need(picker, 'syncAuthorizedClients()', 'client refresh');
need(picker, 'syncClientPreparation(clientId)', 'site/local refresh');
need(picker, 'Client Intranet', 'client chooser');
need(picker, 'Site Intranet', 'site chooser');
need(picker, 'Local / installation Intranet', 'local chooser');
const sync = read('IntranetVisitSync.js');
forbid(sync, "if (!visite?.api_remote_local_id || Number(visite?.api_is_historical) === 1) return null;", 'old prepared-only gate');
need(sync, 'Choisir la destination Intranet', 'unbound visit action');
need(sync, '<IntranetVisitDestinationPicker', 'destination picker wiring');
need(sync, 'Réponse Intranet HTTP 404', 'server client feedback');
need(sync, 'Réponse Intranet HTTP 422', 'server local/trame feedback');
const payload = read('intranetVisitPayload.js');
need(payload, "sourceType === 'upload_binding'", 'send-time frozen context');
console.log('Any-visit Intranet binding contract validated: ordinary METRA visits can bind to an authorized client/site/local, refresh server preparation, then expose real server feedback.');
'''
write('.github/scripts/check_intranet_any_visit_contract.js', check)

replace('intranetVisitPayload.js',
"      if (details?.sourceType === 'preparation_visite') return { historical: false, details };",
"      if (details?.sourceType === 'preparation_visite' || details?.sourceType === 'upload_binding') return { historical: false, details };")
replace('intranetVisitPayload.js',
"  if (!visite.api_remote_local_id) throw new IntranetVisitValidationError(['Cette visite n’est pas rattachée à un local Intranet. Ouvre le local depuis la préparation Intranet pour créer une visite synchronisable.']);",
"  if (!visite.api_remote_local_id) throw new IntranetVisitValidationError(['Cette visite n’est pas encore rattachée à une destination Intranet. Choisis le client, le site et le local depuis le bloc Synchronisation Intranet.']);")
replace('intranetVisitPayload.js',
"  if (!context?.details) throw new IntranetVisitValidationError(['Référence Intranet figée absente. Reprépare une nouvelle visite depuis l’Intranet.']);",
"  if (!context?.details) throw new IntranetVisitValidationError(['Référence Intranet figée absente. Associe ou réassocie cette visite à un local Intranet disposant d’une préparation à jour.']);")

replace('IntranetVisitSync.js',
"} from './intranetVisitOutboxDb.js';\n",
"} from './intranetVisitOutboxDb.js';\nimport { IntranetVisitDestinationPicker } from './IntranetVisitDestinationPicker.js';\n")
replace('IntranetVisitSync.js',
"function firstServerViolation(row) {\n  try {\n    const values = JSON.parse(row?.violations_json || '[]');\n    if (Array.isArray(values) && values[0]) return [values[0].path, values[0].message].filter(Boolean).join(' · ');\n  } catch {}\n  return null;\n}\n",
"function firstServerViolation(row) {\n  try {\n    const values = JSON.parse(row?.violations_json || '[]');\n    if (Array.isArray(values) && values[0]) return [values[0].path, values[0].message].filter(Boolean).join(' · ');\n  } catch {}\n  return null;\n}\n\nfunction serverFeedback(row) {\n  if (!row) return null;\n  const http = Number(row.http_status || 0);\n  const violation = firstServerViolation(row);\n  const fallback = violation || row.error_message || row.error_code || null;\n  if (http === 404) return `Réponse Intranet HTTP 404 · client introuvable ou non autorisé pour cette tablette${fallback ? ` · ${fallback}` : ''}`;\n  if (http === 403) return `Réponse Intranet HTTP 403 · tablette non autorisée à écrire${fallback ? ` · ${fallback}` : ''}`;\n  if (http === 422) return `Réponse Intranet HTTP 422 · données, trame, local ou association client/site refusés${fallback ? ` · ${fallback}` : ''}`;\n  if (http === 409) return `Réponse Intranet HTTP 409 · conflit de synchronisation${fallback ? ` · ${fallback}` : ''}`;\n  if (http) return `Réponse Intranet HTTP ${http}${fallback ? ` · ${fallback}` : ''}`;\n  return fallback;\n}\n")
replace('IntranetVisitSync.js',
"  const [busy, setBusy] = useState(false);\n  if (!visite?.api_remote_local_id || Number(visite?.api_is_historical) === 1) return null;",
"  const [busy, setBusy] = useState(false);\n  const [bindingVisible, setBindingVisible] = useState(false);\n  if (Number(visite?.api_is_historical) === 1) return null;\n  const linkedToIntranet = Boolean(visite?.api_remote_local_id);")
replace('IntranetVisitSync.js',
"  const label = row ? (STATUS[row.status]?.[0] || row.status) : (visite.statut === 'terminee' || visite.statut === 'exportee' ? 'Prête à envoyer' : 'Finaliser avant envoi');",
"  const label = row ? (STATUS[row.status]?.[0] || row.status) : (!linkedToIntranet ? 'Destination Intranet à choisir' : (visite.statut === 'terminee' || visite.statut === 'exportee' ? 'Prête à envoyer' : 'Finaliser avant envoi'));")
replace('IntranetVisitSync.js',
"  const detail = row?.status === 'synced' ? `Visite Intranet n°${row.remote_visit_id}${row.replayed ? ' · accusé rejoué sans doublon' : ''}`\n    : firstServerViolation(row) || row?.error_message || (row?.status === 'conflict' ? 'Une visite plus récente existe sur le serveur. Actualise la préparation Intranet avant de préparer une nouvelle visite.' : null);",
"  const detail = row?.status === 'synced' ? `Réponse Intranet OK · visite n°${row.remote_visit_id}${row.replayed ? ' · accusé rejoué sans doublon' : ''}`\n    : serverFeedback(row) || (row?.status === 'conflict' ? 'Une visite plus récente existe sur le serveur. Actualise la préparation Intranet avant de préparer une nouvelle visite.' : null);")
replace('IntranetVisitSync.js',
"    {!row ? <TouchableOpacity accessibilityRole=\"button\" disabled={busy || loading} onPress={() => confirmAndQueue(false, !['terminee','exportee'].includes(visite.statut))} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>{['terminee','exportee'].includes(visite.statut) ? 'Préparer et envoyer' : 'Finaliser et préparer l’envoi'}</Text></TouchableOpacity> : null}",
"    {!row && !linkedToIntranet ? <TouchableOpacity accessibilityRole=\"button\" disabled={busy || loading} onPress={() => setBindingVisible(true)} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>Choisir la destination Intranet</Text></TouchableOpacity> : null}\n    {!row && linkedToIntranet ? <TouchableOpacity accessibilityRole=\"button\" disabled={busy || loading} onPress={() => confirmAndQueue(false, !['terminee','exportee'].includes(visite.statut))} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>{['terminee','exportee'].includes(visite.statut) ? 'Préparer et envoyer' : 'Finaliser et préparer l’envoi'}</Text></TouchableOpacity> : null}")
replace('IntranetVisitSync.js',
"    {row?.status === 'conflict' ? <Text style={{ color: '#B42318', fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>Cet envoi n’est pas répété automatiquement. Recharge les données du local depuis l’Intranet avant de repartir d’une référence récente.</Text> : null}\n  </View>;",
"    {row?.status === 'conflict' ? <Text style={{ color: '#B42318', fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>Cet envoi n’est pas répété automatiquement. Recharge les données du local depuis l’Intranet avant de repartir d’une référence récente.</Text> : null}\n    <IntranetVisitDestinationPicker visible={bindingVisible} visiteId={visiteId} onClose={() => setBindingVisible(false)} onBound={async () => { setBindingVisible(false); await onVisitChanged?.(); await refresh(); }} />\n  </View>;")

replace('.github/scripts/run_source_patches.js',
"  ['Intranet visit upload contract', '.github/scripts/check_intranet_visit_upload_contract.js'],\n",
"  ['Intranet visit upload contract', '.github/scripts/check_intranet_visit_upload_contract.js'],\n  ['Intranet any-visit binding contract', '.github/scripts/check_intranet_any_visit_contract.js'],\n")
replace('.github/scripts/run_source_patches.js',
"  'intranetVisitPayload.js',\n  'intranetVisitOutboxDb.js',\n  'IntranetVisitSync.js',\n",
"  'intranetVisitPayload.js',\n  'intranetVisitBindingDb.js',\n  'intranetVisitOutboxDb.js',\n  'IntranetVisitSync.js',\n  'IntranetVisitDestinationPicker.js',\n")

doc = ROOT / 'docs/INTRANET_VISIT_UPLOAD.md'
text = doc.read_text(encoding='utf-8')
marker = '## Envoi de n’importe quelle visite METRA'
if marker not in text:
    text += r'''

## Envoi de n’importe quelle visite METRA

Une visite n’a plus besoin d’avoir été créée depuis le bouton « Préparer » de l’annuaire Intranet pour être synchronisable.

Le bloc **Synchronisation Intranet** reste visible sur toute visite METRA non historique. Si la visite ne possède pas encore d’identifiants serveur, l’utilisateur choisit explicitement :

1. le client Intranet autorisé sur la tablette ;
2. le site de ce client ;
3. le local / l’installation du site compatible avec la trame de la visite.

METRA propose automatiquement les correspondances déjà connues pour le client, le site, l’installation ou la trame, mais ne fabrique jamais un `localId`. L’utilisateur peut actualiser `GET /api/clients` puis `GET /api/clients/{idclient}/preparation-visites` depuis le sélecteur avant de confirmer.

L’association fige sur la visite les identifiants `api_remote_client_id`, `api_remote_local_id`, `api_remote_trame_id` et `api_source_remote_visit_id`, ainsi qu’une copie de la référence de préparation utilisée. Elle ne copie aucune ancienne réserve ou conclusion dans la visite du jour.

Le POST serveur actuel ne reçoit pas de `siteId` ni de nom de client/site : il exige l’identifiant du client dans l’URL et un `localId` dans chaque visite. En conséquence, un client réellement absent/non autorisé est signalé par le serveur en HTTP 404 ; un local, une trame ou une association incorrecte est normalement signalé en HTTP 422. METRA affiche désormais explicitement le code HTTP et le message/violation renvoyés par l’Intranet.
'''
    doc.write_text(text, encoding='utf-8')
    print('updated docs/INTRANET_VISIT_UPLOAD.md')

print('patch complete')

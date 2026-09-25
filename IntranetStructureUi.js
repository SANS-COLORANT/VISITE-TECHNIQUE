import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';
import {
  getStructureContextForLocalClient,
  listSiteStructureLocals,
  processStructureOutbox,
  queueMetraLocalCreation,
  queueMetraSiteCreation,
  retryStructureOperation,
  subscribeStructureOutbox,
  syncStructureReferential
} from './intranetStructureDb.js';

const STATUS = {
  pending: ['En attente', '#9A4C0A', '#FFF4E8'],
  sending: ['Envoi…', '#155EEF', '#EFF4FF'],
  retry: ['À reprendre', '#9A4C0A', '#FFF4E8'],
  synced: ['Intranet', '#16794B', '#EAF8F1'],
  conflict: ['Conflit', '#B42318', '#FFF1F0'],
  validation_error: ['À corriger', '#B42318', '#FFF1F0'],
  rejected: ['Refusé', '#B42318', '#FFF1F0'],
  auth_error: ['Connexion requise', '#B42318', '#FFF1F0']
};

function StatusPill({ status }) {
  const [label, fg, bg] = STATUS[status] || [status || 'Local', COLORS.inkSoft, '#F4F6F8'];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 10, fontWeight: '900' }}>{label}</Text>
    </View>
  );
}

function ChoiceChips({ values, value, onChange, getKey = (v) => String(v), getLabel = (v) => String(v) }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {(values || []).map((item) => {
        const key = getKey(item);
        const selected = String(value ?? '') === String(key);
        return (
          <TouchableOpacity
            key={String(key)}
            onPress={() => onChange(key)}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 11,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: selected ? COLORS.orange : COLORS.line,
              backgroundColor: selected ? COLORS.orangeLight : '#FFF'
            }}
          >
            <Text
              style={{
                color: selected ? COLORS.orangeDark : COLORS.inkSoft,
                fontSize: 11.5,
                fontWeight: selected ? '900' : '700'
              }}
            >
              {getLabel(item)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SectionLabel({ children }) {
  return <Text style={[styles.fieldLabel, { marginTop: 11, marginBottom: 7 }]}>{children}</Text>;
}

export function IntranetSiteCreationModal({ visible, clientId, onClose, onCreated }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lotId, setLotId] = useState(null);
  const [nom, setNom] = useState('');
  const [sitePrincipal, setSitePrincipal] = useState('Non');
  const [numero, setNumero] = useState('');
  const [voie, setVoie] = useState('');
  const [complement, setComplement] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [ville, setVille] = useState('');
  const [energie, setEnergie] = useState('GAZ');
  const [typeBatiment, setTypeBatiment] = useState('Habitation');

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const next = await getStructureContextForLocalClient(clientId);
      setContext(next);
      if (!lotId && next?.referential?.lots?.[0]?.id != null) setLotId(String(next.referential.lots[0].id));
    } catch (e) {
      Alert.alert('Création Intranet', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [clientId, lotId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const refreshReferential = async () => {
    if (!context?.remoteClientId || syncing) return;
    setSyncing(true);
    try {
      await syncStructureReferential(context.remoteClientId);
      const next = await getStructureContextForLocalClient(clientId);
      setContext(next);
      if (!lotId && next?.referential?.lots?.[0]?.id != null) setLotId(String(next.referential.lots[0].id));
    } catch (e) {
      Alert.alert(
        'Référentiel indisponible',
        `${String(e?.message || e)}\n\nLe dernier référentiel enregistré reste utilisable hors connexion.`
      );
    } finally {
      setSyncing(false);
    }
  };

  const reset = () => {
    setNom('');
    setSitePrincipal('Non');
    setNumero('');
    setVoie('');
    setComplement('');
    setCodePostal('');
    setVille('');
    setEnergie('GAZ');
    setTypeBatiment('Habitation');
  };

  const create = async () => {
    if (creating || !context?.remoteClientId) return;
    const rue = [numero.trim(), voie.trim()].filter(Boolean).join(' ');
    const adresse = [rue, complement.trim()].filter(Boolean).join(', ') || null;
    setCreating(true);
    try {
      const result = await queueMetraSiteCreation({
        localClientId: clientId,
        remoteClientId: context.remoteClientId,
        lotId,
        nom,
        sitePrincipal,
        adresse,
        codePostal: codePostal || null,
        ville: ville || null,
        energie,
        typeBatiment
      });
      reset();
      onClose?.();
      await onCreated?.(result);
      void processStructureOutbox({ limit: 2 }).catch(() => {});
    } catch (e) {
      Alert.alert('Création impossible', String(e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  const referential = context?.referential;
  const canCreate = Boolean(
    context?.remoteClientId &&
    referential &&
    lotId &&
    nom.trim().length >= 2 &&
    energie.trim() &&
    typeBatiment.trim() &&
    (!codePostal || codePostal.length === 5)
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!creating) onClose?.();
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Créer un site dans METRA + Intranet</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16 }}>
              La création est enregistrée d’abord sur la tablette. Hors connexion, elle reste en attente avec le même
              creationId et sera rejouée sans doublon.
            </Text>

            {loading ? <Text style={{ color: COLORS.muted, marginTop: 12 }}>Lecture du référentiel…</Text> : null}
            {context?.ambiguous ? (
              <Text style={{ color: '#B42318', marginTop: 12, fontWeight: '800' }}>
                Plusieurs clients Intranet sont liés à ce client METRA. La création automatique est bloquée pour éviter
                un mauvais rattachement.
              </Text>
            ) : null}
            {context && !context.linked ? (
              <Text style={{ color: '#9A4C0A', marginTop: 12, fontWeight: '800' }}>
                Ce client est local uniquement. Importe/lie d’abord le client depuis l’Intranet.
              </Text>
            ) : null}
            {context?.remoteClientId ? (
              <View
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: '#F7F8FA',
                  borderWidth: 1,
                  borderColor: COLORS.line
                }}
              >
                <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 12 }}>
                  Client Intranet n°{context.remoteClientId}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 3 }}>
                  {referential?.syncedAt
                    ? `Référentiel enregistré · ${String(referential.syncedAt).replace('T', ' ').slice(0, 16)}`
                    : 'Référentiel non encore enregistré sur cette tablette'}
                </Text>
                <TouchableOpacity
                  onPress={refreshReferential}
                  disabled={syncing}
                  style={{ paddingVertical: 8, marginTop: 2 }}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 11 }}>
                    {syncing ? 'Actualisation…' : '↻ Actualiser le référentiel'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {referential ? (
              <>
                <SectionLabel>Lot Intranet</SectionLabel>
                <ChoiceChips
                  values={referential.lots || []}
                  value={lotId}
                  onChange={setLotId}
                  getKey={(lot) => String(lot.id)}
                  getLabel={(lot) => lot.nom || `Lot ${lot.id}`}
                />
                <SectionLabel>Nom du site</SectionLabel>
                <TextInput
                  style={styles.input}
                  value={nom}
                  onChangeText={setNom}
                  placeholder="Résidence / bâtiment / ensemble"
                  maxLength={100}
                />
                <SectionLabel>Site principal</SectionLabel>
                <ChoiceChips
                  values={referential?.valeurs?.sitePrincipal || ['Oui', 'Non']}
                  value={sitePrincipal}
                  onChange={setSitePrincipal}
                />
                <SectionLabel>Adresse</SectionLabel>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { width: 78 }]}
                    value={numero}
                    onChangeText={setNumero}
                    placeholder="N°"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={voie}
                    onChangeText={setVoie}
                    placeholder="Rue / avenue / voie"
                  />
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  value={complement}
                  onChangeText={setComplement}
                  placeholder="Complément (facultatif)"
                  maxLength={255}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[styles.input, { width: 120 }]}
                    value={codePostal}
                    onChangeText={(v) => setCodePostal(v.replace(/\D/g, '').slice(0, 5))}
                    keyboardType="number-pad"
                    maxLength={5}
                    placeholder="Code postal"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={ville}
                    onChangeText={setVille}
                    placeholder="Ville"
                    maxLength={50}
                  />
                </View>
                <SectionLabel>Énergie</SectionLabel>
                <TextInput
                  style={styles.input}
                  value={energie}
                  onChangeText={setEnergie}
                  placeholder="Ex. GAZ, RCU, ÉLECTRICITÉ"
                  maxLength={255}
                  autoCapitalize="characters"
                />
                <SectionLabel>Type de bâtiment</SectionLabel>
                <TextInput
                  style={styles.input}
                  value={typeBatiment}
                  onChangeText={setTypeBatiment}
                  placeholder="Ex. Habitation, Tertiaire"
                  maxLength={255}
                />
              </>
            ) : null}
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} disabled={creating} onPress={onClose}>
              <Text style={styles.btnSecondaryText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, !canCreate && { opacity: 0.45 }]}
              disabled={!canCreate || creating}
              onPress={create}
            >
              <Text style={styles.btnPrimaryText}>{creating ? 'Enregistrement…' : 'Créer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function IntranetSiteLocalsPanel({ siteId, onStartVisit }) {
  const [data, setData] = useState({ context: null, locals: [] });
  const [modalVisible, setModalVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [designation, setDesignation] = useState('Chaufferie');
  const [type, setType] = useState('Local technique');
  const [situation, setSituation] = useState('Sous-sol');
  const [trameId, setTrameId] = useState(null);
  const [periodiciteVisite, setPeriodiciteVisite] = useState('12');

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      const next = await listSiteStructureLocals(siteId);
      setData(next);
      if (!trameId && next?.context?.referential?.trames?.[0]?.id != null)
        setTrameId(String(next.context.referential.trames[0].id));
    } catch (e) {
      console.warn('Chargement locaux Intranet impossible', e);
    }
  }, [siteId, trameId]);

  useEffect(() => {
    load();
    return subscribeStructureOutbox(load);
  }, [load]);

  const refreshReferential = async () => {
    const remoteClientId = data.context?.remoteClientId;
    if (!remoteClientId || syncing) return;
    setSyncing(true);
    try {
      await syncStructureReferential(remoteClientId);
      await load();
    } catch (e) {
      Alert.alert(
        'Référentiel indisponible',
        `${String(e?.message || e)}\n\nLes données déjà enregistrées restent utilisables hors connexion.`
      );
    } finally {
      setSyncing(false);
    }
  };

  const createLocal = async () => {
    if (creating || !data.context?.remoteClientId) return;
    setCreating(true);
    try {
      await queueMetraLocalCreation({
        localSiteId: siteId,
        remoteClientId: data.context.remoteClientId,
        designation,
        type,
        situation,
        trameId,
        periodiciteVisite: periodiciteVisite.trim() ? periodiciteVisite : null
      });
      setModalVisible(false);
      await load();
      void processStructureOutbox({ limit: 3 }).catch(() => {});
    } catch (e) {
      Alert.alert('Création du local impossible', String(e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  const referential = data.context?.referential;
  const canCreate = Boolean(
    data.context?.remoteClientId &&
    referential &&
    trameId &&
    designation.trim() &&
    type.trim() &&
    situation.trim().length >= 2 &&
    (!periodiciteVisite.trim() || Number(periodiciteVisite) > 0)
  );

  if (!data.context?.linked)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Création de locaux Intranet indisponible</Text>
        <Text style={styles.emptySub}>Ce site appartient à un client local non relié à l’Intranet.</Text>
      </View>
    );
  if (data.context?.ambiguous)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Rattachement Intranet ambigu</Text>
        <Text style={styles.emptySub}>
          Plusieurs clients Intranet correspondent à ce client METRA. Aucun local ne sera créé au hasard.
        </Text>
      </View>
    );

  return (
    <View>
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: '#F7F8FA',
          borderWidth: 1,
          borderColor: COLORS.line,
          marginBottom: 12
        }}
      >
        <Text style={{ color: COLORS.ink, fontSize: 12.5, fontWeight: '900' }}>
          Structure Intranet · client n°{data.context.remoteClientId}
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 3 }}>
          {data.context.remoteSiteId
            ? `Site Intranet n°${data.context.remoteSiteId}`
            : data.context.siteOperation
              ? `Création du site : ${STATUS[data.context.siteOperation.status]?.[0] || data.context.siteOperation.status}`
              : 'Site non relié à l’Intranet'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TouchableOpacity
            onPress={refreshReferential}
            disabled={syncing}
            style={{ paddingVertical: 7, paddingRight: 8 }}
          >
            <Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 11 }}>
              {syncing ? 'Actualisation…' : '↻ Référentiel'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            disabled={!referential || (!data.context.remoteSiteId && !data.context.siteOperation)}
            style={{ paddingVertical: 7 }}
          >
            <Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 11 }}>+ Ajouter un local</Text>
          </TouchableOpacity>
        </View>
      </View>

      {data.locals.length ? (
        data.locals.map((local, index) => {
          const mappedTrameId = mapRemoteTrameToLocal({ id: local.remoteTrameId, nom: local.remoteTrameNom });
          const canStart = Boolean(mappedTrameId && (local.remoteLocalId || local.local_installation_id));
          return (
            <View
              key={local.local_installation_id || local.remoteLocalId || `${local.designation}-${index}`}
              style={[styles.card, { alignItems: 'flex-start' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{local.designation}</Text>
                <Text style={styles.cardSub}>
                  {[local.type, local.situation, local.remoteTrameNom].filter(Boolean).join(' · ') || 'Local technique'}
                </Text>
                {local.error_message ? (
                  <Text style={{ color: '#B42318', fontSize: 10.5, marginTop: 5 }}>{local.error_message}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <StatusPill status={local.syncStatus} />
                {canStart ? (
                  <TouchableOpacity
                    onPress={() =>
                      onStartVisit?.({
                        installationId: local.local_installation_id || null,
                        remoteLocalId: local.remoteLocalId || null,
                        remoteClientId: data.context.remoteClientId,
                        remoteTrameId: local.remoteTrameId,
                        remoteTrameNom: local.remoteTrameNom,
                        localTrameId: mappedTrameId,
                        designation: local.designation,
                        pending: local.syncStatus !== 'synced'
                      })
                    }
                    style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 9 }}
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 10.5, fontWeight: '900' }}>Nouvelle visite</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: '#9A4C0A', fontSize: 9.5, maxWidth: 110, textAlign: 'right' }}>
                    Trame non reconnue dans METRA
                  </Text>
                )}
                {local.operation_id && !['pending', 'sending', 'synced', 'conflict'].includes(local.syncStatus) ? (
                  <TouchableOpacity
                    onPress={() =>
                      retryStructureOperation(local.operation_id)
                        .then(load)
                        .catch((e) => Alert.alert('Reprise impossible', String(e?.message || e)))
                    }
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '800' }}>Réessayer</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucun local relié à l’Intranet</Text>
          <Text style={styles.emptySub}>
            Ajoute une chaufferie, sous-station ou autre local technique. La création peut être saisie hors connexion si
            le référentiel a déjà été téléchargé.
          </Text>
        </View>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!creating) setModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Nouveau local Intranet</Text>
              <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16 }}>
                Le local est créé localement immédiatement. S’il n’y a pas de réseau, METRA conserve le même creationId
                jusqu’à l’accusé serveur.
              </Text>
              <SectionLabel>Désignation</SectionLabel>
              <TextInput
                style={styles.input}
                value={designation}
                onChangeText={setDesignation}
                maxLength={100}
                placeholder="Chaufferie"
              />
              <SectionLabel>Type</SectionLabel>
              <TextInput
                style={styles.input}
                value={type}
                onChangeText={setType}
                maxLength={255}
                placeholder="Local technique"
              />
              <SectionLabel>Situation</SectionLabel>
              <TextInput
                style={styles.input}
                value={situation}
                onChangeText={setSituation}
                maxLength={50}
                placeholder="Sous-sol"
              />
              <SectionLabel>Trame Intranet</SectionLabel>
              <ChoiceChips
                values={referential?.trames || []}
                value={trameId}
                onChange={setTrameId}
                getKey={(trame) => String(trame.id)}
                getLabel={(trame) => trame.nom || `Trame ${trame.id}`}
              />
              <SectionLabel>Périodicité de visite (mois)</SectionLabel>
              <TextInput
                style={styles.input}
                value={periodiciteVisite}
                onChangeText={(v) => setPeriodiciteVisite(v.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
                placeholder="12"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} disabled={creating} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, !canCreate && { opacity: 0.45 }]}
                disabled={!canCreate || creating}
                onPress={createLocal}
              >
                <Text style={styles.btnPrimaryText}>{creating ? 'Enregistrement…' : 'Créer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

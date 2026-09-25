import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import {
  discardTerminalVisitUpload, finalizeVisitForUpload, getVisitUploadState, listVisitOutbox,
  processVisitOutbox, queueVisitUpload, retryVisitUploadNow, subscribeVisitOutbox,
} from './intranetVisitOutboxDb.js';
import {
  getVisitPhotoUploadSummary, processVisitPhotoOutbox, queueMissingSyncedVisitPhotos,
  retryVisitPhotoUploadsNow, subscribeVisitPhotoOutbox, syncVisitPhotosNow,
} from './intranetVisitPhotoOutboxDb.js';
import { bindVisitToImportedClientTarget, getVisitIntranetBindingOptions, resolveFirstVisitRemoteTrame } from './intranetVisitBindingDb.js';
import { syncClientPreparation } from './symfonyApi.js';
import { getCachedStructureReferential, syncStructureReferential } from './intranetStructureDb.js';

const OFFLINE = '#111111';
const ONLINE = '#16794B';
const ERROR = '#B42318';
const PHOTO_PART_INTERVAL_MS = 15_000;
const EMPTY_PHOTO_SUMMARY = Object.freeze({ total: 0, queued: 0, unscheduled: 0, pending: 0, sending: 0, synced: 0, failed: 0 });

function firstServerViolation(row) {
  try {
    const values = JSON.parse(row?.violations_json || '[]');
    if (Array.isArray(values) && values[0]) return [values[0].path, values[0].message].filter(Boolean).join(' · ');
  } catch {}
  return null;
}

function serverFeedback(row) {
  if (!row) return null;
  const http = Number(row.http_status || 0);
  const violation = firstServerViolation(row);
  const fallback = violation || row.error_message || row.error_code || null;
  if (http === 404) return `Intranet HTTP 404 · client ou ressource introuvable/non autorisée${fallback ? ` · ${fallback}` : ''}`;
  if (http === 403) return `Intranet HTTP 403 · tablette non autorisée${fallback ? ` · ${fallback}` : ''}`;
  if (http === 422) return `Intranet HTTP 422 · visite, trame ou local refusé${fallback ? ` · ${fallback}` : ''}`;
  if (http === 409) return `Intranet HTTP 409 · conflit de synchronisation${fallback ? ` · ${fallback}` : ''}`;
  if (http) return `Intranet HTTP ${http}${fallback ? ` · ${fallback}` : ''}`;
  return fallback;
}

function localBindingFeedback(error) {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  return issues.length
    ? `${error?.message || 'Visite non envoyable'}\n\n${issues.slice(0, 7).map((x) => `• ${x}`).join('\n')}${issues.length > 7 ? `\n• … ${issues.length - 7} autre(s)` : ''}`
    : String(error?.message || error || 'Visite non envoyable');
}

function photoSummaryComplete(summary) {
  const value = summary || EMPTY_PHOTO_SUMMARY;
  return Number(value.unscheduled || 0) === 0
    && Number(value.pending || 0) === 0
    && Number(value.sending || 0) === 0
    && Number(value.failed || 0) === 0
    && Number(value.synced || 0) === Number(value.total || 0);
}

export function IntranetVisitSyncRuntime() {
  useEffect(() => {
    let alive = true;
    let running = false;
    let photosRunning = false;

    const runPhotos = async () => {
      if (!alive || photosRunning) return;
      photosRunning = true;
      try {
        await queueMissingSyncedVisitPhotos({ limitVisits: 40 });
        // Une seule partie (10 photos maximum) par passage. Le passage suivant
        // reprend automatiquement 15 s plus tard tant que METRA reste ouvert.
        await processVisitPhotoOutbox({ limit: 10 });
      } catch {} finally { photosRunning = false; }
    };

    const run = async () => {
      if (!alive || running) return;
      running = true;
      try {
        await processVisitOutbox({ limit: 3 });
        await runPhotos();
      } catch {} finally { running = false; }
    };

    const startup = setTimeout(() => { run(); }, 1200);
    const interval = setInterval(() => { run(); }, 60_000);
    const photoInterval = setInterval(() => { runPhotos(); }, PHOTO_PART_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => {
      alive = false;
      clearTimeout(startup);
      clearInterval(interval);
      clearInterval(photoInterval);
      subscription.remove();
    };
  }, []);
  return null;
}

export function IntranetVisitSyncBanner() {
  const [rows, setRows] = useState([]);
  const refresh = useCallback(() => listVisitOutbox().then(setRows).catch(() => {}), []);
  useEffect(() => { refresh(); return subscribeVisitOutbox(refresh); }, [refresh]);
  if (!rows.length) return null;
  const sending = rows.filter((r) => r.status === 'sending').length;
  const waiting = rows.filter((r) => ['pending', 'retry'].includes(r.status)).length;
  const blocked = rows.length - sending - waiting;
  return <View accessibilityLiveRegion="polite" style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: blocked ? '#FFF1F0' : '#FFF8ED', borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', alignItems: 'center' }}>
    <Text style={{ flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '800' }}>Intranet · {sending ? `${sending} envoi en cours` : `${waiting} en attente`}{blocked ? ` · ${blocked} à corriger` : ''}</Text>
    {waiting ? <TouchableOpacity accessibilityRole="button" onPress={() => processVisitOutbox({ limit: 3 }).then(() => queueMissingSyncedVisitPhotos({ limitVisits: 40 })).then(() => processVisitPhotoOutbox({ limit: 10 })).catch(() => {})} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 }}><Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 12 }}>Synchroniser</Text></TouchableOpacity> : null}
  </View>;
}

export function useVisitUploadState(visiteId) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!visiteId) return;
    try { setRow(await getVisitUploadState(visiteId)); } finally { setLoading(false); }
  }, [visiteId]);
  useEffect(() => { setLoading(true); refresh(); return subscribeVisitOutbox(refresh); }, [refresh]);
  return { row, loading, refresh };
}

export function useVisitPhotoUploadSummary(visiteId) {
  const [summary, setSummary] = useState(EMPTY_PHOTO_SUMMARY);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!visiteId) return;
    try { setSummary(await getVisitPhotoUploadSummary(visiteId)); } finally { setLoading(false); }
  }, [visiteId]);
  useEffect(() => { setLoading(true); refresh(); return subscribeVisitPhotoOutbox(refresh); }, [refresh]);
  return { summary, loading, refresh };
}

async function hydrateFirstVisitReference(visiteId, remoteClientId) {
  let referential = await getCachedStructureReferential(remoteClientId).catch(() => null);
  try {
    // Le référentiel est léger et contient les identifiants de trame officiels.
    // On l'actualise avant de choisir une trame pour une toute première visite.
    referential = await syncStructureReferential(remoteClientId);
  } catch (error) {
    if (!referential) {
      const wrapped = new Error(`Impossible de charger le référentiel Intranet nécessaire à cette première visite : ${String(error?.message || error)}`);
      wrapped.code = error?.code || 'intranet_structure_referential_required';
      wrapped.remoteClientId = remoteClientId;
      throw wrapped;
    }
  }

  const options = await getVisitIntranetBindingOptions(visiteId);
  const localTrameId = options?.visite?.trame_id;
  const visitTrameName = options?.visitTrameName || null;
  const resolved = resolveFirstVisitRemoteTrame(referential, localTrameId, visitTrameName);

  // Le filtre ?trame= force l'API à fournir la définition complète de la
  // trame même lorsque le local ne possède encore aucune dernière visite.
  // cachePreparation traite cette réponse comme partielle et ne masque donc
  // aucun autre site/local déjà importé.
  await syncClientPreparation(remoteClientId, resolved.remoteTrameId);
  return resolved;
}

async function bindSameImportedClient(visiteId) {
  try {
    return await bindVisitToImportedClientTarget(visiteId);
  } catch (error) {
    const refreshable = error?.remoteClientId && ['imported_site_missing', 'intranet_reference_refresh_required', 'wrong_imported_site'].includes(error?.code);
    if (!refreshable) throw error;

    try {
      // Premier essai : actualisation normale du client, suffisante lorsqu'une
      // dernière visite existe déjà côté Intranet.
      await syncClientPreparation(error.remoteClientId);
    } catch (refreshError) {
      const wrapped = new Error(`Impossible d’actualiser le client Intranet avant l’envoi : ${String(refreshError?.message || refreshError)}`);
      wrapped.code = refreshError?.code || error?.code;
      wrapped.remoteClientId = error.remoteClientId;
      throw wrapped;
    }

    try {
      return await bindVisitToImportedClientTarget(visiteId);
    } catch (retryError) {
      // Cas première visite : le local existe mais aucune visite antérieure ne
      // permet à preparation-visites de déduire une trame. METRA récupère alors
      // l'identifiant de trame depuis referentiel-structure et redemande une
      // préparation explicitement filtrée sur cette trame.
      if (retryError?.code !== 'intranet_reference_refresh_required') throw retryError;
      const remoteClientId = retryError?.remoteClientId || error.remoteClientId;
      await hydrateFirstVisitReference(visiteId, remoteClientId);
      return bindVisitToImportedClientTarget(visiteId);
    }
  }
}

async function assertQueuedClientStillMatchesImportedClient(visiteId, row) {
  if (!row?.remote_client_id) return;
  const options = await getVisitIntranetBindingOptions(visiteId);
  const expected = options?.selectedClientId;
  if (!expected) {
    const error = new Error('Le client Intranet d’origine de cette visite n’est plus identifiable. Cet ancien envoi reste bloqué pour éviter de l’expédier vers un autre client.');
    error.code = 'queued_client_unresolved';
    throw error;
  }
  if (String(expected) !== String(row.remote_client_id)) {
    const error = new Error('Cet envoi en attente a été préparé avec un autre client Intranet par une ancienne version de METRA. Il ne sera pas rejoué automatiquement. La visite doit rester liée à son client importé d’origine.');
    error.code = 'queued_client_mismatch';
    throw error;
  }
}

export function IntranetVisitSyncControl({ visite, onVisitChanged = null, compact = false }) {
  const visiteId = visite?.id;
  const { row, loading, refresh } = useVisitUploadState(visiteId);
  const { summary: photoSummary, loading: photoLoading, refresh: refreshPhotos } = useVisitPhotoUploadSummary(visiteId);
  const [busy, setBusy] = useState(false);
  const historical = Number(visite?.api_is_historical) === 1;
  const visitSynced = row?.status === 'synced';
  const photosComplete = photoSummaryComplete(photoSummary);
  const online = historical || (visitSynced && photosComplete);
  const hardIdempotencyConflict = row?.error_code === 'idempotency_conflict';
  const invalidAck = row?.error_code === 'invalid_ack';

  const syncPhotosAfterVisit = async () => {
    if (!visitSynced && (await getVisitUploadState(visiteId))?.status !== 'synced') return;
    await syncVisitPhotosNow(visiteId);
    await refreshPhotos();
    const result = await getVisitPhotoUploadSummary(visiteId);
    if (result.failed > 0) {
      Alert.alert('Visite envoyée · photos à corriger', `${result.synced}/${result.total} photo(s) sont confirmées sur l’Intranet. ${result.failed} photo(s) ont été refusées et restent signalées Offline.`);
    }
  };

  const finishQueueAndSend = async (confirmMaterialReplacement = false) => {
    await queueVisitUpload(visiteId, { confirmMaterialReplacement });
    await onVisitChanged?.();
    await refresh();
    await processVisitOutbox({ limit: 1 }).catch(() => {});
    await refresh();
    await onVisitChanged?.();
    const finalRow = await getVisitUploadState(visiteId);
    if (finalRow?.status === 'synced') {
      await syncVisitPhotosNow(visiteId).catch(() => {});
      await refreshPhotos();
    }
    if (finalRow && ['validation_error', 'rejected', 'conflict', 'auth_error'].includes(finalRow.status)) {
      Alert.alert('Envoi Intranet non validé', serverFeedback(finalRow) || 'L’Intranet a refusé ou interrompu l’envoi. La visite reste Offline.');
      return;
    }
    const finalPhotos = await getVisitPhotoUploadSummary(visiteId);
    if (finalRow?.status === 'synced' && finalPhotos.failed > 0) {
      Alert.alert('Visite envoyée · photos à corriger', `${finalPhotos.synced}/${finalPhotos.total} photo(s) sont confirmées sur l’Intranet. ${finalPhotos.failed} photo(s) ont été refusées.`);
    }
  };

  const queueWithMaterialSafety = async () => {
    try {
      await finishQueueAndSend(false);
    } catch (error) {
      if (['material_replacement_confirmation_required', 'material_clear_confirmation_required'].includes(error?.code)) {
        const prepared = error?.prepared;
        const destructiveClear = Number(prepared?.summary?.materials || 0) === 0;
        Alert.alert(
          destructiveClear ? 'Attention : listing matériel vidé' : 'Attention : matériels supprimés de l’Intranet',
          `${error.message}\n\nLe serveur remplace le listing matériel complet du local.`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: destructiveClear ? 'Confirmer le listing vide' : 'Confirmer le remplacement', style: 'destructive', onPress: () => {
              setBusy(true);
              finishQueueAndSend(true).catch((e) => Alert.alert('Envoi impossible', localBindingFeedback(e))).finally(() => setBusy(false));
            } },
          ]
        );
        return;
      }
      throw error;
    }
  };

  const prepareAndSend = async () => {
    if (busy || loading || photoLoading || online || row?.status === 'sending') return;
    setBusy(true);
    try {
      if (historical) return;

      // La visite Symfony existe déjà : ne jamais la recréer. On reprend seulement
      // les photos manquantes avec leur envoiPhotoId persistant.
      if (visitSynced) {
        if (photoSummary.failed > 0) {
          await retryVisitPhotoUploadsNow(visiteId);
        } else {
          await syncPhotosAfterVisit();
        }
        await refreshPhotos();
        return;
      }

      if (hardIdempotencyConflict || invalidAck) {
        Alert.alert('Envoi Intranet verrouillé', hardIdempotencyConflict
          ? 'Le même envoiId existe déjà avec un contenu différent. METRA ne crée pas un nouvel envoi afin d’éviter un doublon.'
          : 'L’accusé serveur est incohérent et la visite a peut-être déjà été créée. METRA ne génère pas un nouvel envoi automatiquement.');
        return;
      }

      if (row && ['pending', 'retry', 'auth_error'].includes(row.status)) {
        await assertQueuedClientStillMatchesImportedClient(visiteId, row);
        await retryVisitUploadNow(visiteId);
        await refresh();
        await onVisitChanged?.();
        const retried = await getVisitUploadState(visiteId);
        if (retried?.status === 'synced') {
          await syncVisitPhotosNow(visiteId).catch(() => {});
          await refreshPhotos();
        }
        return;
      }

      if (row && ['validation_error', 'rejected', 'conflict'].includes(row.status)) {
        if (row.status === 'conflict' && row.remote_client_id) {
          try { await syncClientPreparation(row.remote_client_id); }
          catch (e) { throw new Error(`Impossible d’actualiser le même client Intranet après le conflit : ${String(e?.message || e)}`); }
        }
        const discarded = await discardTerminalVisitUpload(visiteId);
        if (!discarded) throw new Error('Cet envoi ne peut pas encore être reconstruit sans risque de doublon.');
      }

      await bindSameImportedClient(visiteId);
      await onVisitChanged?.();

      const final = ['terminee', 'exportee'].includes(visite?.statut);
      if (!final) {
        Alert.alert(
          'Visite non terminée',
          'La visite est encore en cours. L’envoi vers l’Intranet crée une visite serveur : termine-la avant de l’envoyer.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Finaliser et envoyer', onPress: () => {
              setBusy(true);
              finalizeVisitForUpload(visiteId)
                .then(() => queueWithMaterialSafety())
                .catch((e) => Alert.alert('Envoi impossible', localBindingFeedback(e)))
                .finally(() => setBusy(false));
            } },
          ]
        );
        return;
      }

      await queueWithMaterialSafety();
    } catch (error) {
      Alert.alert('Visite non envoyable', localBindingFeedback(error));
    } finally {
      setBusy(false);
    }
  };

  const remainingPhotos = Math.max(0, Number(photoSummary.total || 0) - Number(photoSummary.synced || 0) - Number(photoSummary.failed || 0));
  const photoDetail = visitSynced && photoSummary.total > 0
    ? ` · photos ${photoSummary.synced}/${photoSummary.total}${remainingPhotos ? ' · envoi par lots de 10' : ''}${photoSummary.failed ? ` · ${photoSummary.failed} refusée(s)` : ''}`
    : '';
  const detail = online
    ? (historical ? 'Déjà présente sur l’Intranet (visite importée).' : `Export Intranet confirmé${row?.remote_visit_id ? ` · visite n°${row.remote_visit_id}` : ''}${photoSummary.total ? ` · ${photoSummary.synced} photo(s)` : ''}.`)
    : visitSynced ? `Visite n°${row?.remote_visit_id || ''} créée sur l’Intranet${photoDetail}. Les lots suivants reprennent automatiquement.`
      : row?.status === 'sending' ? 'Envoi vers le même client Intranet en cours…'
        : row?.status === 'pending' ? 'Envoi en attente.'
          : row?.status === 'retry' ? 'Non exportée · nouvelle tentative dès que la connexion le permet.'
            : row?.status === 'auth_error' ? 'Non exportée · connexion Intranet à réactiver.'
              : serverFeedback(row) || 'Non exportée sur l’Intranet. Appuie sur Offline pour l’envoyer au client importé.';
  const detailIsError = !online && ((row && ['validation_error', 'rejected', 'conflict', 'auth_error'].includes(row.status)) || photoSummary.failed > 0);

  const sending = busy || row?.status === 'sending' || photoSummary.sending > 0;
  const iconName = online ? 'cloud-check' : detailIsError ? 'cloud-off' : 'cloud-sync';
  const tint = online ? ONLINE : detailIsError ? ERROR : OFFLINE;
  const tintSoft = online ? '#E4F5EC' : detailIsError ? '#FBEAE8' : '#F1F1EF';
  // Une seule icône colorée porte le statut (vert = synchronisé, gris = en attente,
  // rouge = à corriger) — le mot "Intranet" et le texte de détail systématique
  // n'apportent rien que la couleur ne dise déjà ; le détail ne s'affiche que
  // quand il y a vraiment quelque chose à lire (erreur ou envoi en cours).
  const showDetail = !compact && (detailIsError || sending || (!online && !loading && !photoLoading));

  return <View style={compact ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }}>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={online ? 'Synchronisé avec l’Intranet' : detailIsError ? 'Erreur de synchronisation, appuyer pour réessayer' : 'Non synchronisé, appuyer pour envoyer'}
      disabled={loading || photoLoading || busy || online || row?.status === 'sending'}
      onPress={(event) => { event?.stopPropagation?.(); prepareAndSend().catch(() => {}); }}
      style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tintSoft, opacity: loading || photoLoading ? 0.55 : 1 }}
    >
      {sending ? <ActivityIndicator size="small" color={tint} /> : <CvcIcon name={iconName} size={22} color={tint} />}
    </TouchableOpacity>
    {showDetail ? <Text accessibilityLiveRegion="polite" style={{ color: detailIsError ? ERROR : COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 4, maxWidth: 150, textAlign: compact ? 'right' : 'left' }}>{loading || photoLoading ? 'Lecture…' : detail}</Text> : null}
  </View>;
}
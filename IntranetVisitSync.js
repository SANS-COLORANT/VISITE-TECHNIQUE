import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from './styles.js';
import {
  discardTerminalVisitUpload, finalizeVisitForUpload, getVisitUploadState, listVisitOutbox,
  processVisitOutbox, queueVisitUpload, retryVisitUploadNow, subscribeVisitOutbox,
} from './intranetVisitOutboxDb.js';
import {
  getVisitPhotoSyncState, processVisitPhotoOutbox, queueVisitPhotosForSyncedVisit,
  retryVisitPhotoUploadsNow, subscribeVisitPhotoOutbox,
} from './intranetVisitPhotoOutboxDb.js';
import { bindVisitToImportedClientTarget, getVisitIntranetBindingOptions } from './intranetVisitBindingDb.js';
import { syncClientPreparation } from './symfonyApi.js';

const OFFLINE = '#111111';
const ONLINE = '#16794B';
const ERROR = '#B42318';

function firstServerViolation(row) {
  try { const values = JSON.parse(row?.violations_json || '[]'); if (Array.isArray(values) && values[0]) return [values[0].path, values[0].message].filter(Boolean).join(' · '); } catch {}
  return null;
}
function serverFeedback(row) {
  if (!row) return null;
  const http = Number(row.http_status || 0), violation = firstServerViolation(row), fallback = violation || row.error_message || row.error_code || null;
  if (http === 404) return `Intranet HTTP 404 · client ou ressource introuvable/non autorisée${fallback ? ` · ${fallback}` : ''}`;
  if (http === 403) return `Intranet HTTP 403 · tablette non autorisée${fallback ? ` · ${fallback}` : ''}`;
  if (http === 422) return `Intranet HTTP 422 · visite, trame, local ou photo refusé${fallback ? ` · ${fallback}` : ''}`;
  if (http === 409) return `Intranet HTTP 409 · conflit de synchronisation${fallback ? ` · ${fallback}` : ''}`;
  if (http) return `Intranet HTTP ${http}${fallback ? ` · ${fallback}` : ''}`;
  return fallback;
}
function localBindingFeedback(error) {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  return issues.length ? `${error?.message || 'Visite non envoyable'}\n\n${issues.slice(0, 7).map((x) => `• ${x}`).join('\n')}${issues.length > 7 ? `\n• … ${issues.length - 7} autre(s)` : ''}` : String(error?.message || error || 'Visite non envoyable');
}

async function runIntranetSyncCycle({ visitLimit = 3, photoLimit = 12 } = {}) {
  await processVisitOutbox({ limit: visitLimit }).catch(() => {});
  await processVisitPhotoOutbox({ limit: photoLimit }).catch(() => {});
}

export function IntranetVisitSyncRuntime() {
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) runIntranetSyncCycle().catch(() => {}); };
    const startup = setTimeout(run, 1200), interval = setInterval(run, 60_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => { alive = false; clearTimeout(startup); clearInterval(interval); subscription.remove(); };
  }, []);
  return null;
}

export function IntranetVisitSyncBanner() {
  const [rows, setRows] = useState([]);
  const refresh = useCallback(() => listVisitOutbox().then(setRows).catch(() => {}), []);
  useEffect(() => {
    refresh();
    const a = subscribeVisitOutbox(refresh), b = subscribeVisitPhotoOutbox(refresh);
    return () => { a(); b(); };
  }, [refresh]);
  if (!rows.length) return null;
  const sending = rows.filter((r) => r.status === 'sending').length, waiting = rows.filter((r) => ['pending', 'retry'].includes(r.status)).length, blocked = rows.length - sending - waiting;
  return <View accessibilityLiveRegion="polite" style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: blocked ? '#FFF1F0' : '#FFF8ED', borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '800' }}>Intranet · {sending ? `${sending} envoi en cours` : `${waiting} en attente`}{blocked ? ` · ${blocked} à corriger` : ''}</Text>{waiting ? <TouchableOpacity accessibilityRole="button" onPress={() => runIntranetSyncCycle({ visitLimit: 3, photoLimit: 12 }).catch(() => {})} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 }}><Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 12 }}>Synchroniser</Text></TouchableOpacity> : null}</View>;
}

function initialUploadRowFromVisit(visite) {
  if (!visite?.intranet_sync_status) return null;
  return {
    visite_id: visite.id,
    status: visite.intranet_sync_status,
    remote_visit_id: visite.intranet_remote_visit_id || null,
    error_code: visite.intranet_sync_error || null,
    error_message: visite.intranet_sync_error_message || null,
  };
}

function initialPhotoStateFromVisit(visite, row) {
  if (Number(visite?.api_is_historical) === 1) return { ready: true, complete: true, localCount: 0, unscheduledCount: 0, pendingCount: 0, errorCount: 0, syncedCount: 0 };
  const known = ['intranet_photo_local_count', 'intranet_photo_unscheduled_count', 'intranet_photo_pending_count', 'intranet_photo_error_count', 'intranet_photo_synced_count'].some((key) => visite?.[key] != null);
  if (!known) return null;
  const localCount = Number(visite?.intranet_photo_local_count || 0);
  const unscheduledCount = Number(visite?.intranet_photo_unscheduled_count || 0);
  const pendingCount = Number(visite?.intranet_photo_pending_count || 0);
  const errorCount = Number(visite?.intranet_photo_error_count || 0);
  const syncedCount = Number(visite?.intranet_photo_synced_count || 0);
  const cleanBusiness = Number(visite?.api_content_revision || 0) === Number(visite?.api_synced_revision || 0);
  const ready = row?.status === 'synced' && Boolean(row?.remote_visit_id) && cleanBusiness;
  return { ready, complete: ready && unscheduledCount === 0 && pendingCount === 0 && errorCount === 0, localCount, unscheduledCount, pendingCount, errorCount, syncedCount, remoteVisitId: row?.remote_visit_id || null };
}

export function useVisitUploadState(visiteId, { initialRow = null, initialPhotoState = null, passive = false } = {}) {
  const [row, setRow] = useState(initialRow);
  const [photoState, setPhotoState] = useState(initialPhotoState);
  const [loading, setLoading] = useState(!passive && !initialRow);
  const refresh = useCallback(async () => {
    if (!visiteId) return null;
    try {
      const [next, photos] = await Promise.all([getVisitUploadState(visiteId), getVisitPhotoSyncState(visiteId)]);
      setRow(next); setPhotoState(photos);
      return { row: next, photoState: photos };
    } finally { setLoading(false); }
  }, [visiteId]);
  useEffect(() => {
    if (passive) { setRow(initialRow); setPhotoState(initialPhotoState); setLoading(false); return undefined; }
    setLoading(true); refresh();
    const a = subscribeVisitOutbox(refresh), b = subscribeVisitPhotoOutbox(refresh);
    return () => { a(); b(); };
  }, [refresh, passive, initialRow?.status, initialRow?.remote_visit_id, initialRow?.error_code, initialRow?.error_message, initialPhotoState?.unscheduledCount, initialPhotoState?.pendingCount, initialPhotoState?.errorCount, initialPhotoState?.syncedCount]);
  return { row, photoState, loading, refresh };
}

async function bindSameImportedClient(visiteId) {
  try { return await bindVisitToImportedClientTarget(visiteId); }
  catch (error) {
    const refreshable = error?.remoteClientId && ['imported_site_missing', 'intranet_reference_refresh_required', 'wrong_imported_site'].includes(error?.code);
    if (!refreshable) throw error;
    try { await syncClientPreparation(error.remoteClientId); }
    catch (refreshError) {
      const wrapped = new Error(`Impossible d’actualiser le client Intranet avant l’envoi : ${String(refreshError?.message || refreshError)}`);
      wrapped.code = refreshError?.code || error?.code; wrapped.remoteClientId = error.remoteClientId; throw wrapped;
    }
    return bindVisitToImportedClientTarget(visiteId);
  }
}

async function assertQueuedClientStillMatchesImportedClient(visiteId, row) {
  if (!row?.remote_client_id) return;
  const options = await getVisitIntranetBindingOptions(visiteId), expected = options?.selectedClientId;
  if (!expected) { const error = new Error('Le client Intranet d’origine de cette visite n’est plus identifiable. Cet ancien envoi reste bloqué pour éviter de l’expédier vers un autre client.'); error.code = 'queued_client_unresolved'; throw error; }
  if (String(expected) !== String(row.remote_client_id)) { const error = new Error('Cet envoi en attente a été préparé avec un autre client Intranet par une ancienne version de METRA. Il ne sera pas rejoué automatiquement. La visite doit rester liée à son client importé d’origine.'); error.code = 'queued_client_mismatch'; throw error; }
}

export function IntranetVisitSyncControl({ visite, onVisitChanged = null, compact = false, passive = false }) {
  const visiteId = visite?.id;
  const initialRow = useMemo(() => initialUploadRowFromVisit(visite), [visite?.id, visite?.intranet_sync_status, visite?.intranet_remote_visit_id, visite?.intranet_sync_error, visite?.intranet_sync_error_message]);
  const initialPhotoState = useMemo(() => initialPhotoStateFromVisit(visite, initialRow), [visite, initialRow]);
  const { row, photoState, loading, refresh } = useVisitUploadState(visiteId, { initialRow, initialPhotoState, passive });
  const [busy, setBusy] = useState(false);
  const historical = Number(visite?.api_is_historical) === 1;
  const contentRevision = Number(visite?.api_content_revision || 0), syncedRevision = Number(visite?.api_synced_revision || 0), dirty = contentRevision !== syncedRevision;
  const photosComplete = historical || photoState == null || photoState.complete;
  const online = (historical || row?.status === 'synced') && !dirty && photosComplete;
  const hardIdempotencyConflict = row?.error_code === 'idempotency_conflict', invalidAck = row?.error_code === 'invalid_ack';

  const syncPhotosForCurrentVisit = async () => {
    const queued = await queueVisitPhotosForSyncedVisit(visiteId);
    if (queued?.errors?.length) {
      Alert.alert('Certaines photos ne peuvent pas être préparées', queued.errors.slice(0, 5).map((item) => `• ${item.message}`).join('\n') + (queued.errors.length > 5 ? `\n• … ${queued.errors.length - 5} autre(s)` : ''));
    }
    await processVisitPhotoOutbox({ limit: 6, visitIds: [visiteId], discover: false }).catch(() => {});
  };

  const finishQueueAndSend = async (confirmMaterialReplacement = false) => {
    await queueVisitUpload(visiteId, { confirmMaterialReplacement });
    await onVisitChanged?.(); await refresh();
    await processVisitOutbox({ limit: 1 }).catch(() => {});
    const finalRow = await getVisitUploadState(visiteId);
    if (finalRow?.status === 'synced') await syncPhotosForCurrentVisit();
    await refresh(); await onVisitChanged?.();
    const finalState = await getVisitUploadState(visiteId);
    if (finalState && ['validation_error', 'rejected', 'conflict', 'auth_error'].includes(finalState.status)) Alert.alert('Envoi Intranet non validé', serverFeedback(finalState) || 'L’Intranet a refusé ou interrompu l’envoi. La visite reste Offline.');
    const finalPhotos = await getVisitPhotoSyncState(visiteId);
    if (finalPhotos.errorCount) Alert.alert('Photos Intranet à corriger', `${finalPhotos.errorCount} photo${finalPhotos.errorCount > 1 ? 's' : ''} n’a pas été acceptée. La visite reste Offline tant que toutes les photos locales ne sont pas confirmées par l’Intranet.`);
  };
  const queueWithMaterialSafety = async () => {
    try { await finishQueueAndSend(false); }
    catch (error) {
      if (['material_replacement_confirmation_required', 'material_clear_confirmation_required'].includes(error?.code)) {
        const prepared = error?.prepared, destructiveClear = Number(prepared?.summary?.materials || 0) === 0;
        Alert.alert(destructiveClear ? 'Attention : listing matériel vidé' : 'Attention : matériels supprimés de l’Intranet', `${error.message}\n\nLe serveur remplace le listing matériel complet du local.`, [
          { text: 'Annuler', style: 'cancel' },
          { text: destructiveClear ? 'Confirmer le listing vide' : 'Confirmer le remplacement', style: 'destructive', onPress: () => { setBusy(true); finishQueueAndSend(true).catch((e) => Alert.alert('Envoi impossible', localBindingFeedback(e))).finally(() => setBusy(false)); } },
        ]);
        return;
      }
      throw error;
    }
  };

  const prepareAndSend = async () => {
    if (busy || loading || online || row?.status === 'sending') return;
    setBusy(true);
    try {
      if (!dirty && row?.status === 'synced' && !historical && photoState && !photoState.complete) {
        await retryVisitPhotoUploadsNow(visiteId).catch(() => {});
        await syncPhotosForCurrentVisit();
        await refresh(); await onVisitChanged?.();
        const after = await getVisitPhotoSyncState(visiteId);
        if (after.errorCount) Alert.alert('Photos Intranet à corriger', `${after.errorCount} photo${after.errorCount > 1 ? 's' : ''} reste${after.errorCount > 1 ? 'nt' : ''} refusée${after.errorCount > 1 ? 's' : ''}. Les autres photos continuent de se synchroniser indépendamment.`);
        return;
      }
      if (hardIdempotencyConflict || invalidAck) {
        Alert.alert('Envoi Intranet verrouillé', hardIdempotencyConflict ? 'Le même envoiId existe déjà avec un contenu différent. METRA ne crée pas un nouvel envoi afin d’éviter un doublon.' : 'L’accusé serveur est incohérent et la visite a peut-être déjà été créée. METRA ne génère pas un nouvel envoi automatiquement.');
        return;
      }
      if (row && ['pending', 'retry', 'auth_error'].includes(row.status)) {
        await assertQueuedClientStillMatchesImportedClient(visiteId, row); await retryVisitUploadNow(visiteId); await syncPhotosForCurrentVisit(); await refresh(); await onVisitChanged?.(); return;
      }
      if (row && ['validation_error', 'rejected', 'conflict'].includes(row.status)) {
        if (row.status === 'conflict' && row.remote_client_id) { try { await syncClientPreparation(row.remote_client_id); } catch (e) { throw new Error(`Impossible d’actualiser le même client Intranet après le conflit : ${String(e?.message || e)}`); } }
        const discarded = await discardTerminalVisitUpload(visiteId); if (!discarded) throw new Error('Cet envoi ne peut pas encore être reconstruit sans risque de doublon.');
      }
      await bindSameImportedClient(visiteId); await onVisitChanged?.();
      const final = ['terminee', 'exportee'].includes(visite?.statut);
      if (!final) {
        Alert.alert('Visite non terminée', 'La visite est encore en cours. L’envoi vers l’Intranet crée une visite serveur : termine-la avant de l’envoyer.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Finaliser et envoyer', onPress: () => { setBusy(true); finalizeVisitForUpload(visiteId).then(() => queueWithMaterialSafety()).catch((e) => Alert.alert('Envoi impossible', localBindingFeedback(e))).finally(() => setBusy(false)); } },
        ]);
        return;
      }
      await queueWithMaterialSafety();
    } catch (error) { Alert.alert('Visite non envoyable', localBindingFeedback(error)); }
    finally { setBusy(false); }
  };

  const photoPending = Number(photoState?.pendingCount || 0) + Number(photoState?.unscheduledCount || 0);
  const photoErrors = Number(photoState?.errorCount || 0);
  const detail = online
    ? (historical && !row?.remote_visit_id ? 'Déjà présente sur l’Intranet (visite importée).' : `Export Intranet confirmé${row?.remote_visit_id ? ` · visite n°${row.remote_visit_id}` : ''}${Number(photoState?.localCount || 0) ? ` · ${photoState.localCount} photo${photoState.localCount > 1 ? 's' : ''}` : ''}.`)
    : !dirty && row?.status === 'synced' && photoErrors ? `${photoErrors} photo${photoErrors > 1 ? 's' : ''} refusée${photoErrors > 1 ? 's' : ''} ou à corriger. Appuie sur Offline pour reprendre les envois possibles.`
      : !dirty && row?.status === 'synced' && photoPending ? `${photoPending} photo${photoPending > 1 ? 's' : ''} à envoyer vers la visite Intranet n°${row.remote_visit_id}.`
        : dirty && (historical || row?.status === 'synced') ? 'Modifications locales non envoyées. Appuie sur Offline pour créer une nouvelle visite Intranet avec ces changements.'
          : row?.status === 'sending' ? 'Envoi vers le même client Intranet en cours…'
            : row?.status === 'pending' ? 'Envoi en attente.'
              : row?.status === 'retry' ? 'Non exportée · nouvelle tentative dès que la connexion le permet.'
                : row?.status === 'auth_error' ? 'Non exportée · connexion Intranet à réactiver.'
                  : serverFeedback(row) || 'Non exportée sur l’Intranet. Appuie sur Offline pour l’envoyer au client importé.';
  const detailIsError = !online && ((row && ['validation_error', 'rejected', 'conflict', 'auth_error'].includes(row.status)) || photoErrors > 0);

  return <View style={compact ? { alignItems: 'flex-end' } : { borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, backgroundColor: '#F8FAFC', padding: 10, marginVertical: 7 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      {!compact ? <Text style={{ flex: 1, color: COLORS.ink, fontSize: 12.5, fontWeight: '900' }}>Intranet</Text> : null}
      {busy || row?.status === 'sending' ? <ActivityIndicator size="small" color={online ? ONLINE : OFFLINE} /> : null}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={online ? 'Online, visite et photos présentes sur l’Intranet' : 'Offline, appuyer pour synchroniser la visite et ses photos sur l’Intranet'} disabled={loading || busy || online || row?.status === 'sending'} onPress={(event) => { event?.stopPropagation?.(); prepareAndSend().catch(() => {}); }} style={{ minWidth: 82, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: online ? ONLINE : OFFLINE, opacity: loading ? 0.55 : 1 }}><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.3 }}>{online ? 'Online' : 'Offline'}</Text></TouchableOpacity>
    </View>
    {!compact ? <Text accessibilityLiveRegion="polite" style={{ color: detailIsError ? ERROR : COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 6 }}>{loading ? 'Lecture de l’état Intranet…' : detail}</Text> : null}
  </View>;
}

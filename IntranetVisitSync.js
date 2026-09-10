import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import {
  discardTerminalVisitUpload, finalizeVisitForUpload, getVisitUploadState, listVisitOutbox, previewVisitUpload,
  processVisitOutbox, queueVisitUpload, retryVisitUploadNow, subscribeVisitOutbox,
} from './intranetVisitOutboxDb.js';
import { IntranetVisitDestinationPicker } from './IntranetVisitDestinationPicker.js';

const STATUS = Object.freeze({
  pending: ['En attente d’envoi', '#805017'], sending: ['Envoi vers l’Intranet…', COLORS.primary],
  retry: ['En attente de connexion / nouvelle tentative', '#805017'], synced: ['Synchronisée avec l’Intranet', '#16794B'],
  conflict: ['Conflit de synchronisation', '#B42318'], validation_error: ['Données refusées à corriger', '#B42318'],
  rejected: ['Envoi refusé', '#B42318'], auth_error: ['Connexion Intranet à réactiver', '#B42318'],
});

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
  if (http === 404) return `Réponse Intranet HTTP 404 · client introuvable ou non autorisé pour cette tablette${fallback ? ` · ${fallback}` : ''}`;
  if (http === 403) return `Réponse Intranet HTTP 403 · tablette non autorisée à écrire${fallback ? ` · ${fallback}` : ''}`;
  if (http === 422) return `Réponse Intranet HTTP 422 · données, trame, local ou association client/site refusés${fallback ? ` · ${fallback}` : ''}`;
  if (http === 409) return `Réponse Intranet HTTP 409 · conflit de synchronisation${fallback ? ` · ${fallback}` : ''}`;
  if (http) return `Réponse Intranet HTTP ${http}${fallback ? ` · ${fallback}` : ''}`;
  return fallback;
}

export function IntranetVisitSyncRuntime() {
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) processVisitOutbox({ limit: 3 }).catch(() => {}); };
    const startup = setTimeout(run, 1200);
    const interval = setInterval(run, 60_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => { alive = false; clearTimeout(startup); clearInterval(interval); subscription.remove(); };
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
    {waiting ? <TouchableOpacity accessibilityRole="button" onPress={() => processVisitOutbox({ limit: 3 }).catch(() => {})} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 }}><Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 12 }}>Synchroniser</Text></TouchableOpacity> : null}
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

export function IntranetVisitSyncControl({ visite, onVisitChanged = null }) {
  const visiteId = visite?.id;
  const { row, loading, refresh } = useVisitUploadState(visiteId);
  const [busy, setBusy] = useState(false);
  const [bindingVisible, setBindingVisible] = useState(false);
  if (Number(visite?.api_is_historical) === 1) return null;
  const linkedToIntranet = Boolean(visite?.api_remote_local_id);

  const confirmAndQueue = async (replaceTerminal = false, finalizeFirst = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const preview = await previewVisitUpload(visiteId);
      const summary = preview.summary;
      const progressWarning = finalizeFirst && Number(visite.progression_pct || 0) < 100
        ? `\n\nAttention : la visite n’est renseignée qu’à ${visite.progression_pct || 0} %. Les champs obligatoires Intranet doivent malgré tout être valides.` : '';
      const materialWarning = preview.destructiveMaterialClear
        ? `\n\nATTENTION : le listing Intranet contenait ${preview.sourceMaterialCount} matériel(s) et METRA en enverra 0. Le serveur supprimera tout le listing matériel de ce local.` : '';
      const submit = async (confirmMaterialClear = false) => {
        setBusy(true);
        try {
          if (finalizeFirst) await finalizeVisitForUpload(visiteId);
          await queueVisitUpload(visiteId, { confirmMaterialClear, replaceTerminal });
          await onVisitChanged?.();
          await refresh();
          processVisitOutbox({ limit: 1 }).catch(() => {});
        } catch (error) {
          if (error?.code === 'material_clear_confirmation_required') {
            Alert.alert(
              'Attention : listing matériel vidé',
              `${error.message}\n\nCette action remplacera le listing matériel complet de ce local dans l’Intranet.`,
              [{ text: 'Annuler', style: 'cancel' }, { text: 'Confirmer le listing vide', style: 'destructive', onPress: () => submit(true).catch(() => {}) }]
            );
            return;
          }
          const issues = error?.issues || [];
          Alert.alert('Envoi impossible', issues.length ? `${error.message}\n\n${issues.slice(0, 7).map((x) => `• ${x}`).join('\n')}${issues.length > 7 ? `\n• … ${issues.length - 7} autre(s)` : ''}` : String(error?.message || error));
        } finally { setBusy(false); }
      };
      Alert.alert(
        finalizeFirst ? 'Finaliser et envoyer cette visite ?' : 'Envoyer cette visite vers l’Intranet ?',
        `${summary.criteria} critères · ${summary.remarks} réserve(s) · ${summary.materials} matériel(s) · ${summary.notes} note(s).${progressWarning}${materialWarning}\n\nLes photos et la conclusion ne sont pas incluses : la route serveur fournie ne les accepte pas.\n\nLe contenu est figé au moment de la mise en file. En cas de coupure, METRA reprend le même envoi sans créer de doublon.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: preview.destructiveMaterialClear ? 'Vider le listing et envoyer' : (finalizeFirst ? 'Finaliser et envoyer' : 'Mettre en attente / envoyer'), style: preview.destructiveMaterialClear ? 'destructive' : 'default', onPress: () => submit(preview.destructiveMaterialClear).catch(() => {}) },
        ]
      );
    } catch (error) {
      const issues = error?.issues || [];
      Alert.alert('Visite non envoyable', issues.length ? `${error.message}\n\n${issues.slice(0, 7).map((x) => `• ${x}`).join('\n')}${issues.length > 7 ? `\n• … ${issues.length - 7} autre(s)` : ''}` : String(error?.message || error));
    } finally { setBusy(false); }
  };

  const label = row ? (STATUS[row.status]?.[0] || row.status) : (!linkedToIntranet ? 'Destination Intranet à choisir' : (visite.statut === 'terminee' || visite.statut === 'exportee' ? 'Prête à envoyer' : 'Finaliser avant envoi'));
  const color = row ? (STATUS[row.status]?.[1] || COLORS.muted) : COLORS.muted;
  const detail = row?.status === 'synced' ? `Réponse Intranet OK · visite n°${row.remote_visit_id}${row.replayed ? ' · accusé rejoué sans doublon' : ''}`
    : serverFeedback(row) || (row?.status === 'conflict' ? 'Une visite plus récente existe sur le serveur. Actualise la préparation Intranet avant de préparer une nouvelle visite.' : null);
  const hardIdempotencyConflict = row?.error_code === 'idempotency_conflict';
  const invalidAck = row?.error_code === 'invalid_ack';
  const terminalEditable = row && row.status === 'validation_error';
  const retryable = row && ['pending', 'retry', 'auth_error'].includes(row.status);
  const destinationChangeAllowed = !row || (
    ['validation_error', 'rejected', 'conflict'].includes(row.status)
    && !hardIdempotencyConflict
    && !invalidAck
  );
  const changeDestination = async () => {
    if (busy || !destinationChangeAllowed) return;
    if (row) {
      setBusy(true);
      try {
        const discarded = await discardTerminalVisitUpload(visiteId);
        if (!discarded) {
          Alert.alert('Destination verrouillée', 'Cet envoi ne peut pas changer de destination dans son état actuel.');
          return;
        }
        await refresh();
      } finally { setBusy(false); }
    }
    setBindingVisible(true);
  };

  return <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, backgroundColor: '#F8FAFC', padding: 10, marginVertical: 7 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}><Text style={{ color: COLORS.ink, fontSize: 12.5, fontWeight: '900' }}>Synchronisation Intranet</Text><Text accessibilityLiveRegion="polite" style={{ color, fontSize: 11.5, fontWeight: '800', marginTop: 3 }}>{loading ? 'Lecture de l’état…' : label}</Text>{detail ? <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 3 }}>{detail}</Text> : null}</View>
      {busy || row?.status === 'sending' ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
    </View>
    {!row && !linkedToIntranet ? <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={() => setBindingVisible(true)} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>Choisir la destination Intranet</Text></TouchableOpacity> : null}
    {!row && linkedToIntranet ? <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={() => confirmAndQueue(false, !['terminee','exportee'].includes(visite.statut))} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>{['terminee','exportee'].includes(visite.statut) ? 'Préparer et envoyer' : 'Finaliser et préparer l’envoi'}</Text></TouchableOpacity> : null}
    {!row && linkedToIntranet ? <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={changeDestination} style={{ minHeight: 38, marginTop: 4, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.primary, fontSize: 11.5, fontWeight: '900' }}>Modifier la destination Intranet</Text></TouchableOpacity> : null}
    {row && destinationChangeAllowed ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={changeDestination} style={[styles.btnSecondary, { minHeight: 44, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>Changer / actualiser la destination</Text></TouchableOpacity> : null}
    {retryable ? <TouchableOpacity accessibilityRole="button" disabled={busy || row?.status === 'sending'} onPress={() => { setBusy(true); retryVisitUploadNow(visiteId).then(refresh).finally(() => setBusy(false)); }} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>{row?.status === 'auth_error' ? 'Réessayer après réactivation' : 'Réessayer maintenant'}</Text></TouchableOpacity> : null}
    {terminalEditable ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => confirmAndQueue(true, false)} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>Repréparer après correction</Text></TouchableOpacity> : null}
    {row && ['pending','sending','retry'].includes(row.status) ? <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>L’envoi est figé avec son envoiId. Les corrections faites après sa mise en file ne modifieront pas cette tentative : attends son résultat avant de reprendre la visite.</Text> : null}
    {row?.status === 'synced' ? <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>Cette visite a déjà été créée sur l’Intranet. Pour un nouveau constat, crée une nouvelle visite METRA au lieu de renvoyer celle-ci.</Text> : null}
    {hardIdempotencyConflict ? <Text style={{ color: '#B42318', fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>Conflit d’idempotence : ne génère pas un nouvel envoi. Le même envoiId existe avec un contenu différent ; conserve cette visite et fais contrôler le serveur.</Text> : null}
    {invalidAck ? <Text style={{ color: '#B42318', fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>Accusé serveur incohérent : ne génère pas un nouvel envoi. Le serveur a peut-être déjà créé la visite ; conserve cet envoiId et fais contrôler l’Intranet.</Text> : null}
    {row?.status === 'conflict' ? <Text style={{ color: '#B42318', fontSize: 10.5, lineHeight: 15, marginTop: 7 }}>Cet envoi n’est pas répété automatiquement. Recharge les données du local depuis l’Intranet avant de repartir d’une référence récente.</Text> : null}
    <IntranetVisitDestinationPicker visible={bindingVisible} visiteId={visiteId} onClose={() => setBindingVisible(false)} onBound={async () => { setBindingVisible(false); await onVisitChanged?.(); await refresh(); }} />
  </View>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from './styles.js';
import { loadCachedLatestVisitPhotos, syncLatestVisitPhotosManifest } from './latestVisitPhotosStorage.js';
import { filterLatestVisitPhotos, photoSummary, formatPhotoBytes } from './latestVisitPhotoModel.js';

export function SitePhotoPreparationOption({ clientId, siteIds, enabled, onEnabledChange, onPlanChange, activated, disabled }) {
  const [manifest, setManifest] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(null), [attempt, setAttempt] = useState(0);
  const selectionKey = JSON.stringify(siteIds);
  useEffect(() => {
    if (!clientId || !enabled) return undefined;
    let alive = true;
    setManifest(null); setLoading(true); setError(null);
    (async () => {
      const cached = await loadCachedLatestVisitPhotos(clientId);
      if (alive) setManifest(cached);
      if (activated) {
        try { const fresh = await syncLatestVisitPhotosManifest(clientId); if (alive) setManifest(fresh); }
        catch { if (alive) setError(cached ? 'Liste enregistrée utilisée : actualisation indisponible.' : 'Photos non disponibles. Réessaie ou désactive cette option pour importer les données seules.'); }
      } else if (alive) setError('Connexion Intranet activée requise pour récupérer les photos manquantes.');
    })().catch(() => { if (alive) setError('Lecture des photos impossible. Réessaie ou importe les données seules.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId, enabled, activated, attempt]);
  const plan = useMemo(() => {
    const selected = filterLatestVisitPhotos(manifest, { siteIds });
    const summary = photoSummary(selected);
    const present = new Set((selected?.sites || []).map((s) => String(s.site.id)));
    const missingSites = siteIds.filter((id) => !present.has(String(id)));
    return { manifest: selected, summary, loading, error, ready: !loading && Boolean(selected) && !missingSites.length && (activated || !summary.missing), missingSites };
  }, [manifest, selectionKey, loading, error, activated]);
  useEffect(() => { onPlanChange(plan); }, [plan, onPlanChange]);
  return <View style={{ padding: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, marginBottom: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '700' }}>Inclure les photos des dernières visites</Text><Switch accessibilityLabel="Inclure les photos des sites sélectionnés" value={enabled} onValueChange={onEnabledChange} disabled={disabled} /></View>
    {enabled ? <>
      {loading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><ActivityIndicator size="small" /><Text style={{ color: COLORS.muted }}>Vérification des photos…</Text></View> : <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>{plan.summary.known ? `${plan.summary.missing} photos à récupérer · ${formatPhotoBytes(plan.summary.bytes)} · ${plan.summary.saved} déjà enregistrées${plan.summary.unavailable ? ` · ${plan.summary.unavailable} indisponibles` : ''}${plan.summary.unknownSizes ? ' · taille partiellement inconnue' : ''}` : 'Volume non connu'}</Text>}
      {plan.missingSites.length && manifest ? <Text style={{ color: '#9A4C0A', marginTop: 5 }}>{plan.missingSites.length} site(s) absent(s) de la liste des photos.</Text> : null}
      {error ? <Text style={{ color: '#9A4C0A', fontSize: 12, lineHeight: 17, marginTop: 5 }}>{error}</Text> : null}
      {!loading && (!plan.ready || error) ? <TouchableOpacity disabled={disabled} onPress={() => setAttempt((n) => n + 1)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: COLORS.primary, fontWeight: '700' }}>Réessayer les photos</Text></TouchableOpacity> : null}
      <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>Uniquement les sites sélectionnés. Le téléchargement continuera pendant le travail dans METRA.</Text>
    </> : <Text style={{ color: COLORS.muted, fontSize: 12 }}>Les données seront importées sans télécharger de photos.</Text>}
  </View>;
}

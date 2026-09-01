import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { HEALTH_DIMENSIONS, getSiteHealth, saveSiteHealthMode } from './siteHealth.js';

function scoreColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return COLORS.inkFaint;
  if (n >= 80) return COLORS.green || '#2E7D32';
  if (n >= 60) return COLORS.amber || '#B45309';
  return COLORS.red || '#B91C1C';
}

function scoreText(score) {
  return Number.isFinite(Number(score)) ? `${Math.round(Number(score))}/100` : 'N/C';
}

function Indicator({ dimension, details }) {
  const score = dimension.score;
  const key = dimension.key;
  let detail = '';
  if (key === 'conformite') detail = `${details?.controles?.s || 0} S · ${details?.controles?.ns || 0} NS · ${details?.controles?.neutral || 0} neutres`;
  if (key === 'reserves') detail = `${details?.reserves?.ouvertes || 0} ouverte(s) · ${details?.reserves?.levees || 0} levée(s)`;
  if (key === 'equipements') detail = `${details?.equipements?.actifs || 0} actif(s) · ${details?.equipements?.aSurveiller || 0} à surveiller`;
  if (key === 'suivi') detail = details?.visitAgeDays === null || details?.visitAgeDays === undefined ? 'Aucune visite de référence' : `Dernière visite il y a ${details.visitAgeDays} jour(s)`;
  if (key === 'donnees') detail = 'Basé sur la progression de la visite de référence';
  return (
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 13, marginBottom: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: COLORS.ink }}>{dimension.label}</Text>
        <Text style={{ fontSize: 17, fontWeight: '900', color: scoreColor(score) }}>{scoreText(score)}</Text>
      </View>
      {detail ? <Text style={{ marginTop: 4, fontSize: 10.5, color: COLORS.inkSoft }}>{detail}</Text> : null}
    </View>
  );
}

export function SiteHealthPanel({ siteId, siteName = 'Site' }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState(null);
  const [mode, setMode] = useState('auto');
  const [manual, setManual] = useState({});
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const value = await getSiteHealth(siteId);
      setHealth(value);
      setMode(value?.settings?.mode === 'manual' ? 'manual' : 'auto');
      const scores = {};
      for (const dimension of HEALTH_DIMENSIONS) {
        const current = value?.settings?.scores?.[dimension.key];
        scores[dimension.key] = Number.isFinite(Number(current)) ? String(Math.round(Number(current))) : '';
      }
      setManual(scores);
      setComment(value?.settings?.comment || '');
    } catch (error) {
      Alert.alert('Santé du site', String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!siteId || saving) return;
    setSaving(true);
    try {
      const scores = {};
      for (const dimension of HEALTH_DIMENSIONS) {
        const raw = String(manual[dimension.key] ?? '').trim();
        if (!raw) { scores[dimension.key] = null; continue; }
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${dimension.label} doit être compris entre 0 et 100.`);
        scores[dimension.key] = Math.round(n);
      }
      await saveSiteHealthMode(siteId, mode, scores, comment);
      await load();
      Alert.alert('Santé du site', mode === 'manual' ? 'Appréciation manuelle enregistrée.' : 'Calcul automatique réactivé depuis la dernière visite.');
    } catch (error) {
      Alert.alert('Enregistrement impossible', String(error?.message || error));
    } finally {
      setSaving(false);
    }
  }, [siteId, saving, manual, mode, comment, load]);

  const source = useMemo(() => health?.automatic?.source || health?.source, [health]);

  if (loading) return <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.orange} size="large"/><Text style={{ marginTop: 10, color: COLORS.inkSoft }}>Calcul de la santé du site…</Text></View>;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: '#FFF7F1', borderWidth: 1, borderColor: '#F6C7AD', borderRadius: 15, padding: 15, marginBottom: 14 }}>
        <Text style={{ fontSize: 11, fontWeight: '900', color: COLORS.orangeDark }}>LAB METRA · SANTÉ DU SITE</Text>
        <Text style={{ marginTop: 5, fontSize: 20, fontWeight: '900', color: COLORS.ink }}>{siteName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
          <Text style={{ fontSize: 38, lineHeight: 42, fontWeight: '900', color: scoreColor(health?.overall) }}>{Number.isFinite(Number(health?.overall)) ? Math.round(Number(health.overall)) : '—'}</Text>
          <Text style={{ marginLeft: 4, marginBottom: 5, fontSize: 13, color: COLORS.inkSoft }}>/ 100 · {health?.level?.label || 'Données insuffisantes'}</Text>
        </View>
        <Text style={{ marginTop: 5, fontSize: 10.5, color: COLORS.inkSoft }}>
          {mode === 'manual' ? 'Source : appréciation manuelle' : source?.date ? `Source : dernière visite de référence du ${source.date}` : 'Source : aucune visite exploitable'}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Indicateurs</Text>
      {(health?.dimensions || []).map((dimension) => <Indicator key={dimension.key} dimension={dimension} details={health?.details} />)}

      <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Mode de mise à jour</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setMode('auto')} style={[styles.btnSecondary, { flex: 1 }, mode === 'auto' && { borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight }]}><Text style={styles.btnSecondaryText}>Automatique</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('manual')} style={[styles.btnSecondary, { flex: 1 }, mode === 'manual' && { borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight }]}><Text style={styles.btnSecondaryText}>Manuel</Text></TouchableOpacity>
      </View>

      {mode === 'auto' ? (
        <View style={{ padding: 13, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line }}>
          <Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 12 }}>Calcul depuis la dernière visite</Text>
          <Text style={{ marginTop: 5, color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>Conformité : avis S/NS. Réserves : suivi patrimonial. Équipements : états à surveiller. Suivi : ancienneté de la visite et traitement des réserves. Données : progression de la visite.</Text>
          <TouchableOpacity onPress={load} style={[styles.btnSecondary, { marginTop: 10 }]}><Text style={styles.btnSecondaryText}>↻ Recalculer maintenant</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={{ padding: 13, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line }}>
          <Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 12, marginBottom: 8 }}>Appréciation manuelle — 0 à 100</Text>
          {HEALTH_DIMENSIONS.map((dimension) => (
            <View key={dimension.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 11, color: COLORS.ink }}>{dimension.label}</Text>
              <TextInput
                value={manual[dimension.key] || ''}
                onChangeText={(value) => setManual((current) => ({ ...current, [dimension.key]: value }))}
                keyboardType="numeric"
                placeholder="—"
                style={[styles.input, { width: 78, textAlign: 'center', paddingVertical: 7 }]}
              />
            </View>
          ))}
          <TextInput value={comment} onChangeText={setComment} placeholder="Commentaire technique (optionnel)" multiline style={[styles.input, { marginTop: 5, minHeight: 72, textAlignVertical: 'top' }]} />
        </View>
      )}

      <TouchableOpacity disabled={saving} onPress={save} style={[styles.btnPrimary, { marginTop: 13, opacity: saving ? 0.55 : 1 }]}><Text style={styles.btnPrimaryText}>{saving ? 'Enregistrement…' : 'Enregistrer le mode de santé'}</Text></TouchableOpacity>
      <Text style={{ marginTop: 9, textAlign: 'center', fontSize: 9, color: COLORS.inkFaint }}>Indice expérimental d'aide au suivi patrimonial · ne remplace pas une conclusion réglementaire ou l'avis du technicien.</Text>
    </ScrollView>
  );
}

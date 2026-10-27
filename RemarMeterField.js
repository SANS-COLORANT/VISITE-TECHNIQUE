/** Extra REMAR meters per Excel/Intranet criterion, without changing Excel cells.
 * The first historical value stays in champs_visite until its first explicit
 * transition to persistent meters. No implicit migration or child deletion.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ajouterCompteur, listerCompteurs, upsertChamp, upsertCompteurChamp } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { useDurableAutosave } from './durableAutosave.js';
import { decouperReleves } from './releveMultiligne.js';
import { PhotoButton } from './PhotoButton.js';
import { COLORS, FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';

const loads = new Map();
function sharedMeters(visiteId) {
  const key = String(visiteId || '');
  if (!loads.has(key)) {
    const promise = listerCompteurs(visiteId).finally(() => loads.delete(key));
    loads.set(key, promise);
  }
  return loads.get(key);
}
function compteurNom(field) {
  return String(field.cle || 'Compteur').replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Compteur';
}
function compteurUnite(field) {
  return (String(field.cle || '').match(/\(([^)]+)\)/) || [])[1] || '';
}

function RemarCompteurLigne({ compteur, visiteId, premiere, sectionCode, champCle, onValeurPremiere }) {
  const [label, setLabel, flushLabel] = useDurableAutosave(compteur.label || '', (v) => upsertCompteurChamp(compteur.id, 'label', v));
  const [valeur, setValeur, flushValeur] = useDurableAutosave(compteur.valeur ?? '', async (v) => {
    await upsertCompteurChamp(compteur.id, 'valeur', v);
    if (premiere) {
      // The original field remains readable by the report and the old visit
      // progress engine. The extra values live only in compteurs.
      await upsertChamp(visiteId, sectionCode, champCle, v);
      onValeurPremiere?.(v);
    }
  });
  return <View style={st.compteurRow}>
    <View style={st.compteurTop}>
      <TextInput style={[st.input, st.nom]} accessibilityLabel="Nom du compteur"
        value={label} onChangeText={setLabel} onBlur={() => flushLabel().catch(console.warn)}
        placeholder="Nom du compteur" maxLength={110} />
      <PhotoButton visiteId={visiteId} entiteKey={`compteur||${compteur.id}`} label={label || champCle} />
    </View>
    <View style={st.valeurRow}>
      <TextInput style={[st.input, st.valeur]} accessibilityLabel={`Index de ${label || champCle}`}
        value={String(valeur ?? '')} onChangeText={setValeur} onBlur={() => flushValeur().catch(console.warn)}
        keyboardType="decimal-pad" inputMode="decimal" placeholder="Index…" maxLength={40}
        maxFontSizeMultiplier={1.25} />
      <Text style={st.unit}>{compteur.unite || ''}</Text>
    </View>
  </View>;
}

export function RemarMeterField({ visiteId, field, sectionCode, legacyValue, onLegacySaved }) {
  const [compteurs, setCompteurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const destination = String(field?.cle || '');
  const base = useMemo(() => compteurNom(field), [destination]);
  const unit = useMemo(() => compteurUnite(field), [destination]);
  const filter = useCallback((rows) => (rows || []).filter((c) => c.destination === destination), [destination]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    sharedMeters(visiteId).then((rows) => {
      if (!alive) return;
      setCompteurs(filter(rows));
    }).catch((e) => { if (alive) Alert.alert('Compteurs', String(e?.message || e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visiteId, filter]);
  const ajouter = async () => {
    if (adding || loading) return;
    setAdding(true);
    try {
      // If legacy Excel has only a single field (or a raw multi-line field),
      // preserve EVERY historical index before creating the next blank meter.
      if (!compteurs.length && String(legacyValue ?? '').trim()) {
        const previous = decouperReleves(legacyValue);
        for (let i = 0; i < previous.length; i++) {
          const r = previous[i];
          const id = await ajouterCompteur(visiteId, r.label || (i ? `${base} ${i + 1}` : base), destination);
          await upsertCompteurChamp(id, 'unite', r.unite || unit);
          await upsertCompteurChamp(id, 'valeur', r.valeur);
        }
      }
      const rank = Math.max(1, compteurs.length + (String(legacyValue ?? '').trim() && !compteurs.length ? decouperReleves(legacyValue).length : 0) + 1);
      const id = await ajouterCompteur(visiteId, rank === 1 ? base : `${base} ${rank}`, destination);
      await upsertCompteurChamp(id, 'unite', unit);
      setCompteurs(filter(await sharedMeters(visiteId)));
    } catch (e) {
      Alert.alert('Ajout compteur impossible', String(e?.message || e));
    } finally {
      setAdding(false);
    }
  };
  return <View style={st.wrap}>
    <View style={st.header}>
      <Text style={st.titre}>{destination}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ajouter un compteur : ${base}`}
        disabled={adding || loading} onPress={ajouter} style={[st.add, (adding || loading) && { opacity: 0.4 }]}>
        <CvcIcon name="plus" size={17} color={COLORS.orangeDark} />
        <Text style={st.addText}>Ajouter</Text>
      </TouchableOpacity>
    </View>
    {loading ? <Text style={st.helper}>Chargement…</Text> : compteurs.length
      ? <View style={st.rows}>{compteurs.map((compteur, i) =>
        <RemarCompteurLigne key={compteur.id} compteur={compteur} visiteId={visiteId}
          premiere={i === 0} sectionCode={sectionCode} champCle={destination} onValeurPremiere={onLegacySaved} />)}
        <Text style={st.helper}>Chaque compteur est exporté sur sa propre ligne dans la même cellule Excel / Intranet.</Text>
      </View>
      : <DurableChampGenerique visiteId={visiteId} sectionCode={sectionCode} field={field}
          valeurInitiale={legacyValue} onSaved={onLegacySaved} photo={true} />}
  </View>;
}

const st = StyleSheet.create({
  wrap: { paddingTop: 6, paddingBottom: 9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  titre: { flex: 1, fontSize: 12.5, fontFamily: FONTS.bold, color: COLORS.ink },
  add: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 9, minHeight: 40, borderWidth: 1, borderColor: COLORS.orange + '55', backgroundColor: COLORS.orangeLight, borderRadius: 13 },
  addText: { fontFamily: FONTS.bodySemi, fontSize: 11.5, color: COLORS.orangeDark },
  rows: { gap: 9 },
  compteurRow: { gap: 7, padding: 9, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12 },
  compteurTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  input: { color: COLORS.ink, fontFamily: FONTS.bodySemi, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 10, minHeight: 43 },
  nom: { flex: 1, fontSize: 12.5 },
  valeurRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  valeur: { flex: 1, fontSize: 16, fontFamily: FONTS.bold, minWidth: 0, textAlign: 'center' },
  unit: { minWidth: 33, fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft },
  helper: { fontSize: 10.5, color: COLORS.inkSoft, fontFamily: FONTS.bodyMedium },
});

/** Régulation virtualisée : aucune reconstruction globale au changement d'onglet. */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { TRAME_DATA, RESEAU_TEMPLATE } from './data.js';
import { listerReseaux, ajouterReseau, upsertReseauChamp, supprimerReseau } from './db.js';
import { prechargerDonneesTrameGenerique } from './TrameGenericPanel.js';
import { ChampGenerique, cleanLabel, extractUnit, getNumericConfig, StepperNumerique } from './GenericFields.js';
import { PhotoButton } from './PhotoButton.js';
import { styles } from './styles.js';

const cacheRegulation = new Map();
const CLE_TO_COL = {
  'T°ext(°C)': 't_ext_c',
  'T°dép(°C)': 't_dep_c',
  'Courbe de chauffe': 'courbe_de_chauffe',
  TNC: 'tnc',
  'Consigne et Programme horaire': 'consigne_programme_horaire',
};

export async function prechargerRegulation(visiteId, force = false) {
  const actuel = cacheRegulation.get(visiteId);
  if (!force && actuel?.data) return actuel.data;
  if (!force && actuel?.promise) return actuel.promise;
  const promise = Promise.all([
    prechargerDonneesTrameGenerique(visiteId, force),
    listerReseaux(visiteId),
  ]).then(([trame, reseaux]) => {
    const data = { champsMap: trame?.champsMap || {}, reseaux: reseaux || [] };
    cacheRegulation.set(visiteId, { data, promise: null });
    return data;
  }).catch((e) => { cacheRegulation.delete(visiteId); throw e; });
  cacheRegulation.set(visiteId, { data: actuel?.data || null, promise });
  return promise;
}

export function invaliderCacheRegulation(visiteId) { cacheRegulation.delete(visiteId); }

const ReseauCard = memo(function ReseauCard({ reseau, visiteId, onRemove }) {
  const fields = useMemo(() => RESEAU_TEMPLATE.filter((f) => f.cle !== 'Nom réseau'), []);
  const [nom, setNom] = useState(reseau.nom_reseau || '');
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.cle, reseau[CLE_TO_COL[f.cle]] ?? ''])));

  const saveNom = useCallback(() => {
    const v = nom.trim() || 'Réseau';
    if (v !== nom) setNom(v);
    if (v !== (reseau.nom_reseau || '')) upsertReseauChamp(reseau.id, 'nom_reseau', v).catch(console.warn);
  }, [nom, reseau.id, reseau.nom_reseau]);

  const saveField = useCallback((cle, value) => {
    setValues((old) => ({ ...old, [cle]: value }));
    const col = CLE_TO_COL[cle];
    if (col) upsertReseauChamp(reseau.id, col, value).catch(console.warn);
  }, [reseau.id]);

  return <View style={styles.formCard}>
    <View style={styles.reseauHeaderRow}>
      <TextInput style={styles.reseauNomInput} value={nom} onChangeText={setNom} onBlur={saveNom} />
      <PhotoButton visiteId={visiteId} entiteKey={reseau.reseau_site_id ? `reseau_site||${reseau.reseau_site_id}` : `reseau||${reseau.id}`} label={nom} />
      <TouchableOpacity onPress={() => onRemove(reseau.id)}><Text style={styles.removeLink}>Retirer</Text></TouchableOpacity>
    </View>
    {fields.map((f) => {
      const cfg = getNumericConfig(f.cle);
      return <View key={f.cle} style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>{cleanLabel(f.cle)}{extractUnit(f.cle) && !cfg ? ` (${extractUnit(f.cle)})` : ''}</Text>
        {cfg ? <StepperNumerique valeur={values[f.cle]} config={cfg} onChange={(v) => saveField(f.cle, v)} /> :
          <TextInput style={styles.input} value={String(values[f.cle] ?? '')} onChangeText={(t) => setValues((v) => ({ ...v, [f.cle]: t }))} onBlur={() => saveField(f.cle, values[f.cle])} />}
      </View>;
    })}
  </View>;
});

export function OptimizedRegulationPanel({ visiteId, onSaved }) {
  const cached = cacheRegulation.get(visiteId)?.data;
  const [champsMap, setChampsMap] = useState(cached?.champsMap || {});
  const [reseaux, setReseaux] = useState(cached?.reseaux || []);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    prechargerRegulation(visiteId).then((d) => { if (alive) { setChampsMap(d.champsMap); setReseaux(d.reseaux); } }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId]);

  const patchCache = useCallback((next) => {
    const c = cacheRegulation.get(visiteId)?.data;
    if (c) cacheRegulation.set(visiteId, { data: { ...c, reseaux: next }, promise: null });
  }, [visiteId]);

  const add = useCallback(async () => {
    if (adding) return;
    setAdding(true);
    try {
      const n = reseaux.length + 1;
      const id = await ajouterReseau(visiteId, `Réseau ${n}`);
      const row = { id, visite_id: visiteId, ordre: reseaux.length, nom_reseau: `Réseau ${n}` };
      setReseaux((old) => { const next = [...old, row]; patchCache(next); return next; });
    } finally { setAdding(false); }
  }, [adding, patchCache, reseaux.length, visiteId]);

  const remove = useCallback(async (id) => {
    await supprimerReseau(id);
    setReseaux((old) => { const next = old.filter((r) => r.id !== id); patchCache(next); return next; });
  }, [patchCache]);

  const header = <>
    <Text style={styles.sectionTitle}>Cascade chaudières</Text>
    <View style={styles.formCard}>
      {(TRAME_DATA['p-regulation']?.['Cascade chaudières'] || []).map((f) => <ChampGenerique key={f.cle} visiteId={visiteId} sectionCode="regulation.cascade" field={f} valeurInitiale={champsMap[`regulation.cascade||${f.cle}`]} onSaved={onSaved} />)}
    </View>
    <Text style={styles.sectionTitle}>Réseaux · {reseaux.length}</Text>
  </>;

  const footer = <>
    <TouchableOpacity style={styles.addBtn} onPress={add} disabled={adding}><Text style={styles.addBtnText}>{adding ? 'Ajout…' : '+ Ajouter un réseau'}</Text></TouchableOpacity>
    <Text style={styles.sectionTitle}>Réseau ECS</Text>
    <View style={styles.formCard}>
      {(TRAME_DATA['p-regulation']?.['Réseau ECS'] || []).map((f) => <ChampGenerique key={f.cle} visiteId={visiteId} sectionCode="regulation.reseau_ecs" field={f} valeurInitiale={champsMap[`regulation.reseau_ecs||${f.cle}`]} onSaved={onSaved} />)}
    </View>
  </>;

  return <FlatList
    data={reseaux}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <ReseauCard reseau={item} visiteId={visiteId} onRemove={remove} />}
    ListHeaderComponent={header}
    ListFooterComponent={footer}
    contentContainerStyle={styles.panelContent}
    keyboardShouldPersistTaps="handled"
    initialNumToRender={1}
    maxToRenderPerBatch={2}
    windowSize={3}
    updateCellsBatchingPeriod={80}
    removeClippedSubviews
  />;
}

/**
 * Régulation virtualisée (refonte build 661, docs/refonte-visite-661/README.md
 * §5.3) : aucune reconstruction globale au changement d'onglet.
 *
 * Cartes repliables fermées au départ : Cascade chaudières, un réseau par
 * carte (résumé « 7 °C → 62 °C · courbe 1,4 » dans la bannière, nom
 * renommable, menu Photo / Dupliquer / Retirer avec confirmation), Réseau
 * ECS. T°ext / T°dép en tuiles côte à côte dont le premier appui part de la
 * dernière valeur connue (visite précédente), sinon 7 °C / 60 °C ; courbe
 * 1,0 ; consigne ECS 60 °C. Colonnes et clés de stockage inchangées.
 */
import React, { memo, useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { TRAME_DATA } from './data.js';
import { listerReseaux, ajouterReseau, upsertReseauChamp, supprimerReseau, dupliquerReseau, upsertChamp } from './db.js';
import { prechargerDonneesTrameGenerique, mettreAJourCacheChamp } from './TrameGenericPanel.js';
import { BoundedLruMap } from './boundedCache.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { getNumericConfig } from './GenericFields.js';
import { useDurableAutosave, flushDurableAutosaves } from './durableAutosave.js';
import { PhotoButton } from './PhotoButton.js';
import { COLORS, FONTS, styles } from './styles.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { ActionMenu, BottomSheet, ChoiceField, SectionCard, SmallButton, TileRow, ValueTile, useSectionsOuvertes } from './VisitKit.js';
import { ChampMesureTile, nombreMesure, versAffichage, versStockage } from './ExtraMeasurementCard.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { feedback } from './fieldFeedback.js';
import { getPreviousVisitSnapshot, prewarmPreviousVisitSnapshot } from './visitPreviousSnapshot.js';

const cacheRegulation = new BoundedLruMap(3);
const OPTIONS_CHOIX = { 'Cycle anti-légionellose': ['Hebdomadaire', 'Quotidien', 'Absent'] };
// Valeurs du premier appui quand aucune valeur antérieure n'est connue.
const DEPART_DEFAUT = { 'T°ext(°C)': 7, 'T°dép(°C)': 60, 'Courbe de chauffe': 1, 'T° consigne (°C)': 60 };

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

const fmt = (v) => versAffichage(String(v ?? '').trim());
const vide = (v) => v == null || String(v).trim() === '';

function resumeReseau(v) {
  const ext = vide(v.t_ext_c) ? '—' : `${fmt(v.t_ext_c)} °C`;
  const dep = vide(v.t_dep_c) ? '—' : `${fmt(v.t_dep_c)} °C`;
  if (vide(v.t_ext_c) && vide(v.t_dep_c) && vide(v.courbe_de_chauffe)) return 'À renseigner';
  return `${ext} → ${dep}${vide(v.courbe_de_chauffe) ? '' : ` · courbe ${fmt(v.courbe_de_chauffe)}`}`;
}

/** Valeurs de la visite précédente pour ce réseau (même réseau persistant, sinon même nom). */
function reseauPrecedent(snapshot, reseau) {
  const networks = snapshot?.networks || {};
  if (reseau.reseau_site_id && networks[reseau.reseau_site_id]) return networks[reseau.reseau_site_id];
  const nom = String(reseau.nom_reseau || '').trim().toLowerCase();
  return Object.values(networks).find((n) => nom && String(n?.nom || '').trim().toLowerCase() === nom) || null;
}

/** Une colonne du réseau en autosauvegarde durable. */
function useColonneReseau(reseau, col, onPatch) {
  return useDurableAutosave(reseau[col] ?? '', async (v) => {
    const propre = String(v ?? '').trim().replace(/[.,]$/, '');
    await upsertReseauChamp(reseau.id, col, propre);
    onPatch?.(reseau.id, col, propre);
  }, 450);
}

const ReseauCard = memo(function ReseauCard({ reseau, visiteId, open, onToggle, onRemove, onDuplicate, onPatch, precedent }) {
  const [nom, setNom] = useState(reseau.nom_reseau || 'Réseau');
  const [photoVisible, setPhotoVisible] = useState(false);
  const [nomEdite, setNomEdite] = useState(null);
  const [ext, setExt] = useColonneReseau(reseau, 't_ext_c', onPatch);
  const [dep, setDep] = useColonneReseau(reseau, 't_dep_c', onPatch);
  const [courbe, setCourbe] = useColonneReseau(reseau, 'courbe_de_chauffe', onPatch);
  const [tnc, setTnc, flushTnc] = useColonneReseau(reseau, 'tnc', onPatch);
  const [prog, setProg, flushProg] = useColonneReseau(reseau, 'consigne_programme_horaire', onPatch);
  const cfgExt = getNumericConfig('T°ext(°C)');
  const cfgDep = getNumericConfig('T°dép(°C)');
  const cfgCourbe = getNumericConfig('Courbe de chauffe');
  const entiteKey = reseau.reseau_site_id ? `reseau_site||${reseau.reseau_site_id}` : `reseau||${reseau.id}`;

  useEffect(() => { setNom(reseau.nom_reseau || 'Réseau'); }, [reseau.nom_reseau]);

  const renommer = async (v) => {
    const propre = String(v || '').trim() || 'Réseau';
    const avant = nom;
    setNom(propre);
    try { await upsertReseauChamp(reseau.id, 'nom_reseau', propre); onPatch?.(reseau.id, 'nom_reseau', propre); }
    catch (e) { setNom(avant); Alert.alert('Renommage impossible', String(e?.message || e)); }
  };

  const num = (setter) => (txt) => setter(versStockage(txt));
  const prec = (v, defaut) => nombreMesure(v) ?? defaut;

  return (
    <SectionCard
      picto="dist/reseaux"
      title={nom}
      onRename={renommer}
      subtitle={resumeReseau({ t_ext_c: ext, t_dep_c: dep, courbe_de_chauffe: courbe })}
      open={open}
      onToggle={onToggle}
      right={<ActionMenu label={`Actions du réseau ${nom}`} items={[
        { label: 'Renommer', icon: 'edit', onPress: () => setNomEdite(nom) },
        { label: 'Photo', icon: 'camera', onPress: () => setPhotoVisible(true) },
        { label: 'Dupliquer', icon: 'copy', onPress: () => onDuplicate(reseau.id) },
        {
          label: 'Retirer', icon: 'trash', destructive: true, onPress: () => onRemove(reseau.id),
          confirm: { title: 'Retirer ce réseau ?', message: `« ${nom} » et ses valeurs seront retirés de cette visite.`, label: 'Retirer' },
        },
      ]} />}
    >
      <TileRow>
        <ValueTile label="T°ext" unit="°C" value={versAffichage(ext)} onChange={num(setExt)} step={cfgExt.step} min={cfgExt.min} max={cfgExt.max}
          start={prec(precedent?.tExt, DEPART_DEFAUT['T°ext(°C)'])} picto="dist/t-exterieure" />
        <ValueTile label="T°dép" unit="°C" value={versAffichage(dep)} onChange={num(setDep)} step={cfgDep.step} min={cfgDep.min} max={cfgDep.max}
          start={prec(precedent?.tDep, DEPART_DEFAUT['T°dép(°C)'])} picto="dist/t-de-depart" />
      </TileRow>
      <TileRow>
        <View style={st.textTile}>
          <Text style={st.textLabel}>TNC</Text>
          <TextInput style={st.textInput} value={String(tnc ?? '')} onChangeText={setTnc} onBlur={() => { flushTnc().catch(() => {}); }} placeholder="Saisir…" placeholderTextColor={COLORS.inkFaint} accessibilityLabel="TNC" />
        </View>
        <ValueTile label="Courbe de chauffe" value={versAffichage(courbe)} onChange={num(setCourbe)} step={cfgCourbe.step} min={cfgCourbe.min} max={cfgCourbe.max}
          start={prec(precedent?.courbe, DEPART_DEFAUT['Courbe de chauffe'])} decimals={1} />
      </TileRow>
      <View style={[st.textTile, { marginTop: 8 }]}>
        <Text style={st.textLabel}>Consigne et programme horaire</Text>
        <TextInput style={[st.textInput, { minHeight: 44 }]} value={String(prog ?? '')} onChangeText={setProg} onBlur={() => { flushProg().catch(() => {}); }} placeholder="Saisir…" placeholderTextColor={COLORS.inkFaint} multiline accessibilityLabel="Consigne et programme horaire" />
      </View>
      <BottomSheet visible={nomEdite !== null} onClose={() => setNomEdite(null)} title="Nom du réseau" picto="dist/reseaux" maxHeight="45%"
        footer={<View style={st.sheetActions}>
          <SmallButton label="Annuler" onPress={() => setNomEdite(null)} />
          <SmallButton label="Enregistrer" filled onPress={() => { const v = nomEdite; setNomEdite(null); renommer(v); }} />
        </View>}>
        <TextInput autoFocus style={styles.input} value={nomEdite ?? ''} onChangeText={setNomEdite} placeholder="Ex. Radiateurs" placeholderTextColor={COLORS.inkFaint}
          returnKeyType="done" onSubmitEditing={() => { const v = nomEdite; setNomEdite(null); renommer(v); }} accessibilityLabel="Nom du réseau" />
      </BottomSheet>
      <BottomSheet visible={photoVisible} onClose={() => setPhotoVisible(false)} title="Photos" subtitle={nom} maxHeight="45%">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={nom} />
          <Text style={[st.hint, { flex: 1 }]}>Prendre une photo, ou voir celles déjà prises.</Text>
        </View>
      </BottomSheet>
    </SectionCard>
  );
});

/** Champ à choix de la trame (cycle anti-légionellose) : se replie sur sa valeur. */
function ChampChoix({ visiteId, sectionCode, field, valeurInitiale, onSaved, water }) {
  const [valeur, , , setImmediate] = useDurableAutosave(valeurInitiale, async (v) => {
    await upsertChamp(visiteId, sectionCode, field.cle, v);
    onSaved?.(v);
  });
  return <ChoiceField label={field.cle} value={valeur} options={OPTIONS_CHOIX[field.cle]} segments={false} water={water}
    onChange={(v) => { setImmediate(v).catch(() => {}); }} />;
}

export function OptimizedRegulationPanel({ visiteId, onSaved }) {
  const cached = cacheRegulation.get(visiteId)?.data;
  const [champsMap, setChampsMap] = useState(cached?.champsMap || {});
  const [reseaux, setReseaux] = useState(cached?.reseaux || []);
  const [adding, setAdding] = useState(false);
  const [precedent, setPrecedent] = useState(() => getPreviousVisitSnapshot(visiteId) || null);
  const ouvertes = useSectionsOuvertes(`regulation:${visiteId}`);
  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-regulation`, reseaux.length + 1);

  useEffect(() => {
    let alive = true;
    prechargerRegulation(visiteId).then((d) => { if (alive) { setChampsMap(d.champsMap); setReseaux(d.reseaux); } }).catch(console.warn);
    prewarmPreviousVisitSnapshot(visiteId).then((snap) => { if (alive) setPrecedent(snap || null); }).catch(() => {});
    return () => { alive = false; };
  }, [visiteId]);

  const patchCache = useCallback((next) => {
    const c = cacheRegulation.get(visiteId)?.data;
    if (c) cacheRegulation.set(visiteId, { data: { ...c, reseaux: next }, promise: null });
  }, [visiteId]);

  // Une valeur de réseau enregistrée met à jour le cache chaud (retour sur
  // l'onglet) sans rerendre la liste.
  const patchReseau = useCallback((id, col, valeur) => {
    const c = cacheRegulation.get(visiteId)?.data;
    if (!c) return;
    cacheRegulation.set(visiteId, { data: { ...c, reseaux: c.reseaux.map((r) => (r.id === id ? { ...r, [col]: valeur } : r)) }, promise: null });
  }, [visiteId]);

  const saveTrameField = useCallback((key, valeur) => {
    setChampsMap((old) => (old[key] === valeur ? old : { ...old, [key]: valeur }));
    mettreAJourCacheChamp(visiteId, key, valeur);
    const c = cacheRegulation.get(visiteId)?.data;
    if (c) cacheRegulation.set(visiteId, { data: { ...c, champsMap: { ...c.champsMap, [key]: valeur } }, promise: null });
    onSaved?.();
  }, [onSaved, visiteId]);
  const live = useCallback((key, valeur) => setChampsMap((old) => (old[key] === valeur ? old : { ...old, [key]: valeur })), []);

  const add = useCallback(async () => {
    if (adding) return;
    setAdding(true);
    try {
      const n = reseaux.length + 1;
      const ordre = reseaux.reduce((m, r) => Math.max(m, Number(r.ordre) || 0), -1) + 1;
      const id = await ajouterReseau(visiteId, `Réseau ${n}`);
      // ajouterReseau crée « Réseau » en ordre 0 : on enregistre le nom et le
      // rang affichés pour qu'ils survivent à la réouverture.
      await upsertReseauChamp(id, 'nom_reseau', `Réseau ${n}`);
      await upsertReseauChamp(id, 'ordre', ordre);
      const row = { id, visite_id: visiteId, ordre, nom_reseau: `Réseau ${n}` };
      setReseaux((old) => { const next = [...old, row]; patchCache(next); return next; });
      ouvertes.open([`reseau:${id}`]);
    } catch (e) { Alert.alert('Ajout impossible', String(e?.message || e)); }
    finally { setAdding(false); }
  }, [adding, patchCache, reseaux, visiteId, ouvertes]);

  const remove = useCallback(async (id) => {
    try {
      await supprimerReseau(id);
      setReseaux((old) => { const next = old.filter((r) => r.id !== id); patchCache(next); return next; });
    } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
  }, [patchCache]);

  const duplicate = useCallback(async (id) => {
    try {
      await flushDurableAutosaves();
      const nouveau = await dupliquerReseau(id);
      const next = await listerReseaux(visiteId);
      setReseaux(next);
      patchCache(next);
      ouvertes.open([`reseau:${nouveau}`]);
      feedback('Réseau dupliqué');
    } catch (e) { Alert.alert('Duplication impossible', String(e?.message || e)); }
  }, [patchCache, visiteId, ouvertes]);

  const renderTrameField = (f, sectionCode, { water } = {}) => {
    const key = `${sectionCode}||${f.cle}`;
    if (OPTIONS_CHOIX[f.cle]) {
      return <ChampChoix key={f.cle} visiteId={visiteId} sectionCode={sectionCode} field={f} valeurInitiale={champsMap[key]} water={water} onSaved={(v) => saveTrameField(key, v)} />;
    }
    if (getNumericConfig(f.cle)) {
      const start = nombreMesure(precedent?.fields?.[key]) ?? DEPART_DEFAUT[f.cle];
      return <ChampMesureTile key={f.cle} visiteId={visiteId} sectionCode={sectionCode} field={f} valeurInitiale={champsMap[key]}
        label={f.cle.replace(/\s*\(°C\)\s*$/, '').replace(/\(°C\)$/, '')} start={start} water={water} onLive={live} onSaved={(v) => saveTrameField(key, v)}
        picto={/ext/i.test(f.cle) ? 'dist/t-exterieure' : /dép/i.test(f.cle) ? 'dist/t-de-depart' : null} />;
    }
    return <DurableChampGenerique key={f.cle} visiteId={visiteId} sectionCode={sectionCode} field={f} valeurInitiale={champsMap[key]} onSaved={(v) => saveTrameField(key, v)} />;
  };

  // Champs numériques groupés deux par deux (T°ext / T°dép côte à côte).
  const renderSection = (fields, sectionCode, opts) => {
    const blocs = [];
    let paire = [];
    const vider = () => {
      if (!paire.length) return;
      blocs.push(<TileRow key={`p-${blocs.length}`}>{paire}{paire.length < 2 ? <View style={{ flex: 1 }} /> : null}</TileRow>);
      paire = [];
    };
    fields.forEach((f) => {
      const el = renderTrameField(f, sectionCode, opts);
      if (getNumericConfig(f.cle) && !OPTIONS_CHOIX[f.cle]) {
        paire.push(el);
        if (paire.length === 2) vider();
      } else { vider(); blocs.push(el); }
    });
    vider();
    return blocs;
  };

  const nbRemplis = (fields, sectionCode) => fields.filter((f) => !vide(champsMap[`${sectionCode}||${f.cle}`])).length;
  const cascade = TRAME_DATA['p-regulation']?.['Cascade chaudières'] || [];
  const ecs = TRAME_DATA['p-regulation']?.['Réseau ECS'] || [];

  const header = (
    <SectionCard picto="dist/cascade-chaudieres" title="Cascade chaudières" open={ouvertes.isOpen('cascade')} onToggle={() => ouvertes.toggle('cascade')}
      done={nbRemplis(cascade, 'regulation.cascade')} total={cascade.length}>
      {renderSection(cascade, 'regulation.cascade')}
    </SectionCard>
  );

  const footer = <>
    <TouchableOpacity accessibilityRole="button" style={st.addReseau} onPress={add} disabled={adding}>
      <CvcIcon name="plus" size={16} color={COLORS.orangeDark} strokeWidth={2.4} />
      <Text style={st.addReseauText}>{adding ? 'Ajout…' : 'Ajouter un réseau'}</Text>
    </TouchableOpacity>
    <SectionCard picto="dist/reseau-ecs" water title="Réseau ECS" open={ouvertes.isOpen('ecs')} onToggle={() => ouvertes.toggle('ecs')}
      done={nbRemplis(ecs, 'regulation.reseau_ecs')} total={ecs.length}>
      {renderSection(ecs, 'regulation.reseau_ecs', { water: true })}
    </SectionCard>
  </>;

  return <FlatList
    ref={listRef}
    data={reseaux}
    extraData={[champsMap, precedent, ouvertes]}
    onScroll={onScroll}
    scrollEventThrottle={100}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <ReseauCard reseau={item} visiteId={visiteId} open={ouvertes.isOpen(`reseau:${item.id}`)} onToggle={() => ouvertes.toggle(`reseau:${item.id}`)}
      onRemove={remove} onDuplicate={duplicate} onPatch={patchReseau} precedent={reseauPrecedent(precedent, item)} />}
    ListHeaderComponent={header}
    ListFooterComponent={footer}
    contentContainerStyle={styles.panelContent}
    keyboardShouldPersistTaps="handled"
    initialNumToRender={4}
    maxToRenderPerBatch={4}
    windowSize={5}
    updateCellsBatchingPeriod={80}
    removeClippedSubviews={false}
  />;
}

const st = StyleSheet.create({
  hint: { fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  textTile: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 6, minWidth: 0 },
  textLabel: { fontSize: 11.5, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft },
  textInput: { fontSize: 15, fontFamily: FONTS.bodySemi, color: COLORS.ink, paddingVertical: 6, minHeight: 40 },
  addReseau: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 46, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.orange + '77', marginBottom: 10 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingVertical: 6 },
  addReseauText: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
});

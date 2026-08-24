/** Contrôle de conformité persistant : restaure la réserve liée après virtualisation/swipe. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { PRESCRIPTIONS } from './data.js';
import { fusionnerPrescriptions } from './reserveExtensions.js';
import { listerBibliothequeReserves } from './db.js';
import { upsertControlePartiel } from './controlDb.js';
import {
  listerRemarquesVisite,
  upsertRemarquePrescription,
  supprimerRemarqueControle,
  modifierRemarqueVisite,
} from './remarkDb.js';
import { useDurableAutosave } from './durableAutosave.js';
import { PhotoButton } from './PhotoButton.js';

const PRESCRIPTIONS_COMPLETES = fusionnerPrescriptions(PRESCRIPTIONS);
const AVIS_OPTIONS = ['S', 'N.S', 'S.O', 'N.V'];
const remarquesCache = new Map();
let biblioReservePromise = null;
let biblioReserveCache = null;

const CATEGORIE_SECTION_MAP = {
  'conf-local.evacuations_des_eu_du_local||Type': 'Evacuations des EU - Type',
  'conf-local.evacuations_des_eu_du_local||Etat': 'Evacuations des EU - Etat',
  'conf-local.evacuations_des_eu_du_local||Traitement des condensats': 'Evacuations des EU - Condensats',
  'conf-local.evacuations_des_eu_du_local||Caillebotis': 'Evacuations des EU - Caillebotis',
  'conf-energie.coupure_ext_rieure_combustible||Présence à chaque accès': 'Coupure combustible - Présence',
  'conf-energie.coupure_ext_rieure_combustible||Type (2 électrovannes minimum)': 'Coupure combustible - Type',
  'conf-energie.coupure_ext_rieure_combustible||Coffret': 'Coupure combustible - Coffret',
  'conf-energie.coupure_ext_rieure_combustible||Verre dormant': 'Coupure combustible - Verre dormant',
  'conf-energie.coupure_ext_rieure_combustible||Signalétique "Coupure combustible extérieure"': 'Coupure combustible - Signalétique',
  'conf-energie.coupure_ext_rieure_lectrique||Présence à chaque accès': 'Coupure électrique - Présence',
  'conf-energie.coupure_ext_rieure_lectrique||Coffret': 'Coupure électrique - Coffret',
  'conf-energie.coupure_ext_rieure_lectrique||Verre dormant': 'Coupure électrique - Verre dormant',
  'conf-energie.coupure_ext_rieure_lectrique||Signalétique "Coupure électrique extérieure"': 'Coupure électrique - Signalétique',
  'conf-energie.coupure_ext_rieure_lectrique||Séparation Force/Lumière/Relevage': 'Coupure électrique - Séparation F/L/R',
  'conf-energie.coupure_ext_rieure_lectrique||Signalétique Force/Lumière/Relevage': 'Coupure électrique - Signalétique F/L/R',
  'conf-energie.armoire_lectrique||Schéma électrique': 'Armoire - Schéma électrique',
  'conf-energie.armoire_lectrique||Câblage': 'Armoire - Câblage',
  'conf-energie.armoire_lectrique||Protection': 'Armoire - Protection',
  'conf-energie.armoire_lectrique||Espace libre suffisant (≥ 30 %)': 'Armoire - Espace libre',
  'conf-energie.armoire_lectrique||Eclairage': 'Armoire - Eclairage',
  'conf-energie.armoire_lectrique||Prise 220V protégée 30 mA': 'Armoire - Prise',
  'conf-energie.baes||Présence': 'BAES - Presence',
  'conf-energie.baes||Visible partout': 'BAES - Visibilité',
  'conf-energie.baes||Signalétique': 'BAES - Signalétique',
  'conf-energie.baes||Veilleuse': 'BAES - Veilleuse',
};

function categoriePour(cle, sectionCode) {
  const mappee = CATEGORIE_SECTION_MAP[`${sectionCode}||${cle}`];
  if (mappee) return mappee;
  if (sectionCode?.startsWith('conf-chauffage.')) return 'Chauffage - ' + cle;
  if (sectionCode?.startsWith('conf-ecs.')) return 'ECS - ' + cle;
  if (sectionCode?.startsWith('conf-adouc.')) return 'Adoucisseur - ' + cle;
  return cle;
}

function avisChipColor(opt) {
  if (opt === 'S') return { bg: COLORS.greenBg, border: COLORS.green, text: COLORS.green };
  if (opt === 'N.S') return { bg: COLORS.redBg, border: COLORS.red, text: COLORS.red };
  return { bg: COLORS.line, border: COLORS.inkFaint, text: COLORS.inkSoft };
}

async function chargerBiblioReserve() {
  if (biblioReserveCache) return biblioReserveCache;
  if (!biblioReservePromise) {
    biblioReservePromise = listerBibliothequeReserves()
      .then((rows) => { biblioReserveCache = rows || []; return biblioReserveCache; })
      .finally(() => { biblioReservePromise = null; });
  }
  return biblioReservePromise;
}

async function chargerRemarquesMap(visiteId) {
  const cached = remarquesCache.get(visiteId);
  if (cached?.data) return cached.data;
  if (cached?.promise) return cached.promise;
  const promise = listerRemarquesVisite(visiteId).then((rows) => {
    const map = new Map();
    (rows || []).forEach((r) => { if (r.controle_key) map.set(r.controle_key, r); });
    remarquesCache.set(visiteId, { data: map, promise: null });
    return map;
  }).catch((e) => { remarquesCache.delete(visiteId); throw e; });
  remarquesCache.set(visiteId, { data: null, promise });
  return promise;
}

function patchRemarqueCache(visiteId, controleKey, remarque) {
  const entry = remarquesCache.get(visiteId);
  if (!entry?.data) return;
  if (remarque) entry.data.set(controleKey, remarque);
  else entry.data.delete(controleKey);
}

function EditionReserve({ remarque, onPatch }) {
  const [prestation, setPrestation, flushPrestation] = useDurableAutosave(remarque?.prestation || '', async (v) => {
    if (!remarque?.id) return;
    await modifierRemarqueVisite(remarque.id, { prestation: v });
    onPatch({ prestation: v });
  });
  const [poste, setPoste, flushPoste] = useDurableAutosave(remarque?.poste || '', async (v) => {
    if (!remarque?.id) return;
    await modifierRemarqueVisite(remarque.id, { poste: v });
    onPatch({ poste: v });
  });
  const [prix, setPrix, flushPrix] = useDurableAutosave(remarque?.estimatif == null ? '' : String(remarque.estimatif), async (v) => {
    if (!remarque?.id) return;
    await modifierRemarqueVisite(remarque.id, { estimatif: v });
    onPatch({ estimatif: v === '' ? null : Number(String(v).replace(',', '.')) });
  });
  const [delai, setDelai, flushDelai] = useDurableAutosave(remarque?.delai == null ? '' : String(remarque.delai), async (v) => {
    if (!remarque?.id) return;
    await modifierRemarqueVisite(remarque.id, { delai: v });
    onPatch({ delai: v === '' ? null : Number(String(v).replace(',', '.')) });
  });

  if (!remarque?.id) return null;
  return <View style={[styles.prestationResult, { gap: 8 }]}>
    <Text style={styles.criterePanelLabel}>Réserve de cette visite — modifiable</Text>
    <TextInput style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} multiline value={prestation} onChangeText={setPrestation} onBlur={() => flushPrestation().catch(() => {})} placeholder="Prestation / réserve" />
    <TextInput style={styles.input} value={poste} onChangeText={setPoste} onBlur={() => flushPoste().catch(() => {})} placeholder="Poste" />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TextInput style={[styles.input, { flex: 1 }]} value={prix} onChangeText={setPrix} onBlur={() => flushPrix().catch(() => {})} placeholder="Prix HT (€)" keyboardType="numeric" />
      <TextInput style={[styles.input, { flex: 1 }]} value={delai} onChangeText={setDelai} onBlur={() => flushDelai().catch(() => {})} placeholder="Délai (mois)" keyboardType="numeric" />
    </View>
  </View>;
}

export const PersistentControleGenerique = React.memo(function PersistentControleGenerique({ visiteId, sectionCode, field, etatInitial, onSaved, onEtatChange }) {
  const controleKey = `${sectionCode}||${field.cle}`;
  const categorieKey = categoriePour(field.cle, sectionCode);
  const baseOptions = useMemo(() => PRESCRIPTIONS_COMPLETES[categorieKey] || PRESCRIPTIONS_COMPLETES[field.cle] || [], [categorieKey, field.cle]);
  const [options, setOptions] = useState(baseOptions);
  const [avis, setAvis] = useState(etatInitial?.avis || null);
  const [commentaire, setCommentaire] = useState(etatInitial?.commentaire || '');
  const [remarque, setRemarque] = useState(null);
  const [critereChoisi, setCritereChoisi] = useState(null);
  const [modeLibre, setModeLibre] = useState(false);

  useEffect(() => {
    setAvis(etatInitial?.avis || null);
    setCommentaire(etatInitial?.commentaire || '');
  }, [etatInitial?.avis, etatInitial?.commentaire]);

  useEffect(() => {
    let alive = true;
    Promise.all([chargerRemarquesMap(visiteId), chargerBiblioReserve()]).then(([map, biblio]) => {
      if (!alive) return;
      const perso = (biblio || []).filter((item) => item.nom === categorieKey || item.nom?.startsWith(categorieKey + ' — ')).map((item) => ({
        critere: item.nom?.startsWith(categorieKey + ' — ') ? item.nom.slice(categorieKey.length + 3) : null,
        poste: item.poste,
        prestation: item.description,
        delai: item.delai,
        estimatif: item.prix,
      }));
      const signatures = new Set(baseOptions.map((o) => `${o.critere || ''}||${o.prestation || ''}`));
      const merged = [...baseOptions, ...perso.filter((o) => !signatures.has(`${o.critere || ''}||${o.prestation || ''}`))];
      setOptions(merged);
      const r = map.get(controleKey) || null;
      setRemarque(r);
      if (r) {
        setCommentaire(r.prestation || etatInitial?.commentaire || '');
        const idx = merged.findIndex((o) => {
          const origine = categorieKey + (o.critere ? ' — ' + o.critere : '');
          return r.origine === origine || (!!o.prestation && o.prestation === r.prestation);
        });
        setCritereChoisi(idx >= 0 ? idx : null);
        setModeLibre(idx < 0);
      } else {
        setCritereChoisi(null);
        setModeLibre(false);
      }
    }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId, controleKey, categorieKey, baseOptions]);

  const notifierEtat = useCallback((patch) => {
    onEtatChange?.(patch);
    onSaved?.();
  }, [onEtatChange, onSaved]);

  const choisirAvis = useCallback(async (val) => {
    setAvis(val);
    onEtatChange?.({ avis: val });
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: val });
    if (val !== 'N.S') {
      await supprimerRemarqueControle(visiteId, controleKey);
      patchRemarqueCache(visiteId, controleKey, null);
      setRemarque(null); setCritereChoisi(null); setModeLibre(false); setCommentaire('');
      onEtatChange?.({ avis: val, commentaire: '' });
    }
    onSaved?.();
  }, [visiteId, sectionCode, field.cle, controleKey, onEtatChange, onSaved]);

  const choisirCritere = useCallback(async (opt, idx) => {
    setCritereChoisi(idx); setModeLibre(false); setCommentaire(opt.prestation || '');
    onEtatChange?.({ avis: 'N.S', commentaire: opt.prestation || '' });
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: 'N.S', commentaire: opt.prestation || '' });
    const origine = categorieKey + (opt.critere ? ' — ' + opt.critere : '');
    const id = await upsertRemarquePrescription(visiteId, controleKey, opt, origine);
    const next = { ...(remarque || {}), id, visite_id: visiteId, controle_key: controleKey, poste: opt.poste || 'Observation', prestation: opt.prestation || '', delai: opt.delai ?? null, estimatif: opt.estimatif ?? null, origine };
    setRemarque(next); patchRemarqueCache(visiteId, controleKey, next); onSaved?.();
  }, [visiteId, sectionCode, field.cle, categorieKey, controleKey, remarque, onEtatChange, onSaved]);

  const sauverLibre = useCallback(async (texte) => {
    const v = String(texte || '');
    setCommentaire(v);
    onEtatChange?.({ avis: 'N.S', commentaire: v });
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: 'N.S', commentaire: v });
    if (v.trim()) {
      const opt = { poste: remarque?.poste || 'Observation', prestation: v, delai: remarque?.delai ?? null, estimatif: remarque?.estimatif ?? null };
      const id = await upsertRemarquePrescription(visiteId, controleKey, opt, field.cle);
      const next = { ...(remarque || {}), ...opt, id, visite_id: visiteId, controle_key: controleKey, origine: field.cle };
      setRemarque(next); patchRemarqueCache(visiteId, controleKey, next);
    } else {
      await supprimerRemarqueControle(visiteId, controleKey);
      patchRemarqueCache(visiteId, controleKey, null); setRemarque(null);
    }
    onSaved?.();
  }, [visiteId, sectionCode, field.cle, controleKey, remarque, onEtatChange, onSaved]);

  const [libre, setLibre, flushLibre] = useDurableAutosave(commentaire, sauverLibre, 450);
  useEffect(() => { if (modeLibre) setLibre(commentaire || remarque?.prestation || ''); }, [modeLibre, commentaire, remarque?.prestation]);

  const patchReserve = useCallback((patch) => {
    setRemarque((r) => {
      if (!r) return r;
      const next = { ...r, ...patch };
      patchRemarqueCache(visiteId, controleKey, next);
      return next;
    });
  }, [visiteId, controleKey]);

  return <View style={styles.controlRow}>
    <View style={styles.controlTop}>
      <Text style={styles.controlLabel}>{field.cle}</Text>
      <View style={styles.avisGroup}>
        {AVIS_OPTIONS.map((opt) => {
          const c = avisChipColor(opt); const selected = avis === opt;
          return <TouchableOpacity key={opt} style={[styles.avisChip, selected && { backgroundColor: c.bg, borderColor: c.border }]} onPress={() => choisirAvis(opt)}>
            <Text style={[styles.avisChipText, selected && { color: c.text }]}>{opt}</Text>
          </TouchableOpacity>;
        })}
      </View>
    </View>
    {avis === 'N.S' && <View style={styles.criterePanel}>
      {options.length > 0 && <>
        <Text style={styles.criterePanelLabel}>Cause</Text>
        <View style={styles.critereChips}>
          {options.map((opt, idx) => <TouchableOpacity key={`${categorieKey}-${idx}`} style={[styles.critereChip, critereChoisi === idx && styles.critereChipPicked]} onPress={() => choisirCritere(opt, idx)}>
            <Text style={[styles.critereChipText, critereChoisi === idx && styles.critereChipTextPicked]}>{opt.critere || 'Non conforme'}</Text>
          </TouchableOpacity>)}
          <TouchableOpacity style={[styles.critereChip, styles.critereChipCustom, modeLibre && styles.critereChipPicked]} onPress={() => { setModeLibre(true); setCritereChoisi(null); }}>
            <Text style={[styles.critereChipText, modeLibre && styles.critereChipTextPicked]}>Autre</Text>
          </TouchableOpacity>
        </View>
      </>}
      {critereChoisi !== null && remarque ? <EditionReserve remarque={remarque} onPatch={patchReserve} /> : null}
      {(modeLibre || options.length === 0) && <TextInput style={[styles.input, { marginTop: 8, height: 60 }]} placeholder="Décrivez le problème constaté..." multiline value={libre} onChangeText={setLibre} onBlur={() => flushLibre().catch(() => {})} />}
      <PhotoButton visiteId={visiteId} entiteKey={controleKey} label={field.cle} style={styles.photoRequiredBox} />
    </View>}
  </View>;
});

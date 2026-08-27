/** Contrôle VMC dédié : avis S / N.S / N.R / S.O / N.V, bulles de commentaires et réserve liée. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { upsertControlePartiel } from './controlDb.js';
import { listerRemarquesVisite, upsertRemarquePrescription, supprimerRemarqueControle } from './remarkDb.js';
import { PhotoButton } from './PhotoButton.js';

const AVIS_OPTIONS = ['S', 'N.S', 'N.R', 'S.O', 'N.V'];

function avisChipColor(opt) {
  if (opt === 'S') return { bg: COLORS.greenBg, border: COLORS.green, text: COLORS.green };
  if (opt === 'N.S') return { bg: COLORS.redBg, border: COLORS.red, text: COLORS.red };
  return { bg: COLORS.line, border: COLORS.inkFaint, text: COLORS.inkSoft };
}

function palettePanel(avis) {
  if (avis === 'S') return { bg: COLORS.greenBg, border: COLORS.green, text: COLORS.green, picked: COLORS.green };
  if (avis === 'N.S') return { bg: COLORS.redBg, border: '#F4C7C7', text: COLORS.red, picked: COLORS.red };
  return { bg: COLORS.bg, border: COLORS.line, text: COLORS.inkSoft, picked: COLORS.inkSoft };
}

function libelleEtat(avis) {
  if (avis === 'S') return 'Correct / présent';
  if (avis === 'S.O') return 'Sans objet';
  if (avis === 'N.R') return 'Non relevé';
  if (avis === 'N.V') return 'Non visible';
  return null;
}

export const VmcControleGenerique = React.memo(function VmcControleGenerique({ visiteId, sectionCode, field, etatInitial, onSaved, onEtatChange }) {
  const controleKey = `${sectionCode}||${field.cle}`;
  const [avis, setAvis] = useState(etatInitial?.avis || null);
  const [commentaire, setCommentaire] = useState(etatInitial?.commentaire || '');
  const [remarque, setRemarque] = useState(null);
  const [presetChoisi, setPresetChoisi] = useState(null);
  const presets = useMemo(() => field?.presets || {}, [field]);
  const options = avis ? (presets[avis] || []) : [];
  const palette = palettePanel(avis);
  const etatApplication = libelleEtat(avis);

  useEffect(() => {
    setAvis(etatInitial?.avis || null);
    setCommentaire(etatInitial?.commentaire || '');
  }, [etatInitial?.avis, etatInitial?.commentaire]);

  useEffect(() => {
    let alive = true;
    listerRemarquesVisite(visiteId).then((rows) => {
      if (!alive) return;
      setRemarque((rows || []).find((r) => r.controle_key === controleKey) || null);
    }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId, controleKey]);

  useEffect(() => {
    if (!avis || !commentaire) { setPresetChoisi(null); return; }
    const idx = (presets[avis] || []).findIndex((p) => p.commentaire === commentaire);
    setPresetChoisi(idx >= 0 ? idx : null);
  }, [avis, commentaire, presets]);

  const notifier = useCallback((patch) => {
    onEtatChange?.(patch);
    onSaved?.();
  }, [onEtatChange, onSaved]);

  const choisirAvis = useCallback(async (val) => {
    if (val === avis) return;
    setAvis(val);
    setPresetChoisi(null);
    setCommentaire('');

    if (val === 'N.S') {
      // Un N.S doit toujours exister dans la synthèse Réserves, même avant
      // que le technicien ne choisisse une bulle ou ne rédige le détail.
      // Le texte provisoire est ensuite remplacé par la prescription choisie
      // ou par le commentaire libre au moment de la saisie.
      const prescription = {
        poste: field.poste || 'VMC',
        prestation: `Anomalie constatée sur ${field.cle} — à préciser.`,
        delai: null,
        estimatif: null,
      };
      const origine = `VMC — ${field.cle} — À préciser`;
      const id = await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      setRemarque({ id, visite_id: visiteId, controle_key: controleKey, origine, ...prescription });
    } else {
      await supprimerRemarqueControle(visiteId, controleKey);
      setRemarque(null);
    }

    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: val, commentaire: '' });
    notifier({ avis: val, commentaire: '' });
  }, [avis, visiteId, sectionCode, field, controleKey, notifier]);

  const choisirPreset = useCallback(async (opt, idx) => {
    const texte = opt.commentaire || '';
    setPresetChoisi(idx);
    setCommentaire(texte);
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis, commentaire: texte });

    if (avis === 'N.S') {
      const prescription = {
        poste: opt.poste || field.poste || 'VMC',
        prestation: opt.reserve || texte,
        delai: opt.delai ?? null,
        estimatif: opt.estimatif ?? null,
      };
      const origine = `VMC — ${field.cle}${opt.label ? ` — ${opt.label}` : ''}`;
      const id = await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      setRemarque({ id, visite_id: visiteId, controle_key: controleKey, origine, ...prescription });
    } else {
      await supprimerRemarqueControle(visiteId, controleKey);
      setRemarque(null);
    }
    notifier({ avis, commentaire: texte });
  }, [visiteId, sectionCode, field, controleKey, avis, notifier]);

  const sauverLibre = useCallback(async () => {
    const texte = String(commentaire || '').trim();
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis, commentaire: texte });
    if (avis === 'N.S' && texte) {
      // Toujours mettre à jour la réserve existante : auparavant, un N.S déjà
      // matérialisé pouvait conserver son ancien texte au lieu du commentaire libre.
      const prescription = {
        poste: remarque?.poste || field.poste || 'VMC',
        prestation: texte,
        delai: remarque?.delai ?? null,
        estimatif: remarque?.estimatif ?? null,
      };
      const origine = `VMC — ${field.cle} — Autre`;
      const id = await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      setRemarque({ ...(remarque || {}), id, visite_id: visiteId, controle_key: controleKey, origine, ...prescription });
    }
    notifier({ avis, commentaire: texte });
  }, [visiteId, sectionCode, field, controleKey, avis, commentaire, remarque, notifier]);

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

    {avis && <View style={[styles.criterePanel, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {etatApplication ? <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: palette.text, backgroundColor: palette.bg, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 }}>
        <Text style={{ color: palette.text, fontWeight: '800', fontSize: 11 }}>{etatApplication}</Text>
      </View> : null}
      {options.length > 0 && <>
        <Text style={[styles.criterePanelLabel, { color: palette.text }]}>{avis === 'N.S' ? 'Anomalie constatée' : 'Commentaire rapide'}</Text>
        <View style={styles.critereChips}>
          {options.map((opt, idx) => <TouchableOpacity key={`${field.cle}-${avis}-${idx}`} style={[styles.critereChip, { borderColor: palette.text }, presetChoisi === idx && { backgroundColor: palette.picked, borderColor: palette.picked }]} onPress={() => choisirPreset(opt, idx)}>
            <Text style={[styles.critereChipText, { color: presetChoisi === idx ? COLORS.white : palette.text }]}>{opt.label}</Text>
          </TouchableOpacity>)}
        </View>
      </>}
      <TextInput
        style={[styles.input, { marginTop: 8, minHeight: 64, textAlignVertical: 'top', backgroundColor: '#fff' }]}
        multiline
        value={commentaire}
        onChangeText={(v) => { setCommentaire(v); setPresetChoisi(null); }}
        onBlur={() => sauverLibre().catch(console.warn)}
        placeholder="Commentaire technique…"
      />
      {avis === 'N.S' && remarque ? <View style={styles.prestationResult}>
        <Text style={styles.criterePanelLabel}>Réserve proposée</Text>
        <Text style={styles.prestationText}>{remarque.prestation}</Text>
      </View> : null}
      {avis === 'N.S' ? <PhotoButton visiteId={visiteId} entiteKey={controleKey} label={field.cle} style={styles.photoRequiredBox} /> : null}
    </View>}
  </View>;
});

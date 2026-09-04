/** Contrôle Pré-allumage compact : S reste sur une ligne, N.S ouvre le détail utile. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { upsertControlePartiel } from './controlDb.js';
import { listerRemarquesVisite, modifierCriticiteRemarque, supprimerRemarqueControle, upsertRemarquePrescription } from './remarkDb.js';
import { defaultSeverityForControl } from './reserveSeverity.js';
import { ReserveSeveritySlider } from './ReserveSeveritySlider.js';
import { PreAllumagePhotoButton } from './PreAllumagePhotoButton.js';
import { COLORS, styles } from './styles.js';

const AVIS = ['S', 'N.S', 'N.R', 'S.O', 'N.V'];

function palette(opt, selected) {
  if (!selected) return { bg: COLORS.white, border: COLORS.line, text: COLORS.inkSoft };
  if (opt === 'S') return { bg: COLORS.greenBg, border: COLORS.green, text: COLORS.green };
  if (opt === 'N.S') return { bg: COLORS.redBg, border: COLORS.red, text: COLORS.red };
  return { bg: '#F2F4F7', border: COLORS.inkFaint, text: COLORS.inkSoft };
}

function typeLocalLabel(type) {
  if (type === 'chaufferie') return 'Chaufferie';
  if (type === 'sous_station') return 'Sous-station';
  return 'Local technique';
}

function contextualiserCommentaire(texte, localName, localType, contextLabel) {
  const base = String(texte || '').trim();
  if (!base) return '';
  const contexte = [typeLocalLabel(localType), localName, contextLabel].filter(Boolean).join(' · ');
  return contexte ? `${contexte} — ${base}` : base;
}

function correspondPreset(commentaire, textePreset) {
  const c = String(commentaire || '').trim();
  const p = String(textePreset || '').trim();
  return Boolean(p && (c === p || c.endsWith(`— ${p}`)));
}

export const PreAllumageCompactControl = React.memo(function PreAllumageCompactControl({ visiteId, sectionCode, field, etatInitial, localName, localType, contextLabel, onEtatChange, onSaved }) {
  const controleKey = `${sectionCode}||${field.cle}`;
  const label = field.displayLabel || field.libelle || field.cle;
  const presets = useMemo(() => field.presets || {}, [field.presets]);
  const [avis, setAvis] = useState(etatInitial?.avis || null);
  const [commentaire, setCommentaire] = useState(etatInitial?.commentaire || '');
  const [remarque, setRemarque] = useState(null);
  const [detailOuvert, setDetailOuvert] = useState(etatInitial?.avis === 'N.S');
  const [presetChoisi, setPresetChoisi] = useState(null);

  useEffect(() => {
    setAvis(etatInitial?.avis || null);
    setCommentaire(etatInitial?.commentaire || '');
    if (etatInitial?.avis === 'N.S') setDetailOuvert(true);
  }, [etatInitial?.avis, etatInitial?.commentaire]);

  const rechargerRemarque = useCallback(async () => {
    const rows = await listerRemarquesVisite(visiteId);
    const row = (rows || []).find((r) => r.controle_key === controleKey) || null;
    setRemarque(row);
    return row;
  }, [visiteId, controleKey]);

  useEffect(() => { let alive = true; listerRemarquesVisite(visiteId).then((rows) => { if (alive) setRemarque((rows || []).find((r) => r.controle_key === controleKey) || null); }).catch(() => {}); return () => { alive = false; }; }, [visiteId, controleKey]);

  useEffect(() => {
    if (!avis || !commentaire) { setPresetChoisi(null); return; }
    const idx = (presets[avis] || []).findIndex((p) => correspondPreset(commentaire, p.commentaire));
    setPresetChoisi(idx >= 0 ? idx : null);
  }, [avis, commentaire, presets]);

  const notifier = useCallback((patch) => { onEtatChange?.(patch); onSaved?.(); }, [onEtatChange, onSaved]);

  const appliquer = useCallback(async (nextAvis, preset = null, idx = null) => {
    const texteBrut = preset?.commentaire || '';
    const texte = nextAvis === 'S' && texteBrut
      ? contextualiserCommentaire(texteBrut, localName, localType, contextLabel)
      : texteBrut;
    setAvis(nextAvis); setCommentaire(texte); setPresetChoisi(idx);
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: nextAvis, commentaire: texte });
    if (nextAvis === 'N.S') {
      const criticiteDefaut = defaultSeverityForControl(field, preset);
      const prescription = {
        poste: preset?.poste || field.poste || 'Pré-allumage',
        prestation: preset?.reserve || texte || `Anomalie constatée sur ${label} — à préciser.`,
        delai: preset?.delai ?? null,
        estimatif: preset?.estimatif ?? null,
        criticiteDefaut,
      };
      const origine = `${localName || 'Installation'} — ${label}${preset?.label ? ` — ${preset.label}` : ''}`;
      await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      await rechargerRemarque();
      setDetailOuvert(true);
    } else {
      await supprimerRemarqueControle(visiteId, controleKey); setRemarque(null); setDetailOuvert(false);
    }
    notifier({ avis: nextAvis, commentaire: texte });
  }, [visiteId, sectionCode, field, label, localName, localType, contextLabel, controleKey, notifier, rechargerRemarque]);

  const choisirAvis = async (nextAvis) => {
    if (nextAvis === avis) { setDetailOuvert((v) => !v); return; }
    const options = presets[nextAvis] || [];
    if (nextAvis === 'S' && options[0]) return appliquer(nextAvis, options[0], 0);
    if (nextAvis !== 'N.S' && options.length === 1) return appliquer(nextAvis, options[0], 0);
    return appliquer(nextAvis, null, null);
  };

  const choisirPreset = async (p, idx) => appliquer(avis, p, idx);
  const sauverLibre = async () => {
    const texte = String(commentaire || '').trim();
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis, commentaire: texte });
    if (avis === 'N.S') {
      const criticiteDefaut = remarque?.criticite_defaut ?? defaultSeverityForControl(field);
      const prescription = { poste: remarque?.poste || field.poste || 'Pré-allumage', prestation: remarque?.prestation || texte || `Anomalie constatée sur ${label} — à préciser.`, delai: remarque?.delai ?? null, estimatif: remarque?.estimatif ?? null, criticiteDefaut };
      const origine = `${localName || 'Installation'} — ${label} — Autre`;
      await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      await rechargerRemarque();
    }
    notifier({ avis, commentaire: texte });
  };
  const reglerCriticite = async (value) => {
    if (!remarque?.id) return;
    await modifierCriticiteRemarque(remarque.id, value);
    setRemarque((r) => r ? { ...r, criticite: value, criticite_modifiee: Number(value) === Number(r.criticite_defaut) ? 0 : 1 } : r);
    notifier({ criticite: value });
  };

  const options = avis ? (presets[avis] || []) : [];
  const commentaireCourt = commentaire && avis !== 'N.S' ? commentaire : '';
  const afficherDetail = Boolean(avis && (avis === 'N.S' || detailOuvert || (avis !== 'S' && options.length > 1 && !commentaire)));

  return <View style={{ paddingVertical: 7 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, minWidth: 120, color: COLORS.ink, fontWeight: '800', fontSize: 12 }}>{label}</Text><View style={{ flexDirection: 'row', gap: 4 }}>{AVIS.map((opt) => { const c = palette(opt, avis === opt); return <TouchableOpacity key={opt} onPress={() => choisirAvis(opt).catch(console.warn)} style={{ minWidth: opt.length > 2 ? 37 : 31, minHeight: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, paddingHorizontal: 6 }}><Text style={{ color: c.text, fontSize: 10, fontWeight: '900' }}>{opt}</Text></TouchableOpacity>; })}</View></View>

    {commentaireCourt ? <TouchableOpacity onPress={() => setDetailOuvert((v) => !v)} style={{ marginTop: 5 }}><Text numberOfLines={detailOuvert ? undefined : 2} style={{ color: avis === 'S' ? COLORS.green : COLORS.inkSoft, fontSize: 10 }}>{commentaireCourt}</Text></TouchableOpacity> : null}

    {afficherDetail ? <View style={{ marginTop: 8, padding: 9, borderRadius: 10, borderWidth: 1, borderColor: avis === 'N.S' ? '#F4C7C7' : avis === 'S' ? '#B7E2C0' : COLORS.line, backgroundColor: avis === 'N.S' ? COLORS.redBg : avis === 'S' ? COLORS.greenBg : '#F9FAFB' }}>
      {avis === 'S' ? <Text style={{ color: COLORS.green, fontSize: 9, fontWeight: '900', marginBottom: 6 }}>Commentaire de conformité — présélectionnable et modifiable</Text> : null}
      {options.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{options.map((p, idx) => <TouchableOpacity key={`${avis}-${idx}`} onPress={() => choisirPreset(p, idx).catch(console.warn)} style={{ minHeight: 30, justifyContent: 'center', borderWidth: 1, borderColor: presetChoisi === idx ? (avis === 'N.S' ? COLORS.red : avis === 'S' ? COLORS.green : COLORS.orange) : COLORS.line, backgroundColor: presetChoisi === idx ? (avis === 'N.S' ? '#FEE4E2' : avis === 'S' ? COLORS.greenBg : COLORS.orangeLight) : COLORS.white, borderRadius: 15, paddingHorizontal: 9 }}><Text style={{ fontSize: 10, fontWeight: '800', color: presetChoisi === idx ? (avis === 'N.S' ? COLORS.red : avis === 'S' ? COLORS.green : COLORS.orangeDark) : COLORS.inkSoft }}>{p.label}</Text></TouchableOpacity>)}</View> : null}
      <TextInput style={[styles.input, { minHeight: 52, textAlignVertical: 'top', marginTop: 7, fontSize: 12 }]} multiline value={commentaire} onChangeText={(v) => { setCommentaire(v); setPresetChoisi(null); }} onBlur={() => sauverLibre().catch(console.warn)} placeholder={avis === 'S' ? 'Commentaire de conformité…' : 'Commentaire technique…'} />
      {avis === 'N.S' && remarque ? <ReserveSeveritySlider value={remarque.criticite ?? 2} defaultValue={remarque.criticite_defaut ?? 2} onChange={(v) => reglerCriticite(v).catch(console.warn)} compact /> : null}
      {avis === 'N.S' ? <View style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: COLORS.red, fontWeight: '900', fontSize: 10 }}>Réserve créée automatiquement</Text>{remarque?.prestation ? <Text numberOfLines={2} style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 2 }}>{remarque.prestation}</Text> : null}</View><PreAllumagePhotoButton visiteId={visiteId} entiteKey={controleKey} label={`${localName || ''} · ${label}`} style={{ minHeight: 38, paddingHorizontal: 9 }} /></View> : null}
    </View> : null}

    {avis && avis !== 'N.S' && !detailOuvert ? <TouchableOpacity onPress={() => setDetailOuvert(true)} style={{ alignSelf: 'flex-start', marginTop: 5 }}><Text style={{ color: avis === 'S' ? COLORS.green : COLORS.orangeDark, fontSize: 10, fontWeight: '800' }}>{avis === 'S' ? 'Modifier le commentaire S' : 'Modifier le motif'}</Text></TouchableOpacity> : null}
  </View>;
});

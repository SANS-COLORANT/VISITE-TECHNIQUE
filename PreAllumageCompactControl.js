/** Contrôle Pré-allumage compact : S reste sur une ligne, N.S ouvre le détail utile. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { upsertControlePartiel } from './controlDb.js';
import { listerRemarquesVisite, supprimerRemarqueControle, upsertRemarquePrescription } from './remarkDb.js';
import { PhotoButton } from './PhotoButton.js';
import { COLORS, styles } from './styles.js';

const AVIS = ['S', 'N.S', 'N.R', 'S.O', 'N.V'];

function palette(opt, selected) {
  if (!selected) return { bg: COLORS.white, border: COLORS.line, text: COLORS.inkSoft };
  if (opt === 'S') return { bg: COLORS.greenBg, border: COLORS.green, text: COLORS.green };
  if (opt === 'N.S') return { bg: COLORS.redBg, border: COLORS.red, text: COLORS.red };
  return { bg: '#F2F4F7', border: COLORS.inkFaint, text: COLORS.inkSoft };
}

export const PreAllumageCompactControl = React.memo(function PreAllumageCompactControl({ visiteId, sectionCode, field, etatInitial, localName, onEtatChange, onSaved }) {
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

  useEffect(() => {
    let alive = true;
    listerRemarquesVisite(visiteId).then((rows) => {
      if (!alive) return;
      setRemarque((rows || []).find((r) => r.controle_key === controleKey) || null);
    }).catch(() => {});
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

  const appliquer = useCallback(async (nextAvis, preset = null, idx = null) => {
    const texte = preset?.commentaire || '';
    setAvis(nextAvis);
    setCommentaire(texte);
    setPresetChoisi(idx);
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: nextAvis, commentaire: texte });
    if (nextAvis === 'N.S') {
      const prescription = {
        poste: preset?.poste || field.poste || 'Pré-allumage',
        prestation: preset?.reserve || texte || `Anomalie constatée sur ${label} — à préciser.`,
        delai: preset?.delai ?? null,
        estimatif: preset?.estimatif ?? null,
      };
      const origine = `${localName || 'Installation'} — ${label}${preset?.label ? ` — ${preset.label}` : ''}`;
      const id = await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      setRemarque({ id, visite_id: visiteId, controle_key: controleKey, origine, ...prescription });
      setDetailOuvert(true);
    } else {
      await supprimerRemarqueControle(visiteId, controleKey);
      setRemarque(null);
      setDetailOuvert(false);
    }
    notifier({ avis: nextAvis, commentaire: texte });
  }, [visiteId, sectionCode, field, label, localName, controleKey, notifier]);

  const choisirAvis = async (nextAvis) => {
    if (nextAvis === avis) {
      if (nextAvis === 'N.S') setDetailOuvert((v) => !v);
      return;
    }
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
      const prescription = {
        poste: remarque?.poste || field.poste || 'Pré-allumage',
        prestation: remarque?.prestation || texte || `Anomalie constatée sur ${label} — à préciser.`,
        delai: remarque?.delai ?? null,
        estimatif: remarque?.estimatif ?? null,
      };
      const origine = `${localName || 'Installation'} — ${label} — Autre`;
      const id = await upsertRemarquePrescription(visiteId, controleKey, prescription, origine);
      setRemarque({ ...(remarque || {}), id, visite_id: visiteId, controle_key: controleKey, origine, ...prescription });
    }
    notifier({ avis, commentaire: texte });
  };

  const options = avis ? (presets[avis] || []) : [];
  const commentaireCourt = commentaire && avis !== 'N.S' ? commentaire : '';

  return <View style={{ paddingVertical: 7 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, minWidth: 120, color: COLORS.ink, fontWeight: '800', fontSize: 12 }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {AVIS.map((opt) => {
          const c = palette(opt, avis === opt);
          return <TouchableOpacity key={opt} onPress={() => choisirAvis(opt).catch(console.warn)} style={{ minWidth: opt.length > 2 ? 37 : 31, minHeight: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, paddingHorizontal: 6 }}>
            <Text style={{ color: c.text, fontSize: 10, fontWeight: '900' }}>{opt}</Text>
          </TouchableOpacity>;
        })}
      </View>
    </View>

    {commentaireCourt ? <TouchableOpacity onPress={() => setDetailOuvert((v) => !v)} style={{ marginTop: 5 }}><Text numberOfLines={detailOuvert ? undefined : 1} style={{ color: COLORS.inkSoft, fontSize: 10 }}>{commentaireCourt}</Text></TouchableOpacity> : null}

    {avis && avis !== 'S' && (detailOuvert || avis === 'N.S' || (options.length > 1 && !commentaire)) ? <View style={{ marginTop: 8, padding: 9, borderRadius: 10, borderWidth: 1, borderColor: avis === 'N.S' ? '#F4C7C7' : COLORS.line, backgroundColor: avis === 'N.S' ? COLORS.redBg : '#F9FAFB' }}>
      {options.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {options.map((p, idx) => <TouchableOpacity key={`${avis}-${idx}`} onPress={() => choisirPreset(p, idx).catch(console.warn)} style={{ minHeight: 30, justifyContent: 'center', borderWidth: 1, borderColor: presetChoisi === idx ? (avis === 'N.S' ? COLORS.red : COLORS.orange) : COLORS.line, backgroundColor: presetChoisi === idx ? (avis === 'N.S' ? '#FEE4E2' : COLORS.orangeLight) : COLORS.white, borderRadius: 15, paddingHorizontal: 9 }}><Text style={{ fontSize: 10, fontWeight: '800', color: presetChoisi === idx ? (avis === 'N.S' ? COLORS.red : COLORS.orangeDark) : COLORS.inkSoft }}>{p.label}</Text></TouchableOpacity>)}
      </View> : null}
      <TextInput
        style={[styles.input, { minHeight: 52, textAlignVertical: 'top', marginTop: 7, fontSize: 12 }]}
        multiline
        value={commentaire}
        onChangeText={(v) => { setCommentaire(v); setPresetChoisi(null); }}
        onBlur={() => sauverLibre().catch(console.warn)}
        placeholder="Commentaire technique…"
      />
      {avis === 'N.S' ? <View style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.red, fontWeight: '900', fontSize: 10 }}>Réserve créée automatiquement</Text>
          {remarque?.prestation ? <Text numberOfLines={2} style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 2 }}>{remarque.prestation}</Text> : null}
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={controleKey} label={`${localName || ''} · ${label}`} style={{ minHeight: 38, paddingHorizontal: 9 }} />
      </View> : null}
    </View> : null}

    {avis && avis !== 'N.S' && !detailOuvert && options.length > 1 ? <TouchableOpacity onPress={() => setDetailOuvert(true)} style={{ alignSelf: 'flex-start', marginTop: 5 }}><Text style={{ color: COLORS.orangeDark, fontSize: 10, fontWeight: '800' }}>Modifier le motif</Text></TouchableOpacity> : null}
  </View>;
});

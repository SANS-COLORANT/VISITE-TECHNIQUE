import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { PhotoButton } from './PhotoButton.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { reconnaitreTexteImageLocale } from './missionNativeTools.js';
import { extraireChampsPlaque, extraireValeurOcr, resumeIncertitudesSegments } from './photoModeData.js';
import { lignesLecturePlaque } from './terrainVisitModel.js';
import { ButtonGlow } from './ButtonGlow.js';
import { CvcIcon } from './MetraCvcIcons.js';
import * as ImagePicker from 'expo-image-picker';

/** Photo durable d'abord ; aucune proposition OCR ne s'applique sans validation. */
export function LecturePhotoButton({ visiteId, entiteKey, label, kind = 'meter', unit = '', current = {}, onApply, pendingPhoto = null, onClose, hideCapture = false }) {
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rawVisible, setRawVisible] = useState(false);
  const [guide, setGuide] = useState(false);
  const readRequest = useRef(0);
  useEffect(()=>()=>{readRequest.current+=1},[]);
  const lire = async (photo) => {
    const request = ++readRequest.current;
    setGuide(false);
    setRawVisible(false);
    setReview({ uri: photo.uri, rows: [], text: '', loading: true });
    try {
      const isMeter = /^(meter|counter|meters)$/.test(kind);
      let result = photo.ocrResult || (photo.text != null ? { text: photo.text } : null);
      if (!result) {
        try { result = await reconnaitreTexteImageLocale(isMeter ? (photo.ocrUri || photo.uri) : photo.uri, { meter: isMeter }); }
        catch (error) {
          if (!isMeter || !photo.ocrUri || photo.ocrUri === photo.uri) throw error;
          result = await reconnaitreTexteImageLocale(photo.uri, { meter: true });
        }
      }
      if (request !== readRequest.current) return;
      const text = String(result?.text || '');
      const found = kind === 'plate' ? null : extraireValeurOcr(result, { kind, unit, label });
      const rows = kind === 'plate' ? lignesLecturePlaque(extraireChampsPlaque(text), current)
        : [{ key: 'valeur', label: `${label}${unit ? ` (${unit})` : ''}`, value: found ? String(found.value) : '', current: String(current.valeur || '') }];
      const rawText = [...new Set([text, ...(result?.passes || []).map(p => p.text)].map(t => String(t || '').trim()).filter(Boolean))].join('\n\n');
      setRawVisible(kind !== 'plate' && !found && Boolean(rawText));
      setReview({ uri: photo.uri, rows, text: rawText, loading: false, unitMismatch: found?.unitMismatch, detectedUnit: found?.unit,
        hint: result?.unavailable ? 'Lecture automatique indisponible sur cet appareil. Tu peux saisir les valeurs ci-dessous.'
          : found?.unitMismatch ? `L’afficheur indique ${found.unit}, mais ce champ attend ${unit}. Vérifie le compteur sélectionné.`
          : kind !== 'plate' && !found && rawText ? `Du texte a été lu, mais ${isMeter ? 'l’index' : 'la valeur'} reste à vérifier sur la photo. Le texte reconnu est affiché ci-dessous.`
          : kind !== 'plate' && !found ? 'Aucun texte lisible. Vérifie la photo ou saisis la valeur.'
          : found?.source === 'seven-segment' ? `Lecture par segments, à confirmer sur la photo${resumeIncertitudesSegments(found) ? ` — ${resumeIncertitudesSegments(found)}` : ''}.${found.prefill ? '' : ' Saisis la valeur après vérification.'}${found.unitFromField ? ' Unité non lue : celle du champ est utilisée.' : ''}`
          : found?.requiresReview ? 'Index proposé à vérifier sur la photo, notamment la décimale et l’unité.'
          : !rawText ? 'Aucun texte lisible. Vérifie la photo ou saisis les valeurs.' : 'Vérifie chaque valeur, notamment les chiffres et les unités.' });
    } catch (error) {
      if (request !== readRequest.current) return;
      setReview({ uri: photo.uri, rows: kind === 'plate' ? lignesLecturePlaque({}, current) : [{ key: 'valeur', label, value: '', current: String(current.valeur || '') }], text: '', loading: false, hint: 'La photo est enregistrée. Lecture impossible ; la saisie manuelle reste disponible.' });
    }
  };
  const appliquer = async () => {
    if (busy || review?.loading) return;
    if (review?.unitMismatch) { Alert.alert('Unité incompatible', `Cette photo indique ${review.detectedUnit}. Sélectionne un compteur avec cette unité avant d’appliquer le relevé.`); return; }
    setBusy(true);
    try {
      const values = Object.fromEntries(review.rows.filter((r) => String(r.value).trim()).map((r) => [r.key, String(r.value).trim()]));
      if (!Object.keys(values).length) { Alert.alert('Valeur manquante', 'Renseigne au moins une valeur avant de l’appliquer.'); return; }
      await onApply(values);
      setReview(null);
      onClose?.();
    } catch (error) { Alert.alert('Sauvegarde impossible', String(error?.message || error)); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (pendingPhoto?.uri) lire(pendingPhoto); }, [pendingPhoto?.uri]);
  const fermer = () => { if (!busy) { readRequest.current+=1; setReview(null); onClose?.(); } };
  const importer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Autorise l’accès aux photos pour importer une plaque.');
      const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (selected.canceled || !selected.assets?.[0]?.uri) return;
      const { importCompanionPhoto } = require('./companionData.js');
      const stored = await importCompanionPhoto({ visiteId, uri: selected.assets[0].uri, meta: { targetKey: entiteKey, label, moduleId: 'equipment' } });
      await lire(stored);
    } catch (error) { Alert.alert('Import impossible', String(error?.message || error)); }
    finally { setBusy(false); }
  };
  return <>
    {hideCapture ? null : kind === 'plate' ? <TouchableOpacity accessibilityLabel="Lire la plaque signalétique" style={[styles.btnSecondary,{minHeight:48,gap:7}]} onPress={()=>setGuide(true)}><CvcIcon name="camera" size={22} color={COLORS.orange}/><Text style={styles.btnSecondaryText}>Lire la plaque</Text></TouchableOpacity> : <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} onPhotoSaved={lire} />}
    <Modal visible={guide} animationType="slide" onRequestClose={()=>setGuide(false)}><View style={{flex:1,backgroundColor:'#191813',padding:24,justifyContent:'space-between'}}>
      <View style={{flexDirection:'row',gap:12,alignItems:'center'}}><TouchableOpacity accessibilityLabel="Fermer la lecture" onPress={()=>setGuide(false)}><CvcIcon name="close" size={24} color="#fff"/></TouchableOpacity><Text style={{flex:1,fontFamily:FONTS.bold,color:'#fff',fontSize:18}}>Plaque signalétique</Text></View>
      <View style={{alignItems:'center',gap:24}}><Text style={{fontFamily:FONTS.body,color:'#fff',textAlign:'center'}}>Cadre la plaque entière et tiens la tablette immobile. La lecture se fait sur la tablette, même sans réseau.</Text><View style={{borderWidth:2,borderColor:COLORS.orange,borderRadius:22,padding:48}}><CvcIcon name="plate" size={90} color={COLORS.orange}/></View><Text style={{fontFamily:FONTS.body,color:'#C9C6BD',textAlign:'center'}}>Les champs détectés seront proposés à la vérification après la photo.</Text></View>
      <View style={{gap:14,alignItems:'center'}}><PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} onPhotoSaved={lire}/><TouchableOpacity disabled={busy} style={styles.btnSecondary} onPress={importer}><Text style={styles.btnSecondaryText}>Importer une photo existante</Text></TouchableOpacity></View>
    </View></Modal>
    <Modal visible={Boolean(review)} transparent animationType="slide" onRequestClose={fermer}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>{kind === 'plate' ? 'Vérification de la plaque' : 'Vérification du relevé'}</Text>
        <Text style={styles.importHint}>{review?.loading ? 'Lecture sur la tablette…' : review?.hint}</Text>
        {review?.uri ? <PhotoVariantImage uri={review.uri} style={{ height: 130, borderRadius: 16, marginVertical: 12 }} resizeMode="contain" /> : null}
        <ScrollView keyboardShouldPersistTaps="handled">
          {review?.rows.map((row) => <View key={row.key} style={[styles.formCard, { padding: 12 }]}>
            <Text style={styles.fieldLabel}>{row.label}</Text>
            <TextInput accessibilityLabel={`Vérifier ${row.label}`} style={styles.input} value={row.value} onChangeText={(value) => setReview((r) => ({ ...r, rows: r.rows.map((x) => x.key === row.key ? { ...x, value } : x) }))} keyboardType={kind === 'plate' ? 'default' : 'decimal-pad'} />
            <Text style={{ fontFamily: FONTS.body, color: row.value === row.current ? COLORS.green : COLORS.inkSoft, fontSize: 11, marginTop: 4 }}>{row.value && row.value === row.current ? 'Identique à la fiche' : row.current ? `Fiche actuelle : ${row.current}` : 'À vérifier'}</Text>
          </View>)}
          {review?.text ? <TouchableOpacity style={styles.btnSecondary} onPress={() => setRawVisible((v) => !v)}><Text style={styles.btnSecondaryText}>Voir le texte brut lu</Text></TouchableOpacity> : null}
          {rawVisible ? <Text selectable style={{ fontFamily: FONTS.body, color: COLORS.ink, marginVertical: 10 }}>{review?.text}</Text> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity disabled={busy} style={styles.btnSecondary} onPress={fermer}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy || review?.loading} style={[styles.btnPrimary, (busy || review?.loading) && { opacity: 0.5 }]} onPress={appliquer}><ButtonGlow /><Text style={styles.btnPrimaryText}>{busy ? 'Enregistrement…' : 'Appliquer à la fiche'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </>;
}

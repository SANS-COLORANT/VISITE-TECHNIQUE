/**
 * Signature du client en fin de visite (DA "Verre chaud").
 * Stockée dans _meta (clé signature_visite_<id>) pour ne pas être reprise
 * dans la visite suivante ni envoyée comme un champ de trame. Le rapport la
 * reprend en dernière page (reportBuilder.signaturesRapportHtml).
 */
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getDb } from './db.js';
import { COLORS, FONTS } from './styles.js';
import { ButtonGlow } from './ButtonGlow.js';

const cle = (visiteId) => `signature_visite_${visiteId}`;

export async function lireSignatureVisite(visiteId) {
  if (!visiteId) return null;
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [cle(visiteId)]);
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export async function enregistrerSignatureVisite(visiteId, signature) {
  const db = await getDb();
  if (!signature) { await db.runAsync(`DELETE FROM _meta WHERE key=?`, [cle(visiteId)]); return; }
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [cle(visiteId), JSON.stringify(signature)]
  );
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Bloc HTML du rapport (vide si aucune signature).
export function signatureHtml(signature, { output = 'pdf', site = '' } = {}) {
  if (!signature?.paths?.length) return '';
  const date = signature.date ? new Date(signature.date).toLocaleDateString('fr-FR') : '';
  const svg = output === 'word' ? '' : `<svg viewBox="0 0 ${Number(signature.w) || 320} ${Number(signature.h) || 160}" style="width:70mm;height:35mm;border-bottom:0.3mm solid #999">${signature.paths.map((d) => `<path d="${esc(d)}" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
  return `<section class="signatureBlock" style="break-inside:avoid-page;margin-top:8mm"><div class="sectionBanner">SIGNATURE DU CLIENT${site ? ' · ' + esc(site) : ''}</div><p style="margin:3mm 0 2mm">${esc(signature.nom || 'Représentant du client')}${signature.qualite ? ' · ' + esc(signature.qualite) : ''}${date ? ' · le ' + esc(date) : ''}</p>${svg}</section>`;
}

export function SignatureSheet({ visible, initial, onClose, onSave }) {
  const [paths, setPaths] = useState(initial?.paths || []);
  const [current, setCurrent] = useState('');
  const [nom, setNom] = useState(initial?.nom || '');
  const [qualite, setQualite] = useState(initial?.qualite || '');
  const size = useRef({ w: 320, h: 180 });
  const live = useRef('');

  React.useEffect(() => {
    if (!visible) return;
    setPaths(initial?.paths || []); setCurrent(''); live.current = '';
    setNom(initial?.nom || ''); setQualite(initial?.qualite || '');
  }, [visible, initial]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      live.current = `M${x.toFixed(1)} ${y.toFixed(1)}`; setCurrent(live.current);
    },
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      live.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`; setCurrent(live.current);
    },
    onPanResponderRelease: () => {
      const d = live.current; live.current = ''; setCurrent('');
      if (d) setPaths((p) => [...p, d.includes('L') ? d : `${d} l0.1 0`]);
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  const vide = !paths.length;
  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22,21,15,0.36)', padding: 10 }}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />
      <View style={{ backgroundColor: '#FBFAF7', borderRadius: 26, padding: 18 }}>
        <Text style={{ fontSize: 19, fontFamily: FONTS.black, color: COLORS.ink }}>Signature du client</Text>
        <Text style={{ marginTop: 3, fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft }}>Elle apparaîtra en fin de rapport.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TextInput value={nom} onChangeText={setNom} placeholder="Nom du signataire" placeholderTextColor={COLORS.inkFaint} style={{ flex: 1.3, minHeight: 46, paddingHorizontal: 12, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink }} />
          <TextInput value={qualite} onChangeText={setQualite} placeholder="Qualité" placeholderTextColor={COLORS.inkFaint} style={{ flex: 1, minHeight: 46, paddingHorizontal: 12, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink }} />
        </View>
        <View
          {...responder.panHandlers}
          onLayout={(e) => { size.current = { w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) }; }}
          style={{ marginTop: 12, height: 190, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: vide ? 'rgba(22,21,15,0.14)' : COLORS.orange, overflow: 'hidden' }}
        >
          <Svg width="100%" height="100%" pointerEvents="none">
            {paths.map((d, i) => <Path key={i} d={d} fill="none" stroke="#16150F" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />)}
            {current ? <Path d={current} fill="none" stroke="#16150F" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /> : null}
          </Svg>
          {vide && !current ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center' }}><Text style={{ color: COLORS.inkFaint, fontFamily: FONTS.bodySemi, fontSize: 13 }}>Signer ici avec le doigt</Text></View> : null}
          <View pointerEvents="none" style={{ position: 'absolute', left: 22, right: 22, bottom: 26, height: 1, backgroundColor: 'rgba(22,21,15,0.12)' }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <TouchableOpacity onPress={() => setPaths([])} disabled={vide} style={{ minHeight: 50, paddingHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', alignItems: 'center', justifyContent: 'center', opacity: vide ? 0.5 : 1 }}><Text style={{ color: COLORS.ink, fontFamily: FONTS.bodyBold }}>Effacer</Text></TouchableOpacity>
          <TouchableOpacity disabled={vide} onPress={() => onSave({ paths, w: size.current.w, h: size.current.h, nom: nom.trim(), qualite: qualite.trim(), date: new Date().toISOString() })} style={{ flex: 1, minHeight: 50, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: vide ? 0.5 : 1 }}><ButtonGlow radius={16} /><Text style={{ color: COLORS.white, fontFamily: FONTS.black, fontSize: 15 }}>Enregistrer la signature</Text></TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  ajouterAnnotationPhotoMission,
  listerPhotosAvecAnnotationsMission,
  supprimerAnnotationPhotoMission,
} from './missionPhotoAnnotationDb.js';
import { modifierVisibilitePhotoMission } from './missionMediaDb.js';
import { exporterAlbumPhotosMission } from './missionPhotoAlbumExport.js';

const TOOLS = [['select', 'Consulter'], ['circle', 'Cercle'], ['arrow', 'Flèche'], ['zone', 'Zone'], ['text', 'Texte']];

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}>
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontFamily: FONTS.bold }}>{label}</Text>
  </TouchableOpacity>;
}

function Annotation({ row, width, height }) {
  const g = row.geometry || {};
  const color = row.style?.color || '#2F7D58';
  if (row.annotation_type === 'circle') {
    return <Circle cx={Number(g.x || 0) * width} cy={Number(g.y || 0) * height} r={Number(g.r || 0.08) * Math.min(width, height)} fill="rgba(47,125,88,0.08)" stroke={color} strokeWidth={3} />;
  }
  if (row.annotation_type === 'arrow') {
    const x1 = Number(g.x1 || 0) * width, y1 = Number(g.y1 || 0) * height;
    const x2 = Number(g.x2 || 0) * width, y2 = Number(g.y2 || 0) * height;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 14;
    return <React.Fragment>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={4} />
      <Line x1={x2} y1={y2} x2={x2 - size * Math.cos(angle - Math.PI / 6)} y2={y2 - size * Math.sin(angle - Math.PI / 6)} stroke={color} strokeWidth={4} />
      <Line x1={x2} y1={y2} x2={x2 - size * Math.cos(angle + Math.PI / 6)} y2={y2 - size * Math.sin(angle + Math.PI / 6)} stroke={color} strokeWidth={4} />
    </React.Fragment>;
  }
  if (row.annotation_type === 'zone') {
    const x = Math.min(Number(g.x1 || 0), Number(g.x2 || 0)) * width;
    const y = Math.min(Number(g.y1 || 0), Number(g.y2 || 0)) * height;
    const w = Math.abs(Number(g.x2 || 0) - Number(g.x1 || 0)) * width;
    const h = Math.abs(Number(g.y2 || 0) - Number(g.y1 || 0)) * height;
    return <Rect x={x} y={y} width={w} height={h} fill="rgba(47,125,88,0.12)" stroke={color} strokeWidth={3} />;
  }
  if (row.annotation_type === 'text') {
    return <SvgText x={Number(g.x || 0) * width} y={Number(g.y || 0) * height} fill={color} fontSize="15" fontWeight="700">{String(row.text || 'Texte').slice(0, 50)}</SvgText>;
  }
  return null;
}

export function MissionPhotoAnnotationScreen({ route }) {
  const missionId = route?.params?.missionId;
  const initialPhotoId = route?.params?.photoId;
  const { width: screenWidth } = useWindowDimensions();
  const [photos, setPhotos] = useState([]);
  const [selectedId, setSelectedId] = useState(initialPhotoId || null);
  const [selected, setSelected] = useState(null);
  const [size, setSize] = useState({ width: Math.max(320, screenWidth - 32), height: 420 });
  const [tool, setTool] = useState('select');
  const [draft, setDraft] = useState([]);
  const [textModal, setTextModal] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [textPoint, setTextPoint] = useState(null);
  const [exportingAlbum, setExportingAlbum] = useState(false);

  const load = useCallback(async () => {
    const rows = await listerPhotosAvecAnnotationsMission(missionId);
    setPhotos(rows || []);
    const id = selectedId || rows?.[0]?.id || null;
    setSelectedId(id);
    const photo = rows.find((p) => p.id === id) || null;
    setSelected(photo);
    if (photo?.file_uri) {
      Image.getSize(photo.file_uri, (w, h) => {
        const width = Math.min(Math.max(320, screenWidth - 32), 1050);
        setSize({ width, height: Math.max(240, Math.min(1300, width * h / w)) });
      }, () => {});
    }
  }, [missionId, selectedId, screenWidth]);

  useEffect(() => { load(); }, [load]);

  const annotations = selected?.annotations || [];

  const save = async (annotationType, geometry, text = null) => {
    if (!selectedId) return;
    await ajouterAnnotationPhotoMission({
      photoId: selectedId,
      annotationType,
      geometry,
      text,
      style: { color: MISSION_COLORS.accent },
    });
    setDraft([]);
    await load();
  };

  const tap = async (event) => {
    if (!selectedId || tool === 'select') return;
    const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / size.width));
    const y = Math.max(0, Math.min(1, event.nativeEvent.locationY / size.height));
    if (tool === 'circle') {
      await save('circle', { x, y, r: 0.08 });
      return;
    }
    if (tool === 'text') {
      setTextPoint({ x, y });
      setTextValue('');
      setTextModal(true);
      return;
    }
    const next = [...draft, { x, y }];
    setDraft(next);
    if (tool === 'arrow' && next.length >= 2) {
      await save('arrow', { x1: next[0].x, y1: next[0].y, x2: next[1].x, y2: next[1].y });
    }
    if (tool === 'zone' && next.length >= 2) {
      await save('zone', { x1: next[0].x, y1: next[0].y, x2: next[1].x, y2: next[1].y });
    }
  };

  const confirmText = async () => {
    if (!textPoint) return;
    await save('text', textPoint, textValue);
    setTextModal(false);
    setTextPoint(null);
    setTextValue('');
  };

  const deleteLast = async () => {
    const last = annotations[annotations.length - 1];
    if (!last) return;
    await supprimerAnnotationPhotoMission(last.id);
    await load();
  };

  const setPhotoForReport = async (enabled) => {
    if (!selectedId) return;
    try {
      await modifierVisibilitePhotoMission(selectedId, enabled ? 'report' : 'internal');
      await load();
    } catch (e) {
      Alert.alert('Photo non modifiée', String(e?.message || e));
    }
  };

  const exportAlbum = async (mode) => {
    if (exportingAlbum) return;
    setExportingAlbum(true);
    try {
      const out = await exporterAlbumPhotosMission(missionId, { mode, share: true });
      Alert.alert('Album photos créé', out.name + '\n\n' + out.count + ' photo(s) dans la sélection.');
    } catch (e) {
      Alert.alert('Album impossible', String(e?.message || e));
    } finally {
      setExportingAlbum(false);
    }
  };

  const choosePhoto = async (photo) => {
    setSelectedId(photo.id);
    setSelected(photo);
    setDraft([]);
    if (photo?.file_uri) {
      Image.getSize(photo.file_uri, (w, h) => {
        const width = Math.min(Math.max(320, screenWidth - 32), 1050);
        setSize({ width, height: Math.max(240, Math.min(1300, width * h / w)) });
      }, () => {});
    }
  };

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Annotations photo</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        L’original reste intact. Les flèches, cercles, zones et textes sont stockés en couche séparée et restent modifiables.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} disabled={exportingAlbum} onPress={() => exportAlbum('all')}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ Album complet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} disabled={exportingAlbum} onPress={() => exportAlbum('report')}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ Sélection rapport</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} disabled={exportingAlbum} onPress={() => exportAlbum('issues')}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ Points / actions</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 15 }]}>Photo</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {photos.map((p, index) => <TouchableOpacity key={p.id} onPress={() => choosePhoto(p)} style={{ width: 108, marginRight: 7, borderWidth: 2, borderColor: p.id === selectedId ? MISSION_COLORS.accent : 'transparent', borderRadius: 10, overflow: 'hidden' }}>
          <Image source={{ uri: p.thumbnail_uri || p.preview_uri || p.file_uri }} style={{ width: 104, height: 76 }} resizeMode="cover" />
          <Text style={{ color: COLORS.inkSoft, fontSize: 8, padding: 4 }} numberOfLines={1}>{p.label || 'Photo ' + (index + 1)}</Text>
        </TouchableOpacity>)}
      </ScrollView>

      {selected ? <>
        <View style={[missionStyles.card, { padding: 10, marginTop: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.ink, fontSize: 10, fontFamily: FONTS.black }}>Inclure dans le rapport / livrable client</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.4, lineHeight: 12, marginTop: 2 }}>
                L’original reste conservé. Ce choix sert uniquement à constituer la sélection photo des livrables.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPhotoForReport(!['report','client'].includes(String(selected.visibility || '')))}
              style={{
                minWidth: 74,
                borderWidth: 1,
                borderColor: ['report','client'].includes(String(selected.visibility || '')) ? MISSION_COLORS.accent : MISSION_COLORS.accentLineStrong,
                backgroundColor: ['report','client'].includes(String(selected.visibility || '')) ? MISSION_COLORS.accentLight : '#FFFFFF',
                borderRadius: 10,
                paddingHorizontal: 9,
                paddingVertical: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 8.8, fontFamily: FONTS.black }}>
                {['report','client'].includes(String(selected.visibility || '')) ? 'INCLUSE ✓' : 'AJOUTER'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 14 }]}>Outil</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {TOOLS.map(([key, label]) => <Chip key={key} label={label} selected={tool === key} onPress={() => { setTool(key); setDraft([]); }} />)}
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={deleteLast}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>↶ Dernière</Text></TouchableOpacity>
        </View>
        <Text style={{ color: COLORS.inkFaint, fontSize: 9, marginBottom: 7 }}>{tool === 'arrow' || tool === 'zone' ? 'Place deux points.' : tool === 'text' ? 'Touchez la position du texte.' : tool === 'circle' ? 'Touchez la zone à entourer.' : 'Consultez les annotations.'}</Text>

        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={tap} style={{ width: size.width, height: size.height, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MISSION_COLORS.accentLine, overflow: 'hidden' }}>
            <Image source={{ uri: selected.file_uri }} style={{ width: size.width, height: size.height }} resizeMode="stretch" />
            <Svg width={size.width} height={size.height} style={{ position: 'absolute', left: 0, top: 0 }}>
              {annotations.map((a) => <Annotation key={a.id} row={a} width={size.width} height={size.height} />)}
              {draft.map((p, i) => <Circle key={i} cx={p.x * size.width} cy={p.y * size.height} r={5} fill="#FFFFFF" stroke={MISSION_COLORS.accent} strokeWidth={2} />)}
              {draft.length >= 2 ? <Line x1={draft[0].x * size.width} y1={draft[0].y * size.height} x2={draft[1].x * size.width} y2={draft[1].y * size.height} stroke={MISSION_COLORS.accent} strokeDasharray="5,4" strokeWidth={2} /> : null}
            </Svg>
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 15 }]}>Couches</Text>
        {annotations.map((a, index) => <View key={a.id} style={[missionStyles.card, { padding: 9, marginBottom: 5 }]}>
          <Text style={{ color: COLORS.ink, fontSize: 9.8, fontFamily: FONTS.bold }}>{index + 1}. {a.annotation_type}{a.text ? ' · ' + a.text : ''}</Text>
        </View>)}
      </> : <Text style={{ color: COLORS.inkFaint, fontSize: 10, marginTop: 15 }}>Aucune photo Mission disponible.</Text>}
    </ScrollView>

    <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Ajouter un texte</Text>
        <TextInput style={[styles.input, missionStyles.input]} value={textValue} onChangeText={setTextValue} placeholder="Commentaire technique" autoFocus />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setTextModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={confirmText}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Ajouter</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

import React, { useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';

function pathFromPoints(points = []) {
  if (!points.length) return '';
  return points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
}

export function MissionSignatureScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const visitId = route?.params?.visitId || null;
  const documentId = route?.params?.documentId || null;
  const [strokes, setStrokes] = useState([]);
  const [current, setCurrent] = useState([]);
  const [signer, setSigner] = useState('');
  const [role, setRole] = useState('');
  const canvasRef = useRef({ width: 800, height: 360 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrent([{ x: locationX, y: locationY }]);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrent((pts) => [...pts, { x: locationX, y: locationY }]);
        },
        onPanResponderRelease: () => {
          setCurrent((pts) => {
            if (pts.length) setStrokes((all) => [...all, pts]);
            return [];
          });
        }
      }),
    []
  );

  const clear = () => {
    setStrokes([]);
    setCurrent([]);
  };

  const save = async () => {
    if (!signer.trim()) {
      Alert.alert('Signataire à préciser', 'Indique le nom ou l’organisme du signataire.');
      return;
    }
    if (!strokes.length && !current.length) {
      Alert.alert('Signature vide', 'Trace la signature avant de l’enregistrer.');
      return;
    }
    const db = await getDb();
    const id = createId('msig');
    const width = canvasRef.current.width || 800;
    const height = canvasRef.current.height || 360;
    const normalized = [...strokes, ...(current.length ? [current] : [])].map((stroke) =>
      stroke.map((p) => ({ x: p.x / width, y: p.y / height }))
    );
    await db.runAsync(
      'INSERT INTO mission_signatures(id,mission_id,visit_id,document_id,role_label,signer_label,signed_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)',
      [
        id,
        missionId,
        visitId,
        documentId,
        role.trim() || null,
        signer.trim(),
        new Date().toISOString(),
        JSON.stringify({ format: 'normalized_strokes_v1', strokes: normalized })
      ]
    );
    Alert.alert(
      'Signature enregistrée',
      'La signature est rattachée à cette Mission et n’est utilisée que dans les livrables qui la nécessitent.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg, padding: 16 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Signature Mission</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginBottom: 12 }}>
        À utiliser uniquement lorsqu’une recette l’exige : passation contradictoire, OPR/réception ou PV.
      </Text>
      <TextInput
        style={[styles.input, missionStyles.input]}
        value={signer}
        onChangeText={setSigner}
        placeholder="Signataire / organisme"
      />
      <TextInput
        style={[styles.input, missionStyles.input, { marginTop: 8 }]}
        value={role}
        onChangeText={setRole}
        placeholder="Rôle : exploitant, entreprise, AMO…"
      />

      <View
        {...pan.panHandlers}
        onLayout={(e) => {
          canvasRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
        style={{
          flex: 1,
          minHeight: 280,
          maxHeight: 440,
          marginTop: 14,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: MISSION_COLORS.accentLine,
          borderRadius: 14,
          overflow: 'hidden'
        }}
      >
        <Svg width="100%" height="100%">
          {strokes.map((stroke, index) => (
            <Path
              key={index}
              d={pathFromPoints(stroke)}
              stroke={MISSION_COLORS.accentStrong}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {current.length ? (
            <Path
              d={pathFromPoints(current)}
              stroke={MISSION_COLORS.accentStrong}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
        {!strokes.length && !current.length ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: COLORS.inkFaint, fontSize: 11 }}>Signer ici</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={clear}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Effacer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, missionStyles.primaryButton, { flex: 1, alignItems: 'center' }]}
          onPress={save}
        >
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer la signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

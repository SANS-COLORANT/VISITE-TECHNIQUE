import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { rendrePagePdfLocale } from './missionNativeTools.js';
import { capturerPhotoMission } from './missionMediaDb.js';
import { getDb } from './db.js';
import { getMissionCapabilities } from './missionRecipes.js';
import {
  ajouterAnnotationPlan,
  calibrerPlan,
  choisirEtImporterPlanMission,
  creerCalquePlan,
  creerReseauDepuisPlanMission,
  creerReserveDepuisAnnotationPlan,
  deplacerPagePdfMission,
  dupliquerPagePdfMission,
  exporterGeoJsonMission,
  exporterGeoPackageMission,
  exporterPlanPdfAnnote,
  getCalibrationPlan,
  importerGeoJsonMission,
  lierAnnotationPlan,
  listerAnnotationsPlan,
  listerCalquesPlan,
  listerCiblesAnnotationMission,
  listerPlansMission,
  mesurerGeometriePlan,
  supprimerAnnotationPlan,
  supprimerPagePdfMission,
  tournerPagePdfMission,
} from './missionPlanDb.js';

const TOOLS = [
  ['select', 'Consulter'],
  ['point', 'Point'],
  ['count', 'Comptage'],
  ['line', 'Ligne'],
  ['network', 'Réseau'],
  ['distance', 'Distance'],
  ['polygon', 'Polygone'],
  ['angle', 'Angle'],
  ['text', 'Texte'],
  ['calibrate', 'Calibrer'],
  ['signature', 'Signature'],
];

const LINK_TYPES = Object.freeze([
  ['site', 'Site'],
  ['location', 'Bâtiment / local'],
  ['equipment', 'Équipement'],
  ['point', 'Point / réserve'],
  ['action', 'Action'],
  ['measure', 'Mesure'],
  ['photo', 'Photo'],
  ['installation', 'Installation'],
  ['system', 'Système'],
  ['network', 'Réseau'],
  ['signature', 'Signature'],
]);
const LINK_TYPE_LABELS = Object.freeze(Object.fromEntries(LINK_TYPES));

function parseGeometry(row) {
  return row?.geometry || {};
}

function ToolChip({ selected, label, onPress }) {
  return <TouchableOpacity
    onPress={onPress}
    style={{
      borderWidth: 1,
      borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
      backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
      borderRadius: 11,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginRight: 6,
      marginBottom: 6,
    }}
  ><Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9.5, fontWeight: '800' }}>{label}</Text></TouchableOpacity>;
}

function normalizedPoints(row, width, height) {
  const g = parseGeometry(row);
  const points = Array.isArray(g.points) ? g.points : (g.x !== undefined ? [g] : []);
  return points.map((p) => ({ x: Number(p.x || 0) * width, y: Number(p.y || 0) * height }));
}

function AnnotationShape({ row, width, height, onPress }) {
  const pts = normalizedPoints(row, width, height);
  if (!pts.length) return null;
  const color = MISSION_COLORS.accent;

  if (row.annotation_type === 'point' || row.annotation_type === 'symbol' || row.annotation_type === 'count') {
    const p = pts[0];
    return <React.Fragment>
      <Circle cx={p.x} cy={p.y} r={row.annotation_type === 'count' ? 10 : 7} fill={MISSION_COLORS.accentLight} stroke={color} strokeWidth={2.5} onPress={onPress} />
      {row.annotation_type === 'count'
        ? <SvgText x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="900" fill={MISSION_COLORS.accentStrong}>{String(row.text || '')}</SvgText>
        : (row.text ? <SvgText x={p.x + 10} y={p.y - 8} fontSize="11" fontWeight="700" fill={MISSION_COLORS.accentStrong}>{String(row.text).slice(0, 30)}</SvgText> : null)}
    </React.Fragment>;
  }

  if (row.annotation_type === 'text') {
    const p = pts[0];
    return <SvgText x={p.x} y={p.y} fontSize="12" fontWeight="700" fill={MISSION_COLORS.accentStrong} onPress={onPress}>{String(row.text || 'Texte').slice(0, 45)}</SvgText>;
  }

  if (row.annotation_type === 'signature') {
    const p = pts[0];
    const props = row.geometryProperties || {};
    const w = width * Math.max(0.08, Math.min(0.55, Number(props.widthRatio || 0.22)));
    const h = height * Math.max(0.04, Math.min(0.30, Number(props.heightRatio || 0.09)));
    return <React.Fragment>
      <Rect x={p.x} y={p.y} width={w} height={h} rx="5" fill="rgba(47,125,88,0.06)" stroke={color} strokeDasharray="5,4" strokeWidth={1.8} onPress={onPress} />
      <SvgText x={p.x + 6} y={p.y + 16} fontSize="9" fontWeight="700" fill={MISSION_COLORS.accentStrong}>{String(row.text || 'Signature').slice(0, 35)}</SvgText>
    </React.Fragment>;
  }

  if (row.annotation_type === 'polygon' && pts.length >= 3) {
    return <Polygon points={pts.map((p) => p.x + ',' + p.y).join(' ')} fill="rgba(47,125,88,0.12)" stroke={color} strokeWidth={2.5} onPress={onPress} />;
  }

  return <React.Fragment>
    {pts.slice(0, -1).map((p, i) => <Line key={i} x1={p.x} y1={p.y} x2={pts[i + 1].x} y2={pts[i + 1].y} stroke={color} strokeWidth={row.annotation_type === 'network' ? 4 : 2.5} onPress={onPress} />)}
    {row.text && pts[0] ? <SvgText x={pts[0].x + 6} y={pts[0].y - 6} fontSize="10" fill={MISSION_COLORS.accentStrong}>{String(row.text).slice(0, 35)}</SvgText> : null}
  </React.Fragment>;
}

export function MissionPlanScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const { width: windowWidth } = useWindowDimensions();
  const [plans, setPlans] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [layers, setLayers] = useState([]);
  const [layerId, setLayerId] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [preview, setPreview] = useState(null);
  const [tool, setTool] = useState('select');
  const [draftPoints, setDraftPoints] = useState([]);
  const [canvas, setCanvas] = useState({ width: Math.max(320, windowWidth - 32), height: 500 });
  const [calibration, setCalibration] = useState(null);
  const [textModal, setTextModal] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [pendingPoint, setPendingPoint] = useState(null);
  const [calibrationModal, setCalibrationModal] = useState(false);
  const [realDistance, setRealDistance] = useState('');
  const [loading, setLoading] = useState(false);
  const [layerModal, setLayerModal] = useState(false);
  const [layerName, setLayerName] = useState('');
  const [linkTargets, setLinkTargets] = useState([]);
  const [linkAnnotation, setLinkAnnotation] = useState(null);
  const [linkType, setLinkType] = useState('equipment');
  const [linkQuery, setLinkQuery] = useState('');
  const [networkModal, setNetworkModal] = useState(false);
  const [networkPoints, setNetworkPoints] = useState([]);
  const [networkDraft, setNetworkDraft] = useState({ label: '', type: '', material: '', dimension: '', insulation: '', direction: '' });
  const [reserveAnnotation, setReserveAnnotation] = useState(null);
  const [reserveDraft, setReserveDraft] = useState({ label: '', description: '', responsible: '', dueDate: '', dueText: '', priority: '', cost: '' });
  const [mediaBusyId, setMediaBusyId] = useState(null);
  const [signaturePoint, setSignaturePoint] = useState(null);
  const [signatureModal, setSignatureModal] = useState(false);
  const [missionCapabilities, setMissionCapabilities] = useState(null);

  const loadPlans = useCallback(async () => {
    const rows = await listerPlansMission(missionId);
    setPlans(rows || []);
    if (!selectedId && rows?.[0]?.id) setSelectedId(rows[0].id);
  }, [missionId, selectedId]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const refreshLinkTargets = useCallback(async () => {
    if (!missionId) return;
    try {
      setLinkTargets(await listerCiblesAnnotationMission(missionId));
    } catch {}
  }, [missionId]);

  useEffect(() => { refreshLinkTargets(); }, [refreshLinkTargets]);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const mission = await db.getFirstAsync('SELECT family,type FROM missions WHERE id=?', [missionId]);
        setMissionCapabilities(getMissionCapabilities(mission?.family, mission?.type));
      } catch {
        setMissionCapabilities(getMissionCapabilities(null, null));
      }
    })();
  }, [missionId]);

  const loadPlanContext = useCallback(async () => {
    const doc = plans.find((p) => p.id === selectedId);
    setSelected(doc || null);
    if (!doc) return;
    setLoading(true);
    try {
      const [layerRows, annotationRows, cal] = await Promise.all([
        listerCalquesPlan(doc.id),
        listerAnnotationsPlan(doc.id, page),
        getCalibrationPlan(doc.id, page),
      ]);
      setLayers(layerRows || []);
      setLayerId((current) => current && layerRows.some((l) => l.id === current) ? current : layerRows?.[0]?.id || null);
      setAnnotations(annotationRows || []);
      setCalibration(cal || null);

      if (String(doc.type).includes('pdf') || String(doc.name || '').toLowerCase().endsWith('.pdf')) {
        const render = await rendrePagePdfLocale(doc.file_uri, page - 1, 1400);
        setPreview(render);
        setPageCount(render.pageCount || 1);
      } else {
        await new Promise((resolve) => {
          Image.getSize(doc.file_uri, (w, h) => {
            setPreview({ uri: doc.file_uri, width: w, height: h, pageCount: 1 });
            setPageCount(1);
            resolve();
          }, () => {
            setPreview({ uri: doc.file_uri, width: 1200, height: 800, pageCount: 1 });
            setPageCount(1);
            resolve();
          });
        });
      }
    } catch (e) {
      Alert.alert('Plan indisponible', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [plans, selectedId, page]);

  useEffect(() => { loadPlanContext(); }, [loadPlanContext]);

  const visibleTools = useMemo(
    () => TOOLS.filter(([key]) => key !== 'signature' || missionCapabilities?.signature),
    [missionCapabilities]
  );
  const visibleLinkTypes = useMemo(
    () => LINK_TYPES.filter(([key]) => key !== 'signature' || missionCapabilities?.signature),
    [missionCapabilities]
  );
  const signatureTargets = useMemo(
    () => linkTargets.filter((target) => target.type === 'signature'),
    [linkTargets]
  );

  const aspect = preview?.width && preview?.height ? preview.height / preview.width : 0.72;
  const displayWidth = Math.min(Math.max(320, windowWidth - 32), 1100);
  const displayHeight = Math.max(260, Math.min(1500, displayWidth * aspect));

  useEffect(() => {
    setCanvas({ width: displayWidth, height: displayHeight });
  }, [displayWidth, displayHeight]);

  const saveShape = async (annotationType, points, label = null, extra = {}) => {
    if (!selected) return;
    await ajouterAnnotationPlan({
      missionId,
      documentId: selected.id,
      layerId,
      pageNumber: page,
      annotationType,
      geometry: { type: annotationType, points },
      text: label,
      ...extra,
    });
    setDraftPoints([]);
    setAnnotations(await listerAnnotationsPlan(selected.id, page));
  };

  const measureLabel = useCallback((type, points) => {
    if (!calibration) return null;
    const m = mesurerGeometriePlan({
      geometry: { type, points },
      calibration,
      displayWidth: canvas.width,
      displayHeight: canvas.height,
    });
    if (!m) return null;
    if (m.type === 'distance') return Number(m.value).toFixed(2) + ' ' + m.unit;
    if (m.type === 'polygon') return Number(m.area).toFixed(2) + ' ' + m.areaUnit + ' · P ' + Number(m.perimeter).toFixed(2) + ' ' + m.perimeterUnit;
    if (m.type === 'angle') return Number(m.value).toFixed(1) + '°';
    return null;
  }, [calibration, canvas]);

  const onCanvasPress = async (event) => {
    if (!selected || tool === 'select') return;
    const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / canvas.width));
    const y = Math.max(0, Math.min(1, event.nativeEvent.locationY / canvas.height));
    const point = { x, y };

    if (tool === 'point') {
      await saveShape('point', [point]);
      return;
    }
    if (tool === 'count') {
      const number = annotations.filter((row) => row.annotation_type === 'count').length + 1;
      await saveShape('count', [point], String(number), { symbolKey: 'count' });
      return;
    }
    if (tool === 'text') {
      setPendingPoint(point);
      setTextValue('');
      setTextModal(true);
      return;
    }
    if (tool === 'signature') {
      setSignaturePoint(point);
      await refreshLinkTargets();
      setSignatureModal(true);
      return;
    }

    const next = [...draftPoints, point];
    setDraftPoints(next);
    if (tool === 'calibrate' && next.length >= 2) {
      setCalibrationModal(true);
      return;
    }
    if (tool === 'network' && next.length >= 2) {
      setNetworkPoints(next.slice(0, 2));
      setNetworkDraft({ label: '', type: '', material: '', dimension: '', insulation: '', direction: '' });
      setNetworkModal(true);
      return;
    }
    if (['line', 'distance'].includes(tool) && next.length >= 2) {
      await saveShape(tool, next.slice(0, 2), tool === 'distance' ? measureLabel('distance', next.slice(0, 2)) : null);
      return;
    }
    if (tool === 'angle' && next.length >= 3) {
      await saveShape('angle', next.slice(0, 3), measureLabel('angle', next.slice(0, 3)));
    }
  };

  const finishPolygon = async () => {
    if (draftPoints.length < 3) {
      Alert.alert('Polygone incomplet', 'Place au moins 3 points.');
      return;
    }
    await saveShape('polygon', draftPoints, measureLabel('polygon', draftPoints));
  };

  const confirmText = async () => {
    if (!pendingPoint) return;
    await saveShape('text', [pendingPoint], textValue);
    setTextModal(false);
    setPendingPoint(null);
    setTextValue('');
  };

  const placeSignature = async (signatureTarget) => {
    if (!signaturePoint || !signatureTarget) return;
    try {
      await saveShape('signature', [signaturePoint], signatureTarget.label || 'Signature', {
        linkedEntityType: 'signature',
        linkedEntityId: signatureTarget.id,
        properties: { widthRatio: 0.22, heightRatio: 0.09 },
      });
      setSignatureModal(false);
      setSignaturePoint(null);
    } catch (e) {
      Alert.alert('Signature non placée', String(e?.message || e));
    }
  };

  const confirmNetwork = async () => {
    if (!selected || networkPoints.length < 2) return;
    try {
      const properties = {
        material: networkDraft.material || null,
        dimension: networkDraft.dimension || null,
        insulation: networkDraft.insulation || null,
        direction: networkDraft.direction || null,
      };
      const networkId = await creerReseauDepuisPlanMission({
        missionId,
        documentId: selected.id,
        label: networkDraft.label || 'Réseau technique',
        type: networkDraft.type || null,
        properties,
      });
      await saveShape('network', networkPoints, networkDraft.label || 'Réseau technique', {
        linkedEntityType: 'network',
        linkedEntityId: networkId,
        properties,
      });
      setNetworkModal(false);
      setNetworkPoints([]);
      setNetworkDraft({ label: '', type: '', material: '', dimension: '', insulation: '', direction: '' });
      await refreshLinkTargets();
    } catch (e) {
      Alert.alert('Réseau non créé', String(e?.message || e));
    }
  };

  const linkedTargetByKey = useMemo(
    () => new Map(linkTargets.map((target) => [target.type + ':' + target.id, target])),
    [linkTargets]
  );

  const filteredLinkTargets = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    return linkTargets
      .filter((target) => target.type === linkType)
      .filter((target) => !q || [target.label, target.subtitle].some((value) => String(value || '').toLowerCase().includes(q)))
      .slice(0, 150);
  }, [linkTargets, linkType, linkQuery]);

  const openLink = (annotation) => {
    setLinkAnnotation(annotation);
    setLinkType(annotation?.linked_entity_type || 'equipment');
    setLinkQuery('');
  };

  const applyLink = async (target) => {
    if (!linkAnnotation) return;
    try {
      await lierAnnotationPlan(linkAnnotation.id, { entityType: target.type, entityId: target.id });
      setAnnotations(await listerAnnotationsPlan(selected.id, page));
      setLinkAnnotation(null);
    } catch (e) {
      Alert.alert('Liaison impossible', String(e?.message || e));
    }
  };

  const clearLink = async () => {
    if (!linkAnnotation) return;
    try {
      await lierAnnotationPlan(linkAnnotation.id, { entityType: null, entityId: null });
      setAnnotations(await listerAnnotationsPlan(selected.id, page));
      setLinkAnnotation(null);
    } catch (e) {
      Alert.alert('Déliaison impossible', String(e?.message || e));
    }
  };

  const openReserve = (annotation) => {
    setReserveAnnotation(annotation);
    setReserveDraft({
      label: annotation?.text ? 'Réserve · ' + annotation.text : 'Réserve localisée sur plan',
      description: '',
      responsible: '',
      dueDate: '',
      dueText: '',
      priority: '',
      cost: '',
    });
  };

  const createReserve = async () => {
    if (!reserveAnnotation) return;
    try {
      await creerReserveDepuisAnnotationPlan({
        annotationId: reserveAnnotation.id,
        label: reserveDraft.label,
        description: reserveDraft.description,
        responsibleLabel: reserveDraft.responsible,
        dueDate: reserveDraft.dueDate,
        dueText: reserveDraft.dueText,
        priority: reserveDraft.priority,
        costEstimate: reserveDraft.cost,
      });
      setReserveAnnotation(null);
      await Promise.all([
        refreshLinkTargets(),
        listerAnnotationsPlan(selected.id, page).then(setAnnotations),
      ]);
      Alert.alert('Réserve créée', 'Le point et son action sont localisés sur le plan. Responsable, échéance, coût et photos avant/après restent modifiables dans Actions.');
    } catch (e) {
      Alert.alert('Réserve non créée', String(e?.message || e));
    }
  };

  const takePhotoAtAnnotation = async (annotation) => {
    if (!annotation?.geometry_id || mediaBusyId) return;
    setMediaBusyId(annotation.id);
    try {
      const photo = await capturerPhotoMission({
        missionId,
        geometryId: annotation.geometry_id,
        label: annotation.text ? 'Photo · ' + annotation.text : 'Photo localisée sur plan',
        type: 'plan_position',
      });
      if (photo) {
        await refreshLinkTargets();
        Alert.alert('Photo positionnée', 'La photo a hérité automatiquement du contexte du point du plan.');
      }
    } catch (e) {
      Alert.alert('Photo impossible', String(e?.message || e));
    } finally {
      setMediaBusyId(null);
    }
  };

  const confirmCalibration = async () => {
    if (draftPoints.length < 2 || !selected) return;
    try {
      const cal = await calibrerPlan({
        missionId,
        documentId: selected.id,
        pageNumber: page,
        pointA: draftPoints[0],
        pointB: draftPoints[1],
        displayWidth: canvas.width,
        displayHeight: canvas.height,
        realDistance,
        unit: 'm',
      });
      setCalibration(cal);
      setDraftPoints([]);
      setCalibrationModal(false);
      setRealDistance('');
      setTool('distance');
    } catch (e) {
      Alert.alert('Calibration impossible', String(e?.message || e));
    }
  };

  const importPlan = async () => {
    try {
      const doc = await choisirEtImporterPlanMission({ missionId });
      if (doc) {
        setSelectedId(doc.id);
        setPage(1);
        await loadPlans();
      }
    } catch (e) {
      Alert.alert('Import impossible', String(e?.message || e));
    }
  };

  const createLayer = async () => {
    if (!selected || !layerName.trim()) return;
    const id = await creerCalquePlan({ missionId, documentId: selected.id, label: layerName.trim() });
    setLayerModal(false);
    setLayerName('');
    setLayers(await listerCalquesPlan(selected.id));
    setLayerId(id);
  };

  const deleteLast = async () => {
    const last = annotations[annotations.length - 1];
    if (!last) return;
    await supprimerAnnotationPlan(last.id);
    setAnnotations(await listerAnnotationsPlan(selected.id, page));
  };

  const exportAnnotated = async () => {
    if (!selected) return;
    try { await exporterPlanPdfAnnote({ missionId, documentId: selected.id, share: true }); }
    catch (e) { Alert.alert('Export impossible', String(e?.message || e)); }
  };

  const adoptDerivedPdf = async (result, nextPage = page) => {
    if (!result?.id) return;
    await loadPlans();
    setSelectedId(result.id);
    setPage(Math.max(1, Number(nextPage) || 1));
    setDraftPoints([]);
  };

  const rotate = async () => {
    if (!selected || !String(selected.type).includes('pdf')) return;
    try {
      const result = await tournerPagePdfMission({ missionId, documentId: selected.id, pageNumber: page, angle: 90 });
      await adoptDerivedPdf(result, page);
    } catch (e) { Alert.alert('Rotation impossible', String(e?.message || e)); }
  };

  const duplicatePage = async () => {
    if (!selected || !String(selected.type).includes('pdf')) return;
    try {
      const result = await dupliquerPagePdfMission({ missionId, documentId: selected.id, pageNumber: page });
      await adoptDerivedPdf(result, page + 1);
    } catch (e) { Alert.alert('Duplication impossible', String(e?.message || e)); }
  };

  const movePage = async (delta) => {
    if (!selected || !String(selected.type).includes('pdf')) return;
    try {
      const result = await deplacerPagePdfMission({ missionId, documentId: selected.id, pageNumber: page, delta });
      if (result?.unchanged) return;
      await adoptDerivedPdf(result, Math.max(1, Math.min(pageCount, page + (delta < 0 ? -1 : 1))));
    } catch (e) { Alert.alert('Déplacement impossible', String(e?.message || e)); }
  };

  const deletePage = () => {
    if (!selected || !String(selected.type).includes('pdf')) return;
    Alert.alert(
      'Supprimer cette page ?',
      'Le PDF source reste intact. METRA créera une nouvelle version dérivée sans cette page.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Créer la version sans cette page',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await supprimerPagePdfMission({ missionId, documentId: selected.id, pageNumber: page });
              await adoptDerivedPdf(result, Math.max(1, Math.min(page, pageCount - 1)));
            } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
          },
        },
      ]
    );
  };

  const draftPx = draftPoints.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Plans · PDF · SIG</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Le plan original reste intact. Les annotations, mesures et objets techniques sont enregistrés en couches structurées.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={importPlan}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Importer plan / PDF</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionMap', { missionId })}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Carte SIG</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={async () => { try { await importerGeoJsonMission({ missionId }); Alert.alert('SIG', 'Couche GeoJSON importée hors ligne.'); } catch (e) { Alert.alert('Import SIG', String(e?.message || e)); } }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Importer GeoJSON</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={async () => { try { await exporterGeoJsonMission(missionId); } catch (e) { Alert.alert('Export SIG', String(e?.message || e)); } }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Exporter GeoJSON</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={async () => { try { await exporterGeoPackageMission(missionId); } catch (e) { Alert.alert('GeoPackage', String(e?.message || e)); } }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>GeoPackage QGIS</Text></TouchableOpacity>
      </View>

      {plans.length ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Document actif</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {plans.map((doc) => <ToolChip key={doc.id} label={doc.name || 'Plan'} selected={doc.id === selectedId} onPress={() => { setSelectedId(doc.id); setPage(1); setDraftPoints([]); }} />)}
        </ScrollView>
      </> : <View style={[missionStyles.card, { padding: 14, marginTop: 16 }]}><Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>Aucun plan importé.</Text></View>}

      {selected ? <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setLayerModal(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Calque</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={deleteLast}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>↶ Dernière annotation</Text></TouchableOpacity>
          {String(selected.type).includes('pdf') ? <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={rotate}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>↻ Rotation page</Text></TouchableOpacity> : null}
          {String(selected.type).includes('pdf') ? <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={duplicatePage}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⧉ Dupliquer page</Text></TouchableOpacity> : null}
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={exportAnnotated}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Exporter PDF annoté</Text></TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Calque</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {layers.map((layer) => <ToolChip key={layer.id} label={layer.label} selected={layer.id === layerId} onPress={() => setLayerId(layer.id)} />)}
        </ScrollView>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 14 }]}>Outil</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {visibleTools.map(([key, label]) => <ToolChip key={key} label={label} selected={tool === key} onPress={() => { setTool(key); setDraftPoints([]); }} />)}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, color: COLORS.inkFaint, fontSize: 9.5 }}>
            {calibration ? 'Échelle calibrée : ' + Number(calibration.real_distance || calibration.realDistance).toFixed(2) + ' ' + (calibration.unit || 'm') : 'Échelle non calibrée · utilisez « Calibrer » pour les distances/surfaces réelles.'}
          </Text>
          {tool === 'polygon' && draftPoints.length >= 3 ? <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={finishPolygon}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Fermer polygone</Text></TouchableOpacity> : null}
        </View>

        {pageCount > 1 ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
            <TouchableOpacity disabled={page <= 1} onPress={() => { setPage((p) => Math.max(1, p - 1)); setDraftPoints([]); }} style={{ padding: 8 }}><Text style={{ color: page <= 1 ? COLORS.inkFaint : MISSION_COLORS.accentDark }}>← Page</Text></TouchableOpacity>
            <Text style={{ color: COLORS.ink, fontWeight: '900' }}>{page} / {pageCount}</Text>
            <TouchableOpacity disabled={page >= pageCount} onPress={() => { setPage((p) => Math.min(pageCount, p + 1)); setDraftPoints([]); }} style={{ padding: 8 }}><Text style={{ color: page >= pageCount ? COLORS.inkFaint : MISSION_COLORS.accentDark }}>Page →</Text></TouchableOpacity>
          </View>
          {String(selected.type).includes('pdf') ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 9 }}>
            <TouchableOpacity disabled={page <= 1} style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => movePage(-1)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Déplacer avant</Text></TouchableOpacity>
            <TouchableOpacity disabled={page >= pageCount} style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => movePage(1)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Déplacer après</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={deletePage}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText, { color: '#8B3A3A' }]}>Supprimer page</Text></TouchableOpacity>
          </View> : null}
        </> : null}

        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={onCanvasPress} style={{ width: canvas.width, height: canvas.height, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MISSION_COLORS.accentLine, overflow: 'hidden' }}>
            {loading ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}><ActivityIndicator color={MISSION_COLORS.accent} /></View> : null}
            {preview?.uri ? <Image source={{ uri: preview.uri }} style={{ position: 'absolute', left: 0, top: 0, width: canvas.width, height: canvas.height }} resizeMode="stretch" /> : null}
            <Svg width={canvas.width} height={canvas.height} style={{ position: 'absolute', left: 0, top: 0 }}>
              {annotations.filter((a) => Number(a.layer_visible ?? 1) === 1).map((row) => <AnnotationShape key={row.id} row={row} width={canvas.width} height={canvas.height} onPress={() => {}} />)}
              {draftPx.map((p, i) => <Circle key={'draft-' + i} cx={p.x} cy={p.y} r={5} fill="#FFFFFF" stroke={MISSION_COLORS.accent} strokeWidth={2} />)}
              {draftPx.slice(0, -1).map((p, i) => <Line key={'draft-line-' + i} x1={p.x} y1={p.y} x2={draftPx[i + 1].x} y2={draftPx[i + 1].y} stroke={MISSION_COLORS.accent} strokeDasharray="5,4" strokeWidth={2} />)}
            </Svg>
          </Pressable>
        </View>

        {annotations.length ? <View style={{ marginTop: 12 }}>
          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Annotations de la page</Text>
          {annotations.map((a) => {
            const linked = a.linked_entity_type && a.linked_entity_id
              ? linkedTargetByKey.get(a.linked_entity_type + ':' + a.linked_entity_id)
              : null;
            return <View key={a.id} style={[missionStyles.card, { padding: 10, marginBottom: 6 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '800', fontSize: 10.5 }}>{a.annotation_type}{a.text ? ' · ' + a.text : ''}</Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>{a.layer_label || 'Sans calque'}</Text>
                  {a.linked_entity_type ? <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.8, marginTop: 4 }}>
                    Lié : {LINK_TYPE_LABELS[a.linked_entity_type] || a.linked_entity_type} · {linked?.label || a.linked_entity_id}
                  </Text> : <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 4 }}>Non lié à un objet METRA</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                  <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => openLink(a)}>
                    <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Lier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} disabled={mediaBusyId === a.id} onPress={() => takePhotoAtAnnotation(a)}>
                    <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{mediaBusyId === a.id ? '…' : '📷 Photo'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => openReserve(a)}>
                    <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Réserve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>;
          })}
        </View> : null}
      </> : null}
    </ScrollView>

    <Modal visible={networkModal} transparent animationType="fade" onRequestClose={() => { setNetworkModal(false); setNetworkPoints([]); setDraftPoints([]); }}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Réseau technique</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 10 }}>
          La ligne devient un vrai objet Réseau METRA, réutilisable dans le synoptique, l’Excel et l’export SIG.
        </Text>
        <TextInput style={[styles.input, missionStyles.input]} value={networkDraft.label} onChangeText={(v) => setNetworkDraft((p) => ({ ...p, label: v }))} placeholder="Nom : Départ radiateurs Nord…" autoFocus />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={networkDraft.type} onChangeText={(v) => setNetworkDraft((p) => ({ ...p, type: v }))} placeholder="Type : chauffage, ECS, air neuf, fluide…" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={networkDraft.dimension} onChangeText={(v) => setNetworkDraft((p) => ({ ...p, dimension: v }))} placeholder="Dimension / diamètre / section" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={networkDraft.material} onChangeText={(v) => setNetworkDraft((p) => ({ ...p, material: v }))} placeholder="Matériau" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={networkDraft.insulation} onChangeText={(v) => setNetworkDraft((p) => ({ ...p, insulation: v }))} placeholder="Calorifuge / isolation" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={networkDraft.direction} onChangeText={(v) => setNetworkDraft((p) => ({ ...p, direction: v }))} placeholder="Sens / fonction" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => { setNetworkModal(false); setNetworkPoints([]); setDraftPoints([]); }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={confirmNetwork}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer le réseau</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>

    <Modal visible={!!linkAnnotation} transparent animationType="fade" onRequestClose={() => setLinkAnnotation(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Lier l’objet du plan</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 9 }}>
          Le point, la ligne ou le polygone devient la géométrie de l’objet choisi. Une seule saisie pourra ensuite alimenter photos, mesures, constats et exports.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 7 }}>
          {visibleLinkTypes.map(([key,label]) => <ToolChip key={key} label={label} selected={linkType === key} onPress={() => { setLinkType(key); setLinkQuery(''); }} />)}
        </ScrollView>
        <TextInput style={[styles.input, missionStyles.input]} value={linkQuery} onChangeText={setLinkQuery} placeholder="Rechercher dans cette catégorie…" />
        <ScrollView style={{ maxHeight: 330, marginTop: 7 }}>
          {filteredLinkTargets.map((target) => <TouchableOpacity key={target.type + ':' + target.id} onPress={() => applyLink(target)} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.2, fontWeight: '800' }}>{target.label}</Text>
            {target.subtitle ? <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>{target.subtitle}</Text> : null}
          </TouchableOpacity>)}
          {!filteredLinkTargets.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.5, paddingVertical: 12 }}>Aucun objet dans cette catégorie.</Text> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          {linkAnnotation?.linked_entity_id ? <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={clearLink}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Délier</Text></TouchableOpacity> : null}
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setLinkAnnotation(null)}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Fermer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={signatureModal} transparent animationType="fade" onRequestClose={() => { setSignatureModal(false); setSignaturePoint(null); }}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Placer une signature</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 9 }}>
          Choisis une signature enregistrée dans cette Mission. Elle sera dessinée dans le PDF exporté sans modifier le fichier source.
        </Text>
        <ScrollView style={{ maxHeight: 280 }}>
          {signatureTargets.map((target) => <TouchableOpacity key={target.id} onPress={() => placeSignature(target)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900' }}>{target.label}</Text>
            {target.subtitle ? <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 2 }}>{target.subtitle}</Text> : null}
          </TouchableOpacity>)}
          {!signatureTargets.length ? <View style={{ paddingVertical: 10 }}>
            <Text style={{ color: COLORS.inkFaint, fontSize: 9.5, lineHeight: 13 }}>Aucune signature enregistrée pour cette Mission.</Text>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { alignSelf: 'flex-start', marginTop: 9 }]} onPress={() => { setSignatureModal(false); navigation.navigate('MissionSignature', { missionId }); }}>
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Créer une signature</Text>
            </TouchableOpacity>
          </View> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={refreshLinkTargets}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Actualiser</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => { setSignatureModal(false); setSignaturePoint(null); }}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Fermer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!reserveAnnotation} transparent animationType="fade" onRequestClose={() => setReserveAnnotation(null)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Réserve / action localisée</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 10 }}>
          METRA crée un point et une action liés à cette géométrie. Les photos avant / après pourront ensuite être prises depuis Actions sans ressaisie du contexte.
        </Text>
        <TextInput style={[styles.input, missionStyles.input]} value={reserveDraft.label} onChangeText={(v) => setReserveDraft((p) => ({ ...p, label: v }))} placeholder="Réserve / action demandée" autoFocus />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8, minHeight: 72, textAlignVertical: 'top' }]} multiline value={reserveDraft.description} onChangeText={(v) => setReserveDraft((p) => ({ ...p, description: v }))} placeholder="Constat / description" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={reserveDraft.responsible} onChangeText={(v) => setReserveDraft((p) => ({ ...p, responsible: v }))} placeholder="Responsable / entreprise" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={reserveDraft.dueDate} onChangeText={(v) => setReserveDraft((p) => ({ ...p, dueDate: v }))} placeholder="Échéance AAAA-MM-JJ" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={reserveDraft.dueText} onChangeText={(v) => setReserveDraft((p) => ({ ...p, dueText: v }))} placeholder="Échéance libre : prochaine visite…" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={reserveDraft.priority} onChangeText={(v) => setReserveDraft((p) => ({ ...p, priority: v }))} placeholder="Priorité / criticité" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} keyboardType="decimal-pad" value={reserveDraft.cost} onChangeText={(v) => setReserveDraft((p) => ({ ...p, cost: v }))} placeholder="Coût estimé €" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setReserveAnnotation(null)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createReserve}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer point + action</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>

    <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Texte sur le plan</Text>
        <TextInput style={[styles.input, missionStyles.input]} value={textValue} onChangeText={setTextValue} placeholder="Libellé / commentaire" autoFocus />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setTextModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={confirmText}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Ajouter</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={calibrationModal} transparent animationType="fade" onRequestClose={() => { setCalibrationModal(false); setDraftPoints([]); }}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Calibrer l’échelle</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10, lineHeight: 14, marginBottom: 10 }}>
          Indique la distance réelle entre les deux points placés sur le plan.
        </Text>
        <TextInput style={[styles.input, missionStyles.input]} value={realDistance} onChangeText={setRealDistance} keyboardType="decimal-pad" placeholder="Distance réelle en mètres" autoFocus />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => { setCalibrationModal(false); setDraftPoints([]); }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={confirmCalibration}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Calibrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={layerModal} transparent animationType="fade" onRequestClose={() => setLayerModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Nouveau calque</Text>
        <TextInput style={[styles.input, missionStyles.input]} value={layerName} onChangeText={setLayerName} placeholder="Réseaux chauffage, réserves, équipements…" autoFocus />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setLayerModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createLayer}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

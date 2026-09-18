import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { creerPointMission, creerVisiteMission, getMissionDashboard, mettreAJourMission, mettreAJourStatutPoint } from './missionsDb.js';
import { exporterMissionExcel } from './missionExcelExport.js';
import { exporterMissionExcelClient } from './missionClientExcelExport.js';
import { choisirEtImporterMissionExcel } from './missionExcelImport.js';
import { getMissionDomainSummary } from './missionDomainDb.js';
import { getMissionCapabilities } from './missionRecipes.js';
import { getMissionFieldPlaybook } from './missionFieldPlaybooks.js';

const POINT_TYPES = Object.freeze([
  ['reserve', 'Réserve'],
  ['action', 'Action'],
  ['request', 'Demande'],
  ['control', 'Contrôle'],
  ['decision', 'Décision'],
  ['information', 'Information'],
]);

const POINT_STATUS = Object.freeze({
  open: 'Ouvert',
  in_progress: 'En cours',
  waiting: 'En attente',
  to_check: 'À contrôler',
  closed: 'Clôturé',
  no_follow_up: 'Sans suite',
});

function Pill({ active, label, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderRadius: 12, borderWidth: 1, borderColor: active ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: active ? MISSION_COLORS.accentLight : COLORS.white, paddingHorizontal: 11, paddingVertical: 8, marginRight: 7, marginBottom: 7 }}><Text style={{ color: active ? MISSION_COLORS.accentDark : COLORS.ink, fontSize: 10.5, fontWeight: '800' }}>{label}</Text></TouchableOpacity>;
}

function PhaseRail({ phases = [] }) {
  if (!phases.length) return <Text style={{ color: COLORS.inkFaint, fontSize: 10.5 }}>Aucune phase imposée. La Mission reste libre.</Text>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
    {phases.map((phase, index) => <View key={phase.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ minWidth: 96, borderRadius: 12, borderWidth: 1, borderColor: phase.status === 'done' ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: phase.status === 'done' ? MISSION_COLORS.accentLight : COLORS.white, paddingHorizontal: 10, paddingVertical: 9 }}>
        <Text style={{ color: phase.status === 'done' ? MISSION_COLORS.accentDark : COLORS.ink, fontWeight: '800', fontSize: 10.5 }} numberOfLines={2}>{phase.label}</Text>
      </View>
      {index < phases.length - 1 ? <Text style={{ marginHorizontal: 5, color: MISSION_COLORS.accentLineStrong }}>→</Text> : null}
    </View>)}
  </ScrollView>;
}

export function MissionScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pointModal, setPointModal] = useState(false);
  const [pointType, setPointType] = useState('information');
  const [pointLabel, setPointLabel] = useState('');
  const [pointDescription, setPointDescription] = useState('');
  const [pointDueText, setPointDueText] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingClient, setExportingClient] = useState(false);
  const [importing, setImporting] = useState(false);
  const [domainSummary, setDomainSummary] = useState({});

  const reload = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    try {
      const [dashboard, summary] = await Promise.all([getMissionDashboard(missionId), getMissionDomainSummary(missionId)]);
      setData(dashboard);
      setDomainSummary(summary || {});
    }
    finally { setLoading(false); }
  }, [missionId]);

  useEffect(() => { reload(); }, [reload]);

  const openPoints = useMemo(() => (data?.points || []).filter((p) => !['closed', 'no_follow_up'].includes(p.status)), [data?.points]);
  const capabilities = useMemo(
    () => getMissionCapabilities(data?.mission?.family, data?.mission?.type),
    [data?.mission?.family, data?.mission?.type]
  );
  const playbook = useMemo(
    () => getMissionFieldPlaybook(data?.mission?.type),
    [data?.mission?.type]
  );

  const createVisit = async () => {
    try {
      const visitId = await creerVisiteMission({
        missionId,
        siteId: data?.sites?.[0]?.id || null,
        visitType: playbook.defaultVisitType || 'visite terrain',
      });
      await mettreAJourMission(missionId, { status: 'active' });
      await reload();
      navigation.navigate('MissionVisit', { missionId, visitId });
    } catch (e) { Alert.alert('Visite non créée', String(e.message || e)); }
  };

  const openPlaybookPoint = (preset) => {
    setPointType(preset?.pointType || 'information');
    setPointLabel(preset?.label || '');
    setPointDescription(preset?.description || preset?.requestedAction || '');
    setPointDueText(preset?.due || '');
    setPointModal(true);
  };

  const openPlaybookAction = (item) => {
    if (!item) return;
    if (item.kind === 'navigate' && item.route) {
      navigation.navigate(item.route, { missionId, siteId: data?.sites?.[0]?.id || null });
      return;
    }
    if (item.kind === 'point') {
      openPlaybookPoint(item.preset);
      return;
    }
    if (item.kind === 'measure') {
      navigation.navigate('MissionMeasurements', { missionId });
      return;
    }
    if (item.kind === 'document') {
      navigation.navigate('MissionDocuments', { missionId });
    }
  };

  const createPoint = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await creerPointMission({ missionId, siteId: data?.sites?.[0]?.id || null, type: pointType, label: pointLabel, description: pointDescription, dueText: pointDueText });
      setPointModal(false);
      setPointLabel('');
      setPointDescription('');
      setPointDueText('');
      setPointType('information');
      await reload();
    } catch (e) { Alert.alert('Point non créé', String(e.message || e)); }
    finally { setSaving(false); }
  };

  const closePoint = async (point) => {
    try {
      await mettreAJourStatutPoint(point.id, 'closed', { comment: 'Clôture depuis la fiche Mission' });
      await reload();
    } catch (e) { Alert.alert('Point non modifié', String(e.message || e)); }
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exporterMissionExcel(missionId);
      Alert.alert('Export Mission créé', `${result.name}\n\nLes données sont structurées par feuilles et les médias restent référencés séparément.`);
    } catch (e) { Alert.alert('Export impossible', String(e.message || e)); }
    finally { setExporting(false); }
  };

  const exportClientExcel = async () => {
    if (exportingClient) return;
    setExportingClient(true);
    try {
      const result = await exporterMissionExcelClient(missionId);
      Alert.alert(
        'Excel client créé',
        result.name + '\n\nSynthèse, sites, actions, réserves, inventaire, mesures, visites, photos, documents et scénarios sont présentés dans des feuilles directement exploitables.'
      );
    } catch (e) {
      Alert.alert('Export client impossible', String(e?.message || e));
    } finally {
      setExportingClient(false);
    }
  };

  const importExcel = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await choisirEtImporterMissionExcel({ targetMissionId: missionId });
      if (!result) return;
      await reload();
      Alert.alert(
        result.canonical ? 'Classeur METRA réimporté' : 'Classeur externe importé',
        result.canonical
          ? 'Les données structurées du classeur ont été fusionnées à partir de leurs identifiants stables.'
          : `${result.rows || 0} ligne(s) ont été conservées intégralement comme source Excel de cette Mission.`
      );
    } catch (e) {
      Alert.alert('Import impossible', String(e?.message || e));
    } finally {
      setImporting(false);
    }
  };

  if (loading && !data) return <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, missionStyles.screen]}><ActivityIndicator color={MISSION_COLORS.accent} /></View>;
  if (!data?.mission) return <View style={styles.center}><Text style={styles.errorTitle}>Mission introuvable</Text></View>;

  const { mission, sites, phases, visits, points, documents } = data;
  return (
    <View style={[{ flex: 1 }, missionStyles.screen]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={[{ backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, padding: 16 }, missionStyles.card]}>
          <Text style={[{ fontWeight: '900', fontSize: 20 }, missionStyles.title]}>{mission.label || 'Mission sans titre'}</Text>
          <Text style={{ color: COLORS.inkSoft, marginTop: 4, fontSize: 11.5 }}>{[mission.client_name, sites?.[0]?.name].filter(Boolean).join(' · ') || 'Contexte à compléter'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
            <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 10.5, fontWeight: '700' }}>{visits.length} visite(s)</Text>
            <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 10.5, fontWeight: '700' }}>{openPoints.length} point(s) ouvert(s)</Text>
            <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 10.5, fontWeight: '700' }}>{documents.length} document(s)</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Pilotage du dossier</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            [domainSummary.open_actions || 0, 'actions ouvertes'],
            [domainSummary.observations || 0, 'constats'],
            [domainSummary.hypotheses || 0, 'hypothèses'],
            [domainSummary.tests || 0, 'essais'],
            [domainSummary.scenarios || 0, 'scénarios'],
            [domainSummary.expected_documents || 0, 'documents attendus'],
            [domainSummary.calculations || 0, 'calculs 🧮'],
          ].map(([value, label]) => (
            <View key={label} style={[{ minWidth: 104, flexGrow: 1, borderRadius: 13, padding: 10 }, missionStyles.statBox]}>
              <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 16 }}>{value}</Text>
              <Text style={{ color: COLORS.inkSoft, fontSize: 9.2, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Frise de la Mission</Text>
        <PhaseRail phases={phases} />

        <View style={[{ marginTop: 16, borderRadius: 14, padding: 13 }, missionStyles.infoBox]}>
          <Text style={[{ fontWeight: '900', fontSize: 12 }, missionStyles.accentText]}>Saisie non bloquante</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginTop: 4 }}>Pendant une visite, tu peux laisser n’importe quelle rubrique vide, quitter l’application et reprendre plus tard. La progression est informative uniquement.</Text>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Parcours recommandé · {playbook.label}</Text>
        <View style={[missionStyles.card, { padding: 13 }]}>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10.2, lineHeight: 15 }}>{playbook.objective}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 39, marginTop: 9 }}>
            {(playbook.steps || []).map((step, index) => <View key={step} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ minHeight: 29, borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 8.6, fontWeight: '900' }}>{index + 1} · {step}</Text>
              </View>
              {index < playbook.steps.length - 1 ? <Text style={{ color: MISSION_COLORS.accentLineStrong, marginHorizontal: 4 }}>›</Text> : null}
            </View>)}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
            {(playbook.quickActions || [])
              .filter((item) => ['navigate','point','measure','document'].includes(item.kind))
              .slice(0, 6)
              .map((item) => <TouchableOpacity
                key={item.key}
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => openPlaybookAction(item)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{item.label}</Text>
              </TouchableOpacity>)}
          </View>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Aujourd’hui</Text>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { flex: 1, alignItems: 'center' }]} onPress={createVisit}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Démarrer une visite</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flex: 1, alignItems: 'center' }]} onPress={() => setPointModal(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Point libre</Text></TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 20 }]}>Outils Mission</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['workflow', 'MissionWorkflow', 'Workflow', 'Phases · volets · occurrences'],
            ['structure', 'MissionStructure', 'Patrimoine', 'Site · bâtiment · niveau · local'],
            ['technicalStructure', 'MissionTechnicalStructure', 'Architecture technique', 'Installation · système · réseau · équipement'],
            ['equipment', 'MissionEquipment', 'Inventaire', 'Équipements · composants · OCR'],
            ['measurements', 'MissionMeasurements', 'Mesures', 'Références · séries · instruments'],
            ['plans', 'MissionPlan', 'Plans / PDF / SIG', 'Mesures · calques · GeoPackage'],
            ['map', 'MissionMap', 'Cartographie', 'Multi-sites · progression · SIG'],
            ['campaignDashboard', 'MissionCampaignDashboard', 'Cockpit multi-sites', 'À faire · en cours · terminés · accès'],
            ['actions', 'MissionActions', 'Actions', 'Responsables · échéances · coûts'],
            ['controlBoard', 'MissionControlBoard', 'Contrôles ciblés', 'Référence → preuve → action → recontrôle'],
            ['subjects', 'MissionSubjects', 'Sujets & décisions', 'Constat → décision → action → historique'],
            ['p3Dashboard', 'MissionP3Dashboard', 'Projection P2 / P3', 'Âge · coût · échéance · renouvellement'],
            ['amoDashboard', 'MissionAmoDashboard', 'Pilotage AMO', 'Volets · année · actions · P3 · livrables'],
            ['receptionBoard', 'MissionReceptionBoard', 'Réception / mise en service', 'Ouvrages · essais · réserves · documents'],
            ['expertiseBoard', 'MissionExpertise', 'Expertise / sinistre', 'Faits → hypothèses → investigations → conclusion'],
            ['reserveClearance', 'MissionReserveClearance', 'Levée de réserves', 'Avant / après · levée · maintien · partielle'],
            ['tests', 'MissionTests', 'Essais', 'Protocoles · commissioning'],
            ['calculations', 'MissionCalculation', 'Calculs 🧮', 'Formules · hypothèses · résultats'],
            ['scenarios', 'MissionScenarios', 'Scénarios', 'Étude · investissement · gains'],
            ['documents', 'MissionDocuments', 'Documents / VISA', 'Attendus · validation'],
            ['inbox', 'MissionDocumentInbox', 'Inbox documents', 'Extraction locale · revue'],
            ['excelMapping', 'MissionExcelMapping', 'Mapping Excel', 'Colonnes externes → METRA'],
            ['photoAnnotations', 'MissionPhotoAnnotations', 'Photos annotées', 'Flèches · zones · texte'],
            ['synoptic', 'MissionTechnicalGraph', 'Synoptique', 'Relations techniques visuelles'],
            ['signature', 'MissionSignature', 'Signature', 'Passation · OPR · réception'],
            ['package', 'MissionPackage', 'Dossier complet', 'ZIP configurable'],
          ].filter(([capability]) => capabilities?.[capability] !== false).map(([capability, routeName, title, subtitle]) => (
            <TouchableOpacity
              key={routeName}
              activeOpacity={0.82}
              onPress={() => navigation.navigate(routeName, { missionId })}
              style={[missionStyles.card, { width: '48%', minHeight: 76, padding: 11, justifyContent: 'center' }]}
            >
              <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 10.8, fontWeight: '900' }}>{title}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, lineHeight: 12, marginTop: 3 }}>{subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, missionStyles.primaryButton, { marginTop: 9, alignItems: 'center' }]}
          onPress={() => navigation.navigate('MissionReport', { missionId })}
        >
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Rapport · éditer / Word / PDF</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 9, marginTop: 9 }}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flex: 1, alignItems: 'center' }]} disabled={importing} onPress={importExcel}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{importing ? 'Import…' : '⇧ Importer Excel'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flex: 1, alignItems: 'center' }]} disabled={exporting} onPress={exportExcel}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{exporting ? 'Export…' : '⇩ Excel complet'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.btnSecondary, missionStyles.secondaryButton, { marginTop: 8, alignItems: 'center' }]}
          disabled={exportingClient}
          onPress={exportClientExcel}
        >
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
            {exportingClient ? 'Création Excel client…' : '⇩ Excel client simplifié'}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.inkFaint, fontSize: 9, lineHeight: 13, marginTop: 6, textAlign: 'center' }}>
          Excel complet = réimportable dans METRA. Excel client = lecture directe : synthèse, actions, réserves, inventaire, mesures et documents.
        </Text>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 20 }]}>Points à suivre</Text>
        {points.length ? points.map((point) => (
          <View key={point.id} style={[{ backgroundColor: COLORS.white, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 9 }, missionStyles.card]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 12.5 }}>{point.label || point.description || 'Point sans titre'}</Text>
                <Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 4 }}>{POINT_STATUS[point.status] || point.status} · {point.type || 'information'}{point.due_text ? ` · ${point.due_text}` : ''}</Text>
              </View>
              {!['closed', 'no_follow_up'].includes(point.status) ? <TouchableOpacity onPress={() => closePoint(point)} style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: MISSION_COLORS.accentLight }}><Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, fontWeight: '900' }}>Clôturer</Text></TouchableOpacity> : null}
            </View>
          </View>
        )) : <Text style={{ color: COLORS.inkFaint, fontSize: 10.5 }}>Aucun point. Tu peux en ajouter à tout moment, même s’il n’était pas prévu dans la trame.</Text>}

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 20 }]}>Visites</Text>
        {visits.length ? visits.map((visit) => <TouchableOpacity key={visit.id} onPress={() => navigation.navigate('MissionVisit', { missionId, visitId: visit.id })} style={[{ backgroundColor: COLORS.white, borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 8 }, missionStyles.card]}><Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{visit.visit_date || 'Date à préciser'} · {visit.visit_type || 'Visite'}</Text><Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, marginTop: 3 }}>{visit.status === 'draft' ? 'Brouillon — reprise possible' : visit.status}</Text></TouchableOpacity>) : <Text style={{ color: COLORS.inkFaint, fontSize: 10.5 }}>Aucune visite créée.</Text>}
      </ScrollView>

      <Modal visible={pointModal} transparent animationType="fade" onRequestClose={() => setPointModal(false)}>
        <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
          <Text style={[styles.modalTitle, missionStyles.title]}>Nouveau point libre</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, marginBottom: 10 }}>Un point ajouté librement a la même valeur qu’un point proposé par une recette.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 }}>
            {POINT_TYPES.map(([key, labelText]) => <Pill key={key} active={pointType === key} label={labelText} onPress={() => setPointType(key)} />)}
          </View>
          <TextInput style={[styles.input, missionStyles.input, { marginTop: 6 }]} value={pointLabel} onChangeText={setPointLabel} placeholder="Titre / constat (peut rester vide)" />
          <TextInput style={[styles.input, missionStyles.input, { marginTop: 9, minHeight: 72, textAlignVertical: 'top' }]} multiline value={pointDescription} onChangeText={setPointDescription} placeholder="Description libre" />
          <TextInput style={[styles.input, missionStyles.input, { marginTop: 9 }]} value={pointDueText} onChangeText={setPointDueText} placeholder="Échéance libre : fin octobre, prochaine visite…" />
          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setPointModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createPoint}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{saving ? 'Ajout…' : 'Ajouter'}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

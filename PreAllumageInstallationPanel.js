/**
 * Pré-allumage — espace terrain organisé par installation physique.
 *
 * Le fichier Excel reste structuré par familles de données. L'application, elle,
 * regroupe les rubriques par local_id afin qu'une chaufferie / SST puisse être
 * contrôlée entièrement avant de passer à la suivante.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SectionList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { PresetControleGenerique } from './PresetControleGenerique.js';
import {
  PREALLUMAGE_TYPES_LOCAUX,
  ajouterLocalPreAllumage,
  chargerPreAllumageModulaire,
  renommerLocalPreAllumage,
  supprimerLocalPreAllumage,
} from './preAllumageModularDb.js';
import { COLORS, styles } from './styles.js';

const VIRTUAL_CHAUFFERIE = '__pa_chaufferie__';
const VIRTUAL_SITE = '__pa_site__';
const VIRTUAL_PREFIX = '__pa_orphelin__:';
const PANEL_ORDER = {
  'p-pa-batiments': 10,
  'p-pa-compteurs': 20,
  'p-pa-regulation': 30,
  'p-pa-chaufferie': 40,
  'p-pa-sst': 40,
};

function mapChamps(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur]));
}
function mapControles(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r]));
}
function baseNomRubrique(nom) {
  return String(nom || '').split(' — ')[0].trim();
}
function typeLabel(local) {
  if (local?.type_code === 'chaufferie') return 'Chaufferie';
  if (local?.type_code === 'sous_station') return 'Sous-station';
  if (local?.type_code === 'site') return 'Site';
  return 'Installation';
}
function titreRubrique(rubrique, local) {
  if (rubrique.panel_id === 'p-pa-batiments') return 'Informations';
  if (rubrique.panel_id === 'p-pa-compteurs') return /g[ée]n[ée]raux/i.test(rubrique.nom) ? 'Compteurs généraux' : 'Compteurs';
  if (rubrique.panel_id === 'p-pa-regulation') return 'Régulation & températures';
  if (rubrique.panel_id === 'p-pa-chaufferie') return String(rubrique.nom || '').replace(/^Chaufferie\s*[—-]?\s*/i, '') || 'Essais chaufferie';
  if (rubrique.panel_id === 'p-pa-sst') {
    if (/ECS|traitement d.?eau/i.test(rubrique.nom)) return 'ECS / traitement d’eau';
    if (/chauffage/i.test(rubrique.nom)) return 'Contrôles chauffage';
  }
  const nom = String(rubrique.nom || 'Contrôles');
  if (local?.nom && nom.startsWith(`${local.nom} —`)) return nom.slice(local.nom.length + 2).trim();
  return nom;
}

function statsRubriques(rubriques, champsMap, controlesMap) {
  let total = 0;
  let faits = 0;
  let ns = 0;
  (rubriques || []).forEach((r) => (r.champs || []).forEach((c) => {
    total += 1;
    const key = `${r.section_code}||${c.field.cle}`;
    if (c.field.type === 'controle') {
      const avis = controlesMap[key]?.avis;
      if (avis) faits += 1;
      if (avis === 'N.S') ns += 1;
    } else if (String(champsMap[key] ?? '').trim() !== '') {
      faits += 1;
    }
  }));
  return { total, faits, ns, pct: total ? Math.round((faits / total) * 100) : 0 };
}

function PetitBouton({ label, onPress, primary = false, danger = false, disabled = false }) {
  const backgroundColor = danger ? COLORS.redBg : primary ? COLORS.orange : COLORS.white;
  const borderColor = danger ? COLORS.red : primary ? COLORS.orange : COLORS.line;
  const color = danger ? COLORS.red : primary ? COLORS.white : COLORS.inkSoft;
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor, backgroundColor, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{label}</Text>
  </TouchableOpacity>;
}

function AjouterInstallationModal({ visible, onClose, onSubmit }) {
  const [nom, setNom] = useState('');
  const [typeCode, setTypeCode] = useState('sous_station');
  const [chauffage, setChauffage] = useState(true);
  const [ecs, setEcs] = useState(true);
  useEffect(() => {
    if (!visible) return;
    setNom(''); setTypeCode('sous_station'); setChauffage(true); setEcs(true);
  }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}><View style={styles.modalSheet}>
      <Text style={styles.modalTitle}>Ajouter une installation</Text>
      <Text style={[styles.importHint, { marginBottom: 12 }]}>Ajoute la chaufferie, une sous-station ou un autre local dans l’ordre réel de la visite.</Text>
      <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Ex. SST 11 — Entrée 82" autoFocus />
      <Text style={{ fontWeight: '800', color: COLORS.ink, marginTop: 14, marginBottom: 7 }}>Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {PREALLUMAGE_TYPES_LOCAUX.map((t) => {
          const selected = typeCode === t.code;
          return <TouchableOpacity key={t.code} onPress={() => setTypeCode(t.code)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: selected ? COLORS.orange : COLORS.line, backgroundColor: selected ? COLORS.orange : COLORS.white }}>
            <Text style={{ color: selected ? COLORS.white : COLORS.inkSoft, fontWeight: '800', fontSize: 12 }}>{t.label}</Text>
          </TouchableOpacity>;
        })}
      </View>
      {typeCode !== 'chaufferie' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <TouchableOpacity onPress={() => setChauffage((v) => !v)} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: chauffage ? COLORS.orange : COLORS.line, backgroundColor: chauffage ? COLORS.orangeLight : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '800', color: chauffage ? COLORS.orangeDark : COLORS.inkSoft }}>{chauffage ? '✓ ' : ''}Chauffage</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setEcs((v) => !v)} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: ecs ? COLORS.orange : COLORS.line, backgroundColor: ecs ? COLORS.orangeLight : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '800', color: ecs ? COLORS.orangeDark : COLORS.inkSoft }}>{ecs ? '✓ ' : ''}ECS</Text></TouchableOpacity>
      </View> : null}
      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => onSubmit({ nom, typeCode, chauffage, ecs })}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity>
      </View>
    </View></View>
  </Modal>;
}

export function PreAllumageInstallationPanel({ visiteId, onSaved }) {
  const [modele, setModele] = useState(null);
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});
  const [activeLocalId, setActiveLocalId] = useState(null);
  const [ajoutVisible, setAjoutVisible] = useState(false);
  const [editionNom, setEditionNom] = useState(false);
  const [nomLocal, setNomLocal] = useState('');
  const [replies, setReplies] = useState({});

  const recharger = useCallback(async (selection = null) => {
    const [m, champs, controles] = await Promise.all([
      chargerPreAllumageModulaire(visiteId),
      getChampsVisite(visiteId),
      getControlesVisite(visiteId),
    ]);
    setModele(m);
    setChampsMap(mapChamps(champs));
    setControlesMap(mapControles(controles));
    if (selection) setActiveLocalId(selection);
  }, [visiteId]);

  useEffect(() => { recharger().catch((e) => Alert.alert('Pré-allumage', e.message)); }, [recharger]);

  const rubriquesOrphelines = useMemo(() => (modele?.rubriques || []).filter((r) => !r.local_id), [modele]);
  const chaufferiePhysique = useMemo(() => (modele?.locaux || []).find((l) => l.type_code === 'chaufferie') || null, [modele]);
  const rubriquesChaufferieOrphelines = useMemo(() => rubriquesOrphelines.filter((r) => r.panel_id === 'p-pa-chaufferie'), [rubriquesOrphelines]);
  const rubriquesSite = useMemo(() => rubriquesOrphelines.filter((r) => r.panel_id === 'p-pa-compteurs' && /g[ée]n[ée]raux/i.test(r.nom)), [rubriquesOrphelines]);
  const rubriquesOrphelinesPhysiques = useMemo(() => rubriquesOrphelines.filter((r) => ['p-pa-compteurs', 'p-pa-regulation', 'p-pa-sst'].includes(r.panel_id) && !/g[ée]n[ée]raux/i.test(r.nom)), [rubriquesOrphelines]);

  const locaux = useMemo(() => {
    const physiques = [...(modele?.locaux || [])].sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0));
    const result = [];
    if (rubriquesSite.length) result.push({ id: VIRTUAL_SITE, nom: 'Site / général', type_code: 'site', virtual: true, ordre: -200 });
    if (rubriquesChaufferieOrphelines.length && !chaufferiePhysique) result.push({ id: VIRTUAL_CHAUFFERIE, nom: 'Chaufferie', type_code: 'chaufferie', virtual: true, ordre: -100 });
    result.push(...physiques);
    const existants = new Set(physiques.map((l) => String(l.nom || '').trim().toLowerCase()));
    const nomsOrphelins = [...new Set(rubriquesOrphelinesPhysiques.map((r) => baseNomRubrique(r.nom)).filter(Boolean))];
    nomsOrphelins.forEach((nom) => {
      if (!existants.has(nom.toLowerCase())) result.push({ id: `${VIRTUAL_PREFIX}${nom}`, nom, type_code: 'autre', virtual: true, ordre: 10000 });
    });
    return result;
  }, [modele, rubriquesSite, rubriquesChaufferieOrphelines, chaufferiePhysique, rubriquesOrphelinesPhysiques]);

  useEffect(() => {
    if (!locaux.length) { setActiveLocalId(null); return; }
    if (!locaux.some((l) => l.id === activeLocalId)) setActiveLocalId(locaux[0].id);
  }, [locaux, activeLocalId]);

  const localActif = useMemo(() => locaux.find((l) => l.id === activeLocalId) || locaux[0] || null, [locaux, activeLocalId]);
  useEffect(() => { setNomLocal(localActif?.nom || ''); setEditionNom(false); }, [localActif?.id, localActif?.nom]);

  const rubriquesPourLocal = useCallback((local) => {
    if (!local) return [];
    if (local.id === VIRTUAL_SITE) return rubriquesSite;
    if (local.id === VIRTUAL_CHAUFFERIE) return rubriquesChaufferieOrphelines;
    if (String(local.id).startsWith(VIRTUAL_PREFIX)) {
      const nom = String(local.id).slice(VIRTUAL_PREFIX.length);
      return rubriquesOrphelinesPhysiques.filter((r) => baseNomRubrique(r.nom) === nom);
    }
    const liees = (modele?.rubriques || []).filter((r) => r.local_id === local.id);
    if (local.type_code === 'chaufferie' && chaufferiePhysique?.id === local.id) return [...liees, ...rubriquesChaufferieOrphelines];
    return liees;
  }, [modele, rubriquesSite, rubriquesChaufferieOrphelines, rubriquesOrphelinesPhysiques, chaufferiePhysique]);

  const rubriquesActives = useMemo(() => rubriquesPourLocal(localActif).sort((a, b) => {
    const pa = PANEL_ORDER[a.panel_id] ?? 99;
    const pb = PANEL_ORDER[b.panel_id] ?? 99;
    return pa - pb || Number(a.ordre || 0) - Number(b.ordre || 0);
  }), [rubriquesPourLocal, localActif]);

  const sections = useMemo(() => rubriquesActives.map((r) => {
    const replie = replies[r.id] === true;
    const items = (r.champs || []).map((c) => ({
      field: { ...c.field, displayLabel: c.libelle, modularFieldId: c.id },
      key: `${r.section_code}||${c.field.cle}`,
    }));
    return { ...r, title: titreRubrique(r, localActif), sectionCode: r.section_code, allData: items, data: replie ? [] : items, replie };
  }), [rubriquesActives, localActif, replies]);

  const stats = useMemo(() => statsRubriques(rubriquesActives, champsMap, controlesMap), [rubriquesActives, champsMap, controlesMap]);
  const idx = Math.max(0, locaux.findIndex((l) => l.id === localActif?.id));
  const precedent = idx > 0 ? locaux[idx - 1] : null;
  const suivant = idx >= 0 && idx < locaux.length - 1 ? locaux[idx + 1] : null;

  const soumettreAjout = async ({ nom, typeCode, chauffage, ecs }) => {
    try {
      const id = await ajouterLocalPreAllumage(visiteId, { nom, typeCode, chauffage, ecs });
      setAjoutVisible(false);
      await recharger(id);
      onSaved?.();
    } catch (e) { Alert.alert('Impossible d’ajouter', e.message); }
  };

  const sauverNom = async () => {
    if (!localActif || localActif.virtual) { setEditionNom(false); return; }
    const propre = String(nomLocal || '').trim();
    if (!propre || propre === localActif.nom) { setNomLocal(localActif.nom); setEditionNom(false); return; }
    try {
      await renommerLocalPreAllumage(localActif.id, propre);
      setEditionNom(false);
      await recharger(localActif.id);
      onSaved?.();
    } catch (e) { Alert.alert('Renommage impossible', e.message); }
  };

  const supprimer = () => {
    if (!localActif || localActif.virtual) return;
    Alert.alert('Supprimer cette installation ?', `Les saisies liées à « ${localActif.nom} » seront supprimées de cette visite.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        const prochaineSelection = suivant?.id || precedent?.id || null;
        await supprimerLocalPreAllumage(localActif.id);
        await recharger(prochaineSelection);
        onSaved?.();
      } },
    ]);
  };

  if (!modele) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;

  const header = <View>
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 16 }}>Installations de la visite</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 2 }}>Informations, relevés et conformités sont regroupés au même endroit.</Text>
        </View>
        <PetitBouton label="+ Installation" primary onPress={() => setAjoutVisible(true)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 7, paddingTop: 11, paddingRight: 8 }}>
        {locaux.map((local) => {
          const selected = local.id === localActif?.id;
          const s = statsRubriques(rubriquesPourLocal(local), champsMap, controlesMap);
          const alert = s.ns > 0;
          return <TouchableOpacity key={local.id} onPress={() => setActiveLocalId(local.id)} style={{ minHeight: 43, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: selected ? COLORS.orange : alert ? COLORS.red : COLORS.line, backgroundColor: selected ? COLORS.orangeLight : COLORS.white }}>
            <Text style={{ color: selected ? COLORS.orangeDark : COLORS.ink, fontWeight: '850', fontSize: 12 }}>{alert ? '⚠ ' : s.pct === 100 && s.total ? '✓ ' : ''}{local.nom}</Text>
            <Text style={{ color: alert ? COLORS.red : COLORS.inkSoft, fontSize: 10, marginTop: 1 }}>{s.pct}%{alert ? ` · ${s.ns} N.S` : ''}</Text>
          </TouchableOpacity>;
        })}
      </ScrollView>
    </View>

    {localActif ? <View style={{ backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: stats.ns ? '#F4C7C7' : COLORS.line, borderRadius: 14, padding: 13, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ flex: 1 }}>
          {editionNom ? <TextInput value={nomLocal} onChangeText={setNomLocal} onBlur={sauverNom} onSubmitEditing={sauverNom} autoFocus style={{ fontSize: 18, fontWeight: '900', color: COLORS.ink, borderBottomWidth: 1, borderBottomColor: COLORS.orange, paddingVertical: 3 }} /> : <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.ink }}>{localActif.nom}</Text>}
          <Text style={{ color: COLORS.inkSoft, marginTop: 3, fontSize: 12 }}>{typeLabel(localActif)} · {stats.faits}/{stats.total} renseignés · {stats.pct}%{stats.ns ? ` · ${stats.ns} anomalie${stats.ns > 1 ? 's' : ''}` : ''}</Text>
        </View>
        {!localActif.virtual ? <>
          <PetitBouton label={editionNom ? 'Valider' : 'Renommer'} onPress={() => editionNom ? sauverNom() : setEditionNom(true)} />
          <PetitBouton label="Supprimer" danger onPress={supprimer} />
        </> : null}
      </View>
      <View style={{ height: 5, backgroundColor: COLORS.line, borderRadius: 3, marginTop: 11, overflow: 'hidden' }}><View style={{ height: 5, width: `${stats.pct}%`, backgroundColor: stats.ns ? COLORS.red : COLORS.orange, borderRadius: 3 }} /></View>
    </View> : null}
  </View>;

  const footer = <View style={{ flexDirection: 'row', gap: 9, paddingTop: 8, paddingBottom: 24 }}>
    <View style={{ flex: 1 }}>{precedent ? <PetitBouton label={`‹ ${precedent.nom}`} onPress={() => setActiveLocalId(precedent.id)} /> : null}</View>
    <View style={{ flex: 1, alignItems: 'flex-end' }}>{suivant ? <PetitBouton primary label={`${suivant.nom} ›`} onPress={() => setActiveLocalId(suivant.id)} /> : <PetitBouton primary label="+ Installation" onPress={() => setAjoutVisible(true)} />}</View>
  </View>;

  return <>
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => {
        const s = statsRubriques([section], champsMap, controlesMap);
        return <TouchableOpacity onPress={() => setReplies((m) => ({ ...m, [section.id]: !section.replie }))} style={{ marginTop: 5, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: section.replie ? 12 : 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: '900' }}>{section.title}</Text>
            <Text style={{ color: s.ns ? COLORS.red : COLORS.inkSoft, fontWeight: '800', fontSize: 11 }}>{s.faits}/{s.total}{s.ns ? ` · ⚠ ${s.ns}` : ''}</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 14 }}>{section.replie ? '⌄' : '⌃'}</Text>
          </View>
        </TouchableOpacity>;
      }}
      renderItem={({ item, section, index }) => <View style={{ backgroundColor: COLORS.white, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: index === section.data.length - 1 ? 1 : 0, borderColor: COLORS.line, paddingHorizontal: 13, paddingVertical: 9, marginTop: -1, borderBottomLeftRadius: index === section.data.length - 1 ? 12 : 0, borderBottomRightRadius: index === section.data.length - 1 ? 12 : 0 }}>
        {item.field.type === 'champ' ? <DurableChampGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} valeurInitiale={champsMap[item.key]} displayLabel={item.field.displayLabel} onSaved={(valeur) => { setChampsMap((m) => ({ ...m, [item.key]: valeur })); onSaved?.(); }} /> : item.field.presets ? <PresetControleGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} displayLabel={item.field.displayLabel} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => setControlesMap((m) => ({ ...m, [item.key]: { ...(m[item.key] || {}), ...patch } }))} onSaved={onSaved} /> : <PersistentControleGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onSaved={onSaved} />}
      </View>}
      ListEmptyComponent={<View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 18 }}><Text style={{ color: COLORS.inkSoft, textAlign: 'center' }}>Aucune donnée rattachée à cette installation.</Text></View>}
      ListFooterComponent={footer}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={6}
    />
    <AjouterInstallationModal visible={ajoutVisible} onClose={() => setAjoutVisible(false)} onSubmit={soumettreAjout} />
  </>;
}

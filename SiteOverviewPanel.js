/** Suivi patrimoine d'un site, indépendant des trames de visite figées. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BrandMark } from './BrandLogo.js';
import { COLORS, styles } from './styles.js';
import {
  declarerEtatEquipement,
  getStatsSitePatrimoine,
  listerEquipementsSitePatrimoine,
  listerReservesSite,
  listerVisitesDatesSite,
  leverReserve,
  reouvrirReserve,
  remplacerEquipement,
  statsReservesPeriode,
} from './patrimoineDb.js';

function Segment({ items, value, onChange }) {
  return <View style={{ flexDirection: 'row', gap: 7, marginBottom: 12 }}>{items.map((item) => {
    const actif = value === item.id;
    return <TouchableOpacity key={item.id} onPress={() => onChange(item.id)} style={{ flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: actif ? COLORS.orange : COLORS.line, backgroundColor: actif ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: actif ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: actif ? '800' : '600', fontSize: 12 }}>{item.label}</Text></TouchableOpacity>;
  })}</View>;
}

function EtatBadge({ etat }) {
  const valeur = etat || 'Non renseigné';
  const critique = ['Hors service', 'Dégradé', 'Vétuste'].includes(valeur);
  const surveillance = valeur === 'À surveiller';
  const fond = critique ? (COLORS.redBg || '#FDECEC') : surveillance ? (COLORS.amberBg || '#FEF3E2') : (COLORS.greenBg || '#E8F5E9');
  const texte = critique ? (COLORS.red || '#B91C1C') : surveillance ? (COLORS.amber || '#B45309') : (COLORS.green || '#2E7D32');
  return <View style={{ backgroundColor: fond, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: texte, fontSize: 11, fontWeight: '800' }}>{valeur}</Text></View>;
}

function StatBox({ value, label }) {
  return <View style={{ flex: 1, minWidth: 86, padding: 10, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line }}><Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.ink }}>{value}</Text><Text style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 2 }}>{label}</Text></View>;
}

export function SiteOverviewPanel({ siteId, mode }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sousMenu, setSousMenu] = useState('actuels');
  const [visites, setVisites] = useState([]);
  const [periode, setPeriode] = useState('origine');
  const [visiteDebut, setVisiteDebut] = useState(null);
  const [visiteFin, setVisiteFin] = useState(null);
  const [statsPeriode, setStatsPeriode] = useState(null);
  const [statsSite, setStatsSite] = useState(null);
  const [remplacement, setRemplacement] = useState(null);
  const [nouveauMarque, setNouveauMarque] = useState('');
  const [nouveauModele, setNouveauModele] = useState('');
  const [nouveauAnnee, setNouveauAnnee] = useState('');

  useEffect(() => { setSousMenu('actuels'); setPeriode('origine'); }, [mode]);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'equipements') {
        setRows(await listerEquipementsSitePatrimoine(siteId, sousMenu === 'historique' ? 'historique' : 'actuels'));
      } else {
        const vs = await listerVisitesDatesSite(siteId);
        setVisites(vs);
        if (!visiteFin && vs[0]) setVisiteFin(vs[0]);
        if (!visiteDebut && vs[1]) setVisiteDebut(vs[1]);
        setRows(await listerReservesSite(siteId, { statut: sousMenu === 'historique' ? 'levees' : 'ouvertes' }));
      }
      setStatsSite(await getStatsSitePatrimoine(siteId));
    } finally { setLoading(false); }
  }, [siteId, mode, sousMenu, visiteDebut, visiteFin]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (mode !== 'remarques') return;
    const depuis = periode === 'entre' ? visiteDebut?.date_visite : null;
    const jusqua = periode === 'entre' ? visiteFin?.date_visite : null;
    statsReservesPeriode(siteId, depuis, jusqua).then(setStatsPeriode).catch(() => setStatsPeriode(null));
  }, [mode, periode, siteId, visiteDebut, visiteFin, rows.length]);

  const datesValides = useMemo(() => {
    if (!visiteDebut?.date_visite || !visiteFin?.date_visite) return null;
    return visiteDebut.date_visite <= visiteFin.date_visite
      ? { debut: visiteDebut, fin: visiteFin }
      : { debut: visiteFin, fin: visiteDebut };
  }, [visiteDebut, visiteFin]);

  const changerVisite = (type, sens) => {
    if (!visites.length) return;
    const actuelle = type === 'debut' ? visiteDebut : visiteFin;
    const index = Math.max(0, visites.findIndex((v) => v.id === actuelle?.id));
    const next = visites[(index + sens + visites.length) % visites.length];
    type === 'debut' ? setVisiteDebut(next) : setVisiteFin(next);
  };

  const confirmerLevee = (item) => Alert.alert('Lever cette réserve ?', 'La visite d’origine restera inchangée. La levée sera ajoutée uniquement à l’historique du site.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Lever', onPress: async () => { await leverReserve(item.id); await charger(); } },
  ]);

  const confirmerReouverture = (item) => Alert.alert('Réouvrir cette réserve ?', 'Un nouvel événement sera ajouté à son historique.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Réouvrir', onPress: async () => { await reouvrirReserve(item.id); await charger(); } },
  ]);

  const marquerVetuste = (item) => Alert.alert('Déclarer cet équipement vétuste ?', 'Cette action alimente l’historique patrimoine sans modifier une ancienne visite.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Déclarer vétuste', onPress: async () => { await declarerEtatEquipement(item.id, 'Vétuste'); await charger(); } },
  ]);

  const ouvrirRemplacement = (item) => {
    setRemplacement(item);
    setNouveauMarque(''); setNouveauModele(''); setNouveauAnnee('');
  };

  const validerRemplacement = async () => {
    if (!remplacement) return;
    try {
      await remplacerEquipement(remplacement.id, {
        type_code: remplacement.type_code,
        designation: remplacement.designation,
        marque: nouveauMarque.trim() || null,
        modele: nouveauModele.trim() || null,
        annee: nouveauAnnee.trim() || null,
      });
      setRemplacement(null);
      await charger();
    } catch (e) { Alert.alert('Remplacement impossible', String(e?.message || e)); }
  };

  if (loading) return <View style={{ paddingVertical: 36 }}><ActivityIndicator color={COLORS.orange} /></View>;

  if (mode === 'equipements') {
    return <View>
      <Segment items={[{ id: 'actuels', label: 'Actuels' }, { id: 'historique', label: 'Historique' }]} value={sousMenu} onChange={setSousMenu} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}><StatBox value={statsSite?.equipements?.actifs || 0} label="actifs"/><StatBox value={statsSite?.equipements?.aSurveiller || 0} label="vétustes / à surveiller"/><StatBox value={statsSite?.equipements?.remplaces || 0} label="remplacés"/></View>
      <FlatList data={rows} keyExtractor={(item) => item.id} scrollEnabled={false}
        ListHeaderComponent={<Text style={[styles.sectionLabel, { marginBottom: 10 }]}>{sousMenu === 'historique' ? 'Historique des équipements' : 'Équipements actuels'} · {rows.length}</Text>}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{sousMenu === 'historique' ? 'Aucun équipement dans l’historique.' : 'Aucun équipement actif connu pour ce site.'}</Text></View>}
        renderItem={({ item }) => <View style={[styles.card, { alignItems: 'flex-start', flexWrap: 'wrap' }]}>
          <BrandMark marque={item.marque} compact />
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.designation || item.type_code || 'Équipement'}</Text><Text style={styles.cardSub}>{[item.type_code, item.marque, item.modele, item.annee].filter(Boolean).join(' · ') || 'Informations à compléter'}</Text><Text style={[styles.cardSub, { marginTop: 4 }]}>{item.nb_evenements || 0} événement(s) dans son historique{item.derniere_activite ? ` · dernière activité ${String(item.derniere_activite).slice(0, 10)}` : ''}</Text></View>
          <EtatBadge etat={item.dernier_etat} />
          {sousMenu === 'actuels' ? <View style={{ width: '100%', flexDirection: 'row', gap: 8, marginTop: 10 }}><TouchableOpacity style={[styles.btnSecondary, { flex: 1, paddingVertical: 8 }]} onPress={() => marquerVetuste(item)}><Text style={styles.btnSecondaryText}>Déclarer vétuste</Text></TouchableOpacity><TouchableOpacity style={[styles.btnPrimary, { flex: 1, paddingVertical: 8 }]} onPress={() => ouvrirRemplacement(item)}><Text style={styles.btnPrimaryText}>Remplacé</Text></TouchableOpacity></View> : null}
        </View>}
      />
      <Modal visible={!!remplacement} transparent animationType="fade" onRequestClose={() => setRemplacement(null)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.modalTitle}>Équipement de remplacement</Text><Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 12 }}>L’ancien équipement restera dans l’historique. Le nouveau deviendra l’équipement actif du site.</Text><TextInput style={styles.input} placeholder="Nouvelle marque" value={nouveauMarque} onChangeText={setNouveauMarque}/><TextInput style={[styles.input, { marginTop: 9 }]} placeholder="Nouveau modèle" value={nouveauModele} onChangeText={setNouveauModele}/><TextInput style={[styles.input, { marginTop: 9 }]} placeholder="Année" keyboardType="number-pad" value={nouveauAnnee} onChangeText={setNouveauAnnee}/><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setRemplacement(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={validerRemplacement}><Text style={styles.btnPrimaryText}>Valider le remplacement</Text></TouchableOpacity></View></ScrollView></View></View></Modal>
    </View>;
  }

  return <View>
    <Segment items={[{ id: 'actuels', label: 'En cours' }, { id: 'historique', label: 'Historique' }]} value={sousMenu} onChange={setSousMenu} />
    <Segment items={[{ id: 'origine', label: 'Depuis le début' }, { id: 'entre', label: 'Entre 2 visites' }]} value={periode} onChange={setPeriode} />
    {periode === 'entre' && visites.length ? <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 10, marginBottom: 12 }}><Text style={{ fontWeight: '800', marginBottom: 8 }}>Comparer deux visites</Text><View style={{ gap: 7 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ width: 58, color: COLORS.muted, fontSize: 11 }}>Début</Text><TouchableOpacity onPress={() => changerVisite('debut', -1)} style={{ padding: 8 }}><Text>‹</Text></TouchableOpacity><Text style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}>{visiteDebut?.date_visite || '—'}</Text><TouchableOpacity onPress={() => changerVisite('debut', 1)} style={{ padding: 8 }}><Text>›</Text></TouchableOpacity></View><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ width: 58, color: COLORS.muted, fontSize: 11 }}>Fin</Text><TouchableOpacity onPress={() => changerVisite('fin', -1)} style={{ padding: 8 }}><Text>‹</Text></TouchableOpacity><Text style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}>{visiteFin?.date_visite || '—'}</Text><TouchableOpacity onPress={() => changerVisite('fin', 1)} style={{ padding: 8 }}><Text>›</Text></TouchableOpacity></View></View>{datesValides ? <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 7, textAlign: 'center' }}>Période : {datesValides.debut.date_visite} → {datesValides.fin.date_visite}</Text> : null}</View> : null}
    {statsPeriode ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}><StatBox value={statsPeriode.creees} label="créées sur la période"/><StatBox value={statsPeriode.levees} label="levées sur la période"/><StatBox value={statsPeriode.ouvertesFin} label="ouvertes à la fin"/><StatBox value={statsPeriode.totalDepuisOrigine} label="depuis le début"/></View> : null}
    <FlatList data={rows} keyExtractor={(item) => item.id} scrollEnabled={false}
      ListHeaderComponent={<Text style={[styles.sectionLabel, { marginBottom: 10 }]}>{sousMenu === 'historique' ? 'Réserves levées' : 'Réserves à traiter'} · {rows.length}</Text>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{sousMenu === 'historique' ? 'Aucune réserve levée pour ce site.' : 'Aucune réserve ouverte pour ce site.'}</Text></View>}
      renderItem={({ item }) => <View style={[styles.card, { alignItems: 'flex-start', flexWrap: 'wrap' }]}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.poste || 'Observation'}</Text><Text style={[styles.cardSub, { marginTop: 4, color: COLORS.ink }]}>{item.prestation || 'Sans description'}</Text><Text style={[styles.cardSub, { marginTop: 5 }]}>Créée le {String(item.cree_le || '').slice(0, 10)}{item.date_visite_origine ? ` · visite du ${item.date_visite_origine}` : ''} · {item.nb_evenements || 0} événement(s)</Text>{item.levee_le ? <Text style={[styles.cardSub, { marginTop: 3 }]}>Levée le {String(item.levee_le).slice(0, 10)}</Text> : null}</View>{sousMenu === 'historique' ? <TouchableOpacity style={[styles.btnSecondary, { marginLeft: 8, paddingVertical: 8 }]} onPress={() => confirmerReouverture(item)}><Text style={styles.btnSecondaryText}>Réouvrir</Text></TouchableOpacity> : <TouchableOpacity style={[styles.btnPrimary, { marginLeft: 8, paddingVertical: 8 }]} onPress={() => confirmerLevee(item)}><Text style={styles.btnPrimaryText}>Lever</Text></TouchableOpacity>}</View>}
    />
  </View>;
}

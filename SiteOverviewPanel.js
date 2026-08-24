/** Synthèse persistante d'un site : derniers équipements et dernières remarques. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { getDb } from './db.js';
import { BrandMark } from './BrandLogo.js';
import { COLORS, styles } from './styles.js';

async function listerEquipementsSite(siteId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT e.id,e.type_code AS categorie,e.designation,e.marque,e.modele,e.annee,e.statut,
      (SELECT o.etat FROM observations_equipement o
       JOIN visites v ON v.id=o.visite_id
       WHERE o.equipement_id=e.id AND v.site_id=?
       ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC LIMIT 1) AS dernier_etat,
      (SELECT v.date_visite FROM observations_equipement o
       JOIN visites v ON v.id=o.visite_id
       WHERE o.equipement_id=e.id AND v.site_id=?
       ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC LIMIT 1) AS derniere_visite,
      (SELECT COUNT(*) FROM observations_equipement o
       JOIN visites v ON v.id=o.visite_id
       WHERE o.equipement_id=e.id AND v.site_id=?) AS nb_observations
     FROM equipements e
     JOIN installations i ON i.id=e.installation_id
     WHERE i.site_id=? AND i.actif=1 AND e.statut<>'retire'
     ORDER BY e.type_code,e.designation,e.marque,e.modele`,
    [siteId, siteId, siteId, siteId]
  );
}

async function listerRemarquesSite(siteId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT r.id,r.poste,r.prestation,r.delai,r.estimatif,r.origine,
            r.reference_onglet,r.reference_libelle,v.date_visite,v.id AS visite_id
     FROM remarques r
     JOIN visites v ON v.id=r.visite_id
     WHERE v.site_id=?
     ORDER BY COALESCE(v.date_visite,'') DESC,r.cree_le DESC,r.id DESC`,
    [siteId]
  );
}

function EtatBadge({ etat }) {
  const valeur = etat || 'Non renseigné';
  const critique = valeur === 'Hors service' || valeur === 'Dégradé';
  const surveillance = valeur === 'À surveiller';
  const fond = critique ? (COLORS.redBg || '#FDECEC') : surveillance ? (COLORS.amberBg || '#FEF3E2') : (COLORS.greenBg || '#E8F5E9');
  const texte = critique ? (COLORS.red || '#B91C1C') : surveillance ? (COLORS.amber || '#B45309') : (COLORS.green || '#2E7D32');
  return <View style={{ backgroundColor: fond, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: texte, fontSize: 11, fontWeight: '800' }}>{valeur}</Text></View>;
}

export function SiteOverviewPanel({ siteId, mode }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      setRows(mode === 'equipements' ? await listerEquipementsSite(siteId) : await listerRemarquesSite(siteId));
    } finally {
      setLoading(false);
    }
  }, [siteId, mode]);

  useEffect(() => { charger(); }, [charger]);

  if (loading) return <View style={{ paddingVertical: 36 }}><ActivityIndicator color={COLORS.orange} /></View>;

  if (mode === 'equipements') {
    return (
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ListHeaderComponent={<Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Équipements connus du site · {rows.length}</Text>}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun équipement connu pour ce site.</Text><Text style={styles.emptySub}>Les équipements ajoutés pendant les visites apparaîtront ici automatiquement.</Text></View>}
        renderItem={({ item }) => (
          <View style={[styles.card, { alignItems: 'flex-start' }]}>
            <BrandMark marque={item.marque} compact />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.designation || item.categorie || 'Équipement'}</Text>
              <Text style={styles.cardSub}>{[item.categorie, item.marque, item.modele].filter(Boolean).join(' · ') || 'Informations à compléter'}</Text>
              <Text style={[styles.cardSub, { marginTop: 4 }]}>{item.derniere_visite ? `Dernier contrôle : ${item.derniere_visite}` : 'Jamais contrôlé'}{item.nb_observations ? ` · ${item.nb_observations} observation(s)` : ''}</Text>
            </View>
            <EtatBadge etat={item.dernier_etat} />
          </View>
        )}
      />
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      ListHeaderComponent={<Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Dernières remarques / réserves · {rows.length}</Text>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucune remarque pour ce site.</Text></View>}
      renderItem={({ item }) => (
        <View style={[styles.card, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.poste || 'Observation'}</Text>
            <Text style={[styles.cardSub, { marginTop: 4, color: COLORS.ink }]}>{item.prestation || 'Sans description'}</Text>
            <Text style={[styles.cardSub, { marginTop: 5 }]}>{item.date_visite || 'Sans date'}{item.reference_libelle ? ` · ${item.reference_libelle}` : ''}</Text>
          </View>
          {item.delai != null ? <View style={styles.badge}><Text style={styles.badgeText}>{item.delai} mois</Text></View> : null}
        </View>
      )}
    />
  );
}

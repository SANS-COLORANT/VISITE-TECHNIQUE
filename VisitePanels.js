/** Panneaux de l'écran Visite : générique, Régulation, Relevés, Équipements, Réserves, Photos. */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Image } from 'react-native';
import { COLORS, styles } from './styles.js';
import { TRAME_DATA, RESEAU_TEMPLATE } from './data.js';
import {
  getChampsVisite, getControlesVisite, getDb,
  listerReseaux, ajouterReseau, upsertReseauChamp, supprimerReseau,
  listerCompteurs, ajouterCompteur, upsertCompteurChamp, supprimerCompteur,
  listerMateriel, ajouterMateriel, upsertMaterielChamp, supprimerMateriel, listerBibliothequeEquipements,
  listerRemarques, ajouterRemarqueManuelle, listerBibliothequeReserves, ajouterRemarqueDepuisBiblio,
  listerPhotos, ajouterPhoto,
} from './db.js';
import { ChampGenerique, ControleGenerique, cleanLabel, extractUnit, getNumericConfig, StepperNumerique, ChipSelector, TypeAheadInput, useSaisieAvecAutoSave } from './GenericFields.js';
import { PhotoButton, prendrePhoto } from './PhotoButton.js';

// ============================================================================
// 5. PANNEAUX DE L'ÉCRAN VISITE
// ============================================================================

const PANEL_LABELS = {
  'p-infos': 'Informations', 'p-distrib': 'Distribution', 'p-regulation': 'Régulation',
  'p-releves': 'Relevés', 'p-conf-local': 'Conf. Local', 'p-conf-energie': 'Conf. Énergie',
  'p-conf-chauffage': 'Conf. Chauffage', 'p-conf-ecs': 'Conf. ECS', 'p-conf-adouc': 'Conf. Adoucisseur',
  'p-equip': 'Équipements', 'p-remarques': 'Réserves', 'p-photos': 'Photos',
};
const TAB_ORDER = [
  'p-infos', 'p-distrib', 'p-regulation', 'p-releves', 'SEP',
  'p-conf-local', 'p-conf-energie', 'p-conf-chauffage', 'p-conf-ecs', 'p-conf-adouc', 'SEP',
  'p-equip', 'p-remarques', 'p-photos',
];

/** Panneau générique : rend toutes les sections d'un onglet depuis TRAME_DATA. */
function PanelGenerique({ visiteId, panelId, refreshKey, onSaved }) {
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});
  const sections = TRAME_DATA[panelId];

  useEffect(useCallback(() => {
    getChampsVisite(visiteId).then(setChampsMap);
    getControlesVisite(visiteId).then(setControlesMap);
  }, [visiteId, refreshKey]));

  if (!sections) return null;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      {Object.entries(sections).map(([sub, fields]) => {
        const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const champs = fields.filter((f) => f.type === 'champ');
        const controles = fields.filter((f) => f.type === 'controle');
        return (
          <View key={sub}>
            <Text style={styles.sectionTitle}>{sub}</Text>
            <View style={styles.formCard}>
              {champs.map((f) => (
                <ChampGenerique
                  key={f.cle}
                  visiteId={visiteId}
                  sectionCode={sectionCode}
                  field={f}
                  valeurInitiale={champsMap[`${sectionCode}||${f.cle}`]}
                  onSaved={onSaved}
                />
              ))}
              {controles.map((f) => (
                <ControleGenerique
                  key={f.cle}
                  visiteId={visiteId}
                  sectionCode={sectionCode}
                  field={f}
                  etatInitial={controlesMap[`${sectionCode}||${f.cle}`]}
                  onSaved={onSaved}
                />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Onglet Régulation : cascade fixe + réseaux dynamiques + réseau ECS. */
function PanelRegulation({ visiteId, refreshKey, onSaved }) {
  const [champsMap, setChampsMap] = useState({});
  const [reseaux, setReseaux] = useState([]);

  const charger = useCallback(async () => {
    setChampsMap(await getChampsVisite(visiteId));
    setReseaux(await listerReseaux(visiteId));
  }, [visiteId]);

  useEffect(useCallback(() => { charger(); }, [charger, refreshKey]));

  const onAjouterReseau = async () => {
    await ajouterReseau(visiteId, `Réseau ${reseaux.length + 1}`);
    charger();
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <Text style={styles.sectionTitle}>Cascade chaudières</Text>
      <View style={styles.formCard}>
        {TRAME_DATA['p-regulation']['Cascade chaudières'].map((f) => (
          <ChampGenerique
            key={f.cle} visiteId={visiteId} sectionCode="regulation.cascade"
            field={f} valeurInitiale={champsMap[`regulation.cascade||${f.cle}`]} onSaved={onSaved}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Réseaux · {reseaux.length} ajouté{reseaux.length > 1 ? 's' : ''}</Text>
      {reseaux.map((r) => (
        <ReseauCard key={r.id} reseau={r} visiteId={visiteId} onChange={charger} />
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={onAjouterReseau}>
        <Text style={styles.addBtnText}>+ Ajouter un réseau — nom et photo modifiables</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Réseau ECS</Text>
      <View style={styles.formCard}>
        {TRAME_DATA['p-regulation']['Réseau ECS'].map((f) => (
          <ChampGenerique
            key={f.cle} visiteId={visiteId} sectionCode="regulation.reseau_ecs"
            field={f} valeurInitiale={champsMap[`regulation.reseau_ecs||${f.cle}`]} onSaved={onSaved}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function ReseauCard({ reseau, visiteId, onChange }) {
  const [nom, setNom] = useState(reseau.nom_reseau || '');
  const champsAffiches = RESEAU_TEMPLATE.filter((f) => f.cle !== 'Nom réseau');
  const [valeurs, setValeurs] = useState(() => {
    const v = {};
    champsAffiches.forEach((f) => {
      const key = { 'T°ext(°C)': 't_ext_c', 'T°dép(°C)': 't_dep_c', 'Courbe de chauffe': 'courbe_de_chauffe', 'TNC': 'tnc', 'Consigne et Programme horaire': 'consigne_programme_horaire' }[f.cle];
      v[f.cle] = reseau[key] || '';
    });
    return v;
  });

  const CLE_TO_COL = { 'T°ext(°C)': 't_ext_c', 'T°dép(°C)': 't_dep_c', 'Courbe de chauffe': 'courbe_de_chauffe', 'TNC': 'tnc', 'Consigne et Programme horaire': 'consigne_programme_horaire' };

  const sauverNom = async () => { await upsertReseauChamp(reseau.id, 'nom_reseau', nom); onChange(); };
  const sauverChamp = async (cle, val) => { await upsertReseauChamp(reseau.id, CLE_TO_COL[cle], val); };

  return (
    <View style={styles.formCard}>
      <View style={styles.reseauHeaderRow}>
        <TextInput style={styles.reseauNomInput} value={nom} onChangeText={setNom} onBlur={sauverNom} />
        <PhotoButton visiteId={visiteId} entiteKey={`reseau||${reseau.id}`} label={nom} />
        <TouchableOpacity onPress={async () => { await supprimerReseau(reseau.id); onChange(); }}>
          <Text style={styles.removeLink}>Supprimer</Text>
        </TouchableOpacity>
      </View>
      {champsAffiches.map((f) => {
        const numericConfig = getNumericConfig(f.cle);
        return (
          <View key={f.cle} style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{cleanLabel(f.cle)}{extractUnit(f.cle) && !numericConfig ? ` (${extractUnit(f.cle)})` : ''}</Text>
            {numericConfig ? (
              <StepperNumerique
                valeur={valeurs[f.cle]}
                config={numericConfig}
                onChange={(val) => { setValeurs((v) => ({ ...v, [f.cle]: val })); sauverChamp(f.cle, val); }}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={valeurs[f.cle]}
                onChangeText={(t) => setValeurs((v) => ({ ...v, [f.cle]: t }))}
                onBlur={() => sauverChamp(f.cle, valeurs[f.cle])}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Onglet Relevés : Températures/pH génériques + compteurs dynamiques avec unité. */
function PanelReleves({ visiteId, refreshKey, onSaved }) {
  const [champsMap, setChampsMap] = useState({});
  const [compteurs, setCompteurs] = useState([]);
  const UNITES = ['m³', 'L', 'MWh', 'kWh', 'bar', '%'];

  const charger = useCallback(async () => {
    setChampsMap(await getChampsVisite(visiteId));
    setCompteurs(await listerCompteurs(visiteId));
  }, [visiteId]);

  useEffect(useCallback(() => { charger(); }, [charger, refreshKey]));

  const onAjouterCompteur = async () => {
    await ajouterCompteur(visiteId, '');
    charger();
  };

  const sections = TRAME_DATA['p-releves'];
  const champsTemp = sections['Températures et pH'] || [];
  const champsCompteursIndex = (sections['Relevés des compteurs et manomètres'] || []).filter((f) => /^Index/i.test(f.cle));
  const champsPression = (sections['Relevés des compteurs et manomètres'] || []).filter((f) => !/^Index/i.test(f.cle));

  // seed initial (une seule fois) des compteurs officiels si aucun compteur encore créé
  useEffect(() => {
    (async () => {
      if (compteurs.length === 0 && champsCompteursIndex.length > 0) {
        const db = await getDb();
        const existing = await db.getFirstAsync(`SELECT COUNT(*) as n FROM compteurs WHERE visite_id = ?`, [visiteId]);
        if (existing.n === 0) {
          for (const f of champsCompteursIndex) {
            await ajouterCompteur(visiteId, cleanLabel(f.cle));
          }
          charger();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <Text style={styles.sectionTitle}>Pressions</Text>
      <View style={styles.formCard}>
        {champsPression.map((f) => (
          <ChampGenerique
            key={f.cle} visiteId={visiteId} sectionCode="releves.compteurs"
            field={f} valeurInitiale={champsMap[`releves.compteurs||${f.cle}`]} onSaved={onSaved}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Compteurs relevés</Text>
      {compteurs.map((c) => (
        <CompteurCard key={c.id} compteur={c} unites={UNITES} onChange={charger} />
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={onAjouterCompteur}>
        <Text style={styles.addBtnText}>+ Ajouter un compteur — chauffage, appoint, ECS, énergie...</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Températures et pH</Text>
      <View style={styles.formCard}>
        {champsTemp.map((f) => (
          <ChampGenerique
            key={f.cle} visiteId={visiteId} sectionCode="releves.temperatures"
            field={f} valeurInitiale={champsMap[`releves.temperatures||${f.cle}`]} onSaved={onSaved}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const COMPTEUR_TYPES = [
  'Compteur gaz', 'Compteur eau froide ECS', 'Compteur eau froide générale',
  'Compteur énergie', 'Compteur fioul', 'Compteur électrique',
  'Manomètre chauffage', 'Manomètre ECS',
];

function CompteurCard({ compteur, unites, onChange }) {
  const [label, setLabel] = useState(compteur.label || '');
  const [unite, setUnite] = useState(compteur.unite || 'm³');

  const sauverLabel = async (val) => {
    setLabel(val);
    await upsertCompteurChamp(compteur.id, 'label', val);
  };
  const [valeur, setValeur, surBlurValeur] = useSaisieAvecAutoSave(
    compteur.valeur, (v) => upsertCompteurChamp(compteur.id, 'valeur', v)
  );

  return (
    <View style={styles.compteurRow}>
      <View style={styles.compteurRowTop}>
        <View style={{ flex: 1 }}>
          <ChipSelector valeur={label} options={COMPTEUR_TYPES} onChange={sauverLabel} />
        </View>
        <TouchableOpacity onPress={async () => { await supprimerCompteur(compteur.id); onChange(); }}>
          <Text style={styles.removeLink}>Suppr.</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.compteurRowBody}>
        <TextInput
          style={styles.compteurValInput}
          value={valeur}
          onChangeText={setValeur}
          onBlur={surBlurValeur}
          placeholder="Valeur relevée"
          keyboardType="numeric"
        />
        <View style={styles.uniteRow}>
          {unites.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.uniteChip, unite === u && styles.uniteChipSelected]}
              onPress={() => { setUnite(u); upsertCompteurChamp(compteur.id, 'unite', u); }}
            >
              <Text style={[styles.uniteChipText, unite === u && styles.uniteChipTextSelected]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Onglet Équipements : liste éditable avec ajout dynamique. */
function PanelEquipements({ visiteId }) {
  const [materiel, setMateriel] = useState([]);
  const [optionsCategories, setOptionsCategories] = useState(CATEGORIES_EQUIPEMENT);
  const [optionsMarques, setOptionsMarques] = useState(MARQUES_EQUIPEMENT);

  const charger = useCallback(async () => {
    const [m, biblio] = await Promise.all([listerMateriel(visiteId), listerBibliothequeEquipements()]);
    setMateriel(m);
    // Fusionne les listes fixes avec ce qui a été ajouté dans la bibliothèque
    // Paramètres → Équipements, pour que tout ajout y soit immédiatement
    // proposé en suggestion ici aussi (pas seulement via le sélecteur dédié).
    const categoriesBiblio = [...new Set(biblio.map((b) => b.categorie).filter(Boolean))];
    const marquesBiblio = [...new Set(biblio.map((b) => b.marque).filter(Boolean))];
    setOptionsCategories([...new Set([...CATEGORIES_EQUIPEMENT, ...categoriesBiblio])].sort((a, b) => a.localeCompare(b)));
    setOptionsMarques([...new Set([...MARQUES_EQUIPEMENT, ...marquesBiblio])].sort((a, b) => a.localeCompare(b)));
  }, [visiteId]);

  useEffect(useCallback(() => { charger(); }, [charger]));

  const onAjouter = async () => { await ajouterMateriel(visiteId); charger(); };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <Text style={styles.sectionTitle}>Équipements — feuille MATERIEL</Text>
      {materiel.map((m) => (
        <MaterielCard
          key={m.id} item={m} visiteId={visiteId} onChange={charger}
          optionsCategories={optionsCategories} optionsMarques={optionsMarques}
        />
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={onAjouter}>
        <Text style={styles.addBtnText}>+ Ajouter un équipement</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

import { CATEGORIES_EQUIPEMENT, MARQUES_EQUIPEMENT } from './ParametresScreen.js';

function MaterielCard({ item, visiteId, onChange, optionsCategories, optionsMarques }) {
  const [categorie, setCategorie] = useState(item.categorie || '');
  const [marque, setMarque] = useState(item.marque || '');
  const [biblioVisible, setBiblioVisible] = useState(false);
  const [biblio, setBiblio] = useState([]);

  const [designation, setDesignation, surBlurDesignation] = useSaisieAvecAutoSave(
    item.designation, (v) => upsertMaterielChamp(item.id, 'designation', v)
  );
  const [modele, setModele, surBlurModele] = useSaisieAvecAutoSave(
    item.modele, (v) => upsertMaterielChamp(item.id, 'modele', v)
  );
  const [annee, setAnnee, surBlurAnnee] = useSaisieAvecAutoSave(
    item.annee, (v) => upsertMaterielChamp(item.id, 'annee', v)
  );

  const sauverCategorie = async (val) => { setCategorie(val); await upsertMaterielChamp(item.id, 'categorie', val); };
  const sauverMarque = async (val) => { setMarque(val); await upsertMaterielChamp(item.id, 'marque', val); };

  const ouvrirBiblio = async () => {
    setBiblio(await listerBibliothequeEquipements());
    setBiblioVisible(true);
  };
  const choisirDepuisBiblio = async (e) => {
    setCategorie(e.categorie); setMarque(e.marque || '');
    await upsertMaterielChamp(item.id, 'categorie', e.categorie);
    await upsertMaterielChamp(item.id, 'marque', e.marque || '');
    await upsertMaterielChamp(item.id, 'modele', e.modele || '');
    setBiblioVisible(false);
  };

  return (
    <View style={styles.formCard}>
      <TouchableOpacity style={styles.biblioShortcutBtn} onPress={ouvrirBiblio}>
        <Text style={styles.biblioShortcutBtnText}>📚 Choisir dans la bibliothèque</Text>
      </TouchableOpacity>
      <View style={styles.materielTopRow}>
        <View style={{ flex: 1 }}>
          <TypeAheadInput
            valeur={categorie}
            options={optionsCategories}
            placeholder="Catégorie (ex: Chaudière, Pompe, Adoucisseur...)"
            onChange={sauverCategorie}
          />
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={`materiel||${item.id}`} label={designation || categorie} />
      </View>
      <View style={{ height: 8 }} />
      <TextInput
        style={styles.input}
        placeholder="Désignation"
        value={designation}
        onChangeText={setDesignation}
        onBlur={surBlurDesignation}
      />
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <TypeAheadInput
            valeur={marque}
            options={optionsMarques}
            placeholder="Marque"
            onChange={sauverMarque}
          />
        </View>
        <TextInput
          style={[styles.input, { flex: 1 }]} placeholder="Modèle" value={modele}
          onChangeText={setModele} onBlur={surBlurModele}
        />
        <TextInput
          style={[styles.input, { width: 70 }]} placeholder="Année" value={annee}
          onChangeText={setAnnee} onBlur={surBlurAnnee}
          keyboardType="numeric"
        />
      </View>
      <TouchableOpacity style={{ marginTop: 10 }} onPress={async () => { await supprimerMateriel(item.id); onChange(); }}>
        <Text style={styles.removeLink}>Supprimer cet équipement</Text>
      </TouchableOpacity>

      <Modal visible={biblioVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choisir un équipement</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300 }}>
              {biblio.length === 0 ? (
                <Text style={styles.emptySub}>Bibliothèque vide. Ajoutes-en depuis Paramètres → Équipements.</Text>
              ) : (
                biblio.map((e) => (
                  <TouchableOpacity key={e.id} style={styles.biblioRow} onPress={() => choisirDepuisBiblio(e)}>
                    <Text style={styles.biblioRowTitle}>{e.categorie}</Text>
                    <Text style={styles.biblioRowSub}>{[e.marque, e.modele].filter(Boolean).join(' — ') || '—'}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.btnSecondary, { marginTop: 14 }]} onPress={() => setBiblioVisible(false)}>
              <Text style={styles.btnSecondaryText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Onglet Réserves : 100% dynamique, lit ce que les contrôles ont généré. */
function PanelRemarques({ visiteId, refreshKey }) {
  const [remarques, setRemarques] = useState([]);
  const [biblioVisible, setBiblioVisible] = useState(false);
  const [biblio, setBiblio] = useState([]);

  useEffect(useCallback(() => {
    listerRemarques(visiteId).then(setRemarques);
  }, [visiteId, refreshKey]));

  const total = remarques.length;
  const sumEstim = remarques.reduce((s, r) => s + (r.estimatif || 0), 0);
  const urgent = remarques.filter((r) => r.delai && r.delai <= 3).length;

  const ouvrirBiblio = async () => {
    setBiblio(await listerBibliothequeReserves());
    setBiblioVisible(true);
  };
  const choisirDepuisBiblio = async (item) => {
    await ajouterRemarqueDepuisBiblio(visiteId, item);
    setBiblioVisible(false);
    listerRemarques(visiteId).then(setRemarques);
  };
  const ajouterVierge = async () => {
    await ajouterRemarqueManuelle(visiteId);
    setBiblioVisible(false);
    listerRemarques(visiteId).then(setRemarques);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <View style={styles.totalsBar}>
        <View style={styles.totalsCard}><Text style={styles.totalsNum}>{total}</Text><Text style={styles.totalsLabel}>Réserves</Text></View>
        <View style={styles.totalsCard}><Text style={styles.totalsNum}>{Math.round(sumEstim)} €</Text><Text style={styles.totalsLabel}>Estimatif</Text></View>
        <View style={styles.totalsCard}><Text style={styles.totalsNum}>{urgent}</Text><Text style={styles.totalsLabel}>≤ 3 mois</Text></View>
      </View>
      <Text style={styles.sectionTitle}>Réserves — générées automatiquement</Text>
      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune réserve pour l'instant.</Text>
          <Text style={styles.emptySub}>Passez un point de contrôle en N.S pour en générer une.</Text>
        </View>
      ) : (
        remarques.map((r) => (
          <View key={r.id} style={styles.remarqueCard}>
            <View style={styles.remarqueTop}>
              <Text style={styles.remarquePoste}>{r.poste}</Text>
              <Text style={styles.remarqueEstim}>{r.estimatif ? Math.round(r.estimatif) + ' €' : '—'}</Text>
            </View>
            <Text style={styles.remarqueTxt}>{r.prestation}</Text>
            <View style={styles.remarqueMeta}>
              <Text style={styles.remarqueMetaTxt}>Délai : <Text style={styles.bold}>{r.delai ? r.delai + ' mois' : '—'}</Text></Text>
              <Text style={styles.remarqueMetaTxt}>Origine : <Text style={styles.bold}>{r.origine}</Text></Text>
            </View>
          </View>
        ))
      )}
      <TouchableOpacity style={styles.addBtn} onPress={ouvrirBiblio}>
        <Text style={styles.addBtnText}>+ Ajouter une réserve manuelle</Text>
      </TouchableOpacity>

      <Modal visible={biblioVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choisir une réserve</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300 }}>
              {biblio.length === 0 ? (
                <Text style={styles.emptySub}>Aucune réserve dans ta bibliothèque. Ajoutes-en depuis Paramètres, ou pars d'une réserve vierge.</Text>
              ) : (
                biblio.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.biblioRow} onPress={() => choisirDepuisBiblio(item)}>
                    <Text style={styles.biblioRowTitle}>{item.nom}</Text>
                    {item.description ? <Text style={styles.biblioRowSub} numberOfLines={1}>{item.description}</Text> : null}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setBiblioVisible(false)}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={ajouterVierge}>
                <Text style={styles.btnPrimaryText}>Réserve vierge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/** Onglet Photos : galerie complète de la visite, avec visionneuse. */
function PanelPhotos({ visiteId, refreshKey }) {
  const [photos, setPhotos] = useState([]);
  const [viewerUri, setViewerUri] = useState(null);

  useEffect(useCallback(() => {
    listerPhotos(visiteId).then(setPhotos);
  }, [visiteId, refreshKey]));

  const onAjouter = async () => {
    const uri = await prendrePhoto();
    if (uri) {
      await ajouterPhoto(visiteId, null, uri, 'Photo générale');
      listerPhotos(visiteId).then(setPhotos);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <Text style={styles.sectionTitle}>Toutes les photos de la visite · {photos.length}</Text>
      <View style={styles.photoGrid}>
        {photos.map((p) => (
          <TouchableOpacity key={p.id} style={styles.photoThumb} onPress={() => setViewerUri(p.uri)}>
            <Image source={{ uri: p.uri }} style={styles.photoThumbImg} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.photoAddTile} onPress={onAjouter}>
          <Text style={styles.photoAddTileText}>+</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!viewerUri} transparent animationType="fade">
        <TouchableOpacity style={styles.viewerOverlay} onPress={() => setViewerUri(null)} activeOpacity={1}>
          {viewerUri && <Image source={{ uri: viewerUri }} style={styles.viewerImg} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}


export { PANEL_LABELS, TAB_ORDER, PanelGenerique, PanelRegulation, PanelReleves, PanelEquipements, PanelRemarques, PanelPhotos };

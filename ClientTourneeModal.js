/** Itinéraire du client : choisir les sites et locaux à faire (liste de contrôle). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { getDb } from './db.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { ajouterCiblesTournee, listerTourneeClient, retirerCiblesTournee, retirerCiblesFaites } from './tourneeDb.js';

const keySite = (siteId) => `s:${siteId}`;
const keyLocal = (siteId, installationId) => `i:${siteId}:${installationId}`;
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function Case({ on, label, onPress, indent = 0, sub = null, right = null }) {
  return <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} activeOpacity={0.7}
    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, paddingLeft: 6 + indent, paddingRight: 6, borderRadius: 12 }}>
    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: on ? COLORS.orange : 'rgba(22,21,15,0.25)', backgroundColor: on ? COLORS.orange : COLORS.white, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <CvcIcon name="check" size={15} color={COLORS.white} strokeWidth={3} /> : null}
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: FONTS.bodySemi, color: COLORS.ink }}>{label}</Text>
      {sub ? <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 }}>{sub}</Text> : null}
    </View>
    {right}
  </TouchableOpacity>;
}

export function ClientTourneeModal({ visible, clientId, sites = [], onClose, onChanged }) {
  const [chargement, setChargement] = useState(false);
  const [initial, setInitial] = useState(new Map());
  const [choix, setChoix] = useState(new Set());
  const [locauxParSite, setLocauxParSite] = useState({});
  const [ouvert, setOuvert] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const db = await getDb();
      const [rows, locaux] = await Promise.all([
        listerTourneeClient(clientId),
        db.getAllAsync(`SELECT i.id, i.site_id, i.nom FROM installations i JOIN sites s ON s.id=i.site_id WHERE s.client_id=? AND i.actif=1 ORDER BY i.nom`, [String(clientId)]),
      ]);
      const existant = new Map(rows.map((r) => [r.installation_id ? keyLocal(r.site_id, r.installation_id) : keySite(r.site_id), r]));
      setInitial(existant);
      setChoix(new Set(existant.keys()));
      const parSite = {};
      for (const l of locaux) (parSite[l.site_id] = parSite[l.site_id] || []).push(l);
      setLocauxParSite(parSite);
    } catch (e) { Alert.alert('Tournée', String(e?.message || e)); }
    finally { setChargement(false); }
  }, [clientId]);

  useEffect(() => { if (visible) { setRecherche(''); setOuvert(null); charger(); } }, [visible, charger]);

  const basculer = (key) => setChoix((courant) => { const suivant = new Set(courant); if (suivant.has(key)) suivant.delete(key); else suivant.add(key); return suivant; });
  const sitesFiltres = useMemo(() => {
    const q = norm(recherche);
    return q ? sites.filter((s) => norm(`${s.nom_site} ${s.adresse || ''}`).includes(q)) : sites;
  }, [sites, recherche]);

  // Un client peut être rangé en plusieurs sites (chacun avec un ou plusieurs
  // locaux) ou n'avoir qu'un seul site dont les locaux sont l'essentiel :
  // on coche donc au choix les sites ou directement les locaux.
  const unSeulSite = sites.length === 1;
  const setChoixTous = (on, niveau = 'sites') => setChoix((courant) => {
    const suivant = new Set(courant);
    for (const s of sitesFiltres) {
      if (niveau === 'sites') { if (on) suivant.add(keySite(s.id)); else suivant.delete(keySite(s.id)); }
      else for (const l of locauxParSite[s.id] || []) { if (on) suivant.add(keyLocal(s.id, l.id)); else suivant.delete(keyLocal(s.id, l.id)); }
    }
    return suivant;
  });
  const setLocauxDuSite = (siteId, on) => setChoix((courant) => {
    const suivant = new Set(courant);
    for (const l of locauxParSite[siteId] || []) { if (on) suivant.add(keyLocal(siteId, l.id)); else suivant.delete(keyLocal(siteId, l.id)); }
    return suivant;
  });

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const versCible = (key) => { const [type, siteId, installationId] = key.split(':'); return type === 's' ? { siteId } : { siteId, installationId }; };
      const aAjouter = [...choix].filter((k) => !initial.has(k)).map(versCible);
      const aRetirer = [...initial.keys()].filter((k) => !choix.has(k)).map(versCible);
      await ajouterCiblesTournee(clientId, aAjouter);
      await retirerCiblesTournee(clientId, aRetirer);
      await onChanged?.();
      onClose?.();
    } catch (e) { Alert.alert('Enregistrement impossible', String(e?.message || e)); }
    finally { setEnregistrement(false); }
  };

  const nettoyerFaites = () => Alert.alert('Retirer ce qui est fait ?', 'Les sites et locaux déjà visités quittent l’itinéraire : il ne reste que ce qui est à faire.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Retirer', onPress: async () => { try { await retirerCiblesFaites(clientId); await charger(); await onChanged?.(); } catch (e) { Alert.alert('Tournée', String(e?.message || e)); } } },
  ]);

  const nbChoisis = [...choix].filter((k) => k.startsWith('s:')).length;
  const nbLocaux = choix.size - nbChoisis;

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
        <Text style={styles.modalTitle}>Itinéraire</Text>
        <Text style={{ color: COLORS.muted, fontSize: 11.5, marginBottom: 10 }}>Coche les sites ou les locaux à faire, selon l’organisation du client. Dès qu’une visite est créée sur un local, le local et son site passent en « Fait ».</Text>
        <TextInput style={styles.input} value={recherche} onChangeText={setRecherche} placeholder="Rechercher un site…" autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 }}>
          {unSeulSite ? null : <TouchableOpacity accessibilityRole="button" onPress={() => setChoixTous(true, 'sites')} style={{ minHeight: 38, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)' }}><Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.ink }}>Tous les sites</Text></TouchableOpacity>}
          <TouchableOpacity accessibilityRole="button" onPress={() => setChoixTous(true, 'locaux')} style={{ minHeight: 38, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)' }}><Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.ink }}>Tous les locaux</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setChoixTous(false, 'sites'); setChoixTous(false, 'locaux'); }} style={{ minHeight: 38, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)' }}><Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.ink }}>Tout décocher</Text></TouchableOpacity>
          {initial.size ? <TouchableOpacity accessibilityRole="button" onPress={nettoyerFaites} style={{ minHeight: 38, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)' }}><Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.ink }}>Retirer les faits</Text></TouchableOpacity> : null}
        </View>
        {chargement ? <ActivityIndicator style={{ marginVertical: 24 }} color={COLORS.orange} /> : <FlatList
          style={{ flexGrow: 0, maxHeight: 420 }}
          data={sitesFiltres}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const locaux = locauxParSite[item.id] || [];
            const ouvertIci = unSeulSite || ouvert === item.id;
            const tousLocaux = locaux.length > 0 && locaux.every((l) => choix.has(keyLocal(item.id, l.id)));
            if (unSeulSite) {
              return <View>
                {locaux.length ? <Case on={tousLocaux} label="Tous les locaux" sub={item.nom_site} onPress={() => setLocauxDuSite(item.id, !tousLocaux)} /> : <Text style={{ color: COLORS.muted, paddingVertical: 10 }}>Ce site n’a pas encore de local : coche le site.</Text>}
                {locaux.map((l) => <Case key={l.id} indent={14} on={choix.has(keyLocal(item.id, l.id))} label={l.nom || 'Local'} onPress={() => basculer(keyLocal(item.id, l.id))} />)}
                {!locaux.length ? <Case on={choix.has(keySite(item.id))} label={item.nom_site} onPress={() => basculer(keySite(item.id))} /> : null}
              </View>;
            }
            return <View>
              <Case on={choix.has(keySite(item.id))} label={item.nom_site} sub={locaux.length ? `${locaux.length} local${locaux.length > 1 ? 'aux' : ''}` : null} onPress={() => basculer(keySite(item.id))}
                right={locaux.length ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choisir les locaux de ${item.nom_site}`} onPress={() => setOuvert(ouvertIci ? null : item.id)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark }}>{ouvertIci ? 'Réduire' : 'Locaux'}</Text></TouchableOpacity> : null} />
              {ouvertIci ? <Case indent={30} on={tousLocaux} label="Tous les locaux du site" onPress={() => setLocauxDuSite(item.id, !tousLocaux)} /> : null}
              {ouvertIci ? locaux.map((l) => <Case key={l.id} indent={30} on={choix.has(keyLocal(item.id, l.id))} label={l.nom || 'Local'} onPress={() => basculer(keyLocal(item.id, l.id))} />) : null}
            </View>;
          }}
          ListEmptyComponent={<Text style={{ color: COLORS.muted, paddingVertical: 14 }}>Aucun site.</Text>}
        />}
        <Text style={{ marginTop: 8, fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft }}>{nbChoisis} site{nbChoisis > 1 ? 's' : ''}{nbLocaux ? ` · ${nbLocaux} local${nbLocaux > 1 ? 'aux' : ''}` : ''} dans l’itinéraire</Text>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} disabled={enregistrement} onPress={enregistrer}><ButtonGlow /><Text style={styles.btnPrimaryText}>{enregistrement ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}

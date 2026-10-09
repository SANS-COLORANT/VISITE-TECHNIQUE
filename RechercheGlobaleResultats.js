/**
 * Résultats de la recherche globale de l'accueil, sous le champ de recherche :
 * clients, sites, locaux et règles. Les fiches de règles s'ouvrent en feuille.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';
import { rechercherPartout } from './rechercheGlobale.js';
import { listerStructuresPourRecherche } from './rechercheGlobaleDb.js';

const ICONE = { client: 'local', site: 'local', local: 'tools', regle: 'document' };
let STRUCTURES = null;
const chargerAide = () => require('./AideReglementaire.js');
const chargerThemes = () => Object.values(require('./aideReglementaireData.js').AIDE_THEMES);

export function RechercheGlobaleResultats({ requete, clients, navigation, onAnnuler }) {
  const [structures, setStructures] = useState(STRUCTURES || []);
  const [themes, setThemes] = useState([]);
  const actif = String(requete || '').trim().length >= 2;
  const [aideUtilisee, setAideUtilisee] = useState(false);

  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    listerStructuresPourRecherche().then((rows) => { STRUCTURES = rows; if (vivant) setStructures(rows); }).catch(() => {});
    return () => { vivant = false; };
  }, [actif]);
  useEffect(() => { if (actif && !themes.length) { try { setThemes(chargerThemes()); } catch (e) { /* aide indisponible : on cherche sans les règles */ } } }, [actif, themes.length]);

  const resultat = useMemo(() => (actif ? rechercherPartout(requete, { clients, structures, themes }) : null), [actif, requete, clients, structures, themes]);
  const Hote = aideUtilisee ? chargerAide().AideReglementaireHost : null;
  if (!resultat) return null;

  const ouvrir = (item) => {
    if (item.cible.aide) { setAideUtilisee(true); setTimeout(() => chargerAide().ouvrirAideReglementaire({ themeId: item.cible.aide }), 30); return; }
    onAnnuler?.();
    navigation.navigate(item.cible.ecran, item.cible.params);
  };

  return <View style={{ marginBottom: 14, gap: 10 }}>
    {resultat.vide ? <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.inkSoft, paddingHorizontal: 4 }}>Rien dans l’appareil pour « {String(requete).trim()} ». Appuie sur la flèche pour chercher dans l’annuaire Intranet.</Text> : null}
    {resultat.groupes.map((g) => <View key={g.id} style={{ gap: 6 }}>
      <Text style={{ fontSize: 10, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.inkFaint, paddingHorizontal: 4 }}>{g.titre}{g.total > g.items.length ? ` · ${g.total}` : ''}</Text>
      {g.items.map((item) => <TouchableOpacity key={item.cle} activeOpacity={0.85} accessibilityRole="button" onPress={() => ouvrir(item)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' }}>
        <CvcIcon name={ICONE[item.type]} size={18} color={COLORS.orangeDark} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, color: COLORS.ink }}>{item.titre}</Text>
          {item.sous ? <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.inkSoft }}>{item.sous}</Text> : null}
        </View>
        <CvcIcon name="chevron-right" size={15} color={COLORS.orangeDark} strokeWidth={2.2} />
      </TouchableOpacity>)}
    </View>)}
    {Hote ? <Hote /> : null}
  </View>;
}

/**
 * Fiches d'aide par appui long : un appui long (≈ 0,55 s) sur un onglet ou sur
 * l'intitulé d'une ligne de contrôle ouvre une fiche explicative des règles.
 * L'écran de visite ne change pas ; ouvrir l'aide ne modifie aucun avis.
 * Voir docs/AIDE_REGLEMENTAIRE.md.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, G, Marker, Path, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS } from './styles.js';
import { BottomSheet, KIT } from './VisitKit.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { getChampsVisite } from './db.js';
import { hapticTick } from './fieldFeedback.js';
import {
  DEBITS_VMC, EXTINCTEURS_CAS, arrondiSuperieur, VISUEL_THEME, debitDepuisVitesse, ecartIndex, enBref, ficheDeLaLigne, getSource, getTheme,
  natureTheme, nombre, panneauDeSection, puissanceDeLaVisite, puissanceHydraulique, repereEcs, sectionsVentilation, themesDeLOnglet,
} from './aideReglementaire.js';
import { AIDE_VERSION } from './aideReglementaireData.js';

const listeners = new Set();
let derniereDemande = null;

/**
 * Demande d'ouverture : { trameId, visiteId, panelId, titreOnglet } pour un onglet,
 * ou { trameId, visiteId, sectionCode, cle } pour une ligne de contrôle.
 */
export function ouvrirAideReglementaire(demande) {
  derniereDemande = demande || null;
  hapticTick();
  listeners.forEach((l) => l(derniereDemande));
}

const NATURE_TONS = {
  ob: { bg: KIT.greenBg, fg: KIT.green },
  pr: { bg: '#E2EEFA', fg: '#1D6FB8' },
  co: { bg: '#EEE9FB', fg: '#6941C6' },
  det: { bg: KIT.amberBg, fg: KIT.amber },
};

function Badge({ theme }) {
  const n = natureTheme(theme); const t = NATURE_TONS[n.code];
  return <View style={[s.badge, { backgroundColor: t.bg }]}><Text style={[s.badgeText, { color: t.fg }]}>{n.label}</Text></View>;
}

function Carte({ titre, children }) {
  return <View style={s.card}>{titre ? <Text style={s.cardLab}>{titre}</Text> : null}{children}</View>;
}

function Champ({ label, value, onChange, placeholder, keyboardType = 'decimal-pad', style }) {
  return <View style={[{ flex: 1, minWidth: 90 }, style]}>
    <Text style={s.fieldLab}>{label}</Text>
    <TextInput style={s.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={COLORS.inkFaint} keyboardType={keyboardType} />
  </View>;
}

function Statut({ type, children }) {
  const tons = { aide: { bg: '#E2EEFA', fg: '#1D6FB8' }, manq: { bg: KIT.amberBg, fg: KIT.amber }, hors: { bg: KIT.redBg, fg: KIT.red } }[type];
  return <View style={[s.statut, { backgroundColor: tons.bg }]}><Text style={[s.statutText, { color: tons.fg }]}>{children}</Text></View>;
}

const fr = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

function Resultat({ k, v, u, sous }) {
  return <View style={s.res}><Text style={s.resK}>{k}</Text><Text style={s.resV}>{v}<Text style={s.resU}>{u ? ` ${u}` : ''}</Text></Text>{sous ? <Text style={s.resU}>{sous}</Text> : null}</View>;
}

// ---------------------------------------------------------------------------
// Visuels
// ---------------------------------------------------------------------------

function VisuelVentilation({ kwInitial }) {
  const [kw, setKw] = useState(kwInitial != null ? String(kwInitial) : '');
  const [surface, setSurface] = useState('');
  const [grille, setGrille] = useState('');
  useEffect(() => { if (kwInitial != null && !kw) setKw(String(kwInitial)); }, [kwInitial]);
  const r = sectionsVentilation({ kw, surface, passageLibrePct: grille });
  return <>
    <Carte titre="Schéma">
      <Svg width="100%" height={130} viewBox="0 0 320 130">
        <Defs>
          <Marker id="av1" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><Path d="M0 0l8 4-8 4z" fill="#1D6FB8" /></Marker>
          <Marker id="av2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><Path d="M0 0l8 4-8 4z" fill={COLORS.orange} /></Marker>
        </Defs>
        <Rect x="70" y="14" width="180" height="100" rx="8" fill="#FFFFFF" stroke={COLORS.inkSoft} strokeWidth="2" />
        <Rect x="62" y="84" width="16" height="26" fill="#1D6FB8" opacity="0.85" />
        <Rect x="242" y="20" width="16" height="26" fill={COLORS.orange} opacity="0.9" />
        <Path d="M20 97h40" stroke="#1D6FB8" strokeWidth="3" markerEnd="url(#av1)" />
        <Path d="M260 33h40" stroke={COLORS.orange} strokeWidth="3" markerEnd="url(#av2)" />
        <Path d="M96 90c40-8 60-8 100-50" stroke={COLORS.inkSoft} strokeWidth="2" strokeDasharray="5 5" fill="none" opacity="0.6" />
        <SvgText x="8" y="120" fontSize="11" fontWeight="700" fill="#1D6FB8">Amenée basse VB</SvgText>
        <SvgText x="196" y="64" fontSize="11" fontWeight="700" fill={COLORS.orangeDark}>Évacuation haute VH</SvgText>
        <SvgText x="130" y="68" fontSize="11" fill={COLORS.inkSoft}>balayage</SvgText>
      </Svg>
    </Carte>
    <Carte titre="Aide de dimensionnement · DTU 65.4 (synthèse GRDF)">
      <View style={s.formule}><Text style={s.formuleText}>SVB ≥ max(P / 23 ; 2,5) dm²</Text><Text style={s.formuleText}>SVH ≥ max(A / 10 ; 2,5) dm²</Text></View>
      {kwInitial != null ? <View style={s.reprise}><Text style={s.repriseText}>Puissance reprise de la visite : <Text style={{ fontFamily: FONTS.bodyBold }}>{fr(kwInitial, 0)} kW</Text> · modifiable</Text></View> : null}
      <View style={s.ligne}>
        <Champ label="P · kW" value={kw} onChange={setKw} />
        <Champ label="A · m²" value={surface} onChange={setSurface} placeholder="surface du local" />
        <Champ label="Grille · % libre" value={grille} onChange={setGrille} placeholder="fiche produit" />
      </View>
      {r.statut === 'manquantes' ? <Statut type="manq">Données manquantes : puissance et surface du local</Statut> : null}
      {r.statut === 'hors' ? <><Statut type="hors">Hors domaine</Statut><Text style={s.note}>{r.raison}</Text></> : null}
      {r.statut === 'aide' ? <>
        <Statut type="aide">Aide de dimensionnement</Statut>
        <View style={s.ligne}>
          <Resultat k="Section libre VB" v={fr(arrondiSuperieur(r.vb))} u="dm²" sous={`≈ ${fr(arrondiSuperieur(r.vbM2, 4), 4)} m²${r.brutVbM2 ? ` · brute ≥ ${fr(arrondiSuperieur(r.brutVbM2, 4), 4)} m²` : ''}`} />
          <Resultat k="Section libre VH" v={fr(arrondiSuperieur(r.vh))} u="dm²" sous={`≈ ${fr(arrondiSuperieur(r.vhM2, 4), 4)} m²${r.brutVhM2 ? ` · brute ≥ ${fr(arrondiSuperieur(r.brutVhM2, 4), 4)} m²` : ''}`} />
        </View>
        {!r.coefficientConnu ? <Text style={s.note}>Coefficient de grille inconnu : demander la fiche du produit.</Text> : null}
      </> : null}
      <Text style={s.note}>P : puissance nominale selon la définition de la méthode. A : surface du local. Ouvertures directes à travers une paroi, air de combustion pris dans le local, P inférieure à 2 000 kW. Gaines, ventilation mécanique et appareils étanches : hors domaine, note aéraulique à demander. Un minimum géométrique ne vérifie ni pertes de charge, ni balayage.</Text>
    </Carte>
  </>;
}

function VisuelExtincteurs() {
  const [cas, setCas] = useState('gaz');
  return <Carte titre="Qui exige quoi">
    <View style={s.seg}>{Object.entries(EXTINCTEURS_CAS).map(([k, v]) => <TouchableOpacity key={k} accessibilityRole="button" onPress={() => setCas(k)} style={[s.segBtn, cas === k && s.segBtnOn]}><Text style={[s.segText, cas === k && { color: COLORS.white }]}>{v.label}</Text></TouchableOpacity>)}</View>
    {EXTINCTEURS_CAS[cas].lignes.map(([a, b]) => <View key={a} style={s.tbl}><Text style={s.tblK}>{a}</Text><Text style={s.tblV}>{b}</Text></View>)}
    <Text style={s.note}>Les prescriptions se cumulent : le maximum d’un texte ne plafonne pas les autres.</Text>
  </Carte>;
}

function VisuelIssues() {
  return <Carte titre="Retraite">
    <Svg width="100%" height={120} viewBox="0 0 320 120">
      <Defs><Marker id="bi1" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><Path d="M0 0l8 4-8 4z" fill={KIT.green} /></Marker></Defs>
      <Rect x="90" y="20" width="140" height="80" rx="8" fill="#FFFFFF" stroke={COLORS.inkSoft} strokeWidth="2" />
      <Rect x="84" y="50" width="12" height="22" fill={KIT.green} />
      <Rect x="224" y="50" width="12" height="22" fill={KIT.green} />
      <Path d="M84 61H30" stroke={KIT.green} strokeWidth="3" markerEnd="url(#bi1)" />
      <Path d="M236 61h54" stroke={KIT.green} strokeWidth="3" markerEnd="url(#bi1)" />
      <SvgText x="12" y="52" fontSize="11" fontWeight="700" fill={KIT.green}>Direction 1</SvgText>
      <SvgText x="236" y="52" fontSize="11" fontWeight="700" fill={KIT.green}>Direction 2</SvgText>
      <SvgText x="128" y="64" fontSize="11" fill={COLORS.inkSoft}>chaufferie</SvgText>
    </Svg>
    <Text style={s.note}>Une seule direction est admise dans certains cas (fluide, situation, puissance). Ouverture vers la sortie, possible depuis l’intérieur.</Text>
  </Carte>;
}

function VisuelGaine() {
  return <Carte titre="Repères">
    <View style={s.ligne}><Resultat k="Section" v="16" u="dm²" /><Resultat k="Plus petite dimension" v="≥ 20" u="cm" /></View>
    <Text style={s.note}>Débouché extérieur au sol · obturateur démontable sans outil · gaine repérée.</Text>
  </Carte>;
}

function VisuelChaine() {
  const bloc = (x, titre, sous, bg, fg) => <G key={titre}>
    <Rect x={x} y="24" width="88" height="46" rx="12" fill={bg} />
    <SvgText x={x + 44} y="43" fontSize="11" fontWeight="700" fill={fg} textAnchor="middle">{titre}</SvgText>
    <SvgText x={x + 44} y="58" fontSize="10" fill={fg} textAnchor="middle">{sous}</SvgText>
  </G>;
  return <Carte titre="Chaîne de sécurité à prouver">
    <Svg width="100%" height={90} viewBox="0 0 320 90">
      {bloc(4, 'Capteur', 'réf., étalonnage', '#E2EEFA', '#1D6FB8')}
      {bloc(116, 'Centrale', 'alarme, 30 % LIE', KIT.amberBg, KIT.amber)}
      {bloc(228, 'Vanne', 'fermeture', KIT.greenBg, KIT.green)}
      <Path d="M94 47h18M206 47h18" stroke={COLORS.inkSoft} strokeWidth="2" />
    </Svg>
    <Text style={s.note}>Une centrale allumée ne prouve ni l’étalonnage ni la fermeture des vannes : demander l’essai de la chaîne complète.</Text>
  </Carte>;
}

function VisuelEcs() {
  const [t, setT] = useState('');
  const [point, setPoint] = useState('sto');
  const X = (v) => 10 + (Math.max(30, Math.min(80, v)) - 30) / 50 * 300;
  const val = nombre(t);
  const repere = repereEcs(point, t);
  const POINTS = [['sto', 'Stockage ≥ 400 L'], ['dis', 'Distribution'], ['toi', 'Puisage toilette'], ['aut', 'Puisage autres']];
  return <Carte titre="Échelle de repères · °C">
    <Svg width="100%" height={126} viewBox="0 0 320 126">
      <Rect x="10" y="44" width="300" height="16" rx="8" fill="#ECE9E1" />
      <Rect x="130" y="44" width="180" height="16" fill="#1D6FB8" opacity="0.3" />
      <Rect x="160" y="44" width="150" height="16" fill={KIT.green} opacity="0.3" />
      <Path d="M130 40v24M160 40v24M190 40v24" stroke={COLORS.inkSoft} strokeWidth="1.5" />
      {[[10, '30'], [130, '50'], [160, '55'], [190, '60'], [310, '80']].map(([x, l]) => <SvgText key={l} x={x} y="76" fontSize="10" fill={COLORS.inkSoft} textAnchor="middle">{l}</SvgText>)}
      <SvgText x="132" y="92" fontSize="10" fontWeight="700" fill="#1D6FB8">≥ 50 distribution (points à risque)</SvgText>
      <SvgText x="162" y="106" fontSize="10" fontWeight="700" fill={KIT.green}>≥ 55 stockage de 400 L ou plus</SvgText>
      <SvgText x="192" y="120" fontSize="10" fontWeight="700" fill={KIT.amber}>≤ 60 puisage · ≤ 50 toilette</SvgText>
      {Number.isFinite(val) ? <G>
        <Path d={`M${X(val)} 42l-6-9h12z`} fill={COLORS.orangeDark} />
        <SvgText x={X(val)} y="26" fontSize="11" fontWeight="700" fill={COLORS.orangeDark} textAnchor="middle">{fr(val, 1)} °C</SvgText>
      </G> : null}
    </Svg>
    <View style={s.seg}>{POINTS.map(([k, l]) => <TouchableOpacity key={k} accessibilityRole="button" onPress={() => setPoint(k)} style={[s.segBtn, point === k && s.segBtnOn]}><Text style={[s.segText, point === k && { color: COLORS.white }]}>{l}</Text></TouchableOpacity>)}</View>
    <Champ label="Température mesurée · °C" value={t} onChange={setT} placeholder="ex. 57" />
    {repere ? <><Statut type="aide">Repère, pas un avis</Statut><Text style={[s.note, { color: COLORS.ink }]}>{repere}</Text></> : null}
    <Text style={s.note}>Limites au puisage : toilette ≤ 50 °C, autres pièces ≤ 60 °C. Avec points à risque et plus de 3 L en distribution : 50 °C au moins ; stockage de 400 L ou plus : 55 °C au moins ou traitement thermique quotidien.</Text>
  </Carte>;
}

function VisuelBaes() {
  return <Carte titre="Trois fonctions à ne pas confondre">
    <View style={s.ligne}>
      <Resultat k="Évacuation" v="" sous="sorties, changements de direction" />
      <Resultat k="Ambiance" v="" sous="zones ouvertes" />
      <Resultat k="Intervention" v="" sous="commandes, organes" />
    </View>
    <Text style={s.note}>Conserver essais fonctionnels et d’autonomie, dates et défauts.</Text>
  </Carte>;
}

function VisuelVmc() {
  const [n, setN] = useState(3);
  const [v, setV] = useState('2');
  const [surf, setSurf] = useState('0,01');
  const q = debitDepuisVitesse(v, surf);
  return <>
    <Carte titre="Débits de l’arrêté de 1982 · m³/h">
      <View style={s.seg}>{Object.keys(DEBITS_VMC).map((k) => <TouchableOpacity key={k} accessibilityRole="button" onPress={() => setN(Number(k))} style={[s.segBtn, n === Number(k) && s.segBtnOn]}><Text style={[s.segText, n === Number(k) && { color: COLORS.white }]}>{k} pièce{Number(k) > 1 ? 's' : ''}</Text></TouchableOpacity>)}</View>
      <View style={s.ligne}>
        <Resultat k="Cuisine" v={String(DEBITS_VMC[n][0])} u="m³/h" />
        <Resultat k="Salle de bains" v={String(DEBITS_VMC[n][1])} u="m³/h" />
        <Resultat k="Total réduit" v={String(DEBITS_VMC[n][2])} u="m³/h" />
      </View>
      <Text style={s.note}>Extrait pour les logements du domaine de l’arrêté. Systèmes modulés : consulter le document technique de la configuration.</Text>
    </Carte>
    <Carte titre="Débit à partir de la vitesse">
      <View style={s.formule}><Text style={s.formuleText}>Q (m³/h) = 3 600 × v (m/s) × S (m²)</Text></View>
      <View style={s.ligne}><Champ label="v · m/s" value={v} onChange={setV} /><Champ label="S · m²" value={surf} onChange={setSurf} /></View>
      {q != null ? <Resultat k="Débit" v={fr(q, 1)} u="m³/h" /> : <Statut type="manq">Données manquantes</Statut>}
      <Text style={s.note}>Suppose une vitesse moyenne pertinente sur la section : une mesure ponctuelle à la bouche ne la donne pas.</Text>
    </Carte>
  </>;
}

function VisuelCompteurs() {
  const [actuel, setActuel] = useState('');
  const [precedent, setPrecedent] = useState('');
  const [q, setQ] = useState('');
  const [dt, setDt] = useState('');
  const e = ecartIndex(actuel, precedent); const p = puissanceHydraulique(q, dt);
  return <Carte titre="Calculs de suivi">
    <View style={s.formule}><Text style={s.formuleText}>Écart d’index = actuel − précédent</Text><Text style={s.formuleText}>ΔT = T départ − T retour</Text><Text style={s.formuleText}>P (kW) ≈ 1,163 × q (m³/h) × ΔT (K)</Text></View>
    <View style={s.ligne}><Champ label="Index actuel" value={actuel} onChange={setActuel} /><Champ label="Index précédent" value={precedent} onChange={setPrecedent} /></View>
    <View style={s.ligne}><Champ label="q · m³/h" value={q} onChange={setQ} /><Champ label="ΔT · K" value={dt} onChange={setDt} /></View>
    <View style={s.ligne}>
      {e ? <Resultat k="Écart d’index" v={fr(e.ecart, 1)} sous={e.negatif ? 'négatif : remplacement ou remise à zéro ?' : null} /> : null}
      {p != null ? <Resultat k="Puissance" v={fr(p, 1)} u="kW" /> : null}
    </View>
    {!e && p == null ? <Statut type="manq">Saisir les valeurs pour calculer</Statut> : null}
    <Text style={s.note}>Approximation pour de l’eau dans un domaine usuel : pas un seuil légal. Le glycol demande ses propres données.</Text>
  </Carte>;
}

function Visuel({ kind, kwInitial }) {
  if (kind === 'ventilation') return <VisuelVentilation kwInitial={kwInitial} />;
  if (kind === 'extincteurs') return <VisuelExtincteurs />;
  if (kind === 'issues') return <VisuelIssues />;
  if (kind === 'gaine') return <VisuelGaine />;
  if (kind === 'chaine') return <VisuelChaine />;
  if (kind === 'ecs') return <VisuelEcs />;
  if (kind === 'baes') return <VisuelBaes />;
  if (kind === 'vmc') return <VisuelVmc />;
  if (kind === 'compteurs') return <VisuelCompteurs />;
  return null;
}

// ---------------------------------------------------------------------------
// Fiche d'une règle
// ---------------------------------------------------------------------------

function Fiche({ theme, action, kwInitial, retour, onRetour }) {
  const [coches, setCoches] = useState({});
  const [ouverte, setOuverte] = useState(!VISUEL_THEME[theme.id]);
  const kind = VISUEL_THEME[theme.id];
  const sources = (theme.sources || []).map((id) => ({ id, ...getSource(id) })).filter((x) => x.url);
  return <>
    {retour ? <TouchableOpacity accessibilityRole="button" onPress={onRetour} style={s.retour}><Text style={s.retourText}>‹ {retour}</Text></TouchableOpacity> : null}
    <View style={s.badges}><Badge theme={theme} /><View style={s.scope}><Text style={s.scopeText}>{theme.scope}</Text></View></View>
    {action ? <View style={s.action}><Text style={s.actionLab}>Pour cette ligne</Text><Text style={s.actionText}>{action}</Text></View> : null}
    {enBref(theme).map((x, i) => <View key={i} style={s.bref}><View style={s.puce} /><Text style={s.brefText}>{x}</Text></View>)}
    {kind ? <Visuel kind={kind} kwInitial={kwInitial} /> : null}
    <Carte titre="À vérifier sur place">
      {theme.checks.map((c, i) => <TouchableOpacity key={i} accessibilityRole="checkbox" accessibilityState={{ checked: !!coches[i] }} onPress={() => setCoches((o) => ({ ...o, [i]: !o[i] }))} style={s.check}>
        <View style={[s.box, coches[i] && s.boxOn]}>{coches[i] ? <CvcIcon name="check" size={14} color={COLORS.white} strokeWidth={3} /> : null}</View>
        <Text style={s.checkText}>{c}</Text>
      </TouchableOpacity>)}
    </Carte>
    <Carte titre="Preuves à recueillir"><View style={s.chips}>{theme.evidence.map((x) => <View key={x} style={s.chip}><Text style={s.chipText}>{x}</Text></View>)}</View></Carte>
    {theme.pending ? <View style={s.pend}><Text style={s.pendText}>À compléter avant décision réglementaire : {theme.pending}</Text></View> : null}
    <View style={s.fiche}>
      <TouchableOpacity accessibilityRole="button" onPress={() => setOuverte((o) => !o)} style={s.ficheHead}><Text style={s.ficheTitre}>Fiche complète</Text><CvcIcon name={ouverte ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.inkSoft} strokeWidth={2.2} /></TouchableOpacity>
      {ouverte ? <View style={s.ficheBody}>
        <Text style={s.ficheTexte}>{theme.detail}</Text>
        {sources.map((x) => <TouchableOpacity key={x.id} accessibilityRole="link" onPress={() => Linking.openURL(x.url).catch(() => {})} style={s.lien}><Text style={s.lienText}>{x.title} ↗</Text></TouchableOpacity>)}
      </View> : null}
    </View>
    <Text style={s.pied}>Aide de lecture : elle ne change aucun avis et ne vaut pas décision de conformité. Dossier du {AIDE_VERSION}.</Text>
  </>;
}

// ---------------------------------------------------------------------------
// Fiche d'un onglet puis fiche d'une règle (feuille du bas)
// ---------------------------------------------------------------------------

export function AideReglementaireHost() {
  const [demande, setDemande] = useState(null);
  const [vue, setVue] = useState(null); // { type: 'onglet' | 'fiche', ... }
  const [kwVisite, setKwVisite] = useState(null);

  useEffect(() => {
    const l = (d) => {
      if (!d) return;
      setDemande(d);
      if (d.themeId) { setVue({ type: 'fiche', themeId: d.themeId, action: '', depuisOnglet: false }); return; }
      if (d.sectionCode) {
        const f = ficheDeLaLigne(d.trameId, d.sectionCode, d.cle);
        if (f) setVue({ type: 'fiche', themeId: f.theme.id, action: f.action, depuisOnglet: false });
        else setVue({ type: 'onglet', panelId: panneauDeSection(d.sectionCode), titre: d.titreOnglet || '' });
      } else setVue({ type: 'onglet', panelId: d.panelId, titre: d.titreOnglet || '' });
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  // Puissance des chaudières : « Puissance totale installée (kW) » de la visite, si lisible.
  useEffect(() => {
    if (!demande?.visiteId) { setKwVisite(null); return undefined; }
    let alive = true;
    getChampsVisite(demande.visiteId).then((rows) => {
      if (!alive) return;
      const ligne = (rows || []).find((r) => /puissance totale install/i.test(String(r.cle || '')));
      setKwVisite(puissanceDeLaVisite(ligne?.valeur));
    }).catch(() => { if (alive) setKwVisite(null); });
    return () => { alive = false; };
  }, [demande?.visiteId]);

  const fermer = () => { setVue(null); setDemande(null); };
  const themes = useMemo(() => (vue?.type === 'onglet' ? themesDeLOnglet(demande?.trameId, vue.panelId) : []), [vue, demande?.trameId]);
  if (!vue) return null;

  const theme = vue.type === 'fiche' ? getTheme(vue.themeId) : null;
  const titre = vue.type === 'fiche' ? (theme?.title || 'Aide') : (vue.titre || 'Règles de l’onglet');
  const sous = vue.type === 'onglet' ? `${themes.length} règle${themes.length > 1 ? 's' : ''} et repères réglementaires` : null;

  return <BottomSheet visible onClose={fermer} title={titre} subtitle={sous} picto="onglets/conf-local" maxHeight="92%">
    {vue.type === 'onglet' ? <>
      <Text style={s.note}>Aide de lecture : elle ne change aucun avis et ne vaut pas décision de conformité.</Text>
      {themes.length ? themes.map((t) => <TouchableOpacity key={t.id} accessibilityRole="button" onPress={() => setVue({ type: 'fiche', themeId: t.id, action: '', depuisOnglet: true, panelId: vue.panelId, titre: vue.titre })} activeOpacity={0.75} style={s.regle}>
        <View style={s.regleTete}><Text style={s.regleTitre}>{t.title}</Text><Badge theme={t} /></View>
        <Text numberOfLines={2} style={s.reglePopup}>{t.popup}</Text>
        <Text style={s.regleGo}>Ouvrir la fiche ›</Text>
      </TouchableOpacity>) : <Text style={s.note}>Aucune fiche pour cet onglet.</Text>}
    </> : null}
    {vue.type === 'fiche' && theme ? <Fiche theme={theme} action={vue.action} kwInitial={kwVisite} retour={vue.depuisOnglet ? (vue.titre || 'Onglet') : null} onRetour={() => setVue({ type: 'onglet', panelId: vue.panelId, titre: vue.titre })} /> : null}
  </BottomSheet>;
}

const s = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: FONTS.bodyBold },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  scope: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: 'rgba(22,21,15,0.06)' },
  scopeText: { fontSize: 11, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  note: { fontSize: 12, lineHeight: 17, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  card: { borderRadius: 18, borderWidth: 1, borderColor: KIT.border, backgroundColor: '#FFFFFF', padding: 12, gap: 10, marginTop: 10 },
  cardLab: { fontSize: 11, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.inkSoft },
  fieldLab: { fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft, marginBottom: 3 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: KIT.border, backgroundColor: KIT.card, paddingHorizontal: 10, fontSize: 15, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  ligne: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statut: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 },
  statutText: { fontSize: 11.5, fontFamily: FONTS.bodyBold },
  res: { flex: 1, minWidth: 100, borderRadius: 14, backgroundColor: COLORS.orangeLight, padding: 9 },
  resK: { fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  resV: { fontSize: 21, fontFamily: FONTS.black, color: COLORS.ink },
  resU: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  formule: { borderRadius: 12, backgroundColor: '#ECE9E1', padding: 9, gap: 3 },
  formuleText: { fontSize: 13, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  reprise: { borderRadius: 12, backgroundColor: KIT.greenBg, padding: 9 },
  repriseText: { fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segBtn: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', backgroundColor: KIT.card },
  segBtnOn: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  segText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  tbl: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  tblK: { width: '34%', fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  tblV: { flex: 1, fontSize: 12.5, fontFamily: FONTS.bodyBold, color: COLORS.ink },
  bref: { flexDirection: 'row', gap: 8, marginTop: 8 },
  puce: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.orange, marginTop: 8 },
  brefText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  action: { borderRadius: 14, backgroundColor: COLORS.orangeLight, padding: 10, marginTop: 10, gap: 3 },
  actionLab: { fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  actionText: { fontSize: 13, lineHeight: 18, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: KIT.border, backgroundColor: KIT.card },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(22,21,15,0.25)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  boxOn: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  checkText: { flex: 1, fontSize: 13.5, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 14, backgroundColor: '#ECE9E1', paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  pend: { borderRadius: 14, backgroundColor: KIT.amberBg, padding: 10, marginTop: 10 },
  pendText: { fontSize: 12.5, lineHeight: 17, fontFamily: FONTS.bodySemi, color: KIT.amber },
  fiche: { marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: KIT.border, backgroundColor: '#FFFFFF' },
  ficheHead: { minHeight: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  ficheTitre: { flex: 1, fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.ink },
  ficheBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  ficheTexte: { fontSize: 13, lineHeight: 19, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  lien: { minHeight: 36, justifyContent: 'center' },
  lienText: { fontSize: 12.5, fontFamily: FONTS.bodyBold, color: '#1D6FB8' },
  pied: { marginTop: 12, fontSize: 11.5, textAlign: 'center', fontFamily: FONTS.bodyMedium, color: COLORS.inkFaint },
  retour: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  retourText: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  regle: { marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: KIT.border, backgroundColor: '#FFFFFF', padding: 12, gap: 6 },
  regleTete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  regleTitre: { flex: 1, fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.ink },
  reglePopup: { fontSize: 12.5, lineHeight: 17, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  regleGo: { fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
});

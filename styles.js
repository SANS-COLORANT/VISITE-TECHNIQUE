/** Couleurs partagées + StyleSheet complet de l'application. */

import { Platform, StyleSheet } from 'react-native';
import { getPrefSync, PREFS } from './uiPrefs.js';
import { FONT_HEADING_BLACK, FONT_HEADING_BOLD, FONT_HEADING_SEMI, FONT_BODY_MEDIUM, FONT_BODY_SEMI, FONT_BODY_BOLD } from './AppFonts.js';

export const FONTS = { black: FONT_HEADING_BLACK, bold: FONT_HEADING_BOLD, semi: FONT_HEADING_SEMI, bodyMedium: FONT_BODY_MEDIUM, bodySemi: FONT_BODY_SEMI, bodyBold: FONT_BODY_BOLD };

export const COLORS = {
  orange: '#F26426', orangeDark: '#D9531A', orangeLight: '#FCE4D3',
  ink: '#1A1A18', inkSoft: '#6B6B66', inkFaint: '#A3A39D',
  line: '#EAE8E2', bg: '#F3F1EC', white: '#FFFFFF',
  green: '#2E7D32', greenBg: '#E8F5E9',
  red: '#B91C1C', redBg: '#FDECEC',
  amber: '#B45309', amberBg: '#FEF3E2',
  // Alias utilisés par des écrans plus anciens (jusqu'ici non définis, donc
  // rendus dans la couleur système par défaut).
  muted: '#6B6B66', primary: '#D9531A', text: '#1A1A18',
};

// Mode « Plein soleil » (Réglages) : textes et traits plus contrastés pour
// l'extérieur ou une chaufferie mal éclairée. Appliqué au démarrage, avant la
// création des styles.
export const SUN_MODE = getPrefSync(PREFS.pleinSoleil, '0') === '1';
if (SUN_MODE) {
  Object.assign(COLORS, {
    ink: '#000000', text: '#000000', inkSoft: '#2F2E2A', muted: '#2F2E2A', inkFaint: '#55544E',
    line: '#C9C4BA', orangeDark: '#B03E0B', bg: '#F7F6F2',
  });
}

export const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: COLORS.red, marginBottom: 8 },
  errorText: { fontSize: 13, color: COLORS.inkSoft, textAlign: 'center' },

  content: { padding: 20 },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: 18, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  statNum: { fontSize: 22, fontWeight: '700', fontFamily: FONTS.black, color: COLORS.ink },
  statLabel: { fontSize: 11.5, color: COLORS.inkSoft, marginTop: 3 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 9 },
  sectionLabel: { fontSize: 12, fontWeight: '700', fontFamily: FONTS.bodyBold, color: COLORS.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  addLink: { fontSize: 12.5, fontWeight: '700', fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },

  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: 16, padding: 14, marginBottom: 9, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.11, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4,
  },
  deleteVisiteBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.redBg, marginLeft: 4 },
  deleteVisiteBtnText: { color: COLORS.red, fontSize: 13, fontWeight: '700' },
  cardTitle: { fontSize: 14.5, fontWeight: '600', fontFamily: FONTS.bold, color: COLORS.ink },
  cardSub: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 },
  chevron: { color: COLORS.orangeDark, fontSize: 22, fontFamily: FONTS.bodySemi, opacity: 0.8 },

  badge: { backgroundColor: 'rgba(242,100,38,0.12)', borderWidth: 1, borderColor: 'rgba(242,100,38,0.28)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  badgeActif: { backgroundColor: COLORS.greenBg },
  badgeInactif: { backgroundColor: COLORS.line },
  badgeTextActif: { color: COLORS.green },
  badgeTextInactif: { color: COLORS.inkSoft },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: COLORS.ink, fontFamily: FONTS.bold },
  emptySub: { fontSize: 12.5, lineHeight: 18, color: COLORS.inkSoft, fontFamily: FONTS.bodyMedium, marginTop: 5, textAlign: 'center', maxWidth: 420 },

  // Fenêtres (DA "Verre chaud") : feuille flottante qui monte du bas, voile
  // fumé chaud, grands rayons. Toutes les modales partagées en héritent.
  modalOverlay: { flex: 1, backgroundColor: 'rgba(22,21,15,0.38)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 12 },
  modalSheet: {
    backgroundColor: '#FBFAF7', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20, width: '100%', maxWidth: 760, maxHeight: '92%',
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 18,
  },
  modalTitle: { fontSize: 19, fontFamily: FONTS.black, color: COLORS.ink, marginBottom: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', borderRadius: 14, backgroundColor: COLORS.white, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  // Barre d'action du bas : transparente, le bouton flotte au-dessus du fond.
  fabBar: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  fabButton: { flex: 0, minHeight: 48, justifyContent: 'center' },
  // Onglets des Réglages en pastilles (même langage que le rail de la visite).
  paramTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: 'transparent', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  paramTab: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: 'rgba(255,255,255,0.72)' },
  paramTabActive: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  paramTabText: { fontSize: 13, color: COLORS.inkSoft, fontFamily: FONTS.bodySemi },
  paramTabTextActive: { color: COLORS.white, fontFamily: FONTS.bodyBold },
  catalogueSearchBox: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, backgroundColor: 'transparent' },
  catalogueSearchInput: { minHeight: 48, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13.5, color: COLORS.ink },
  catalogueTabs: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10, backgroundColor: 'transparent', gap: 8 },
  catalogueTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  catalogueTabActive: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  catalogueTabText: { fontSize: 12.5, color: COLORS.inkSoft, fontFamily: FONTS.bodySemi },
  catalogueTabTextActive: { color: COLORS.white, fontFamily: FONTS.bodyBold },
  catalogueFilters: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingVertical: 10, gap: 7 },
  catalogueFilter: { width: '31.5%', minHeight: 38, paddingHorizontal: 6, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  catalogueFilterActive: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  catalogueFilterText: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '600', textAlign: 'center' },
  catalogueFilterTextActive: { color: COLORS.white },
  catalogueCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 13, padding: 13, marginBottom: 9 },
  catalogueDescription: { fontSize: 11, color: COLORS.inkFaint, marginTop: 4 },
  equipmentIcon: { width: 38, textAlign: 'center', fontSize: 24 },
  brandLogo: { width: 42, height: 34 },
  brandLogoCompact: { width: 52, height: 28 },
  brandFallbackCompact: { width: 42, height: 28, borderRadius: 7 },
  equipmentBrandHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  equipmentLibraryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visitModeCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 18, padding: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.8)' },
  visitModeIcon: { fontSize: 25 },
  visitModeTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink, marginBottom: 3 },
  visitModeText: { fontSize: 11, lineHeight: 16, color: COLORS.inkSoft },
  anomalyBtn: { marginHorizontal: 18, marginBottom: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 13, backgroundColor: '#FFF0EE', alignItems: 'center' },
  anomalyBtnText: { fontSize: 11, fontWeight: '800', fontFamily: FONTS.bodyBold, color: '#B42318' },
  expressHint: { marginHorizontal: 20, marginBottom: 6, fontSize: 9.5, lineHeight: 13, color: COLORS.inkSoft, textAlign: 'center' },
  brandFallback: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.orangeLight },
  brandFallbackText: { fontSize: 12, fontWeight: '800', color: COLORS.orangeDark },
  catalogueChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  catalogueChoice: { width: '48%', minHeight: 38, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  catalogueChoiceActive: { borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight },
  // Boutons (DA "Verre chaud") : pilule orange lumineuse / pilule de verre.
  btnPrimary: {
    flex: 1, minHeight: 50, backgroundColor: COLORS.orange, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.orange, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  btnPrimaryText: { color: COLORS.white, fontFamily: FONTS.bodyBold, fontSize: 14.5 },
  btnSecondary: { flex: 1, minHeight: 50, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', borderRadius: 17, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { color: COLORS.ink, fontFamily: FONTS.bodySemi, fontSize: 14.5 },

  // ---- Écran Visite : topbar + onglets ----
  visiteTopbar: { backgroundColor: 'transparent', paddingTop: 50, paddingHorizontal: 16, position: 'relative' },
  visiteTitle: { fontSize: 17, fontFamily: FONTS.black, color: COLORS.ink },
  visiteHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  noteBtn: { borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  visiteBackBtn: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  visiteBackBtnText: { fontSize: 18, color: COLORS.ink },
  iconAction: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.orangeLight, marginLeft: 8,
  },
  iconActionNeutral: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  iconActionDark: { backgroundColor: COLORS.ink },

  // ---- Header simple (navigation maison, sans @react-navigation) ----
  simpleHeader: { zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'transparent', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12 },
  simpleHeaderBack: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  simpleHeaderBackText: { fontSize: 20, color: COLORS.ink },
  simpleHeaderTitle: { flex: 1, textAlign: 'left', fontSize: 21, fontWeight: '800', fontFamily: FONTS.black, letterSpacing: -0.3, color: COLORS.ink },
  headerPill: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  headerPillText: { fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.ink },
  noteBtnText: { fontSize: 12, color: COLORS.inkSoft, fontWeight: '600' },
  exportBtn: { backgroundColor: COLORS.ink, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8 },
  exportBtnText: { fontSize: 12, color: COLORS.white, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: COLORS.line, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.orange },
  progressPct: { fontSize: 12, fontWeight: '700', fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  tabStrip: { flexDirection: 'row' },
  tabItem: { paddingHorizontal: 12, paddingVertical: 10, marginRight: 2 },
  tabItemText: { fontSize: 12, fontWeight: '500', color: COLORS.inkSoft },
  tabItemTextActive: { color: COLORS.orangeDark, fontWeight: '700' },
  tabUnderline: { height: 3.5, backgroundColor: COLORS.orange, marginTop: 6, borderRadius: 2 },
  tabSep: { width: 1, backgroundColor: COLORS.line, marginHorizontal: 6, marginVertical: 10 },

  panelContent: { padding: 18, paddingBottom: 92 },
  sectionTitle: { fontSize: 14, fontWeight: '600', fontFamily: FONTS.bold, color: COLORS.ink, marginBottom: 10, marginTop: 4 },
  allSBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(46,157,91,0.1)', borderWidth: 1, borderColor: 'rgba(46,157,91,0.35)', marginBottom: 6 },
  allSBtnText: { fontSize: 11.5, fontFamily: FONTS.bodyBold, color: '#227A4A' },
  nextTabCard: { marginTop: 6, marginBottom: 10, gap: 10 },
  nextTabHint: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, textAlign: 'center' },
  sectionCount: { fontSize: 11.5, fontWeight: '700', fontFamily: FONTS.bodyBold, color: COLORS.inkFaint, marginBottom: 10, marginTop: 4 },
  formCard: {
    backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: 18, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.11, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4,
  },

  fieldGroupItem: { backgroundColor: '#FDFCFA', borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(22,21,15,0.08)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
  fieldGroupFirst: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 16 },
  fieldGroupLast: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingBottom: 6, marginBottom: 14 },
  fieldGroupDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(22,21,15,0.1)' },
  fieldBlock: { marginBottom: 14 },
  fieldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.ink, flex: 1 },

  photoBtn: { borderWidth: 1, borderColor: 'rgba(242,100,38,0.35)', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COLORS.orangeLight },
  photoBtnText: { fontSize: 10.5, fontWeight: '600', fontFamily: FONTS.bodySemi, color: COLORS.orangeDark },
  photoBtnTaken: { backgroundColor: COLORS.greenBg, borderColor: COLORS.green },
  photoBtnTextTaken: { color: COLORS.green },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: 48, paddingHorizontal: 18, paddingBottom: 28 },
  photoViewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  photoViewerTitle: { flex: 1, color: COLORS.white, fontSize: 14, fontWeight: '600' },
  photoViewerClose: { color: COLORS.white, fontSize: 22, paddingHorizontal: 10, paddingVertical: 4 },
  photoViewerImage: { flex: 1, width: '100%', borderRadius: 12 },
  photoViewerNav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  photoViewerNavBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  photoViewerNavText: { color: COLORS.white, fontSize: 12.5, fontWeight: '600' },
  photoViewerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  photoViewerSecondary: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  photoViewerSecondaryText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  photoViewerPrimary: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center' },
  photoViewerPrimaryText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  photoRequiredBox: { marginTop: 8, alignSelf: 'flex-start' },

  // Contrôle (DA "Verre chaud") : libellé sur sa propre ligne, puis l'avis en
  // segments pleine largeur faciles à toucher sur le terrain.
  controlRow: { paddingVertical: 2 },
  controlTop: { flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 4 },
  controlLabel: { fontSize: 14, fontWeight: '600', fontFamily: FONTS.bodySemi, color: COLORS.ink, lineHeight: 19 },
  avisGroup: { flexDirection: 'row', gap: 5 },
  avisChip: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: 'rgba(255,255,255,0.8)' },
  avisChipText: { fontSize: 12, fontWeight: '700', fontFamily: FONTS.bodyBold, color: COLORS.inkSoft },

  criterePanel: { backgroundColor: COLORS.redBg, borderWidth: 1, borderColor: '#F4C7C7', borderRadius: 14, padding: 12, marginTop: 8 },
  criterePanelLabel: { fontSize: 10, fontWeight: '700', fontFamily: FONTS.bodyBold, letterSpacing: 0.5, color: COLORS.red, textTransform: 'uppercase', marginBottom: 7 },
  reserveFieldLabel: { fontSize: 10.5, fontFamily: FONTS.bodyBold, letterSpacing: 0.3, color: COLORS.inkSoft, marginBottom: -3, marginTop: 2 },
  critereChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  critereChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: COLORS.red, backgroundColor: COLORS.white },
  critereChipPicked: { backgroundColor: COLORS.red },
  critereChipCustom: { borderStyle: 'dashed' },
  critereChipText: { fontSize: 11.5, fontWeight: '600', fontFamily: FONTS.bodySemi, color: COLORS.red },
  critereChipTextPicked: { color: COLORS.white },
  prestationResult: { backgroundColor: '#FFF8F6', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(185,28,28,0.4)', padding: 10, marginTop: 9 },
  prestationTxt: { fontSize: 12, color: COLORS.ink, lineHeight: 17, marginBottom: 5 },
  prestationMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  prestationMetaTxt: { fontSize: 10, color: COLORS.inkSoft },
  bold: { color: COLORS.ink, fontWeight: '700' },

  addBtn: { borderWidth: 1.5, borderColor: COLORS.orange, borderStyle: 'dashed', backgroundColor: COLORS.orangeLight, borderRadius: 14, padding: 13, alignItems: 'center', marginBottom: 14 },
  addBtnText: { fontSize: 12.5, fontWeight: '600', fontFamily: FONTS.bodySemi, color: COLORS.orangeDark },
  removeLink: { fontSize: 11, color: COLORS.inkFaint, fontWeight: '500' },

  reseauHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  reseauNomInput: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.orangeDark, textTransform: 'uppercase', padding: 0 },

  // ---- Sélecteur numérique +/- ----
  // Mesures : grand chiffre lisible et boutons −/+ larges (saisie avec des gants).
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 52, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242,100,38,0.12)', borderWidth: 1, borderColor: 'rgba(242,100,38,0.3)' },
  stepperBtnText: { fontSize: 22, fontWeight: '800', fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  stepperValBox: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  stepperValText: { fontSize: 20, fontWeight: '800', fontFamily: FONTS.black, color: COLORS.ink, fontVariant: ['tabular-nums'] },

  // ---- Sélecteur par chips ----
  chipSelectRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipOpt: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: COLORS.white },
  chipOptPicked: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  chipOptText: { fontSize: 12, color: COLORS.ink, fontWeight: '500', fontFamily: FONTS.bodyMedium },
  chipOptTextPicked: { color: COLORS.white, fontWeight: '600', fontFamily: FONTS.bodySemi },
  chipOptAddNew: { borderStyle: 'dashed', borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight },
  chipOptAddNewText: { fontSize: 12, color: COLORS.orangeDark, fontWeight: '600', fontFamily: FONTS.bodySemi },
  chipRowWithArrows: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  chipArrowBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipArrowBtnText: { fontSize: 18, color: COLORS.orangeDark, fontWeight: '700' },
  typeaheadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  compteurRow: { backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 14, padding: 12, marginBottom: 10 },
  compteurRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  compteurCatInput: { flex: 1, fontWeight: '600', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5 },
  compteurRowBody: { gap: 8 },
  compteurValInput: { borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5 },
  uniteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  uniteChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: COLORS.white },
  uniteChipSelected: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  uniteChipText: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '600' },
  uniteChipTextSelected: { color: COLORS.white },

  // ---- Molette numérique : saisie clavier directe ----
  stepperInputLibre: { flex: 1, minHeight: 48, textAlign: 'center', fontSize: 20, fontWeight: '800', fontFamily: FONTS.black, color: COLORS.ink, borderWidth: 1.5, borderColor: COLORS.orange, borderRadius: 14, paddingVertical: 8, backgroundColor: COLORS.white },

  // ---- Autocomplétion (TypeAheadInput) ----
  typeaheadSuggestions: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 13, marginTop: 4, overflow: 'hidden' },
  typeaheadSuggestionRow: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(22,21,15,0.08)' },
  typeaheadSuggestionText: { fontSize: 13, color: COLORS.ink },

  // ---- Accueil : bouton Paramètres ----
  homeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 8, backgroundColor: 'transparent' },
  importExcelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 13, backgroundColor: COLORS.orangeLight },
  importExcelBtnText: { fontSize: 12.5, color: COLORS.orangeDark, fontWeight: '700' },
  parametresBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  parametresBtnText: { fontSize: 13, color: COLORS.inkSoft, fontWeight: '600' },
  importFileName: { fontSize: 11, color: COLORS.inkFaint, marginBottom: 5 },
  importSiteTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  importStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  importStat: { width: '31%', backgroundColor: COLORS.bg, borderRadius: 13, paddingVertical: 10, alignItems: 'center' },
  importStatNumber: { fontSize: 17, fontWeight: '700', color: COLORS.orangeDark },
  importStatLabel: { fontSize: 9.5, color: COLORS.inkSoft, marginTop: 2 },
  importHint: { fontSize: 10.5, lineHeight: 15, color: COLORS.inkFaint, marginTop: 14 },

  // ---- Bibliothèque de réserves (choix rapide) ----
  biblioRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(22,21,15,0.08)' },
  biblioRowTitle: { fontSize: 13.5, fontWeight: '600', color: COLORS.ink },
  biblioRowSub: { fontSize: 11.5, color: COLORS.inkSoft, marginTop: 2 },
  biblioShortcutBtn: { backgroundColor: COLORS.orangeLight, borderRadius: 13, paddingVertical: 9, alignItems: 'center', marginBottom: 12 },
  biblioShortcutBtnText: { fontSize: 12.5, color: COLORS.orangeDark, fontWeight: '600' },

  materielTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  persistentEquipmentBadge: { alignSelf: 'flex-start', marginTop: 7, marginBottom: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: COLORS.greenBg },
  persistentEquipmentBadgeText: { fontSize: 10.5, fontWeight: '700', color: COLORS.green },

  totalsBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  totalsCard: { flex: 1, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: 16, padding: 13, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  totalsNum: { fontSize: 18, fontWeight: '700', fontFamily: FONTS.black, color: COLORS.ink },
  totalsLabel: { fontSize: 10, color: COLORS.inkSoft, marginTop: 2 },
  remarqueCard: { backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  remarqueTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  remarquePoste: { fontSize: 10, fontWeight: '700', color: COLORS.orangeDark, textTransform: 'uppercase' },
  remarqueEstim: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  remarqueTxt: { fontSize: 12.5, color: COLORS.ink, lineHeight: 18, marginBottom: 8 },
  remarqueMeta: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  remarqueMetaTxt: { fontSize: 11, color: COLORS.inkSoft },
  remarqueLinkBtn: { marginTop: 11, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.orangeLight, alignSelf: 'flex-start' },
  remarqueLinkBtnText: { fontSize: 11, color: COLORS.orangeDark, fontWeight: '700' },
  remarqueTabsScroll: { marginVertical: 12, flexGrow: 0 },
  remarqueTabChoice: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', marginRight: 7, backgroundColor: COLORS.white },
  remarqueTabChoiceActive: { borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight },
  remarqueTabChoiceText: { fontSize: 11, color: COLORS.inkSoft },
  remarqueTabChoiceTextActive: { color: COLORS.orangeDark, fontWeight: '700' },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: '18%', aspectRatio: 1, borderRadius: 13, overflow: 'hidden', backgroundColor: COLORS.line, borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)' },
  photoThumbImg: { width: '100%', height: '100%' },
  photoAddTile: { width: '18%', aspectRatio: 1, borderRadius: 13, borderWidth: 1.5, borderColor: COLORS.orange, borderStyle: 'dashed', backgroundColor: COLORS.orangeLight, alignItems: 'center', justifyContent: 'center' },
  photoAddTileText: { fontSize: 22, color: COLORS.inkFaint },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
});

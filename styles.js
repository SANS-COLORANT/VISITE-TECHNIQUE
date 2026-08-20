/** Couleurs partagées + StyleSheet complet de l'application. */

import { StyleSheet } from 'react-native';

export const COLORS = {
  orange: '#F26426', orangeDark: '#D9531A', orangeLight: '#FFF1EA',
  ink: '#1A1A18', inkSoft: '#6B6B66', inkFaint: '#A3A39D',
  line: '#EAE8E2', bg: '#FAFAF8', white: '#FFFFFF',
  green: '#2E7D32', greenBg: '#E8F5E9',
  red: '#B91C1C', redBg: '#FDECEC',
  amber: '#B45309', amberBg: '#FEF3E2',
};

export const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: COLORS.red, marginBottom: 8 },
  errorText: { fontSize: 13, color: COLORS.inkSoft, textAlign: 'center' },

  content: { padding: 20 },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700', color: COLORS.ink },
  statLabel: { fontSize: 11.5, color: COLORS.inkSoft, marginTop: 3 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 9 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  addLink: { fontSize: 12.5, fontWeight: '700', color: COLORS.orangeDark },

  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 14, marginBottom: 9, gap: 10 },
  deleteVisiteBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.redBg, marginLeft: 4 },
  deleteVisiteBtnText: { color: COLORS.red, fontSize: 13, fontWeight: '700' },
  cardTitle: { fontSize: 14.5, fontWeight: '600', color: COLORS.ink },
  cardSub: { fontSize: 12, color: COLORS.inkSoft, marginTop: 2 },
  chevron: { color: COLORS.inkFaint, fontSize: 20 },

  badge: { backgroundColor: COLORS.orangeLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.orangeDark },
  badgeActif: { backgroundColor: COLORS.greenBg },
  badgeInactif: { backgroundColor: COLORS.line },
  badgeTextActif: { color: COLORS.green },
  badgeTextInactif: { color: COLORS.inkSoft },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: COLORS.inkSoft, fontWeight: '600' },
  emptySub: { fontSize: 12, color: COLORS.inkFaint, marginTop: 4, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalSheet: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, width: '85%' },
  modalTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.ink },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnPrimary: { flex: 1, backgroundColor: COLORS.orange, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: COLORS.white, fontWeight: '600', fontSize: 13.5 },
  btnSecondary: { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnSecondaryText: { color: COLORS.ink, fontWeight: '600', fontSize: 13.5 },

  // ---- Écran Visite : topbar + onglets ----
  visiteTopbar: { backgroundColor: COLORS.white, paddingTop: 50, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  visiteHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  noteBtn: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  visiteBackBtn: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  visiteBackBtnText: { fontSize: 16, color: COLORS.ink },

  // ---- Header simple (navigation maison, sans @react-navigation) ----
  simpleHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  simpleHeaderBack: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  simpleHeaderBackText: { fontSize: 20, color: COLORS.ink },
  simpleHeaderTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: COLORS.ink },
  noteBtnText: { fontSize: 12, color: COLORS.inkSoft, fontWeight: '600' },
  exportBtn: { backgroundColor: COLORS.ink, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8 },
  exportBtnText: { fontSize: 12, color: COLORS.white, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: COLORS.line, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.orange },
  progressPct: { fontSize: 12, fontWeight: '700', color: COLORS.orangeDark },
  tabStrip: { flexDirection: 'row' },
  tabItem: { paddingHorizontal: 12, paddingVertical: 10, marginRight: 2 },
  tabItemText: { fontSize: 12, fontWeight: '500', color: COLORS.inkSoft },
  tabItemTextActive: { color: COLORS.orangeDark, fontWeight: '700' },
  tabUnderline: { height: 2.5, backgroundColor: COLORS.orange, marginTop: 6, borderRadius: 2 },
  tabSep: { width: 1, backgroundColor: COLORS.line, marginHorizontal: 6, marginVertical: 10 },

  panelContent: { padding: 18, paddingBottom: 60 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.ink, marginBottom: 10, marginTop: 4 },
  formCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 16, marginBottom: 14 },

  fieldBlock: { marginBottom: 14 },
  fieldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.ink, flex: 1 },

  photoBtn: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COLORS.white },
  photoBtnText: { fontSize: 10.5, fontWeight: '600', color: COLORS.inkFaint },
  photoBtnTaken: { backgroundColor: COLORS.greenBg, borderColor: COLORS.green },
  photoBtnTextTaken: { color: COLORS.green },
  photoRequiredBox: { marginTop: 8, alignSelf: 'flex-start' },

  controlRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  controlTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 },
  controlLabel: { fontSize: 13, fontWeight: '500', color: COLORS.ink, flex: 1 },
  avisGroup: { flexDirection: 'row', gap: 4 },
  avisChip: { width: 42, alignItems: 'center', paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  avisChipText: { fontSize: 10.5, fontWeight: '700', color: COLORS.inkSoft },

  criterePanel: { backgroundColor: COLORS.redBg, borderWidth: 1, borderColor: '#F4C7C7', borderRadius: 9, padding: 10, marginTop: 4 },
  criterePanelLabel: { fontSize: 10, fontWeight: '700', color: COLORS.red, textTransform: 'uppercase', marginBottom: 6 },
  critereChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  critereChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: COLORS.red, backgroundColor: COLORS.white },
  critereChipPicked: { backgroundColor: COLORS.red },
  critereChipCustom: { borderStyle: 'dashed' },
  critereChipText: { fontSize: 11, fontWeight: '600', color: COLORS.red },
  critereChipTextPicked: { color: COLORS.white },
  prestationResult: { backgroundColor: COLORS.white, borderRadius: 7, padding: 9, marginTop: 8 },
  prestationTxt: { fontSize: 12, color: COLORS.ink, lineHeight: 17, marginBottom: 5 },
  prestationMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  prestationMetaTxt: { fontSize: 10, color: COLORS.inkSoft },
  bold: { color: COLORS.ink, fontWeight: '700' },

  addBtn: { borderWidth: 1.5, borderColor: COLORS.orange, borderStyle: 'dashed', backgroundColor: COLORS.orangeLight, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 14 },
  addBtnText: { fontSize: 12.5, fontWeight: '600', color: COLORS.orangeDark },
  removeLink: { fontSize: 11, color: COLORS.inkFaint, fontWeight: '500' },

  reseauHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  reseauNomInput: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.orangeDark, textTransform: 'uppercase', padding: 0 },

  // ---- Sélecteur numérique +/- ----
  stepperRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, overflow: 'hidden' },
  stepperBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  stepperBtnText: { fontSize: 20, fontWeight: '700', color: COLORS.orangeDark },
  stepperValBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepperValText: { fontSize: 14, fontWeight: '700', color: COLORS.ink },

  // ---- Sélecteur par chips ----
  chipSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipOpt: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  chipOptPicked: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  chipOptText: { fontSize: 12, color: COLORS.ink, fontWeight: '500' },
  chipOptTextPicked: { color: COLORS.white, fontWeight: '600' },
  chipOptAddNew: { borderStyle: 'dashed', borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight },
  chipOptAddNewText: { fontSize: 12, color: COLORS.orangeDark, fontWeight: '600' },

  compteurRow: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 12, marginBottom: 10 },
  compteurRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  compteurCatInput: { flex: 1, fontWeight: '600', borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5 },
  compteurRowBody: { gap: 8 },
  compteurValInput: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5 },
  uniteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  uniteChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  uniteChipSelected: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  uniteChipText: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '600' },
  uniteChipTextSelected: { color: COLORS.white },

  // ---- Molette numérique : saisie clavier directe ----
  stepperInputLibre: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: COLORS.ink, borderWidth: 1, borderColor: COLORS.orange, borderRadius: 9, paddingVertical: 8 },

  // ---- Autocomplétion (TypeAheadInput) ----
  typeaheadSuggestions: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, marginTop: 4, overflow: 'hidden' },
  typeaheadSuggestionRow: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  typeaheadSuggestionText: { fontSize: 13, color: COLORS.ink },

  // ---- Accueil : bouton Paramètres ----
  homeTopRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 6, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  parametresBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  parametresBtnText: { fontSize: 13, color: COLORS.inkSoft, fontWeight: '600' },

  // ---- Bibliothèque de réserves (choix rapide) ----
  biblioRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  biblioRowTitle: { fontSize: 13.5, fontWeight: '600', color: COLORS.ink },
  biblioRowSub: { fontSize: 11.5, color: COLORS.inkSoft, marginTop: 2 },

  materielTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  totalsBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  totalsCard: { flex: 1, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 12, alignItems: 'center' },
  totalsNum: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  totalsLabel: { fontSize: 10, color: COLORS.inkSoft, marginTop: 2 },
  remarqueCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 14, marginBottom: 10 },
  remarqueTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  remarquePoste: { fontSize: 10, fontWeight: '700', color: COLORS.orangeDark, textTransform: 'uppercase' },
  remarqueEstim: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  remarqueTxt: { fontSize: 12.5, color: COLORS.ink, lineHeight: 18, marginBottom: 8 },
  remarqueMeta: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  remarqueMetaTxt: { fontSize: 11, color: COLORS.inkSoft },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: '18%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: COLORS.line },
  photoThumbImg: { width: '100%', height: '100%' },
  photoAddTile: { width: '18%', aspectRatio: 1, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoAddTileText: { fontSize: 22, color: COLORS.inkFaint },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
});

import { StyleSheet } from 'react-native';
import { FONTS } from './styles.js';

export const MISSION_COLORS = Object.freeze({
  accent: '#2F7D58',
  accentDark: '#1F5F43',
  accentStrong: '#174B35',
  accentLight: '#E8F5ED',
  accentSoft: '#F3F9F5',
  accentLine: '#CDE2D5',
  accentLineStrong: '#AFCFBD',
  bg: '#F7FAF8',
  card: 'rgba(255,255,255,0.84)',
});

export const missionStyles = StyleSheet.create({
  screen: { backgroundColor: 'transparent' },
  header: { backgroundColor: 'transparent', borderBottomColor: 'transparent' },
  headerTitle: { color: MISSION_COLORS.accentStrong, fontFamily: FONTS.bold },
  headerBackText: { color: MISSION_COLORS.accentDark },
  title: { color: MISSION_COLORS.accentStrong },
  sectionLabel: { color: MISSION_COLORS.accentDark },
  card: { borderColor: 'rgba(47,125,88,0.16)' },
  infoBox: { backgroundColor: MISSION_COLORS.accentSoft },
  input: { borderColor: 'rgba(47,125,88,0.22)', backgroundColor: '#FFFFFF' },
  primaryButton: { backgroundColor: MISSION_COLORS.accent, shadowColor: MISSION_COLORS.accent },
  primaryButtonText: { color: '#FFFFFF' },
  secondaryButton: { backgroundColor: 'rgba(255,255,255,0.85)', borderColor: 'rgba(47,125,88,0.28)' },
  secondaryButtonText: { color: MISSION_COLORS.accentDark },
  chipSelected: { borderColor: MISSION_COLORS.accent, backgroundColor: MISSION_COLORS.accentLight },
  chipSelectedText: { color: MISSION_COLORS.accentDark },
  modalSheet: { borderWidth: 1, borderColor: MISSION_COLORS.accentLine },
  accentText: { color: MISSION_COLORS.accentDark },
  statBox: { backgroundColor: 'rgba(232,245,237,0.8)' },
});

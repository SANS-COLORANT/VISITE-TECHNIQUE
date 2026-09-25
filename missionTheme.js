import { StyleSheet } from 'react-native';

export const MISSION_COLORS = Object.freeze({
  accent: '#2F7D58',
  accentDark: '#1F5F43',
  accentStrong: '#174B35',
  accentLight: '#E8F5ED',
  accentSoft: '#F3F9F5',
  accentLine: '#CDE2D5',
  accentLineStrong: '#AFCFBD',
  bg: '#F7FAF8',
  card: '#FFFFFF'
});

export const missionStyles = StyleSheet.create({
  screen: { backgroundColor: MISSION_COLORS.bg },
  header: { backgroundColor: MISSION_COLORS.accentSoft, borderBottomColor: MISSION_COLORS.accentLine },
  headerTitle: { color: MISSION_COLORS.accentStrong, fontWeight: '800' },
  headerBackText: { color: MISSION_COLORS.accentDark },
  title: { color: MISSION_COLORS.accentStrong },
  sectionLabel: { color: MISSION_COLORS.accentDark },
  card: { borderColor: MISSION_COLORS.accentLine },
  infoBox: { backgroundColor: MISSION_COLORS.accentSoft },
  input: { borderColor: MISSION_COLORS.accentLine, backgroundColor: MISSION_COLORS.card },
  primaryButton: { backgroundColor: MISSION_COLORS.accent },
  primaryButtonText: { color: '#FFFFFF' },
  secondaryButton: { backgroundColor: '#FFFFFF', borderColor: MISSION_COLORS.accentLineStrong },
  secondaryButtonText: { color: MISSION_COLORS.accentDark },
  chipSelected: { borderColor: MISSION_COLORS.accent, backgroundColor: MISSION_COLORS.accentLight },
  chipSelectedText: { color: MISSION_COLORS.accentDark },
  modalSheet: { borderWidth: 1, borderColor: MISSION_COLORS.accentLine },
  accentText: { color: MISSION_COLORS.accentDark },
  statBox: { backgroundColor: MISSION_COLORS.accentSoft }
});

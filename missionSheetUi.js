/**
 * Fiche Mission modulable — briques d'interface partagées.
 *
 * Échelle typographique terrain (jamais sous 12 dp), cibles tactiles de
 * 48 dp (56 dp en mode gants), surfaces « Verre chaud » sans élévation
 * Android sur fond translucide, pictogrammes CvcIcon uniquement.
 */
import React, { createContext, useContext } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';

export const SHEET_TYPE = Object.freeze({
  title: { fontFamily: FONTS.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: MISSION_COLORS.accentStrong },
  blockTitle: { fontFamily: FONTS.bold, fontSize: 15.5, lineHeight: 20, letterSpacing: -0.15, color: COLORS.ink },
  body: { fontFamily: FONTS.bodyMedium, fontSize: 14, lineHeight: 19, color: COLORS.ink },
  bodyStrong: { fontFamily: FONTS.bodySemi, fontSize: 14, lineHeight: 19, color: COLORS.ink },
  meta: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, lineHeight: 17, color: COLORS.inkSoft },
  label: { fontFamily: FONTS.bodyBold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: MISSION_COLORS.accentDark },
  number: { fontFamily: FONTS.black, fontSize: 22, lineHeight: 26, color: MISSION_COLORS.accentStrong },
});

export const SHEET_TONES = Object.freeze({
  neutral: { fg: COLORS.inkSoft, bg: 'rgba(20,32,44,0.06)', line: 'rgba(20,32,44,0.10)' },
  accent: { fg: MISSION_COLORS.accentDark, bg: MISSION_COLORS.accentLight, line: MISSION_COLORS.accentLine },
  warning: { fg: '#8A5B14', bg: '#FFF4DF', line: '#F1D9A8' },
  danger: { fg: '#A23B2A', bg: '#FDECE8', line: '#F3C7BD' },
  info: { fg: '#1F5D7A', bg: '#E8F3F8', line: '#C5DFEA' },
});

const ErgoContext = createContext({ gloves: false, target: 48, gap: 8 });

export function SheetErgoProvider({ gloves = false, children }) {
  const value = { gloves, target: gloves ? 56 : 48, gap: gloves ? 12 : 8 };
  return <ErgoContext.Provider value={value}>{children}</ErgoContext.Provider>;
}

export function useSheetErgo() {
  return useContext(ErgoContext);
}

const HIT = { top: 6, bottom: 6, left: 6, right: 6 };

/** Cadre d'un bloc de la fiche. Appui long sur le titre → mode Personnaliser. */
export function SheetCard({ title, icon, count = null, countTone = 'accent', action = null, onLongPressTitle = null, children, style, dense = false }) {
  const ergo = useSheetErgo();
  const tone = SHEET_TONES[countTone] || SHEET_TONES.accent;
  return (
    <View style={[s.card, dense && s.cardDense, style]}>
      <View style={s.cardHead}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!onLongPressTitle}
          onLongPress={onLongPressTitle}
          delayLongPress={450}
          accessibilityRole="header"
          accessibilityHint={onLongPressTitle ? 'Appui long pour personnaliser la fiche' : undefined}
          style={s.cardTitleWrap}
        >
          {icon ? <CvcIcon name={icon} size={20} color={MISSION_COLORS.accent} strokeWidth={2} /> : null}
          <Text style={[SHEET_TYPE.blockTitle, s.cardTitle]} numberOfLines={2}>{title}</Text>
          {count != null ? <View style={[s.count, { backgroundColor: tone.bg }]}><Text style={[s.countText, { color: tone.fg }]}>{count}</Text></View> : null}
        </TouchableOpacity>
        {action ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={action.accessibilityLabel || action.label} onPress={action.onPress} hitSlop={HIT} style={[s.headAction, { minHeight: ergo.target }]}>
            <Text style={s.headActionText}>{action.label}</Text>
            <CvcIcon name="chevron-right" size={16} color={MISSION_COLORS.accent} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function SheetIconButton({ icon, label, onPress, disabled = false, tone = 'accent', filled = false, size = null }) {
  const ergo = useSheetErgo();
  const t = SHEET_TONES[tone] || SHEET_TONES.accent;
  const box = size || ergo.target;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.iconBtn, { width: box, height: box, borderColor: t.line, backgroundColor: filled ? t.bg : 'rgba(255,255,255,0.9)', opacity: disabled ? 0.35 : 1 }]}
    >
      <CvcIcon name={icon} size={Math.round(box * 0.44)} color={t.fg} strokeWidth={2.1} />
    </TouchableOpacity>
  );
}

export function SheetChip({ label, icon = null, active = false, onPress, tone = 'accent', accessibilityLabel }) {
  const ergo = useSheetErgo();
  const t = SHEET_TONES[tone] || SHEET_TONES.accent;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, { minHeight: ergo.target - 4, borderColor: active ? MISSION_COLORS.accent : t.line, backgroundColor: active ? MISSION_COLORS.accentLight : 'rgba(255,255,255,0.9)' }]}
    >
      {icon ? <CvcIcon name={icon} size={17} color={active ? MISSION_COLORS.accentDark : t.fg} strokeWidth={2.1} /> : null}
      <Text style={[s.chipText, { color: active ? MISSION_COLORS.accentStrong : COLORS.ink }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Bouton secondaire (contour). Le seul bouton dégradé de l'écran est l'action principale. */
export function SheetButton({ label, icon = null, onPress, disabled = false, tone = 'accent', style, busy = false }) {
  const ergo = useSheetErgo();
  const t = SHEET_TONES[tone] || SHEET_TONES.accent;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[s.button, { minHeight: ergo.target, borderColor: t.line, opacity: disabled ? 0.45 : 1 }, style]}
    >
      {icon ? <CvcIcon name={icon} size={19} color={t.fg} strokeWidth={2.1} /> : null}
      <Text style={[s.buttonText, { color: t.fg }]} numberOfLines={1}>{busy ? 'Patiente…' : label}</Text>
    </TouchableOpacity>
  );
}

export function StatusPill({ label, tone = 'neutral' }) {
  const t = SHEET_TONES[tone] || SHEET_TONES.neutral;
  return <View style={[s.pill, { backgroundColor: t.bg, borderColor: t.line }]}><Text style={[s.pillText, { color: t.fg }]} numberOfLines={1}>{label}</Text></View>;
}

/** Un bloc vide se replie en une ligne fine, avec l'action qui le remplit. */
export function SheetEmptyLine({ icon = 'check', text, actionLabel = null, onAction = null }) {
  const ergo = useSheetErgo();
  return (
    <View style={s.empty}>
      <CvcIcon name={icon} size={18} color={MISSION_COLORS.accentLineStrong} strokeWidth={2} />
      <Text style={[SHEET_TYPE.meta, { flex: 1 }]}>{text}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity accessibilityRole="button" onPress={onAction} hitSlop={HIT} style={{ minHeight: ergo.target, justifyContent: 'center' }}>
          <Text style={s.headActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Ligne de liste tactile : pictogramme, texte, méta, élément à droite. */
export function SheetRow({ icon, iconTone = 'accent', title, meta = null, right = null, onPress = null, accessibilityLabel, last = false }) {
  const ergo = useSheetErgo();
  const t = SHEET_TONES[iconTone] || SHEET_TONES.accent;
  const Body = onPress ? TouchableOpacity : View;
  return (
    <View style={[s.row, !last && s.rowLine]}>
      <Body accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={accessibilityLabel} onPress={onPress} style={[s.rowMain, { minHeight: ergo.target + 4 }]}>
        {icon ? <View style={[s.rowIcon, { backgroundColor: t.bg }]}><CvcIcon name={icon} size={18} color={t.fg} strokeWidth={2.1} /></View> : null}
        <View style={{ flex: 1 }}>
          <Text style={SHEET_TYPE.bodyStrong} numberOfLines={2}>{title}</Text>
          {meta ? <Text style={[SHEET_TYPE.meta, { marginTop: 2 }]} numberOfLines={2}>{meta}</Text> : null}
        </View>
      </Body>
      {right}
    </View>
  );
}

export function ProgressBar({ pct = 0, tone = 'accent' }) {
  const t = SHEET_TONES[tone] || SHEET_TONES.accent;
  const width = `${Math.max(0, Math.min(100, Math.round(pct * 100)))}%`;
  return <View style={s.bar}><View style={[s.barFill, { width, backgroundColor: tone === 'accent' ? MISSION_COLORS.accent : t.fg }]} /></View>;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  // Les dates SQLite « AAAA-MM-JJ HH:MM:SS » sont en UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSheetDate(value, { withYear = false } = {}) {
  const date = parseDate(value);
  if (!date) return '';
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return withYear || date.getFullYear() !== new Date().getFullYear() ? `${base} ${date.getFullYear()}` : base;
}

export function formatSheetAgo(value, now = Date.now()) {
  const date = parseDate(value);
  if (!date) return '';
  const minutes = Math.max(0, Math.round((now - date.getTime()) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return `le ${formatSheetDate(value)}`;
}

export function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count > 1 ? pluralLabel : singular}`;
}

export const sheetStyles = StyleSheet.create({
  surface: {
    backgroundColor: MISSION_COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MISSION_COLORS.accentLine,
    borderRadius: 20,
  },
});

const s = StyleSheet.create({
  card: { ...sheetStyles.surface, padding: 16, gap: 12 },
  cardDense: { paddingVertical: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  cardTitle: { flexShrink: 1 },
  count: { minWidth: 26, height: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: FONTS.bold, fontSize: 13 },
  headAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 8 },
  headActionText: { color: MISSION_COLORS.accent, fontFamily: FONTS.bodyBold, fontSize: 13.5 },
  iconBtn: { borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: FONTS.bodySemi, fontSize: 13.5 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.92)' },
  buttonText: { fontFamily: FONTS.bodyBold, fontSize: 14 },
  pill: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontFamily: FONTS.bodyBold, fontSize: 12 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: MISSION_COLORS.accentLine },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(20,32,44,0.08)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
});

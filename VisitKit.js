/**
 * Socle d'interface des onglets de visite (refonte du build 661, voir
 * docs/refonte-visite-661/README.md §4) — composants partagés par tous les
 * onglets, sur la DA « Verre chaud » :
 *
 * - SectionCard / SectionBanner : rubrique en carte à bannière (pictogramme,
 *   titre, avancement, action). Toucher le titre replie / déplie.
 * - useSectionsOuvertes : mémoire des rubriques ouvertes, tout est FERMÉ au
 *   départ, l'état est gardé pendant la session pour chaque visite.
 * - ChoiceField : un paramètre à choix se referme sur la valeur choisie
 *   (orange, bleu-vert pour l'eau) ; on le rouvre pour retirer ou changer ;
 *   choix multiples validés par « OK » ; « + Autre » pour une saisie libre.
 * - ValueTile : tuile − / + dont le premier appui part d'une valeur utile.
 * - FilterSeg, BottomSheet, ActionMenu, InlineRename, UnitPill, MarqueeText.
 *
 * Aucun composant n'écrit en base : ils reçoivent valeurs et callbacks des
 * panneaux existants, les clés de données ne changent pas.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Alert, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { COLORS, FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { Picto, PICTO_COLORS } from './MetraPictos.js';
import { hapticTick } from './fieldFeedback.js';

export const KIT = Object.freeze({
  card: '#FDFCFA',
  border: 'rgba(22,21,15,0.08)',
  water: PICTO_COLORS.water,
  waterLight: '#DDF0F2',
  green: '#2E9D5B',
  greenBg: '#E6F4EC',
  red: '#C23B2E',
  redBg: '#FBE9E7',
  amber: '#B45309',
  amberBg: '#FEF3E2',
});

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

export function teinte(water) {
  return water
    ? { solid: KIT.water, dark: '#0B6372', light: KIT.waterLight, gradient: ['#1594A6', '#0B6372'] }
    : { solid: COLORS.orange, dark: COLORS.orangeDark, light: COLORS.orangeLight, gradient: [COLORS.orange, COLORS.orangeDark] };
}

// ---------------------------------------------------------------------------
// Mémoire des rubriques ouvertes (fermées par défaut)
// ---------------------------------------------------------------------------

const OUVERTES = new Map();

/**
 * `scope` = identifiant stable (visite + onglet). Retourne
 * { isOpen(key), toggle(key), open(keys), closeAll() }.
 */
export function useSectionsOuvertes(scope) {
  const [, setTick] = useState(0);
  const set = useMemo(() => {
    if (!OUVERTES.has(scope)) OUVERTES.set(scope, new Set());
    return OUVERTES.get(scope);
  }, [scope]);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  const isOpen = useCallback((key) => set.has(String(key)), [set]);
  const toggle = useCallback((key) => {
    const k = String(key);
    if (set.has(k)) set.delete(k); else set.add(k);
    hapticTick();
    rerender();
  }, [set, rerender]);
  const open = useCallback((keys) => {
    let changed = false;
    for (const k of keys || []) { if (!set.has(String(k))) { set.add(String(k)); changed = true; } }
    if (changed) rerender();
  }, [set, rerender]);
  const closeAll = useCallback(() => { if (set.size) { set.clear(); rerender(); } }, [set, rerender]);
  return { isOpen, toggle, open, closeAll };
}

// ---------------------------------------------------------------------------
// Bannière de rubrique
// ---------------------------------------------------------------------------

export function PictoOrb({ picto, water, size = 36, active }) {
  const t = teinte(water);
  if (active) {
    return (
      <LinearGradient colors={t.gradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.orb, { width: size, height: size, borderRadius: Math.round(size * 0.32), borderColor: 'transparent' }]}>
        <Picto name={picto} size={Math.round(size * 0.62)} mono={COLORS.white} />
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={[t.light, '#FFF9F4']} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.orb, { width: size, height: size, borderRadius: Math.round(size * 0.32), borderColor: t.solid + '33' }]}>
      <Picto name={picto} size={Math.round(size * 0.64)} />
    </LinearGradient>
  );
}

function Chevron({ open, color = COLORS.inkFaint }) {
  return <CvcIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={color} strokeWidth={2.2} />;
}

/**
 * Bannière : [pastille] Titre (renommable) · sous-titre · [action] [x / y] ⌄
 * `alert` = nombre de N.S / d'anomalies affiché en rouge.
 */
export const SectionBanner = memo(function SectionBanner({
  picto, water, title, subtitle, open, onToggle, done, total, alert, actionLabel, onAction, onActionLong,
  onRename, right, compact,
}) {
  const t = teinte(water);
  const complet = total > 0 && done >= total;
  return (
    <View style={[s.banner, compact && s.bannerCompact]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: !!open }}
        accessibilityLabel={`${title}${total ? `, ${done} sur ${total}` : ''}${open ? ', ouvert' : ', fermé'}`}
        activeOpacity={0.75}
        onPress={onToggle}
        style={s.bannerMain}
      >
        {picto ? <PictoOrb picto={picto} water={water} size={compact ? 30 : 36} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {onRename ? (
            <InlineRename value={title} onSubmit={onRename} style={[s.bannerTitle, compact && s.bannerTitleCompact]} onPressText={onToggle} />
          ) : (
            <Text numberOfLines={1} style={[s.bannerTitle, compact && s.bannerTitleCompact]}>{title}</Text>
          )}
          {subtitle ? <Text numberOfLines={1} style={s.bannerSub}>{subtitle}</Text> : null}
        </View>
      </TouchableOpacity>
      {right}
      {actionLabel && onAction ? (
        <TouchableOpacity accessibilityRole="button" onPress={onAction} onLongPress={onActionLong} delayLongPress={350} hitSlop={HIT} style={[s.bannerAction, { borderColor: t.solid + '55' }]}>
          <Text style={[s.bannerActionText, { color: t.dark }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {alert ? <View style={s.alertBadge}><Text style={s.alertBadgeText}>{alert} N.S</Text></View> : null}
      {total > 0 ? (
        <Text style={[s.bannerCount, complet && { color: KIT.green }]}>{done}/{total}</Text>
      ) : null}
      <TouchableOpacity accessibilityLabel={open ? 'Replier' : 'Déplier'} onPress={onToggle} hitSlop={HIT} style={s.chevronBtn}>
        <Chevron open={open} />
      </TouchableOpacity>
    </View>
  );
});

/** Carte opaque : bannière + contenu quand la rubrique est ouverte. */
export function SectionCard({ children, open, style, ...banner }) {
  return (
    <View style={[s.card, style]}>
      <SectionBanner open={open} {...banner} />
      {open ? <View style={s.cardBody}>{children}</View> : null}
    </View>
  );
}

/** Sous-groupe (dans une rubrique ouverte) : petit pictogramme + titre. */
export function SubGroupTitle({ picto, water, title, onRename, right }) {
  return (
    <View style={s.subGroup}>
      {picto ? <Picto name={picto} size={18} /> : null}
      {onRename ? (
        <InlineRename value={title} onSubmit={onRename} style={[s.subGroupText, water && { color: KIT.water }]} />
      ) : (
        <Text numberOfLines={1} style={[s.subGroupText, water && { color: KIT.water }]}>{title}</Text>
      )}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Paramètre à choix qui se replie sur sa valeur
// ---------------------------------------------------------------------------

export function splitMulti(value) {
  return String(value || '').split(/\s*[,;]\s*|\s+\+\s+/).map((v) => v.trim()).filter(Boolean);
}

/**
 * - `options` : liste de libellés ;
 * - `multi` : plusieurs réponses (stockées « A, B » dans le même champ) ;
 * - `segments` : interrupteur toujours visible pour 2–3 choix courts ;
 * - `carried` : point orange = valeur reprise d'une visite précédente.
 */
export const ChoiceField = memo(function ChoiceField({
  label, value, options = [], onChange, multi = false, water = false, allowOther = true, segments, carried, picto, hint,
}) {
  const t = teinte(water);
  const courant = String(value || '').trim();
  const choisis = multi ? splitMulti(courant) : (courant ? [courant] : []);
  const [open, setOpen] = useState(false);
  const [autre, setAutre] = useState(null);
  const enSegments = segments ?? (!multi && options.length > 1 && options.length <= 3 && options.join('').length <= 36);

  const toutes = useMemo(() => {
    const extra = choisis.filter((c) => !options.some((o) => o.toLowerCase() === c.toLowerCase()));
    return [...options, ...extra];
  }, [options, courant]); // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = (opt) => {
    hapticTick();
    if (multi) {
      const deja = choisis.some((c) => c.toLowerCase() === opt.toLowerCase());
      const next = deja ? choisis.filter((c) => c.toLowerCase() !== opt.toLowerCase()) : [...choisis, opt];
      onChange?.(next.join(', '));
      return;
    }
    if (courant.toLowerCase() === opt.toLowerCase()) { onChange?.(''); return; }
    onChange?.(opt);
    if (!enSegments) setOpen(false);
  };
  const validerAutre = () => {
    const v = String(autre || '').trim();
    setAutre(null);
    if (!v) return;
    if (multi) onChange?.([...choisis, v].join(', '));
    else { onChange?.(v); setOpen(false); }
  };

  if (enSegments) {
    return (
      <View style={s.choiceRow}>
        <LabelLine label={label} carried={carried} picto={picto} />
        <View style={s.segWrap}>
          {options.map((opt) => {
            const on = courant.toLowerCase() === opt.toLowerCase();
            return (
              <TouchableOpacity key={opt} onPress={() => choisir(opt)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.seg, on && { backgroundColor: t.solid }]}>
                <Text numberOfLines={1} style={[s.segText, on && s.segTextOn]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  if (!open) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityHint="Ouvre les choix" style={s.choiceRow}>
        <LabelLine label={label} carried={carried} picto={picto} />
        <View style={s.choiceValues}>
          {choisis.length ? choisis.map((c) => (
            <View key={c} style={[s.valuePill, { backgroundColor: t.solid }]}>
              <Text numberOfLines={1} style={s.valuePillText}>{c}</Text>
            </View>
          )) : <Text style={s.choosePlaceholder}>{hint || 'Choisir'}</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.choiceOpen, { borderColor: t.solid + '40' }]}>
      <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.7} style={s.choiceOpenHead}>
        <LabelLine label={label} carried={carried} picto={picto} />
        <Chevron open />
      </TouchableOpacity>
      <View style={s.chips}>
        {toutes.map((opt) => {
          const on = choisis.some((c) => c.toLowerCase() === opt.toLowerCase());
          return (
            <TouchableOpacity key={opt} onPress={() => choisir(opt)} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }} style={[s.chip, on && { backgroundColor: t.solid, borderColor: t.solid }]}>
              {multi ? <View style={[s.check, on && s.checkOn]}>{on ? <CvcIcon name="check" size={11} color={t.solid} strokeWidth={3} /> : null}</View> : null}
              <Text style={[s.chipText, on && s.chipTextOn]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
        {allowOther ? (
          autre === null ? (
            <TouchableOpacity onPress={() => setAutre('')} style={[s.chip, s.chipOther]}>
              <CvcIcon name="plus" size={13} color={COLORS.inkSoft} strokeWidth={2.4} />
              <Text style={s.chipText}>Autre</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.otherRow}>
              <TextInput autoFocus value={autre} onChangeText={setAutre} onSubmitEditing={validerAutre} placeholder="Saisir…" placeholderTextColor={COLORS.inkFaint} style={s.otherInput} returnKeyType="done" />
              <SmallButton label="OK" onPress={validerAutre} water={water} />
            </View>
          )
        ) : null}
      </View>
      {multi ? (
        <View style={s.okRow}>
          <SmallButton label="OK" onPress={() => setOpen(false)} water={water} filled />
        </View>
      ) : null}
    </View>
  );
});

function LabelLine({ label, carried, picto }) {
  return (
    <View style={s.labelLine}>
      {picto ? <Picto name={picto} size={16} /> : null}
      <Text numberOfLines={2} style={s.choiceLabel}>{label}</Text>
      {carried ? <View accessibilityLabel="Valeur reprise de la visite précédente" style={s.carriedDot} /> : null}
    </View>
  );
}

export function SmallButton({ label, onPress, water, filled, danger, icon, disabled }) {
  const t = teinte(water);
  const bg = danger ? KIT.red : t.solid;
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} hitSlop={HIT} accessibilityRole="button" style={[s.smallBtn, filled ? { backgroundColor: bg, borderColor: bg } : { borderColor: bg + '66' }, disabled && { opacity: 0.4 }]}>
      {icon ? <CvcIcon name={icon} size={14} color={filled ? COLORS.white : bg} strokeWidth={2.3} /> : null}
      <Text style={[s.smallBtnText, { color: filled ? COLORS.white : (danger ? KIT.red : t.dark) }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Tuile numérique − / +
// ---------------------------------------------------------------------------

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function format(n, decimals) {
  const fixed = Number(n).toFixed(decimals);
  return decimals ? fixed.replace('.', ',') : fixed;
}

/**
 * Tuile numérique. `start` = valeur du premier appui quand le champ est vide
 * (dernière valeur connue sinon valeur courante du métier) au lieu de 0.
 */
export const ValueTile = memo(function ValueTile({
  label, value, onChange, unit, step = 1, min = -Infinity, max = Infinity, start, decimals, water, onRenameLabel, picto, warn, footer,
}) {
  const t = teinte(water);
  const dec = decimals ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0);
  const n = toNumber(value);
  const bump = (dir) => {
    hapticTick();
    let next;
    if (n === null) next = start ?? (Number.isFinite(min) ? min : 0);
    else next = n + dir * step;
    next = Math.max(min, Math.min(max, Math.round(next * 10 ** dec) / 10 ** dec));
    onChange?.(format(next, dec));
  };
  return (
    <View style={[s.tile, warn && { borderColor: KIT.amber, backgroundColor: KIT.amberBg }]}>
      <View style={s.tileHead}>
        {picto ? <Picto name={picto} size={15} /> : null}
        {onRenameLabel ? (
          <InlineRename value={label} onSubmit={onRenameLabel} style={s.tileLabel} />
        ) : (
          <Text numberOfLines={1} style={s.tileLabel}>{label}</Text>
        )}
      </View>
      <View style={s.tileRow}>
        <TouchableOpacity accessibilityLabel={`Diminuer ${label}`} onPress={() => bump(-1)} style={s.tileBtn} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Text style={[s.tileBtnText, { color: t.dark }]}>−</Text>
        </TouchableOpacity>
        <View style={s.tileValueWrap}>
          <TextInput
            value={value == null ? '' : String(value)}
            onChangeText={(txt) => onChange?.(txt.replace(/[^0-9,.\-]/g, ''))}
            keyboardType="decimal-pad"
            placeholder={start != null ? format(start, dec) : '—'}
            placeholderTextColor="#C9C4BA"
            style={s.tileValue}
            selectTextOnFocus
            accessibilityLabel={label}
          />
          {unit ? <Text style={s.tileUnit}>{unit}</Text> : null}
        </View>
        <TouchableOpacity accessibilityLabel={`Augmenter ${label}`} onPress={() => bump(1)} style={s.tileBtn} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Text style={[s.tileBtnText, { color: t.dark }]}>+</Text>
        </TouchableOpacity>
      </View>
      {footer}
    </View>
  );
});

export function TileRow({ children }) {
  return <View style={s.tilePair}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Filtre à segments
// ---------------------------------------------------------------------------

export function FilterSeg({ options = [], value, onChange, water }) {
  const t = teinte(water);
  return (
    <View style={s.filter}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity key={o.key} onPress={() => { hapticTick(); onChange?.(o.key); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.filterItem, on && s.filterItemOn]}>
            <Text numberOfLines={1} style={[s.filterText, on && { color: t.dark, fontFamily: FONTS.bodyBold }]}>{o.label}</Text>
            {o.count != null ? <Text style={[s.filterCount, on && { color: t.dark }, o.danger && o.count ? { color: KIT.red } : null]}>{o.count}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feuille du bas et menu d'actions
// ---------------------------------------------------------------------------

export function BottomSheet({ visible, onClose, title, picto, water, subtitle, children, footer, maxHeight = '88%' }) {
  return (
    <Modal visible={!!visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.sheetOverlay} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[s.sheet, { maxHeight }]}>
          <View style={s.sheetGrip} />
          {title ? (
            <View style={s.sheetHead}>
              {picto ? <PictoOrb picto={picto} water={water} size={34} /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={s.sheetTitle}>{title}</Text>
                {subtitle ? <Text numberOfLines={2} style={s.sheetSub}>{subtitle}</Text> : null}
              </View>
              <TouchableOpacity accessibilityLabel="Fermer" onPress={onClose} hitSlop={HIT} style={s.sheetClose}>
                <CvcIcon name="close" size={18} color={COLORS.inkSoft} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetBody}>{children}</ScrollView>
          {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Menu « ⋯ » : items = [{ label, icon | picto, onPress, destructive, confirm }].
 * `confirm` = { title, message, label } : demande confirmation avant l'action.
 */
export function ActionMenu({ items = [], label = 'Plus d’actions', size = 20 }) {
  const [open, setOpen] = useState(false);
  const run = (item) => {
    setOpen(false);
    if (item.confirm) {
      setTimeout(() => Alert.alert(item.confirm.title || item.label, item.confirm.message || '', [
        { text: 'Annuler', style: 'cancel' },
        { text: item.confirm.label || item.label, style: item.destructive ? 'destructive' : 'default', onPress: item.onPress },
      ]), 220);
      return;
    }
    setTimeout(() => item.onPress?.(), 200);
  };
  const visibles = items.filter(Boolean);
  if (!visibles.length) return null;
  return (
    <>
      <TouchableOpacity accessibilityLabel={label} onPress={() => setOpen(true)} hitSlop={HIT} style={s.moreBtn}>
        <CvcIcon name="more" size={size} color={COLORS.inkSoft} strokeWidth={2.2} />
      </TouchableOpacity>
      <BottomSheet visible={open} onClose={() => setOpen(false)} maxHeight="70%">
        {visibles.map((item) => (
          <TouchableOpacity key={item.label} onPress={() => run(item)} style={s.menuItem} accessibilityRole="button">
            {item.picto ? <Picto name={item.picto} size={22} /> : <CvcIcon name={item.icon || 'note'} size={22} color={item.destructive ? KIT.red : COLORS.ink} strokeWidth={2} />}
            <Text style={[s.menuText, item.destructive && { color: KIT.red }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </>
  );
}

/** Confirmation standard d'une action destructrice (feuille premium). */
export function confirmer({ title, message, label = 'Supprimer', onConfirm }) {
  Alert.alert(title, message || '', [
    { text: 'Annuler', style: 'cancel' },
    { text: label, style: 'destructive', onPress: onConfirm },
  ]);
}

// ---------------------------------------------------------------------------
// Renommage en place, unité, texte défilant
// ---------------------------------------------------------------------------

/**
 * Texte qui devient champ au toucher (appui long si `onPressText` est donné,
 * le toucher simple gardant son action, par exemple replier une rubrique).
 */
export function InlineRename({ value, onSubmit, style, placeholder = 'Nom', onPressText, numberOfLines = 1 }) {
  const [edit, setEdit] = useState(null);
  if (edit !== null) {
    const valider = () => {
      const v = edit.trim();
      setEdit(null);
      if (v && v !== value) onSubmit?.(v);
    };
    return (
      <View style={s.renameRow}>
        <TextInput autoFocus value={edit} onChangeText={setEdit} onSubmitEditing={valider} onBlur={valider} placeholder={placeholder} returnKeyType="done" style={[style, s.renameInput]} selectTextOnFocus />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPressText || (() => setEdit(String(value || '')))}
      onLongPress={() => setEdit(String(value || ''))}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityHint={onPressText ? 'Appui long pour renommer' : 'Toucher pour renommer'}
      style={s.renameRow}
    >
      <Text numberOfLines={numberOfLines} style={[style, { flexShrink: 1 }]}>{value || placeholder}</Text>
      {!onPressText ? <CvcIcon name="edit" size={12} color={COLORS.inkFaint} strokeWidth={2} /> : null}
    </Pressable>
  );
}

export const UNITES_COMPTEUR = Object.freeze(['m³', 'L', 'MWh', 'kWh', 'bar', '%']);

/** Pastille d'unité : un toucher ouvre la liste et change l'unité. */
export function UnitPill({ value, options = UNITES_COMPTEUR, onChange, water }) {
  const [open, setOpen] = useState(false);
  const t = teinte(water);
  return (
    <>
      <TouchableOpacity accessibilityLabel={`Unité ${value || 'non définie'}, toucher pour changer`} onPress={() => setOpen(true)} hitSlop={HIT} style={[s.unitPill, { borderColor: t.solid + '55', backgroundColor: t.light }]}>
        <Text style={[s.unitText, { color: t.dark }]}>{value || 'unité'}</Text>
      </TouchableOpacity>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Unité" maxHeight="50%">
        <View style={s.chips}>
          {options.map((u) => {
            const on = u === value;
            return (
              <TouchableOpacity key={u} onPress={() => { setOpen(false); onChange?.(u); }} style={[s.chip, s.unitChip, on && { backgroundColor: t.solid, borderColor: t.solid }]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{u}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}

/** Texte qui défile doucement s'il est trop long (immobile si l'accessibilité réduit les animations). */
export function MarqueeText({ text, style, speed = 28 }) {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [reduce, setReduce] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduce(!!v); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const overflow = textW - boxW;
  useEffect(() => {
    x.setValue(0);
    if (reduce || overflow <= 4 || !boxW) return undefined;
    const duration = Math.max(2500, (overflow / speed) * 1000);
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(1800),
      Animated.timing(x, { toValue: -overflow, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(x, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [overflow, boxW, reduce, speed, x]);
  return (
    <View style={{ overflow: 'hidden', flexShrink: 1 }} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }], width: reduce || overflow <= 4 ? undefined : textW + 2 }}>
        <Text numberOfLines={1} style={style} onLayout={(e) => setTextW(e.nativeEvent.layout.width)}>{text}</Text>
      </Animated.View>
    </View>
  );
}

export function EmptyLine({ text }) {
  return <Text style={s.empty}>{text}</Text>;
}

const s = StyleSheet.create({
  orb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  card: {
    backgroundColor: KIT.card, borderRadius: 18, borderWidth: 1, borderColor: KIT.border, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2,
  },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 8, minHeight: 56 },
  bannerCompact: { minHeight: 46 },
  bannerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, minWidth: 0 },
  bannerTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink },
  bannerTitleCompact: { fontSize: 13.5 },
  bannerSub: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 },
  bannerAction: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#FFFFFF' },
  bannerActionText: { fontSize: 11.5, fontFamily: FONTS.bodyBold },
  bannerCount: { fontSize: 12, fontFamily: FONTS.semi, color: COLORS.inkSoft, minWidth: 34, textAlign: 'right' },
  alertBadge: { backgroundColor: KIT.redBg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  alertBadgeText: { fontSize: 10.5, fontFamily: FONTS.bodyBold, color: KIT.red },
  chevronBtn: { width: 26, alignItems: 'center' },
  subGroup: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 10, paddingBottom: 4 },
  subGroupText: { fontSize: 11.5, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4 },

  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  labelLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  choiceLabel: { flexShrink: 1, fontSize: 13.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  carriedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.orange },
  choiceValues: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5, maxWidth: '58%' },
  valuePill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 200 },
  valuePillText: { fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.white },
  choosePlaceholder: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.inkFaint },
  choiceOpen: { borderWidth: 1, borderRadius: 14, padding: 10, marginVertical: 6, backgroundColor: '#FFFFFF' },
  choiceOpenHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', backgroundColor: '#FFFFFF' },
  chipOther: { borderStyle: 'dashed' },
  chipText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  chipTextOn: { color: COLORS.white, fontFamily: FONTS.bodyBold },
  check: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(22,21,15,0.25)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: COLORS.white, borderColor: COLORS.white },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexGrow: 1 },
  otherInput: { flex: 1, minWidth: 120, minHeight: 36, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 10, fontFamily: FONTS.bodyMedium, color: COLORS.ink, backgroundColor: '#FFFFFF' },
  okRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  segWrap: { flexDirection: 'row', backgroundColor: 'rgba(22,21,15,0.06)', borderRadius: 12, padding: 3, gap: 2, maxWidth: '62%' },
  seg: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, minWidth: 44, alignItems: 'center' },
  segText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft },
  segTextOn: { color: COLORS.white, fontFamily: FONTS.bodyBold },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnText: { fontSize: 12, fontFamily: FONTS.bodyBold },

  tile: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 6, minWidth: 0 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 18 },
  tileLabel: { fontSize: 11.5, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft, flexShrink: 1 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tileBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(22,21,15,0.05)', alignItems: 'center', justifyContent: 'center' },
  tileBtnText: { fontSize: 22, fontFamily: FONTS.bold, lineHeight: 26 },
  tileValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', minWidth: 0 },
  tileValue: { fontSize: 20, fontFamily: FONTS.black, color: COLORS.ink, textAlign: 'center', paddingVertical: 2, minWidth: 40, maxWidth: '78%' },
  tileUnit: { fontSize: 11.5, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft, marginLeft: 2 },
  tilePair: { flexDirection: 'row', gap: 8, marginTop: 8 },

  filter: { flexDirection: 'row', backgroundColor: 'rgba(22,21,15,0.06)', borderRadius: 14, padding: 3, gap: 2, marginBottom: 10 },
  filterItem: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: 7, borderRadius: 11 },
  filterItemOn: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  filterText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft },
  filterCount: { fontSize: 11, fontFamily: FONTS.semi, color: COLORS.inkFaint },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(20,18,14,0.38)' },
  sheet: { backgroundColor: KIT.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 12, position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetGrip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(22,21,15,0.18)', marginTop: 8, marginBottom: 4 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  sheetTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.ink },
  sheetSub: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(22,21,15,0.06)', alignItems: 'center', justifyContent: 'center' },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  sheetFooter: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  moreBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  menuText: { fontSize: 14.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },

  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  renameInput: { flex: 1, borderBottomWidth: 1.5, borderBottomColor: COLORS.orange, paddingVertical: 0 },
  unitPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, minWidth: 40, alignItems: 'center' },
  unitText: { fontSize: 12, fontFamily: FONTS.bodyBold },
  unitChip: { minWidth: 64, justifyContent: 'center' },
  empty: { fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkFaint, paddingVertical: 10, textAlign: 'center' },
});

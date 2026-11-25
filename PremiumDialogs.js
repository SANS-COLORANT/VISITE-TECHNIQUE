/**
 * Dialogues et toasts (DA "Verre chaud").
 *
 * - installPremiumAlert() remplace Alert.alert par une feuille maison : les
 *   ~350 appels existants de l'application en profitent sans être modifiés.
 *   Sans hôte monté (ou en cas d'erreur), l'Alert natif reste utilisé.
 * - showToast() affiche un bandeau bref en bas d'écran, avec une action
 *   facultative (ex. « Annuler »).
 * - Les confirmations simples (titres listés dans BANNER_TITLES, sans choix à
 *   faire) passent automatiquement en bandeau au lieu d'une feuille à fermer.
 *   La liste est explicite : les tests Android qui attendent un dialogue
 *   (ex. « Restauration terminée ») ne sont pas concernés.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { ButtonGlow } from './ButtonGlow.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const nativeAlert = Alert.alert.bind(Alert);
const dialogQueue = [];
let dialogListener = null;
// Pile d'hôtes : un écran plein (Modal) peut monter son propre ToastHost,
// le dernier monté reçoit les toasts.
const toastListeners = [];

function emitDialog() { dialogListener?.(dialogQueue[0] || null); }

// Confirmation alerts shown as a banner instead of a sheet to dismiss.
export const BANNER_TITLES = new Set([
  'Avis enregistrés', 'Calcul enregistré', 'Export Mission créé', 'Extraction créée',
  'Import METRA terminé', 'Mission importée', 'Photo enregistrée', 'Rapport Pré-allumage généré',
  'Réglages copiés', 'Réserve créée', 'Sauvegarde faite', 'Site supprimé', 'Site supprimé dans METRA',
  'Suivi créé', 'Série importée', 'Équipement mis à jour',
]);

function asBanner(title, message, buttons) {
  if (!BANNER_TITLES.has(String(title || '').trim())) return false;
  const list = Array.isArray(buttons) ? buttons : [];
  if (list.length > 1) return false;
  if (list.length === 1 && (list[0]?.onPress || list[0]?.style === 'destructive')) return false;
  if (!toastListeners.length) return false;
  showToast(message ? String(message) : '', { title: String(title), tone: 'success', duration: 3800 });
  return true;
}

export function installPremiumAlert() {
  if (Alert.__metraPremium) return;
  Alert.alert = (title, message, buttons, options) => {
    try { if (asBanner(title, message, buttons)) return undefined; } catch (_) { /* fall back to a dialog */ }
    if (!dialogListener) return nativeAlert(title, message, buttons, options);
    try {
      dialogQueue.push({ id: Date.now() + Math.random(), title, message, buttons, options });
      if (dialogQueue.length === 1) emitDialog();
    } catch {
      nativeAlert(title, message, buttons, options);
    }
    return undefined;
  };
  Alert.__metraPremium = true;
}

export function showToast(message, { tone = 'neutral', action = null, duration = 2600, title = null } = {}) {
  toastListeners[toastListeners.length - 1]?.({ id: Date.now() + Math.random(), title, message: String(message || ''), tone, action, duration });
}

function closeCurrent(after) {
  dialogQueue.shift();
  emitDialog();
  if (after) setTimeout(() => { try { after(); } catch (e) { console.warn('Action de dialogue', e); } }, 0);
}

export function DialogHost() {
  const { bottom: modalBottomInset } = useSafeAreaInsets();
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    dialogListener = setDialog;
    setDialog(dialogQueue[0] || null);
    return () => { if (dialogListener === setDialog) dialogListener = null; };
  }, []);

  const buttons = (dialog?.buttons && dialog.buttons.length ? dialog.buttons : [{ text: 'OK' }]).slice(0, 7);
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const cancelable = dialog?.options?.cancelable !== false || !!cancelBtn;
  const dismiss = () => {
    if (!cancelable) return;
    closeCurrent(cancelBtn?.onPress || dialog?.options?.onDismiss || null);
  };
  // Ordre d'affichage : action principale en premier, annulation en dernier.
  const ordered = [...buttons.filter((b) => b.style !== 'cancel'), ...buttons.filter((b) => b.style === 'cancel')];
  const vertical = ordered.length > 2 || ordered.some((b) => String(b.text || '').length > 16);

  return (
    <Modal visible={!!dialog} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={dismiss}>
      <Pressable style={[s.overlay, { paddingBottom: Math.max(14, modalBottomInset + 14) }]} onPress={dismiss}>
        <Pressable style={s.sheet} onPress={() => {}}>
          {dialog?.title ? <Text style={s.title}>{String(dialog.title)}</Text> : null}
          {dialog?.message ? <ScrollView style={{ maxHeight: 320 }}><Text style={s.message}>{String(dialog.message)}</Text></ScrollView> : null}
          <View style={[s.actions, vertical ? s.actionsCol : s.actionsRow]}>
            {(vertical ? ordered : [...ordered].reverse()).map((b, i) => {
              const destructive = b.style === 'destructive';
              const cancel = b.style === 'cancel';
              const primary = !destructive && !cancel && (ordered.length === 1 || b === ordered[0]);
              return (
                <TouchableOpacity
                  key={`${i}-${b.text}`}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  onPress={() => closeCurrent(b.onPress || null)}
                  style={[s.btn, !vertical && { flex: 1 }, primary ? s.btnPrimary : destructive ? s.btnDanger : s.btnSecondary]}
                >
                  {primary ? <ButtonGlow radius={16} /> : null}
                  <Text style={[s.btnText, primary ? { color: COLORS.white } : destructive ? { color: COLORS.white } : { color: COLORS.ink }]}>{String(b.text || 'OK')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TONES = {
  success: { color: '#2E9D5B', soft: 'rgba(46,157,91,0.18)', icon: 'check' },
  error: { color: '#E5484D', soft: 'rgba(229,72,77,0.18)', icon: 'warning' },
  neutral: { color: '#F7A26B', soft: 'rgba(247,162,107,0.18)', icon: 'note' },
};

export function ToastHost({ bottom = 104 }) {
  const [toast, setToast] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const life = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const hide = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setToast(null));
  };

  useEffect(() => {
    const listener = (t) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      anim.setValue(0); life.setValue(1); pop.setValue(0);
      Animated.spring(anim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
      Animated.sequence([Animated.delay(140), Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true })]).start();
      Animated.timing(life, { toValue: 0, duration: t.duration, easing: Easing.linear, useNativeDriver: true }).start();
      timer.current = setTimeout(() => hide(), t.duration);
    };
    toastListeners.push(listener);
    return () => {
      const i = toastListeners.lastIndexOf(listener);
      if (i >= 0) toastListeners.splice(i, 1);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;
  const tone = TONES[toast.tone] || TONES.neutral;
  return (
    <Animated.View pointerEvents="box-none" style={[s.toastWrap, { bottom, opacity: anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
    ] }]}>
      <Pressable accessibilityRole="alert" accessibilityLiveRegion="polite" onPress={hide} style={s.toast}>
        <Animated.View style={[s.toastIcon, { backgroundColor: tone.soft, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
          <CvcIcon name={tone.icon} size={17} color={tone.color} strokeWidth={2.4} />
        </Animated.View>
        <View style={{ flexShrink: 1, flexGrow: 1 }}>
          {toast.title ? <Text numberOfLines={1} style={s.toastTitle}>{toast.title}</Text> : null}
          {toast.message ? <Text numberOfLines={2} style={[s.toastText, toast.title && s.toastSub]}>{toast.message}</Text> : null}
        </View>
        {toast.action ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => { hide(); toast.action.onPress?.(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.toastAction}>{toast.action.label}</Text>
          </TouchableOpacity>
        ) : null}
        <View pointerEvents="none" style={s.toastTrack}>
          <Animated.View style={[s.toastLife, { backgroundColor: tone.color, transform: [{ scaleX: life }] }]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(22,21,15,0.38)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 14 },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: '#FBFAF7', borderRadius: 28, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  title: { fontSize: 18.5, fontFamily: FONTS.black, color: COLORS.ink, marginBottom: 6 },
  message: { fontSize: 13.5, lineHeight: 20, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  actions: { marginTop: 18, gap: 8 },
  actionsRow: { flexDirection: 'row' },
  actionsCol: { flexDirection: 'column' },
  btn: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, overflow: 'hidden' },
  btnPrimary: { backgroundColor: COLORS.orange },
  btnDanger: { backgroundColor: '#C23B2E' },
  btnSecondary: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)' },
  btnText: { fontSize: 14.5, fontFamily: FONTS.bodyBold },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 900, elevation: 30 },
  toast: { maxWidth: 520, minWidth: 240, flexDirection: 'row', alignItems: 'center', gap: 11, paddingLeft: 12, paddingRight: 16, paddingTop: 11, paddingBottom: 13, borderRadius: 18, backgroundColor: 'rgba(28,26,22,0.95)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  toastIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toastTitle: { fontSize: 14, fontFamily: FONTS.bodyBold, color: '#FFFFFF' },
  toastSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.72)', fontFamily: FONTS.bodyMedium, marginTop: 1 },
  toastTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: 'rgba(255,255,255,0.06)' },
  toastLife: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, transformOrigin: 'left' },
  toastText: { flexShrink: 1, fontSize: 13.5, fontFamily: FONTS.bodySemi, color: '#FFFFFF' },
  toastAction: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: '#F7A26B', marginLeft: 6 },
});

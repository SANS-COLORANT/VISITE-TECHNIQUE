/**
 * Dialogues et toasts (DA "Verre chaud").
 *
 * - installPremiumAlert() remplace Alert.alert par une feuille maison : les
 *   ~350 appels existants de l'application en profitent sans être modifiés.
 *   Sans hôte monté (ou en cas d'erreur), l'Alert natif reste utilisé.
 * - showToast() affiche un message bref en bas d'écran, avec une action
 *   facultative (ex. « Annuler »).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { ButtonGlow } from './ButtonGlow.js';
import { CvcIcon } from './MetraCvcIcons.js';

const nativeAlert = Alert.alert.bind(Alert);
const dialogQueue = [];
let dialogListener = null;
let toastListener = null;

function emitDialog() { dialogListener?.(dialogQueue[0] || null); }

export function installPremiumAlert() {
  if (Alert.__metraPremium) return;
  Alert.alert = (title, message, buttons, options) => {
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

export function showToast(message, { tone = 'neutral', action = null, duration = 2600 } = {}) {
  toastListener?.({ id: Date.now() + Math.random(), message: String(message || ''), tone, action, duration });
}

function closeCurrent(after) {
  dialogQueue.shift();
  emitDialog();
  if (after) setTimeout(() => { try { after(); } catch (e) { console.warn('Action de dialogue', e); } }, 0);
}

export function DialogHost() {
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    dialogListener = setDialog;
    setDialog(dialogQueue[0] || null);
    return () => { if (dialogListener === setDialog) dialogListener = null; };
  }, []);

  const buttons = (dialog?.buttons && dialog.buttons.length ? dialog.buttons : [{ text: 'OK' }]).slice(0, 4);
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
    <Modal visible={!!dialog} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={s.overlay} onPress={dismiss}>
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

export function ToastHost({ bottom = 104 }) {
  const [toast, setToast] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => {
    toastListener = (t) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      timer.current = setTimeout(() => hide(), t.duration);
    };
    return () => { toastListener = null; if (timer.current) clearTimeout(timer.current); };
  }, []);

  const hide = () => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  };

  if (!toast) return null;
  const icon = toast.tone === 'success' ? 'check' : toast.tone === 'error' ? 'warning' : 'note';
  const iconColor = toast.tone === 'success' ? '#2E9D5B' : toast.tone === 'error' ? '#E5484D' : '#F7A26B';
  return (
    <Animated.View pointerEvents="box-none" style={[s.toastWrap, { bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <View accessibilityLiveRegion="polite" style={s.toast}>
        <CvcIcon name={icon} size={18} color={iconColor} strokeWidth={2.2} />
        <Text numberOfLines={2} style={s.toastText}>{toast.message}</Text>
        {toast.action ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => { hide(); toast.action.onPress?.(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.toastAction}>{toast.action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
  toast: { maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(28,26,22,0.94)', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  toastText: { flexShrink: 1, fontSize: 13.5, fontFamily: FONTS.bodySemi, color: '#FFFFFF' },
  toastAction: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: '#F7A26B', marginLeft: 6 },
});

from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


def patch_function_modal(text: str, function_name: str) -> str:
    """Ferme une modale en touchant son fond, sans fermer au toucher dans la feuille."""
    start = text.find(f'function {function_name}(')
    if start < 0:
        raise SystemExit(f'{function_name}: function not found')
    candidates = [x for x in (text.find('\nfunction ', start + 1), text.find('\nexport ', start + 1)) if x >= 0]
    end = min(candidates) if candidates else len(text)
    segment = text[start:end]
    if '<Pressable style={styles.modalOverlay}' in segment:
        return text
    marker = '><View style={styles.modalOverlay}><View'
    if marker not in segment:
        raise SystemExit(f'{function_name}: modal overlay marker not found')
    segment = segment.replace(
        marker,
        '><Pressable style={styles.modalOverlay} onPress={onClose}><Pressable onPress={(e) => e.stopPropagation()}',
        1,
    )
    closing = '</View></View></Modal>'
    pos = segment.rfind(closing)
    if pos < 0:
        raise SystemExit(f'{function_name}: modal closing marker not found')
    segment = segment[:pos] + '</Pressable></Pressable></Modal>' + segment[pos + len(closing):]
    return text[:start] + segment + text[end:]


# ---------------------------------------------------------------------------
# 1. Installations Pré-allumage
#    - bandeau du local hors SectionList = nom toujours visible ;
#    - le swipe local est piloté par le PanResponder déjà éprouvé de VisiteScreen ;
#    - toutes les pop-up de l'écran se ferment au toucher du fond.
# ---------------------------------------------------------------------------
p = Path('PreAllumageInstallationPanelV3.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { ActivityIndicator, Alert, Modal, PanResponder, SectionList, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';",
    "import { ActivityIndicator, Alert, Modal, PanResponder, Pressable, SectionList, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';",
    'V3 Pressable import',
)
s = replace_once(
    s,
    'export function PreAllumageInstallationPanelV3({ visiteId, onSaved, planControl = null }) {',
    'export function PreAllumageInstallationPanelV3({ visiteId, onSaved, planControl = null, onRegisterLocalSwipe }) {',
    'V3 local swipe registration prop',
)

# L'ancien responder local attaché à SectionList était la cause principale du
# comportement aléatoire Android. Il reste défini pour compatibilité du patch
# précédent mais n'est plus attaché à la liste.
s = replace_once(
    s,
    '<SectionList {...localSwipe.panHandlers} ref={listRef}',
    '<SectionList ref={listRef}',
    'detach unreliable SectionList responder',
)

idx_marker = "  const idx = locals.findIndex((l) => l.id === active?.id); const prev = idx > 0 ? locals[idx - 1] : null; const next = idx >= 0 && idx < locals.length - 1 ? locals[idx + 1] : null;\n"
register_block = r'''  useEffect(() => {
    if (!onRegisterLocalSwipe) return undefined;
    const handler = (direction) => {
      const currentIndex = locals.findIndex((l) => l.id === activeId);
      if (currentIndex < 0) return false;
      const targetIndex = direction > 0 ? currentIndex + 1 : currentIndex - 1;
      const target = locals[targetIndex];
      if (!target?.id) return false;
      setActiveId(target.id);
      requestAnimationFrame(() => {
        try { listRef.current?.scrollToOffset?.({ offset: 0, animated: false }); } catch {}
      });
      return true;
    };
    onRegisterLocalSwipe(handler);
    return () => onRegisterLocalSwipe(null);
  }, [onRegisterLocalSwipe, locals, activeId]);
'''
if 'onRegisterLocalSwipe(handler);' not in s:
    s = replace_once(s, idx_marker, idx_marker + register_block, 'register local swipe handler')

# Le bandeau est volontairement hors de la SectionList : il reste visible même
# après plusieurs écrans de scroll dans une SST/chaufferie.
sticky_marker = "  const renderCompactField = (x, section, extraProps = {}) =>"
sticky_block = r'''  const fixedLocalNavigator = active ? <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: stats.ns ? '#F4C7C7' : COLORS.line, borderRadius: 12, marginHorizontal: 10, marginTop: 8, marginBottom: 6, paddingVertical: 7, paddingHorizontal: 8, zIndex: 20, elevation: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <TouchableOpacity disabled={!prev} onPress={() => prev && setActiveId(prev.id)} style={{ width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: prev ? COLORS.line : '#EAECF0', backgroundColor: prev ? COLORS.white : '#F9FAFB', opacity: prev ? 1 : 0.35 }}><Text style={{ color: COLORS.ink, fontSize: 20, fontWeight: '900' }}>‹</Text></TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: COLORS.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' }}>{active.nom}</Text>
        <Text numberOfLines={1} style={{ color: stats.ns ? COLORS.red : COLORS.inkSoft, fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 1 }}>{typeLabel(active)} · {idx + 1}/{locals.length} · {stats.pct}%{stats.ns ? ` · ${stats.ns} N.S` : ''}</Text>
      </View>
      <TouchableOpacity disabled={!next} onPress={() => next && setActiveId(next.id)} style={{ width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: next ? COLORS.line : '#EAECF0', backgroundColor: next ? COLORS.white : '#F9FAFB', opacity: next ? 1 : 0.35 }}><Text style={{ color: COLORS.ink, fontSize: 20, fontWeight: '900' }}>›</Text></TouchableOpacity>
    </View>
    {locals.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 6, paddingHorizontal: 2 }}>
      {locals.map((l) => <TouchableOpacity key={`fixed-${l.id}`} onPress={() => setActiveId(l.id)} style={{ minHeight: 29, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 15, borderWidth: 1, borderColor: l.id === active.id ? COLORS.orange : COLORS.line, backgroundColor: l.id === active.id ? COLORS.orangeLight : COLORS.white }}><Text numberOfLines={1} style={{ color: l.id === active.id ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: '900', fontSize: 9 }}>{l.nom}</Text></TouchableOpacity>)}
    </ScrollView> : null}
  </View> : null;

'''
if 'const fixedLocalNavigator = active ?' not in s:
    if sticky_marker not in s:
        raise SystemExit('sticky local navigator marker not found')
    s = s.replace(sticky_marker, sticky_block + sticky_marker, 1)

# Evite de montrer deux fois la même rangée de locaux : l'ancienne rangée du
# header défile désormais, tandis que le nouveau bandeau reste fixe.
old_chips = re.compile(r'<ScrollView horizontal showsHorizontalScrollIndicator=\{false\} contentContainerStyle=\{\{ gap: 7, paddingTop: 10 \}\}>\{visibleLocals\.map\(\(l\) => \{ const s = statsRubriques\(rubriquesFor\(l\), champs, controls\); return <TouchableOpacity.*?</ScrollView>', re.S)
s, chips_count = old_chips.subn('', s, count=1)
if chips_count == 0 and 'fixed-${l.id}' not in s:
    raise SystemExit('old local chip strip not found')

return_marker = "  return <>\n    <SectionList ref={listRef}"
return_new = "  return <>\n    {fixedLocalNavigator}\n    <SectionList ref={listRef}"
s = replace_once(s, return_marker, return_new, 'fixed local navigator render')

for fn in ['AddLocalModal', 'AddEquipmentModal', 'AddCounterModal', 'ConfigModal', 'ActionsModal']:
    s = patch_function_modal(s, fn)
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Plan : toucher le voile ferme la pop-up.
# ---------------------------------------------------------------------------
p = Path('PreAllumagePlanCard.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { Alert, Image, Modal, Text, TouchableOpacity, View } from 'react-native';",
    "import { Alert, Image, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';",
    'plan Pressable import',
)
s = replace_once(
    s,
    '<Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>\n      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 760, width: \'94%\' }]}>',
    '<Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>\n      <Pressable style={styles.modalOverlay} onPress={() => setVisible(false)}><Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalSheet, { maxWidth: 760, width: \'94%\' }]}>',
    'plan dismissible backdrop',
)
s = replace_once(s, '      </View></View>\n    </Modal>', '      </Pressable></Pressable>\n    </Modal>', 'plan dismissible closing')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Unité compteur : même règle de fermeture par le fond.
# ---------------------------------------------------------------------------
p = Path('PreAllumageCompactField.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';",
    "import { Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';",
    'compact field Pressable import',
)
s = replace_once(
    s,
    '<Modal visible={unitVisible} transparent animationType="fade" onRequestClose={() => setUnitVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 520, width: \'92%\' }]}>',
    '<Modal visible={unitVisible} transparent animationType="fade" onRequestClose={() => setUnitVisible(false)}><Pressable style={styles.modalOverlay} onPress={() => setUnitVisible(false)}><Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalSheet, { maxWidth: 520, width: \'92%\' }]}>',
    'unit dismissible backdrop',
)
s = replace_once(
    s,
    '    </View></View></Modal>\n  </View>;\n});',
    '    </Pressable></Pressable></Modal>\n  </View>;\n});',
    'unit dismissible closing',
)
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 4. Informations Pré-allumage : ajout de référentiel fermable hors feuille.
# ---------------------------------------------------------------------------
p = Path('PreAllumageInfoPanelV3.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { ActivityIndicator, Modal, ScrollView, SectionList, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';",
    "import { ActivityIndicator, Modal, Pressable, ScrollView, SectionList, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';",
    'info Pressable import',
)
s = patch_function_modal(s, 'AddReferenceModal')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 5. VisiteScreen : son PanResponder global, déjà fiable sur Android, pilote le
#    changement de SST/local quand Installations Pré-allumage est actif.
# ---------------------------------------------------------------------------
p = Path('VisiteScreen.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions, Animated, Easing } from 'react-native';",
    "import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions, Animated, Easing } from 'react-native';",
    'visit Pressable import',
)
ref_marker = "  const progressionTimerRef = useRef(null);\n"
ref_block = "  const preAllumageLocalSwipeRef = useRef(null);\n"
if ref_block not in s:
    s = replace_once(s, ref_marker, ref_marker + ref_block, 'visit local swipe ref')

# Réactive la détection horizontale du responder global : la branche spéciale
# ci-dessous l'utilise pour les locaux au lieu de changer d'onglet.
s = replace_once(
    s,
    "    onMoveShouldSetPanResponder: (_evt, g) => !transitionRef.current && !(trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.45,",
    "    onMoveShouldSetPanResponder: (_evt, g) => !transitionRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35,",
    'reactivate robust global responder for local swipe',
)

terminer_marker = "  const terminerSwipe = useCallback((g) => {\n    const tabs = tabOrderRef.current;\n"
terminer_new = r'''  const terminerSwipe = useCallback((g) => {
    if (trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') {
      const thresholdLocal = Math.max(44, width * 0.065);
      const versSuivantLocal = g.dx < -thresholdLocal || g.vx < -0.42;
      const versPrecedentLocal = g.dx > thresholdLocal || g.vx > 0.42;
      const direction = versSuivantLocal ? 1 : versPrecedentLocal ? -1 : 0;
      if (direction) preAllumageLocalSwipeRef.current?.(direction);
      Animated.spring(translateX, { toValue: 0, speed: 25, bounciness: 0, useNativeDriver: true }).start();
      return;
    }
    const tabs = tabOrderRef.current;
'''
s = replace_once(s, terminer_marker, terminer_new, 'route swipe to preallumage local')
# terminerSwipe dépend maintenant de trame.id ; trame est dérivé de visite et
# le composant est recréé normalement. Ajout explicite à la dépendance.
s = replace_once(
    s,
    '  }, [basculerApresSortie, translateX, width]);\n\n  const swipeHandlers = useRef(null);',
    '  }, [basculerApresSortie, translateX, width, trame.id]);\n\n  const swipeHandlers = useRef(null);',
    'terminerSwipe dependency',
)

move_marker = "    onPanResponderMove: (_evt, g) => {\n      const tabs = tabOrderRef.current;\n"
move_new = r'''    onPanResponderMove: (_evt, g) => {
      if (trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') {
        translateX.setValue(g.dx * 0.22);
        return;
      }
      const tabs = tabOrderRef.current;
'''
s = replace_once(s, move_marker, move_new, 'local swipe drag feedback')

contenu_marker = "  const contenuActif = () => {\n"
register_visit = r'''  const enregistrerSwipeLocalPreAllumage = useCallback((handler) => {
    preAllumageLocalSwipeRef.current = typeof handler === 'function' ? handler : null;
  }, []);

'''
if 'const enregistrerSwipeLocalPreAllumage = useCallback' not in s:
    s = replace_once(s, contenu_marker, register_visit + contenu_marker, 'visit local swipe registration callback')

s = replace_once(
    s,
    '    return <TrameGenericPanel visiteId={visiteId} panelId={pid} sections={panels[pid]} onSaved={onSaved} />;',
    "    return <TrameGenericPanel visiteId={visiteId} panelId={pid} sections={panels[pid]} onSaved={onSaved} onRegisterLocalSwipe={trame.id === 'pre_allumage' && pid === 'p-pa-batiments' ? enregistrerSwipeLocalPreAllumage : undefined} />;",
    'pass local swipe registration',
)

# Note libre : toucher hors feuille sauvegarde puis ferme. Anomalie : ferme.
s = replace_once(
    s,
    '<Modal visible={noteVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}>',
    '<Modal visible={noteVisible} transparent animationType="fade" onRequestClose={fermerNote}><Pressable style={styles.modalOverlay} onPress={fermerNote}><Pressable onPress={(e) => e.stopPropagation()} style={styles.modalSheet}>',
    'note dismissible backdrop',
)
note_start = s.find('onRequestClose={fermerNote}><Pressable')
note_end = s.find('</View></View></Modal>', note_start)
if note_end < 0:
    raise SystemExit('note modal closing marker not found')
s = s[:note_end] + '</Pressable></Pressable></Modal>' + s[note_end + len('</View></View></Modal>'):]

s = replace_once(
    s,
    '<Modal visible={anomalieVisible} transparent animationType="fade" onRequestClose={() => setAnomalieVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}>',
    '<Modal visible={anomalieVisible} transparent animationType="fade" onRequestClose={() => setAnomalieVisible(false)}><Pressable style={styles.modalOverlay} onPress={() => setAnomalieVisible(false)}><Pressable onPress={(e) => e.stopPropagation()} style={styles.modalSheet}>',
    'anomaly dismissible backdrop',
)
anomaly_start = s.find('visible={anomalieVisible} transparent animationType="fade"')
anomaly_end = s.find('</View></View></Modal>', anomaly_start)
if anomaly_end < 0:
    raise SystemExit('anomaly modal closing marker not found')
s = s[:anomaly_end] + '</Pressable></Pressable></Modal>' + s[anomaly_end + len('</View></View></Modal>'):]
p.write_text(s, encoding='utf-8')

print('Pré-allumage navigation/pop-up fix applied: fixed local banner, VisiteScreen-driven local swipe, dismissible custom popups.')

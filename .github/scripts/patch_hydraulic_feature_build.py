from pathlib import Path
import re

p = Path('App.js')
s = p.read_text(encoding='utf-8')

workspace_import = "import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';\n"
if workspace_import not in s:
    raise SystemExit('Hydraulic workspace import marker not found')

# Consolidate named imports from featureSettings.js. This remains safe when
# LAB 3D / hydraulic visibility have already been integrated in App.js.
feature_pattern = re.compile(r"^import\s*\{\s*([^}]*)\s*\}\s*from\s*'\./featureSettings\.js';\s*$", re.MULTILINE)
imports = feature_pattern.findall(s)
names = []
for group in imports:
    for raw in group.split(','):
        name = raw.strip()
        if name and name not in names:
            names.append(name)
for required in ('getHydraulicSchemaVisible', 'subscribeLabFeatureChanges'):
    if required not in names:
        names.append(required)
preferred = ['getHydraulicSchemaVisible', 'getLab3DVisible', 'subscribeLabFeatureChanges']
ordered = [name for name in preferred if name in names] + [name for name in names if name not in preferred]
s = feature_pattern.sub('', s)
settings_import = "import { " + ", ".join(ordered) + " } from './featureSettings.js';\n"
s = s.replace(workspace_import, workspace_import + settings_import, 1)

# State: support both the older multi-line source and the compact App.js.
has_hydraulic_state = bool(re.search(r"\[\s*hydraulicVisible\s*,\s*setHydraulicVisible\s*\]\s*=\s*useState\(false\)", s))
if not has_hydraulic_state:
    state_marker = "  const [r1Visible, setR1Visible] = useState(false);\n"
    state_line = "  const [hydraulicVisible, setHydraulicVisible] = useState(false);\n"
    if state_marker in s:
        s = s.replace(state_marker, state_marker + state_line, 1)
    else:
        compact_marker = "[r1Visible,setR1Visible]=useState(false)"
        if compact_marker not in s:
            raise SystemExit('App state marker not found')
        s = s.replace(compact_marker, compact_marker + ",[hydraulicVisible,setHydraulicVisible]=useState(false)", 1)

# Initialization: only patch legacy code. Current source already loads
# getHydraulicSchemaVisible() alongside the visual pack and LAB 3D setting.
if 'getHydraulicSchemaVisible()' not in s:
    init_old = "      await getDb();\n      const pack = await getActiveVisualPack();\n"
    init_new = "      await getDb();\n      const [pack, schemaVisible] = await Promise.all([getActiveVisualPack(), getHydraulicSchemaVisible()]);\n      setHydraulicVisible(schemaVisible);\n"
    if init_old not in s:
        raise SystemExit('App initialization marker not found')
    s = s.replace(init_old, init_new, 1)

# Subscription: accept compact and expanded callback styles.
if not re.search(r"key\s*===\s*['\"]hydraulic_schema['\"]", s):
    visual_callback = """  const handleVisualPackChanged = useCallback((pack) => {
    setRuntimeVisualPalette(pack?.colors);
    setVisualPack(pack);
    setVisualRevision((value) => value + 1);
  }, []);
"""
    subscription = """
  useEffect(() => subscribeLabFeatureChanges((key, enabled) => {
    if (key === 'hydraulic_schema') setHydraulicVisible(enabled);
  }), []);
"""
    if visual_callback not in s:
        raise SystemExit('Visual callback marker not found')
    s = s.replace(visual_callback, visual_callback + subscription, 1)

# Visit button: detect the actual behavior instead of depending on one exact
# JSX formatting. Both of these are valid and equivalent:
#   hydraulicVisible ? <TouchableOpacity ...
#   hydraulicVisible ? (\n  <TouchableOpacity ...
visit_gate_pattern = re.compile(
    r"hydraulicVisible\s*\?\s*(?:\(\s*)?<TouchableOpacity\b",
    re.DOTALL,
)

if not visit_gate_pattern.search(s):
    visit_old = """      {current.name === 'Visite' && <><VisiteScreen navigation={navigation} route={route} onBack={goBack} /><TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 48, paddingHorizontal: 17, borderRadius: 24, backgroundColor: COLORS.orange, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 200 }}><Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 12.5 }}>⌁ Schéma technique</Text></TouchableOpacity></>}
"""
    visit_new = """      {current.name === 'Visite' && <><VisiteScreen navigation={navigation} route={route} onBack={goBack} />{hydraulicVisible ? <TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 200 }}><Text style={{ color: COLORS.inkSoft, fontWeight: '800', fontSize: 10.5 }}>⌁ Schéma technique</Text></TouchableOpacity> : null}</>}
"""
    if visit_old not in s:
        raise SystemExit('Visit hydraulic button marker not found')
    s = s.replace(visit_old, visit_new, 1)

# Remove the obsolete standalone Parameters row when applying over an older source.
s = s.replace("import { HydraulicFeatureSettingRow } from './HydraulicFeatureSettingRow.js';\n", '')
s = s.replace("<HydraulicFeatureSettingRow enabled={hydraulicVisible} onChange={handleHydraulicVisibilityChanged} />", '')

# Final assertions validate behavior, not a particular formatting style.
if len(feature_pattern.findall(s)) != 1:
    raise SystemExit('featureSettings imports were not consolidated')
if not re.search(r"\[\s*hydraulicVisible\s*,\s*setHydraulicVisible\s*\]", s):
    raise SystemExit('hydraulic visibility state missing')
if 'getHydraulicSchemaVisible()' not in s:
    raise SystemExit('hydraulic initialization missing')
if not re.search(r"key\s*===\s*['\"]hydraulic_schema['\"]", s):
    raise SystemExit('hydraulic subscription missing')
if not visit_gate_pattern.search(s):
    raise SystemExit('hydraulic visit gate missing')

p.write_text(s, encoding='utf-8')
print('Hydraulic schema feature gate verified and normalized safely.')

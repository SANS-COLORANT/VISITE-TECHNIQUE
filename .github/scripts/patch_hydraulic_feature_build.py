from pathlib import Path
import re

p = Path('App.js')
s = p.read_text(encoding='utf-8')

workspace_import = "import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';\n"
if workspace_import not in s:
    raise SystemExit('Hydraulic workspace import marker not found')

# Consolidate every named import coming from featureSettings.js into a single
# import. LAB 3D and the hydraulic feature gate both use the same module, so
# appending a second import would redeclare getHydraulicSchemaVisible and break
# the Metro bundle.
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

state_marker = "  const [r1Visible, setR1Visible] = useState(false);\n"
state_line = "  const [hydraulicVisible, setHydraulicVisible] = useState(false);\n"
if state_line not in s:
    if state_marker not in s:
        raise SystemExit('App state marker not found')
    s = s.replace(state_marker, state_marker + state_line, 1)

init_old = "      await getDb();\n      const pack = await getActiveVisualPack();\n"
init_new = "      await getDb();\n      const [pack, schemaVisible] = await Promise.all([getActiveVisualPack(), getHydraulicSchemaVisible()]);\n      setHydraulicVisible(schemaVisible);\n"
if init_old in s:
    s = s.replace(init_old, init_new, 1)
elif "getHydraulicSchemaVisible()" not in s:
    raise SystemExit('App initialization marker not found')

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
if "key === 'hydraulic_schema'" not in s:
    if visual_callback not in s:
        raise SystemExit('Visual callback marker not found')
    s = s.replace(visual_callback, visual_callback + subscription, 1)

visit_old = """      {current.name === 'Visite' && <><VisiteScreen navigation={navigation} route={route} onBack={goBack} /><TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 48, paddingHorizontal: 17, borderRadius: 24, backgroundColor: COLORS.orange, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 200 }}><Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 12.5 }}>⌁ Schéma technique</Text></TouchableOpacity></>}
"""
visit_new = """      {current.name === 'Visite' && <><VisiteScreen navigation={navigation} route={route} onBack={goBack} />{hydraulicVisible ? <TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 200 }}><Text style={{ color: COLORS.inkSoft, fontWeight: '800', fontSize: 10.5 }}>⌁ Schéma technique</Text></TouchableOpacity> : null}</>}
"""
if visit_old in s:
    s = s.replace(visit_old, visit_new, 1)
elif "hydraulicVisible ? <TouchableOpacity" not in s:
    raise SystemExit('Visit hydraulic button marker not found')

# Remove the old standalone Parameters row when applying over an older patched source.
s = s.replace("import { HydraulicFeatureSettingRow } from './HydraulicFeatureSettingRow.js';\n", '')
s = s.replace("<HydraulicFeatureSettingRow enabled={hydraulicVisible} onChange={handleHydraulicVisibilityChanged} />", '')

# Safety: the build patch itself must never leave duplicate featureSettings
# imports behind.
if len(feature_pattern.findall(s)) != 1:
    raise SystemExit('featureSettings imports were not consolidated')

p.write_text(s, encoding='utf-8')
print('Hydraulic schema and LAB 3D feature imports consolidated safely.')

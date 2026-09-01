from pathlib import Path

p = Path('App.js')
s = p.read_text(encoding='utf-8')

workspace_import = "import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';\n"
settings_import = "import { getHydraulicSchemaVisible, subscribeLabFeatureChanges } from './featureSettings.js';\n"
if settings_import not in s:
    if workspace_import not in s:
        raise SystemExit('Hydraulic workspace import marker not found')
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
if subscription not in s:
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
s = s.replace("import { getHydraulicSchemaVisible, setHydraulicSchemaVisible } from './featureSettings.js';\n", '')
s = s.replace("<HydraulicFeatureSettingRow enabled={hydraulicVisible} onChange={handleHydraulicVisibilityChanged} />", '')

p.write_text(s, encoding='utf-8')
print('Hydraulic schema is controlled exclusively from METRA LAB.')

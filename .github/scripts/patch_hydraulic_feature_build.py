from pathlib import Path

p = Path('App.js')
s = p.read_text(encoding='utf-8')

workspace_import = "import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';\n"
extra_imports = "import { HydraulicFeatureSettingRow } from './HydraulicFeatureSettingRow.js';\nimport { getHydraulicSchemaVisible, setHydraulicSchemaVisible } from './featureSettings.js';\n"
if extra_imports not in s:
    if workspace_import not in s:
        raise SystemExit('Hydraulic workspace import marker not found')
    s = s.replace(workspace_import, workspace_import + extra_imports, 1)

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

callback_marker = """  const handleVisualPackChanged = useCallback((pack) => {
    setRuntimeVisualPalette(pack?.colors);
    setVisualPack(pack);
    setVisualRevision((value) => value + 1);
  }, []);
"""
callback = """
  const handleHydraulicVisibilityChanged = useCallback(async (enabled) => {
    setHydraulicVisible(enabled);
    try { await setHydraulicSchemaVisible(enabled); }
    catch (error) { console.warn('Paramètre schéma technique non enregistré', error); }
  }, []);
"""
if callback not in s:
    if callback_marker not in s:
        raise SystemExit('Visual callback marker not found')
    s = s.replace(callback_marker, callback_marker + callback, 1)

visit_old = """      {current.name === 'Visite' && <><VisiteScreen navigation={navigation} route={route} onBack={goBack} /><TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 48, paddingHorizontal: 17, borderRadius: 24, backgroundColor: COLORS.orange, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 200 }}><Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 12.5 }}>⌁ Schéma technique</Text></TouchableOpacity></>}
"""
visit_new = """      {current.name === 'Visite' && <><VisiteScreen navigation={navigation} route={route} onBack={goBack} />{hydraulicVisible ? <TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 200 }}><Text style={{ color: COLORS.inkSoft, fontWeight: '800', fontSize: 10.5 }}>⌁ Schéma technique</Text></TouchableOpacity> : null}</>}
"""
if visit_old in s:
    s = s.replace(visit_old, visit_new, 1)
elif "hydraulicVisible ? <TouchableOpacity" not in s:
    raise SystemExit('Visit hydraulic button marker not found')

params_old = """      {current.name === 'Parametres' && <><SimpleHeader title="Paramètres" onBack={goBack} visualPack={visualPack} /><VisualPacksSettingsScreen visualPack={visualPack} onVisualPackChanged={handleVisualPackChanged} /></>}
"""
params_new = """      {current.name === 'Parametres' && <><SimpleHeader title="Paramètres" onBack={goBack} visualPack={visualPack} /><HydraulicFeatureSettingRow enabled={hydraulicVisible} onChange={handleHydraulicVisibilityChanged} /><VisualPacksSettingsScreen visualPack={visualPack} onVisualPackChanged={handleVisualPackChanged} /></>}
"""
if params_old in s:
    s = s.replace(params_old, params_new, 1)
elif "<HydraulicFeatureSettingRow" not in s:
    raise SystemExit('Parameters screen marker not found')

p.write_text(s, encoding='utf-8')
print('Hydraulic schema is hidden by default and can be enabled from Parameters.')

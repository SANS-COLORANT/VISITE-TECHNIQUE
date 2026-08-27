from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'Patch theme: motif introuvable pour {label}')
    return text.replace(old, new, 1)


def patch_styles():
    p = Path('styles.js')
    s = p.read_text(encoding='utf-8')
    old = """export const COLORS = {\n  orange: '#F26426', orangeDark: '#D9531A', orangeLight: '#FFF1EA',\n  ink: '#1A1A18', inkSoft: '#6B6B66', inkFaint: '#A3A39D',\n  line: '#EAE8E2', bg: '#FAFAF8', white: '#FFFFFF',\n  green: '#2E7D32', greenBg: '#E8F5E9',\n  red: '#B91C1C', redBg: '#FDECEC',\n  amber: '#B45309', amberBg: '#FEF3E2',\n};\n\nexport const styles = StyleSheet.create({"""
    new = """const CLASSIC_ACCENT = { orange: '#F26426', orangeDark: '#D9531A', orangeLight: '#FFF1EA' };\nconst DOOM_ACCENT = { orange: '#106836', orangeDark: '#106836', orangeLight: '#E7F2EB' };\nlet activeAccent = CLASSIC_ACCENT;\n\nconst BASE_COLORS = {\n  ink: '#1A1A18', inkSoft: '#6B6B66', inkFaint: '#A3A39D',\n  line: '#EAE8E2', bg: '#FAFAF8', white: '#FFFFFF',\n  green: '#2E7D32', greenBg: '#E8F5E9',\n  red: '#B91C1C', redBg: '#FDECEC',\n  amber: '#B45309', amberBg: '#FEF3E2',\n};\n\nexport const COLORS = new Proxy(BASE_COLORS, {\n  get(target, prop) {\n    if (prop === 'orange' || prop === 'orangeDark' || prop === 'orangeLight') return activeAccent[prop];\n    return target[prop];\n  },\n});\n\nexport function applyAppTheme(mode) {\n  activeAccent = mode === 'animated' ? DOOM_ACCENT : CLASSIC_ACCENT;\n}\n\nfunction themedValue(value) {\n  if (value === CLASSIC_ACCENT.orange) return activeAccent.orange;\n  if (value === CLASSIC_ACCENT.orangeDark) return activeAccent.orangeDark;\n  if (value === CLASSIC_ACCENT.orangeLight) return activeAccent.orangeLight;\n  if (Array.isArray(value)) return value.map(themedValue);\n  if (value && typeof value === 'object') {\n    const out = {};\n    for (const [key, item] of Object.entries(value)) out[key] = themedValue(item);\n    return out;\n  }\n  return value;\n}\n\nconst RAW_STYLES = StyleSheet.create({"""
    s = replace_once(s, old, new, 'styles / couleurs')
    marker = "\nexport const styles = new Proxy(RAW_STYLES"
    if marker not in s:
        idx = s.rfind('});')
        if idx < 0:
            raise SystemExit('Patch theme: fin StyleSheet introuvable')
        s = s[:idx+3] + "\n\nexport const styles = new Proxy(RAW_STYLES, {\n  get(target, prop) {\n    return themedValue(target[prop]);\n  },\n});\n" + s[idx+3:]
    p.write_text(s, encoding='utf-8')


def patch_app():
    p = Path('App.js')
    s = p.read_text(encoding='utf-8')
    s = replace_once(
        s,
        "import { COLORS, styles } from './styles.js';",
        "import { COLORS, styles, applyAppTheme } from './styles.js';",
        'App import styles',
    )
    s = replace_once(
        s,
        "import { MetraLoadingScreen } from './MetraLoadingScreen.js';",
        "import { MetraLoadingScreen } from './MetraLoadingScreen.js';\nimport { DoomLoadingScreen, DOOM_ANIMATION_MS } from './DoomLoadingScreen.js';\nimport { getAppThemeMode, THEME_ANIMATED } from './themePreference.js';",
        'App imports theme',
    )
    s = replace_once(
        s,
        "  const [r1Visible, setR1Visible] = useState(false);",
        "  const [r1Visible, setR1Visible] = useState(false);\n  const [themeMode, setThemeMode] = useState('classic');",
        'App state theme',
    )
    old_init = """    try {\n      await Promise.all([getDb(), new Promise((resolve) => setTimeout(resolve, LOADING_ANIMATION_MS))]);\n      setDbReady(true);\n    } catch (err) { setDbError(err); }"""
    new_init = """    try {\n      await getDb();\n      const mode = await getAppThemeMode();\n      applyAppTheme(mode);\n      setThemeMode(mode);\n      const animationMs = mode === THEME_ANIMATED ? DOOM_ANIMATION_MS : LOADING_ANIMATION_MS;\n      await new Promise((resolve) => setTimeout(resolve, animationMs));\n      setDbReady(true);\n    } catch (err) { setDbError(err); }"""
    s = replace_once(s, old_init, new_init, 'App initialisation theme')
    s = replace_once(
        s,
        "  if (!dbReady) return <MetraLoadingScreen />;",
        "  if (!dbReady) return themeMode === THEME_ANIMATED ? <DoomLoadingScreen /> : <MetraLoadingScreen />;",
        'App loading theme',
    )
    s = replace_once(
        s,
        "      {current.name === 'Parametres' && <><SimpleHeader title=\"Paramètres\" onBack={goBack} /><ParametresScreen /></>}",
        "      {current.name === 'Parametres' && <><SimpleHeader title=\"Paramètres\" onBack={goBack} /><ParametresScreen themeMode={themeMode} onThemeChange={(mode) => { applyAppTheme(mode); setThemeMode(mode); }} /></>}",
        'App Parametres props',
    )
    p.write_text(s, encoding='utf-8')


def patch_params():
    p = Path('ParametresScreen.js')
    s = p.read_text(encoding='utf-8')
    s = replace_once(
        s,
        "import { diagnostiquerStockageLocal } from './storageHealth.js';",
        "import { diagnostiquerStockageLocal } from './storageHealth.js';\nimport { setAppThemeMode, THEME_ANIMATED, THEME_CLASSIC } from './themePreference.js';",
        'Parametres import theme',
    )
    s = replace_once(s, 'function ParametresScreen(){', 'function ParametresScreen({themeMode=THEME_CLASSIC,onThemeChange}){', 'Parametres props')
    s = replace_once(
        s,
        "      <TouchableOpacity style={[styles.paramTab,onglet==='donnees'&&styles.paramTabActive]} onPress={()=>setOnglet('donnees')}><Text style={[styles.paramTabText,onglet==='donnees'&&styles.paramTabTextActive]}>Données</Text></TouchableOpacity>",
        "      <TouchableOpacity style={[styles.paramTab,onglet==='donnees'&&styles.paramTabActive]} onPress={()=>setOnglet('donnees')}><Text style={[styles.paramTabText,onglet==='donnees'&&styles.paramTabTextActive]}>Données</Text></TouchableOpacity>\n      <TouchableOpacity style={[styles.paramTab,onglet==='theme'&&styles.paramTabActive]} onPress={()=>setOnglet('theme')}><Text style={[styles.paramTabText,onglet==='theme'&&styles.paramTabTextActive]}>Thème</Text></TouchableOpacity>",
        'Parametres tab theme',
    )
    s = replace_once(
        s,
        "    {onglet==='reserves'?<BibliothequeReserves/>:onglet==='equipements'?contenuEquipements:<GestionDonnees/>}",
        "    {onglet==='reserves'?<BibliothequeReserves/>:onglet==='equipements'?contenuEquipements:onglet==='donnees'?<GestionDonnees/>:<GestionTheme themeMode={themeMode} onThemeChange={onThemeChange}/>}",
        'Parametres render theme',
    )
    anchor = "\nfunction BoutonDonnees({label,onPress,disabled=false,secondaire=false,danger=false}){"
    if 'function GestionTheme(' not in s:
        if anchor not in s:
            raise SystemExit('Patch theme: insertion GestionTheme introuvable')
        block = r'''
function GestionTheme({themeMode,onThemeChange}){
  const[enCours,setEnCours]=useState(false);
  const choisir=async(mode)=>{
    if(enCours||mode===themeMode)return;
    setEnCours(true);
    try{
      const saved=await setAppThemeMode(mode);
      onThemeChange?.(saved);
    }catch(e){Alert.alert('Thème impossible',String(e.message||e));}
    finally{setEnCours(false);}
  };
  const Option=({mode,titre,description,accent})=>{
    const actif=themeMode===mode;
    return <TouchableOpacity
      disabled={enCours}
      activeOpacity={.75}
      onPress={()=>choisir(mode)}
      style={[styles.card,{alignItems:'center'},actif&&{borderColor:COLORS.orange,borderWidth:2}]}
    >
      <View style={{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:actif?COLORS.orange:COLORS.line,alignItems:'center',justifyContent:'center',marginRight:3}}>
        {actif?<View style={{width:10,height:10,borderRadius:5,backgroundColor:COLORS.orange}}/>:null}
      </View>
      <View style={{flex:1}}>
        <Text style={styles.cardTitle}>{titre}</Text>
        <Text style={[styles.cardSub,{marginTop:4}]}>{description}</Text>
      </View>
      <View style={{width:30,height:30,borderRadius:15,backgroundColor:accent,borderWidth:1,borderColor:COLORS.line}}/>
    </TouchableOpacity>;
  };
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.sectionLabel}>Thème de l'application</Text>
    <Text style={[styles.cardSub,{marginTop:6,marginBottom:14}]}>Le thème modifie uniquement l'interface de l'application. Les rapports PDF, Word et les exports Excel conservent leurs couleurs habituelles.</Text>
    <Option mode={THEME_CLASSIC} titre="Thème classique" description="Animation METRA classique et accents orange." accent="#F26426"/>
    <Option mode={THEME_ANIMATED} titre="Thème animé" description="Animation spéciale Doom et accents vert #106836. Ce mode sert d'aperçu tant que les périodes automatiques ne sont pas configurées." accent="#106836"/>
  </ScrollView>;
}
'''
        s = s.replace(anchor, block + anchor, 1)
    p.write_text(s, encoding='utf-8')


patch_styles()
patch_app()
patch_params()
print('Theme system patch applied')

from pathlib import Path

p = Path('ReportScreen.js')
s = p.read_text(encoding='utf-8')

# Keep the existing report generation flow intact. Only drive the default mode
# from the number of selected sites and lock grouped mode for a single site.
needle = " const selectedRows=useMemo(()=>visites.filter(v=>selected.has(v.id)),[visites,selected]);\n"
insert = " const selectedRows=useMemo(()=>visites.filter(v=>selected.has(v.id)),[visites,selected]);\n useEffect(()=>{if(selected.size===1)setMode('site');else if(selected.size>1)setMode('groupe')},[selected.size]);\n const groupeInterdit=selected.size<=1;\n"
if needle in s:
    s = s.replace(needle, insert, 1)
elif "const groupeInterdit=selected.size<=1;" not in s:
    raise SystemExit('selectedRows target not found')

old_buttons = "<TouchableOpacity style={[styles.btnSecondary,{flex:1},mode==='groupe'&&{borderColor:COLORS.primary,backgroundColor:'#FFF3E8'}]} onPress={()=>setMode('groupe')}><Text style={styles.btnSecondaryText}>Rapport groupé</Text></TouchableOpacity><TouchableOpacity style={[styles.btnSecondary,{flex:1},mode==='site'&&{borderColor:COLORS.primary,backgroundColor:'#FFF3E8'}]} onPress={()=>setMode('site')}><Text style={styles.btnSecondaryText}>Un rapport par site</Text></TouchableOpacity>"
new_buttons = "<TouchableOpacity disabled={groupeInterdit} style={[styles.btnSecondary,{flex:1},mode==='groupe'&&!groupeInterdit&&{borderColor:COLORS.primary,backgroundColor:'#FFF3E8'},groupeInterdit&&{opacity:.38,backgroundColor:'#ECEFF1',borderColor:'#D5D9DD'}]} onPress={()=>{if(!groupeInterdit)setMode('groupe')}}><Text style={[styles.btnSecondaryText,groupeInterdit&&{color:COLORS.muted}]}>Rapport groupé</Text></TouchableOpacity><TouchableOpacity style={[styles.btnSecondary,{flex:1},mode==='site'&&{borderColor:COLORS.primary,backgroundColor:'#FFF3E8'}]} onPress={()=>setMode('site')}><Text style={styles.btnSecondaryText}>Un rapport par site</Text></TouchableOpacity>"
if old_buttons in s:
    s = s.replace(old_buttons, new_buttons, 1)
elif "disabled={groupeInterdit}" not in s:
    raise SystemExit('report mode buttons target not found')

# Defensive guard: even if state somehow becomes stale, a one-site export can
# never enter grouped PDF generation.
old_generer = "const r=mode==='site'?await exporterRapportsParSite({datas,config,photosConfig:photos,format}):await exporterRapport({datas,config,photosConfig:photos,format});"
new_generer = "const modeEffectif=datas.length<=1?'site':mode;const r=modeEffectif==='site'?await exporterRapportsParSite({datas,config,photosConfig:photos,format}):await exporterRapport({datas,config,photosConfig:photos,format});"
if old_generer in s:
    s = s.replace(old_generer, new_generer, 1)
elif "const modeEffectif=datas.length<=1?'site':mode;" not in s:
    raise SystemExit('generation target not found')

old_alert = "if(!r?.annule)Alert.alert('Rapport généré',mode==='site'?`${r.resultats?.length||0} rapport(s) enregistré(s) dans le dossier choisi.`:`${r.nom||'Le rapport'} a été enregistré dans le dossier choisi.`)"
new_alert = "if(!r?.annule)Alert.alert('Rapport généré',modeEffectif==='site'?`${r.resultats?.length||0} rapport(s) enregistré(s) dans le dossier choisi.`:`${r.nom||'Le rapport'} a été enregistré dans le dossier choisi.`)"
if old_alert in s:
    s = s.replace(old_alert, new_alert, 1)
elif "modeEffectif==='site'?`${r.resultats" not in s:
    raise SystemExit('generation alert target not found')

p.write_text(s, encoding='utf-8')
print('Report mode defaults patched safely.')

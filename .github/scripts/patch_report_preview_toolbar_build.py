from pathlib import Path


p = Path('ReportLayoutEditor.js')
s = p.read_text(encoding='utf-8')

# Make the A4 preview use the tablet width better while keeping phone compatibility.
old_page = """      width: '100%', maxWidth: 360, aspectRatio: 210 / 297,
      backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line,
      borderRadius: 4, padding: 18, shadowColor: '#000', shadowOpacity: 0.06,
      shadowRadius: 8, elevation: 2, opacity: muted ? 0.42 : 1,
"""
new_page = """      width: '96%', maxWidth: 520, aspectRatio: 210 / 297,
      backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line,
      borderRadius: 6, padding: 20, shadowColor: '#000', shadowOpacity: 0.08,
      shadowRadius: 10, elevation: 3, opacity: muted ? 0.42 : 1,
"""
if new_page not in s:
    if old_page not in s:
        raise SystemExit('preview page size marker not found')
    s = s.replace(old_page, new_page, 1)

# Keep the preview section order aligned with the generated report: reserves, equipment, photos.
old_order = """    if (config.remarques && (data.remarques || []).length) out.push({ id: `reserves-${data.visite.id}`, type: 'reserves', data });
    const sitePhotos = config.photos === false ? [] : (photos || []).filter((p) => p.visiteId === data.visite.id && p.include).sort((a, b) => a.ordre - b.ordre);
    grouperPhotosPages(sitePhotos).forEach((page, index) => out.push({ id: `photos-${data.visite.id}-${index}`, type: 'photos', data, photos: page, pageIndex: index }));
    if (config.materiel && (data.materiel || []).length) out.push({ id: `materiel-${data.visite.id}`, type: 'materiel', data });
"""
new_order = """    if (config.remarques && (data.remarques || []).length) out.push({ id: `reserves-${data.visite.id}`, type: 'reserves', data });
    if (config.materiel && (data.materiel || []).length) out.push({ id: `materiel-${data.visite.id}`, type: 'materiel', data });
    const sitePhotos = config.photos === false ? [] : (photos || []).filter((p) => p.visiteId === data.visite.id && p.include).sort((a, b) => a.ordre - b.ordre);
    grouperPhotosPages(sitePhotos).forEach((page, index) => out.push({ id: `photos-${data.visite.id}-${index}`, type: 'photos', data, photos: page, pageIndex: index }));
"""
if new_order not in s:
    if old_order not in s:
        raise SystemExit('preview section order marker not found')
    s = s.replace(old_order, new_order, 1)

old_return = "  return <FlatList\n"
new_return = """  return <View style={{ flex: 1 }}>
    <View style={{
      backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.line,
      paddingHorizontal: 14, paddingVertical: 9, elevation: 7, shadowColor: '#000',
      shadowOpacity: 0.08, shadowRadius: 7, zIndex: 30,
    }}>
      <View style={{ width: '100%', maxWidth: 980, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          style={[styles.btnSecondary, { minWidth: 70, paddingHorizontal: 12 }, format === 'pdf' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]}
          onPress={() => onFormatChange('pdf')}
        ><Text style={styles.btnSecondaryText}>PDF</Text></TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSecondary, { minWidth: 78, paddingHorizontal: 12 }, format === 'word' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]}
          onPress={() => onFormatChange('word')}
        ><Text style={styles.btnSecondaryText}>Word</Text></TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '800', color: COLORS.ink }}>
            {datas.length} site(s) · {selectedPhotos} photo(s) · {totalReserves} réserve(s)
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 10, color: COLORS.inkSoft, marginTop: 1 }}>
            Prévisualisation A4 — les modifications sont prises en compte à la génération
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.btnPrimary, { minWidth: 205, paddingHorizontal: 18, opacity: busy ? 0.55 : 1 }]}
          disabled={busy}
          onPress={onGenerate}
        ><Text style={styles.btnPrimaryText}>{busy ? 'Génération…' : `Générer ${format === 'pdf' ? 'le PDF' : 'le Word'}`}</Text></TouchableOpacity>
      </View>
    </View>
    <FlatList
"""
if new_return not in s:
    if old_return not in s:
        raise SystemExit('preview FlatList return marker not found')
    s = s.replace(old_return, new_return, 1)

s = s.replace("contentContainerStyle={[styles.content, { paddingBottom: 38 }]}", "contentContainerStyle={[styles.content, { paddingBottom: 24, paddingTop: 14 }]}", 1)
s = s.replace("<Text style={styles.sectionTitle}>Aperçu PDF dynamique</Text>", "<Text style={styles.sectionTitle}>Prévisualisation du rapport</Text>", 1)
s = s.replace(
    "<Text style={styles.importHint}>L’aperçu est volontairement léger : il simule le rendu A4 sans régénérer le PDF à chaque changement. Le PDF final est calculé uniquement à la fin.</Text>",
    "<Text style={styles.importHint}>Aperçu A4 optimisé pour la tablette. Il reste léger pour permettre les modifications instantanées ; le document final est calculé au moment de la génération.</Text>",
    1,
)

old_footer = """    ListFooterComponent={<View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }, format === 'pdf' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]} onPress={() => onFormatChange('pdf')}><Text style={styles.btnSecondaryText}>PDF</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }, format === 'word' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]} onPress={() => onFormatChange('word')}><Text style={styles.btnSecondaryText}>Word</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.btnPrimary, { opacity: busy ? 0.55 : 1 }]} disabled={busy} onPress={onGenerate}><Text style={styles.btnPrimaryText}>{busy ? 'Génération…' : `Générer ${format === 'pdf' ? 'le PDF' : 'le Word'}`}</Text></TouchableOpacity>
    </View>}
  />;
}"""
new_footer = """    ListFooterComponent={<View style={{ height: 18 }} />}
  />
  </View>;
}"""
if new_footer not in s:
    if old_footer not in s:
        raise SystemExit('preview footer marker not found')
    s = s.replace(old_footer, new_footer, 1)

p.write_text(s, encoding='utf-8')
print('Responsive report preview and persistent top generation toolbar installed.')

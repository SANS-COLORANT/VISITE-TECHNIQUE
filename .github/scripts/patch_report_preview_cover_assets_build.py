from pathlib import Path


p = Path('ReportLayoutEditor.js')
s = p.read_text(encoding='utf-8')

old_assets = "const DEFAULT_COVER = require('./assets/report/cover-building.png');\n"
new_assets = """const DEFAULT_COVER = require('./assets/report/cover-building.png');
const PREVIEW_LOGO = require('./assets/report/brand-logo.png');
const PREVIEW_CERT = require('./assets/report/Image21.png');
const PREVIEW_SPIRALS = [
  require('./assets/report/spiral-red-orange.jpg'),
  require('./assets/report/spiral-yellow-green.jpg'),
  require('./assets/report/spiral-green-red.jpg'),
  require('./assets/report/spiral-multicolor-alt.jpg'),
];
"""
if new_assets not in s:
    if old_assets not in s:
        raise SystemExit('preview cover asset marker not found')
    s = s.replace(old_assets, new_assets, 1)

old_cover = """function CoverPage({ config }) {
  const cover = config.coverUri || null;
  return <Page>
    <Text style={{ fontWeight: '900', fontSize: 17, color: COLORS.orange }}>ÉNERGIE & SERVICE</Text>
    <Text style={{ alignSelf: 'flex-end', marginTop: 12, fontSize: 8 }}>VERSAILLES, le {config.dateRapport || ''}</Text>
    <Text style={{ marginTop: 16, fontWeight: '700', fontSize: 8 }}>Nos réf. : {config.chrono || ''}</Text>
    <View style={{ marginTop: 16, backgroundColor: COLORS.orange, padding: 10, borderRadius: 18 }}><Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '900' }}>{config.clientLabel || 'Rapport de visite'}</Text></View>
    <Image source={cover ? { uri: cover } : DEFAULT_COVER} style={{ width: '100%', height: 145, marginTop: 12, backgroundColor: '#eee' }} resizeMode=\"cover\" />
    <Text style={{ marginTop: 18, textAlign: 'center', fontWeight: '900', fontSize: 14 }}>{config.objet || 'Compte rendu de visite technique'}</Text>
    <View style={{ flex: 1 }} />
    <View style={{ height: 13, backgroundColor: COLORS.orange, marginHorizontal: -18, marginBottom: -18 }} />
  </Page>;
}
"""
new_cover = r'''function CoverPage({ config }) {
  const cover = config.coverUri || null;
  const businesses = ['COPROPRIÉTÉS', 'BAILLEURS SOCIAUX', 'COLLECTIVITÉS', 'TERTIAIRE'];
  return <Page>
    <Image source={PREVIEW_LOGO} style={{ width: '57%', height: 42, alignSelf: 'flex-start' }} resizeMode="contain" />
    <Text style={{ alignSelf: 'flex-end', marginTop: 4, fontSize: 7.5 }}>VERSAILLES, le {config.dateRapport || ''}</Text>
    <Text style={{ marginTop: 7, marginLeft: 18, fontWeight: '700', textDecorationLine: 'underline', fontSize: 7.5 }}>Nos réf. : {config.chrono || ''}</Text>

    <View style={{ marginTop: 9, marginHorizontal: 24, backgroundColor: COLORS.orange, paddingVertical: 7, paddingHorizontal: 10 }}>
      <Text style={{ color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: '900' }}>{config.clientLabel || 'Rapport de visite'}</Text>
    </View>

    <Image
      source={cover ? { uri: cover } : DEFAULT_COVER}
      style={{ width: '88%', height: 170, marginTop: 10, alignSelf: 'center', backgroundColor: '#F7F7F7' }}
      resizeMode="contain"
    />

    <Text style={{ marginTop: 8, textAlign: 'center', fontWeight: '900', fontSize: 12 }}>{config.objet || 'Compte rendu de visite technique'}</Text>

    <View style={{ flexDirection: 'row', marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
      {businesses.map((label, index) => <View key={label} style={{ width: '24%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Image source={PREVIEW_SPIRALS[index]} style={{ width: 12, height: 12 }} resizeMode="contain" />
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 5.4, fontWeight: '900', color: '#555', maxWidth: '78%' }}>{label}</Text>
      </View>)}
    </View>

    <View style={{ flex: 1 }} />
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ textAlign: 'center', color: '#666', fontSize: 5.5, fontWeight: '700', marginBottom: 4 }}>
      PARIS   NANTES   TOURS   RENNES   BORDEAUX   LYON   CHERBOURG   NÎMES
    </Text>
    <View style={{ flexDirection: 'row', marginHorizontal: -20, minHeight: 23 }}>
      <View style={{ flex: 1, backgroundColor: COLORS.orange, justifyContent: 'center', paddingHorizontal: 6 }}>
        <Text numberOfLines={2} adjustsFontSizeToFit style={{ color: '#fff', textAlign: 'center', fontSize: 5.3, fontWeight: '700' }}>
          Tél. 01 39 55 17 20 · 143 rue Yves Le Coz · 78000 VERSAILLES · contact.versailles@energieetservice.fr
        </Text>
      </View>
      <View style={{ width: '25%', backgroundColor: '#595959', justifyContent: 'center', paddingHorizontal: 4 }}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: '#fff', textAlign: 'center', fontSize: 7, fontWeight: '900' }}>energieetservice.fr</Text>
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
      <Image source={PREVIEW_CERT} style={{ width: 46, height: 20 }} resizeMode="contain" />
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 4.8, color: '#666' }}>
        SAS au capital de 292 500 € - Siège social : 143 rue Yves Le Coz - 78000 Versailles - RCS Versailles B 338 335 201 / NAF 7112B
      </Text>
    </View>
  </Page>;
}
'''
if new_cover not in s:
    if old_cover not in s:
        raise SystemExit('preview CoverPage marker not found')
    s = s.replace(old_cover, new_cover, 1)

p.write_text(s, encoding='utf-8')
print('Report preview now renders the real METRA cover assets.')

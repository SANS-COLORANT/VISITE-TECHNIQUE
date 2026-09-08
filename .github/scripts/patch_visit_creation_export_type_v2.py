from pathlib import Path


# Compatibility shim for the historical build patch. The production sources now
# know about Symfony LOCAL -> METRA installation scoping; this pass preserves
# that richer flow instead of forcing the older site-wide source markers.
site_path = Path('SiteVisitesScreen.js')
site = site_path.read_text(encoding='utf-8')

site = site.replace(
    "import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, Linking, ScrollView } from 'react-native';",
    "import { View, Text, FlatList, TouchableOpacity, Modal, Pressable, TextInput, Alert, Linking, ScrollView } from 'react-native';",
    1,
)
site = site.replace("import { listerVisitesSite, getDb } from './db.js';", "import { listerVisitesSite } from './db.js';", 1)
site = site.replace("import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';\n", '', 1)
site = site.replace(
    "      const db = await getDb();\n      await preremplirVisiteDepuisContexte(db, visiteId);\n",
    '',
    1,
)

# VisiteScreen performs the stable-field prefill once, after the visit can
# already be rendered. Keep creationEnCours only once and place the export
# states exactly where the existing typed-export patch expects them.
creation_state = "  const [creationEnCours, setCreationEnCours] = useState(false);\n"
site = site.replace(creation_state, '', 1)
export_marker = "  const [exportLotEnCours, setExportLotEnCours] = useState(false);\n"
export_states = (
    "  const [choixTrameExportVisible, setChoixTrameExportVisible] = useState(false);\n"
    "  const [trameExportId, setTrameExportId] = useState(null);\n"
    "  const [creationEnCours, setCreationEnCours] = useState(false);\n"
)
if export_states not in site:
    if export_marker not in site:
        raise SystemExit('API-aware site export state marker not found')
    site = site.replace(export_marker, export_marker + export_states, 1)

if 'apiRemoteLocalId' not in site or 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId })' not in site:
    raise SystemExit('API LOCAL visit creation flow missing before build compatibility patch')
if 'preremplirVisiteDepuisContexte' in site or 'getDb } from' in site:
    raise SystemExit('Site visit screen still contains blocking direct prefill')
site_path.write_text(site, encoding='utf-8')


# The new report UX deliberately opens ReportScreen without touching Android
# storage. The historical typed-export patch still expects the former async
# function while applying its client visit-type selector. Recreate that source
# shape only for the duration of the compatibility patch; after the legacy pass
# we move the storage request back to the Excel-only branch.
client_path = Path('ClientDocumentsScreen.js')
client = client_path.read_text(encoding='utf-8')
direct_report_open = """  const ouvrirRapports = () => {
    navigation.navigate('Report', { clientId });
  };
"""
legacy_report_open = """  const ouvrirRapports = async () => {
    const uri = await garantirStockageClient();
    if (!uri) return;
    navigation.navigate('Report', { clientId });
  };
"""
if direct_report_open in client:
    client = client.replace(direct_report_open, legacy_report_open, 1)
client_path.write_text(client, encoding='utf-8')


# Reuse all of the already validated typed-export/report logic from the original
# patch, but make its two old exact-source guards understand the new API-aware
# source. Other missing markers remain hard failures.
legacy_path = Path('.github/scripts/patch_visit_creation_export_type.py')
legacy = legacy_path.read_text(encoding='utf-8')
old_helper = """    if old not in text:
        raise SystemExit(f'{label}: marker not found')
"""
new_helper = """    if old not in text:
        if label == 'skip unused PRE equipment query' and 'contexte.installation_id' in text and "if (trame.id !== 'pre_allumage')" in text:
            return text
        if label == 'navigate immediately after visit creation' and 'apiRemoteLocalId' in text and 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId })' in text and 'preremplirVisiteDepuisContexte' not in text:
            return text
        raise SystemExit(f'{label}: marker not found')
"""
if old_helper not in legacy:
    raise SystemExit('Legacy build patch helper marker not found')
legacy = legacy.replace(old_helper, new_helper, 1)
exec(compile(legacy, str(legacy_path), 'exec'), {'__name__': '__main__', '__file__': str(legacy_path)})

# For reports, choosing the visit type must not create any folder. Storage is
# requested only for Excel here; PDF/Word storage is deferred until ReportScreen
# has an explicit site selection and the user presses Generate.
client = client_path.read_text(encoding='utf-8')
legacy_launch = """    const uri = await garantirStockageClient();
    if (!uri) return;
    if (action === 'rapport') {
      navigation.navigate('Report', { clientId, trameId });
      return;
    }
    if (action !== 'excel') return;
    setBusy(true);
"""
deferred_launch = """    if (action === 'rapport') {
      navigation.navigate('Report', { clientId, trameId });
      return;
    }
    if (action !== 'excel') return;
    const uri = await garantirStockageClient();
    if (!uri) return;
    setBusy(true);
"""
if legacy_launch in client:
    client = client.replace(legacy_launch, deferred_launch, 1)
elif deferred_launch not in client:
    raise SystemExit('Client report storage deferral marker not found after typed export patch')
client_path.write_text(client, encoding='utf-8')

# Final invariants: the build must not regress from LOCAL scope back to the
# first installation/site-wide behavior.
visit_prefill = Path('visitPrefillDb.js').read_text(encoding='utf-8')
site_final = site_path.read_text(encoding='utf-8')
client_final = client_path.read_text(encoding='utf-8')
if 'contexte.installation_id' not in visit_prefill:
    raise SystemExit('LOCAL-scoped prefill lost during build patch')
if "AND (? IS NULL OR installation_id=?)" not in visit_prefill:
    raise SystemExit('Previous stable fields are no longer scoped to the same LOCAL')
if 'apiRemoteLocalId' not in site_final or 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId })' not in site_final:
    raise SystemExit('API LOCAL context lost during SiteVisites build patch')
if 'preremplirVisiteDepuisContexte' in site_final:
    raise SystemExit('Direct blocking prefill reintroduced in SiteVisites')
if deferred_launch not in client_final:
    raise SystemExit('Report storage is no longer deferred until report generation')

print('Visit creation/export patch applied with Symfony LOCAL scoping preserved and report storage deferred.')

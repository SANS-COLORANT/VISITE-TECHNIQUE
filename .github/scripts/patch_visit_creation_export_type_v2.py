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
# getDb reste nécessaire pour déterminer localement si le client courant est
# déjà matérialisé depuis l'Intranet. Une ancienne version de ce patch retirait
# cet import tout en laissant son appel dans charger(), ce qui provoquait
# « Property 'getDb' doesn't exist » dans l'APK livré.
site = site.replace("import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';\n", '', 1)
site = site.replace(
    "      const db = await getDb();\n      await preremplirVisiteDepuisContexte(db, visiteId);\n",
    '',
    1,
)

# creerVisiteProduction prépare désormais les informations métier avant de
# retourner l'identifiant. SiteVisites ne doit donc pas refaire ce préremplissage.
# Keep creationEnCours only once and place the export states exactly where the
# existing typed-export patch expects them.
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

creation_call_legacy = 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId })'
creation_call_local = 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId, installationId })'
if 'apiRemoteLocalId' not in site or (creation_call_legacy not in site and creation_call_local not in site):
    raise SystemExit('API LOCAL visit creation flow missing before build compatibility patch')
if 'preremplirVisiteDepuisContexte' in site:
    raise SystemExit('Site visit screen still contains blocking direct prefill')
if ("import { listerVisitesSite, getDb } from './db.js';" not in site
        and "import { listerVisitesSite, listerVisitesLocal, getDb } from './db.js';" not in site
        and "import { listerVisitesSite, listerVisitesLocal, getDb, getVisite } from './db.js';" not in site):
    raise SystemExit('SiteVisites must keep getDb/local visit repository for imported-client state')
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
# patch, but make its obsolete source guards understand the current API-aware
# runtime. Missing markers which are not explicitly superseded remain hard
# failures.
legacy_path = Path('.github/scripts/patch_visit_creation_export_type.py')
legacy = legacy_path.read_text(encoding='utf-8')
# ReportScreen peut désormais exposer aussi l'export par local. Le patch
# historique doit conserver ce troisième exporteur au lieu d'attendre
# strictement l'ancienne ligne d'import site/groupe.
legacy = legacy.replace(
    'import_marker = "import{exporterRapportEdite,exporterRapportsParSiteEdites}from\'./reportEditorExporter.js\';\\n"',
    'import_marker = "import{exporterRapportEdite,exporterRapportsParSiteEdites,exporterRapportsParLocalEdites}from\'./reportEditorExporter.js\';\\n" if "exporterRapportsParLocalEdites" in s else "import{exporterRapportEdite,exporterRapportsParSiteEdites}from\'./reportEditorExporter.js\';\\n"',
    1,
)
# Le rapport courant retient la dernière visite par local (et non plus une
# seule visite par site). Adapter les marqueurs du patch typé sans revenir
# à l'ancien périmètre.
legacy = legacy.replace('garderDerniereVisiteParSite', 'garderDerniereVisiteParPerimetre')
old_helper = """    if old not in text:
        raise SystemExit(f'{label}: marker not found')
"""
new_helper = """    if old not in text:
        if label == 'non-blocking visit storage' and 'void Promise.allSettled([' in text and 'pinPhotoReferencesForVisit(id)' in text and 'dossierVisiteMetra(id)' in text:
            return text
        if label == 'skip unused PRE equipment query' and 'contexte.installation_id' in text and "if (trame.id !== 'pre_allumage')" in text:
            return text
        if label == 'navigate immediately after visit creation' and 'apiRemoteLocalId' in text and ('creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId })' in text or 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId, installationId })' in text) and 'preremplirVisiteDepuisContexte' not in text:
            return text
        if label == 'site Pressable import' and "InteractionManager } from 'react-native';" in text:
            return text
        raise SystemExit(f'{label}: marker not found')
"""
if old_helper not in legacy:
    raise SystemExit('Legacy build patch helper marker not found')
legacy = legacy.replace(old_helper, new_helper, 1)

# The legacy patch used to deliberately remove getDb from SiteVisites. That is
# no longer valid: charger() uses getDb to resolve the imported-client binding
# and IntranetVisitSyncControl calls charger() after an Offline upload. Removing
# it is the exact cause of the tablet runtime error.
legacy_getdb_call = """s = replace_once(s, \"import { listerVisitesSite, getDb } from './db.js';\", \"import { listerVisitesSite } from './db.js';\", 'site lightweight db import')
"""
if legacy_getdb_call in legacy:
    legacy = legacy.replace(legacy_getdb_call, "# getDb intentionally retained by API-aware v2 compatibility shim\n", 1)
else:
    raise SystemExit('Legacy getDb removal marker not found')

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
creation_final = Path('visitCreationDb.js').read_text(encoding='utf-8')
if 'contexte.installation_id' not in visit_prefill:
    raise SystemExit('LOCAL-scoped prefill lost during build patch')
if "AND (? IS NULL OR installation_id=?)" not in visit_prefill:
    raise SystemExit('Previous stable fields are no longer scoped to the same LOCAL')
if 'apiRemoteLocalId' not in site_final or (creation_call_legacy not in site_final and creation_call_local not in site_final):
    raise SystemExit('API LOCAL context lost during SiteVisites build patch')
if 'preremplirVisiteDepuisContexte' in site_final:
    raise SystemExit('Direct blocking prefill reintroduced in SiteVisites')
if ("import { listerVisitesSite, getDb } from './db.js';" not in site_final
        and "import { listerVisitesSite, listerVisitesLocal, getDb } from './db.js';" not in site_final
        and "import { listerVisitesSite, listerVisitesLocal, getDb, getVisite } from './db.js';" not in site_final):
    raise SystemExit('SiteVisites lost getDb/local visit repository while imported-client status still needs it')
if 'void Promise.allSettled([' not in creation_final or 'pinPhotoReferencesForVisit(id)' not in creation_final:
    raise SystemExit('Visit creation lost its non-blocking photo/storage preparation')
if deferred_launch not in client_final:
    raise SystemExit('Report storage is no longer deferred until report generation')

print('Visit creation/export patch applied with Symfony LOCAL scoping, prepared visits, non-blocking storage and getDb retained.')

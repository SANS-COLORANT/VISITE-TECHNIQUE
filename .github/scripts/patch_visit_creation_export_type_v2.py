from pathlib import Path


# The committed runtime is now the source of truth. This compatibility pass no
# longer rewrites SiteVisites/visitPrefill at build time: it validates the
# low-latency, API-aware implementation that is already committed instead.
site = Path('SiteVisitesScreen.js').read_text(encoding='utf-8')
creation = Path('visitCreationDb.js').read_text(encoding='utf-8')
prefill = Path('visitPrefillDb.js').read_text(encoding='utf-8')
carry = Path('visitCarryForwardDb.js').read_text(encoding='utf-8')
client = Path('ClientDocumentsScreen.js').read_text(encoding='utf-8')


def require(marker, text, message):
    if marker not in text:
        raise SystemExit(message)


# Creation stays bound to the exact imported Symfony LOCAL/client context.
require('apiRemoteLocalId', site, 'API LOCAL visit creation context missing')
require(
    'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId })',
    site,
    'API LOCAL visit creation flow missing',
)

# The visit is fully prefilled before navigation so values never appear
# progressively after the form becomes visible. The prefill itself is batched,
# coalesced and durable, which avoids the old field-by-field latency.
require('await preremplirVisiteDepuisContexte(db, visiteId);', site, 'Prefill-before-navigation contract missing')
require('navigation.navigate(\'Visite\', { visiteId });', site, 'Visit navigation missing')
if site.index('await preremplirVisiteDepuisContexte(db, visiteId);') > site.index("navigation.navigate('Visite', { visiteId });"):
    raise SystemExit('Visit navigation happens before its initial values are ready')
require('const prefillEnCours = new Map();', prefill, 'Coalesced visit prefill missing')
require('async function insertManyIfEmpty', prefill, 'Batched fixed-field prefill missing')
require('PREFILL_MARKER_VERSION', prefill, 'Durable visit prefill marker missing')
require("INSERT INTO _meta(key,value) VALUES(?, 'done')", prefill, 'Durable prefill completion write missing')

# Carry-forward remains scoped to the same local/installation and uses grouped
# SQLite operations for the classical ICPE/VMC paths.
require('async function inferUniqueInstallation', carry, 'LOCAL inference guard missing')
require('AND (? IS NULL OR installation_id=?)', carry, 'Previous visit is no longer scoped to the same LOCAL')
require('INSERT INTO champs_visite(visite_id,section_code,cle,valeur)', carry, 'Batched field carry-forward missing')
require('INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)', carry, 'Batched control carry-forward missing')

# Non-form work is deliberately outside the critical path.
require('void pinPhotoReferencesForVisit(id)', creation, 'Photo reference preparation is no longer deferred')
require("void (async () => {", creation, 'Documents/METRA preparation is no longer deferred')

# Site/client export dependencies remain lazy. Opening a site or the report
# selector must not evaluate XLSX or ask Android storage permission.
require("function chargerBatchExcel(){return require('./batchExcel.js');}", site, 'Site XLSX loader is no longer lazy')
require("function chargerExportClient(){return require('./clientBatchExport.js');}", client, 'Client XLSX loader is no longer lazy')
require("const ouvrirRapports = () => navigation.navigate('Report', { clientId });", client, 'Opening reports touches storage before navigation')

print('Modern visit creation/export contract validated: LOCAL-safe, prefilled before paint, batched/coalesced and storage/XLSX deferred.')

const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function need(text, value, label) { if (!text.includes(value)) throw new Error(`${label}: missing ${value}`); }
function forbid(text, value, label) { if (text.includes(value)) throw new Error(`${label}: forbidden ${value}`); }

const binding = read('intranetVisitBindingDb.js');
need(binding, 'local_client_id=?', 'visit is locked to the imported local client relation');
need(binding, 'bindVisitToImportedClientTarget', 'automatic same-client destination binding');
need(binding, 'Ce client METRA n’a pas été importé depuis l’Intranet', 'non-imported client rejection');
need(binding, 'La visite ne peut être envoyée que vers le client Intranet ayant été importé', 'cross-client rejection');
need(binding, 'COALESCE(s.local_site_id,cs.local_site_id)=?', 'same imported site relation');
need(binding, 'Plusieurs locaux Intranet compatibles existent', 'ambiguous local protection');
need(binding, "policy: 'same_imported_client'", 'frozen same-client provenance');
need(binding, "sourceType: 'upload_binding'", 'send-time frozen reference');
need(binding, 'validApiId', 'remote identity validation');
need(binding, 'countReferenceCriteria', 'frozen criteria validation');
need(binding, 'seen.has(key)', 'duplicate remote branch rejection');
need(binding, 'Aucune trame Intranet exploitable n’est configurée pour ce local.', 'missing trame diagnosis');
need(binding, 'resolveFirstVisitRemoteTrame', 'first-visit trame resolver');
need(binding, "cle='Trame utilisée'", 'first-visit reads Trame utilisée from visit Informations');
need(binding, "matchedBy: 'visit_field'", 'first-visit prioritizes exact visit trame name');
need(binding, 'intranet_first_visit_trame_name_ambiguous', 'duplicate exact trame name guard');
need(binding, 'intranet_first_visit_trame_name_missing', 'missing exact trame name guard');
need(binding, 'intranet_first_visit_trame_ambiguous', 'first-visit trame ambiguity guard');
need(binding, 'intranet_first_visit_trame_missing', 'first-visit missing trame guard');

const sync = read('IntranetVisitSync.js');
need(sync, "const OFFLINE = '#111111'", 'black Offline state');
need(sync, "const ONLINE = '#16794B'", 'green Online state');
need(sync, "online ? 'Online' : 'Offline'", 'single Online/Offline status button');
need(sync, 'bindVisitToImportedClientTarget', 'one-click same-client binding');
need(sync, 'syncClientPreparation(error.remoteClientId)', 'automatic refresh of the same imported client');
need(sync, 'hydrateFirstVisitReference', 'first-visit reference hydration');
need(sync, 'options?.visitTrameName', 'first-visit uses visit Informations trame name');
need(sync, 'syncStructureReferential(remoteClientId)', 'first-visit structure referential refresh');
need(sync, 'syncClientPreparation(remoteClientId, resolved.remoteTrameId)', 'first-visit filtered trame preparation');
need(sync, 'Appuie sur Offline pour l’envoyer au client importé', 'direct-send UX');
need(sync, 'Export Intranet confirmé', 'success status feedback');
need(sync, 'serverFeedback', 'server error feedback');
need(sync, 'discardTerminalVisitUpload', 'safe terminal retry preparation');
need(sync, 'assertQueuedClientStillMatchesImportedClient', 'legacy queued upload client guard');
need(sync, 'queued_client_mismatch', 'old cross-client queued payload protection');
forbid(sync, 'IntranetVisitDestinationPicker', 'arbitrary destination picker removed from visit send flow');
forbid(sync, 'Choisir la destination Intranet', 'no arbitrary client chooser');
forbid(sync, 'Modifier la destination Intranet', 'no cross-client destination edit');

const siteVisits = read('SiteVisitesScreen.js');
need(siteVisits, 'intranetClientImported', 'site knows whether its client was imported from Intranet');
need(siteVisits, '<IntranetVisitSyncControl visite={item} onVisitChanged={charger} compact />', 'visit cards expose direct Offline Online action');
need(siteVisits, 'local_client_id=?', 'visit-card status is based on durable imported-client relation');

const payload = read('intranetVisitPayload.js');
const cache = read('symfonyApiCacheDb.js');
const api = read('symfonyApi.js');
need(payload, "sourceType === 'upload_binding'", 'send-time frozen context');
need(payload, 'preparedContext', 'explicit binding precedence over old preparation');

need(cache, 'cachePreparation(remoteClientId, payload, { partial = false } = {})', 'partial preparation cache mode');
need(cache, 'if (!partial)', 'partial preparation does not invalidate full cache');
need(api, 'cachePreparation(remoteClientId, payload, { partial: trameId != null })', 'filtered trame preparation marked partial');

console.log('Imported-client Intranet contract validated: a METRA visit can only return to its imported client/site/local, including a first visit with no prior Intranet history when the remote trame is uniquely resolvable, while preserving cached unrelated sites/locals and refusing ambiguous trame guesses.');
